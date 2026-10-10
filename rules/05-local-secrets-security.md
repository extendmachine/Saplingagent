# 05. 本地敏感信息文件夹安全规范

## 目标

API key、服务器登录密钥、SSH key、密码、token 等敏感内容必须统一存放到本地独立敏感信息文件夹内，确保项目代码可以读取这些文件使用，但这些内容绝对不进入 git。

用户可能不会自行创建凭据文件。用户在对话中直接提供当前项目所需的真实凭据时，AI 应代为保存到目标项目的 `local-secrets/` 并维护总账，不得仅因凭据出现在对话中就拒绝处理，或只让用户自己建文件。

客户内容不默认视为敏感内容。业务中的客户资料、客户项目内容、客户数据可按项目需要正常存放数据库；只有登录凭据、密钥、token、密码等访问控制信息属于敏感内容。

新项目不得再使用根目录 `selfdata.json` 集中保存全部服务器密码和密钥。旧项目如已存在 `selfdata.json`，应保持 Git 忽略，并逐步迁移到分类明确的 `local-secrets/`；迁移完成前不得删除忽略规则。

## 推荐目录

```text
project-root/
├── local-secrets/
│   ├── README.md
│   ├── api-keys/
│   │   └── README.md
│   ├── server-keys/
│   │   └── README.md
│   ├── ssh/
│   │   └── README.md
│   └── notes/
│       ├── README.md
│       └── project-secrets.json
└── .gitignore
```

## 规范源安全骨架

1. `0.skills项目规范/local-secrets/` 是整包复制所需的预建目录骨架，可以随规范包复制到目标项目。
2. 规范源中的 `notes/project-secrets.json` 必须保持空项目信息和空 `credentials` 清单，只用于提供可直接填写的合法 JSON 文件。
3. 规范源中的其他分类目录只保存安全说明文件，不得保存真实服务器、数据库、API 或 SSH 信息。
4. 目标项目复制完成后，可以直接填写自己的总账和分类文件；一旦填写真实内容，整个目录即按敏感信息管理，不得再次分发或提交 Git。

## 项目私密信息总账

1. 每个项目的私密信息总账统一存放在 `local-secrets/notes/project-secrets.json`。
2. 总账用于登记凭据编号、类别、所属微服务、适用环境、用途、实际凭据文件路径、轮换或过期时间和备注。
3. API key、密码、Token、数据库凭据和 SSH 私钥优先存入对应分类文件；总账通过项目内相对路径引用，避免多处重复保存真实值。
4. 服务器地址、端口、部署账号、部署路径等需要集中管理的信息，可以保存在总账或其引用的 `server-keys/` 分类文件中。
5. 填入实际项目信息后的总账属于敏感文件，和目标项目整个 `local-secrets/` 一样禁止提交、再次分发、写入日志或在 AI 回复中完整展示；规范源中的空总账除外。
6. 新增、删除、轮换或停用凭据时，必须同步更新总账的日期、状态和文件引用。
7. 初始化时直接按下方 JSON 格式在目标项目本地创建总账和分类凭据文件；规则文件只能保留虚构占位符。

## 私密信息总账格式

目标项目本地创建 `local-secrets/notes/project-secrets.json`：

```json
{
  "schema_version": 1,
  "project": {
    "name": "PROJECT_NAME",
    "root": "PROJECT_ROOT",
    "last_updated": "YYYY-MM-DD",
    "maintainer": "USER_OR_AI"
  },
  "credentials": [
    {
      "id": "platform-api",
      "category": "api-key",
      "service": "SERVICE_NAME",
      "environment": "development",
      "purpose": "PURPOSE",
      "credential_file": "../api-keys/platform.json",
      "official_reference": "services/SERVICE_NAME/REFERENCES.md",
      "rotation_or_expiry": "YYYY-MM-DD_OR_NOT_APPLICABLE",
      "notes": "NOTES"
    },
    {
      "id": "production-server",
      "category": "server-login",
      "service": "SERVICE_NAME",
      "environment": "production",
      "purpose": "DEPLOYMENT",
      "credential_file": "../server-keys/server-login.json",
      "ssh_key_file": "../ssh/id_ed25519",
      "rotation_or_expiry": "YYYY-MM-DD_OR_NOT_APPLICABLE",
      "notes": "NOTES"
    }
  ]
}
```

