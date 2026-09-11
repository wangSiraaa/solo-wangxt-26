# ⌨️ 键盘无障碍审查台（Keyboard A11y Audit Console）

发版前对组件做**键盘可达性走查**的纯浏览器工具：React + TypeScript + axe-core，**无服务端、无任何网络依赖**。审查员可以切换内置可信案例、导入受限的 HTML/CSS 案例包，在隔离的预览 iframe 中完成「静态规则检测 + 真实键盘实测 + 人工标注」，并导出带元素定位信息的报告。

## 快速开始

```bash
npm install
npm run dev        # 打开 http://localhost:5173
npm test:smoke     # 逻辑冒烟测试（净化 / 检查 / axe / 报告，jsdom）
npm run build      # 类型检查 + 生产构建（产物可直接静态托管）
```

## 工作流（建议）

1. **选案例**：左侧选择三个内置案例之一，或把 ZIP / 文件夹 / HTML+CSS 文件拖入导入区（可选 `audit-case.json` 清单，见 `examples/custom-dropdown/`）。
2. **跑静态检测**：工具栏「运行 axe 静态检测」，结果出现在右侧「问题清单」，标记为紫色 `axe 静态规则` 徽标。
3. **真实键盘实测**：
   - 鼠标先点一下预览区让焦点进入 iframe；
   - 点「录制真实 Tab」，用 <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> 实际移动焦点；
   - 每次真实焦点停留都会记录：定位、角色、**可访问名称**、tabindex、可见性、**是否被遮挡**；
   - 点「从实测记录生成问题」，把遮挡、空名称、正 tabindex 跳序、`outline:none` 等键盘问题转为可跟踪项（青色 `键盘/实测` 徽标）。
   - 「键盘实测」页同时给出 DOM 静态候选序列，与实测到达情况对比（未到达项会被标灰）。
4. **人工标注**：「＋ 人工标注元素」后在预览中点选元素（<kbd>Esc</kbd> 取消），填写标题/描述/级别 —— 灰色 `人工标注` 徽标，与自动发现结果**永远分开统计**。
5. **跳转复核**：任何问题卡上的「🎯 跳转到元素」会滚动、聚焦并用红框高亮 iframe 内对应元素。
6. **写结论并导出**：底部「审查结论」记录发版意见；导出 **JSON**（供流水线归档）或 **HTML 报告**（含定位 CSS 路径、outerHTML 摘要、实测 Tab 表、隔离策略与免责声明）。记录可随时「保存记录」到本地 IndexedDB。

## ⚠️ 自动检测通过 ≠ 完全无障碍

axe 只覆盖它能静态判定的规则子集。**焦点圈禁、Tab 顺序、焦点遮挡、焦点可见性、阅读顺序、语义合理性、认知负担**都必须靠真实键盘操作与人工判断。因此：

- 界面在扫描结果旁常驻醒目提示，报告头部固定印有免责声明；
- 每个问题都标注三类来源之一：`axe 静态规则` / `键盘/实测` / `人工标注`，统计分列；
- axe 的 `incomplete`（无法判定）数量同样展示，不允许被忽略。

## 三个内置可信案例（均含「自动能发现」与「必须实测/人工」两类问题）

| 案例 | 植入问题举例 |
| --- | --- |
| ① 弹窗（对话框） | 缺 `role=dialog`/名称；背景无焦点圈禁，Tab 逃逸；关闭按钮名称是「更多选项」；正 `tabindex` 打乱顺序；装饰条遮挡关闭按钮焦点 |
| ② 折叠菜单 | 图标按钮空名称；`div` 伪按钮键盘不可操作；`outline:none` 抹掉焦点环；菜单项 `tabindex=5` 跳序 |
| ③ 表单错误 | 输入框无标签（仅 placeholder / 完全无名）；错误信息未用 `aria-describedby` 关联；提交失败不移动焦点；错误文字对比度约 1.6:1 |

内置案例的点击/展开行为由**审查台自身可信代码**通过 `contentDocument` 代理驱动（iframe 仍无脚本权限）；导入案例不提供该代理，按设计保持静态。

## 隔离策略（导入内容 = 不可信数据，三层独立防线）

1. **iframe 沙箱（主防线）**：`<iframe sandbox="allow-same-origin">`
   - 不含 `allow-scripts`：没有脚本执行环境；
   - 不含 `allow-forms / allow-popups / allow-top-navigation`：不能提交、弹窗、跳转父页；
   - 保留 `allow-same-origin` 仅为让审查台读取 DOM 做分析，内容是 srcdoc 临时文档，不建立凭据/存储关系。
2. **导入前净化**（`src/lib/sanitize.ts`，界面「隔离策略」页可见逐条日志）
   - 移除 `script/iframe/object/embed/applet/frame/link/meta/base`；
   - 移除所有 `on*` 事件与 `srcdoc/srcset/ping/formaction` 等属性；
   - URL 只放行包内相对路径与页内锚点；阻止 `javascript:/data:/vbscript:` 及一切 `http(s)://` 外链；
   - CSS 过滤 `@import`、外部 `url()`、IE `expression()`、`-moz-binding/behavior`；
   - 只接收文本类文件（html/css/svg），二进制忽略。
3. **CSP 注入（纵深防御）**：
   `default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'`

数据只存在浏览器本地 **IndexedDB**（案例包 + 审查记录），清除站点数据即可完全擦除。axe-core 与探针运行在父页面，仅把 iframe 文档当只读分析对象。

## 目录结构

```
src/
  lib/
    inspect.ts           # 定位器 / AccName / 角色 / Tab 序列 / 遮挡检测
    sanitize.ts          # HTML+CSS 净化器与 CSP 注入
    previewBridge.ts     # 沙箱 iframe、焦点/Tab 监听、高亮跳转、扫描
    axe.ts               # axe-core 跨文档分析封装
    builtinCases.ts      # 三个内置可信案例
    builtinController.ts # 内置案例的可信父页交互代理
    importer.ts          # ZIP / 文件夹 / 多文件导入（JSZip）
    storage.ts           # IndexedDB：案例与审查记录
    report.ts            # JSON / HTML 报告导出（含免责声明）
  components/            # 左栏、问题面板、键盘面板、隔离面板、焦点栏
scripts/smoke.ts         # 36 项冒烟断言
examples/custom-dropdown # 可直接导入的第三方样例包
```

## 已知边界（如实声明）

- 浏览器禁止脚本合成 <kbd>Tab</kbd>，所以真实 Tab 顺序必须由审查员按键产生 —— 这是设计使然，也是「实测」的意义；工具同时提供 DOM 静态候选序列供比对。
- 遮挡检测基于五点采样 + `elementFromPoint`，对全覆盖的透明层会按浏览器返回结果判定；复杂堆叠请以人工复核为准。
- 内置 AccName 计算是 W3C 规范的常用子集（aria-labelledby/aria-label、label、alt、内容文本、title），极端案例以屏幕阅读器实测为准。
