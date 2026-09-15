const RECOVERY_KEY = "usage-guard:access-recovery";

/** Retry a transient cold-start failure once; HTTP errors are handled by the caller. */
export async function fetchUsageResponse(url: string, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
        signal,
      });
    } catch (error) {
      if (!(error instanceof TypeError) || attempt > 0 || signal.aborted) throw error;
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, 500);
        signal.addEventListener("abort", abort, { once: true });
      });
    }
  }
}

export function accessSessionUrl(endpoint: string, returnTo: string): string {
  const url = new URL(`${endpoint}/v1/usage`);
  url.searchParams.set("access_session", "1");
  url.searchParams.set("return_to", returnTo);
  return url.href;
}

/** One navigation per API origin until a successful data load. Never read Access cookies. */
export function recoverAccessSession(
  endpoint: string,
  pageUrl: string,
  storage: Pick<Storage, "getItem" | "setItem">,
  navigate: (url: string) => void,
): boolean {
  const apiOrigin = new URL(endpoint).origin;
  if (apiOrigin === new URL(pageUrl).origin) return false;
  try {
    if (storage.getItem(RECOVERY_KEY) === apiOrigin) return false;
    storage.setItem(RECOVERY_KEY, apiOrigin);
  } catch {
    // Without a persistent marker, automatic navigation could create a redirect loop.
    return false;
  }
  navigate(accessSessionUrl(endpoint, pageUrl));
  return true;
}

export function clearAccessRecovery(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(RECOVERY_KEY);
  } catch {
    // Storage may be disabled; successful data loading must still work.
  }
}
