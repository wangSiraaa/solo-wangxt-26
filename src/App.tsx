import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BUILTIN_CASES } from './lib/builtinCases';
import { importFromFiles } from './lib/importer';
import { prepareDocument } from './lib/sanitize';
import { PreviewBridge } from './lib/previewBridge';
import {
  buildLocator,
  getAccessibleName,
  getRole,
  getTabStopSequence,
  isVisible,
  previewHtml
} from './lib/inspect';
import {
  deleteCasePackage,
  listCasePackages,
  listReviews,
  saveCasePackage,
  saveReview
} from './lib/storage';
import { exportHtml, exportJson } from './lib/report';
import type {
  AxeViolationLite,
  CasePackage,
  ElementLocator,
  FocusSnapshot,
  Issue,
  PreparedDocument,
  ReviewRecord,
  SanitizeLogEntry,
  TabRecord
} from './types';
import { CaseSidebar } from './components/CaseSidebar';
import { IssuePanel } from './components/IssuePanel';
import { TabTestPanel } from './components/TabTestPanel';
import { IsolationPanel } from './components/IsolationPanel';
import { FocusStrip } from './components/FocusStrip';
import './styles.css';

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type RightTab = 'issues' | 'tabtest' | 'isolation';

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<PreviewBridge | null>(null);

  const [importedCases, setImportedCases] = useState<CasePackage[]>([]);
  const [activeCase, setActiveCase] = useState<CasePackage | null>(null);
  const [prepared, setPrepared] = useState<PreparedDocument | null>(null);
  const [logs, setLogs] = useState<SanitizeLogEntry[]>([]);

  const [rightTab, setRightTab] = useState<RightTab>('issues');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [tabRecords, setTabRecords] = useState<TabRecord[]>([]);
  const [domSequence, setDomSequence] = useState<ElementLocator[]>([]);
  const [focus, setFocus] = useState<FocusSnapshot | null>(null);
  const [recording, setRecording] = useState(false);
  const [picking, setPicking] = useState(false);
  const [scanMeta, setScanMeta] = useState<{
    engine: string;
    pass: number;
    violations: number;
    incomplete: number;
    error?: string;
  } | null>(null);
  const [reviewId, setReviewId] = useState<string>(() => uid('rev'));
  const [startedAt] = useState<number>(() => Date.now());
  const [conclusion, setConclusion] = useState('');
  const [toast, setToast] = useState('');
  const [reviewSummaryOpen, setReviewSummaryOpen] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState<{
    locator: ElementLocator;
    title: string;
    description: string;
    severity: Issue['severity'];
  } | null>(null);

  const allCases = useMemo(() => [...BUILTIN_CASES, ...importedCases], [importedCases]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }, []);

  // 初始化：读取 IndexedDB
  useEffect(() => {
    listCasePackages().then(setImportedCases).catch(() => undefined);
  }, []);

  // 初始化 bridge
  useEffect(() => {
    if (!iframeRef.current) return;
    const bridge = new PreviewBridge(iframeRef.current);
    bridgeRef.current = bridge;
    bridge.setEvents({
      onFocus: (snap) => setFocus(snap),
      onTabRecord: (rec) => setTabRecords((prev) => [...prev, rec]),
      onBlur: () => undefined
    });
    return () => bridge.teardownDoc();
  }, []);

  // 加载案例
  const loadCase = useCallback(
    (c: CasePackage) => {
      const pre = prepareDocument({ files: c.files, entry: c.entry });
      setPrepared(pre);
      setLogs(pre.logs);
      setActiveCase(c);
      setIssues([]);
      setTabRecords([]);
      setFocus(null);
      setScanMeta(null);
      setDomSequence([]);
      setRecording(false);
      setRightTab('issues');
      setConclusion('');
      setAnnotationDraft(null);
      setReviewId(uid('rev'));

      bridgeRef.current?.load(pre, c.kind, () => {
        const doc = iframeRef.current?.contentDocument;
        if (doc) {
          setDomSequence(getTabStopSequence(doc).map((el) => buildLocator(el, doc)));
        }
      });
    },
    []
  );

  // ---------- 导入 ----------
  const handleImport = useCallback(
    async (files: FileList | File[]) => {
      try {
        const pkg = await importFromFiles(files);
        await saveCasePackage(pkg);
        setImportedCases((prev) => [...prev, pkg]);
        loadCase(pkg);
        showToast(`已导入「${pkg.name}」，并经过净化沙箱处理`);
      } catch (err) {
        alert('导入失败：' + (err instanceof Error ? err.message : String(err)));
      }
    },
    [loadCase, showToast]
  );

  const handleDeleteCase = useCallback(async (id: string) => {
    await deleteCasePackage(id);
    setImportedCases((prev) => prev.filter((c) => c.id !== id));
    if (activeCase?.id === id) {
      setActiveCase(null);
      setPrepared(null);
    }
  }, [activeCase?.id]);

  // ---------- axe 静态检测 ----------
  const runScan = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    showToast('axe-core 静态规则检测中…');
    const res = await bridge.runScan();
    if (!res) return;
    setScanMeta({
      engine: res.engineVersion,
      pass: res.passCount,
      violations: res.violations.length,
      incomplete: res.incompleteCount,
      error: res.error
    });
    mergeAxeIssues(res.violations);
  }, [showToast]);

  const mergeAxeIssues = useCallback((violations: AxeViolationLite[]) => {
    setIssues((prev) => {
      const kept = prev.filter((i) => i.source !== 'axe');
      const auto: Issue[] = violations.flatMap((v) =>
        v.nodes.map((n) => ({
          id: uid('iss'),
          source: 'axe' as const,
          ruleId: v.id,
          title: v.help,
          description: `${v.description}${n.summary ? '\n' + n.summary.replace(/^[^\n]*\n/, '') : ''}`,
          severity: v.impact ?? 'moderate',
          status: 'open' as const,
          locator: n.locator,
          targetPreview: n.html,
          wcag: v.wcag,
          createdAt: Date.now()
        }))
      );
      return [...kept, ...auto];
    });
  }, []);

  // ---------- 键盘实测探针：扫描已录制 Tab 顺序，生成实测问题 ----------
  const probeTabRecords = useCallback(() => {
    const generated: Issue[] = [];
    const seen = new Set<string>();

    tabRecords.forEach((r) => {
      const key = r.locator.cssPath;
      if (r.occluded && !seen.has('occ:' + key)) {
        seen.add('occ:' + key);
        generated.push({
          id: uid('iss'),
          source: 'probe',
          title: '焦点被其他元素遮挡',
          description: '真实 Tab 聚焦该元素时，其焦点区域被上层元素覆盖，键盘用户无法判断当前位置。',
          severity: 'serious',
          status: 'open',
          locator: r.locator,
          createdAt: Date.now()
        });
      }
      if (!r.accessibleName && !seen.has('name:' + key)) {
        seen.add('name:' + key);
        generated.push({
          id: uid('iss'),
          source: 'probe',
          title: '聚焦元素缺少可访问名称',
          description: `实测 Tab 到达「${r.locator.htmlTag}」时计算出的可访问名称为空，屏幕阅读器只会朗读角色而无法表达用途。`,
          severity: 'serious',
          status: 'open',
          locator: r.locator,
          createdAt: Date.now()
        });
      }
      if (r.tabIndex > 0 && !seen.has('ti:' + key)) {
        seen.add('ti:' + key);
        generated.push({
          id: uid('iss'),
          source: 'probe',
          title: '正 tabindex 打乱自然焦点顺序',
          description: `实测顺序中该元素以 tabindex=${r.tabIndex} 被提前到自然 DOM 顺序之前，容易造成阅读/操作顺序错乱。`,
          severity: 'moderate',
          status: 'open',
          locator: r.locator,
          createdAt: Date.now()
        });
      }
    });

    // 焦点轮廓：对当前 DOM 序列计算 outline 是否被移除（静态样式探针）
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      getTabStopSequence(doc).forEach((el) => {
        if (!isVisible(el)) return;
        const style = doc.defaultView?.getComputedStyle(el);
        if (!style) return;
        const outlineOff =
          style.outlineStyle === 'none' &&
          (style.outlineWidth === '0px' || !style.outlineWidth) &&
          Number.parseFloat(style.outlineOffset || '0') === 0;
        if (outlineOff) {
          const loc = buildLocator(el, doc);
          const key = 'outline:' + loc.cssPath;
          if (!seen.has(key)) {
            seen.add(key);
            generated.push({
              id: uid('iss'),
              source: 'probe',
              title: '焦点指示器被移除（outline:none）',
              description:
                '元素获得焦点时没有可见焦点环，键盘用户无法确认当前焦点位置。axe 默认不检查此项，属于键盘实测发现。',
              severity: 'serious',
              status: 'open',
              locator: loc,
              targetPreview: previewHtml(el),
              createdAt: Date.now()
            });
          }
        }
      });
    }

    setIssues((prev) => {
      const probeTitles = new Set(generated.map((g) => g.title + g.locator.cssPath));
      const kept = prev.filter(
        (i) => !(i.source === 'probe' && probeTitles.has(i.title + i.locator.cssPath))
      );
      return [...kept, ...generated];
    });
    showToast(`实测探针生成 ${generated.length} 项问题（重复项已合并）`);
  }, [tabRecords, showToast]);

  // ---------- 人工标注 ----------
  const startManualAnnotation = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge?.doc) return;
    setPicking(true);
    try {
      const el = await bridge.pickElement();
      const doc = el.ownerDocument;
      const locator = buildLocator(el, doc);
      setAnnotationDraft({
        locator,
        title: getAccessibleName(el, doc)
          ? `人工标注：${getRole(el)}「${getAccessibleName(el, doc)}」`
          : `人工标注：${getRole(el)} 元素`,
        description: '审查员在人工走查时发现的问题（axe 与自动探针未覆盖）。',
        severity: 'moderate'
      });
      bridge.focusLocator(locator);
    } catch {
      // 用户按 Escape 或切换案例取消选取
    } finally {
      setPicking(false);
    }
  }, []);

  const confirmAnnotation = useCallback(() => {
    if (!annotationDraft) return;
    const issue: Issue = {
      id: uid('iss'),
      source: 'manual',
      title: annotationDraft.title,
      description: annotationDraft.description,
      severity: annotationDraft.severity,
      status: 'open',
      locator: annotationDraft.locator,
      targetPreview: bridgeRef.current?.resolveLocator(annotationDraft.locator)
        ? previewHtml(bridgeRef.current!.resolveLocator(annotationDraft.locator)!)
        : undefined,
      createdAt: Date.now()
    };
    setIssues((prev) => [...prev, issue]);
    setAnnotationDraft(null);
    showToast('已添加人工标注（与自动发现结果明确区分）');
  }, [annotationDraft, showToast]);

  // ---------- 跳转 ----------
  const jumpToLocator = useCallback((loc: ElementLocator) => {
    const el = bridgeRef.current?.focusLocator(loc);
    if (!el) {
      // 元素可能位于当前隐藏状态（如未打开的弹窗内）
      showToast('当前状态下找不到该元素：可能需要先在预览中展开弹窗/菜单');
    }
  }, [showToast]);

  // ---------- 录制控制 ----------
  const startRecording = useCallback(() => {
    setTabRecords([]);
    bridgeRef.current?.startRecording();
    setRecording(true);
    iframeRef.current?.focus();
    showToast('录制开始：现在请在预览区用 Tab / Shift+Tab 移动焦点');
  }, [showToast]);
  const stopRecording = useCallback(() => {
    bridgeRef.current?.stopRecording();
    setRecording(false);
  }, []);

  // ---------- 保存 / 导出 ----------
  const buildReview = useCallback(
    (): ReviewRecord => ({
      id: reviewId,
      caseId: activeCase?.id ?? '',
      caseName: activeCase?.name ?? '',
      startedAt,
      updatedAt: Date.now(),
      issues,
      tabOrder: tabRecords,
      axeScanVersion: scanMeta ? 1 : undefined,
      axeViolationCount: scanMeta?.violations,
      axePassCount: scanMeta?.pass,
      conclusion
    }),
    [reviewId, activeCase, startedAt, issues, tabRecords, scanMeta, conclusion]
  );

  const saveCurrent = useCallback(async () => {
    if (!activeCase) return;
    await saveReview(buildReview());
    showToast('审查记录已保存到本地 IndexedDB');
  }, [activeCase, buildReview, showToast]);

  const [savedReviews, setSavedReviews] = useState<ReviewRecord[]>([]);
  useEffect(() => {
    listReviews().then(setSavedReviews).catch(() => undefined);
  }, [activeCase, issues.length]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>⌨️ 键盘无障碍审查台</h1>
        <span className="sub">React + TypeScript + axe-core · 发版前键盘可达性走查</span>
        <span className="spacer" />
        <span className="local-badge">● 纯本地运行 · 无服务端 · 导入内容禁脚本/禁外网</span>
      </header>

      <div className="layout">
        <CaseSidebar
          builtins={BUILTIN_CASES}
          imported={importedCases}
          activeId={activeCase?.id ?? null}
          reviews={savedReviews}
          onSelect={loadCase}
          onImport={handleImport}
          onDelete={handleDeleteCase}
        />

        <main className="main">
          <div className="toolbar">
            <button className="btn primary" onClick={runScan} disabled={!prepared}>
              🔍 运行 axe 静态检测
            </button>
            <span className="group-label">|</span>
            {!recording ? (
              <button className="btn" onClick={startRecording} disabled={!prepared}>
                <span className="rec-dot" /> 录制真实 Tab
              </button>
            ) : (
              <button className="btn danger" onClick={stopRecording}>
                <span className="rec-dot on" /> 停止录制
              </button>
            )}
            <button className="btn" onClick={probeTabRecords} disabled={tabRecords.length === 0}>
              🧪 从实测记录生成问题
            </button>
            <span className="group-label">|</span>
            <button className="btn" onClick={() => setRightTab('tabtest')} disabled={!prepared}>
              查看键盘面板
            </button>
            <span className="spacer" style={{ flex: 1 }} />
            {activeCase && (
              <span style={{ fontSize: 12, color: '#64748b' }}>
                当前案例：<strong>{activeCase.name}</strong>
              </span>
            )}
          </div>

          <div className="preview-wrap">
            {!prepared ? (
              <div className="preview-empty">
                <div style={{ textAlign: 'center' }}>
                  <p>从左侧选择一个内置可信案例，或导入你自己的 HTML/CSS 案例包</p>
                  <p style={{ fontSize: 12 }}>预览在隔离沙箱 iframe 中渲染：不执行脚本、不访问外网</p>
                </div>
              </div>
            ) : null}
            <iframe
              ref={iframeRef}
              className="preview-frame"
              title="被审查组件的隔离预览"
              sandbox="allow-same-origin"
            />
          </div>
          <FocusStrip focus={focus} />
        </main>

        <section className="right">
          <div className="tabs">
            <button className={rightTab === 'issues' ? 'active' : ''} onClick={() => setRightTab('issues')}>
              问题清单<span className="count">{issues.length}</span>
            </button>
            <button className={rightTab === 'tabtest' ? 'active' : ''} onClick={() => setRightTab('tabtest')}>
              键盘实测<span className="count">{tabRecords.length}</span>
            </button>
            <button className={rightTab === 'isolation' ? 'active' : ''} onClick={() => setRightTab('isolation')}>
              隔离策略
            </button>
          </div>

          <div className="tab-body">
            {rightTab === 'issues' && (
              <>
                {scanMeta && (
                  <div className="scan-meta">
                    axe-core v{scanMeta.engine}：
                    {scanMeta.error ? (
                      <span className="scan-error">扫描异常：{scanMeta.error}</span>
                    ) : (
                      <>
                        <strong className="ok">{scanMeta.pass} 条规则通过</strong> ·{' '}
                        <strong style={{ color: '#dc2626' }}>{scanMeta.violations} 项违规</strong> ·{' '}
                        {scanMeta.incomplete} 项无法判定。
                        <div style={{ marginTop: 4 }}>
                          再次提醒：通过只代表这些规则没发现问题，<strong>不等于完全无障碍</strong>。
                        </div>
                      </>
                    )}
                  </div>
                )}
                <IssuePanel
                  issues={issues}
                  onJump={(i) => jumpToLocator(i.locator)}
                  onStatus={(id, status) => setIssues((p) => p.map((x) => (x.id === id ? { ...x, status } : x)))}
                  onNote={(id, note) => setIssues((p) => p.map((x) => (x.id === id ? { ...x, note } : x)))}
                  onDelete={(id) => setIssues((p) => p.filter((x) => x.id !== id))}
                  onAddManual={startManualAnnotation}
                  picking={picking}
                />
              </>
            )}
            {rightTab === 'tabtest' && (
              <TabTestPanel
                recording={recording}
                records={tabRecords}
                domSequence={domSequence}
                onStart={startRecording}
                onStop={stopRecording}
                onClear={() => setTabRecords([])}
                onJump={jumpToLocator}
              />
            )}
            {rightTab === 'isolation' && <IsolationPanel logs={logs} />}
          </div>

          <div className="tab-footer">
            <button className="btn" onClick={() => setReviewSummaryOpen(true)} disabled={!activeCase}>
              审查结论
            </button>
            <button className="btn" onClick={saveCurrent} disabled={!activeCase}>
              💾 保存记录
            </button>
            <button className="btn" onClick={() => exportJson(buildReview())} disabled={!activeCase}>
              导出 JSON
            </button>
            <button className="btn primary" onClick={() => exportHtml(buildReview())} disabled={!activeCase}>
              导出 HTML 报告
            </button>
          </div>
        </section>
      </div>

      {/* 人工标注弹窗 */}
      {annotationDraft && (
        <div className="modal-mask" onClick={() => setAnnotationDraft(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>人工标注</h2>
            <div className="hint-box">
              定位元素：<code>{annotationDraft.locator.cssPath}</code>
            </div>
            <label>问题标题</label>
            <input
              value={annotationDraft.title}
              onChange={(e) => setAnnotationDraft({ ...annotationDraft, title: e.target.value })}
            />
            <label>详细描述（建议写明复现路径、预期行为、WCAG 条目）</label>
            <textarea
              rows={5}
              value={annotationDraft.description}
              onChange={(e) => setAnnotationDraft({ ...annotationDraft, description: e.target.value })}
            />
            <label>严重级别</label>
            <select
              className="btn"
              value={annotationDraft.severity}
              onChange={(e) =>
                setAnnotationDraft({ ...annotationDraft, severity: e.target.value as Issue['severity'] })
              }
            >
              <option value="critical">critical</option>
              <option value="serious">serious</option>
              <option value="moderate">moderate</option>
              <option value="minor">minor</option>
            </select>
            <div className="modal-actions">
              <button className="btn" onClick={() => setAnnotationDraft(null)}>取消</button>
              <button className="btn primary" onClick={confirmAnnotation}>加入问题清单</button>
            </div>
          </div>
        </div>
      )}

      {/* 审查结论弹窗 */}
      {reviewSummaryOpen && (
        <div className="modal-mask" onClick={() => setReviewSummaryOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>审查结论</h2>
            <div className="hint-box">
              案例：{activeCase?.name}
              <br />
              自动发现 {issues.filter((i) => i.source === 'axe').length} 项 · 实测{' '}
              {issues.filter((i) => i.source === 'probe').length} 项 · 人工标注{' '}
              {issues.filter((i) => i.source === 'manual').length} 项 · 实测 Tab 停留{' '}
              {tabRecords.length} 个
            </div>
            <label>发版结论与遗留风险（会写入导出报告）</label>
            <textarea
              rows={6}
              placeholder="例：弹窗焦点圈禁缺失（serious）必须修复后方可发版；菜单焦点轮廓修复中；其余…"
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => setReviewSummaryOpen(false)}>关闭</button>
              <button
                className="btn primary"
                onClick={async () => {
                  await saveCurrent();
                  setReviewSummaryOpen(false);
                }}
              >
                保存并关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
