import { useCallback, useEffect, useRef, useState } from "react";

import type { UsagePayload } from "../../shared/usage";
import { fetchUsageResponse } from "../lib/usage-client";
import { createDemoPayload } from "../demo";
import { parseUsagePayload } from "../lib/usage";

type LoadPhase = "idle" | "loading" | "ready" | "refreshing";

export interface UsageLoadError {
  kind: "access" | "api" | "contract" | "network" | "timeout";
  message: string;
}

interface UsageDataController {
  data: UsagePayload | null;
  error: UsageLoadError | null;
  isDemo: boolean;
  phase: LoadPhase;
  refresh: () => void;
}

export function useUsageData(): UsageDataController {
  const isDemo = new URLSearchParams(window.location.search).get("demo") === "1";
  const [data, setData] = useState<UsagePayload | null>(() =>
    isDemo ? createDemoPayload() : null,
  );
  const [phase, setPhase] = useState<LoadPhase>(
    isDemo ? "ready" : "loading",
  );
  const [error, setError] = useState<UsageLoadError | null>(null);
  const autoloaded = useRef(false);
  const requestSequence = useRef(0);

  const loadUsage = useCallback(
    async (mode: "initial" | "refresh") => {
      if (isDemo) {
        setData(createDemoPayload());
        setError(null);
        setPhase("ready");
        return;
      }

      const requestId = requestSequence.current + 1;
      requestSequence.current = requestId;
      setError(null);
      setPhase(mode === "refresh" && data ? "refreshing" : "loading");

      try {
        const response = await fetchUsageResponse(
          AbortSignal.timeout(25_000),
        );
        if (requestId !== requestSequence.current) return;
        const accessResponse = response.type === "opaqueredirect" ||
          response.status === 401 || response.status === 403 ||
          (response.ok && response.headers.get("Content-Type")?.includes("text/html"));
        if (accessResponse) {
          setError({ kind: "access", message: "登录已过期或未获得访问权限，请刷新页面重新登录。" });
          setPhase(data ? "ready" : "idle");
          return;
        }
        const body: unknown = await response.json().catch(() => null);
        if (requestId !== requestSequence.current) return;

        if (!response.ok) {
          const message =
            getResponseError(body) ?? `API 请求失败（HTTP ${response.status}）`;
          setError({
            kind: "api",
            message,
          });
          setPhase(data ? "ready" : "idle");
          return;
        }

        const payload = parseUsagePayload(body);
        if (requestId !== requestSequence.current) return;

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
    if (isDemo || data || autoloaded.current) return;
    autoloaded.current = true;
    void loadUsage("initial");
  }, [data, isDemo, loadUsage]);

  function refresh() {
    void loadUsage(data ? "refresh" : "initial");
  }

  return {
    data,
    error,
    isDemo,
    phase,
    refresh,
  };
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
  if (caught instanceof TypeError) {
    return { kind: "network", message: "无法连接控制台，请检查网络后重试。" };
  }
  if (caught instanceof Error && caught.message) {
    return { kind: "network", message: caught.message };
  }
  return {
    kind: "network",
    message: "无法连接控制台，请检查网络后重试。",
  };
}
