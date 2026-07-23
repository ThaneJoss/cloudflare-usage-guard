# Cloudflare Usage Guard

一个前端部署在 Vercel、后端部署在 Cloudflare Workers 的只读资源用量面板，重点展示免费额度达到上限后会停止服务或开始计费的产品。

当前覆盖：

- Workers 请求
- Workers KV 读、写、删除、列表与存储
- D1 行读取、行写入与存储
- R2 Class A、Class B 与当前存储快照
- Queues 计费操作
- Pages 月度构建次数
- PayGo 账期明细（可选）

采集器会并行读取各产品，并把失败限制在对应卡片内。Pages 项目、部署记录与 PayGo 明细会自动分页；Pages 项目以受控并发读取，避免账户项目较多时瞬间触发 API 限流。若个别 Pages 项目读取失败，面板会明确标记为“下限数据”，而不是把不完整计数显示成精确值。

## 架构与安全

- `dist/` 由 Vercel 托管，生产地址为 `https://cloudflare.thanejoss.com`。
- `worker/` 是独立的只读聚合 API，由根目录 `wrangler.jsonc` 部署到 Cloudflare Workers。
- API Worker 只绑定 `https://api.cloudflare.thanejoss.com`，不携带或托管前端静态资源。
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
cp .dev.vars.example .dev.vars
pnpm dev:worker
```

另开终端：

```bash
cp .env.example .env.local
pnpm dev
```

访问 `http://localhost:5173/?demo=1` 可直接查看演示数据。

## 部署

前端和后端位于同一个仓库，但使用彼此独立的部署入口。

### 后端：Cloudflare Workers

根目录 `wrangler.jsonc` 是 Worker 配置的唯一来源：

- Worker：`cloudflare-usage-guard`
- 入口：`worker/src/index.ts`
- 自定义域名：`api.cloudflare.thanejoss.com`
- 允许的浏览器来源：`https://cloudflare.thanejoss.com`
- 不配置 `assets`，因此不会把 Vite 前端部署到 API 域名

把生产密钥复制到被 Git 忽略的文件：

```bash
cp .dev.vars.example .prod.secrets
```

填写真实值后，通过 Wrangler 一次推送全部 Secret：

```bash
pnpm exec wrangler secret bulk .prod.secrets
pnpm deploy:worker
```

Cloudflare Dashboard 中 `Settings > Build` 下的变量仅供构建过程使用。以上三项必须配置在
`Settings > Variables & Secrets` 中，才能作为 Worker 运行时 Secret 被代码和 Wrangler 识别。

Cloudflare Workers Builds 应使用以下设置：

- Build command：`pnpm build:worker`
- Deploy command：`pnpm deploy:worker`
- Non-production branch deploy command：`pnpm preview:worker`
- Root directory：仓库根目录

### 前端：Vercel

Vercel 使用 `pnpm build` 构建 Vite 前端，输出目录为 `dist`。仓库中的 `.env.production` 已将 API 地址固定为 `https://api.cloudflare.thanejoss.com`；生产域名为 `https://cloudflare.thanejoss.com`。

前端部署不使用 Wrangler，也不由 Cloudflare Workers Builds 托管。

本地验证生产构建：

```bash
pnpm build
pnpm preview
```

## 校验

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm worker:dry-run
```

测试覆盖鉴权、CORS、UTC 日/月窗口、额度状态、R2 操作分类、存储快照合并、REST 分页、部分数据源失败以及聚合摘要。

额度常量核对日期为 `2026-07-21`。Cloudflare 产品定价会变化，部署前请重新核对官方文档。
