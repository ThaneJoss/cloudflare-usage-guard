import {
  ArrowUpRight,
  CircleDollarSign,
  CreditCard,
  LockKeyhole,
  ReceiptText,
} from "lucide-react";

import type { BillingUsage, BillingUsageRow } from "../../shared/usage";
import { billingPeriodLabel, formatMoney } from "../lib/usage";

const BILLING_DASHBOARD_URL =
  "https://dash.cloudflare.com/?to=%2F%3Aaccount%2Fbilling";

interface CostDriver {
  id: string;
  family: string;
  services: string[];
  records: number;
  cost: number;
  currency: string;
}

export function BillingSection({ billing }: { billing: BillingUsage }) {
  const costDrivers = groupCostDrivers(billing.rows);

  return (
    <section id="billing" className="content-section billing-section" aria-labelledby="billing-title">
      <div className="section-heading">
        <div>
          <span className="section-code">COST / 03</span>
          <h2 id="billing-title">可计费用量</h2>
          <p>复用官方日级账单事实，只在这里提炼成本驱动因素；完整明细留在账单中心。</p>
        </div>
        <div className="billing-heading-actions">
          {billing.available && billing.totalCost !== null && billing.currency ? (
            <div className="billing-total">
              <span><CreditCard size={14} /> 用量费用当前累计</span>
              <strong>{formatMoney(billing.totalCost, billing.currency)}</strong>
              <small>{billingPeriodLabel(billing)}</small>
            </div>
          ) : null}
          <a
            className="billing-dashboard-link"
            href={BILLING_DASHBOARD_URL}
            target="_blank"
            rel="noreferrer"
          >
            打开 Cloudflare 账单中心 <ArrowUpRight size={14} />
          </a>
        </div>
      </div>

      {!billing.available ? (
        <div className="billing-unavailable">
          <span className="empty-icon"><LockKeyhole size={21} /></span>
          <div>
            <strong>官方账单数据暂不可用</strong>
            <p>
              {billing.error}。近实时额度卡仍可正常使用；如需读取官方可计费用量，
              请为只读 API Token 增加 Billing Read 权限。
            </p>
          </div>
        </div>
      ) : billing.covered === false ? (
        <div className="billing-unavailable">
          <span className="empty-icon"><CircleDollarSign size={21} /></span>
          <div>
            <strong>此账户暂未纳入 API 覆盖</strong>
            <p>接口已正常响应，但 Cloudflare 尚未为该账户提供 Billable Usage 数据；请在官方账单中心查看。</p>
          </div>
        </div>
      ) : billing.rows.length === 0 ? (
        <div className="empty-state">
          <CircleDollarSign size={23} />
          <div>
            <strong>当前账期暂无可计费用量</strong>
            <span>官方接口出现日级记录后，这里会自动汇总成本驱动因素。</span>
          </div>
        </div>
      ) : (
        <div className="billing-table-shell">
          <div className="table-toolbar">
            <span><ReceiptText size={15} /> {billing.rows.length} 条官方记录，汇总为 {costDrivers.length} 项</span>
            <span>{billingPeriodLabel(billing)}</span>
          </div>
          <div className="billing-table-scroll">
            <table>
              <caption className="visually-hidden">当前账期成本驱动因素</caption>
              <thead>
                <tr>
                  <th scope="col">产品族</th>
                  <th scope="col">计费服务</th>
                  <th scope="col">记录</th>
                  <th scope="col">费用</th>
                </tr>
              </thead>
              <tbody>
                {costDrivers.map((driver) => (
                  <tr key={driver.id}>
                    <td data-label="产品族"><strong>{driver.family}</strong></td>
                    <td data-label="计费服务">{driver.services.join(" · ")}</td>
                    <td data-label="记录">{driver.records}</td>
                    <td data-label="费用">
                      <strong>{formatMoney(driver.cost, driver.currency)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function groupCostDrivers(rows: BillingUsageRow[]): CostDriver[] {
  const grouped = new Map<string, CostDriver>();
  for (const row of rows) {
    const id = `${row.family}:${row.currency}`;
    const existing = grouped.get(id);
    if (existing) {
      existing.cost += row.cost;
      existing.records += 1;
      if (!existing.services.includes(row.service)) {
        existing.services = [...existing.services, row.service].toSorted();
      }
      continue;
    }
    grouped.set(id, {
      id,
      family: row.family,
      services: [row.service],
      records: 1,
      cost: row.cost,
      currency: row.currency,
    });
  }
  return [...grouped.values()].toSorted(
    (left, right) => right.cost - left.cost || left.family.localeCompare(right.family),
  );
}
