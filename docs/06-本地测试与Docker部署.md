# 本地测试与 Docker 部署

本项目是本地优先的浏览器应用：学习记录保存在使用者浏览器的 IndexedDB 中，Docker 容器只负责提供 Next.js 页面，不需要挂载数据库卷。

本项目按内部自用模式部署，不设置公开发布所需的版权/来源签字门槛；已有来源字段仅用于个人学习时追踪资料，不影响内部启动。六十四卦/三百八十四爻正文仍应按学习需要逐条核对，不能把“内部使用”理解为内容准确性自动通过。

## 1. 本地开发测试环境

首次安装依赖：

```bash
npm install
npx playwright install chromium webkit
```

启动可交互的本地测试环境：

```bash
npm run local:test
```

默认地址为 `http://127.0.0.1:3000`。命令会启动 Next.js 开发服务、等待 `/api/health` 就绪并持续运行；按 `Ctrl-C` 停止。

可通过环境变量修改地址：

```bash
LOCAL_TEST_HOST=127.0.0.1 LOCAL_TEST_PORT=3100 npm run local:test
```

另开终端执行测试：

```bash
npm test -- --run       # 单元测试
npm run lint            # 静态检查
npm run typecheck       # 类型检查
npm run test:e2e        # Chromium/WebKit 开发态 E2E
npm run test:a11y       # 无障碍
npm run test:responsive # 响应式
npm run test:perf       # 性能
```

需要验证生产构建时使用：

```bash
npm run verify:release
```

## 2. Docker 一键部署

要求本机已安装并启动 Docker Desktop 或 Docker Engine。最简单的部署命令：

```bash
npm run deploy
```

脚本会构建 `yijing-app:local` 镜像，替换同名旧容器，启动非 root 容器并等待健康检查通过。默认监听 `0.0.0.0:3000`，浏览器访问：

```text
http://127.0.0.1:3000
```

常用配置：

```bash
# 改端口，仅本机访问
YIJING_PORT=8080 YIJING_BIND=127.0.0.1 npm run deploy

# 使用已有镜像，不重复构建
DEPLOY_SKIP_BUILD=1 YIJING_IMAGE=yijing-app:local npm run deploy

# 查看日志与停止服务
docker logs -f yijing-app
docker rm --force yijing-app
```

也可以使用 Compose：

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f yijing
```

停止 Compose 服务：

```bash
docker compose down
```

## 3. 镜像打包

手工构建和运行：

```bash
docker build --tag yijing-app:local .
docker run --detach --name yijing-app --restart unless-stopped --publish 3000:3000 yijing-app:local
```

镜像使用 Next.js standalone 多阶段构建，运行时以 UID 1001 的非 root 用户启动，并包含 `/api/health` Docker `HEALTHCHECK`。浏览器学习数据不在容器内，因此升级镜像不会删除已有浏览器数据；升级前仍建议从“数据设置”导出 JSON 备份。

## 4. 容器验收

需要同时验证镜像构建、非 root 用户、健康状态和 30 个生产路由：

```bash
npm run test:container
```

该命令会使用临时端口，验收结束后自动清理测试容器；它不会清理 `npm run deploy` 启动的正式容器。
