# 官方依据

- Codex App Server：https://learn.chatgpt.com/docs/app-server ，OpenAI；2026-10-09。线程、事件、取消、模型目录、Skills、MCP标准form确认。公开文档无需登录，实际模型需要账户。
- Codex本机认证：https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server ，OpenAI；2026-10-09。现有本机登录集成；客户商业/托管发行需要另行设计登录。
- MCP环境配置：https://learn.chatgpt.com/docs/config-file/config-reference ，OpenAI；2026-10-09。mcp_servers.<id>.env 显式传递项目根目录、端口和managed标记，已验证本机CLI；不假定继承全部父进程环境。
- 本机CLI0.146.1的 app-server generate-json-schema 生成文件，仅作为实际协议校验，不打包研究缓存。当前thread sandbox枚举danger-full-access，目录实际gpt-5.6-sol/terra/luna；以真实请求验证。
- assistant-ui官方 https://www.assistant-ui.com/docs ，前端依赖详见front REFERENCES及锁文件。

使用OpenAI Docs技能与官方资料，模型/SSE/MCP实际证据见本服务交接，不把文档最新版示例强行当本机兼容能力。

- Full Access与MCP批准配置：https://learn.chatgpt.com/docs/sandboxing 、https://learn.chatgpt.com/docs/extend/mcp?surface=cli 、https://learn.chatgpt.com/docs/config-file/config-reference ，OpenAI；2026-10-09，TASK010。本机CLI0.146.1生成的协议确认ThreadStart/Resume、native accept及permission grant格式；实际运行验证见TASK010。
