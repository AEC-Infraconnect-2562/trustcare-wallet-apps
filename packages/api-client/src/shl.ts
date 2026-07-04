import { demoShlPackages, type ShlPackage, type ShlPackageDetail } from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";

export type ShlApiOptions = TrustCareClientOptions & {
  demoMode?: boolean;
};

export async function listShl(options: ShlApiOptions): Promise<ShlPackage[]> {
  if (options.demoMode ?? true) return demoShlPackages;
  return callTrpcProcedure<ShlPackage[]>(options, "shl.list", {});
}

export async function getShlById(options: ShlApiOptions, id: number): Promise<ShlPackageDetail> {
  if (options.demoMode ?? true) {
    const shl = demoShlPackages.find(item => item.id === id);
    if (!shl) throw new Error("SHL not found");
    return shl;
  }
  return callTrpcProcedure<ShlPackageDetail>(options, "shl.getById", { id });
}

