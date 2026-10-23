# Cloudflare Usage Guard

面向 Cloudflare 账户的只读边缘资源指挥台。它把近实时额度风险、数据源健康与官方
可计费用量整理成风险优先的单页控制台，在额度变成停服或费用前给出清晰信号。

部署架构使用一个 Cloudflare Worker 和一个受 Access 保护的域名：

```text
浏览器 ── Cloudflare Access ── cloudflare.thanejoss.com
                              ├── 静态资源：React / Vite dist/
                              └── /v1/usage：Worker 验证 JWT ── Cloudflare 只读 API
```

- 前端：React 19、TypeScript 7、Vite 8，由 Workers Static Assets 托管。
- 后端：同一个 `cloudflare-usage-guard` Worker，浏览器通过相对路径
  `/v1/usage` 发起同源请求。
- 运行时契约：API Token 只存在于 Worker Secret；浏览器不配置或保存 API 端点与凭据。
- 数据契约：前后端复用同一份 Zod Mini 响应契约，官方账单响应另做严格校验，避免
  字段缺失被静默解释成零费用。
- 工程门禁：Oxlint、严格 TypeScript、Vitest、Testing Library、workerd
  运行时测试、Playwright/axe 浏览器验收、产物预算和 Wrangler dry-run。

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

- `wrangler.jsonc` 同时声明 `worker/src/index.ts` 入口与 `dist/` 静态资源。
  `/v1`、`/v1/*` 和 `/health` 先进入 Worker，其余路径按静态资源和 SPA 回退规则处理。
- Worker 关闭 `workers.dev` 和预览 URL，仅绑定 `cloudflare.thanejoss.com`。
- Cloudflare Access 在边缘保护主域全部路径；Worker 对用量 API 再校验
  `Cf-Access-Jwt-Assertion` 的签名、签发方和主域 Access 应用 AUD。
- 前端请求使用 `credentials: "same-origin"`，不再维护跨域 CORS 或 API 会话恢复跳转。
  API 浏览器响应统一 `no-store`，错误不回传凭据或内部堆栈。服务端短缓存不保存
  API Token，也不会绕过 Access 验证。
- `public/_headers` 为静态资源添加 CSP、点击劫持、MIME 嗅探、权限和来源策略；
  Worker API 的响应头由 Worker 自己设置。
- 生产构建不输出 source map，静态 hash 资源使用不可变长缓存。
- `/health` 在 Worker 代码层不要求 JWT，但生产主域仍由 Cloudflare Access
  边缘策略保护；不要把它当作公网匿名探针。

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
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
pnpm dev:worker
```

另开终端：

```bash
pnpm dev
```

`pnpm dev:worker` 先构建前端，确保本地 Worker 的静态资源目录存在。
Vite 将 `/v1` 和 `/health` 代理到 `http://localhost:8787` 的本地 Worker。
开发时运行两个进程，浏览器仍只请求 `http://localhost:5173` 下的同源路径。
本地 Worker 保留 JWT 校验；没有 Access 凭据时，访问
`http://localhost:5173/?demo=1` 可使用无凭据的安全演示数据。

## 部署

### 单域名 Worker 与静态资源

根目录 `wrangler.jsonc` 是 Worker 配置的唯一来源：

- Worker：`cloudflare-usage-guard`
- 入口：`worker/src/index.ts`
- 静态资源目录：`dist/`，启用 SPA 回退
- 自定义域名：`cloudflare.thanejoss.com`
- Access 团队域名：`https://thanejoss.cloudflareaccess.com`
- 必需 Secrets：`CF_ACCOUNT_ID`、`CF_API_TOKEN`、`POLICY_AUD`

`POLICY_AUD` 必须使用现有 **主域** `cloudflare.thanejoss.com` Access 应用的
Application Audience Tag。原 `api.cloudflare.thanejoss.com` 应用的 AUD 不再适用。
主域应用应覆盖全部路径，并继续对授权用户执行既有 Allow 策略。

把生产 Secret 写入被 Git 忽略的文件；部署前先填入实际值，保留现有只读账户凭据，
并核对新的主域 `POLICY_AUD`：

```bash
cp .dev.vars.example .prod.secrets
pnpm build
pnpm exec wrangler deploy --secrets-file .prod.secrets
```

部署会一起上传 Worker 与 `dist/`，无需分别发布前端和 API。`.prod.secrets` 只用于
本地部署，不得提交到仓库或复制到前端构建变量中。后续运行时 Secrets 已正确配置后，
可使用 `pnpm deploy:worker` 自动构建并发布完整应用。

Cloudflare Dashboard 的 `Settings > Build` 变量只属于构建过程。三个必需 Secret
必须位于 `Settings > Variables & Secrets`，才能作为 Worker 运行时绑定使用。
`TEAM_DOMAIN` 是非敏感配置，保存在 `wrangler.jsonc`；前端不需要 `VITE_API_BASE_URL`
或 `.env.production`。

Workers Builds 使用：

- Build command：`pnpm run build`
- Deploy command：`npx wrangler deploy`
- Non-production branch deploy command：`npx wrangler versions upload`
- Root directory：仓库根目录

`pnpm build` 在本地和 Workers Builds 中都构建前端并执行 Worker TypeScript 检查，
不再根据 `WORKERS_CI` 选择构建目标。Wrangler 随后负责打包 Worker 并上传静态资源。
非生产分支版本上传不启用公共预览 URL。

