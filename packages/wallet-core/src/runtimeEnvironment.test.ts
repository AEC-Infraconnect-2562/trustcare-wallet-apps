import { describe, expect, it } from "vitest";
import {
  assertRuntimeAllowsSyntheticData,
  assertRuntimeServiceEndpoints,
  parseOptionalBooleanFlag,
  resolveRuntimeEnvironment,
  runtimeAllowsLocalTestLogin,
  runtimeEnvironmentDescriptor,
  RuntimeEnvironmentConfigurationError,
} from "./runtimeEnvironment";

describe("runtime environment", () => {
  it("defaults to production instead of silently enabling demo data", () => {
    expect(resolveRuntimeEnvironment()).toBe("production");
    expect(runtimeEnvironmentDescriptor("production").allowsSyntheticData).toBe(
      false,
    );
  });

  it("supports every explicit environment", () => {
    expect(
      ["demo", "sandbox", "pilot", "production"].map((environment) =>
        resolveRuntimeEnvironment({ runtimeEnvironment: environment }),
      ),
    ).toEqual(["demo", "sandbox", "pilot", "production"]);
  });

  it("keeps explicit legacy demo mode compatibility", () => {
    expect(resolveRuntimeEnvironment({ legacyDemoMode: true })).toBe("demo");
    expect(resolveRuntimeEnvironment({ legacyDemoMode: "false" })).toBe(
      "production",
    );
    expect(parseOptionalBooleanFlag("true")).toBe(true);
  });

  it("rejects invalid and conflicting configuration", () => {
    expect(() =>
      resolveRuntimeEnvironment({ runtimeEnvironment: "staging" }),
    ).toThrow(RuntimeEnvironmentConfigurationError);
    expect(() =>
      resolveRuntimeEnvironment({
        runtimeEnvironment: "sandbox",
        legacyDemoMode: true,
      }),
    ).toThrow(/conflicts/);
    expect(() => parseOptionalBooleanFlag("yes")).toThrow(/true or false/);
  });

  it("only allows synthetic records in demo mode", () => {
    expect(() => assertRuntimeAllowsSyntheticData("demo")).not.toThrow();
    expect(() => assertRuntimeAllowsSyntheticData("sandbox")).toThrow(
      /disabled/,
    );
    expect(() => assertRuntimeAllowsSyntheticData("production")).toThrow(
      /disabled/,
    );
  });

  it("allows local test login only in demo or explicitly enabled sandbox", () => {
    expect(
      runtimeAllowsLocalTestLogin({ environment: "demo" }),
    ).toBe(true);
    expect(
      runtimeAllowsLocalTestLogin({ environment: "sandbox" }),
    ).toBe(false);
    expect(
      runtimeAllowsLocalTestLogin({
        environment: "sandbox",
        sandboxTestLoginEnabled: true,
      }),
    ).toBe(true);
    expect(
      runtimeAllowsLocalTestLogin({
        environment: "pilot",
        sandboxTestLoginEnabled: true,
      }),
    ).toBe(false);
    expect(
      runtimeAllowsLocalTestLogin({
        environment: "production",
        sandboxTestLoginEnabled: true,
      }),
    ).toBe(false);
  });

  it("requires valid HTTPS service endpoints for pilot and production", () => {
    expect(() =>
      assertRuntimeServiceEndpoints({
        environment: "production",
        endpoints: [{ name: "Wallet API" }],
      }),
    ).toThrow(/required/);
    expect(() =>
      assertRuntimeServiceEndpoints({
        environment: "pilot",
        endpoints: [{ name: "Wallet API", url: "http://wallet.example/api" }],
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      assertRuntimeServiceEndpoints({
        environment: "production",
        endpoints: [
          { name: "Wallet API", url: "https://wallet.example/api" },
        ],
      }),
    ).not.toThrow();
  });

  it("exposes visible non-production banner labels", () => {
    expect(runtimeEnvironmentDescriptor("demo")).toMatchObject({
      bannerVisible: true,
      label: "Demo data",
      labelTh: "ข้อมูลสาธิต",
    });
    expect(runtimeEnvironmentDescriptor("sandbox").bannerVisible).toBe(true);
    expect(runtimeEnvironmentDescriptor("production").bannerVisible).toBe(
      false,
    );
  });
});
