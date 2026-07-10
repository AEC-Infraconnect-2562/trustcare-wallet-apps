import { describe, expect, it } from "vitest";
import {
  clientRuntimeDescriptor,
  clientRuntimeEnvironment,
  usesDemoRuntime,
} from "./runtime";
import { listDocuments } from "./wallet";

describe("API client runtime", () => {
  it("fails closed to production when no mode was configured", () => {
    expect(clientRuntimeEnvironment({})).toBe("production");
    expect(usesDemoRuntime({})).toBe(false);
  });

  it("uses demo fixtures only for an explicit demo environment", () => {
    expect(usesDemoRuntime({ runtimeEnvironment: "demo" })).toBe(true);
    expect(usesDemoRuntime({ runtimeEnvironment: "sandbox" })).toBe(false);
    expect(usesDemoRuntime({ runtimeEnvironment: "pilot" })).toBe(false);
    expect(usesDemoRuntime({ runtimeEnvironment: "production" })).toBe(false);
  });

  it("retains explicit legacy demoMode compatibility", () => {
    expect(clientRuntimeEnvironment({ demoMode: true })).toBe("demo");
    expect(clientRuntimeEnvironment({ demoMode: false })).toBe("production");
  });

  it("rejects conflicting explicit and legacy modes", () => {
    expect(() =>
      clientRuntimeEnvironment({
        runtimeEnvironment: "production",
        demoMode: true,
      }),
    ).toThrow(/conflicts/);
  });

  it("provides banner data without changing API behavior", () => {
    expect(clientRuntimeDescriptor({ runtimeEnvironment: "sandbox" })).toMatchObject(
      {
        environment: "sandbox",
        bannerVisible: true,
        allowsSyntheticData: false,
      },
    );
  });

  it("routes an unconfigured Wallet client to its backend instead of seed data", async () => {
    const calls: string[] = [];
    const records = await listDocuments({
      url: "https://wallet.example/trpc",
      fetchImpl: async (input) => {
        calls.push(String(input));
        return new Response(
          JSON.stringify({ result: { data: { json: [] } } }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

    expect(records).toEqual([]);
    expect(calls).toEqual([
      "https://wallet.example/trpc/wallet.listDocuments",
    ]);
  });
});
