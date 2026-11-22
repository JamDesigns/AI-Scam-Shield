export type DeadlineOptions = { signal?: AbortSignal; timeoutMs?: number };

/** Abort the real I/O and bound completion even when a provider ignores cancellation. */
export async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: DeadlineOptions,
  label: string,
  defaultTimeoutMs = 80_000,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid deadline");
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(new Error(`${label} timed out`)), timeoutMs);
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(controller.signal.reason ?? new Error(`${label} aborted`));
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try {
    controller.signal.throwIfAborted();
    return await Promise.race([operation(controller.signal), aborted]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromCaller);
    if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
  }
}
