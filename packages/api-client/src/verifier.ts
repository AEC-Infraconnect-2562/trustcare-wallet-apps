import {
  parseOid4vcCredentialOffer,
  parseOid4vpRequest,
  parseTrustCareQr,
  type VerifierResult
} from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";

export type VerifierApiOptions = TrustCareClientOptions & {
  demoMode?: boolean;
};

export async function verifyQr(options: VerifierApiOptions, qrData: string): Promise<VerifierResult> {
  const oid4vci = parseOid4vcCredentialOffer(qrData);
  if (oid4vci) {
    return {
      verified: true,
      trustLevel: "yellow",
      protocol: "oid4vci",
      issuer: oid4vci.issuer ?? oid4vci.credentialOfferUri ?? "OID4VCI issuer",
      requestSummary: `Credential offer: ${oid4vci.configurationIds.join(", ") || "metadata reference"}`,
      warnings: ["Credential offer parsed. Wallet must fetch issuer metadata over TLS and require user consent before storing any VC."],
      errors: []
    };
  }
  const oid4vp = parseOid4vpRequest(qrData);
  if (oid4vp) {
    return {
      verified: Boolean(oid4vp.nonce || oid4vp.requestUri),
      trustLevel: oid4vp.nonce || oid4vp.requestUri ? "yellow" : "red",
      protocol: "oid4vp",
      issuer: oid4vp.verifier ?? "OID4VP verifier",
      requestSummary: `Requests ${oid4vp.requestedCredentialTypes.join(", ") || `${oid4vp.descriptorCount} descriptor(s)`}`,
      warnings: ["OID4VP request parsed. Select matching credentials and generate VP only after user consent."],
      errors: oid4vp.nonce || oid4vp.requestUri ? [] : ["OID4VP request has no nonce/request_uri; treat as untrusted."]
    };
  }
  if (options.demoMode ?? true) {
    const parsed = parseTrustCareQr(qrData);
    return {
      verified: parsed.kind === "vp-url" || parsed.kind === "presentation-id",
      trustLevel: parsed.kind === "shlink" ? "yellow" : parsed.kind === "unknown" ? "red" : "green",
      protocol: parsed.kind === "shlink" ? "shl" : parsed.kind === "jwt" ? "jwt" : parsed.kind === "json" ? "json" : parsed.kind === "unknown" ? "unknown" : "trustcare-vp",
      issuer: parsed.kind === "shlink" ? "SMART Health Link transport" : "TrustCare Verifier",
      holderDid: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
      requestSummary: parsed.presentationId ? `Presentation ID ${parsed.presentationId}` : parsed.kind,
      warnings: parsed.kind === "shlink" ? ["SHL is transport. Open SHL detail to inspect Manifest VC and Holder VP."] : [],
      errors: parsed.kind === "unknown" ? ["QR code does not contain a recognized TrustCare VP format."] : []
    };
  }
  return callTrpcProcedure<VerifierResult>(options, "verifier.verifyQrScan", {
    qrData,
    source: "camera"
  });
}

export async function verify(options: VerifierApiOptions, input: { token?: string; vpUrl?: string }): Promise<VerifierResult> {
  if (options.demoMode ?? true) return verifyQr(options, input.vpUrl ?? input.token ?? "");
  return callTrpcProcedure<VerifierResult>(options, "verifier.verify", input);
}
