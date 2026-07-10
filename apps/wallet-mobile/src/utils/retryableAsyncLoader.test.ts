import { describe, expect, it, vi } from "vitest";
import { createRetryableAsyncLoader } from "./retryableAsyncLoader";

describe("createRetryableAsyncLoader", () => {
  it("shares a successful initialization", async () => {
    const factory = vi.fn(async () => ({ ready: true }));
    const load = createRetryableAsyncLoader(factory);

    const first = load();
    const second = load();

    expect(first).toBe(second);
    await expect(first).resolves.toEqual({ ready: true });
    await expect(load()).resolves.toEqual({ ready: true });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh attempt after a transient rejection", async () => {
    const factory = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("database is busy"))
      .mockResolvedValueOnce("ready");
    const load = createRetryableAsyncLoader(factory);

    await expect(load()).rejects.toThrow("database is busy");
    await expect(load()).resolves.toBe("ready");
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
