import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  Database,
  Gauge,
  HardDrive,
  MessageSquareMore,
  Rocket,
  ShieldAlert,
  Unplug,
  XCircle,
  Zap,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

import type {
  OverageBehavior,
  ProductUsage,
  UsageMetric,
} from "../../shared/usage";
import {
  behaviorLabel,
  formatMetricValue,
  formatPercent,
  matchesProductFilter,
  periodLabel,
  precisionLabel,
  PRODUCT_FILTERS,
  type ProductFilter,
  resetLabel,
  statusLabel,
  worstMetricStatus,
} from "../lib/usage";

interface UsageSectionProps {
  products: ProductUsage[];
  filter: ProductFilter;
  onFilterChange: (filter: ProductFilter) => void;
}

export function UsageSection({
  products,
  filter,
  onFilterChange,
}: UsageSectionProps) {
  const visibleProducts = useMemo(
    () => products.filter((product) => matchesProductFilter(product, filter)),
    [filter, products],
  );

  return (
    <section id="quotas" className="content-section usage-section" aria-labelledby="quota-title">
      <div className="section-heading">
        <div>
          <span className="section-code">CAPACITY / 02</span>
          <h2 id="quota-title">免费额度雷达</h2>
          <p>按风险、停服方式和计费行为筛选当前资源。</p>
        </div>
        <div className="filter-tabs" role="group" aria-label="筛选 Cloudflare 产品">
          {PRODUCT_FILTERS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={filter === item.id ? "is-active" : ""}
              onClick={() => onFilterChange(item.id)}
              aria-pressed={filter === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {visibleProducts.length ? (
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <ProductCard product={product} key={product.id} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <CheckCircle2 size={23} />
          <div>
            <strong>当前筛选下没有产品</strong>
            <span>换一个条件查看其余资源。</span>
          </div>
        </div>
      )}
    </section>
  );
}

function ProductCard({ product }: { product: ProductUsage }) {
  const status = worstMetricStatus(product.metrics);

  return (
    <article className={`product-card status-${status}`}>
      <div className="product-card-head">
        <div className="product-identity">
          <span className="product-icon" aria-hidden="true">
            {productIcon(product.id)}
          </span>
          <div>
            <span>{product.eyebrow}</span>
            <h3>{product.name}</h3>
          </div>
        </div>
        <div className={`risk-badge status-${status}`}>
          <span />
          {statusLabel(status)}
        </div>
      </div>

      <p className="product-description">{product.description}</p>

      <div className="product-context">
        <span>{behaviorIcon(product.behavior)} {behaviorLabel(product.behavior)}</span>
        <span>{product.sourceLabel}</span>
      </div>

      {product.error ? (
        <div className="product-error" role="status">
          <Unplug size={16} aria-hidden="true" />
          <span>{product.error}</span>
        </div>
      ) : null}

      <div className="metric-list">
        {product.metrics.map((metric) => (
          <MetricRow metric={metric} key={metric.id} />
        ))}
      </div>

      <div className="product-card-footer">
        <div className="detail-list">
          {product.partial ? (
            <span className="partial-tag"><ShieldAlert size={12} /> 下限数据</span>
          ) : null}
          {product.details.map((detail) => (
            <span key={detail.label}>
              {detail.label} <strong>{detail.value}</strong>
            </span>
          ))}
        </div>
        <a
          href={product.documentationUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`查看 ${product.name} 官方文档`}
        >
          官方文档 <ArrowUpRight size={13} />
        </a>
      </div>
    </article>
  );
}

function MetricRow({ metric }: { metric: UsageMetric }) {
  const utilization = metric.utilization;
  const fill = utilization === null ? 0 : Math.min(utilization, 100);
  const valueText =
    metric.used === null
      ? "数据不可用"
      : `${formatMetricValue(metric.used, metric.unit)} / ${formatMetricValue(
          metric.limit,
          metric.unit,
        )}`;

  const progressAria =
    utilization === null
      ? { "aria-valuetext": "数据不可用" }
      : {
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": Math.round(utilization),
          "aria-valuetext": `${formatPercent(utilization)}%`,
        };

  return (
    <div className={`metric-row metric-${metric.status}`}>
      <div className="metric-heading">
        <span>{metric.label}</span>
        <strong>{valueText}</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`${metric.label} 使用率`}
        {...progressAria}
      >
        <span style={{ width: `${fill}%` }} />
      </div>
      <div className="metric-meta">
        <strong>
          {utilization === null ? "—" : `${formatPercent(utilization)}%`}
        </strong>
        <span>
          {precisionLabel(metric.precision)} · {periodLabel(metric.period)}
          {metric.resetAt ? ` · ${resetLabel(metric.resetAt)}` : ""}
        </span>
      </div>
      {metric.note ? <small className="metric-note">{metric.note}</small> : null}
    </div>
  );
}

function productIcon(id: string): ReactNode {
  const icons: Record<string, ReactNode> = {
    workers: <Zap size={21} />,
    kv: <HardDrive size={21} />,
    d1: <Database size={21} />,
    r2: <Cloud size={21} />,
    queues: <MessageSquareMore size={21} />,
    pages: <Rocket size={21} />,
  };
  return icons[id] ?? <Gauge size={21} />;
}

function behaviorIcon(behavior: OverageBehavior): ReactNode {
  if (behavior === "hard-stop") return <XCircle size={13} />;
  if (behavior === "paid-overage") return <CircleDollarSign size={13} />;
  return <AlertTriangle size={13} />;
}
