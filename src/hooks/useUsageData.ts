import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import type { UsagePayload } from "../../shared/usage";
import { createDemoPayload } from "../demo";
import { normalizeEndpoint, parseUsagePayload } from "../lib/usage";

const ENDPOINT_KEY = "cf-usage-dashboard-endpoint";
const configuredEndpoint = normalizeEndpoint(import.meta.env.VITE_API_BASE_URL ?? "");

type LoadPhase = "idle" | "loading" | "ready" | "refreshing";

export interface UsageLoadError {
  kind: "access" | "api" | "contract" | "network" | "timeout";
  message: string;
}

interface UsageDataController {
  data: UsagePayload | null;
  endpoint: string;
  error: UsageLoadError | null;
  isDemo: boolean;
  phase: LoadPhase;
  connect: (event: FormEvent<HTMLFormElement>) => void;
  refresh: () => void;
  resetEndpoint: () => void;
  setEndpoint: (value: string) => void;
}

export function useUsageData(): UsageDataController {
  const isDemo = new URLSearchParams(window.location.search).get("demo") === "1";
  const initialEndpoint = getInitialEndpoint();
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [data, setData] = useState<UsagePayload | null>(() =>
    isDemo ? createDemoPayload() : null,
  );
  const [phase, setPhase] = useState<LoadPhase>(
    isDemo ? "ready" : initialEndpoint ? "loading" : "idle",
  );
  const [error, setError] = useState<UsageLoadError | null>(null);
  const autoloaded = useRef(false);
  const requestSequence = useRef(0);

  const loadUsage = useCallback(
    async (candidateEndpoint: string, mode: "connect" | "refresh") => {
      if (isDemo) {
        setData(createDemoPayload());
        setError(null);
        setPhase("ready");
        return;
      }

      const normalizedEndpoint = normalizeEndpoint(candidateEndpoint);
      if (!normalizedEndpoint) {
        setError({
          kind: "contract",
          message: "请输入有效的 HTTPS Worker API 地址；本地开发可使用 localhost。",
        });
        setPhase("idle");
        return;
      }

      const requestId = requestSequence.current + 1;
      requestSequence.current = requestId;
      setError(null);
      setPhase(mode === "refresh" && data ? "refreshing" : "loading");

      try {
        const response = await fetch(`${normalizedEndpoint}/v1/usage`, {
          credentials: "include",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(25_000),
        });
        const body: unknown = await response.json().catch(() => null);
        if (requestId !== requestSequence.current) return;

        if (!response.ok) {
          const message =
            getResponseError(body) ?? `API 请求失败（HTTP ${response.status}）`;
          setError({
            kind:
              response.status === 401 || response.status === 403 ? "access" : "api",
            message,
          });
          setPhase(data ? "ready" : "idle");
          return;
        }

        const payload = parseUsagePayload(body);
        if (requestId !== requestSequence.current) return;

        localStorage.setItem(ENDPOINT_KEY, normalizedEndpoint);
        setEndpoint(normalizedEndpoint);
        setData(payload);
        setPhase("ready");
      } catch (caught) {
        if (requestId !== requestSequence.current) return;
        setError(getRequestError(caught));
        setPhase(data ? "ready" : "idle");
      }
    },
    [data, isDemo],
  );

  useEffect(() => {
    if (isDemo || !endpoint || data || autoloaded.current) return;
    autoloaded.current = true;
    void loadUsage(endpoint, "connect");
  }, [data, endpoint, isDemo, loadUsage]);

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadUsage(endpoint, "connect");
  }

  function refresh() {
    void loadUsage(endpoint, "refresh");
  }

  function resetEndpoint() {
    requestSequence.current += 1;
    localStorage.removeItem(ENDPOINT_KEY);
    setEndpoint(configuredEndpoint);
    setData(null);
    setError(null);
    setPhase("idle");
  }

  return {
    data,
    endpoint,
    error,
    isDemo,
    phase,
    connect,
    refresh,
    resetEndpoint,
    setEndpoint,
  };
}

function getInitialEndpoint(): string {
  const storedEndpoint = localStorage.getItem(ENDPOINT_KEY);
  return normalizeEndpoint(storedEndpoint ?? "") || configuredEndpoint;
}

function getResponseError(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("error" in value)) return null;
  return typeof value.error === "string" && value.error.trim()
    ? value.error.trim()
    : null;
}

function getRequestError(caught: unknown): UsageLoadError {
  if (caught instanceof DOMException && caught.name === "TimeoutError") {
    return {
      kind: "timeout",
      message: "API 在 25 秒内没有响应，请检查 Worker 状态后重试。",
    };
  }
  if (
    caught instanceof Error &&
    caught.message === "API 返回的数据结构不完整，请确认前后端版本一致。"
  ) {
    return { kind: "contract", message: caught.message };
  }
  if (caught instanceof Error && caught.message) {
    return { kind: "network", message: caught.message };
  }
  return {
    kind: "network",
    message: "无法连接用量 API，请检查地址、网络和 Access 授权。",
  };
}
