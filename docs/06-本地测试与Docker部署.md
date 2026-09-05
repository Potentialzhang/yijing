# 本地测试与 Docker 部署

易境采用“Next.js 应用 + PostgreSQL 数据库”的账户模式。所有个人学习数据（笔记、收藏、复习、进度、偏好、来源模板、推演和罗盘记录）都经服务端 API 写入 PostgreSQL；浏览器不创建业务数据库，也不保存个人学习数据。公开内容可静态浏览，保存数据前需要先登录。

## 1. Docker Compose 一键运行（推荐）

要求本机安装并启动 Docker Desktop、Colima 或 Docker Engine。首次运行先准备环境文件：

```bash
cp .env.example .env
# 至少修改 POSTGRES_PASSWORD；启用 AI 时再填写 OPENAI_API_KEY/OPENAI_MODEL。
docker compose up -d --build
docker compose ps
```

Compose 会按顺序完成：启动 PostgreSQL → 等待健康检查 → 执行 `scripts/migrate.mjs` 增量迁移 → 启动 Next.js。默认监听 `0.0.0.0:3000`，本机访问 `http://127.0.0.1:3000`，手机访问 `http://电脑局域网IP:3000`。登录入口为 `/account`。

也可以使用部署脚本（同样会同时启动数据库）：

```bash
npm run deploy
```

常用配置：

```bash
# 只允许本机访问并改端口
YIJING_PORT=8080 YIJING_BIND=127.0.0.1 npm run deploy

# 已有镜像时跳过构建
DEPLOY_SKIP_BUILD=1 npm run deploy

# 查看日志、停止服务（数据卷默认保留）
docker compose logs -f yijing
docker compose down
```

局域网 HTTP 测试保持 `AUTH_COOKIE_SECURE=0`；使用 HTTPS 反向代理时设置 `APP_ORIGIN=https://你的域名` 和 `AUTH_COOKIE_SECURE=1`。

## 2. 镜像构建说明

```bash
docker build --tag yijing-app:local .
```

`Dockerfile` 使用 Next.js standalone 多阶段构建，运行时以 UID 1001 非 root 用户启动，并在启动命令中先执行数据库迁移。不要单独用 `docker run yijing-app:local` 启动正式服务，因为该方式没有 PostgreSQL；应使用 Compose，让应用和数据库共享内部网络。

## 3. 本地开发

若只修改公开内容页面，可以运行：

```bash
npm install
npm run dev -- --hostname 0.0.0.0 --port 3000
```

要测试登录和个人数据，请先启动 Compose，再让开发服务连接数据库（数据库默认不暴露宿主机端口，推荐直接使用 Compose 应用服务）。完整应用验收使用：

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
npm run test:smoke
npm run test:container
```

`npm run test:container` 会使用隔离 Compose 项目和临时端口，构建镜像、启动 PostgreSQL、执行迁移、等待健康检查，并验证生产路由、注册会话和账户数据读写；结束后自动清理测试容器和测试数据卷，不影响正式 Compose 服务。

## 4. 增量迁移

迁移版本保存在 PostgreSQL 的 `schema_migrations` 表。每次新增版本只需在 `scripts/migrate.mjs` 与 `server/db.ts` 追加一个版本；迁移在事务中执行，重复启动幂等。当前全新数据库会执行 v1～v3，建立账户、会话、统一记录写模型及正式业务表。项目按要求不迁移旧浏览器数据。

## 5. 数据与安全边界

- 会话使用 HttpOnly、SameSite=Lax Cookie；生产 HTTPS 环境开启 Secure Cookie。
- `/api/data` 所有查询按当前会话的 `user_id` 隔离，未登录返回 401，写入/删除要求同源请求。
- PostgreSQL 仅加入 Compose 内部网络，不映射宿主机 5432；数据通过 `yijing-postgres` 卷持久化。
- JSON 备份是用户主动下载的文件，不进入数据库迁移流程；账户删除和公网部署前仍应补充限流、CSRF token、密码重置、HTTPS 与审计策略。
