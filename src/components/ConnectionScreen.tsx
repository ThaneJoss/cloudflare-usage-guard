import {
  ArrowRight,
  Braces,
  Check,
  ExternalLink,
  Fingerprint,
  Gauge,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { type FormEvent, useId } from "react";

import type { UsageLoadError } from "../hooks/useUsageData";
import { normalizeEndpoint } from "../lib/usage";
import { Brand } from "./Brand";

interface ConnectionScreenProps {
  endpoint: string;
  error: UsageLoadError | null;
  loading: boolean;
  onEndpointChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ConnectionScreen(props: ConnectionScreenProps) {
  const inputId = useId();
  const hintId = useId();
  const normalizedEndpoint = normalizeEndpoint(props.endpoint);
  const canOpenAccess =
    props.error?.kind === "access" || props.error?.kind === "network";

  return (
    <main className="access-page">
      <div className="access-grid" aria-hidden="true" />
      <div className="access-glow access-glow-orange" aria-hidden="true" />
      <div className="access-glow access-glow-cyan" aria-hidden="true" />

      <section className="access-story" aria-labelledby="access-title">
        <Brand />
        <div className="eyebrow">
          <span className="eyebrow-line" />
          Edge resource observability
        </div>
        <h1 id="access-title">
          在额度变成故障前，
          <span>看见每一个信号。</span>
        </h1>
        <p className="access-lead">
          面向 Cloudflare 资源的只读指挥台。统一追踪免费额度、数据源健康与
          PayGo 费用，同时把凭据完整留在边缘端。
        </p>

        <div className="architecture-flow" aria-label="系统安全架构">
          <div>
            <span className="flow-icon"><Fingerprint size={18} /></span>
            <strong>Access</strong>
            <small>身份边界</small>
          </div>
          <ArrowRight size={16} aria-hidden="true" />
          <div>
            <span className="flow-icon"><ServerCog size={18} /></span>
            <strong>Worker</strong>
            <small>只读聚合</small>
          </div>
          <ArrowRight size={16} aria-hidden="true" />
          <div>
            <span className="flow-icon"><Gauge size={18} /></span>
            <strong>Console</strong>
            <small>实时决策</small>
          </div>
        </div>

        <a className="text-link" href="?demo=1">
          使用安全演示数据进入控制台
          <ArrowRight size={16} />
        </a>
      </section>

      <section className="access-panel" aria-labelledby="connect-heading">
        <div className="panel-terminal-bar" aria-hidden="true">
          <span />
          <span />
          <span />
          <code>secure-channel://edge</code>
        </div>
        <div className="access-panel-body">
          <div className="access-panel-icon" aria-hidden="true">
            <LockKeyhole size={24} />
          </div>
          <span className="section-code">AUTH / 01</span>
          <h2 id="connect-heading">连接你的 API Worker</h2>
          <p>
            浏览器仅保存 Worker 地址。API Token 留在 Worker Secret，
            身份由 Cloudflare Access JWT 验证。
          </p>

          <form onSubmit={props.onSubmit}>
            <label htmlFor={inputId}>Worker API 地址</label>
            <div className="endpoint-field">
              <Braces size={17} aria-hidden="true" />
              <input
                id={inputId}
                type="url"
                value={props.endpoint}
                onChange={(event) => props.onEndpointChange(event.target.value)}
                placeholder="https://api.example.com"
                required
                autoComplete="url"
                spellCheck={false}
                aria-describedby={hintId}
                aria-invalid={Boolean(props.error)}
              />
            </div>
            <small id={hintId} className="field-hint">
              生产环境要求 HTTPS；本地开发允许 localhost。
            </small>

            {props.error ? (
              <div className="form-alert" role="alert">
                <span>{props.error.message}</span>
                {normalizedEndpoint && canOpenAccess ? (
                  <a
                    href={`${normalizedEndpoint}/v1/usage`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开 API 域名检查 Access <ExternalLink size={14} />
                  </a>
                ) : null}
              </div>
            ) : null}

            <button className="primary-action" type="submit" disabled={props.loading}>
              {props.loading ? (
                <RefreshCw className="spin" size={18} aria-hidden="true" />
              ) : (
                <ShieldCheck size={18} aria-hidden="true" />
              )}
              {props.loading ? "正在建立安全连接…" : "验证并读取用量"}
              {!props.loading ? <ArrowRight size={17} aria-hidden="true" /> : null}
            </button>
          </form>

          <div className="trust-list" aria-label="安全能力">
            <span><Check size={14} /> JWT 签名验证</span>
            <span><Check size={14} /> 只读 Cloudflare API</span>
            <span><Check size={14} /> 浏览器零密钥</span>
          </div>
        </div>
      </section>
    </main>
  );
}
