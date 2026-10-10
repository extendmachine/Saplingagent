# Agent任务与运行期登记

最新全权限交接TASK-20261009-010.md；历史开发交接TASK-20261009-005.md；根AI_TASKS/TODO为本项目权威索引。实际变更请求在MCP执行前由tasks.mjs登记RUN-<requestId>；普通聊天/只读调研仅保存会话，不更新项目任务索引。已登记任务保存范围、来源引用和真实轮状态；详情在runtime/。只更新根AI_TASKS已标记的运行期区块，不让模型写规则/索引。

runtime记录不复制聊天正文；completed表示对话轮结束，不能代替页面实际应用、业务验收或发布。非Git，无分支/提交/main同步。

运行期MCP在受控变更前调用Agent内部POST /internal/register-task，Bearer认证且绑定当前App Server MCP item指纹。修改前project_context({modification:true})返回taskId；只读不登记；回调失败不阻断操作。
