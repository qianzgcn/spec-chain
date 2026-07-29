# SpecChain

SpecChain 是面向团队内部使用的需求与测试用例管理平台。首版提供项目、Feature、用户故事、验收标准、测试用例、AI 辅助生成 US 及 Playwright 自动化运行的一体化管理。

系统只面向桌面端，建议浏览器宽度不低于 1280 像素。

## 首版能力

- 用户名和密码登录、数据库会话、管理员用户管理及修改密码。
- 项目基础设置、测试地址与环境变量，以及 GitHub/Gitee 代码仓库和加密凭据管理。
- Feature 与用户故事统一需求列表，支持检索、筛选和 Markdown 复制；AI 生成结果集中进入“待评审需求”。
- 标准用户故事模板：`As`、`I want`、`so that` 及多条 `Given/When/Then` 验收标准。
- 结合需求、FE 上下文和 GitHub/Gitee 代码生成待评审的结构化 US 草稿。
- 测试用例分组、优先级、自然语言步骤、多用户故事关联和 Playwright TypeScript 脚本。
- 单并发运行队列、实时日志、停止任务、超时处理、失败截图及运行历史。
- 所有业务删除均为逻辑删除，不提供恢复入口。

## 技术基线

| 分类       | 版本或方案                                      |
| ---------- | ----------------------------------------------- |
| 运行环境   | Node.js 22.22.0、npm 11.11.1                    |
| Web        | Next.js 16.2.11、React 19.2.8、TypeScript 6.0.3 |
| 界面       | Ant Design 6、Tailwind CSS 4                    |
| 数据       | Prisma 7.9、SQLite、better-sqlite3 适配器       |
| 校验与状态 | Zod 4、TanStack Query 5                         |
| AI         | Vercel AI SDK 7、OpenAI 兼容模型适配器          |
| 认证与加密 | Argon2id、数据库 Session、AES-256-GCM           |
| 测试       | Vitest 4、Playwright 1.62                       |
| 工程质量   | ESLint 9、Prettier 3、Pino                      |

项目使用 `package-lock.json` 锁定完整依赖版本。

## 本地启动

### 1. 准备环境

安装 Git、nvm-windows，并切换到项目约定的 Node.js 版本：

```powershell
nvm install 22.22.0
nvm use 22.22.0
node --version
npm --version
```

### 2. 配置环境变量

```powershell
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

编辑 `.env`：

- 将生成的随机值填入 `APP_ENCRYPTION_KEY`。
- 将 `ADMIN_PASSWORD` 改为至少 8 位的安全密码。
- 本地使用 HTTP 时保持 `SESSION_COOKIE_SECURE="false"`。

敏感变量、仓库 PAT 和模型 API Key 加密后都与当前 `APP_ENCRYPTION_KEY` 绑定。系统已有数据后不得随意更换该密钥，否则已保存的敏感数据将无法解密。

### 3. 安装并运行

```powershell
npm ci
npx playwright install chromium
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。首次启动会自动创建 SQLite 文件、执行数据库迁移，并创建 `.env` 中配置的初始管理员。

如果管理员已经存在，后续启动不会用 `ADMIN_PASSWORD` 覆盖其当前密码。

## GitHub/Gitee 仓库连接

每个项目可分别配置一份 GitHub PAT 和 Gitee PAT，同项目的仓库会根据地址自动选择对应凭据。PAT 使用 AES-256-GCM 加密保存，已配置值只显示固定掩码且不能直接修改；如需更换，必须先删除再新增。

首版支持 `github.com` 和 `gitee.com` 的 HTTPS、SCP 风格 SSH 及标准 SSH 仓库根地址，不支持企业私有域名。建议 PAT 仅授予目标仓库所需的最小读取权限。

“检查连接”通过托管平台 API 验证 PAT、仓库和指定分支是否可访问，不会执行 Git clone、pull 或 push，也不代表 Git 协议通道已经验证。

## AI 辅助生成 US

管理员在“模型配置”中创建一个或多个模型，并为“生成 US”指定默认模型。当前版本接入实现了 OpenAI Chat Completions 兼容接口的服务，配置项包括模型名称、Base URL、模型 ID 和 API Key。

