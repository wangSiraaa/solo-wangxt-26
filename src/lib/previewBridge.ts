import type {
  AxeViolationLite,
  FocusSnapshot,
  PreparedDocument,
  TabRecord
} from '../types';
import { attachBuiltinController } from './builtinController';
import type { ElementLocator } from '../types';
import {
  buildLocator,
  checkOcclusion,
  getAccessibleName,
  getRole,
  isFocusableElement,
  isVisible,
  queryByLocator,
  type OcclusionResult
} from './inspect';
import { runAxe } from './axe';

export interface BridgeEvents {
  onFocus?: (snap: FocusSnapshot) => void;
  onTabRecord?: (rec: TabRecord) => void;
  onBlur?: () => void;
}

/**
 * PreviewBridge 管理隔离 iframe 的全部交互：
 *  - 以 srcdoc 写入净化后的文档，sandbox 不含 allow-scripts；
 *  - 在父页 JS 世界监听 iframe 文档的 focus/blur（capture），记录真实 Tab 顺序；
 *  - 内置可信案例的交互控制器由父页挂载。
 */
export class PreviewBridge {
  iframe: HTMLIFrameElement;
  doc: Document | null = null;
  private cleanupController: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private events: BridgeEvents = {};
  private highlightEl: HTMLElement | null = null;
  private tabIndex = 0;
  private lastFocused: Element | null = null;
  recording = false;

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
  }

  setEvents(events: BridgeEvents) {
    this.events = events;
  }

  load(prepared: PreparedDocument, kind: string, onReady: () => void) {
    this.teardownDoc();
    this.tabIndex = 0;
    this.lastFocused = null;

    const handleLoad = () => {
      const doc = this.iframe.contentDocument;
      if (!doc) return;
      this.doc = doc;

      // 焦点监听：capture 阶段，跨文档同样触发
      const focusHandler = (e: FocusEvent) => {
        const el = e.target as Element;
        if (!el || el.nodeType !== 1 || el.ownerDocument !== doc) return;
        this.lastFocused = el;
        const snap = this.snapshot(el);
        this.events.onFocus?.(snap);
        if (this.recording && isFocusableElement(el, doc)) {
          const occ = checkOcclusion(el, doc);
          const rec: TabRecord = {
            index: this.tabIndex++,
            locator: snap.locator,
            role: snap.role,
            accessibleName: snap.accessibleName,
            tabIndex: this.readTabIndex(el),
            visible: snap.visible,
            disabled: el.hasAttribute('disabled'),
            occluded: occ.occluded,
            timestamp: Date.now()
          };
          this.events.onTabRecord?.(rec);
        }
      };
      const blurDoc = () => {
        // 延迟判断：焦点可能只是在 iframe 内部转移
        setTimeout(() => {
          if (doc.activeElement === doc.body || doc.activeElement === null) {
            this.events.onBlur?.();
          }
        }, 10);
      };
      doc.addEventListener('focus', focusHandler, true);
      doc.addEventListener('blur', blurDoc, true);
      this.listeners.add(() => doc.removeEventListener('focus', focusHandler, true));
      this.listeners.add(() => doc.removeEventListener('blur', blurDoc, true));

      // 内置可信案例：挂载父页控制器
      if (kind.startsWith('builtin-')) {
        this.cleanupController = attachBuiltinController(
          kind as Parameters<typeof attachBuiltinController>[0],
          this.iframe.contentWindow!
        );
      }

      // 点击选择元素（人工标注 / 定位）
      const clickHandler = (e: MouseEvent) => {
        if (this.pickHandler) {
          e.preventDefault();
          const el = e.target as Element;
          this.pickHandler(el);
          this.pickHandler = null;
          this.iframe.style.cursor = '';
        }
      };
      doc.addEventListener('click', clickHandler, true);
      this.listeners.add(() => doc.removeEventListener('click', clickHandler, true));

      // Escape 取消元素选取
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.pickHandler) this.cancelPick();
      };
      doc.addEventListener('keydown', keyHandler, true);
      this.listeners.add(() => doc.removeEventListener('keydown', keyHandler, true));

      onReady();
    };

    // 不用 once：同一 iframe 会反复写入不同案例的 srcdoc
    this.iframe.addEventListener('load', handleLoad);
    this.listeners.add(() => this.iframe.removeEventListener('load', handleLoad));
    this.iframe.srcdoc = prepared.srcdoc;
  }

  private readTabIndex(el: Element): number {
    const raw = el.getAttribute('tabindex');
    if (raw === null) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  }

  snapshot(el: Element): FocusSnapshot {
    const doc = el.ownerDocument;
    const rect = el.getBoundingClientRect();
    const occ = checkOcclusion(el, doc);
    return {
      locator: buildLocator(el, doc),
      accessibleName: getAccessibleName(el, doc),
      role: getRole(el),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      occluded: occ.occluded,
      visible: isVisible(el)
    };
  }

  // ---------- 录制 ----------
  startRecording() {
    this.recording = true;
    this.tabIndex = 0;
  }
  stopRecording() {
    this.recording = false;
  }

  // ---------- 选取模式 ----------
  private pickHandler: ((el: Element) => void) | null = null;
  private pickReject: (() => void) | null = null;
  pickElement(): Promise<Element> {
    return new Promise((resolve, reject) => {
      this.pickHandler = resolve;
      this.pickReject = reject;
      if (this.doc) this.iframe.style.cursor = 'crosshair';
    });
  }
  cancelPick() {
    this.pickHandler = null;
    this.pickReject?.();
    this.pickReject = null;
    this.iframe.style.cursor = '';
  }

  // ---------- 跳转 / 高亮 ----------
  resolveLocator(loc: ElementLocator): Element | null {
    if (!this.doc) return null;
    return queryByLocator(this.doc, loc);
  }

  focusLocator(loc: ElementLocator): Element | null {
    const el = this.resolveLocator(loc);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    try {
      (el as HTMLElement).focus({ preventScroll: true });
    } catch {
      /* 某些元素不可编程聚焦 */
    }
    this.highlight(el as HTMLElement);
    return el;
  }

  highlight(el: HTMLElement) {
    if (!this.doc) return;
    this.clearHighlight();
    const marker = this.doc.createElement('div');
    marker.setAttribute('data-audit-highlight', '');
    const r = el.getBoundingClientRect();
    Object.assign(marker.style, {
      position: 'absolute',
      left: `${r.left + this.doc.defaultView!.scrollX}px`,
      top: `${r.top + this.doc.defaultView!.scrollY}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      boxShadow: '0 0 0 3px rgba(220,38,38,.85), 0 0 0 7px rgba(220,38,38,.25)',
      borderRadius: '4px',
      pointerEvents: 'none',
      zIndex: '2147483646',
      transition: 'box-shadow .15s'
    } satisfies Partial<CSSStyleDeclaration>);
    this.doc.body?.appendChild(marker);
    this.highlightEl = marker;
    setTimeout(() => this.clearHighlight(), 3200);
  }

  clearHighlight() {
    this.highlightEl?.remove();
    this.highlightEl = null;
  }

  /** 当前焦点元素（若无主动焦点返回 body） */
  currentFocus(): Element | null {
    if (!this.doc) return null;
    const active = this.doc.activeElement;
    if (!active || active === this.doc.body) return this.lastFocused;
    return active;
  }

  probeOcclusion(loc: ElementLocator): OcclusionResult | null {
    const el = this.resolveLocator(loc);
    if (!el || !this.doc) return null;
    return checkOcclusion(el, this.doc);
  }

  async runScan(): Promise<{
    violations: AxeViolationLite[];
    passCount: number;
    incompleteCount: number;
    engineVersion: string;
    error?: string;
  } | null> {
    if (!this.doc) return null;
    const res = await runAxe(this.doc);
    return {
      violations: res.violations,
      passCount: res.passes.length,
      incompleteCount: res.incomplete.length,
      engineVersion: res.engineVersion,
      error: res.error
    };
  }

  teardownDoc() {
    if (this.pickHandler) this.cancelPick();
    this.listeners.forEach((fn) => fn());
    this.listeners.clear();
    this.cleanupController?.();
    this.cleanupController = null;
    this.highlightEl = null;
    this.doc = null;
  }
}
