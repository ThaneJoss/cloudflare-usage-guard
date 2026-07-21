# Cloudflare Usage Guard

> 开发中：当前仓库是可构建的首版骨架，后续会继续重写界面与用量采集逻辑。

一个部署在 Cloudflare Pages + Workers 上的只读资源用量面板，重点展示免费额度达到上限后会停止服务或开始计费的产品。

当前覆盖：

- Workers 请求
- Workers KV 读、写、删除、列表与存储
- D1 行读取、行写入与存储
- R2 Class A、Class B 与当前存储快照
- Queues 计费操作
- Pages 月度构建次数
- PayGo 账期明细（可选）

## 架构与安全

- `dist/` 由 Cloudflare Pages 托管。
- `worker/` 是独立的只读聚合 API。
- Cloudflare API Token 只作为 Worker Secret 保存，永远不会发送到浏览器。
- 浏览器使用独立的 `DASHBOARD_TOKEN` 访问 Worker；该口令只保存在 `sessionStorage`。
- GraphQL 卡片是运行分析估算，不等同于账单；PayGo API 明细才用于展示精确费用。

建议创建一个只读 Cloudflare API Token，授予：

- Account Analytics: Read
- Pages: Read（Pages 卡片）
- Billing: Read（可选 PayGo 明细）

## 本地开发

```bash
pnpm install
cp worker/.dev.vars.example worker/.dev.vars
pnpm dev:worker
```

另开终端：

```bash
cp .env.example .env.local
pnpm dev
```

访问 `http://localhost:5173/?demo=1` 可直接查看演示数据。

## 部署

先编辑 `worker/wrangler.jsonc`：

1. 把 `ALLOWED_ORIGINS` 中的占位 Pages 域名替换为真实域名。
2. 如需修改 Worker 名称，同步调整部署地址。

把生产密钥复制到一个被 Git 忽略的文件：

```bash
cp worker/.dev.vars.example worker/.prod.secrets
```

填写真实值后，通过 Wrangler 一次推送全部 Secret：

```bash
pnpm exec wrangler secret bulk worker/.prod.secrets --config worker/wrangler.jsonc
pnpm deploy:worker
```

构建 Pages 时设置公开变量 `VITE_API_BASE_URL=https://你的-worker.workers.dev`，然后运行：

```bash
VITE_API_BASE_URL=https://你的-worker.workers.dev pnpm build
pnpm deploy:pages
```

## 校验

```bash
pnpm typecheck
pnpm build
pnpm worker:dry-run
```

额度常量核对日期为 `2026-07-21`。Cloudflare 产品定价会变化，部署前请重新核对官方文档。