API 平台凭据文件建议格式：

```json
{
  "platform": "PLATFORM_NAME",
  "application": "APPLICATION_NAME_OR_ID",
  "environment": "development",
  "api_key": "YOUR_API_KEY_HERE",
  "api_secret": "YOUR_API_SECRET_HERE",
  "access_token": "YOUR_ACCESS_TOKEN_HERE",
  "refresh_token": "YOUR_REFRESH_TOKEN_HERE",
  "expires_at": "YYYY-MM-DDTHH:MM:SSZ",
  "official_reference": "services/SERVICE_NAME/REFERENCES.md",
  "notes": "NOTES"
}
```

服务器登录凭据文件建议格式：

```json
{
  "name": "SERVER_NAME",
  "environment": "production",
  "host": "SERVER_HOST_OR_IP",
  "port": 22,
  "username": "LOGIN_USERNAME",
  "password": "LOGIN_PASSWORD_IF_USED",
  "ssh_key_file": "../ssh/id_ed25519",
  "deploy_path": "REMOTE_DEPLOY_PATH",
  "deploy_method": "DEPLOY_METHOD",
  "services": ["SERVICE_NAME"],
  "notes": "DEPLOYMENT_NOTES"
}
```

数据库凭据文件建议格式：

```json
{
  "name": "DATABASE_NAME",
  "environment": "development",
  "host": "DATABASE_HOST",
  "port": 0,
  "database": "DATABASE_NAME",
  "username": "DATABASE_USERNAME",
  "password": "DATABASE_PASSWORD",
  "connection_options": "OPTIONS_OR_EMPTY",
  "owner_service": "DATABASE_SERVICE_NAME",
  "notes": "NOTES"
}
```

## 必须本地保存的信息

1. API key、token、第三方平台访问密钥。
2. 登录账号与密码。
3. SSH key、服务器登录密钥。
4. 服务器地址、端口、部署账号。
5. 部署路径、部署方式和注意事项。

## 读取规则

1. 首次接收允许从用户当前提供的对话内容转存到本地敏感文件；转存完成后，代码运行、配置和后续任务使用凭据必须读取本地文件，不从聊天记忆复制真实值到代码或命令中。
2. 不允许把敏感内容硬编码到代码、文档、日志或提交记录中。
3. 不允许让 AI 在进度说明、最终回复或校验输出里展示真实密钥、密码、token。
4. 需要示例时，只能使用占位符，例如 `YOUR_API_KEY_HERE`。

## 对话凭据代存

用户为当前项目直接提供真实凭据，视为授权 AI 本地代存和登记总账，无需再次询问“是否保存”。只读审阅中的引用、示例占位符或用户明确要求不要保存的内容不触发代存。按规则索引完成必要的任务登记后执行以下流程，登记中不得包含秘密值：

