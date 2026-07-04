import { parseTrustCareQr, type VerifierResult } from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";

export type VerifierApiOptions = TrustCareClientOptions & {
  demoMode?: boolean;
};

export async function verifyQr(options: VerifierApiOptions, qrData: string): Promise<VerifierResult> {
  if (options.demoMode ?? true) {
    const parsed = parseTrustCareQr(qrData);
    return {
      verified: parsed.kind === "vp-url" || parsed.kind === "presentation-id",
      trustLevel: parsed.kind === "shlink" ? "yellow" : parsed.kind === "unknown" ? "red" : "green",
      issuer: parsed.kind === "shlink" ? "SMART Health Link transport" : "TrustCare Verifier",
      holderDid: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
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

