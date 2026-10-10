# AI 项目启动入口

@rules/README.md

开始任何开发、修改、提交、测试、部署或文档任务前，必须先完整读取 `rules/README.md`，再按其中的任务路由读取对应规则文件。

首次实质性修改前必须按 `rules/README.md` 给出“规范读取回执”；结束任务或提交前必须给出“结束复核回执”。

回执是结果告知；只读任务、最小登记和初始化缺失文件的处理，统一按 `rules/README.md` 执行。

同时必须读取：

1. `FINAL_GOAL.md`
2. `TODO.md`
3. `AI_TASKS.md`
4. 当前微服务目录内与任务相关的 Markdown 文件

并行任务还须按规则 14 定位权威任务索引，不能把当前 Worktree 的状态快照当成实时认领记录。

`rules/README.md` 是项目公共控制规范和规则索引的唯一来源。不得把完整公共规则复制回本文件。

## 项目专用补充

Codex、Claude Code 或其他 AI 可以在本节维护项目专用的简短入口提示，但不得删除上方的 `@rules/README.md`、必读文件列表或改变公共规则优先级。详细规则必须写入 `rules/`，项目进度必须写入 `TODO.md` 或 `AI_TASKS.md`。

- 本项目为 SeedAgent；已实现本地Agent、workspace、app-builder、MCP与Skills，保留单页对话。实际验证与限制读取 FINAL_GOAL.md、TODO.md、AI_TASKS.md；启动 `node scripts/dev.mjs`。
- 用户指定实际源码位置：前端 front/、后端 backend/、人类文档 docs/；services/ 仅作服务索引。公共规则中的 services/ 路径示例按实际 backend/ 路径应用。
- 2026-10-09 用户选择Full Access：整个应用（含front/chat/main、backend、MCP、Skills、依赖和配置）均可对话修改，无MCP文件保护或强制编译/逐次确认；按当前OS用户权限执行。恢复仅由用户主动请求，见backend/app-builder/。
- agent-runtime仅在实际变更前通过MCP登记根AI_TASKS运行期区块，详细记录归该服务ai-tasks/runtime；任务登记为非阻断记录。旧TASK005至009中的白名单说明已被TASK010至013取代；运行期对话轮完成不代表人工验收。


- TASK014：用户授权将当前代码存入testcode，并将经确认的原始版本存入main。本地Git已初始化，main已确认采用单聊天基线，来源以TODO/AI_TASKS的精确恢复记录为准；不将当前代码或猜测重建冒充原始版本。
