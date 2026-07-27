import { Activity, RefreshCw } from "lucide-react";

import type { UsagePayload } from "../../shared/usage";
import { formatDateTime } from "../lib/usage";
import { Brand } from "./Brand";

interface DashboardHeaderProps {
  data: UsagePayload;
  demo: boolean;
  loading: boolean;
  stale: boolean;
  onRefresh: () => void;
}

export function DashboardHeader({
  data,
  demo,
  loading,
  stale,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <Brand compact />
        <nav aria-label="主要导航">
          <a href="#overview">总览</a>
          <a href="#quotas">额度</a>
          <a href="#billing">费用</a>
          <a href="#coverage">数据源</a>
        </nav>
        <div className="header-actions">
          <div
            className={`connection-state ${
              stale ? "is-stale" : demo ? "is-demo" : "is-live"
            }`}
            aria-label={
              stale
                ? "刷新失败，正在显示旧快照"
                : demo
                  ? "正在显示演示数据"
                  : "实时 API 已连接"
            }
          >
            <Activity size={13} aria-hidden="true" />
            <span>{stale ? "STALE" : demo ? "DEMO" : "LIVE"}</span>
            <small>{formatDateTime(data.generatedAt)}</small>
          </div>
          <button
            className="refresh-button"
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label={loading ? "正在刷新用量" : "刷新用量"}
          >
            <RefreshCw className={loading ? "spin" : ""} size={17} />
            <span>{loading ? "同步中" : "刷新"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
