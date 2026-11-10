/** Bound one source without letting it hide the sources that already completed. */
export async function withSourceDeadline<T>(
  load: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 20_000,
): Promise<T> {
  const controller = new AbortController();
  const error = new DOMException("Cloudflare 数据源采集超时", "TimeoutError");
  let rejectDeadline: ((reason: unknown) => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const timer = setTimeout(() => {
    controller.abort(error);
    rejectDeadline?.(error);
  }, timeoutMs);
  try {
    return await Promise.race([
      Promise.resolve().then(() => load(controller.signal)),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    // Also stop a sibling request when one part of the source failed early.
    controller.abort();
  }
}
