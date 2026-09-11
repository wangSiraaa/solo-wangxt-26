import type { ElementLocator, TabRecord } from '../types';

interface Props {
  recording: boolean;
  records: TabRecord[];
  domSequence: ElementLocator[];
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onJump: (loc: ElementLocator) => void;
}

export function TabTestPanel({ recording, records, domSequence, onStart, onStop, onClear, onJump }: Props) {
  const recordedPaths = new Set(records.map((r) => r.locator.cssPath));
  const reachedButNotExpected: string[] = [];

  return (
    <div>
      <div className="hint-box">
        <strong>如何记录真实 Tab 顺序：</strong>
        <ol>
          <li>{'先在预览区点一下鼠标，让焦点进入隔离 iframe；'}</li>
          <li>{'点击「开始录制」，然后用 '}<kbd>Tab</kbd>{' / '}<kbd>Shift+Tab</kbd>{' 实际移动焦点；'}</li>
          <li>{'每一次真实焦点移动都会按顺序记录，包含可访问名称与遮挡情况。'}</li>
        </ol>
        注意：浏览器安全策略禁止脚本合成 Tab，因此顺序必须由审查员真实按键产生 —— 这正是实测的意义。
      </div>

      <div className="row" style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        {!recording ? (
          <button className="btn primary" onClick={onStart}>
            <span className="rec-dot" /> 开始录制
          </button>
        ) : (
          <button className="btn danger" onClick={onStop}>
            <span className="rec-dot on" /> 停止录制
          </button>
        )}
        <button className="btn" onClick={onClear} disabled={records.length === 0}>
          清空记录
        </button>
        <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>
          {'已记录 '}{records.length}{' 个焦点停留点'}
        </span>
      </div>

      <h3 style={{ fontSize: 13 }}>实际 Tab 顺序（来自真实按键）</h3>
      {records.length === 0 && <div className="hint-box">尚未记录。焦点遮挡、正 tabindex 跳序、空名称等问题会在这里直接暴露。</div>}
      {records.map((r) => (
        <div key={`${r.locator.cssPath}-${r.index}`} className="tabrec">
          <div className="idx">{r.index + 1}</div>
          <div className="info">
            <div>
              {r.accessibleName ? (
                <span className="name">{r.accessibleName}</span>
              ) : (
                <span className="empty-name">（无可访问名称）</span>
              )}
              <span style={{ color: '#64748b', marginLeft: 6 }}>{r.role}</span>
            </div>
            <code>{r.locator.cssPath}</code>
            <div style={{ marginTop: 4 }}>
              {r.occluded && <span className="flag bad">焦点被遮挡</span>}
              {!r.visible && <span className="flag bad">不可见</span>}
              {r.disabled && <span className="flag bad">disabled</span>}
              {r.tabIndex > 0 && <span className="flag ti">tabindex={r.tabIndex}（正序值，打乱自然顺序）</span>}
              <button className="link-btn" style={{ marginLeft: 6 }} onClick={() => onJump(r.locator)}>
                🎯 跳转
              </button>
            </div>
          </div>
        </div>
      ))}

      <h3 style={{ fontSize: 13, marginTop: 18 }}>DOM 中的 Tab 候选序列（静态参考）</h3>
      <div className="hint-box" style={{ fontSize: 11 }}>
        这是按 DOM 顺序（含正 tabindex 重排规则）静态推导出的序列，用于和实际录制结果比对；
        它不代表焦点一定可见或可到达（隐藏容器、遮挡、焦点圈禁等无法静态判断）。
      </div>
      {domSequence.map((loc, i) => (
        <div key={loc.cssPath + i} className="tabrec" style={{ opacity: recordedPaths.has(loc.cssPath) ? 1 : 0.55 }}>
          <div className="idx" style={{ background: '#64748b' }}>{i + 1}</div>
          <div className="info">
            <code>{loc.cssPath}</code>
            <div>
              {recordedPaths.has(loc.cssPath) ? (
                <span className="flag" style={{ background: '#dcfce7', color: '#166534' }}>实测到达</span>
              ) : (
                <span className="flag bad">实测未到达</span>
              )}
              <button className="link-btn" onClick={() => onJump(loc)}>🎯 跳转</button>
            </div>
          </div>
        </div>
      ))}
      {reachedButNotExpected.length > 0 && <div>{reachedButNotExpected.join(', ')}</div>}
    </div>
  );
}
