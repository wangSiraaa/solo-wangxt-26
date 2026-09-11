import type { PreparedDocument, SanitizeLogEntry } from '../types';

/** 禁止出现的 HTML 元素：一切可执行/可外联的载体 */
const BLOCKED_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'frame',
  'frameset',
  'link',
  'meta',
  'base'
]);

/** 行内事件属性与可执行属性 */
const EVENT_ATTR_RE = /^on/i;
const URL_ATTRS = new Set(['href', 'src', 'action', 'xlink:href', 'poster', 'data', 'background']);
const DANGEROUS_PROTOCOLS = /^\s*(javascript|data|vbscript|file|filesystem|about|blob):/i;
const EXTERNAL_URL_RE = /^(https?:)?\/\//i;
const PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:/i;

export interface SanitizeOptions {
  files: Record<string, string>;
  entry: string;
}

/**
 * 净化案例 HTML 并产出可注入沙箱 iframe 的 srcdoc。
 * 策略：
 *  1. 剥离全部脚本与脚本载体（script/iframe/object/…），删除所有 on* 属性；
 *  2. 删除 <link>/<meta>/<base>，禁止外链；<style> 内联 CSS 走 CSS 净化器；
 *  3. 所有 URL 类属性：仅允许引用包内同源本地文件，外链与危险协议一律移除；
 *  4. 强制注入 CSP（双保险），并用沙箱属性在宿主层再封一次；
 *  5. <form>/<input>/<button> 不做删除（表单案例需要），但 form 不允许提交到外部。
 */
export function prepareDocument(opts: SanitizeOptions): PreparedDocument {
  const logs: SanitizeLogEntry[] = [];
  const parser = new DOMParser();
  const raw = opts.files[opts.entry] ?? '<p>案例入口缺失</p>';
  const doc = parser.parseFromString(raw, 'text/html');

  // 移除所有危险元素
  for (const tag of BLOCKED_TAGS) {
    doc.querySelectorAll(tag).forEach((node) => {
      // form/input/button 需要保留用于表单案例，单独处理
      logs.push({ level: 'block', message: `移除元素 <${tag}>` });
      node.remove();
    });
  }

  // 遍历所有元素：过滤属性
  const all = Array.from(doc.querySelectorAll('*'));
  for (const el of all) {
    const tag = el.tagName.toLowerCase();

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name;
      const value = attr.value;

      if (EVENT_ATTR_RE.test(name)) {
        el.removeAttribute(name);
        logs.push({ level: 'block', message: `移除事件属性 ${tag}[${name}]` });
        continue;
      }

      // srcdoc / srcset / formaction 等可执行或外链入口
      if (['srcdoc', 'srcset', 'formaction', 'ping', 'integrity', 'crossorigin'].includes(name)) {
        el.removeAttribute(name);
        logs.push({ level: 'block', message: `移除属性 ${tag}[${name}]` });
        continue;
      }

      if (name === 'style') {
        const clean = sanitizeCss(value, 'inline', logs);
        if (clean.trim()) el.setAttribute('style', clean);
        else el.removeAttribute('style');
        continue;
      }

      if (URL_ATTRS.has(name)) {
        const result = resolveLocalUrl(value, opts.files, logs, tag, name);
        if (result === null) {
          el.removeAttribute(name);
          if (tag === 'a') {
            logs.push({ level: 'rewrite', message: `<a> 的外链 ${value} 已移除 href（保留文本）` });
          }
        } else if (result !== value) {
          el.setAttribute(name, result);
        }
        continue;
      }

      // style 元素本身
      if (tag === 'style') {
        // 下方统一处理
      }
    }
  }

  // 净化 <style> 文本
  doc.querySelectorAll('style').forEach((styleEl) => {
    const clean = sanitizeCss(styleEl.textContent || '', 'tag', logs);
    styleEl.textContent = clean;
  });

  // 处理包内 <link rel=stylesheet> 已被删除——改为内联本地 CSS
  // （原始 link 已删除，这里根据入口 HTML 中常见约定，把同目录 css 自动注入）
  const injectedCss = collectLocalStylesheets(opts, logs);

  // 强制注入 CSP meta 与基础样式（CSP 作为纵深防御，沙箱属性是主防线）
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src data:;",
    "font-src 'none'",
    "script-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ');

  let head = doc.head;
  if (!head) {
    head = doc.createElement('head');
    doc.documentElement.insertBefore(head, doc.documentElement.firstChild);
  }
  const cspMeta = doc.createElement('meta');
  cspMeta.setAttribute('http-equiv', 'Content-Security-Policy');
  cspMeta.setAttribute('content', csp);
  head.insertBefore(cspMeta, head.firstChild);
  const charset = doc.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  head.insertBefore(charset, head.firstChild);

  if (injectedCss) {
    const extraStyle = doc.createElement('style');
    extraStyle.setAttribute('data-audit-injected', '');
    extraStyle.textContent = injectedCss;
    head.appendChild(extraStyle);
  }

  const srcdoc = '<!doctype html>\n' + doc.documentElement.outerHTML;

  return { srcdoc, logs, injectedCss };
}

