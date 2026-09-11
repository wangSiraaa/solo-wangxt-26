// 全局数据模型

export type CaseKind = 'builtin-modal' | 'builtin-menu' | 'builtin-form' | 'imported';

/** 案例包：一个入口 HTML + 若干本地 CSS / 资源文本 */
export interface CasePackage {
  id: string;
  kind: CaseKind;
  name: string;
  description: string;
  entry: string; // files 中的入口键名
  files: Record<string, string>; // 仅文本：html / css / svg
  importedAt: number;
  origin: 'builtin' | 'import';
}

export type IssueSource = 'axe' | 'probe' | 'manual';
export type IssueSeverity = 'critical' | 'serious' | 'moderate' | 'minor';
export type IssueStatus = 'open' | 'confirmed' | 'wontfix' | 'resolved';

/** 一个可定位到 iframe 内元素的问题/标注 */
export interface Issue {
  id: string;
  source: IssueSource; // axe=静态规则自动发现 probe=键盘/遮挡等实测 manual=人工标注
  ruleId?: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  locator: ElementLocator;
  targetPreview?: string; // 目标元素 outerHTML 摘要
  wcag?: string;
  createdAt: number;
  note?: string;
}

export interface ElementLocator {
  cssPath: string; // 唯一 CSS 路径
  selectorChain: string[]; // 逐层选择器
  attributes: Record<string, string>; // id / name / data-* 等
  htmlTag: string;
  textSnippet?: string;
}

/** 一次 Tab 记录条目 */
export interface TabRecord {
  index: number;
  locator: ElementLocator;
  role: string;
  accessibleName: string;
  tabIndex: number;
  visible: boolean;
  disabled: boolean;
  occluded: boolean;
  timestamp: number;
}

/** 焦点快照 */
export interface FocusSnapshot {
  locator: ElementLocator;
  accessibleName: string;
  role: string;
  rect: { x: number; y: number; width: number; height: number };
  occluded: boolean;
  visible: boolean;
}

export interface AxeViolationLite {
  id: string;
  impact: IssueSeverity | null;
  help: string;
  description: string;
  helpUrl?: string;
  wcag?: string;
  nodes: { locator: ElementLocator; html: string; summary: string }[];
}

export interface ReviewRecord {
  id: string;
  caseId: string;
  caseName: string;
  startedAt: number;
  updatedAt: number;
  issues: Issue[];
  tabOrder: TabRecord[];
  axeScanVersion?: number; // 第几次扫描
  axeViolationCount?: number;
  axePassCount?: number;
  conclusion: string; // 审查结论（人工填写）
}

export interface SanitizeLogEntry {
  level: 'block' | 'rewrite' | 'allow';
  message: string;
}

export interface PreparedDocument {
  srcdoc: string;
  logs: SanitizeLogEntry[];
  injectedCss: string;
}
