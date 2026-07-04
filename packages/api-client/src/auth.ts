import { getDemoUser } from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";

export type TrustCareUser = {
  id: number | string;
  name?: string;
  nameTh?: string;
  email?: string;
  systemRole?: string;
  avatarUrl?: string | null;
};

export async function me(options: TrustCareClientOptions, demoMode = true): Promise<TrustCareUser> {
  if (demoMode) {
    const demoUser = getDemoUser((options as TrustCareClientOptions & { userId?: string | number }).userId);
    return {
      id: demoUser.patientId,
      name: demoUser.nameEn,
      nameTh: demoUser.nameTh,
      systemRole: demoUser.role,
      avatarUrl: demoUser.avatarUrl
    };
  }
  return callTrpcProcedure<TrustCareUser>(options, "auth.me");
}

export async function logout(options: TrustCareClientOptions, demoMode = true): Promise<{ success: boolean }> {
  if (demoMode) return { success: true };
  return callTrpcProcedure<{ success: boolean }>(options, "auth.logout");
}
