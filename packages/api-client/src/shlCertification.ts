import type { ShlCertificationRequest } from "@trustcare/wallet-core";
import { TrustCareApiError } from "./errors";

export type ShlCertificationState =
  | "received"
  | "pending_review"
  | "approved"
  | "rejected";

export type ShlCertificationResponse = {
  schema: "trustcare.wallet.shl-certification.v1";
  certificationRequestId: string;
  requestId: string;
  shlPackageId: string;
  status: ShlCertificationState;
  statusUrl: string;
  createdAt: string;
  updatedAt: string;
  manifestCredentialContentType?: "application/vc+jwt";
  manifestCredentialJwt?: string;
  correlationId: string;
  idempotent: boolean;
};

export type ShlCertificationAvailability =
  | {
      available: true;
      endpoint: string;
    }
  | {
      available: false;
      status: "portal_unavailable";
      patientMessage: "รอการรับรองจากโรงพยาบาล";
    };

export function assertShlCertificationRequest(
  value: ShlCertificationRequest,
): ShlCertificationRequest {
  assertNoPatientId(value);
  if (
    value.schema !== "trustcare.shl-certification-request.v1" ||
    !value.requestId ||
    !value.shlPackageId ||
    !value.holderDid.startsWith("did:key:") ||
    !looksLikeCompactJwt(value.holderPresentationJwt) ||
    !value.manifestHash.startsWith("sha256:") ||
    !value.fileHashes.length ||
    !value.sourceCredentials.length
  ) {
    throw new TrustCareApiError("SHL certification request is invalid.", {
      code: "shl_certification_request_invalid",
    });
  }
  return value;
}

export function assertShlCertificationResponse(
  value: unknown,
): ShlCertificationResponse {
  assertNoPatientId(value);
  const record = objectValue(value);
  const allowedKeys = new Set([
    "schema",
    "certificationRequestId",
    "requestId",
    "shlPackageId",
    "status",
    "statusUrl",
    "createdAt",
    "updatedAt",
    "manifestCredentialContentType",
    "manifestCredentialJwt",
    "correlationId",
    "idempotent",
  ]);
  if (
    !record ||
    Object.keys(record).some((key) => !allowedKeys.has(key)) ||
    record.schema !== "trustcare.wallet.shl-certification.v1" ||
    !isNonEmptyString(record.certificationRequestId) ||
    !isNonEmptyString(record.requestId) ||
    !isNonEmptyString(record.shlPackageId) ||
    !["received", "pending_review", "approved", "rejected"].includes(
      String(record.status),
    ) ||
    !isHttpsUrl(record.statusUrl) ||
    !isIsoDate(record.createdAt) ||
    !isIsoDate(record.updatedAt) ||
    !isNonEmptyString(record.correlationId) ||
    typeof record.idempotent !== "boolean"
  ) {
    throw new TrustCareApiError("SHL certification response is invalid.", {
      code: "shl_certification_response_invalid",
    });
  }
  const jwt = record.manifestCredentialJwt;
  const contentType = record.manifestCredentialContentType;
  if (
    (record.status === "approved" &&
      (contentType !== "application/vc+jwt" || !looksLikeCompactJwt(jwt))) ||
    (record.status !== "approved" &&
      (contentType !== undefined || jwt !== undefined))
  ) {
    throw new TrustCareApiError(
      "Portal returned a Manifest VC without an approved application/vc+jwt response binding.",
      { code: "shl_certification_response_invalid" },
    );
  }
  return record as ShlCertificationResponse;
}

function assertNoPatientId(value: unknown): void {
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    for (const [key, nested] of Object.entries(candidate)) {
      if (key.replace(/[-_]/g, "").toLowerCase() === "patientid") {
        throw new TrustCareApiError(
          "Portal patientId is forbidden in SHL certification exchange.",
          { code: "portal_patient_id_forbidden" },
        );
      }
      visit(nested);
    }
  };
  visit(value);
}

function looksLikeCompactJwt(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  return (
    parts.length === 3 &&
    parts.every((part) => Boolean(part) && /^[A-Za-z0-9_-]+$/.test(part))
  );
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
