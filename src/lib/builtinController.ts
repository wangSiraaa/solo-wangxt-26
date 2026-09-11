import type { CaseKind } from '../types';

/**
 * 内置可信案例的交互由父页面驱动：
 * iframe 本身不带 allow-scripts，这些控制器通过 contentDocument
 * 绑定事件，属于审查台自身代码，不是导入内容。
 */
export function attachBuiltinController(kind: CaseKind, win: Window): () => void {  const doc = win.document;
  const cleanups: Array<() => void> = [];

  const on = (
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject
  ) => {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  if (kind === 'builtin-modal') {
    const openBtn = doc.getElementById('openDialogBtn');
    const closeBtn = doc.getElementById('closeDialogBtn');
    const saveBtn = doc.getElementById('saveDialogBtn');
    const backdrop = doc.getElementById('settingsDialog');

    const open = () => backdrop?.removeAttribute('hidden');
    const close = () => backdrop?.setAttribute('hidden', '');

    if (openBtn) on(openBtn, 'click', open);
    if (closeBtn) on(closeBtn, 'click', close);
    if (saveBtn) on(saveBtn, 'click', close);
    // 点击遮罩关闭（可信案例自带行为）
    if (backdrop) {
      on(backdrop, 'click', (e) => {
        if (e.target === backdrop) close();
      });
    }
  }

  if (kind === 'builtin-menu') {
    const toggle = doc.getElementById('menuToggle');
    const panel = doc.getElementById('menuPanel');
    if (toggle && panel) {
      on(toggle, 'click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        if (expanded) panel.setAttribute('hidden', '');
        else panel.removeAttribute('hidden');
      });
    }
    // “团队管理” 是 div 伪按钮：故意不绑定任何键盘/点击处理，
    // 以暴露非语义控件问题。
  }

  if (kind === 'builtin-form') {
    const form = doc.getElementById('signupForm') as HTMLFormElement | null;
    if (form) {
      on(form, 'submit', (e) => {
        e.preventDefault();
        const email = doc.getElementById('email') as HTMLInputElement;
        const age = doc.getElementById('age') as HTMLInputElement;
        const ageError = doc.getElementById('ageError');

        let firstInvalid: HTMLElement | null = null;

        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) {
          // 植入问题：邮箱错误只用 alert 风格临时提示，未关联输入框
          email.style.borderColor = '#dc2626';
          if (!firstInvalid) firstInvalid = email;
        }

        if (age && age.value && !/^\d+$/.test(age.value)) {
          ageError?.removeAttribute('hidden');
          if (!firstInvalid) firstInvalid = age;
        } else {
          ageError?.setAttribute('hidden', '');
        }

        // 植入问题：提交出错时焦点未移动到第一个无效字段
        if (firstInvalid) {
          // 故意不调用 firstInvalid.focus()
        }
      });
    }
  }

  return () => cleanups.forEach((fn) => fn());
}
