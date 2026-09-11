import type { Issue, ReviewRecord } from '../types';

export interface ExportBundle {
  review: ReviewRecord;
  caseName: string;
  exportedAt: string;
  tool: string;
  isolation: string;
  disclaimer: string;
}

export const A11Y_DISCLAIMER =
  '本报告混合了 axe-core 静态规则结果、键盘/遮挡实测结果与人工标注。' +
  '自动检测通过仅说明已覆盖的规则未发现违规，不能证明该组件完全无障碍；' +
  '键盘可操作性、焦点可见性、阅读顺序、语义与认知负担仍需人工审查。';

export function buildExportBundle(review: ReviewRecord): ExportBundle {
  return {
    review,
    caseName: review.caseName,
    exportedAt: new Date().toISOString(),
    tool: '键盘无障碍审查台 v1.0（React + TypeScript + axe-core，纯浏览器本地运行）',
    isolation:
      '导入内容在 sandbox="allow-same-source" 且不含 allow-scripts 的 iframe 中渲染；' +
      '导入前经 HTML/CSS 净化：移除 script/iframe/object/link/meta 等元素、所有 on* 事件属性与可执行属性；' +
      '禁止 javascript:/data: 等协议与任何 http(s) 外链，仅允许包内相对路径本地资源；' +
      '注入 default-src none 的 CSP 作为纵深防御；数据仅存于本地 IndexedDB，无任何服务端通信。',
    disclaimer: A11Y_DISCLAIMER
  };
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJson(review: ReviewRecord): void {
  download(
    `a11y-review-${review.id}.json`,
    JSON.stringify(buildExportBundle(review), null, 2),
    'application/json'
  );
}

const SOURCE_LABEL: Record<Issue['source'], string> = {
  axe: 'axe 静态规则',
  probe: '键盘/实测',
  manual: '人工标注'
};
const STATUS_LABEL: Record<Issue['status'], string> = {
  open: '待处理',
  confirmed: '已确认',
  resolved: '已修复',
  wontfix: '不修复'
};

function esc(s: string | undefined | null): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportHtml(review: ReviewRecord): void {
  const axeCount = review.issues.filter((i) => i.source === 'axe').length;
  const probeCount = review.issues.filter((i) => i.source === 'probe').length;
  const manualCount = review.issues.filter((i) => i.source === 'manual').length;

  const issueRows = review.issues
    .map(
      (i) => `
    <tr>
      <td><span class="sev sev-${i.severity}">${i.severity}</span></td>
      <td>${SOURCE_LABEL[i.source]}</td>
      <td><strong>${esc(i.title)}</strong><br/><span class="muted">${esc(i.description)}</span></td>
      <td><code>${esc(i.locator.cssPath)}</code>${
        i.targetPreview ? `<br/><code class="html">${esc(i.targetPreview)}</code>` : ''
      }</td>
      <td>${STATUS_LABEL[i.status]}</td>
      <td>${esc(i.note || '')}</td>
    </tr>`
    )
    .join('');

  const tabRows = review.tabOrder
    .map(
      (t) => `
    <tr>
      <td>${t.index + 1}</td>
      <td><code>${esc(t.locator.cssPath)}</code></td>
      <td>${esc(t.role)}</td>
      <td>${esc(t.accessibleName) || '<em class="muted">（空）</em>'}</td>
      <td>${t.tabIndex}</td>
      <td>${t.visible ? '是' : '<strong>否</strong>'}</td>
      <td>${t.occluded ? '<strong class="bad">被遮挡</strong>' : '否'}</td>
    </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<title>无障碍审查报告 - ${esc(review.caseName)}</title>
<style>
  body{font-family:system-ui,"Segoe UI",sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;color:#1f2937;line-height:1.55}
  h1{font-size:24px} h2{font-size:18px;margin-top:32px;border-bottom:2px solid #e5e7eb;padding-bottom:6px}
  table{border-collapse:collapse;width:100%;font-size:13px;margin-top:12px}
  th,td{border:1px solid #d1d5db;padding:8px 10px;text-align:left;vertical-align:top}
  th{background:#f3f4f6} code{background:#f3f4f6;padding:1px 5px;border-radius:4px;font-size:12px;word-break:break-all}
  code.html{color:#6d28d9} .muted{color:#6b7280} .bad{color:#dc2626}
  .sev{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;color:#fff}
  .sev-critical{background:#991b1b}.sev-serious{background:#dc2626}.sev-moderate{background:#d97706}.sev-minor{background:#6b7280}
  .disclaimer{background:#fef3c7;border:1px solid #f59e0b;padding:14px 18px;border-radius:8px;margin:20px 0}
  .meta{color:#4b5563;font-size:14px}
</style></head><body>
<h1>键盘无障碍审查报告</h1>
<p class="meta">
  案例：<strong>${esc(review.caseName)}</strong> ·
  开始：${new Date(review.startedAt).toLocaleString()} ·
  更新：${new Date(review.updatedAt).toLocaleString()}
</p>
<div class="disclaimer"><strong>审查范围声明：</strong>${A11Y_DISCLAIMER}</div>
<p class="meta">
  问题统计：axe 静态规则 <strong>${axeCount}</strong> 项 · 键盘/遮挡实测
  <strong>${probeCount}</strong> 项 · 人工标注 <strong>${manualCount}</strong> 项；
  axe 扫描通过规则 ${review.axePassCount ?? '—'} 条，违规 ${review.axeViolationCount ?? '—'} 项。
</p>

<h2>问题清单（含定位信息）</h2>
<table>
  <thead><tr><th>级别</th><th>来源</th><th>问题</th><th>定位</th><th>状态</th><th>备注</th></tr></thead>
  <tbody>${issueRows || '<tr><td colspan="6" class="muted">暂无记录</td></tr>'}</tbody>
</table>

<h2>实测 Tab 顺序</h2>
<table>
  <thead><tr><th>#</th><th>定位</th><th>角色</th><th>可访问名称</th><th>tabindex</th><th>可见</th><th>焦点遮挡</th></tr></thead>
  <tbody>${tabRows || '<tr><td colspan="7" class="muted">未记录（在预览区用真实 Tab 操作后会自动记录）</td></tr>'}</tbody>
</table>

<h2>审查结论</h2>
<p>${esc(review.conclusion) || '<span class="muted">未填写</span>'}</p>

<h2>隔离与安全策略</h2>
<p class="meta">${esc(buildExportBundle(review).isolation)}</p>
</body></html>`;

  download(`a11y-review-${review.id}.html`, html, 'text/html;charset=utf-8');
}
