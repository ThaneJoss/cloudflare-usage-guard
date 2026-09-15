import { AlertTriangle, ArrowRight, ExternalLink, RefreshCw } from "lucide-react";

import type { UsageLoadError } from "../hooks/useUsageData";
import { normalizeEndpoint } from "../lib/usage";
import { accessSessionUrl } from "../lib/access-session";
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
              href={accessSessionUrl(normalizedEndpoint, window.location.href)}
              rel="noreferrer"
            >
              恢复 API 会话
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          ) : null}
        </div>
        <small>
          API 地址由部署环境固定。首次访问或会话过期时，会通过 Cloudflare Access
          验证 API 域名的会话并返回此页，无需填写端点。
        </small>
        <a className="fatal-demo-link" href="?demo=1">
          使用演示数据检查界面
          <ArrowRight size={15} aria-hidden="true" />
        </a>
      </section>
    </main>
  );
}
