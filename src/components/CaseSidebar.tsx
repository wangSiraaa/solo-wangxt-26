import { useRef, useState } from 'react';
import type { CasePackage, ReviewRecord } from '../types';

interface Props {
  builtins: CasePackage[];
  imported: CasePackage[];
  activeId: string | null;
  reviews: ReviewRecord[];
  onSelect: (c: CasePackage) => void;
  onImport: (files: FileList | File[]) => void;
  onDelete: (id: string) => void;
}

export function CaseSidebar({ builtins, imported, activeId, reviews, onSelect, onImport, onDelete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const countFor = (id: string) => reviews.filter((r) => r.caseId === id).length;

  return (
    <aside className="sidebar">
      <h2>内置可信案例</h2>
      {builtins.map((c) => (
        <CaseCard key={c.id} c={c} active={c.id === activeId} reviews={countFor(c.id)} onSelect={onSelect} />
      ))}

      <h2>导入的案例包</h2>
      <div
        className={`import-box ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) onImport(e.dataTransfer.files);
        }}
      >
        拖入 <strong>ZIP</strong>、多个 HTML/CSS 文件，或选择一个文件夹
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            选择文件 / ZIP
          </button>
          <button className="btn" onClick={() => dirRef.current?.click()}>
            选择文件夹
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".html,.htm,.css,.svg,.zip,application/zip"
          multiple
          hidden
          onChange={(e) => e.target.files && onImport(e.target.files)}
        />
        <input
          ref={dirRef}
          type="file"
          hidden
          // @ts-expect-error 非标准但 Chromium 支持
          webkitdirectory=""
          directory=""
          multiple
          onChange={(e) => e.target.files && onImport(e.target.files)}
        />
        <div style={{ marginTop: 8, lineHeight: 1.5 }}>
          可附 <code>audit-case.json</code>：<br />
          {'{ "name": "...", "description": "..." }'}
        </div>
      </div>

      {imported.length === 0 && <div className="hint-box">尚未导入案例。导入内容不执行脚本、不访问外网。</div>}
      {imported.map((c) => (
        <CaseCard key={c.id} c={c} active={c.id === activeId} reviews={countFor(c.id)} onSelect={onSelect} onDelete={onDelete} />
      ))}
    </aside>
  );
}

function CaseCard({
  c,
  active,
  reviews,
  onSelect,
  onDelete
}: {
  c: CasePackage;
  active: boolean;
  reviews: number;
  onSelect: (c: CasePackage) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className={`case-card ${active ? 'active' : ''}`} onClick={() => onSelect(c)}>
      <div>
        {onDelete && (
          <button
            className="case-del"
            title="删除导入的案例"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`删除案例「${c.name}」？审查记录会保留。`)) onDelete(c.id);
            }}
          >
            ✕
          </button>
        )}
        <div className="name">{c.name}</div>
      </div>
      <div className="desc">{c.description}</div>
      <div className="meta">
        <span className={`tag ${c.origin}`}>{c.origin === 'builtin' ? '内置可信' : '导入'}</span>
        {reviews > 0 && <span className="tag" style={{ background: '#64748b' }}>{reviews} 次审查</span>}
      </div>
    </div>
  );
}
