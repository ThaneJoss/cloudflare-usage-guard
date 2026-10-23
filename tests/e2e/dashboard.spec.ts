import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext } from "@playwright/test";

import { createDemoPayload } from "../../src/demo";

const browserFailures = new WeakMap<BrowserContext, string[]>();

test.beforeEach(async ({ context, page, baseURL }) => {
  const failures: string[] = [];
  browserFailures.set(context, failures);
  page.on("pageerror", (error) => failures.push(error.message));

  // Fixtures fulfill API calls in memory; every other request must stay local.
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === baseURL) {
      await route.continue();
      return;
    }
    failures.push(`禁止外部请求：${route.request().url()}`);
    await route.abort("blockedbyclient");
  });
});

test.afterEach(({ context }) => {
  expect(browserFailures.get(context), "浏览器不应访问外部服务或出现未捕获异常").toEqual([]);
});

test("演示控制台在桌面与移动端支持风险筛选、账单语义和无障碍", async ({ page }) => {
  await page.goto("/?demo=1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const quotas = page.getByRole("region", { name: "免费额度雷达" });
  await expect(quotas.getByRole("article")).toHaveCount(6);

  const attention = page.getByRole("button", { name: "需要关注", exact: true });
  await attention.click();
  await expect(attention).toHaveAttribute("aria-pressed", "true");
  await expect(quotas.getByRole("heading", { level: 3 })).toHaveText(["Workers", "Workers KV"]);
  await page.getByRole("button", { name: "全部资源", exact: true }).click();
  await expect(quotas.getByRole("article")).toHaveCount(6);

  const billing = page.getByRole("table", { name: "当前账期成本驱动因素" });
  await expect(billing).toBeVisible();
  // Role queries exclude display:none headers while preserving visually hidden headers.
  await expect(billing.getByRole("columnheader")).toHaveCount(4);
  await expect(billing.getByRole("columnheader", { name: "费用", exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("跳过导航后继续 Tab 会进入主要内容", async ({ page }) => {
  await page.goto("/?demo=1");
  const skipLink = page.getByRole("link", { name: "跳到主要内容", exact: true });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("main").locator(":focus")).toHaveCount(1);
});

test("刷新失败保留成功快照并允许重新同步", async ({ page, baseURL }) => {
  const snapshot = createDemoPayload();
  let requests = 0;
  await page.route("**/v1/usage", async (route) => {
    expect(new URL(route.request().url()).origin).toBe(baseURL);
    requests += 1;
    await route.fulfill({
      status: requests === 2 ? 503 : 200,
      json: requests === 2 ? { error: "测试采集器暂时不可用" } : snapshot,
    });
  });
  await page.goto("/");
  const quotas = page.getByRole("region", { name: "免费额度雷达" });
  await expect(quotas.getByRole("article")).toHaveCount(6);
  const initialMetrics = await quotas.getByRole("progressbar").evaluateAll((bars) =>
    bars.map((bar) => bar.getAttribute("aria-valuenow")),
  );

  await page.getByRole("button", { name: "刷新用量", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("刷新失败，仍显示上一次成功快照");
  await expect(page.getByText("STALE", { exact: true })).toBeVisible();
  await expect(quotas.getByRole("article")).toHaveCount(6);
  expect(await quotas.getByRole("progressbar").evaluateAll((bars) =>
    bars.map((bar) => bar.getAttribute("aria-valuenow")),
  )).toEqual(initialMetrics);

  await page.getByRole("button", { name: "重新同步", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
  expect(requests).toBe(3);
});

test("登录重定向停留在本站，手动刷新页面后恢复用量", async ({ page, baseURL }) => {
  let requests = 0;
  await page.route("**/v1/usage", async (route) => {
    expect(new URL(route.request().url()).origin).toBe(baseURL);
    requests += 1;
    if (requests === 1) {
      await route.fulfill({
        status: 302,
        headers: { Location: "https://login.example.com/cdn-cgi/access/login" },
      });
      return;
    }
    await route.fulfill({ json: createDemoPayload() });
  });
  await page.goto("/");
  const login = page.getByRole("button", { name: "刷新页面以登录", exact: true });
  await expect(login).toBeVisible();
  await expect(page).toHaveURL(`${baseURL}/`);
  expect(requests).toBe(1);
  await login.click();
  await expect(page.getByRole("region", { name: "免费额度雷达" })).toBeVisible();
  expect(requests).toBe(2);
});
