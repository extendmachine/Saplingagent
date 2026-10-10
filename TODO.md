# SeedAgent 当前进度

## Git分支管理（TASK014）

用户授权保存当前testcode及AI在网页自行添加功能前的main单聊天基线；本文件随对应分支保存。确切SHA使用git log -1 <分支>核对，不要求提交中包含自身SHA。当前仅root写入，主工作目录保持testcode，不推送远程。

| 分支 | 版本 | 验证 | main合并 | 位置/执行AI |
| --- | --- | --- | --- | --- |
| testcode | 当前代码，含时钟、项目文件栏、截屏和最新后端接口 | 原样保存，凭据/暂存/目录审查 | 无（独立保存当前版本） | 根目录 / Codex TASK014 |
| main | 经核查恢复的单聊天起点，保留Full Access核心 | 前端15项+后端契约9项精确恢复；32项检查与构建通过 | 不适用（基线初始保存） | Git分支对象；临时恢复副本在.cache / Codex TASK014 |

前端15项来自5d8cf4fc-b63a-47e7-a700-a464099478ea的baseline，逐项SHA256一致；后端及共享契约9项按已成功原生补丁493→433→426→414反向恢复，22个hunk唯一匹配并与独立核查哈希一致；4份服务/接口说明另按623→583→493恢复。后端保留用户已授权Full Access核心，移除文件栏API与checked-write；没有重建更早的受保护内核。

本次没有改变当前运行应用源码或用户的会话/真实凭据；数据、日志、快照、环境、依赖与构建产物保持忽略。当前文件对应main版本，来源和恢复边界详见docs/git-versions.html。

## 当前任务：Full Access（TASK010至013）

用户明确取消MCP强制保护，已实现danger-full-access/never、通用文件和shell工具，取消目录白名单、强制编译/hash门槛、逐次确认和自动回退。根协调TASK010、MCP011、builder012、前端文案013；保留现有用户页面、会话与本地认证，源码与命令以当前OS用户权限执行。以下TASK005至009保留历史，旧受控限制已被取代。

### 当前基线页面

只有一个基础对话框；没有时钟、文件栏、截屏等后加组件。原始前端文件由历史快照精确恢复。

### 本次验证

- 真Codex启动响应：sandbox dangerFullAccess、approvalPolicy never；实际gpt-5.6-sol/medium；15个MCP、3个Skills就绪。
- 真实模型通过workspace_write_file直接写backend/agent-runtime/.full-access-check.txt；MCP cat与原生Node命令退出码0；主动page_rollback为rolledBack，临时文件不存在，审批事件0。changeId 3c94e2ad-839a-4fc0-bef5-e6a45f639661。
- 本分支恢复单聊天页面；testcode保留用户当前已生成的组件。
- 32项隔离/协议检查通过：agent10、workspace4、builder13、MCP1（涵盖15工具）、front4；前端TypeScript/Vite生产构建通过，三个Skills格式与独立行为评估通过。
- builder覆盖任意路径/符号链接/二进制、旧快照兼容、无强制编译或hash阻止、无启动自动回退；快照/日志失败不阻止直接操作；超时和停止仅终止自身命令，真实状态不混淆。
- MCP正式SDK验证登记失败继续执行且附warning、没有伪造taskId，HTTP取消传递到builder。Agent登记收尾失败仅warning，不把已完成动作误报失败。
- 19个公共rules与源逐字节一致；652个公开文本检查未发现项目真实凭据，44个HTML本地链接有效。
- 浏览器工具拒绝该localhost页面访问，本次没有完成自动视觉复测或真实屏幕授权点击；服务、项目文件API、构建和协议测试已验证。截屏选择器需用户在浏览器中人工授权，用户新版实际体验待反馈。

### 下一步

本次实现和自检完成；用户可在现有网页直接要求修改后端、MCP、Skills或组件，按需主动恢复记录。无新增权限确认步骤。当前服务已重启并保持运行，实际API ready=true。云端、客户分发和长期布局效果仍未实施。

## 历史实现（TASK005至009）

