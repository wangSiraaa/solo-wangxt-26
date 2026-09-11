import type { PreparedDocument } from '../types';

interface Props {
  logs: PreparedDocument['logs'];
}

export function IsolationPanel({ logs }: Props) {
  const blocks = logs.filter((l) => l.level === 'block').length;
  const rewrites = logs.filter((l) => l.level === 'rewrite').length;
  const allows = logs.filter((l) => l.level === 'allow').length;

  return (
    <div className="isolation">
      <div className="disclaimer">
        导入内容被视为<strong>不可信数据</strong>，以下三层防线在浏览器本地独立生效，任何一层都足以阻止脚本执行。
      </div>

      <h3>① iframe 沙箱（主防线）</h3>
      <div className="sandbox-code">sandbox="allow-same-origin"</div>
      <ul>
        <li><strong>不含</strong> <code>allow-scripts</code>：脚本根本不被创建执行环境；</li>
        <li><strong>不含</strong> <code>allow-forms</code>：表单不会被提交到任何地址；</li>
        <li><strong>不含</strong> <code>allow-popups / allow-top-navigation</code>：不能弹窗、不能跳转父页面；</li>
        <li>保留 <code>allow-same-origin</code> 仅为让审查台读取 DOM 做检测；内容依然是 srcdoc 临时文档，与宿主源不建立任何凭据关系。</li>
      </ul>

      <h3>② 导入前净化（白名单思路）</h3>
      <ul>
        <li>移除 <code>script / iframe / object / embed / applet / frame / link / meta / base</code> 等全部可执行或可外联元素；</li>
        <li>移除所有 <code>on*</code> 行内事件、<code>srcdoc/srcset/ping/formaction</code> 等属性；</li>
        <li>URL 仅允许包内相对路径与页内锚点：阻止 <code>javascript:</code>、<code>data:</code>、<code>vbscript:</code> 及一切 <code>http(s)://</code> 外链；</li>
        <li>CSS 过滤 <code>@import</code>、外部 <code>url()</code>、IE <code>expression()</code>、<code>-moz-binding</code> 等；</li>
        <li>案例包只接受文本类文件（html/css/svg），其余忽略。</li>
      </ul>

      <h3>③ CSP 注入（纵深防御）</h3>
      <div className="sandbox-code">
        default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none';
        style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'
      </div>
      <ul>
        <li>即使前两层被绕过，CSP 仍禁止任何网络与脚本；</li>
        <li>预览内容无网络请求来源，审查台自身也<strong>没有服务端</strong>；数据仅写入本地 IndexedDB。</li>
      </ul>

      <h3>交互与检测如何工作</h3>
      <ul>
        <li>axe-core 与键盘探针运行在<strong>审查台父页面</strong>，只是把 iframe 文档作为只读分析对象，不向 iframe 注入脚本；</li>
        <li>三个内置案例的点击/展开行为由审查台可信代码通过 <code>contentDocument</code> 代理驱动；导入案例不提供该代理，按设计保持静态、无脚本。</li>
      </ul>

      <h3>本次净化日志（{blocks} 拦截 / {rewrites} 改写 / {allows} 放行）</h3>
      {logs.length === 0 && <div className="hint-box">尚未加载导入案例。内置可信案例仅做最小净化。</div>}
      <div style={{ marginTop: 6 }}>
        {logs.map((l, i) => (
          <div key={i} className={`logline ${l.level}`}>
            [{l.level === 'block' ? '拦截' : l.level === 'rewrite' ? '改写' : '放行'}] {l.message}
          </div>
        ))}
      </div>
    </div>
  );
}