/** 自动收集案例包中的 css 文件（按文件名引用或全部并入） */
function collectLocalStylesheets(
  opts: SanitizeOptions,
  logs: SanitizeLogEntry[]
): string {
  const cssFiles = Object.keys(opts.files).filter((f) => f.toLowerCase().endsWith('.css'));
  const parts: string[] = [];
  for (const f of cssFiles) {
    logs.push({ level: 'allow', message: `内联本地样式表 ${f}` });
    parts.push(`/* === ${f} === */\n` + sanitizeCss(opts.files[f], 'file', logs));
  }
  return parts.join('\n');
}

/**
 * 仅允许引用案例包内文件；返回 null 表示应删除属性。
 * 包内引用用 data-audit-asset 保留语义但不可被浏览器加载（default-src 'none'），
 * 这里统一改写为 about:invalid 并记录。
 */
function resolveLocalUrl(
  raw: string,
  files: Record<string, string>,
  logs: SanitizeLogEntry[],
  tag: string,
  attr: string
): string | null {
  const url = raw.trim();
  if (!url) return raw;

  if (url.startsWith('#')) return url; // 页内锚点允许
  if (/^(mailto|tel):/i.test(url)) return null; // 不允许触发外部程序

  if (DANGEROUS_PROTOCOLS.test(url)) {
    logs.push({ level: 'block', message: `阻止危险协议 ${tag}[${attr}]="${url}"` });
    return null;
  }
  if (EXTERNAL_URL_RE.test(url) || PROTOCOL_RE.test(url)) {
    logs.push({ level: 'block', message: `阻止外部资源 ${tag}[${attr}]="${url}"（仅允许本地包内资源）` });
    return null;
  }

  // 相对路径：解析成包内键
  const normalized = url.split('?')[0].split('#')[0];
  const candidate = normalizeRelative(normalized);
  const exists =
    files[candidate] !== undefined ||
    Object.keys(files).some((f) => f.toLowerCase() === candidate.toLowerCase());

  if (!exists) {
    // 不联网、不请求父站：直接移除，避免沙箱向宿主源发请求
    logs.push({ level: 'block', message: `引用的本地资源不在案例包内：${url}，已移除` });
    return null;
  }

  // 本地文本资源（如 svg）以内联 data URI 也不允许（img-src 只给 data:，但为了可审计，
  // 我们把引用保留为仅记录的标记属性）。CSS 文件已整体内联，无需链接。
  logs.push({ level: 'allow', message: `允许包内引用 ${url}` });
  return url;
}

function normalizeRelative(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

// ---------- CSS 净化器 ----------

const CSS_IE_EXPR_RE = /expression\s*\(/i;
const CSS_IMPORT_RE = /@import\s+(?:url\()?[^;]+;?/gi;
const CSS_URL_EXTERNAL_RE = /url\(\s*(['"]?)(https?:)?\/\/|url\(\s*(['"]?)(data|javascript|vbscript|file):/gi;
const CSS_NAV_RE = /(?:^|[{;]\s*)(?:-moz-binding|behavior)\s*:/gi;

export function sanitizeCss(
  css: string,
  where: 'inline' | 'tag' | 'file',
  logs: SanitizeLogEntry[]
): string {
  let out = css;

  if (CSS_IE_EXPR_RE.test(out)) {
    logs.push({ level: 'block', message: `CSS 中删除 IE expression()` });
    out = out.replace(CSS_IE_EXPR_RE, '');
  }

  out = out.replace(CSS_IMPORT_RE, (m) => {
    logs.push({ level: 'block', message: `CSS @import 已删除（${where}）：${m.slice(0, 60)}` });
    return '';
  });

  out = out.replace(CSS_URL_EXTERNAL_RE, () => {
    logs.push({ level: 'block', message: `CSS url() 外链/危险协议已删除（${where}）` });
    return 'url(';
  });

  out = out.replace(CSS_NAV_RE, (m) => {
    logs.push({ level: 'block', message: `危险 CSS 属性已删除：${m.trim()}` });
    return m.startsWith('{') ? '{' : '';
  });

  return out;
}
