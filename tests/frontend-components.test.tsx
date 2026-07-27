// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { BillingSection } from "../src/components/BillingSection";
import { ConnectionScreen } from "../src/components/ConnectionScreen";
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

  it("账单表拥有标题、列头和移动端数据标签", () => {
    render(<BillingSection billing={createDemoPayload().billing} />);

    expect(
      screen.getByRole("table", { name: "当前 PayGo 账期用量明细" }),
    ).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "费用" })).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("只在身份或网络错误时给出 Access 排查入口", () => {
    const baseProps = {
      endpoint: "https://api.example.com",
      loading: false,
      onEndpointChange: () => undefined,
      onSubmit: () => undefined,
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
      <ConnectionScreen {...baseProps} error={contractError} />,
    );
    expect(
      screen.queryByRole("link", { name: /检查 Access/ }),
    ).not.toBeInTheDocument();

    view.rerender(<ConnectionScreen {...baseProps} error={accessError} />);
    expect(
      screen.getByRole("link", { name: /检查 Access/ }),
    ).toHaveAttribute("href", "https://api.example.com/v1/usage");
  });
});
