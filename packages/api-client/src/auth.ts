import { demoPatient } from "@trustcare/wallet-core";
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
    return {
      id: demoPatient.id,
      name: demoPatient.nameEn,
      nameTh: demoPatient.nameTh,
      systemRole: "patient",
      avatarUrl: demoPatient.avatarUrl
    };
  }
  return callTrpcProcedure<TrustCareUser>(options, "auth.me");
}

export async function logout(options: TrustCareClientOptions, demoMode = true): Promise<{ success: boolean }> {
  if (demoMode) return { success: true };
  return callTrpcProcedure<{ success: boolean }>(options, "auth.logout");
}