- API Key 使用 AES-256-GCM 加密，保存后只显示固定掩码。
- “检查模型”会实际验证认证、接口连通性和结构化输出能力。
- 用户不能在生成页面临时切换模型，任务统一使用管理员绑定的默认模型。
- 系统通过 GitHub/Gitee 官方 API 解析分支最新提交，并始终按该提交读取文件树和有限的相关源码，保证单次任务使用同一个不可变代码快照。
- 只有找到真实相关代码且需求信息足够时才创建待评审草稿；确认草稿后才创建正式 US。
- AI 执行记录长期保留模型、Skill、仓库提交和代码路径引用，但不保存完整源码、PAT 或 API Key。执行详情只展示任务信息、终端式日志、输入需求和生成结果入口，不向浏览器返回仓库快照或代码路径。

生成 US 的业务提示词集中在 `src/ai/prompts/generate-user-story/`，Markdown 文件承载可评审的提示词正文，TypeScript 只负责强类型变量注入和结果校验。提示词行为发生实质变化时应同步提升 Skill 版本。

当前只读分析不执行 Git clone、pull，也不向模型开放 Shell。不要让并发任务共用一个可变工作目录；以后只有在代码搜索、本地构建或脚本验证确实需要完整文件系统时，才应引入“裸仓库缓存 + fetch + 每次执行独立的 detached worktree”，任务全程固定提交并在结束后清理工作树。

不同 OpenAI 兼容服务对结构化输出的实现可能不同，新模型投入使用前应先执行“检查模型”。当前版本不包含 AI 生成自然语言测试用例、Playwright CLI 页面探测、自动化脚本生成或 Skill 管理。

## 容器部署

项目按“一个 Next.js 服务加一个 Chromium”的单容器方式部署，不支持普通 Serverless，也不应横向启动多个共享 SQLite 的应用实例。

```powershell
Copy-Item .env.example .env
# 修改 .env 中的管理员密码和加密密钥
docker compose up --build -d
docker compose ps
```

默认访问地址为 [http://localhost:3000](http://localhost:3000)。如需调整宿主机端口，可在 `.env` 中增加：

```dotenv
SPECCHAIN_PORT="8080"
```

容器启动时会自动执行数据库迁移和管理员初始化。数据库、运行日志和失败截图保存在名为 `specchain-data` 的持久化卷中。

生产环境应通过 HTTPS 反向代理访问，并设置：

```dotenv
SESSION_COOKIE_SECURE="true"
```

完整的部署、备份和升级步骤见 [部署说明](docs/部署说明.md)。

## 常用命令

| 命令                   | 用途                               |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | 准备数据库并启动本地开发服务       |
| `npm run build`        | 构建生产版本                       |
| `npm run start`        | 准备数据库并启动生产服务           |
| `npm run db:migrate`   | 在开发环境创建并应用迁移           |
| `npm run db:studio`    | 打开 Prisma 数据查看工具           |
| `npm run format`       | 格式化代码和文档                   |
| `npm run format:check` | 检查代码格式                       |
| `npm run typecheck`    | 检查 TypeScript 类型               |
| `npm run lint`         | 检查代码规范                       |
| `npm test`             | 运行单元测试                       |
| `npm run test:e2e`     | 使用独立数据库运行浏览器端到端测试 |

安装依赖时会自动生成 Prisma 客户端，`dev` 和 `start` 会自动执行已有迁移并初始化管理员，无需单独运行数据库准备命令。AI 与 Playwright Worker 由应用在收到任务后按需启动，不需要人工运行。

端到端测试使用 `data/e2e.db`，每次运行前自动重置，不会修改日常开发数据库。

## 目录说明

```text
prisma/                 数据模型、迁移和管理员初始化
scripts/                端到端测试数据库重置脚本
src/app/                页面、Server Actions 和 HTTP 接口
src/components/         中文业务界面组件
src/ai/                 模型适配、仓库代码读取和 AI 工作流
src/ai-worker/          短生命周期 AI 队列工作进程
src/lib/                纯领域逻辑与通用类型
src/server/             认证、数据库、加密及队列启动逻辑
src/runner/             Playwright 队列工作进程
tests/unit/             领域逻辑和安全测试
tests/e2e/              浏览器核心流程测试
```

## 自动化运行安全边界

用户保存的是完整 Playwright Test TypeScript 文件，可以导入模块并执行 Node.js 代码。首版仅面向内部可信用户：

- 每次运行使用独立临时目录，但目录隔离不是安全沙箱。
- 全平台同一时间只执行一个任务，队列按先进先出处理。
- 项目敏感变量在日志写入数据库前会被脱敏。
- 单次运行默认最多十分钟。
- 失败时保存截图，不保存视频和 Trace。
- 运行摘要长期保留，原始日志和截图保留 30 天。

不要向不可信用户开放脚本编辑或运行权限，也不要把该版本直接暴露到公网。
