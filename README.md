# Cloudflare Usage Guard

面向 Cloudflare 账户的只读边缘资源指挥台。它把近实时额度风险、数据源健康与官方
可计费用量整理成风险优先的单页控制台，在额度变成停服或费用前给出清晰信号。

生产架构保持两条严格分离的交付链：

```text
浏览器 ── Cloudflare Access ── Vercel 静态前端
   │
   └──── Cloudflare Access JWT ── API Worker ── Cloudflare 只读 API
```

- 前端：React 19、TypeScript 7、Vite 8，部署到
  `https://cloudflare.thanejoss.com`。
- 后端：Cloudflare Worker，部署到
  `https://api.cloudflare.thanejoss.com`。
- 运行时契约：API Token 只存在于 Worker Secret；API Origin 由前端构建环境固定，
  浏览器不保存端点或凭据。
- 数据契约：前后端复用同一份 Zod Mini 响应契约，官方账单响应另做严格校验，避免
  字段缺失被静默解释成零费用。
- 工程门禁：Oxlint、严格 TypeScript、Vitest、Testing Library、workerd
  运行时测试、产物预算和 Wrangler dry-run。

## 产品能力

### 风险优先控制台

- 账户态势环使用当前最高真实利用率，不伪造趋势或历史数据。
- 当前压力信号按真实利用率排序。
- 免费额度卡支持全部、需要关注、达到即停、可能计费和数据不可用筛选。
- 数据刷新失败时保留最后一次成功快照，并明确标记 `STALE`。
- 单个采集器失败只降级对应产品，不遮挡其他账户数据。
- 官方日级账单事实和 Analytics 近实时额度估算分区展示，避免混淆统计口径。
- 只汇总成本驱动因素，并深链到 Cloudflare 原生账单中心，不在项目中复刻已有的
  日成本图、筛选器、历史账期和预算提醒。

### 当前覆盖

| 产品 | 指标 | 周期 | 精度 |
| --- | --- | --- | --- |
| Workers | 请求 | UTC 日 | Analytics 估算 |
| Workers KV | 读、写、删除、列表、存储 | UTC 日 / 当前 | Analytics 估算 |
| D1 | 行读取、行写入、账户存储 | UTC 日 / 当前 | Analytics 估算 |
| R2 | Class A、Class B、当前存储快照 | UTC 月 / 当前 | Analytics 估算 |
| Queues | 计费操作 | UTC 日 | Analytics 估算 |
| Pages | 构建次数 | UTC 月 | REST API 计数 / 下限数据 |
| 可计费用量 | 当前账期成本驱动因素 | 日级 / 账期 | Billable Usage API V1 官方值 |

Workers AI、Images、Vectorize、Browser Rendering 和 Workflows 暂时只列为“近实时
额度层”的覆盖缺口；它们的计费用量仍可能出现在官方日级账单层。项目不会用缺少来源的
数据生成“看起来合理”的假进度。额度目录统一维护在
`shared/quota-catalog.ts`，当前核对日期为 `2026-07-27`。

### 数据层与缓存

- 额度风险层：复用 Analytics GraphQL 与产品 REST API，按近实时或请求时快照展示。
- 账单事实层：通过官方 TypeScript SDK `cloudflare@7.1.0` 调用
  `GET /accounts/{account_id}/billable-usage/info` 和
  `GET /accounts/{account_id}/billable-usage`。V1 仍为 Alpha，因此 SDK 固定精确版本，
  响应必须通过完整运行时契约后才能进入界面。
- Worker Cache API 对完整账户快照缓存 2 分钟，对变化更慢的官方账单原始数据缓存 1
  小时。浏览器响应仍为 `no-store`，缓存只在 Access JWT 验证成功后读取。
- 每个数据源同时返回健康状态、刷新节奏和 `dataAsOf`；日级账单不会被标成实时数据。

## 安全边界

- `wrangler.jsonc` 的唯一入口是 `worker/src/index.ts`，没有 `assets` 配置。
- Worker 关闭 `workers.dev`，仅绑定 API 自定义域名。
- Cloudflare Access 在边缘保护 API；Worker 再校验
  `Cf-Access-Jwt-Assertion` 的签名、签发方和应用 AUD。
- CORS 只回显显式允许的 Origin，浏览器响应统一 `no-store`，错误不回传凭据或内部
  堆栈。服务端短缓存不保存 API Token，也不会绕过 Access 验证。
- Vercel 通过 `vercel.json` 添加 CSP、点击劫持、MIME 嗅探、权限和来源策略。
- 生产构建不输出 source map，静态 hash 资源使用不可变长缓存。
- `/health` 在 Worker 代码层不要求 JWT，但生产 API 域名仍由 Cloudflare Access
  边缘策略保护；不要把它当作公网匿名探针。

前端保持简单的凭据 GET 请求。若未来增加会触发预检的自定义请求头，需要在 Access
应用中将 `OPTIONS` 配置为绕过到源站；当前代码不会依赖这个额外例外。

建议为 Worker 创建只读 Cloudflare API Token，仅授予：

- Account Analytics: Read
- Pages: Read（Pages 卡片）
- Billing: Read（可选官方可计费用量）

### 复用 Cloudflare 原生账单能力

