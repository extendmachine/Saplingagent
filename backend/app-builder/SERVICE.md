# app-builder 服务说明

- 目录 backend/app-builder/；Codex/workspace，TASK-20261009-012；版本0.2.0。
- 当前状态：实现、14项隔离自检与真实模型联调完成；新增浏览器文件编辑安全写接口，待人工体验。根 TASK010 汇总，非 Git，无提交/main同步。
- 职责：按用户要求提供当前操作系统用户的完整文件与命令操作、可选候选记录及用户主动恢复。模型、会话和MCP协议分别由其他服务通过公开HTTP协调。
- 当前没有读写白名单、扩展名、符号链接/越界、秘密文本、AST/YAML、固定聊天/入口/后端/rules保护，没有强制编译、hash冲突拦截或自动恢复。不提权 root。

## 结构与运行环境

builder.mjs：原生读写、索引快照、主动恢复、shell生命周期。server.mjs：HTTP/loopback/Bearer认证、元数据日志。test/builder.test.mjs：隔离回归。package.json/package-lock.json归本服务。
旧source-references.mjs及Babel/css-tree/yaml依赖已移除。Node >=24.11，本机测试26.4.0，仅使用Node内置模块，无第三方运行依赖，不需要前端编译器启动文件工具，不使用全局npm安装。

根执行 node backend/app-builder/server.mjs，或服务目录 npm start；服务目录可 npm ci。默认127.0.0.1:4312；SEED_BUILDER_PORT覆盖端口；SEED_ROOT覆盖项目根，默认模块相对推导。GET /health；Ctrl+C或统一启动器停止。shell取当前环境SHELL，未设置时macOS/Linux为/bin/sh，继承当前服务用户及环境。

## 文件、记录和恢复

相对路径基于项目根，绝对路径、../、dot目录和符号链接按原生文件系统处理。文件支持utf8/base64与字节分页；目录列表保留目录/symlink/other类型。writable:true表示服务没有写门槛，实际权限由OS决定。

POST /files/write、/files/delete直接操作目标并尽力记录原件。快照或记录失败仍执行可执行目标，返回applied+warning；没有确认可用记录时省略changeId。原件备份失败明确originalSnapshot:false/backupError及BACKUP_UNAVAILABLE，不能承诺该文件可恢复。目录操作可用任意shell。

POST /files/write-checked用于浏览器文本编辑器：读取时取得完整文件SHA256，保存时确认文件仍未被外部修改，再用同目录临时文件原子替换并保留原权限；冲突保留浏览器草稿，不覆盖磁盘。它拒绝symlink及非普通文件，不影响Full Access下其他直写接口。

可选POST /changes成功仅返回ready/checks:[]，expectedHash接受但忽略，不复制完整前端或编译。apply兼容旧validated/failed候选；多文件中途失败保留已经完成的操作。单进程记录队列，无跨进程快照锁。

snapshots/app-builder/changes/<uuid>/保存meta.json、candidate/<index>和originals/<index>，绝对与../目标不改变快照自身布局；旧嵌套路径记录保留兼容。仅显式rollback按原件恢复、删除当时不存在的新文件，允许覆盖后续编辑。启动不解释applying/failed状态并自动还原文件，快照不自动删除。

## 命令生命周期

POST /commands执行当前用户shell，无命令白名单或root提权。cwd默认项目根，可任意可访问目录；默认60秒，timeoutMs 1..3600000。stdout/stderr各最多1MiB并标截断；返回真实exitCode、timedOut、cancelled。

超时、HTTP请求取消/连接断开和server.close结束本次创建的shell进程组，其他命令组保持运行。停止不能撤销已发生副作用；shell与Codex原生操作不自动进入文件快照。独立脱离进程组的程序遵循其自身生命周期，不承诺完整回退。

## 日志与依赖

logs/app-builder/app-builder-YYYY-MM-DD.log；启动和跨日清理30天前日志；info/warn/error。仅requestId/changeId/status/code/exitCode/timedOut/cancelled，不落输入、命令正文、输出或凭据。日志不可写不改变已完成操作结果，附LOG_UNAVAILABLE；真实文件系统错误仍返回。真实日志不进Git。

上游backend/mcp-runtime通过HTTP；根启动器准备local-secrets/runtime/service-token，本服务启动读取做内部认证，浏览器不持有token。无跨服务私有导入或数据库依赖。

接口CONTRACT.md；部署/主动恢复DEPLOY.md；官方来源REFERENCES.md；当前交接ai-tasks/TASK-20261009-012.md。旧TASK008是历史受控方案，当前v2已替代。根AI_TASKS/TODO仅协调者更新。
