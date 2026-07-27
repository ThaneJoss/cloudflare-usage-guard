import { AlertTriangle, ArrowRight, ExternalLink, RefreshCw } from "lucide-react";

import type { UsageLoadError } from "../hooks/useUsageData";
import { normalizeEndpoint } from "../lib/usage";
import { Brand } from "./Brand";

interface DataLoadErrorScreenProps {
  endpoint: string;
  error: UsageLoadError | null;
  onRetry: () => void;
}

export function DataLoadErrorScreen({
  endpoint,
  error,
  onRetry,
}: DataLoadErrorScreenProps) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const canInspectAccess =
    error?.kind === "access" || error?.kind === "network";

  return (
    <main className="fatal-page">
      <Brand />
      <section className="fatal-card" aria-labelledby="data-error-title">
        <span className="fatal-icon" aria-hidden="true">
          <AlertTriangle size={24} />
        </span>
        <span className="section-code">RECOVERY / DATA</span>
        <h1 id="data-error-title">暂时无法载入控制台</h1>
        <p>
          {error?.message ?? "用量 API 尚未返回可用数据，请稍后重试。"}
        </p>
        <div className="fatal-actions">
          <button type="button" onClick={onRetry}>
            <RefreshCw size={17} aria-hidden="true" />
            重新同步
          </button>
          {normalizedEndpoint && canInspectAccess ? (
            <a
              href={`${normalizedEndpoint}/v1/usage`}
              target="_blank"
              rel="noreferrer"
            >
              检查 API 状态
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          ) : null}
        </div>
        <small>
          API 地址由部署环境固定，身份由 Cloudflare Access 在站点入口统一处理，
          无需再次登录或填写端点。
        </small>
        <a className="fatal-demo-link" href="?demo=1">
          使用演示数据检查界面
          <ArrowRight size={15} aria-hidden="true" />
        </a>
      </section>
    </main>
  );
}
