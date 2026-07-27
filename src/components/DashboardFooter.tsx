import { ArrowUpRight, Code2, ShieldCheck } from "lucide-react";

import type { UsagePayload } from "../../shared/usage";
import { Brand } from "./Brand";

export function DashboardFooter({ data }: { data: UsagePayload }) {
  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <div>
          <Brand compact />
          <p>只读 · 自托管 · 为真实运行边界负责</p>
        </div>
        <div className="footer-meta">
          <span><ShieldCheck size={14} /> 额度目录核对于 {data.quotaCatalogAsOf}</span>
          <span>时区边界 UTC</span>
        </div>
        <a
          href="https://github.com/ThaneJoss/cloudflare-usage-guard"
          target="_blank"
          rel="noreferrer"
        >
          <Code2 size={15} />
          GitHub
          <ArrowUpRight size={13} />
        </a>
      </div>
    </footer>
  );
}
