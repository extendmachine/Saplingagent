# macOS 本地安装入口

TASK-20261009-015，项目级启动/分发工具，不增加新的业务服务。人类指南：../../docs/macos-install.html。

- 系统：macOS 13.5+；按当前运行架构选择 arm64/x64，Rosetta 下使用对应 x64 运行时。
- 固定版本：config/macos.json 的 Node 24.21.0 / Codex CLI 0.146.1；Node 安装到 .runtime/node-v<version>-darwin-<arch>，Codex 到 .runtime/codex，npm 缓存 .cache/npm。
- 根入口：1-安装.command、2-登录Codex.command、3-启动SeedAgent.command、4-诊断.command；所有路径从脚本位置计算，不保存开发者绝对路径。
- bootstrap.sh：只在 install 下载 Node，HTTPS 获取官方发行包与 SHA-256 表，校验、解压和执行版本检查后提升；失败清理自身 stage/lock。其它操作缺 Node 时明确要求先安装。
- cli.mjs：项目锁；Codex staging 与真实版本检查后提升，恢复受控入口和wrapper的0755执行位；全部业务 npm ci 成功才写 .runtime/macos-install.json。已完整且版本相同时跳过下载，显式--repair重装。staging失败保留完整旧安装标记，业务npm ci前清除旧标记，部分安装失败不会误报已完成；保留源码、认证和业务数据。
- 认证：macOS入口 setup(importExistingAuth:false)，env SEED_IMPORT_EXISTING_AUTH=0；不导入全局 auth。项目目录700，token/auth文件600；真实值只在 local-secrets。新目录总账包含schema_version/project/credentials，runtime只登记文件引用，保留既有总账字段，移动后更新自身根目录。macOS子进程移除继承的OPENAI_API_KEY/CODEX_API_KEY/CODEX_ACCESS_TOKEN，避免意外复用其他项目的API认证。
- codex.sh：始终用项目 Node 与官方 npm wrapper、项目 CODEX_HOME，并覆盖 cli_auth_credentials_store=file；App Server 不受已有 config.toml 中其他认证存储方式影响。
- login/status 使用相同文件认证；未登录与配置/架构错误分别反馈。默认官方浏览器OAuth，用户可显式 --device-auth；取消/失败不标成功。不测试或发起真实用户浏览器登录。
- start：先检查依赖标记与登录状态，再创建本次 dev 子进程；只有本次 launcher 发出启动标记后才读取端口状态，防止已有其它项目被误认为本次就绪。等待网页及账号/模型/MCP，120秒超时停止本次服务。没有自动付费模型探测。
- stop：SIGINT/SIGTERM/SIGHUP 转发到本次子进程；不按进程名称或端口杀他人。Agent的自身AppServer组清理由TASK016处理。
- doctor：只打印版本、依赖、登录布尔和配置端口元数据，退出码0代表本地安装与已存登录均通过；未启动本身不算故障，运行/额度另判断。缺Node时不下载。不会回显原始认证状态或错误输出。
- logout：显式退出本项目认证；会话及源码保留。

原有 node scripts/dev.mjs 等开发入口保留；setup 默认导入行为仅在明确macOS env为0时关闭，不改变已有开发应用行为。源码、锁文件或架构变更后需停止应用并重装。强制结束安装可能留下锁，确认没有本项目安装进程后再按人类指南移除。

## 打包契约

`node scripts/package-macos.mjs [ref=HEAD] [outputDir=.cache/releases]` 仅macOS，有Git时按可解析的明确提交取文件，不将工作树未提交变更夹入。白名单包含业务源码、公共契约/config/scripts/docs、入口与状态文件、完整rules和项目Skills；排除secret/data/log/snapshots/cache/worktrees/dependencies/运行期任务资料等。拒绝候选源文件symlink和不完整rules。Git archive逐文件核对blob；接收者FINAL_GOAL/TODO/AI_TASKS重新初始化，AGENTS只调整合法项目补充，manifest标注initializedForRecipient，不继承开发者任务和批准；zip保留执行位，delivery.json列sourceCommit、运行版本和逐文件SHA256，旁边提供ZIP SHA256。解压/安装不依赖Git；后续重新打包需要用户自己的本地仓库及提交。此包是macOS源代码交付，不是Clawtask业务导入包；rules附件原样随公共规范分发，未执行其打包能力。

## 官方来源（核对2026-10-09）

- https://learn.chatgpt.com/docs/codex/cli ：官方CLI与npm安装方式；实际npm package metadata https://registry.npmjs.org/@openai/codex/0.146.1 核对bin、固定native optional packages及无install脚本。
- https://learn.chatgpt.com/docs/app-server ：stdio初始化/账号/模型/MCP/turn；本机开发及开源认证边界，商业/托管需另行SIWC。
- https://learn.chatgpt.com/docs/auth ：file凭据、CODEX_HOME、login status与device-auth；不代表额度可用。
- https://learn.chatgpt.com/docs/config-file/environment-variables ：项目CODEX_HOME；不改全局配置。
- https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server ：商业发行后续的正式登录接入，不假定本包已注册clientId。
- https://nodejs.org/en/blog/release/v24.21.0 与 https://nodejs.org/dist/v24.21.0/SHASUMS256.txt ：官方固定LTS及两种Mac归档SHA256。精确产物Mach-O minOS两架构为13.5；这是二进制下限，Intel真机用户流程另测。

无需独立端口、数据库或新增生产依赖。服务日志沿用logs/<service>/，安装/npm诊断仅在终端与项目.cache/npm，真实认证和源码内容不写入普通日志。外部上线、商业登录注册、原生签名/公证和云端未实现。
