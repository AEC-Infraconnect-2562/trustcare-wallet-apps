import {
  createDemoPresentation,
  demoCardsByCategory,
  demoHistory,
  type ReadinessContext,
  type PresentationHistoryItem,
  type WalletCardsByCategory,
  type WalletPresentationRequest,
  type WalletPresentationResponse,
  assessLocalReadiness,
  flattenCardsByCategory
} from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";

export type WalletApiOptions = TrustCareClientOptions & {
  demoMode?: boolean;
  demoOrigin?: string;
};

export async function cardsByCategory(options: WalletApiOptions): Promise<WalletCardsByCategory> {
  if (options.demoMode ?? true) return demoCardsByCategory;
  return callTrpcProcedure<WalletCardsByCategory>(options, "wallet.cardsByCategory");
}

export async function superseded(options: WalletApiOptions): Promise<unknown[]> {
  if (options.demoMode ?? true) return [];
  return callTrpcProcedure<unknown[]>(options, "wallet.superseded");
}

export async function history(options: WalletApiOptions): Promise<PresentationHistoryItem[]> {
  if (options.demoMode ?? true) return demoHistory;
  return callTrpcProcedure<PresentationHistoryItem[]>(options, "wallet.history");
}

export async function present(options: WalletApiOptions, input: WalletPresentationRequest): Promise<WalletPresentationResponse> {
  if (options.demoMode ?? true) {
    const cards = flattenCardsByCategory(demoCardsByCategory);
    const card = cards.find(item => item.id === input.cardId);
    if (!card) throw new Error("Wallet card not found");
    if (card.credentialStatus !== "active") throw new Error("This wallet card is not active");
    return createDemoPresentation(card, input.selectedFields, options.demoOrigin);
  }
  return callTrpcProcedure<WalletPresentationResponse>(options, "wallet.present", input);
}

export async function readiness(options: WalletApiOptions, input: { context: ReadinessContext; patientId?: number }) {
  if (options.demoMode ?? true) {
    return {
      patientId: 6501001001,
      readiness: assessLocalReadiness(flattenCardsByCategory(demoCardsByCategory), input.context),
      requests: [],
      previousChecks: []
    };
  }
  return callTrpcProcedure(options, "wallet.readiness", input);
}

export async function requestDocument(options: WalletApiOptions, input: unknown) {
  if (options.demoMode ?? true) {
    return { id: Date.now(), requestId: `wdr_demo_${Date.now()}`, status: "requested" };
  }
  return callTrpcProcedure(options, "wallet.requestDocument", input);
}

export async function uploadDocument(options: WalletApiOptions, input: unknown) {
  if (options.demoMode ?? true) {
    return { id: Date.now(), uploadId: `pud_demo_${Date.now()}`, fileUrl: "demo://uploaded-document" };
  }
  return callTrpcProcedure(options, "wallet.uploadDocument", input);
}

