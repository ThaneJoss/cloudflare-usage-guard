import { useState } from "react";

import { CoverageSection } from "./components/CoverageSection";
import { DataLoadErrorScreen } from "./components/DataLoadErrorScreen";
import { DashboardHeader } from "./components/DashboardHeader";
import { DashboardOverview } from "./components/DashboardOverview";
import { DashboardFooter } from "./components/DashboardFooter";
import { LoadingScreen } from "./components/LoadingScreen";
import { BillingSection } from "./components/BillingSection";
import { UsageSection } from "./components/UsageSection";
import { useUsageData } from "./hooks/useUsageData";
import type { ProductFilter } from "./lib/usage";

export function App() {
  const usage = useUsageData();
  const [filter, setFilter] = useState<ProductFilter>("all");

  if (!usage.data && usage.phase === "loading") {
    return <LoadingScreen />;
  }

  if (!usage.data) {
    return (
      <DataLoadErrorScreen
        endpoint={usage.endpoint}
        error={usage.error}
        onRetry={usage.refresh}
      />
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <DashboardHeader
        data={usage.data}
        demo={usage.isDemo}
        loading={usage.phase === "refreshing"}
        stale={Boolean(usage.error)}
        onRefresh={usage.refresh}
      />
      <main
        id="main-content"
        className="dashboard-main"
        aria-busy={usage.phase === "refreshing"}
      >
        {usage.error ? (
          <div className="inline-alert" role="alert" aria-live="assertive">
            <span className="signal-dot signal-dot-danger" aria-hidden="true" />
            <div>
              <strong>刷新失败，仍显示上一次成功快照</strong>
              <span>{usage.error.message}</span>
            </div>
            <button type="button" onClick={usage.refresh}>
              重新同步
            </button>
          </div>
        ) : null}
        <DashboardOverview data={usage.data} demo={usage.isDemo} />
        <UsageSection
          products={usage.data.products}
          filter={filter}
          onFilterChange={setFilter}
        />
        <BillingSection billing={usage.data.billing} />
        <CoverageSection data={usage.data} />
      </main>
      <DashboardFooter data={usage.data} />
    </div>
  );
}
