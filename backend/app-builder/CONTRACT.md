# app-builder HTTP 契约 v2 · Full Access

2026-10-09；TASK-20261009-012；公共索引 ../../contracts/runtime-api.md。默认回环4312，除GET /health均须内部Bearer。上游MCP/agent-runtime，执行接口为原生文件系统与当前用户shell；无跨服务私有导入。

| 方法/地址 | 输入 | 输出 |
| --- | --- | --- |
| GET /health | 无 | {ready:true,service:'app-builder',version:'0.2.0',permissions:'os-user-full-access'} |
| GET /files | path默认.；limit默认200，1..2000；cursor非负十进制偏移字符串 | {files:[{path,absolutePath,size,type,writable:true}],total,truncated,nextCursor?} |
| GET /file | path；encoding utf8/base64；offset默认0；maxBytes默认1MiB，1..4MiB | {path,absolutePath,content,encoding,hash,hashScope,size,offset,returnedBytes,truncated,nextOffset?} |
| GET /changes | 无 | {changes}创建时间倒序；坏记录可显示unreadable |
| POST /files/write | {path,content,encoding?:utf8/base64,reason?} | 200 {changeId?,status:'applied',files,checks:[],warnings?,...} |
| POST /files/write-checked | {path,content,expectedHash,encoding?:utf8/base64,reason?} | 200同直写；仅在当前普通文件完整SHA256仍等于expectedHash时原子替换，冲突409 FILE_CHANGED |
| POST /files/delete | {path,reason?} | 200 {changeId?,status:'applied',files,checks:[],warnings?,...} |
| POST /commands | {command,cwd?,timeoutMs?} | 200 {exitCode,stdout,stderr,timedOut,cancelled,stdoutTruncated,stderrTruncated,warnings?} |
| POST /changes | {reason,files:[{path,content,expectedHash?,encoding?}]} | 201 {changeId,status:'ready',reason,createdAt,updatedAt,files,checks:[],warnings?,error?} |
| POST /changes/:id/apply | 无业务输入 | 200 {changeId,status:'applied',...} |
| POST /changes/:id/rollback | 无业务输入 | 200 {changeId,status:'rolledBack',...} |

## 文件与容量

path非空无NUL，绝对、../、dot目录、symlink及任意扩展名支持。没有backend/chat/main/package/rules/local-secrets/node_modules/dist保护，不检查内容。content字符串按encoding转字节；reason最多4000字符，候选必填非空、直写/删可省略。HTTP JSON总接收预算64MiB；分页/输出容量控制不是文件权限策略。

目录列表为指定目录单层列表，可继续列其子目录。type为file/directory/symlink/other；writable:true表示无应用层门槛，不替代OS权限。hash为SHA256：完整文件hashScope:'file'，分页为'returnedBytes'；offset/nextOffset以字节计，utf8可在字符边界之外分页，二进制可用base64。

直写/删除尽力保存原件；记录失败仍执行目标并返回applied及SNAPSHOT_UNAVAILABLE或RECORD_UNAVAILABLE warning，未确认可用记录时省略changeId。单个原件备份失败明确originalSnapshot:false/backupError及BACKUP_UNAVAILABLE，不能承诺恢复；目标写入不被其阻止。目录删除的原生unlink错误如实返回，目录操作可用shell。日志失败成功结果附LOG_UNAVAILABLE。write-checked专供浏览器文本编辑器避免覆盖外部修改：要求完整文件hash、拒绝symlink/目录/文件消失，并在同目录临时文件后原子替换；它不改变其他Full Access写接口忽略expectedHash的行为。

## 可选候选与主动恢复

候选不复制完整前端、不编译、不做AST/YAML/秘密文本验证；expectedHash接受但忽略。ready/checks:[]只表示资料已记录；同内容也可记录，没有NO_CHANGES。

apply可使用ready、旧validated/failed及其他可读历史状态，状态不构成写保护。逐文件写入，失败返回真实错误且保留已完成更改，没有自动回退。记录队列不保护目标免受其他工具覆盖。

rollback仅用户主动请求，按原件恢复、删除原先不存在的新文件、恢复记录的symlink，不比较当前hash，可以覆盖后续编辑。旧格式兼容；启动不自动恢复applying/failed/rollingBack。原件未保存或快照丢失如实报错，不伪造恢复结果。shell、网络和Codex原生操作不承诺回退。

## 命令与停止

command非空无NUL，交给当前用户shell -lc；cwd默认项目根，接受相对/绝对。timeoutMs默认60000，1..3600000；无命令白名单或root提权。stdout/stderr各1MiB并分别标截断；exitCode真实，信号终止可为null。

超时timedOut:true/cancelled:false；HTTP连接断开/取消或服务关闭cancelled:true/timedOut:false，只结束本次进程组。停止不撤销已发生副作用。MCP传输上限由调用方按公开契约对齐3615秒，聊天轮超时仍可能提前取消。

## 错误与兼容

错误{error:{code,message,requestId}}：400 INVALID_INPUT/INVALID_JSON/UNSUPPORTED_SYMLINK及真实EISDIR/EINVAL/ENAMETOOLONG；401 UNAUTHORIZED；404 NOT_FOUND及真实ENOENT/ENOTDIR；409 FILE_CHANGED（仅write-checked）；403真实EACCES/EPERM/EROFS；413 PAYLOAD_TOO_LARGE；500 CORRUPT_SNAPSHOT/BACKUP_UNAVAILABLE或其他实际执行/存储错误。不再返回保护路径、秘密文本、编译或权限审批错误。

HTTP请求头10秒、接收150秒属于接收阶段，命令由timeoutMs控制。日志仅元数据，不落请求正文/命令输出/栈。TASK008旧嵌套快照与状态保留，checks/hash只是历史信息，当前checks:[]；v2替代白名单与自动恢复。真实模型联调完成，人工体验未确认；根TASK010汇总，非Git无提交。
