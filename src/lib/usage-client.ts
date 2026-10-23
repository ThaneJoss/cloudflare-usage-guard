/** Retry a transient cold-start failure once; HTTP errors are handled by the caller. */
export async function fetchUsageResponse(signal: AbortSignal): Promise<Response> {
  const request = () => fetch("/v1/usage", {
    credentials: "same-origin",
    // Report an expired Access session instead of following its login URL in fetch.
    redirect: "manual",
    headers: { Accept: "application/json" },
    signal,
  });
  try {
    return await request();
  } catch (error) {
    if (!(error instanceof TypeError) || signal.aborted) throw error;
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
    return request();
  }
}

