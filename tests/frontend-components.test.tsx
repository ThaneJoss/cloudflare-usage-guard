// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DashboardOverview } from "../src/components/DashboardOverview";
import { BillingSection } from "../src/components/BillingSection";
import { DataLoadErrorScreen } from "../src/components/DataLoadErrorScreen";
import { UsageSection } from "../src/components/UsageSection";
import { createDemoPayload } from "../src/demo";
import type { UsageLoadError } from "../src/hooks/useUsageData";
import type { ProductFilter } from "../src/lib/usage";

describe("控制台组件", () => {
  it("额度卡提供可访问进度值并支持风险筛选", async () => {
    const payload = createDemoPayload();
    const user = userEvent.setup();

    function FilterableUsage() {
      const [filter, setFilter] = useState<ProductFilter>("all");
      return (
        <UsageSection
          products={payload.products}
          filter={filter}
          onFilterChange={setFilter}
        />
      );
    }

    render(<FilterableUsage />);

    expect(screen.getAllByRole("progressbar")).toHaveLength(14);
    await user.click(screen.getByRole("button", { name: "需要关注" }));
    expect(screen.getByRole("heading", { name: "Workers" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Workers KV" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "R2" })).not.toBeInTheDocument();
  });

  it("账单成本驱动表复用官方账单中心并保留可访问结构", () => {
    render(<BillingSection billing={createDemoPayload().billing} />);

    expect(
      screen.getByRole("table", { name: "当前账期成本驱动因素" }),
    ).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "费用" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: /打开 Cloudflare 账单中心/ }),
    ).toHaveAttribute(
      "href",
      "https://dash.cloudflare.com/?to=%2F%3Aaccount%2Fbilling",
    );
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("超额进度值保持在量程内，读屏仍能获取真实超额比例", () => {
    const payload = createDemoPayload();
    const workers = payload.products.find((product) => product.id === "workers")!;
    const metric = workers.metrics[0]!;

    render(
      <UsageSection
        products={[{
          ...workers,
          metrics: [{ ...metric, used: 125_000, utilization: 125, status: "exceeded" }],
        }]}
        filter="all"
        onFilterChange={vi.fn()}
      />,
    );

    const progress = screen.getByRole("progressbar", { name: `${metric.label} 使用率` });
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "100");
    expect(progress).toHaveAttribute("aria-valuenow", "100");
    expect(progress).toHaveAttribute("aria-valuetext", "125%");
    expect(screen.getByText("125%")).toBeVisible();
  });

  it("明确区分账单 API 未覆盖与权限错误", () => {
    const billing = {
      ...createDemoPayload().billing,
      covered: false,
      totalCost: null,
      currency: null,
      rows: [],
    };

    render(<BillingSection billing={billing} />);

    expect(screen.getByText("此账户暂未纳入 API 覆盖")).toBeVisible();
    expect(screen.queryByText(/Billing Read 权限/)).not.toBeInTheDocument();
  });

  it("数据加载失败时提供恢复操作，不再要求手工配置 API 地址", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const baseProps = {
      onRetry,
    };
    const contractError: UsageLoadError = {
      kind: "contract",
      message: "前后端版本不一致",
    };
    const accessError: UsageLoadError = {
      kind: "access",
      message: "身份验证失败",
    };

    const view = render(
      <DataLoadErrorScreen {...baseProps} error={contractError} />,
    );
    expect(
      screen.getByRole("heading", { name: "暂时无法载入控制台" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Worker API 地址")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "刷新页面以登录" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新同步" }));
    expect(onRetry).toHaveBeenCalledOnce();

    view.rerender(<DataLoadErrorScreen {...baseProps} error={accessError} />);
    expect(
      screen.getByRole("button", { name: "刷新页面以登录" }),
    ).toBeVisible();
  });
  it("R2 类别未知不会显示健康、重置时间或下限标签", () => {
    const payload = createDemoPayload();
    const product = payload.products.find((item) => item.id === "r2")!;
    product.partial = true;
    product.error = "存储类别未区分，免费额度无法判断";
    for (const metric of product.metrics) {
      metric.used = null;
      metric.utilization = null;
      metric.resetAt = null;
      metric.status = "unavailable";
    }
    render(<UsageSection products={[product]} filter="attention" onFilterChange={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "R2" })).toBeVisible();
    expect(screen.getByText("额度未完全确认")).toBeVisible();
    expect(screen.getByText(/存储类别未区分/)).toBeVisible();
    expect(screen.queryByText("运行稳健")).not.toBeInTheDocument();
    expect(screen.queryByText("下限数据")).not.toBeInTheDocument();
    expect(screen.queryByText(/重置/)).not.toBeInTheDocument();
    for (const bar of screen.getAllByRole("progressbar")) {
      expect(bar).not.toHaveAttribute("aria-valuenow");
    }
  });

  it("部分数据不能显示全部采集器在线或没有风险", () => {
    const payload = createDemoPayload();
    for (const product of payload.products) product.partial = true;
    payload.summary = { ...payload.summary, overall: "unknown", attentionMetrics: 0, unavailableProducts: 0, healthySources: 6 };
    render(<DashboardOverview data={payload} demo={false} />);
    expect(screen.getByText("额度未完全确认")).toBeVisible();
    expect(screen.getByText("部分额度无法判断")).toBeVisible();
    expect(screen.getByText("部分数据源未完整覆盖")).toBeVisible();
    expect(screen.queryByText("所有核心采集器在线")).not.toBeInTheDocument();
    expect(screen.queryByText("目前没有阈值告警")).not.toBeInTheDocument();
  });

});
