import {
  getDemoShlPackages,
  type ShlPackage,
  type ShlPackageDetail,
} from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";
import { usesDemoRuntime } from "./runtime";

export type ShlApiOptions = TrustCareClientOptions & {
  userId?: string | number;
};

export async function listShl(options: ShlApiOptions): Promise<ShlPackage[]> {
  if (usesDemoRuntime(options)) return getDemoShlPackages(options.userId);
  return callTrpcProcedure<ShlPackage[]>(options, "shl.list", {});
}

export async function getShlById(
  options: ShlApiOptions,
  id: number,
): Promise<ShlPackageDetail> {
  if (usesDemoRuntime(options)) {
    const shl = getDemoShlPackages(options.userId).find(
      (item) => item.id === id,
    );
    if (!shl) throw new Error("SHL not found");
    return shl;
  }
  return callTrpcProcedure<ShlPackageDetail>(options, "shl.getById", { id });
}