1. **定位目标项目。** 保存到凭据所属项目的 `local-secrets/`，不得散存到桌面、全局配置或其他项目。当前目录为规范源 `0.skills项目规范/` 时，仍不得在模板内存放真实凭据；已有明确目标项目则直接存到目标项目，无法确定项目时只询问目标位置，不要求用户自己创建文件或重新发送已有完整凭据。
2. **准备受保护的目录。** 自动补齐缺失的分类目录和 `.gitignore` 忽略项，确认实际写入路径位于目标项目内，不通过符号链接写到项目外。Git 项目检查目标文件未被跟踪或加入暂存区；已有跟踪按泄密处置规则处理，不把新凭据写入已跟踪文件。macOS / Linux 新建敏感目录和文件分别使用仅当前用户可访问的权限，例如目录 `700`、文件 `600`，不递归改动其他项目或无关文件权限。
3. **分类保存原始内容。** API 凭据存入 `api-keys/`，服务器或数据库登录凭据存入 `server-keys/`，SSH 私钥存入 `ssh/`。文件名根据平台、服务和环境命名，不含秘密值；保留密钥原文及多行格式，不擅自修补缺失字符。所属项目明确但类别、用途或环境暂不清楚时，先用不覆盖已有文件的 `notes/pending-<task-id>.txt` 等名称保存，标记待确认，不猜测配置或启用。
4. **保留已有凭据。** 新凭据不得无声覆盖现有文件或切换正在使用的凭据。用户已明确要求替换同一凭据时，按该授权更新；否则使用独立文件代存，保留原有文件和正在使用的引用。
5. **避免再次暴露。** 使用可用的安全文件写入方式，不将秘密放入可见命令参数，不通过回显、文件差异预览、日志或错误输出展示内容；不为代存创建含秘密的临时脚本、普通任务记录或额外副本。缺少可安全写入的工具或权限时如实说明阻塞，不宣称已保存。
6. **维护本地总账。** 更新 `local-secrets/notes/project-secrets.json` 中的凭据编号、类别、服务、环境、用途、文件引用、日期和状态，仅登记已知信息，不重复保存真实值。未明确启用的新增凭据标记为待配置或待确认，不覆盖原有有效条目；`TODO.md`、`AI_TASKS.md` 和交接文件只记录处理状态及不含秘密的文件路径。
7. **核验并反馈。** 通过不回显内容的文件读取检查保存完整性、格式、权限和 Git 忽略情况，不为验证保存成功而调用外部平台。回复只说明保存路径、总账是否更新和必要待办，不重复展示凭据；后续已授权任务从保存的文件读取使用。
8. **区分代存与其他授权。** 本地代存不等于授权远程登录、付费调用、生产切换、发布或凭据轮换，相关操作仍核对已有任务授权。保存到本地不代表对话中的副本已删除，也不代表已经排除泄露风险；可以简短提醒风险和轮换建议，但不把用户先轮换或自己搬运文件作为代存前置条件。需要实际泄密处置时继续遵守下方批准要求。

## 安全红线

1. 本地敏感信息文件夹绝对不允许提交到 git。
2. 项目初始化时必须立刻将本地敏感信息文件夹写入 `.gitignore`。
3. 每次提交前必须确认敏感信息文件夹、密钥文件、环境变量文件不在暂存区。
4. 如果发现敏感内容已被误提交，必须立即阻止继续传播，准备并落实历史清理方案；共享历史重写和强推须有对应授权，具体按下方泄密处置顺序执行。
5. 如果敏感信息曾经泄露，必须安排更换或撤销其中的密码、密钥和 token；可能中断服务的凭据操作须有对应授权，不得把修复代码的授权视为生产凭据轮换授权。

## 泄密处置顺序

1. 立即暂停包含秘密的提交、推送、发布或分享，记录泄露类别和位置，不重复展示秘密值。
2. 在已授权范围内准备本地净化、忽略规则、历史清理和凭据轮换方案，保留他人修改；不受影响的工作可以继续。
3. 执行共享历史重写、强推、生产凭据撤销或可能中断服务的轮换前，核对用户对具体仓库、凭据和影响范围的授权。已有同范围明确授权可沿用，否则先提供方案并请求批准。
4. 历史清理不等于凭据失效；分别记录清理、轮换和验证结果。尚未获得权限或无法完成的事项必须保持待处理状态，不得宣称泄密已经解决。

## AI 执行规则

1. 不主动输出本地敏感信息文件夹中的敏感内容。
2. 不把服务器密码、密钥、token 写入代码、文档或日志。
3. 涉及部署任务时，缺少凭据才提示补充；用户已在对话中提供完整凭据的，按“对话凭据代存”直接完成本地保存和总账登记，不把建目录、建文件的工作退回用户，且不得提交该文件夹。
4. 客户内容按业务数据处理，不因为是客户内容就自动归入敏感信息文件夹。
5. 不新建 `selfdata.json`；发现旧文件时，先记录迁移计划，不直接展示或提交其中内容。
6. 公钥和平台证书虽然不等同于私钥，但必须按 `rules/15-official-links-and-source-traceability.md` 记录官方来源。
7. 初始化新项目时，检查整包复制得到的 `local-secrets/notes/project-secrets.json` 并直接填写；文件缺失时才按本规则重建。没有需要管理的凭据时可以保留空清单，但不得删除目录的 Git 忽略规则。
