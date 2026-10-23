import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";

import type { UsageLoadError } from "../hooks/useUsageData";
import { Brand } from "./Brand";

interface DataLoadErrorScreenProps {
  error: UsageLoadError | null;
  onRetry: () => void;
}

export function DataLoadErrorScreen({
  error,
  onRetry,
}: DataLoadErrorScreenProps) {
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
          {error?.kind === "access" ? (
            <button type="button" onClick={() => window.location.reload()}>
              刷新页面以登录
            </button>
          ) : null}
        </div>
        <small>
          登录过期时，刷新页面即可重新验证身份。若仍无法访问，请检查账户权限。
        </small>
        <a className="fatal-demo-link" href="?demo=1">
          使用演示数据检查界面
          <ArrowRight size={15} aria-hidden="true" />
        </a>
      </section>
    </main>
  );
}
