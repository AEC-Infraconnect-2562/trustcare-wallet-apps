import {
  getDemoShlPackages,
  type ShlPackage,
  type ShlPackageDetail,
} from "@trustcare/wallet-core";
import { canUsePortalDemoSync, type PortalSyncMode } from "./portalSync";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";
import { usesDemoRuntime } from "./runtime";

export type ShlApiOptions = TrustCareClientOptions & {
  userId?: string | number;
  portalSyncMode?: PortalSyncMode;
};

export async function listShl(options: ShlApiOptions): Promise<ShlPackage[]> {
  if (usesDemoRuntime(options)) {
    if (
      options.portalSyncMode === "live_demo" &&
      canUsePortalDemoSync(options.userId)
    )
      return [];
    return getDemoShlPackages(options.userId);
  }
  return callTrpcProcedure<ShlPackage[]>(options, "shl.list", {});
}

export async function getShlById(
  options: ShlApiOptions,
  id: number,
): Promise<ShlPackageDetail> {
  if (usesDemoRuntime(options)) {
    if (
      options.portalSyncMode === "live_demo" &&
      canUsePortalDemoSync(options.userId)
    ) {
      throw new Error("SHL package not found in live Portal sync scope");
    }
    const shl = getDemoShlPackages(options.userId).find(
      (item) => item.id === id,
    );
    if (!shl) throw new Error("SHL not found");
    return shl;
  }
  return callTrpcProcedure<ShlPackageDetail>(options, "shl.getById", { id });
}
