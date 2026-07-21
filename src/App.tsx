import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  Database,
  ExternalLink,
  Gauge,
  HardDrive,
  KeyRound,
  Layers3,
  Lock,
  LogOut,
  MessageSquareMore,
  RefreshCw,
  Rocket,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Unplug,
  XCircle,
  Zap,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  OverageBehavior,
  ProductUsage,
  SourceHealth,
  UsageMetric,
  UsagePayload,
  UsageStatus,
} from "../shared/usage";
import { createDemoPayload } from "./demo";

const TOKEN_KEY = "cf-usage-dashboard-token";
const ENDPOINT_KEY = "cf-usage-dashboard-endpoint";
const configuredEndpoint = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

type Filter = "all" | "attention" | "hard-stop" | "paid-overage" | "unavailable";

export function App() {
  const isDemo = new URLSearchParams(window.location.search).get("demo") === "1";
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [endpoint, setEndpoint] = useState(
    () => localStorage.getItem(ENDPOINT_KEY) ?? configuredEndpoint,
  );
  const [data, setData] = useState<UsagePayload | null>(() =>
    isDemo ? createDemoPayload() : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const loadUsage = useCallback(
    async (nextToken = token, nextEndpoint = endpoint) => {
      if (isDemo) {
        setData(createDemoPayload());
        setError(null);
        return;
      }
      const normalizedEndpoint = normalizeEndpoint(nextEndpoint);
      if (!nextToken || !normalizedEndpoint) return;

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${normalizedEndpoint}/v1/usage`, {
          headers: { Authorization: `Bearer ${nextToken}` },
          signal: AbortSignal.timeout(25_000),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            isErrorEnvelope(body) && body.error
              ? body.error
              : `API 请求失败（HTTP ${response.status}）`;
          throw new Error(message);
        }
        if (!isUsagePayload(body)) throw new Error("API 返回了无法识别的数据");
        setData(body);
        sessionStorage.setItem(TOKEN_KEY, nextToken);
        localStorage.setItem(ENDPOINT_KEY, normalizedEndpoint);
        setEndpoint(normalizedEndpoint);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "无法连接用量 API");
      } finally {
        setLoading(false);
      }
    },
    [endpoint, isDemo, token],
  );

  useEffect(() => {
    if (!isDemo && token && endpoint && !data) void loadUsage();
  }, [data, endpoint, isDemo, loadUsage, token]);

  function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadUsage(token, endpoint);
  }

  function handleLock() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setData(null);
    setError(null);
  }

  if (!data) {
    return (
      <LoginScreen
        token={token}
        endpoint={endpoint}
        loading={loading}
        error={error}
        onTokenChange={setToken}
        onEndpointChange={setEndpoint}
        onSubmit={handleConnect}
      />
    );
  }

  return (
    <div className="app-shell">
      <Header
        demo={isDemo}
        loading={loading}
        onRefresh={() => void loadUsage()}
        onLock={handleLock}
      />
      <main>
        <Hero data={data} demo={isDemo} />
        {error ? (
          <div className="inline-error" role="alert">
            <TriangleAlert size={18} />
            <span>{error}</span>
            <button type="button" onClick={() => void loadUsage()}>重试</button>
          </div>
        ) : null}
        <SummaryStrip data={data} />
        <ProductSection
          products={data.products}
          filter={filter}
          onFilter={setFilter}
        />
        <BillingSection billing={data.billing} />
        <OperationsSection data={data} />
      </main>
      <Footer data={data} />
    </div>
  );
}

interface LoginScreenProps {
  token: string;
  endpoint: string;
  loading: boolean;
  error: string | null;
  onTokenChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function LoginScreen(props: LoginScreenProps) {
  return (
    <main className="login-page">
      <div className="login-atmosphere" aria-hidden="true" />
      <section className="login-copy">
        <Brand />
        <div className="hero-kicker"><Sparkles size={15} /> Free-tier control room</div>
        <h1>看见额度，<br />赶在停服或计费之前。</h1>
        <p>
          一个只读的 Cloudflare 用量面板。密钥留在 Worker，浏览器只使用独立的 dashboard token。
        </p>
        <a className="demo-link" href="?demo=1">
          先查看演示数据 <ArrowUpRight size={16} />
        </a>
      </section>
      <section className="login-card" aria-labelledby="connect-heading">
        <div className="login-card-icon"><KeyRound size={22} /></div>
        <div>
          <span className="section-index">01 / CONNECT</span>
          <h2 id="connect-heading">连接你的 Usage Worker</h2>
          <p>口令仅写入 sessionStorage，关闭标签页后自动清除。</p>
        </div>
        <form onSubmit={props.onSubmit}>
          <label>
            <span>Worker API 地址</span>
            <input
              type="url"
              value={props.endpoint}
              onChange={(event) => props.onEndpointChange(event.target.value)}
              placeholder="https://cloudflare-usage-api.example.workers.dev"
              required
              autoComplete="url"
            />
          </label>
          <label>
            <span>Dashboard token</span>
            <input
              type="password"
              value={props.token}
              onChange={(event) => props.onTokenChange(event.target.value)}
              placeholder="由 wrangler secret put 设置"
              required
              autoComplete="current-password"
            />
          </label>
          {props.error ? <div className="form-error" role="alert">{props.error}</div> : null}
          <button className="primary-button" type="submit" disabled={props.loading}>
            {props.loading ? <RefreshCw className="spin" size={18} /> : <Lock size={18} />}
            {props.loading ? "正在读取…" : "安全连接"}
          </button>
        </form>
        <div className="trust-row">
          <span><ShieldCheck size={15} /> Cloudflare token 不进入浏览器</span>
          <span><Check size={15} /> 只读 API</span>
        </div>
      </section>
    </main>
  );
}

function Header({
  demo,
  loading,
  onRefresh,
  onLock,
}: {
  demo: boolean;
  loading: boolean;
  onRefresh: () => void;
  onLock: () => void;
}) {
  return (
    <header className="topbar">
      <Brand />
      <div className="topbar-actions">
        <span className={`connection-chip ${demo ? "demo" : ""}`}>
          <span className="pulse-dot" /> {demo ? "DEMO DATA" : "LIVE API"}
        </span>
        <button className="icon-button" type="button" onClick={onRefresh} disabled={loading} aria-label="刷新用量">
          <RefreshCw className={loading ? "spin" : ""} size={18} />
        </button>
        {!demo ? (
          <button className="icon-button" type="button" onClick={onLock} aria-label="锁定面板">
            <LogOut size={18} />
          </button>
        ) : null}
      </div>
    </header>
  );
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="Usage Guard 首页">
      <span className="brand-mark"><Cloud size={20} strokeWidth={2.4} /></span>
      <span>Usage<span>Guard</span></span>
    </a>
  );
}

function Hero({ data, demo }: { data: UsagePayload; demo: boolean }) {
  const status = data.summary.overall;
  return (
    <section className="dashboard-hero">
      <div>
        <div className="hero-kicker"><Activity size={15} /> Account telemetry · UTC</div>
        <h1>Free tier，<br /><em>别等它用完。</em></h1>
        <p>
          聚合 Workers、存储、队列和 Pages 的免费额度。每个数据源独立失败，不让一个权限缺口遮住整个账户。
        </p>
      </div>
      <div className={`hero-status status-${status}`}>
        <span className="status-orbit" aria-hidden="true" />
        <div className="status-glyph">{statusIcon(status, 32)}</div>
        <span>ACCOUNT POSTURE</span>
        <strong>{statusTitle(status)}</strong>
        <small>{demo ? "演示快照" : `更新于 ${formatDateTime(data.generatedAt)}`}</small>
      </div>
    </section>
  );
}

function SummaryStrip({ data }: { data: UsagePayload }) {
  const cards = [
    {
      label: "已追踪指标",
      value: data.summary.trackedMetrics,
      note: `${data.products.length} 个产品`,
      icon: <BarChart3 size={19} />,
    },
    {
      label: "需要关注",
      value: data.summary.attentionMetrics,
      note: data.summary.attentionMetrics ? "超过 70%" : "全部低于 70%",
      icon: <AlertTriangle size={19} />,
      alert: data.summary.attentionMetrics > 0,
    },
    {
      label: "健康数据源",
      value: `${data.summary.healthySources}/${data.summary.totalSources}`,
      note: data.summary.unavailableProducts
        ? `${data.summary.unavailableProducts} 个产品不可用`
        : "产品数据齐全",
      icon: <ServerCog size={19} />,
    },
    {
      label: "PayGo 成本",
      value:
        data.billing.totalCost === null || !data.billing.currency
          ? "—"
          : formatMoney(data.billing.totalCost, data.billing.currency),
      note: data.billing.available ? "当前账期 API" : "权限或账户不支持",
      icon: <CircleDollarSign size={19} />,
    },
  ];

  return (
    <section className="summary-grid" aria-label="用量摘要">
      {cards.map((card) => (
        <article className={`summary-card ${card.alert ? "alert" : ""}`} key={card.label}>
          <div className="summary-icon">{card.icon}</div>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small>{card.note}</small>
        </article>
      ))}
    </section>
  );
}

function ProductSection({
  products,
  filter,
  onFilter,
}: {
  products: ProductUsage[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
}) {
  const visible = useMemo(
    () => products.filter((product) => matchesFilter(product, filter)),
    [filter, products],
  );
  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "全部" },
    { id: "attention", label: "需关注" },
    { id: "hard-stop", label: "达到即停" },
    { id: "paid-overage", label: "超额计费" },
    { id: "unavailable", label: "不可用" },
  ];

  return (
    <section className="content-section products-section">
      <div className="section-heading">
        <div>
          <span className="section-index">02 / QUOTAS</span>
          <h2>免费额度雷达</h2>
        </div>
        <div className="filter-row" role="group" aria-label="筛选产品">
          {filters.map((item) => (
            <button
              type="button"
              key={item.id}
              className={filter === item.id ? "active" : ""}
              onClick={() => onFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <div className="product-grid">
          {visible.map((product) => <ProductCard product={product} key={product.id} />)}
        </div>
      ) : (
        <div className="empty-state"><CheckCircle2 size={25} /> 当前筛选条件下没有产品</div>
      )}
    </section>
  );
}

function ProductCard({ product }: { product: ProductUsage }) {
  const highest = worstMetricStatus(product.metrics);
  return (
    <article className={`product-card product-${highest}`}>
      <div className="product-card-head">
        <div className="product-symbol">{productIcon(product.id)}</div>
        <div className="product-title">
          <span>{product.eyebrow}</span>
          <h3>{product.name}</h3>
        </div>
        <span className={`behavior behavior-${product.behavior}`}>
          {behaviorIcon(product.behavior)} {product.behaviorLabel}
        </span>
      </div>
      <p className="product-description">{product.description}</p>
      {product.error ? (
        <div className="product-error"><Unplug size={17} /> {product.error}</div>
      ) : null}
      <div className="metric-list">
        {product.metrics.map((metric) => <MetricRow metric={metric} key={metric.id} />)}
      </div>
      <div className="product-footer">
        <div className="detail-list">
          {product.partial ? <span className="partial-tag">下限数据</span> : null}
          {product.details.map((detail) => (
            <span key={detail.label}>{detail.label} <strong>{detail.value}</strong></span>
          ))}
        </div>
        <a href={product.documentationUrl} target="_blank" rel="noreferrer" aria-label={`查看 ${product.name} 文档`}>
          Docs <ExternalLink size={13} />
        </a>
      </div>
    </article>
  );
}

function MetricRow({ metric }: { metric: UsageMetric }) {
  const utilization = metric.utilization;
  const fill = utilization === null ? 0 : Math.min(utilization, 100);
  return (
    <div className={`metric-row metric-${metric.status}`}>
      <div className="metric-label">
        <span>{metric.label}</span>
        <strong>
          {metric.used === null ? "不可用" : `${formatMetricValue(metric.used, metric.unit)} / ${formatMetricValue(metric.limit, metric.unit)}`}
        </strong>
      </div>
      <div className="progress-track" aria-label={`${metric.label} 使用率`}>
        <span style={{ width: `${fill}%` }} />
      </div>
      <div className="metric-meta">
        <span>{utilization === null ? "—" : `${formatPercent(utilization)}%`}</span>
        <span>{periodLabel(metric.period)}{metric.resetAt ? ` · ${resetLabel(metric.resetAt)}` : ""}</span>
      </div>
      {metric.note ? <small className="metric-note">{metric.note}</small> : null}
    </div>
  );
}

function BillingSection({ billing }: { billing: UsagePayload["billing"] }) {
  return (
    <section className="content-section billing-section">
      <div className="section-heading">
        <div>
          <span className="section-index">03 / BILLING</span>
          <h2>PayGo 账期明细</h2>
        </div>
        {billing.available && billing.totalCost !== null && billing.currency ? (
          <div className="billing-total">
            <span>当前累计</span>
            <strong>{formatMoney(billing.totalCost, billing.currency)}</strong>
          </div>
        ) : null}
      </div>
      {!billing.available ? (
        <div className="billing-unavailable">
          <Lock size={22} />
          <div>
            <strong>PayGo 数据不可用</strong>
            <p>{billing.error}。这不会影响免费额度卡；如需精确费用，请为 API Token 添加 Billing Read。</p>
          </div>
        </div>
      ) : billing.rows.length === 0 ? (
        <div className="empty-state"><CircleDollarSign size={24} /> 当前账期暂无 PayGo 明细</div>
      ) : (
        <div className="billing-table-wrap">
          <table>
            <thead><tr><th>服务</th><th>类别</th><th>消耗量</th><th>计价量</th><th>费用</th></tr></thead>
            <tbody>
              {billing.rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.service}</strong></td>
                  <td>{row.family}</td>
                  <td>{formatCompact(row.consumed)} <small>{row.consumedUnit}</small></td>
                  <td>{formatCompact(row.pricingQuantity)}</td>
                  <td><strong>{formatMoney(row.cost, row.currency)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OperationsSection({ data }: { data: UsagePayload }) {
  return (
    <section className="content-section operations-section">
      <div className="section-heading">
        <div>
          <span className="section-index">04 / COVERAGE</span>
          <h2>数据源与覆盖边界</h2>
        </div>
      </div>
      <div className="operations-grid">
        <article className="source-panel">
          <div className="panel-title"><Activity size={18} /><h3>数据源健康</h3></div>
          <div className="source-list">
            {data.sources.map((source) => <SourceRow source={source} key={source.id} />)}
          </div>
        </article>
        <article className="gap-panel">
          <div className="panel-title"><Layers3 size={18} /><h3>尚未自动采集</h3></div>
          <div className="gap-list">
            {data.coverageGaps.map((gap) => (
              <a key={gap.name} href={gap.documentationUrl} target="_blank" rel="noreferrer">
                <div><strong>{gap.name}</strong><span>{gap.allowance}</span></div>
                <ArrowUpRight size={16} />
                <p>{gap.reason}</p>
              </a>
            ))}
          </div>
        </article>
      </div>
      <div className="disclaimer"><ShieldCheck size={18} /><p>{data.disclaimer}</p></div>
    </section>
  );
}

function SourceRow({ source }: { source: SourceHealth }) {
  return (
    <div className="source-row">
      <span className={`source-state state-${source.status}`}>{sourceIcon(source.status)}</span>
      <div><strong>{source.label}</strong><small>{source.message}</small></div>
    </div>
  );
}

function Footer({ data }: { data: UsagePayload }) {
  return (
    <footer>
      <Brand />
      <p>额度目录核对于 {data.quotaCatalogAsOf} · 边界时区 UTC · 开源自托管</p>
      <a href="https://github.com/ThaneJoss/cloudflare-usage-guard" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14} /></a>
    </footer>
  );
}

function matchesFilter(product: ProductUsage, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "unavailable") return !product.available;
  if (filter === "hard-stop") return product.behavior === "hard-stop";
  if (filter === "paid-overage") {
    return product.behavior === "paid-overage" || product.behavior === "plan-dependent";
  }
  return product.metrics.some((metric) =>
    ["watch", "critical", "exceeded"].includes(metric.status),
  );
}

function worstMetricStatus(metrics: UsageMetric[]): UsageStatus {
  const statuses = metrics.map((metric) => metric.status);
  if (statuses.includes("exceeded")) return "exceeded";
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("watch")) return "watch";
  if (statuses.includes("ok")) return "ok";
  return "unavailable";
}

function statusTitle(status: UsagePayload["summary"]["overall"]): string {
  const titles = {
    ok: "余量充足",
    watch: "开始留意",
    critical: "接近上限",
    exceeded: "额度告急",
    unknown: "等待数据",
  };
  return titles[status];
}

function statusIcon(status: UsagePayload["summary"]["overall"], size: number): ReactNode {
  if (status === "ok") return <CheckCircle2 size={size} />;
  if (status === "unknown") return <Unplug size={size} />;
  return <AlertTriangle size={size} />;
}

function productIcon(id: string): ReactNode {
  const icons: Record<string, ReactNode> = {
    workers: <Zap size={22} />,
    kv: <HardDrive size={22} />,
    d1: <Database size={22} />,
    r2: <Cloud size={22} />,
    queues: <MessageSquareMore size={22} />,
    pages: <Rocket size={22} />,
  };
  return icons[id] ?? <Gauge size={22} />;
}

function behaviorIcon(behavior: OverageBehavior): ReactNode {
  if (behavior === "hard-stop") return <XCircle size={13} />;
  if (behavior === "paid-overage") return <CircleDollarSign size={13} />;
  return <AlertTriangle size={13} />;
}

function sourceIcon(status: SourceHealth["status"]): ReactNode {
  if (status === "ok") return <Check size={14} />;
  if (status === "partial") return <AlertTriangle size={14} />;
  return <XCircle size={14} />;
}

function formatMetricValue(value: number, unit: UsageMetric["unit"]): string {
  if (unit === "bytes") return formatBytes(value);
  return formatCompact(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

function formatBytes(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} GB`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

function formatPercent(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(".0", "");
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function resetLabel(value: string): string {
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  if (diff > 0 && diff < 36 * 60 * 60 * 1_000) {
    const hours = Math.max(1, Math.ceil(diff / (60 * 60 * 1_000)));
    return `${hours}h 后重置`;
  }
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()} UTC 重置`;
}

function periodLabel(period: UsageMetric["period"]): string {
  return period === "day" ? "今日" : period === "month" ? "本月" : "当前";
}

function normalizeEndpoint(value: string): string {
  const normalized = value.trim().replace(/\/$/, "");
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" || url.hostname === "localhost" ? url.origin : "";
  } catch {
    return "";
  }
}

function isErrorEnvelope(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

function isUsagePayload(value: unknown): value is UsagePayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "generatedAt" in value &&
      "products" in value &&
      Array.isArray((value as { products?: unknown }).products),
  );
}
