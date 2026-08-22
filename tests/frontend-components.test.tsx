// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

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
      endpoint: "https://api.example.com",
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
      screen.queryByRole("link", { name: /检查 API 状态/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新同步" }));
    expect(onRetry).toHaveBeenCalledOnce();

    view.rerender(<DataLoadErrorScreen {...baseProps} error={accessError} />);
    expect(
      screen.getByRole("link", { name: /检查 API 状态/ }),
    ).toHaveAttribute("href", "https://api.example.com/v1/usage");
  });
});
