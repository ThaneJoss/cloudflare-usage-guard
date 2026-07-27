import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  DatabaseZap,
  Radio,
  ShieldCheck,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type { UsagePayload } from "../../shared/usage";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  rankMetricSignals,
  resetLabel,
  statusAction,
  statusLabel,
} from "../lib/usage";

export function DashboardOverview({
  data,
  demo,
}: {
  data: UsagePayload;
  demo: boolean;
}) {
  const signals = rankMetricSignals(data.products);
  const primarySignal = signals[0];
  const meterValue = Math.min(primarySignal?.metric.utilization ?? 0, 100);
  const meterStyle: CSSProperties & { "--meter-value": string } = {
    "--meter-value": `${meterValue * 3.6}deg`,
  };

  return (
    <section id="overview" className="overview-section" aria-labelledby="overview-title">
      <div className="overview-copy">
        <div className="eyebrow">
          <span className="live-wave" aria-hidden="true" />
          Account telemetry / UTC
        </div>
        <h1 id="overview-title">
          边缘资源，
          <span>一眼掌控。</span>
        </h1>
        <p>
          从免费额度到可计费用量，把分散的 Cloudflare 信号整理成清晰的风险顺序。
          数据源独立降级，单点权限缺口不会遮住整个账户。
        </p>
        <div className="overview-meta">
          <span><Radio size={14} /> {demo ? "演示快照" : "实时账户快照"}</span>
          <span>生成于 {formatDateTime(data.generatedAt)}</span>
        </div>
      </div>

      <article
        className={`posture-card status-${data.summary.overall}`}
        aria-label={`账户态势：${statusLabel(data.summary.overall)}`}
      >
        <div className="posture-grid" aria-hidden="true" />
        <div className="posture-meter" style={meterStyle}>
          <div>
            {statusIcon(data.summary.overall)}
            <span>RISK POSTURE</span>
            <strong>{statusLabel(data.summary.overall)}</strong>
          </div>
        </div>
        <p>{statusAction(data.summary.overall)}</p>
        <div className="posture-footer">
          <span>峰值压力</span>
          <strong>
            {primarySignal?.metric.utilization === null ||
            primarySignal?.metric.utilization === undefined
              ? "—"
              : `${formatPercent(primarySignal.metric.utilization)}%`}
          </strong>
        </div>
      </article>

      <div className="summary-grid" aria-label="账户摘要">
        <SummaryCard
          icon={<BarChart3 size={18} />}
          label="已追踪指标"
          value={String(data.summary.trackedMetrics)}
          note={`${data.products.length} 个 Cloudflare 产品`}
        />
        <SummaryCard
          icon={<AlertTriangle size={18} />}
          label="需要关注"
          value={String(data.summary.attentionMetrics)}
          note={
            data.summary.attentionMetrics > 0
              ? "已进入 70% 以上区间"
              : "目前没有阈值告警"
          }
          tone={data.summary.attentionMetrics > 0 ? "danger" : "success"}
        />
        <SummaryCard
          icon={<DatabaseZap size={18} />}
          label="数据源健康"
          value={`${data.summary.healthySources}/${data.summary.totalSources}`}
          note={
            data.summary.unavailableProducts
              ? `${data.summary.unavailableProducts} 个产品不可用`
              : "所有核心采集器在线"
          }
          tone={
            data.summary.healthySources === data.summary.totalSources
              ? "success"
              : "warning"
          }
        />
        <SummaryCard
          icon={<CircleDollarSign size={18} />}
          label="PayGo 当前累计"
          value={
            data.billing.totalCost === null || !data.billing.currency
              ? "—"
              : formatMoney(data.billing.totalCost, data.billing.currency)
          }
          note={data.billing.available ? "精确账期 API" : "权限或账户暂不支持"}
        />
      </div>

      <article className="signal-board" aria-labelledby="signal-title">
        <div className="signal-board-heading">
          <div>
            <span className="section-code">PRIORITY / NOW</span>
            <h2 id="signal-title">当前压力信号</h2>
          </div>
          <a href="#quotas">查看全部额度 <ArrowRight size={15} /></a>
        </div>
        <div className="signal-list">
          {signals.slice(0, 3).map(({ metric, product }, index) => (
            <div className={`signal-item metric-${metric.status}`} key={metric.id}>
              <span className="signal-rank">0{index + 1}</span>
              <div className="signal-name">
                <strong>{product.name}</strong>
                <span>{metric.label}</span>
              </div>
              <div className="signal-bar" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.min(metric.utilization ?? 0, 100)}%`,
                  }}
                />
              </div>
              <div className="signal-value">
                <strong>{formatPercent(metric.utilization ?? 0)}%</strong>
                <span>
                  {metric.resetAt ? resetLabel(metric.resetAt) : "持续用量"}
                </span>
              </div>
              <ArrowDownRight size={17} aria-hidden="true" />
            </div>
          ))}
          {signals.length === 0 ? (
            <div className="signal-empty">
              <CheckCircle2 size={20} />
              暂无可比较的用量信号
            </div>
          ) : null}
        </div>
      </article>
    </section>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  note,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <article className={`summary-card tone-${tone}`}>
      <span className="summary-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function statusIcon(status: UsagePayload["summary"]["overall"]): ReactNode {
  if (status === "ok") return <ShieldCheck size={25} aria-hidden="true" />;
  if (status === "unknown") return <Activity size={25} aria-hidden="true" />;
  return <AlertTriangle size={25} aria-hidden="true" />;
}
