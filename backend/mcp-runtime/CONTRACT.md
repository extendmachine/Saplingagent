# mcp-runtime 接口契约 v2 · Full Access

2026-10-09；TASK-20261009-011；公开 HTTP 总契约见根 `contracts/runtime-api.md` v2。

传输为官方 SDK MCP stdio / JSON-RPC。入口 `node <项目绝对路径>/backend/mcp-runtime/server.mjs`，不依赖 cwd。stdout 只传协议，日志进入 logs/mcp-runtime。

## 15 个工具

所有 schemas 由真实 tools/list 输出。结果为 JSON 文本与相同 structuredContent；实际操作失败为 isError:true 与 `{error:{code,message}}`。命令非零退出以实际 exitCode 返回，不伪造成功。

| 工具 | 输入 | 下游 | 结果含义 |
| --- | --- | --- | --- |
| workspace_list_files | path? 默认`.`；limit? 1..2000；cursor? 十进制偏移字符串 | GET /files | files、truncated、nextCursor? |
| workspace_read_file | path；encoding? utf8/base64；offset? 非负整数；maxBytes? 1..4194304 | GET /file | content、encoding、hash、size、truncated、nextOffset? |
| workspace_write_file | path、content；encoding? utf8/base64；reason? | POST /files/write | applied、changeId?、warnings?；快照尽力保存 |
| workspace_delete_file | path；reason? | POST /files/delete | applied、changeId?、warnings?；快照尽力保存 |
| workspace_run_command | command；cwd? 默认项目；timeoutMs? 1..3600000 默认60000 | POST /commands | exitCode number/null、stdout、stderr、timedOut、cancelled、输出截断标记 |
| page_propose | reason；files 1..20，path/content/encoding?/expectedHash? | POST /changes | ready、checks:[]、changeId；只记录，不验证或应用 |
| page_apply | changeId | POST /changes/:id/apply | applied；兼容旧 validated/failed 候选 |
| page_rollback | changeId | POST /changes/:id/rollback | rolledBack；主动按原件覆盖后续修改 |
| page_changes | 无 | GET /changes | 实际候选与变更记录 |
| preferences_get | 无 | workspace GET /preferences | 偏好与原文证据 |
| preferences_set | key、JSON value、evidence | workspace POST /preferences | 保存明确长期偏好；一次任务不够 |
| preferences_forget | id | workspace DELETE /preferences/:id | 遗忘指定偏好 |
| skills_list | 无 | 本地 .agents/skills | 发现清单、独立 errors；完全空目录跳过，合法 symlink 可读 |
| skills_read | name | 本地 .agents/skills/name/SKILL.md | name、description、path、content、hash |
| project_context | modification?:boolean | 本地入口与可选记录回调 | files/errors、protected:[]、permissionMode:full-access、taskId?、warnings? |

## 权限与输入预算

允许任何当前 OS 用户可访问路径：项目内外、绝对路径、`../`、符号链接、私密目录、后端、MCP、chat/main 和依赖；不自动获得 root 权限。路径只检查非空、无 NUL、4096 字符内的常规 OS 参数预算。无目录或扩展名保护。

content 最多 16 Mi 字符，候选 files 序列化 JSON 最多 63 MiB，适配下游 64 MiB HTTP 总输入预算。单次更大资料用分段读取或命令处理；超出真实输入预算如实返回。reason 最多 4000 字符，propose 必须非空；value JSON 最多 64 KiB，evidence 最多 8192 字符。command 非空、无 NUL、最多 1 Mi 字符。

expectedHash 为可选 SHA-256 元数据，不参与阻止写入。没有强制 AST/YAML/秘密文本验证或编译。Skills 名称/合法 YAML 只关系 Codex 发现；通用写入不据此拒绝。context/Skill 的一次自动文本读取预算 128 KiB；较大文件可用 workspace_read_file 分页，绝不是保护路径。

project_context 自动读取 AGENTS、FINAL_GOAL、TODO、AI_TASKS、rules/README 和公开运行契约，不自动把真实秘密加入上下文。它声明 editableAreas 可包含 front/chat、main、backend、MCP、Skills、依赖与任意 OS-accessible 文件。

普通 HTTP 等待 15 秒，候选记录最多 180 秒；命令等待为 timeoutMs（默认60秒）+15秒运输余量。写请求超时/断线可能已产生副作用，须检查文件或记录后再决定重试。

MCP call 的 signal 传给 fetch；取消会断开 HTTP，builder 监听中断并终止命令进程组。client 工具超时由协调者配置为3615秒覆盖一小时上限；实际 Agent turn 仍有自身超时与停止机制。取消不能撤销已完成副作用。

## 非阻断任务记录

managed env `SEED_AGENT_MANAGED=1` 时，context modification:true 与八个修改工具（propose/apply/rollback、preferences_set/forget、write/delete/run_command）先尝试 POST agent `/internal/register-task`，5秒请求预算，body `{tool,fingerprint}`。指纹使用公开 toolFingerprint，body 不含原始参数。

内部认证与真实 active MCP item 匹配仍由 agent 执行。成功才给 context taskId；拒绝、超时、无效响应或无法登记时附 `warnings:[{code:'TASK_REGISTRATION_FAILED',cause,message}]` 并继续实际 handler，不伪造 ID。登记不是权限门槛；操作自身错误仍如实失败。普通只读工具/context 不登记，非 managed SDK 开发直连不回调。

## 真实错误与恢复

SDK/schema 无效输入返回错误；NOT_FOUND、INVALID_SKILL、LOCAL_CONFIG、DEPENDENCY_UNAVAILABLE/PROTOCOL/TIMEOUT 等标识实际状态，下游稳定错误码原样透传。消息有上限，内部 token 与 Bearer 被脱敏。日志只有工具名/错误码，不含正文。

当前项目 Codex 使用 danger-full-access、approval never、MCP default_tools_approval_mode approve；不要求逐次人工确认。注解描述工具属性，不改变系统权限或用户任务范围。

候选 ready 不等于已应用或验证；applied 不等于人工体验验收。page_rollback 仅在用户要求时恢复已记录原件，覆盖后续修改，没有自动回退；未记录的原生写、shell、网络与业务数据副作用不承诺全部恢复。MCP/后端源码修改需重启并实际核对工具/服务生效。

直接 write/delete 的快照或元数据失败不阻止目标操作，可能 applied + SNAPSHOT_UNAVAILABLE/RECORD_UNAVAILABLE warning 且无 changeId；原样保留 warning，不编造恢复标识。若同时登记失败，两类 warning 都保留。

TASK023 更名展示元数据：serverInfo.name 保持 seedagent，新增 title 为 Saplingagent；工具名称、schema、协议与权限保持兼容。
