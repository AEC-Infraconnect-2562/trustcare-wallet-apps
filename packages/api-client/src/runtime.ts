import {
  resolveRuntimeEnvironment,
  runtimeEnvironmentDescriptor,
  type RuntimeEnvironment,
  type RuntimeEnvironmentDescriptor,
} from "@trustcare/wallet-core";

export type RuntimeAwareClientOptions = {
  runtimeEnvironment?: RuntimeEnvironment;
  /** @deprecated Use runtimeEnvironment. Retained for explicit legacy callers. */
  demoMode?: boolean;
};

export function clientRuntimeEnvironment(
  options: RuntimeAwareClientOptions,
): RuntimeEnvironment {
  return resolveRuntimeEnvironment({
    runtimeEnvironment: options.runtimeEnvironment,
    legacyDemoMode: options.demoMode,
  });
}

export function usesDemoRuntime(options: RuntimeAwareClientOptions): boolean {
  return clientRuntimeEnvironment(options) === "demo";
}

export function clientRuntimeDescriptor(
  options: RuntimeAwareClientOptions,
): RuntimeEnvironmentDescriptor {
  return runtimeEnvironmentDescriptor(clientRuntimeEnvironment(options));
}
