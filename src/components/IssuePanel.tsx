import { useState } from 'react';
import type { Issue } from '../types';

interface Props {
  issues: Issue[];
  onJump: (issue: Issue) => void;
  onStatus: (id: string, status: Issue['status']) => void;
  onNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onAddManual: () => void;
  picking: boolean;
}

const SOURCE_TEXT = { axe: 'axe 静态规则', probe: '键盘/实测', manual: '人工标注' };
const STATUS_TEXT: Record<Issue['status'], string> = {
  open: '待处理',
  confirmed: '已确认',
  resolved: '已修复',
  wontfix: '不修复'
};

export function IssuePanel({ issues, onJump, onStatus, onNote, onDelete, onAddManual, picking }: Props) {
  const [filter, setFilter] = useState<'all' | Issue['source']>('all');
  const shown = issues.filter((i) => filter === 'all' || i.source === filter);

  return (
    <div>
      <div className="disclaimer">
        {'⚠️ axe 静态检测通过 ≠ 组件完全无障碍。键盘顺序、焦点遮挡、焦点可见性、阅读顺序与语义合理性必须结合实际 Tab 操作和人工判断；请在「键盘实测」页记录真实顺序，并对自动结果逐条复核。'}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <button className={`btn ${filter === 'all' ? 'primary' : ''}`} onClick={() => setFilter('all')}>
          全部 {issues.length}
        </button>
        <button className={`btn ${filter === 'axe' ? 'primary' : ''}`} onClick={() => setFilter('axe')}>
          {'自动 '}{issues.filter((i) => i.source === 'axe').length}
        </button>
        <button className={`btn ${filter === 'probe' ? 'primary' : ''}`} onClick={() => setFilter('probe')}>
          {'实测 '}{issues.filter((i) => i.source === 'probe').length}
        </button>
        <button className={`btn ${filter === 'manual' ? 'primary' : ''}`} onClick={() => setFilter('manual')}>
          {'人工 '}{issues.filter((i) => i.source === 'manual').length}
        </button>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={onAddManual} disabled={picking}>
          {picking ? '请在预览中点选元素…' : '＋ 人工标注元素'}
        </button>
      </div>

      {shown.length === 0 && <div className="hint-box">暂无问题。运行 axe 静态检测、进行 Tab 实测，或点「人工标注元素」。</div>}

      {shown.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          onJump={() => onJump(issue)}
          onStatus={onStatus}
          onNote={onNote}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function IssueCard({
  issue,
  onJump,
  onStatus,
  onNote,
  onDelete
}: {
  issue: Issue;
  onJump: () => void;
  onStatus: Props['onStatus'];
  onNote: Props['onNote'];
  onDelete: Props['onDelete'];
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="issue">
      <div className="top">
        <span className={`badge ${issue.source}`}>{SOURCE_TEXT[issue.source]}</span>
        <span className={`badge ${issue.severity}`}>{issue.severity}</span>
        {issue.status !== 'open' && <span className="badge status">{STATUS_TEXT[issue.status]}</span>}
        <span className="title" style={{ marginLeft: 4 }}>{issue.title}</span>
      </div>
      <div className="desc">{issue.description}</div>
      {issue.wcag && <div className="desc">📋 {issue.wcag}{issue.ruleId ? ` · ${issue.ruleId}` : ''}</div>}
      <code>{issue.locator.cssPath}</code>
      <div className="row">
        <button className="link-btn" onClick={onJump}>
          🎯 跳转到元素
        </button>
        <button className="link-btn" onClick={() => setEditing((v) => !v)}>
          {editing ? '收起' : '备注/状态'}
        </button>
        <select
          className="btn"
          style={{ marginLeft: 'auto', padding: '2px 4px' }}
          value={issue.status}
          onChange={(e) => onStatus(issue.id, e.target.value as Issue['status'])}
        >
          {Object.entries(STATUS_TEXT).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {issue.source === 'manual' && (
          <button className="link-btn danger" onClick={() => onDelete(issue.id)}>
            删除
          </button>
        )}
      </div>
      {editing && (
        <textarea
          rows={2}
          placeholder="审查备注：复核结论、复现路径、修复建议…"
          defaultValue={issue.note || ''}
          onBlur={(e) => onNote(issue.id, e.target.value)}
        />
      )}
    </div>
  );
}
