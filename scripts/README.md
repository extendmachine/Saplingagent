# 本地启动与macOS源包交付

TASK-20261009-015已实现macOS13.5+的四个.command入口、项目内Node/Codex安装、用户自登录、就绪启动与诊断。接收者步骤见 docs/macos-install.html；AI维护契约与官方来源见 scripts/macos/README.md。

当前已实现统一入口 `node scripts/dev.mjs`，从脚本位置定位应用根目录，运行 workspace4311、app-builder4312、agent4310和单页前端5173；不依赖开发者绝对路径。Ctrl+C停止本次创建的服务，端口占用时明确失败，不杀其他进程。

环境：Node >=24.11、npm、官方Codex CLI（本机验证0.146.1）。首次新目录执行 `node scripts/install.mjs`，使用项目锁文件在front、app-builder、mcp-runtime各自安装，禁用依赖生命周期脚本；不安装全局运行时。启动前 `setup.mjs` 创建内部令牌，并在项目尚无auth时从本机已有Codex登录复制认证文件到local-secrets/codex；不覆盖既有项目auth或全局配置。无登录时 `node scripts/login.mjs` 进行本项目登录，之后重启服务。登录凭据不随客户种子分发。

规则以应用内 rules/ 和 AGENTS/CLAUDE 为准，启动不覆盖源码、真实数据或rules。配置在 config/runtime.json；接口和边界见 docs/runtime.html。本次macOS交付沿用main单聊天起点，见新增脚本；单文件自解包及Windows/Linux仍未实施。

## 后续分发规划

macOS干净源包打包脚本 scripts/package-macos.mjs 已实现；在线种子创建器和单文件入口尚未交付。
后续启动入口负责定位当前应用目录、读取固定版本种子资料、校验和展开规则及入口、初始化新应用状态、在本目录准备依赖、选择可用端口、启动本地服务并打开网页。
重复运行同一目录时继续已有应用，不覆盖业务源码、数据、已填写总账或规则；更新走独立候选版本流程。
新功能默认在现有应用中创建 front/features/ 与 backend/features/ 下同名模块；独立新应用则在新文件夹初始化自己的全部资料。启动器应区分两种操作。

## 分发方式

当前无云端时，建议离线种子压缩包带启动入口、种子源码、完整 rules、AGENTS/CLAUDE、初始化状态结构、依赖锁文件和许可证。
用户坚持复制单文件时可后续制作内嵌种子资料与 rules 的自解包入口，文件会更大；很小的在线引导脚本需要可用的固定版本下载源。
本地源码与资料不等于已携带 Node、模型或所有平台依赖；需在交付前确定平台、运行时预置或随附策略。模型可使用远程适配器，密钥本地另配。
不要内嵌已填写local-secrets、真实日志、会话或开发者任务授权；macOS打包重建接收者的目标/进度/任务初始记录，保留源码提交来源。rules原样随包，不在启动时无声更新。
