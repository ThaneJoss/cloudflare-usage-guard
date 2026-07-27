import {
  Activity,
  ArrowUpRight,
  Check,
  CircleDashed,
  DatabaseZap,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

import type { SourceHealth, UsagePayload } from "../../shared/usage";
import { sourceHealthLabel } from "../lib/usage";

export function CoverageSection({ data }: { data: UsagePayload }) {
  return (
    <section id="coverage" className="content-section coverage-section" aria-labelledby="coverage-title">
      <div className="section-heading">
        <div>
          <span className="section-code">TRUST / 04</span>
          <h2 id="coverage-title">数据源与观测边界</h2>
          <p>明确什么已被监控，也明确什么还没有，避免产生错误安全感。</p>
        </div>
        <div className="coverage-score">
          <DatabaseZap size={17} />
          <span>健康采集器</span>
          <strong>{data.summary.healthySources}/{data.summary.totalSources}</strong>
        </div>
      </div>

      <div className="coverage-grid">
        <article className="source-panel">
          <div className="panel-heading">
            <span className="panel-icon"><Activity size={17} /></span>
            <div>
              <span>LIVE SOURCES</span>
              <h3>数据源健康</h3>
            </div>
          </div>
          <div className="source-list">
            {data.sources.map((source) => (
              <SourceRow source={source} key={source.id} />
            ))}
          </div>
        </article>

        <article className="gap-panel">
          <div className="panel-heading">
            <span className="panel-icon"><CircleDashed size={17} /></span>
            <div>
              <span>COVERAGE MAP</span>
              <h3>尚未自动采集</h3>
            </div>
          </div>
          <div className="gap-list">
            {data.coverageGaps.map((gap) => (
              <a
                key={gap.name}
                href={gap.documentationUrl}
                target="_blank"
                rel="noreferrer"
              >
                <div>
                  <strong>{gap.name}</strong>
                  <span>{gap.allowance}</span>
                </div>
                <ArrowUpRight size={15} />
                <p>{gap.reason}</p>
              </a>
            ))}
          </div>
        </article>
      </div>

      <aside className="data-disclaimer">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>如何解读这些数据</strong>
          <p>{data.disclaimer}</p>
        </div>
      </aside>
    </section>
  );
}

function SourceRow({ source }: { source: SourceHealth }) {
  return (
    <div className={`source-row source-${source.status}`}>
      <span className="source-icon" aria-hidden="true">
        {sourceIcon(source.status)}
      </span>
      <div>
        <strong>{source.label}</strong>
        <small>{source.message}</small>
      </div>
      <span className="source-label">{sourceHealthLabel(source.status)}</span>
    </div>
  );
}

function sourceIcon(status: SourceHealth["status"]): ReactNode {
  if (status === "ok") return <Check size={14} />;
  if (status === "partial") return <TriangleAlert size={14} />;
  return <X size={14} />;
}
