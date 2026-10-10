# 官方依据

- Codex App Server：https://learn.chatgpt.com/docs/app-server ，OpenAI；2026-10-09。线程、事件、取消、模型目录、Skills、MCP标准form确认。公开文档无需登录，实际模型需要账户。
- Codex本机认证：https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server ，OpenAI；2026-10-09。现有本机登录集成；客户商业/托管发行需要另行设计登录。
- MCP环境配置：https://learn.chatgpt.com/docs/config-file/config-reference ，OpenAI；2026-10-09。mcp_servers.<id>.env 显式传递项目根目录、端口和managed标记，已验证本机CLI；不假定继承全部父进程环境。
- 本机CLI0.146.1的 app-server generate-json-schema 生成文件，仅作为实际协议校验，不打包研究缓存。当前thread sandbox枚举danger-full-access，目录实际gpt-5.6-sol/terra/luna；以真实请求验证。
- assistant-ui官方 https://www.assistant-ui.com/docs ，前端依赖详见front REFERENCES及锁文件。

使用OpenAI Docs技能与官方资料，模型/SSE/MCP实际证据见本服务交接，不把文档最新版示例强行当本机兼容能力。

- Full Access与MCP批准配置：https://learn.chatgpt.com/docs/sandboxing 、https://learn.chatgpt.com/docs/extend/mcp?surface=cli 、https://learn.chatgpt.com/docs/config-file/config-reference ，OpenAI；2026-10-09，TASK010。本机CLI0.146.1生成的协议确认ThreadStart/Resume、native accept及permission grant格式；实际运行验证见TASK010。

- TASK015（2026-10-09）：CLI安装 https://learn.chatgpt.com/docs/codex/cli ；凭据file/设备码及认证 https://learn.chatgpt.com/docs/auth ；CODEX_HOME https://learn.chatgpt.com/docs/config-file/environment-variables 。当前客户本机开发/开源流程使用独立stdio AppServer和自己的项目认证；官方AppServer Auth endpoints明确商业/托管需要Sign in with ChatGPT，尚未实现clientId注册。固定npm0.146.1 package metadata与Node24.21 LTS资料、macOS13.5最低版本依据见../../scripts/macos/README.md。公开资料无需登录，实际OAuth需用户账号。

## TASK022 认证与计费核对

| 资料 | 官方网址 / 机构 | 用途 | 登录/权限 | 适用版本 | 核对日期 / 任务 |
| --- | --- | --- | --- | --- | --- |
| Codex auth | https://learn.chatgpt.com/docs/auth / OpenAI | 本人ChatGPT认证按套餐权益；API key独立按量计费 | 文档公开，实际调用需本人认证及额度 | 当前文档；本项目CLI0.146.1 | 2026-10-09 / TASK022 |
| Codex pricing | https://learn.chatgpt.com/docs/pricing / OpenAI | 套餐与用量；Free/Go桌面灰度不能保证本项目可免费调用 | 文档公开，实际资格以账号/模型请求为准 | 当前套餐文档 | 2026-10-09 / TASK022 |
| App Server auth | https://learn.chatgpt.com/docs/app-server / OpenAI | 现有本地/开源认证及商业/托管边界 | 文档公开，商业/托管须正式SIWC | 当前文档，现有本地客户端 | 2026-10-09 / TASK022 |
| SIWC Quickstart | https://developers.openai.com/siwc/quickstart / OpenAI | 新参与应用套餐资格及商业伙伴范围 | 文档公开，参与应用需注册；套餐资格/伙伴范围受限 | SIWC当前流程，项目尚未实现 | 2026-10-09 / TASK022 |

App Server本地开源组件无需单独购买；模型调用需用户认证及额度。Mac入口当前为官方ChatGPT登录，未提供API key登录入口，也不做真实模型收费探测。
