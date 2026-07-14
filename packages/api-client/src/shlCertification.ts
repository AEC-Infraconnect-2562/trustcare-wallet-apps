import type { ShlCertificationRequest } from "@trustcare/wallet-core";
import { TrustCareApiError } from "./errors";

export type ShlCertificationState =
  | "pending_review"
  | "in_progress"
  | "ready"
  | "partial"
  | "rejected";

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
  const allowedHospitals = new Set(["TCC", "TCP", "TCM"]);
  if (
    !value.clientRequestId ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.shlPackageId) ||
    !allowedHospitals.has(value.targetHospitalCode) ||
    !value.context ||
    !value.purpose ||
    !value.consentRef ||
    !isHttpsUrl(value.manifestUrl) ||
    value.manifestUrl.length > 2_048 ||
    !isSha256Digest(value.manifestHash) ||
    !isSha256Digest(value.sourceBundleHash) ||
    !value.fileHashes.length ||
    value.fileHashes.some((hash) => !isSha256Digest(hash)) ||
    !isIsoDate(value.expiresAt) ||
    !looksLikeCompactJwt(value.holderAuthorizationVpJwt)
  ) {
    throw new TrustCareApiError("SHL certification request is invalid.", {
      code: "shl_certification_request_invalid",
    });
  }
  return value;
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

function isSha256Digest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}
