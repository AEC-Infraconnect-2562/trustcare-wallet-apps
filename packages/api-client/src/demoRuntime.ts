/**
 * Explicit sandbox-only runtime.
 *
 * Keep synthetic fixtures behind a dynamic import boundary so the live Wallet
 * Exchange path cannot load or accidentally fall back to retired issuer data.
 * This module is intentionally not re-exported from the package root.
 */
import {
  assessLocalReadiness,
  buildContractHubCatalog,
  buildPrepareWorkbench,
  buildServiceBundleEnvelope,
  buildSharePackage,
  buildPortalInteroperabilityFixtures,
  canPresentCredential,
  classifyQrPayload,
  createDemoPresentation,
  createTrustCareShlGatewayPublication,
  fetchShlManifest,
  getDemoHistory,
  getDemoUser,
  getDemoWalletCards,
  groupCardsByCategory,
  issueDemoOid4vciCredential,
  parseOid4vcCredentialOffer,
  recordFromMhdDocumentReference,
  simulateImportForService,
  verifyShlManifestTrust,
  walletDocumentRecordFromCard,
  type WalletCard,
  type WalletPresentationRequest,
} from "@trustcare/wallet-core";

export {
  assessLocalReadiness,
  buildContractHubCatalog,
  buildPrepareWorkbench,
  buildServiceBundleEnvelope,
  buildSharePackage,
  buildPortalInteroperabilityFixtures,
  canPresentCredential,
  classifyQrPayload,
  createDemoPresentation,
  createTrustCareShlGatewayPublication,
  fetchShlManifest,
  getDemoHistory,
  getDemoUser,
  getDemoWalletCards,
  groupCardsByCategory,
  issueDemoOid4vciCredential,
  parseOid4vcCredentialOffer,
  recordFromMhdDocumentReference,
  simulateImportForService,
  verifyShlManifestTrust,
  walletDocumentRecordFromCard,
};

export type DemoWalletCard = WalletCard;
export type DemoWalletPresentationRequest = WalletPresentationRequest;
export type DemoWalletRuntime = typeof import("./demoRuntime");
export type WalletInteroperabilityFixtures = ReturnType<
  typeof buildPortalInteroperabilityFixtures
>;
