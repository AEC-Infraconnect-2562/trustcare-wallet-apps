import type {
  WalletExchangeCredentialRequestLink,
  WalletExchangeWorkflow,
} from "@trustcare/api-client/walletExchangeWorkflow";
import {
  getCanonicalDocumentTypeCopy,
  normalizeDocumentType,
  type DocumentRequestDraft,
  type ReadinessContext,
  type WalletDocumentRequest,
} from "@trustcare/wallet-core";
/*
 * Keep the Portal credential type in state for auditability, but translate it
 * at the view boundary so a patient never has to interpret a schema name.
 */
export function credentialRequestDocumentLabel(value: string): string {
  const withoutCredentialSuffix = value
    .replace(/Credential$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  const normalized =
    normalizeDocumentType(value) ??
    normalizeDocumentType(withoutCredentialSuffix);
  return normalized ? getCanonicalDocumentTypeCopy(normalized).label : value;
}

type RequestMissingCredentialsInput = Parameters<
  WalletExchangeWorkflow["requestMissingCredentials"]
>[0];

type CreatedCredentialRequest = Awaited<
  ReturnType<WalletExchangeWorkflow["requestMissingCredentials"]>
>;

type CredentialRequestStatus = Awaited<
  ReturnType<WalletExchangeWorkflow["refreshCredentialRequest"]>
>;

export type PortalHospitalCode =
  RequestMissingCredentialsInput["targetHospitalCode"];

export type WalletCredentialRequestViewModel = WalletDocumentRequest & {
  clientRequestId?: string;
  nextAction?:
    | CreatedCredentialRequest["nextAction"]
    | CredentialRequestStatus["nextAction"];
  items?: CredentialRequestStatus["items"];
  updatedAt?: string;
  refreshing?: boolean;
  refreshError?: string;
};

export function requirePortalHospitalCode(value: string): PortalHospitalCode {
  if (value === "TCC" || value === "TCP" || value === "TCM") return value;
  throw new Error(
    "โรงพยาบาลนี้ยังไม่ได้เชื่อมต่อ Wallet Exchange V2 ระบบจะไม่ส่งคำขอผ่านช่องทางสำรอง",
  );
}

export function createMissingCredentialRequestInput(input: {
  draft: DocumentRequestDraft;
  hospitalCode: string;
  randomUuid?: () => string;
}): RequestMissingCredentialsInput {
  const randomUuid = input.randomUuid ?? secureRandomUuid;
  const documentTypes = [...input.draft.requestedDocumentTypes];
  const purpose = input.draft.serviceLabel.trim();
  if (!documentTypes.length) {
    throw new Error("ไม่พบประเภทเอกสารที่จะขอจากโรงพยาบาล");
  }
  if (!purpose || purpose.length > 128) {
    throw new Error("วัตถุประสงค์ของคำขอเอกสารไม่ถูกต้อง");
  }
  return {
    clientRequestId: `wallet-request:${randomUuid()}`,
    targetHospitalCode: requirePortalHospitalCode(input.hospitalCode),
    context: input.draft.context,
    purpose,
    consentRef: `wallet-consent:${randomUuid()}`,
    documentTypes,
  };
}

export function createdCredentialRequestViewModel(input: {
  response: CreatedCredentialRequest;
  context: ReadinessContext;
  documentTypes: readonly string[];
  hospitalCode: PortalHospitalCode;
  hospitalName: string;
}): WalletCredentialRequestViewModel {
  return {
    id: input.response.requestId,
    requestId: input.response.requestId,
    clientRequestId: input.response.clientRequestId,
    context: input.context,
    documentType: input.documentTypes.join(", "),
    requestedDocumentTypes: [...input.documentTypes],
    sourceType: input.hospitalCode,
    sourceName: input.hospitalName,
    requestFormat: "wallet_exchange_v2",
    returnChannel: "portal_wallet_exchange_v2",
    trustPolicy: "issuer_signed",
    status: input.response.status,
    nextAction: input.response.nextAction,
    createdAt: input.response.createdAt,
  };
}

export function persistedCredentialRequestViewModel(
  link: WalletExchangeCredentialRequestLink,
): WalletCredentialRequestViewModel {
  const documentTypes = link.documentTypes?.length
    ? link.documentTypes
    : link.credentialTypes;
  const hospitalNames: Record<PortalHospitalCode, string> = {
    TCC: "TrustCare Central Hospital",
    TCP: "TrustCare Phuket International Hospital",
    TCM: "TrustCare Medical Center",
  };
  return {
    id: link.requestId,
    requestId: link.requestId,
    clientRequestId: link.clientRequestId,
    context: link.context,
    documentType: documentTypes.map(credentialRequestDocumentLabel).join(", "),
    requestedDocumentTypes: [...documentTypes],
    sourceType: link.targetHospitalCode,
    sourceName: hospitalNames[link.targetHospitalCode],
    requestFormat: "wallet_exchange_v2",
    returnChannel: "portal_wallet_exchange_v2",
    trustPolicy: "issuer_signed",
    status: link.lastKnownStatus ?? "received",
    nextAction:
      link.lastKnownStatus === "ready" || link.lastKnownStatus === "partial"
        ? "sync_credentials"
        : "wait_for_maker_checker",
    items: link.items?.map((item) => ({ ...item })),
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

export function mergeCredentialRequestStatus(
  request: WalletCredentialRequestViewModel,
  response: CredentialRequestStatus,
): WalletCredentialRequestViewModel {
  if (
    !request.clientRequestId ||
    request.clientRequestId !== response.clientRequestId ||
    request.requestId !== response.requestId
  ) {
    throw new Error(
      "สถานะคำขอจาก Portal ไม่ตรงกับคำขอใน Wallet จึงไม่นำข้อมูลมาแสดง",
    );
  }
  return {
    ...request,
    status: response.status,
    nextAction: response.nextAction,
    items: response.items.map((item) => ({ ...item })),
    updatedAt: response.updatedAt,
    refreshing: false,
    refreshError: undefined,
  };
}

export function credentialRequestStatusLabel(status?: string | null): string {
  const labels: Record<string, string> = {
    received: "รับคำขอแล้ว",
    pending_review: "รอโรงพยาบาลตรวจทาน",
    in_progress: "โรงพยาบาลกำลังดำเนินการ",
    ready: "พร้อมรับเข้า Wallet",
    partial: "พร้อมบางรายการ",
    completed: "เสร็จสมบูรณ์",
    rejected: "โรงพยาบาลปฏิเสธคำขอ",
    cancelled: "ยกเลิกแล้ว",
    draft: "ฉบับร่าง",
    requested: "ส่งคำขอแล้ว",
    pending_consent: "รอความยินยอม",
    imported: "รับข้อมูลแล้ว",
    needs_review: "รอตรวจทาน",
    converted_to_vc: "ออกเอกสารแล้ว",
  };
  return labels[String(status ?? "")] ?? String(status ?? "-");
}

export function credentialRequestNextActionLabel(
  nextAction?: WalletCredentialRequestViewModel["nextAction"],
): string {
  if (nextAction === "wait_for_maker_checker") {
    return "รอขั้นตอน Maker/Checker ของโรงพยาบาล";
  }
  if (nextAction === "sync_credentials") {
    return "เอกสารพร้อมแล้ว ให้ซิงก์เข้ากระเป๋า";
  }
  return "";
}

export function credentialRequestReasonLabel(reasonCode?: string): string {
  const labels: Record<string, string> = {
    awaiting_provider_action: "โรงพยาบาลกำลังเตรียมเอกสาร",
    awaiting_maker_review: "รอเจ้าหน้าที่จัดทำเอกสาร",
    awaiting_checker_review: "รอผู้ตรวจสอบอนุมัติ",
    awaiting_patient_consent: "รอความยินยอมจากผู้ป่วย",
    credential_issued: "โรงพยาบาลออกเอกสารแล้ว",
    provider_rejected: "โรงพยาบาลไม่สามารถออกเอกสารรายการนี้",
  };
  return labels[String(reasonCode ?? "")] ?? "กำลังดำเนินการตามขั้นตอนของโรงพยาบาล";
}

export function credentialRequestItemNextActionLabel(
  nextAction?: NonNullable<WalletCredentialRequestViewModel["items"]>[number]["nextAction"],
): string {
  const labels = {
    wait_for_provider: "รอโรงพยาบาลดำเนินการ",
    complete_consent: "กรุณาตรวจและยืนยันความยินยอม",
    sync_credentials: "พร้อมซิงก์เข้ากระเป๋า",
    review_provider_outcome: "กรุณาตรวจผลจากโรงพยาบาล",
  } as const;
  return nextAction ? labels[nextAction] : "";
}

function secureRandomUuid(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error(
      "อุปกรณ์ไม่รองรับ secure random identifier จึงไม่สามารถสร้างคำขอได้อย่างปลอดภัย",
    );
  }
  return globalThis.crypto.randomUUID();
}