- TASK001/002：规范引入、八项构想与架构；TASK003多面板已被004单页取代。
- TASK005：Codex App Server真实Agent、模型选择、SSE、持续thread、请求去重、取消、错误恢复、运行期权威任务登记。
- TASK006：正式stdio MCP 12工具；三项项目Skills，可通过受控Markdown流程扩展。
- TASK007：会话/偏好原子JSON持久化、证据、请求账本和版本冲突。
- TASK008：真实候选TypeScript/Vite构建、AST路径检查、完整YAML、应用/hash冲突保护、快照/恢复。
- TASK009：assistant-ui单页真实流/Markdown、停止/重试/新对话、snapshot刷新恢复、工具中文状态与MCP确认；固定聊天底座。

## 当前交付

本机 http://127.0.0.1:5173/；统一启动 node scripts/dev.mjs；首次依赖 node scripts/install.mjs；项目登录 node scripts/login.mjs。公开配置 config/runtime.json，说明 docs/runtime.html。Node≥24.11，本机26.4.0/Codex0.146.1，实际模型gpt-5.6-sol/medium。不覆盖全局Codex配置。

## 历史验证（TASK005至009）

- 真实模型流式回复、MCP skills_list实际调用、seed-research实际联网及官方链接、跨全部服务重启续聊记忆成功。
- 浏览器真实回复、刷新消息保留、运行中刷新/events恢复、停止按钮中断成功。
- 模型真实page_propose验证与page_apply应用成功，浏览器看到临时组件；从聊天批准MCP form并真实page_rollback成功，原始App哈希恢复，浏览器回到单聊天。
- 正式SDK→真实workspace/builder：Skill候选/应用/发现/回滚、合成偏好保存与删除、秘密读取拒绝成功；测试资料已撤回。
- 29项隔离/协议检查通过（agent8、workspace4、builder12、MCP1、前端4），TypeScript/Vite构建通过；最终测试汇总在TASK005交接；重复无sessionId请求并发重放无重复会话，冲突409、跨站403。此前MCP确认拒绝的协议缺口已修复为正式form确认，并实际批准一次已授权临时测试。

- 最后managed修复后再次真实登记→候选validated→应用applied→撤销rolledBack，changeId 44d3225b-8c72-48e0-94d8-829befb176e4，App原hash一致。早一次模型等待经主动停止后续做成功，不宣称首次响应延迟恒定。
- 普通聊天只读请求前后AI_TASKS hash一致；修改工具内部登记绑定真实MCP参数指纹，拒绝时不执行下游。19份rules与源一致，公共文件实际凭据匹配扫描无泄露，HTML链接与前端生命周期日志实际落盘已检查。

## 当前边界与后续

- 单页入口和业务内容由对话决定，现有用户页面保持。所有前后端、MCP、Skills、依赖和规则可修改，无MCP目录白名单。
- Native和MCP文件/shell为Full Access，可修改后端与可执行MCP；进程重启后加载变化。记录真实执行结果，用户按需主动回退，任意命令副作用不保证可恢复。
- 有证据偏好已实施；长期主动布局改进和效果指标尚需真实使用反馈。
- 客户打包、单文件自解包种子、跨平台交付、云端与公开发布后续实施。
- JS约706kB（gzip215kB）存在体积提示。未验证全部Codex功能或长期性能；认证、网络、额度错误明确反馈。
- 存储不可写时保留进程内未保存快照并报失败；进程退出不能保证未落盘末段。停止已发起的原子变更可能完成，以变更记录为准。

## 协调与人工验收

规范2026-09-29.1。根AI_TASKS/TODO为非Git项目权威记录；运行期由agent-runtime尝试记录根AI_TASKS区块（非阻断），详情在其ai-tasks/runtime。TASK010至013实现及自检已完成，待新版用户体验，不代表人工业务验收。无Git、分支、提交、Worktree、main合并或外部部署。

运行期MCP在实际变更前调用Agent内部POST /internal/register-task，Bearer认证且绑定当前App Server MCP item指纹。修改前project_context({modification:true})返回taskId；只读不登记；回调失败警告后继续操作。

最近修改：2026-10-09；Codex/root TASK014从真实原件/补丁恢复main单聊天基线并保存两个Git版本。32项恢复版隔离/协议检查及构建通过；root工作目录保持testcode，用户当前页面和资料未回退。没有远程推送。