完整的日成本图、产品筛选、历史账期和发票对齐信息由
[Billable Usage dashboard](https://developers.cloudflare.com/billing/manage/billable-usage/)
提供；控制台中的“打开 Cloudflare 账单中心”会直接进入这一原生界面。

总费用阈值请使用 Cloudflare 的
[Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)，不要在本项目
重复实现邮件、收件人和账期重置逻辑。Budget alerts 只负责通知，不会暂停或限制用量；
月度发票仍是最终权威记录。项目不会替用户创建或修改提醒，因为阈值和收件人属于账户
策略决策。

## 本地开发

要求 Node.js 24 LTS 与 pnpm 11。仓库的 `.node-version` 和 `packageManager`
字段固定了主版本选择。

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

`pnpm dev:worker` 会在本地显式加入 `http://localhost:5173` CORS Origin，而不会修改
生产 `wrangler.jsonc` 的单一允许来源。访问 `http://localhost:5173/?demo=1`
可直接使用无凭据的安全演示数据。

## 部署

### Cloudflare API Worker

根目录 `wrangler.jsonc` 是 Worker 配置的唯一来源：

- Worker：`cloudflare-usage-guard`
- 入口：`worker/src/index.ts`
- 自定义域名：`api.cloudflare.thanejoss.com`
- 生产允许来源：`https://cloudflare.thanejoss.com`
- Access 团队域名：`https://thanejoss.cloudflareaccess.com`
- 必需 Secrets：`CF_ACCOUNT_ID`、`CF_API_TOKEN`、`POLICY_AUD`

把生产 Secret 写入被 Git 忽略的文件，再一次性提交：

```bash
cp .dev.vars.example .prod.secrets
pnpm exec wrangler secret bulk .prod.secrets
pnpm deploy:worker
```

在 Zero Trust Access 应用中将 API 自定义域名作为 destination，为授权用户配置 Allow
策略，并把 Application Audience Tag 写入 `POLICY_AUD`。

Cloudflare Dashboard 的 `Settings > Build` 变量只属于构建过程。三个必需 Secret
必须位于 `Settings > Variables & Secrets`，才能作为 Worker 运行时绑定使用。
`TEAM_DOMAIN` 与 `ALLOWED_ORIGINS` 是非敏感配置，保存在 `wrangler.jsonc`。

Workers Builds 使用：

- Build command：`pnpm run build`
- Deploy command：`npx wrangler deploy`
- Non-production branch deploy command：`npx wrangler versions upload`
- Root directory：仓库根目录

Workers Builds 注入 `WORKERS_CI=1`，根构建脚本因此只执行 Worker TypeScript
构建；Wrangler 随后负责打包和部署。

### Vercel 静态前端

Vercel 不注入 `WORKERS_CI=1`，因此 `pnpm run build` 执行 Vite 前端构建并输出
`dist/`。`.env.production` 固定 API Origin，`vercel.json` 只配置静态前端框架与安全
响应头。前端部署不执行 Wrangler，也不会托管 Worker API。

## 质量验证

一次执行完整本地门禁：

```bash
pnpm check
pnpm build
pnpm check:bundle
WORKERS_CI=1 pnpm build
pnpm worker:types:check
pnpm worker:dry-run
pnpm audit:dependencies
```

其中：

- `pnpm check` 串行执行 Oxlint、六组 TypeScript 工程检查、Node/jsdom 单元与 UI
  测试，以及真实 workerd 运行时测试。
- UI 测试验证风险筛选、进度条可访问名称、成本驱动表语义和数据加载错误恢复。
- API 测试验证 Billable Usage V1 严格契约、账户覆盖状态和两级缓存降级行为。
- Worker 运行时测试验证健康检查、生产 CORS 和无 JWT 拒绝路径。
- 前端预算为 JS gzip 90 KiB、CSS gzip 12 KiB，同时拒绝任何生产 `.map` 文件。
- `worker:types:check` 防止 Wrangler 配置和生成的 `Env` 类型漂移。
- `worker:dry-run` 证明 API 包不包含前端 assets，并显示预期的 5 个绑定。

设计语言、状态模型、响应式策略和无障碍约束见
[`docs/design-system.md`](docs/design-system.md)。

### 首次访问与 Access 会话恢复

站点和 API 使用不同域名。登录站点不代表 API 域名已经具有 Access Cookie；
首次跨域请求可能被 Access 登录跳转拦截，浏览器仅报告 `Failed to fetch`。
前端对网络错误自动重试一次，仍失败或返回鉴权错误时，顶层导航到 API 的
`/v1/usage?access_session=1&return_to=...`，由现有 Access 策略完成验证。
Worker 验证 JWT 后仅返回 `ALLOWED_ORIGINS` 中的站点，不采集用量数据。

每个 API Origin 在当前标签页中最多自动恢复一次，成功取得用量后清除标记，
防止网络故障、权限不足或 Cookie 被禁用时无限跳转。离线或存储不可用时不自动导航，
错误页保留手动「恢复 API 会话」操作。首次授权或会话过期时，Access 仍可能要求验证身份。

部署顺序：先发布包含此恢复逻辑的 API Worker，再发布前端；API 的现有 Access
应用须继续覆盖 `/v1/usage`，无需放宽策略或暴露 Cookie/服务令牌。
参考：[Cloudflare Access CORS](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/)。
