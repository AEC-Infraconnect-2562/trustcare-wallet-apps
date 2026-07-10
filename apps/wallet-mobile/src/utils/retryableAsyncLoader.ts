export type RetryableAsyncLoader<T> = () => Promise<T>;

/**
 * Shares one successful/in-flight initialization, but never makes a transient
 * rejection permanent. The next caller receives a fresh attempt.
 */
export function createRetryableAsyncLoader<T>(
  factory: () => T | Promise<T>,
): RetryableAsyncLoader<T> {
  let cached: Promise<T> | null = null;

  return () => {
    if (cached) return cached;

    const attempt = Promise.resolve().then(factory);
    cached = attempt;
    void attempt.catch(() => {
      if (cached === attempt) cached = null;
    });
    return attempt;
  };
}
