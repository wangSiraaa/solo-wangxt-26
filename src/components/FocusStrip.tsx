import type { FocusSnapshot } from '../types';

interface Props {
  focus: FocusSnapshot | null;
}

export function FocusStrip({ focus }: Props) {
  if (!focus) {
    return (
      <div className="focus-strip">
        <span>🎯 当前焦点：</span>
        <span style={{ color: '#94a3b8' }}>
          点击预览区后用 Tab 移动焦点（建议在预览区内操作，焦点信息实时显示于此）
        </span>
      </div>
    );
  }

  return (
    <div className="focus-strip">
      <span>🎯 当前焦点：</span>
      <code>{focus.locator.cssPath}</code>
      <span>角色：{focus.role}</span>
      <span>
        名称：
        {focus.accessibleName ? (
          <strong style={{ color: '#a7f3d0' }}>{focus.accessibleName}</strong>
        ) : (
          <span className="focus-flag bad">空名称</span>
        )}
      </span>
      <span>
        遮挡：
        {focus.occluded ? (
          <span className="focus-flag bad">焦点被其他元素覆盖</span>
        ) : (
          <span className="focus-flag good">未遮挡</span>
        )}
      </span>
      <span>{focus.visible ? <span className="focus-flag good">可见</span> : <span className="focus-flag bad">不可见</span>}</span>
    </div>
  );
}
