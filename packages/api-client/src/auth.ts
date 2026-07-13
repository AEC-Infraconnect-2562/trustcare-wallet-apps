import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";
import { usesDemoRuntime } from "./runtime";

export type TrustCareUser = {
  id: number | string;
  name?: string;
  nameTh?: string;
  email?: string;
  systemRole?: string;
  avatarUrl?: string | null;
};

export async function me(
  options: TrustCareClientOptions,
  demoMode?: boolean,
): Promise<TrustCareUser> {
  const runtimeOptions = withLegacyDemoMode(options, demoMode);
  if (usesDemoRuntime(runtimeOptions)) {
    const { getDemoUser } = await import("./demoRuntime");
    const demoUser = getDemoUser(
      (options as TrustCareClientOptions & { userId?: string | number }).userId,
    );
    return {
      id: demoUser.patientId,
      name: demoUser.nameEn,
      nameTh: demoUser.nameTh,
      systemRole: demoUser.role,
      avatarUrl: demoUser.avatarUrl,
    };
  }
  return callTrpcProcedure<TrustCareUser>(options, "auth.me");
}

export async function logout(
  options: TrustCareClientOptions,
  demoMode?: boolean,
): Promise<{ success: boolean }> {
  if (usesDemoRuntime(withLegacyDemoMode(options, demoMode)))
    return { success: true };
  return callTrpcProcedure<{ success: boolean }>(options, "auth.logout");
}

function withLegacyDemoMode(
  options: TrustCareClientOptions,
  demoMode: boolean | undefined,
): TrustCareClientOptions {
  return demoMode === undefined ? options : { ...options, demoMode };
}