### 从 Vercel 与 API 子域迁移

以下步骤是部署操作说明，不代表生产环境已经完成迁移：

1. 记录当前 Vercel 生产版本、主域 DNS / 自定义域名绑定、API Worker 版本及旧 API
   Access AUD，确认能够恢复原交付链。先保留原 Vercel 项目和旧 API Access 应用。
2. 核对现有主域 Access 应用覆盖页面、`/v1/*` 与 `/health`，将其 AUD 准备为新的
   `POLICY_AUD`。不要提前向旧 API Worker 单独写入新 AUD，以免切换前的旧前端失去访问能力。
   若先用 `wrangler versions upload --secrets-file` 上传新版本，须在上传静态资源前
   显式关闭并回读确认线上 `workers.dev` 与预览入口；版本上传不会应用配置文件中的
   触发器变更，仅设置 `preview_urls: false` 不足以关闭已经开放的预览入口。
3. 完成本地质量验证，构建包含 `dist/` 的完整应用。安排切换窗口，按 Cloudflare
   自定义域名要求处理主域现有 Vercel DNS 记录，并将完整 Worker、静态资源和新 AUD
   一起发布到主域；核对最终域名绑定，旧 API 子域退出新应用配置。
4. 通过主域验证首次登录、页面与静态资源、`/v1/usage`、刷新及会话过期提示；核对
   安全响应头、静态缓存、未授权访问和 Worker 日志。确认默认域名与预览入口未开放。
5. 验证完成后再清理原 Vercel 部署及旧 API 域相关配置。若需回滚，恢复旧前端主域绑定、
   原 API Worker 版本与子域路由，并核对 / 恢复旧 API AUD 等运行时 Secrets；不能只恢复代码。

## 质量验证

GitHub Actions 的 `.github/workflows/ci.yml` 统一调用
`ThaneJoss/github-ci/.github/workflows/ci.yml@main`。
通用 CI 根据 `.node-version`、`packageManager` 和锁文件自动安装依赖，发现并执行
`lint`、`typecheck`、`test:ci`、`build` 及依赖审计。工作流调用文件保留单一 `@main` 引用，新触发自动跟随模板更新，
项目测试入口通过 `package.json` 中的标准 `test:ci` 脚本声明。
产物预算、Worker 类型漂移与 Wrangler dry-run 不再由 CI 单独执行，
对应脚本仍可在本地使用。具体执行、失败和未运行的检查以 Actions 结果为准。

一次执行完整本地门禁：

```bash
pnpm check
pnpm build
pnpm check:bundle
pnpm worker:types:check
pnpm worker:dry-run
pnpm audit:dependencies
pnpm exec playwright install chromium
pnpm test:e2e
```

其中：

- `pnpm check` 串行执行 Oxlint、七组 TypeScript 工程检查、Node/jsdom 单元与 UI
  测试，以及真实 workerd 运行时测试。
- `pnpm test:ci` 是通用 CI 优先发现的测试入口：先执行 `pnpm test`，再安装
  Chromium 并执行 `pnpm test:e2e`。`test:worker-runtime` 会先构建前端，供真实
  workerd 测试读取静态资源，后续浏览器测试复用同一份 `dist/`。CI 使用 GitHub
  Ubuntu runner 已有的浏览器系统库；缺少运行依赖时浏览器启动会失败。
- UI 测试验证风险筛选、进度条可访问名称、成本驱动表语义和数据加载错误恢复。
- `pnpm test:e2e` 在已构建的 `dist/` 上执行桌面与移动端 Chromium 验收，检查
  风险筛选、键盘跳转、横向溢出、账单列标题和 axe 无障碍规则。浏览器仅访问
  本地预览，使用演示数据或拦截的 API 响应，不需要 Access 会话或 Cloudflare 凭据。
- API 测试验证 Billable Usage V1 严格契约、账户覆盖状态和两级缓存降级行为。
- Worker 运行时测试验证健康检查、API 路由边界和无 JWT 拒绝路径。
- 前端预算为 JS gzip 90 KiB、CSS gzip 12 KiB，同时拒绝任何生产 `.map` 文件。
- `worker:types:check` 防止 Wrangler 配置和生成的 `Env` 类型漂移。
- `worker:dry-run` 验证完整 Worker 与静态资源部署配置，以及预期的运行时绑定。

`.github/workflows/ci.yml` 在推送、PR、合并队列及手动触发时运行通用 CI。
浏览器检查结果可在 Actions 日志中查看；通用模板不上传浏览器报告、截图或 trace
作为 artifacts。本地执行 `pnpm test:e2e` 后，可在 `playwright-report/` 查看 HTML
报告，在 `test-results/` 查看截图与失败时保留的 trace。

设计语言、状态模型、响应式策略和无障碍约束见
[`docs/design-system.md`](docs/design-system.md)。

### 首次访问与 Access 会话过期

页面和 API 共用主域 Access 会话。浏览器请求相对路径 `/v1/usage`，不读取 Access
Cookie、不配置跨域 API 端点，也不自动跳转到独立 API 域恢复会话。

首次访问由主域 Access 完成身份验证。会话过期或权限不足时，错误页提供手动刷新页面
重新登录的操作；网络错误仍可重试，API / 数据契约错误保持独立诊断。若刷新后仍无法
访问，应核对账户的 Access 授权及 Worker 使用的主域 `POLICY_AUD`。
