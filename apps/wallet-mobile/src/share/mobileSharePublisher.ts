import { shareGatewayApi, walletApi } from "@trustcare/api-client";
import {
  assertPrimaryVerifierQrPayload,
  canPresentCredential,
  credentialStatusLabel,
  readinessContextLabels,
  type ReadinessContext,
  type SharePackageMode,
  type WalletCard,
  type WalletPresentationResponse,
} from "@trustcare/wallet-core";

type WalletApiOptions = Parameters<typeof walletApi.createSharePackage>[0];

export type MobileVpSharePublication = {
  presentation: WalletPresentationResponse;
  qrPayload: string;
  gatewayUrl: string;
  artifactUrl?: string;
  warnings: string[];
};

export type MobileSharePackagePublication = {
  mode: SharePackageMode;
  context: ReadinessContext;
  qrPayload: string;
  artifactUrl?: string;
  warnings: string[];
  presentation?: WalletPresentationResponse;
  packageId: string;
  expiresAt: string;
  credentialCount: number;
};

export async function publishMobileVpShare(input: {
  apiOptions: WalletApiOptions;
  card: WalletCard;
  userId: string | number;
  holderDid: string;
  shareGatewayUrl: string;
  context?: ReadinessContext;
  recipient?: string;
  selectedFields?: string[];
  validMinutes?: number;
}): Promise<MobileVpSharePublication> {
  const publication = await publishMobileSharePackage({
    ...input,
    cards: [input.card],
    selectedCardIds: [input.card.id],
    mode: "PurposeVP",
    context: input.context ?? "opd_visit",
  });
  if (!publication.presentation) throw new Error("สร้าง VP package ไม่สำเร็จ");
  return {
    presentation: publication.presentation,
    qrPayload: publication.qrPayload,
    gatewayUrl: input.shareGatewayUrl,
    artifactUrl: publication.artifactUrl,
    warnings: publication.warnings,
  };
}

export async function publishMobileSharePackage(input: {
  apiOptions: WalletApiOptions;
  cards: WalletCard[];
  selectedCardIds: Array<number | string>;
  userId: string | number;
  holderDid: string;
  shareGatewayUrl: string;
  mode: SharePackageMode;
  context: ReadinessContext;
  recipient?: string;
  selectedFields?: string[];
  validMinutes?: number;
}): Promise<MobileSharePackagePublication> {
  const selected = input.cards.filter((card) =>
    input.selectedCardIds.map(String).includes(String(card.id)),
  );
  if (!selected.length) throw new Error("กรุณาเลือกเอกสารอย่างน้อย 1 รายการ");
  const blocked = selected.find((card) => !canPresentCredential(card));
  if (blocked) {
    throw new Error(
      `เอกสารนี้ยังแชร์ไม่ได้: ${credentialStatusLabel(blocked.credentialStatus)}`,
    );
  }
  const gatewayUrl = input.shareGatewayUrl.trim();
  if (!gatewayUrl) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า Share Gateway สำหรับสร้าง QR ที่สแกนข้ามเครื่องได้",
    );
  }
  const context = input.context ?? "opd_visit";
  const recipient = input.recipient ?? "TrustCare mobile verifier";
  const expiresAt = new Date(
    Date.now() + (input.validMinutes ?? 10) * 60_000,
  ).toISOString();
  const purposeLabel = readinessContextLabels[context]?.th ?? context;
  const selectedHolderDid =
    selected.find((card) => card.holderDid)?.holderDid ?? undefined;
  const holderDid = input.holderDid || selectedHolderDid;
  if (!holderDid) {
    throw new Error(
      "ยังไม่มี Holder DID สำหรับลงนาม VP/SHL ให้ verifier ตรวจได้",
    );
  }
  const result = await walletApi.createSharePackage(input.apiOptions, {
    mode: input.mode,
    context,
    selectedCardIds: selected.map((card) => card.id),
    holderDid,
    recipient,
    purpose: purposeLabel,
    selectedFields: input.selectedFields ?? [],
    expiresAt,
    gatewayBaseUrl: gatewayUrl,
    viewerBaseUrl: input.apiOptions.demoOrigin,
    shlPolicy:
      input.mode === "StandardSHL" ||
      input.mode === "CertifiedSHLManifestPackage"
        ? {
            passcodeRequired: false,
            maxAccessCount: 3,
            accessCodeDelivery: "not_required",
          }
        : undefined,
  });
  const publication =
    "presentation" in result
      ? await shareGatewayApi.publishVpSharePackage({
          gatewayBaseUrl: gatewayUrl,
          result,
          userId: input.userId,
          holderDid,
          purpose: context,
          purposeLabel,
          recipient,
          expiresAt,
        })
      : await shareGatewayApi.publishShlSharePackage({
          gatewayBaseUrl: gatewayUrl,
          result,
          userId: input.userId,
          holderDid,
          purpose: context,
          purposeLabel,
          recipient,
          expiresAt,
        });
  const qrPayload =
    publication.qrPayload ??
    publication.publicUrl ??
    ("presentation" in result
      ? result.presentation.qrData
      : result.shl.qrPayload);
  if (!qrPayload) {
    throw new Error("Share Gateway ไม่ได้ส่ง resolver QR กลับมา");
  }
  assertPrimaryVerifierQrPayload(qrPayload);
  return {
    mode: input.mode,
    context,
    qrPayload,
    artifactUrl: publication.publicUrl,
    warnings: publication.warnings ?? [],
    presentation:
      "presentation" in result
        ? {
            ...result.presentation,
            qrData: qrPayload,
          }
        : undefined,
    packageId:
      "presentation" in result
        ? result.presentation.presentationId
        : String(result.shl.gatewayPublicationId ?? result.shl.shlId),
    expiresAt,
    credentialCount: selected.length,
  };
}
