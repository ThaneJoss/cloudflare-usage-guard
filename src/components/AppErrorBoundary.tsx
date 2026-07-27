import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { Brand } from "./Brand";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      JSON.stringify({
        event: "frontend_render_failed",
        name: error.name,
        message: error.message.slice(0, 240),
        componentStack: info.componentStack?.slice(0, 500),
      }),
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="fatal-page">
        <Brand />
        <div className="fatal-card" role="alert">
          <span className="fatal-icon" aria-hidden="true">
            <AlertTriangle size={24} />
          </span>
          <span className="section-code">RECOVERY / UI</span>
          <h1>控制台渲染遇到异常</h1>
          <p>
            用量数据没有被修改。重新载入页面通常即可恢复；若问题持续，
            请检查前后端版本是否一致。
          </p>
          <div className="fatal-actions">
            <button type="button" onClick={() => window.location.reload()}>
              <RefreshCw size={17} />
              重新载入
            </button>
            <a href="?demo=1">改用演示数据检查界面</a>
          </div>
        </div>
      </main>
    );
  }
}
