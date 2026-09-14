import { Activity, Cloud } from "lucide-react";

import { Brand } from "./Brand";

export function LoadingScreen() {
  return (
    <main className="loading-page" aria-live="polite" aria-busy="true">
      <Brand />
      <div className="loading-sequence" aria-hidden="true">
        <span className="loading-orbit">
          <Cloud size={28} />
        </span>
      </div>
      <div>
        <span className="section-code"><Activity size={13} /> SYNC / EDGE</span>
        <h1>正在同步资源遥测</h1>
        <p>验证 Access 会话并并行读取各产品数据源…</p>
      </div>
      <div className="loading-bars" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
