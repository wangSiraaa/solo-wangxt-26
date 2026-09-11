import type { CasePackage } from '../types';

const now = Date.now();

// ============ 案例 1：弹窗对话框 ============

const modalHtml = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>弹窗案例</title></head>
<body>
  <header class="page-header">
    <h1>订阅推送</h1>
  </header>
  <main class="container">
    <p>管理你的消息通知偏好。</p>
    <button id="openDialogBtn" class="btn primary">打开通知设置</button>

    <a href="#" class="skip-before">背景里的链接（弹窗打开时仍可被 Tab 到）</a>
  </main>

  <!--
    植入问题：
    - 缺少 role="dialog" / aria-modal / aria-labelledby（axe: dialog 语义缺失需人工判断）
    - 关闭按钮可访问名称与功能不符
    - 右上角有一个装饰条遮挡焦点（遮挡仅键盘实测可发现）
    - 背景链接无 inert/焦点圈禁，Tab 会逃逸（键盘实测）
    - 首个可聚焦元素 tabindex=1 打乱顺序（键盘实测）
  -->
  <div id="settingsDialog" class="dialog-backdrop" hidden>
    <div class="dialog">
      <span class="ribbon" aria-hidden="true">★ 限时优惠 ★</span>
      <h2 id="dialogTitle">通知设置</h2>
      <p>选择你希望接收的通知类型。</p>

      <label class="row"><input type="checkbox" checked tabindex="1" /> 系统公告</label>
      <label class="row"><input type="checkbox" /> 每周精选</label>
      <label class="row"><input type="checkbox" /> 营销推广</label>

      <div class="actions">
        <button id="saveDialogBtn" class="btn primary">保存设置</button>
        <button id="closeDialogBtn" class="btn ghost" aria-label="更多选项">X</button>
      </div>
    </div>
  </div>
