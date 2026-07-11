import {
  portalHospitalDid,
  type TrustCarePortalHospitalCode,
  type WalletExchangeWorkflow,
} from "@trustcare/api-client";
import type { WalletDocumentRecordV2 } from "@trustcare/wallet-core";

export type PortalHospitalCode = TrustCarePortalHospitalCode;

export type RecordExchangeSubmissionResult = {
  clientSubmissionId: string;
  submissionId: string;
  status: string;
  updatedAt: string;
};

type DirectPresentationInput = Parameters<
  WalletExchangeWorkflow["submitDirectPresentation"]
>[0];

type SubmissionWorkflow = Pick<
  WalletExchangeWorkflow,
  "submitDirectPresentation" | "refreshSubmission"
>;

type WalletExchangeFlowPrefix = "wallet-submission" | "wallet-consent";

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function secureWalletExchangeFlowId(
  prefix: WalletExchangeFlowPrefix,
  randomUUID: () => string = systemRandomUuid,
): string {
  const uuid = randomUUID();
  if (!uuidV4Pattern.test(uuid)) {
    throw new Error("Wallet Exchange requires a cryptographic UUID v4.");
  }
  return `${prefix}:${uuid}`;
}

export async function submitWalletExchangeRecord(input: {
  workflow: Pick<SubmissionWorkflow, "submitDirectPresentation">;
  record: WalletDocumentRecordV2;
  targetHospitalCode: PortalHospitalCode;
  portalBaseUrl: string;
  context: DirectPresentationInput["context"];
  purpose: string;
  reload: () => Promise<void>;
  randomUUID?: () => string;
}): Promise<RecordExchangeSubmissionResult> {
  let response;
  try {
    response = await input.workflow.submitDirectPresentation({
      clientSubmissionId: secureWalletExchangeFlowId(
        "wallet-submission",
        input.randomUUID,
      ),
      context: input.context,
      purpose: input.purpose,
      consentRef: secureWalletExchangeFlowId(
        "wallet-consent",
        input.randomUUID,
      ),
      recipient: portalHospitalDid(
        input.portalBaseUrl,
        input.targetHospitalCode,
      ),
      documentIds: [input.record.id],
    });
  } catch (error) {
    try {
      await input.reload();
    } catch {
      // Preserve the original network/Portal error. The durable draft remains
      // available and a later reload can still discover it.
    }
    throw error;
  }
  await input.reload();
  return submissionResult(response);
}

export async function refreshWalletExchangeSubmission(input: {
  workflow: Pick<SubmissionWorkflow, "refreshSubmission">;
  clientSubmissionId: string;
  reload: () => Promise<void>;
}): Promise<RecordExchangeSubmissionResult> {
  const response = await input.workflow.refreshSubmission(
    input.clientSubmissionId,
  );
  await input.reload();
  return submissionResult(response);
}

export function defaultPortalHospitalCode(
  hospitalCode: string,
): PortalHospitalCode {
  const normalized = hospitalCode.trim().toUpperCase();
  return normalized === "TCP" || normalized === "TCM" ? normalized : "TCC";
}

function systemRandomUuid(): string {
  if (
    typeof globalThis.crypto === "undefined" ||
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    throw new Error(
      "This browser cannot create the cryptographic sharing identifier required by Wallet Exchange.",
    );
  }
  return globalThis.crypto.randomUUID();
}

function submissionResult(response: {
  clientSubmissionId: string;
  submissionId: string;
  status: string;
  updatedAt: string;
}): RecordExchangeSubmissionResult {
  return {
    clientSubmissionId: response.clientSubmissionId,
    submissionId: response.submissionId,
    status: response.status,
    updatedAt: response.updatedAt,
  };
}
