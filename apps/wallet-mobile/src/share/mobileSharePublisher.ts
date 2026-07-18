import * as shareGatewayApi from "@trustcare/api-client/shareGatewayClient";
import * as walletApi from "@trustcare/api-client/wallet";
import {
  assertPrimaryVerifierQrPayload,
  canPresentCredential,
  credentialStatusLabel,
  createHolderSignedDirectVp,
  readinessContextLabels,
  type ReadinessContext,
  type SharePackageMode,
  type WalletCard,
  type WalletPresentationResponse,
  type HolderSigningIdentity,
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
  holderIdentity?: HolderSigningIdentity;
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
  holderIdentity?: HolderSigningIdentity;
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
  if (
    input.mode === "StandardSHL" ||
    input.mode === "CertifiedSHLPackage"
  ) {
    throw new Error(
      "รอการเชื่อมต่อกุญแจ Holder และเอกสาร Portal บน Mobile ก่อนสร้าง SHL; ระบบจะไม่สร้างเอกสารรับรองทดแทนหรือแสดงว่าโรงพยาบาลรับรองแล้ว",
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
  });
  if (!("presentation" in result)) {
    throw new Error("Mobile SHL publication is unavailable until the holder key workflow is connected.");
  }
  if (!input.holderIdentity || input.holderIdentity.did !== holderDid) {
    throw new Error("Mobile ต้องเชื่อมต่อ holder key ก่อนลงนามและแชร์ VP");
  }
  const credentialJwts = selected.map((card) => card.credentialProof?.jwt ?? card.credentialJwt);
  if (credentialJwts.some((jwt) => !jwt)) {
    throw new Error("เอกสารที่เลือกต้องมีลายเซ็น issuer ครบทุกฉบับก่อนสร้าง VP");
  }
  const holderPresentation = await createHolderSignedDirectVp({
    identity: input.holderIdentity,
    holderDid,
    presentationId: result.presentation.presentationId,
    audience: "https://trustcare.network/verifier",
    recipient,
    context,
    purpose: purposeLabel,
    consentRef: `urn:trustcare:consent:share-event:${result.presentation.presentationId}`,
    credentialJwts: credentialJwts as string[],
    expiresAt,
  });
  const publication = await shareGatewayApi.publishVpSharePackage({
          gatewayBaseUrl: gatewayUrl,
          result,
          holderPresentationJwt: holderPresentation.vpJwt,
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
    result.presentation.qrData;
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
    presentation: {
      ...result.presentation,
      qrData: qrPayload,
    },
    packageId: result.presentation.presentationId,
    expiresAt,
    credentialCount: selected.length,
  };
}
