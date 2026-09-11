import type { ElementLocator } from '../types';

/** 在指定 document 下查询元素（跨 iframe document 使用） */
export function queryByLocator(doc: Document, loc: ElementLocator): Element | null {
  try {
    return doc.querySelector(loc.cssPath);
  } catch {
    return null;
  }
}

const ID_DANGEROUS = /[\s"#.%&,:;<=>?@[\\\]^`{|}/]/;

/** 生成稳定且尽量唯一的 CSS 路径，附带属性线索 */
export function buildLocator(el: Element, doc: Document): ElementLocator {
  const attributes: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (
      ['id', 'name', 'for', 'aria-label', 'aria-labelledby', 'data-testid', 'type', 'href'].includes(
        a.name
      ) ||
      a.name.startsWith('data-qa')
    ) {
      attributes[a.name] = a.value;
    }
  }

  const chain: string[] = [];
  let node: Element | null = el;
  let cssPath = '';

  // 优先用唯一 id
  if (el.id && !ID_DANGEROUS.test(el.id)) {
    const byId = doc.getElementById(el.id);
    if (byId === el) {
      cssPath = `#${CSS.escape(el.id)}`;
      chain.unshift(cssPath);
      return finalize(el, cssPath, chain, attributes);
    }
  }

  while (node && node.nodeType === 1 && node !== doc.documentElement) {
    let part = node.tagName.toLowerCase();
    if (node.id && !ID_DANGEROUS.test(node.id)) {
      part += `#${CSS.escape(node.id)}`;
      chain.unshift(part);
      cssPath = chain.join(' > ');
      if (doc.querySelectorAll(cssPath).length === 1) {
        return finalize(node === el ? el : el, cssPath, chain, attributes);
      }
    } else {
      const parent = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(
          (c) => c.tagName === node!.tagName
        );
        if (sameTag.length > 1) {
          const idx = sameTag.indexOf(node) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      chain.unshift(part);
      node = node.parentElement;
    }
  }

  cssPath = chain.join(' > ');
  return finalize(el, cssPath, chain, attributes);
}

function finalize(
  el: Element,
  cssPath: string,
  chain: string[],
  attributes: Record<string, string>
): ElementLocator {
  const textSnippet = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  return {
    cssPath,
    selectorChain: chain,
    attributes,
    htmlTag: el.tagName.toLowerCase(),
    textSnippet: textSnippet || undefined
  };
}

/** 元素 outerHTML 摘要 */
export function previewHtml(el: Element, max = 160): string {
  const html = el.outerHTML.replace(/\s+/g, ' ').trim();
  return html.length > max ? html.slice(0, max - 1) + '…' : html;
}

// ---------- 可访问名称（AccName 简化实现，覆盖主流算法步骤） ----------

const LABELLABLE_TAGS = new Set([
  'button',
  'input',
  'select',
  'textarea',
  'output',
  'meter',
  'progress'
]);

export function getAccessibleName(el: Element, doc: Document): string {
  // 1. aria-labelledby
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const parts = labelledby
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter(Boolean)
      .map((n) => (n as Element).textContent || '')
      .join(' ')
      .trim();
    if (parts) return parts;
  }

  // 2. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  const tag = el.tagName.toLowerCase();

  // 控件由 <label for> 包裹/关联
  if (LABELLABLE_TAGS.has(tag)) {
    if (el.id) {
      const label = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && (label.textContent || '').trim()) {
        return (label.textContent || '').trim().replace(/\s+/g, ' ');
      }
    }
    const wrappingLabel = el.closest('label');
    if (wrappingLabel) {
      const clone = wrappingLabel.cloneNode(true) as Element;
      clone
        .querySelectorAll('input,select,textarea,button')
        .forEach((c) => c.parentNode?.removeChild(c));
      const txt = (clone.textContent || '').trim().replace(/\s+/g, ' ');
      if (txt) return txt;
    }
    if (tag === 'input') {
      const type = (el as HTMLInputElement).type;
      if (type === 'submit' || type === 'button')
        return (el as HTMLInputElement).value || (type === 'submit' ? '提交' : '');
      if (type === 'reset') return (el as HTMLInputElement).value || '重置';
      if (type === 'image')
        return (el as HTMLInputElement).alt || el.getAttribute('title') || '';
      if (type === 'search') return el.getAttribute('title') || '';
    }
  }

  // 3. 图片 alt
  if (tag === 'img') return (el.getAttribute('alt') || '').trim();
  if (tag === 'area') return (el.getAttribute('alt') || '').trim();

  // 4. 链接/按钮的内容文本
  if (tag === 'a' || tag === 'button' || tag === 'summary') {
    return textContentAltAware(el);
  }

  // 5. title
  const title = el.getAttribute('title');
  if (title && title.trim()) return title.trim();

  return '';
}

function textContentAltAware(el: Element): string {
  let out = '';
  el.childNodes.forEach(function walk(n) {
    if (n.nodeType === 3) {
      out += n.textContent;
    } else if (n.nodeType === 1) {
      const child = n as Element;
      // AccName：aria-hidden 子树不参与命名
      if (child.getAttribute && child.getAttribute('aria-hidden') === 'true') return;
      if (child.tagName.toLowerCase() === 'img') {
        out += ' ' + (child.getAttribute('alt') || '') + ' ';
      } else if (child.tagName.toLowerCase() === 'svg') {
        out += ' ' + (child.getAttribute('aria-label') || child.querySelector('title')?.textContent || '') + ' ';
      } else if (!['script', 'style'].includes(child.tagName.toLowerCase())) {
        child.childNodes.forEach(walk);
      }
    }
  });
  return out.replace(/\s+/g, ' ').trim();
}