</body>
</html>`;

const modalCss = `
body { font-family: system-ui, sans-serif; margin: 0; background: #f6f7f9; color: #1f2937; }
.page-header { background: #1d4ed8; color: #fff; padding: 16px 24px; }
.container { padding: 24px; max-width: 640px; }
.btn { padding: 8px 16px; border-radius: 6px; border: 1px solid #9ca3af; font-size: 14px; cursor: pointer; }
.btn.primary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
.btn.ghost { background: #fff; }
.skip-before { display: inline-block; margin-top: 24px; color: #1d4ed8; }
.dialog-backdrop { position: fixed; inset: 0; background: rgba(17,24,39,.45); display: flex; align-items: center; justify-content: center; }
.dialog { position: relative; background: #fff; border-radius: 10px; padding: 28px; width: 420px; max-width: 90vw; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
/* 装饰条：横跨弹窗顶部右上角，遮挡关闭按钮上半部分的焦点 */
.ribbon {
  position: absolute; top: -2px; right: -10px;
  background: linear-gradient(90deg,#f59e0b,#ef4444);
  color: #fff; font-weight: 700; font-size: 12px;
  padding: 6px 22px 18px 22px;
  transform: rotate(12deg);
  border-radius: 4px;
  pointer-events: auto;
  box-shadow: 0 4px 10px rgba(0,0,0,.2);
}
.row { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
`;

// ============ 案例 2：折叠菜单 ============

const menuHtml = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>折叠菜单案例</title></head>
<body>
  <header class="topbar">
    <h1>控制台</h1>
    <nav class="menu" aria-label="主导航">
      <!--
        植入问题：
        - 触发按钮仅含图标字符，无 aria-label，可访问名称为空（axe: button-name）
        - 菜单展开用 div 而非恰当菜单语义（人工/aria 规则）
        - 第一项 tabindex="5" 正序值打乱 Tab 顺序（键盘实测）
        - 一个新增按钮用 div+onclick 风格（此处为不可用 div，键盘完全无法操作）
      -->
      <button id="menuToggle" class="icon-btn" aria-expanded="false" aria-controls="menuPanel">
        <span class="icon" aria-hidden="true">≡</span>
      </button>
      <div id="menuPanel" class="menu-panel" hidden>
        <a href="#" class="menu-item" tabindex="5">仪表盘</a>
        <a href="#" class="menu-item">报表中心</a>
        <div class="menu-item fake" tabindex="0" role="button">团队管理（div 模拟按钮）</div>
        <a href="#" class="menu-item">系统设置</a>
      </div>
    </nav>
  </header>
  <main class="content">
    <p>点击左上角菜单图标查看导航。</p>
  </main>
</body>
</html>`;

const menuCss = `
body { font-family: system-ui, sans-serif; margin: 0; }
.topbar { display: flex; align-items: center; gap: 16px; background: #111827; color: #fff; padding: 12px 20px; }
.topbar h1 { font-size: 18px; margin: 0; }
.menu { position: relative; margin-left: auto; }
.icon-btn { width: 38px; height: 38px; border-radius: 6px; border: 1px solid #4b5563; background: #1f2937; color: #fff; font-size: 20px; cursor: pointer; }
.menu-panel { position: absolute; right: 0; top: 44px; min-width: 180px; background: #fff; color: #111827; border: 1px solid #d1d5db; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,.15); padding: 6px; z-index: 10; }
.menu-item { display: block; padding: 9px 12px; border-radius: 6px; text-decoration: none; color: #111827; cursor: pointer; }
.menu-item:hover, .menu-item:focus { background: #eff6ff; outline: none; } /* 移除焦点轮廓：axe 不会报，键盘实测明显 */
.content { padding: 24px; color: #4b5563; }
`;

// ============ 案例 3：表单错误 ============

const formHtml = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>表单错误案例</title></head>
<body>
  <main class="wrap">
    <h1>创建账户</h1>
    <!-- novalidate：禁用浏览器原生校验，错误展示完全由页面负责 -->
    <form id="signupForm" novalidate>
      <div class="field">
        <!-- 植入：输入框无 label 关联，仅有占位符（axe: label-title-only，placeholder 不是持久标签） -->
        <input id="email" type="email" placeholder="请输入邮箱" />
      </div>

      <div class="field">
        <!-- 植入：完全没有任何名称来源的输入框（axe: label） -->
        <input id="confirmCode" type="text" maxlength="6" />
      </div>

      <div class="field">
        <label for="password">密码</label>
        <input id="password" type="password" aria-describedby="pwdHint" />
        <span id="pwdHint" class="hint">至少 8 位</span>
      </div>

      <div class="field">
        <label for="age">年龄</label>
        <input id="age" type="text" inputmode="numeric" />
        <!-- 植入：错误信息未用 aria-describedby 关联，且对比度极低（axe: color-contrast） -->
        <span id="ageError" class="error" hidden>年龄必须是数字</span>
      </div>

      <button type="submit" class="submit">注册</button>
    </form>
  </main>
</body>
</html>`;

const formCss = `
body { font-family: system-ui, sans-serif; background: #fafafa; margin: 0; }
.wrap { max-width: 420px; margin: 48px auto; background: #fff; padding: 28px; border-radius: 10px; border: 1px solid #e5e7eb; }
h1 { font-size: 20px; margin: 0 0 20px; }
.field { margin-bottom: 18px; display: flex; flex-direction: column; gap: 6px; }
label { font-size: 14px; color: #374151; }
input { padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; }
/* 错误提示：浅灰文字落在白底上，对比度约 1.6:1 */
.error { color: #d1d5db; font-size: 13px; }
.hint { color: #6b7280; font-size: 12px; }
.submit { width: 100%; padding: 11px; background: #047857; color: #fff; border: none; border-radius: 6px; font-size: 15px; cursor: pointer; }
`;

export const BUILTIN_CASES: CasePackage[] = [
  {
    id: 'builtin-modal',
    kind: 'builtin-modal',
    origin: 'builtin',
    name: '① 弹窗（对话框）',
    description:
      '通知设置弹窗。含焦点圈禁缺失、焦点遮挡、正 tabindex 打乱顺序、关闭按钮名称不符等问题。',
    entry: 'index.html',
    files: { 'index.html': modalHtml, 'styles.css': modalCss },
    importedAt: now
  },
  {
    id: 'builtin-menu',
    kind: 'builtin-menu',
    origin: 'builtin',
    name: '② 折叠菜单',
    description:
      '图标按钮触发的下拉菜单。含空名称按钮、div 伪按钮、焦点轮廓被移除、tabindex 跳序等问题。',
    entry: 'index.html',
    files: { 'index.html': menuHtml, 'styles.css': menuCss },
    importedAt: now
  },
  {
    id: 'builtin-form',
    kind: 'builtin-form',
    origin: 'builtin',
    name: '③ 表单错误',
    description:
      '注册表单校验。含无标签输入、错误未关联 aria-describedby、错误文字对比度不足等问题。',
    entry: 'index.html',
    files: { 'index.html': formHtml, 'styles.css': formCss },
    importedAt: now
  }
];
