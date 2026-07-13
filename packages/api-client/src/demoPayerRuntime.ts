/** Sandbox-only payer adapter boundary. */
import {
  buildClaimEvidencePackage,
  createMockPayerRegistry,
  discoverMockCoverage,
  executePayerLifecycle,
  getDemoWalletCards,
  listMockPayerProfiles,
  walletDemoUsers,
} from "@trustcare/wallet-core";

export {
  buildClaimEvidencePackage,
  discoverMockCoverage,
  executePayerLifecycle,
  getDemoWalletCards,
  listMockPayerProfiles,
  walletDemoUsers,
};

export const demoPayerRegistry = createMockPayerRegistry();

