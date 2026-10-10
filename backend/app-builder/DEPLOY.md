# app-builder 本地运行与手动恢复

## 环境和启停

backend/app-builder/，Node >=24.11，本机测试26.4.0；仅内置模块。服务目录npm ci/npm start，或根node backend/app-builder/server.mjs；文件工具不要求前端编译器或全局npm依赖。

SEED_ROOT可指定应用根，默认模块相对推导；SEED_BUILDER_PORT默认4312，固定127.0.0.1。内部凭据local-secrets/runtime/service-token由根启动器准备，服务启动读取，不写真实值到文档或日志。当前SHELL、缺省/bin/sh，当前OS用户，不提权root。

GET http://127.0.0.1:4312/health；业务调用由MCP附内部Bearer。Ctrl+C/统一启动器停止；服务停止取消当前命令组。服务/MCP/依赖变更后重启对应进程，用户文件不随启动恢复。

## 操作和记录

POST /files/write、/files/delete、/commands直接操作，无候选、编译或hash门槛。OS用户实际权限决定文件/命令结果，所有目录/扩展名/符号链接及源码区域开放。

可选POST /changes保存reason/files返回ready/checks:[]；按需apply，旧validated/failed也可用。失败保留部分已经完成的操作。snapshots/app-builder/changes/<id>/meta.json、candidate/<index>/originals/<index>保存记录；旧嵌套格式兼容。每应用一份builder，无跨进程快照锁。

直写/删除尽力记录原件，记录不可写仍执行目标并warning；无changeId不能承诺本次可撤销。单个原件失败有BACKUP_UNAVAILABLE；日志失败有LOG_UNAVAILABLE但成功结果不变，真实OS错误仍报错。

## 用户主动恢复

GET /changes找到记录，POST /changes/<id>/rollback恢复原件、删除当时不存在的新文件；不检查后续hash，按用户要求覆盖恢复。没有启动恢复、崩溃自动回退或自动修复用户文件。

原件未保存、快照删除、系统权限变化如实报错，已恢复部分保留。shell、网络和Codex原生副作用不自动记录，不保证可撤销；停止仅停止本次进程组后续执行。独立脱离组的程序有自身生命周期。快照长期保留，由用户自行管理，没有自动删原件。

## 验证与人工检查

npm test仅用本服务.test-*下隔离app/peer、随机回环端口和合成认证/秘密样式文本；自动删除，不读真实凭据、不复制真实UI或写实际根快照。13项通过，含任意文件区域/坏TS-YAML、绝对/../与symlink、binary分页、旧快照无启动恢复、手动覆盖恢复、部分失败保留、快照/日志失败仍操作、当前用户shell真实退出码/输出截断、超时/HTTP取消/服务关闭。node --check builder.mjs/server.mjs通过。

TASK010真实模型已完成backend文件直写→shell读取exit0→原生exec→用户主动page_rollback，文件撤回、审批事件0、用户业务文件hash保持；详见TASK012交接。用户人工体验仍待确认。非Git，无分支/提交/main合入/云端发布。

logs/app-builder按日保留30天，不落正文、命令或stdout/stderr。官方资料REFERENCES.md。
