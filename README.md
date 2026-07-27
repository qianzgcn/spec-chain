# SpecChain

SpecChain 是面向团队内部使用的需求与测试用例管理平台。首版提供项目、Feature、用户故事、验收标准、测试用例及 Playwright 自动化运行的一体化管理。

系统只面向桌面端，建议浏览器宽度不低于 1280 像素。

## 首版能力

- 用户名和密码登录、数据库会话、管理员用户管理及修改密码。
- 项目、代码仓库、普通变量和加密敏感变量管理。
- Feature 与用户故事统一需求列表，支持检索、筛选和 Markdown 复制。
- 标准用户故事模板：`As`、`I want`、`so that` 及多条 `Given/When/Then` 验收标准。
- 测试用例分组、优先级、结构化步骤、多用户故事关联和 Playwright TypeScript 脚本。
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

敏感变量加密后与当前 `APP_ENCRYPTION_KEY` 绑定。系统已有数据后不得随意更换该密钥，否则已保存的敏感变量将无法解密。

### 3. 安装并运行

```powershell
npm ci
npx playwright install chromium
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。首次启动会自动创建 SQLite 文件、执行数据库迁移，并创建 `.env` 中配置的初始管理员。

如果管理员已经存在，后续启动不会用 `ADMIN_PASSWORD` 覆盖其当前密码。

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

| 命令                   | 用途                                   |
| ---------------------- | -------------------------------------- |
| `npm run dev`          | 启动本地开发服务，启动前自动准备数据库 |
| `npm run build`        | 生成 Prisma 客户端并构建生产版本       |
| `npm run start`        | 启动生产服务，启动前自动迁移数据库     |
| `npm run db:migrate`   | 在开发环境创建并应用迁移               |
| `npm run db:studio`    | 打开 Prisma 数据查看工具               |
| `npm run typecheck`    | 检查 TypeScript 类型                   |
| `npm run lint`         | 检查代码规范                           |
| `npm run format:check` | 检查代码格式                           |
| `npm test`             | 运行领域逻辑和服务端单元测试           |
| `npm run test:e2e`     | 使用独立数据库运行浏览器端到端测试     |

端到端测试使用 `data/e2e.db`，每次运行前自动重置，不会修改日常开发数据库。

## 目录说明

```text
prisma/                 数据模型、迁移和管理员初始化
scripts/                端到端测试数据库重置脚本
src/app/                页面、Server Actions 和 HTTP 接口
src/components/         中文业务界面组件
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
