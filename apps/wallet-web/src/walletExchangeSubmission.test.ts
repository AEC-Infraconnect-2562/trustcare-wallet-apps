import { describe, expect, it, vi } from "vitest";
import {
  getDemoWalletCards,
  walletDocumentRecordV2FromCard,
} from "@trustcare/wallet-core";
import {
  defaultPortalHospitalCode,
  refreshWalletExchangeSubmission,
  secureWalletExchangeFlowId,
  submitWalletExchangeRecord,
} from "./walletExchangeSubmission";

const portalBaseUrl =
  "https://trustcare-hospital-network-production.up.railway.app";
const record = walletDocumentRecordV2FromCard(getDemoWalletCards()[0]);
const submission = {
  schema: "trustcare.wallet.document-submission.v1" as const,
  submissionId: "submission-1",
  clientSubmissionId: "wallet-submission:00000000-0000-4000-8000-000000000001",
  status: "received" as const,
  presentationId: "presentation-1",
  results: [],
  statusUrl: `${portalBaseUrl}/api/wallet/v2/submissions/submission-1`,
  createdAt: "2026-07-11T08:00:00.000Z",
  updatedAt: "2026-07-11T08:00:00.000Z",
  idempotent: false,
};

describe("Wallet Exchange record submission adapter", () => {
  it("creates a holder submission for the selected Portal hospital without patientId", async () => {
    const submitDirectPresentation = vi.fn().mockResolvedValue(submission);
    const issuerDidForHospital = vi
      .fn()
      .mockResolvedValue("did:web:issuer.portal.example:tcp");
    const reload = vi.fn().mockResolvedValue(undefined);
    const uuids = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ];

    const result = await submitWalletExchangeRecord({
      workflow: { issuerDidForHospital, submitDirectPresentation },
      record,
      targetHospitalCode: "TCP",
      context: "referral",
      purpose: "ส่งต่อการดูแล",
      reload,
      randomUUID: () => uuids.shift()!,
    });

    expect(submitDirectPresentation).toHaveBeenCalledWith({
      clientSubmissionId:
        "wallet-submission:00000000-0000-4000-8000-000000000001",
      context: "referral",
      purpose: "ส่งต่อการดูแล",
      consentRef: "wallet-consent:00000000-0000-4000-8000-000000000002",
      recipient: "did:web:issuer.portal.example:tcp",
      documentIds: [record.id],
    });
    expect(submitDirectPresentation.mock.calls[0]?.[0]).not.toHaveProperty(
      "patientId",
    );
    expect(reload).toHaveBeenCalledOnce();
    expect(result).toEqual({
      clientSubmissionId: submission.clientSubmissionId,
      submissionId: submission.submissionId,
      status: submission.status,
      updatedAt: submission.updatedAt,
    });
  });

  it("refreshes a durable submission link and then reloads persistence", async () => {
    const refreshed = { ...submission, status: "accepted" as const };
    const refreshSubmission = vi.fn().mockResolvedValue(refreshed);
    const reload = vi.fn().mockResolvedValue(undefined);

    const result = await refreshWalletExchangeSubmission({
      workflow: { refreshSubmission } as never,
      clientSubmissionId: submission.clientSubmissionId,
      reload,
    });

    expect(refreshSubmission).toHaveBeenCalledWith(
      submission.clientSubmissionId,
    );
    expect(reload).toHaveBeenCalledOnce();
    expect(result.status).toBe("accepted");
  });

  it("reloads the durable outbox after a failed send without masking the original error", async () => {
    const original = new TypeError("connection closed after upload");
    const submitDirectPresentation = vi.fn().mockRejectedValue(original);
    const issuerDidForHospital = vi
      .fn()
      .mockResolvedValue("did:web:issuer.portal.example:tcc");
    const reload = vi.fn().mockRejectedValue(new Error("reload failed"));
    const uuids = [
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
    ];

    await expect(
      submitWalletExchangeRecord({
        workflow: { issuerDidForHospital, submitDirectPresentation },
        record,
        targetHospitalCode: "TCC",
        context: "opd_visit",
        purpose: "รับบริการต่อเนื่อง",
        reload,
        randomUUID: () => uuids.shift()!,
      }),
    ).rejects.toBe(original);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("fails closed without a valid UUID v4 and never treats PXH as a Portal issuer", () => {
    expect(() =>
      secureWalletExchangeFlowId("wallet-submission", () => "weak-id"),
    ).toThrow("cryptographic UUID v4");
    expect(defaultPortalHospitalCode("TCP")).toBe("TCP");
    expect(defaultPortalHospitalCode("PXH")).toBe("TCC");
  });
});
