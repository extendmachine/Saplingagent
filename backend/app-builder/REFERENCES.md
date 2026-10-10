# app-builder 官方资料

当前TASK-20261009-012仅使用Node内置模块。2026-10-09已联网核对下列官方页面与用途；在线文档显示v26.11.1，本机隔离测试26.4.0，package声明>=24.11。

| 资料 | 官方链接 / 机构 | 用途 | 登录或权限 | 适用接口/版本 | 最后核对日期 | 任务 |
| --- | --- | --- | --- | --- | --- | --- |
| Node File system | [File system](https://nodejs.org/api/fs.html) / Node.js | 原生读写、copyFile原件、unlink/readlink与字节分页 | 文档无需登录；执行按OS用户 | node:fs/promises，>=24.11 | 2026-10-09 | TASK-20261009-012 |
| Node child_process | [Child process](https://nodejs.org/api/child_process.html) / Node.js | spawn当前用户shell、独立进程组和输出生命周期 | 文档无需登录；执行按OS用户 | node:child_process，>=24.11 | 2026-10-09 | TASK-20261009-012 |
| Node HTTP | [HTTP](https://nodejs.org/api/http.html) / Node.js | loopback、request/response取消与server.close | 文档无需登录；业务Bearer | node:http，>=24.11 | 2026-10-09 | TASK-20261009-012 |

无外部发布平台、模型SDK或第三方解析包依赖。旧TASK008的TypeScript/Vite/Babel/css-tree/yaml校验决定保留历史交接，当前已移除强制构建、引用与Skill frontmatter检查；历史资料不代表当前执行限制。公开集成来源由MCP/agent-runtime独立服务维护。
