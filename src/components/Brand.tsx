import { Cloud } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className="brand" href="/" aria-label="UsageGuard 首页">
      <span className="brand-mark" aria-hidden="true">
        <Cloud size={compact ? 17 : 20} strokeWidth={2.2} />
        <span />
      </span>
      <span className="brand-wordmark">
        Usage<span>Guard</span>
      </span>
    </a>
  );
}
