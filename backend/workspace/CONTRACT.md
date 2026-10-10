# workspace HTTP 契约 v1

2026-10-09，TASK-20261009-007；公共索引 contracts/runtime-api.md。回环4311，除 GET /health 外须内部 Bearer token，来自 local-secrets/runtime/service-token。无 CORS，不供前端直接调用。

| 方法/地址 | 输入 | 成功输出 |
| --- | --- | --- |
| GET /health | 无 | {ready:true,service:'workspace',version} |
| GET /sessions | 无 | {sessions:[{id,title,updatedAt}]}，更新时间倒序 |
| POST /sessions | {title?} | 201 {session} |
| GET /sessions/:id | UUID/安全ID | {session} |
| PATCH /sessions/:id | {threadId?,messages?,title?,running?,activeRequestId?,requests?,expectedRevision?} | {session} |
| GET /preferences | 无 | {preferences} |
| POST /preferences | {key,value,evidence} | 201 {preference} |
| DELETE /preferences/:id | 安全ID | {ok:true} |

session：id,title,threadId:string|null,messages,createdAt,updatedAt,revision,running,activeRequestId:string|null,requests?。
messages：最多10000条，{id,role:'user'|'assistant'|'system'|'tool',text,status?,requestId?}，ID唯一，正文单条最多500000字符，总JSON最多4MiB。
requests：最多500条，{id,status:'inProgress'|'completed'|'failed'|'interrupted',startedAt,completedAt?,error?}，ID唯一，时间须可解析，error最多1000字符。账本用于重试去重，实际重试状态由 agent 决定。
title最多200字符；threadId最多300字符。preference {id,key,value,evidence,createdAt}；key最多256字符，value JSON最多64KiB，evidence必填非空、最多8192字符，最多5000项、总JSON最多4MiB。不自动推断长期偏好。
HTTP请求最大5MiB，头10秒/请求30秒超时。未知补充字段不持久化。

错误 {error:{code,message,requestId}}：400 INVALID_INPUT/INVALID_JSON，401 UNAUTHORIZED，404 NOT_FOUND，409 CONFLICT/UNSAFE_STORAGE，413 PAYLOAD_TOO_LARGE，500 CORRUPT_STORAGE/INTERNAL_ERROR。错误不返回栈或私有路径。
串行修改、读取等待队列、JSON原子替换；可选 expectedRevision 启用乐观并发检查。契约兼容扩展保留已有字段。自检通过，人工及真实agent联调由根协调者记录，非 Git 无待测提交。
