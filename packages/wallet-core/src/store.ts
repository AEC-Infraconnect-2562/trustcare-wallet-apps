import type {
  CheckinQrResponse,
  PresentationHistoryItem,
  ShlPackage,
  ServicePacketResponse,
  WalletCard,
  WalletStoredObject
} from "./models";
import type { ParsedCredentialOffer, ParsedPresentationRequest } from "./oid4vc";
import { credentialOfferLabel, presentationRequestLabel } from "./oid4vc";
import { normalizeDocumentType } from "./canonicalDocuments";

export function walletObjectsFromCards(cards: WalletCard[]): WalletStoredObject[] {
  return cards.map(card => ({
    id: `vc:${card.credentialId}`,
    type: storedTypeForCard(card),
    title: card.displayName,
    subtitle: card.displayNameEn ?? card.issuerHospitalName ?? undefined,
    status: card.credentialStatus,
    protocol: "trustcare",
    createdAt: card.issuedAt ?? card.createdAt,
    expiresAt: card.expiresAt,
    source: card.issuerDid ?? card.issuerHospitalName ?? undefined,
    payload: card
  }));
}

export function walletObjectsFromHistory(history: PresentationHistoryItem[]): WalletStoredObject[] {
  return history.map(item => ({
    id: `vp:${item.presentationId ?? item.id}`,
    type: "vp",
    title: item.verifierName ?? "Verifiable Presentation",
    subtitle: item.purpose ?? undefined,
    status: item.verificationResult ?? "verified",
    protocol: "trustcare",
    createdAt: item.presentedAt ?? item.createdAt ?? new Date().toISOString(),
    payload: item
  }));
}

export function walletObjectsFromShl(shlPackages: ShlPackage[]): WalletStoredObject[] {
  return shlPackages.map(shl => ({
    id: `shl:${shl.id}`,
    type: "shl",
    title: shl.label ?? "SMART Health Link",
    subtitle: [shl.purpose, shl.context].filter(Boolean).join(" · "),
    status: shl.status,
    protocol: "shl",
    createdAt: new Date().toISOString(),
    expiresAt: shl.expiresAt,
    source: shl.viewerUrl ?? shl.shlUrl ?? undefined,
    payload: shl
  }));
}

export function walletObjectFromCredentialOffer(parsed: ParsedCredentialOffer): WalletStoredObject {
  return {
    id: `oid4vci:${parsed.issuer ?? parsed.credentialOfferUri ?? Date.now()}`,
    type: "oid4vci_offer",
    title: "OID4VCI Credential Offer",
    subtitle: credentialOfferLabel(parsed),
    status: "pending",
    protocol: "oid4vci",
    createdAt: new Date().toISOString(),
    source: parsed.issuer ?? parsed.credentialOfferUri,
    payload: parsed
  };
}

export function walletObjectFromPresentationRequest(parsed: ParsedPresentationRequest): WalletStoredObject {
  return {
    id: `oid4vp:${parsed.state ?? parsed.nonce ?? Date.now()}`,
    type: "oid4vp_request",
    title: "OID4VP Presentation Request",
    subtitle: presentationRequestLabel(parsed),
    status: "pending",
    protocol: "oid4vp",
    createdAt: new Date().toISOString(),
    source: parsed.verifier,
    payload: parsed
  };
}

export function walletObjectFromServicePacket(packet: ServicePacketResponse | CheckinQrResponse): WalletStoredObject {
  const isCheckin = "shlId" in packet;
  return {
    id: isCheckin ? `shl:${packet.shlId}` : `vp:${packet.presentationId}`,
    type: isCheckin ? "shl" : "vp",
    title: isCheckin ? "Check-in SHL Packet" : "Service VP Packet",
    subtitle: isCheckin ? `SHL ${packet.shlId}` : packet.presentationId,
    status: isCheckin ? packet.status : "active",
    protocol: isCheckin ? "shl" : "trustcare",
    createdAt: new Date().toISOString(),
    expiresAt: packet.expiresAt,
    payload: packet
  };
}

export function mergeWalletObjects(...groups: WalletStoredObject[][]): WalletStoredObject[] {
  const map = new Map<string, WalletStoredObject>();
  for (const group of groups) {
    for (const item of group) map.set(item.id, item);
  }
  return Array.from(map.values()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function storedTypeForCard(card: WalletCard): WalletStoredObject["type"] {
  const type = normalizeDocumentType(card.cardType);
  if (type === "shl_manifest") return "shl_manifest";
  if (type === "sync_receipt") return "sync_receipt";
  return "vc";
}
