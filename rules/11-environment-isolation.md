# 11. 项目内环境隔离规范

## 目标

凡是涉及运行环境、依赖环境、容器环境的内容，都必须归属当前项目文件夹内部，避免不同项目之间互相干扰、污染或误用环境。

## 总原则

1. 环境文件必须放在项目目录内，不放到项目外部公共位置。
2. 不同项目之间不共用虚拟环境、依赖目录、容器配置或临时运行目录。
3. AI 不应修改其他项目的环境文件。
4. AI 不应把当前项目依赖安装到系统全局环境。
5. 环境相关说明必须写入对应微服务目录内的 `SERVICE.md` 或 `DEPLOY.md`。

## Python 环境

1. Python 项目必须使用项目内虚拟环境，推荐目录为 `.venv/`。
2. 不允许使用系统 Python 环境直接安装项目依赖。
3. 不允许多个项目共用同一个 venv。
4. `.venv/` 必须加入 `.gitignore`。
5. 依赖文件应放在项目内或对应微服务目录内，例如 `requirements.txt`、`pyproject.toml`。

推荐结构：

```text
project-root/
├── .venv/
├── services/
│   └── service-a/
│       ├── SERVICE.md
│       └── requirements.txt
└── .gitignore
```

## Docker 环境

1. Dockerfile、compose 文件、构建上下文和项目相关容器说明必须放在项目文件夹内。
2. 每个微服务如需 Docker，应优先在自己的微服务目录内维护 Dockerfile。
3. 项目级编排文件可放在项目根目录，例如 `docker-compose.yml`。
4. 项目镜像、镜像命名规则、构建方式必须在项目内文档说明，不依赖外部未知配置。
5. 构建缓存、导出的镜像包、临时容器数据如需保存，应放在项目内明确目录，并按需加入 `.gitignore`。

推荐结构：

```text
project-root/
├── docker-compose.yml
├── docker-images/
├── services/
│   └── service-a/
│       ├── Dockerfile
│       ├── SERVICE.md
│       └── DEPLOY.md
└── .gitignore
```

## Node 或其他语言环境

1. Node 依赖必须使用项目内 `node_modules/`，不依赖全局安装作为项目运行前提。
2. 其他语言如需虚拟环境、缓存目录、依赖目录，也应放在项目内或明确记录项目级路径。
3. 不同项目不得共用同一个依赖目录。

## AI 执行规则

1. 新增环境前，先确认环境目录在当前项目文件夹内。
2. 如果发现项目正在使用外部共享环境，应先记录到 `TODO.md`，再询问是否迁移。
3. 修改环境配置后，必须更新对应微服务的 `SERVICE.md` 或 `DEPLOY.md`。
4. 不创建会影响系统全局或其他项目的环境配置。
5. 不把 `.venv/`、`node_modules/`、Docker 镜像包、容器临时数据提交到 git。
6. 初始化或审阅环境时使用下方“环境填写格式”检查，最终内容直接写入对应微服务的 `SERVICE.md` 或 `DEPLOY.md`。

## 环境填写格式

```markdown
## 项目内环境

- 服务：`<SERVICE_NAME>`
- 技术栈：<Python / Node / Docker / 其他>
- 运行时版本：<VERSION>
- 环境目录：<项目内部路径>
- 依赖清单：<requirements.txt / pyproject.toml / package.json / 其他>
- 配置入口：<项目内部路径>
- 临时数据目录：<项目内部路径>
- Python 虚拟环境：<`.venv/` 或不适用>
- Node 依赖目录：<项目内 `node_modules/` 或不适用>
- Dockerfile：<项目内路径或不适用>
- Docker 构建上下文：<项目内路径或不适用>
- Docker 镜像命名：<project/service:version 或不适用>
- 导出镜像目录：<`docker-images/` 或不适用>
```

AI 必须删除不适用项或明确写明“不适用”，不得保留未处理占位符。