// ---------- ARIA 角色（简化） ----------

const NATIVE_ROLE: Record<string, string> = {
  a: 'link',
  button: 'button',
  input: 'textbox',
  select: 'combobox',
  textarea: 'textbox',
  details: 'group',
  summary: 'button',
  img: 'img',
  nav: 'navigation',
  main: 'main',
  header: 'banner',
  footer: 'contentinfo',
  dialog: 'dialog',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  table: 'table',
  form: 'form',
  label: 'label'
};

export function getRole(el: Element): string {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit.trim().split(/\s+/)[0];
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type;
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (['button', 'submit', 'reset'].includes(type)) return 'button';
    if (type === 'range') return 'slider';
    if (type === 'search') return 'searchbox';
    return 'textbox';
  }
  return NATIVE_ROLE[tag] || tag;
}

// ---------- 可聚焦元素 ----------

const FOCUSABLE_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'details',
  'audio',
  'video'
]);

export function isFocusableElement(el: Element, doc: Document): boolean {
  const tag = el.tagName.toLowerCase();
  if (['script', 'style', 'meta', 'link', 'head', 'title', 'base'].includes(tag)) return false;
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  const tabIndexAttr = el.getAttribute('tabindex');
  const tabIndex = tabIndexAttr === null ? null : Number.parseInt(tabIndexAttr, 10);
  if (tabIndex !== null && Number.isNaN(tabIndex)) return false;

  let natively = false;
  if (FOCUSABLE_TAGS.has(tag)) {
    if (tag === 'a') natively = el.hasAttribute('href');
    else if (tag === 'details') natively = false; // summary 才可聚焦
    else if (tag === 'audio' || tag === 'video') natively = el.hasAttribute('controls');
    else natively = true;
  }
  if (tag === 'iframe' || tag === 'object' || tag === 'embed') natively = true;

  if (tabIndex !== null && tabIndex >= 0) return true;
  if (tabIndex === -1) return false; // 可 JS 聚焦但不在 Tab 序列
  return natively;
}

/** DOM 顺序中的 Tab 序列（tabindex>0 的重排另行处理） */
export function getTabStopSequence(doc: Document): Element[] {
  const all = Array.from(doc.querySelectorAll('*'));
  const stops = all.filter((el) => isFocusableElement(el, doc));
  const positive = stops
    .map((el) => ({ el, ti: Number.parseInt(el.getAttribute('tabindex') || '', 10) }))
    .filter((x) => Number.isFinite(x.ti) && x.ti > 0)
    .sort((a, b) => a.ti - b.ti);
  if (positive.length === 0) return stops;
  const positiveSet = new Set(positive.map((x) => x.el));
  const zero = stops.filter((el) => !positiveSet.has(el));
  return [...positive.map((x) => x.el), ...zero];
}

// ---------- 可见性 ----------

export function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    // 仅靠尺寸无法排除（有些控件视觉宽度由子元素撑开），再查计算样式
  }
  let node: Element | null = el;
  const win = el.ownerDocument.defaultView;
  while (node && node.nodeType === 1) {
    const style = win?.getComputedStyle(node);
    if (style) {
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')
        return false;
      if (Number.parseFloat(style.opacity || '1') === 0) return false;
    }
    node = node.parentElement;
  }
  const r = el.getBoundingClientRect();
  return r.width > 1 || r.height > 1;
}

// ---------- 焦点遮挡检测 ----------

export interface OcclusionResult {
  occluded: boolean;
  byElement?: ElementLocator;
  reason?: string;
  ratio: number; // 被非祖先元素覆盖的采样点比例
}

export function checkOcclusion(el: Element, doc: Document): OcclusionResult {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return { occluded: true, reason: '元素尺寸过小或不可见', ratio: 1 };
  }

  // 采样：中心 + 四角内缩点
  const pad = Math.min(4, rect.width / 4, rect.height / 4);
  const points = [
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
    [rect.left + pad, rect.top + pad],
    [rect.right - pad, rect.top + pad],
    [rect.left + pad, rect.bottom - pad],
    [rect.right - pad, rect.bottom - pad]
  ];

  let covered = 0;
  let coverEl: Element | null = null;
  for (const [x, y] of points) {
    const top = doc.elementFromPoint(x, y);
    if (!top) {
      covered++;
      continue;
    }
    if (top === el || el.contains(top) || top.contains(el)) continue;
    // 忽略透明覆盖层（pointer-events:none 不会出现在 elementFromPoint 中）
    const style = doc.defaultView?.getComputedStyle(top);
    if (style && Number.parseFloat(style.opacity || '1') === 0) continue;
    covered++;
    if (!coverEl) coverEl = top;
  }

  const ratio = covered / points.length;
  if (covered >= 2) {
    return {
      occluded: true,
      ratio,
      reason: `焦点元素有 ${covered}/${points.length} 个采样点被其他元素覆盖`,
      byElement: coverEl ? buildLocator(coverEl, doc) : undefined
    };
  }
  return { occluded: false, ratio };
}
