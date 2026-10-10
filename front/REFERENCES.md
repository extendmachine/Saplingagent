# front 官方资料

实际依赖来自项目 package-lock 与安装包类型，公开文档可更新；本次接口能力逐项对照 0.15.26/0.14.20 的包类型。以下 TASK-20261009-009 新使用资料于 2026-10-09 实际核对；基础 React/Vite/Lucide 文档继承 TASK-003，版本沿用。

| 名称 | 官方网址 / 域名 | 用途 | 登录/权限 | 实际版本 | 核对与任务 |
| --- | --- | --- | --- | --- | --- |
| assistant-ui external-store | https://www.assistant-ui.com/docs/runtimes/custom/external-store / assistant-ui.com | 真实外部消息、isRunning、onCancel、流更新 | 公开文档无需登录 | @assistant-ui/react 0.15.26 | 2026-10-09 / TASK-009 |
| assistant-ui Composer | https://www.assistant-ui.com/docs/api-reference/primitives/composer / assistant-ui.com | 输入、发送与停止 | 同上 | 同上 | 2026-10-09 / TASK-009 |
| assistant-ui Markdown | https://www.assistant-ui.com/elements/markdown-text / assistant-ui.com | 消息 parts 的 Markdown、smooth 与 defer | 同上 | @assistant-ui/react-markdown 0.14.20 | 2026-10-09 / TASK-009 |
| remark-gfm | https://github.com/remarkjs/remark-gfm/tree/4.0.1 / github.com/remarkjs | MarkdownTextPrimitive的remarkPlugins启用GFM表格/删除线/任务列表 | 公开文档，无账号或权限 | remark-gfm 4.0.1，remark-parse 11.0.0 | 2026-10-09 / TASK019 |
| React | https://react.dev/learn / React | 状态、错误边界与懒加载 | 公开文档 | react/react-dom 19.3.0 | 2026-10-09 / TASK-003，009 复用 |
| Vite | https://vite.dev/guide/ / vite.dev | 本地代理与构建 | 公开文档 | 8.3.4 | 2026-10-09 / TASK-003，009 复用包类型 |
| Lucide | https://lucide.dev/guide/react / lucide.dev | 发送/停止/状态图标 | 公开文档 | 1.54.0 | 2026-10-09 / TASK-003，009 复用 |

Markdown 包 registry 实际 peerDependencies @assistant-ui/react ^0.15.0、React ^18或^19，符合当前安装；npm audit 203 packages，0漏洞。未启用 raw HTML、代码执行或远程图片自动读取。无前端平台账号、密钥或登录入口。
尝试旧 Markdown API 页面未能访问，已改用官方可访问的 elements 地址，未依赖不确定页面内容。官方源码和类型用于最终实际组件签名。
依赖许可证保留在已安装包；种子分发、第三方许可证附件与云端发布不在此任务。

TASK019核对官方remark-gfm 4.0.1 README与已安装@assistant-ui/react-markdown 0.14.20源码/类型/README：MarkdownTextPrimitiveProps继承ReactMarkdown Options，remarkPlugins真实传入解析器；保留defer。官方assistant-ui示例：https://raw.githubusercontent.com/assistant-ui/assistant-ui/main/packages/react-markdown/README.md （公开、无需登录；2026-10-09核对，实际签名以锁定安装包为准）。npm本次审查221包，0漏洞；现有依赖版本未升级。
