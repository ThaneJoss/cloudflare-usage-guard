import {
  ArrowUpRight,
  CircleDollarSign,
  CreditCard,
  LockKeyhole,
  ReceiptText,
} from "lucide-react";

import type { BillingUsage } from "../../shared/usage";
import {
  billingPeriodLabel,
  formatCompact,
  formatMoney,
} from "../lib/usage";

export function BillingSection({ billing }: { billing: BillingUsage }) {
  return (
    <section id="billing" className="content-section billing-section" aria-labelledby="billing-title">
      <div className="section-heading">
        <div>
          <span className="section-code">COST / 03</span>
          <h2 id="billing-title">PayGo 账期明细</h2>
          <p>精确费用与额度估算分开展示，避免把分析值误当成账单。</p>
        </div>
        {billing.available && billing.totalCost !== null && billing.currency ? (
          <div className="billing-total">
            <span><CreditCard size={14} /> 当前累计</span>
            <strong>{formatMoney(billing.totalCost, billing.currency)}</strong>
            <small>{billingPeriodLabel(billing)}</small>
          </div>
        ) : null}
      </div>

      {!billing.available ? (
        <div className="billing-unavailable">
          <span className="empty-icon"><LockKeyhole size={21} /></span>
          <div>
            <strong>PayGo 数据暂不可用</strong>
            <p>
              {billing.error}。免费额度卡仍可正常使用；如需精确费用，
              请为只读 API Token 增加 Billing Read 权限。
            </p>
          </div>
        </div>
      ) : billing.rows.length === 0 ? (
        <div className="empty-state">
          <CircleDollarSign size={23} />
          <div>
            <strong>当前账期暂无 PayGo 明细</strong>
            <span>存在用量后会自动出现在这里。</span>
          </div>
        </div>
      ) : (
        <div className="billing-table-shell">
          <div className="table-toolbar">
            <span><ReceiptText size={15} /> {billing.rows.length} 条计费记录</span>
            <span>{billingPeriodLabel(billing)}</span>
          </div>
          <div className="billing-table-scroll">
            <table>
              <caption className="visually-hidden">当前 PayGo 账期用量明细</caption>
              <thead>
                <tr>
                  <th scope="col">服务</th>
                  <th scope="col">计费类别</th>
                  <th scope="col">消耗量</th>
                  <th scope="col">计价量</th>
                  <th scope="col">费用</th>
                </tr>
              </thead>
              <tbody>
                {billing.rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="服务"><strong>{row.service}</strong></td>
                    <td data-label="计费类别">{row.family}</td>
                    <td data-label="消耗量">
                      {formatCompact(row.consumed)}
                      <small>{row.consumedUnit}</small>
                    </td>
                    <td data-label="计价量">{formatCompact(row.pricingQuantity)}</td>
                    <td data-label="费用">
                      <strong>{formatMoney(row.cost, row.currency)}</strong>
                      <ArrowUpRight size={13} aria-hidden="true" />
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
