import { describe, expect, it } from "vitest";
import type { DocumentRequestDraft } from "@trustcare/wallet-core";
import {
  credentialRequestDocumentLabel,
  createMissingCredentialRequestInput,
  createdCredentialRequestViewModel,
  mergeCredentialRequestStatus,
  requirePortalHospitalCode,
} from "./walletExchangeCredentialRequest";

const draft: DocumentRequestDraft = {
  context: "opd_visit",
  serviceLabel: "เตรียมรับบริการผู้ป่วยนอก",
  source: "trustcare_portal",
  format: "vc_vp",
  scope: "document_bundle",
  returnChannel: "portal_sync",
  requestedDocumentTypes: ["patient_identity", "patient_summary"],
  requestedRequirementKeys: ["identity", "clinical_summary"],
  patientId: 12345,
  trustPolicy: "issuer_signed",
  destinationLabel: "TrustCare Portal",
  formatLabel: "VC/VP",
  routeSelection: "automatic",
  nextSteps: [],
  warnings: [],
};

describe("Wallet Exchange V2 credential request view model", () => {
  it("translates Portal credential types into patient-facing document names", () => {
    expect(credentialRequestDocumentLabel("PatientIdentityCredential")).toBe(
      "ยืนยันตัวตนผู้ป่วย",
    );
  });

  it("builds opaque request and consent references without Portal patientId", () => {
    const uuids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const result = createMissingCredentialRequestInput({
      draft,
      hospitalCode: "TCP",
      randomUuid: () => uuids.shift()!,
    });

    expect(result).toEqual({
      clientRequestId: "wallet-request:11111111-1111-4111-8111-111111111111",
      targetHospitalCode: "TCP",
      context: "opd_visit",
      purpose: "เตรียมรับบริการผู้ป่วยนอก",
      consentRef: "wallet-consent:22222222-2222-4222-8222-222222222222",
      documentTypes: ["patient_identity", "patient_summary"],
    });
    expect(result).not.toHaveProperty("patientId");
  });

  it("fails closed for hospitals outside the live Portal issuer set", () => {
    expect(() => requirePortalHospitalCode("PXH")).toThrow(
      /ไม่ส่งคำขอผ่านช่องทางสำรอง/,
    );
  });

  it("merges only status belonging to the same durable request link", () => {
    const request = createdCredentialRequestViewModel({
      response: {
        schema: "trustcare.wallet.credential-request.v1",
        requestId: "req-1",
        clientRequestId: "client-1",
        status: "received",
        credentialTypes: ["PatientIdentityCredential"],
        statusUrl:
          "https://trustcare-hospital-network-production.up.railway.app/api/wallet/v2/credential-requests/req-1",
        nextAction: "wait_for_maker_checker",
        createdAt: "2026-07-11T10:00:00.000Z",
        idempotent: false,
      },
      context: "opd_visit",
      documentTypes: ["patient_identity"],
      hospitalCode: "TCC",
      hospitalName: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
    });

    const merged = mergeCredentialRequestStatus(request, {
      schema: "trustcare.wallet.credential-request-status.v1",
      requestId: "req-1",
      clientRequestId: "client-1",
      status: "in_progress",
      items: [
        {
          requestId: "item-1",
          documentType: "PatientIdentityCredential",
          status: "needs_review",
          updatedAt: "2026-07-11T10:01:00.000Z",
        },
      ],
      nextAction: "wait_for_maker_checker",
      updatedAt: "2026-07-11T10:01:00.000Z",
    });

    expect(merged.status).toBe("in_progress");
    expect(merged.items?.[0]?.status).toBe("needs_review");
    expect(() =>
      mergeCredentialRequestStatus(request, {
        schema: "trustcare.wallet.credential-request-status.v1",
        requestId: "different-request",
        clientRequestId: "client-1",
        status: "ready",
        items: [],
        nextAction: "sync_credentials",
        updatedAt: "2026-07-11T10:02:00.000Z",
      }),
    ).toThrow(/ไม่ตรงกับคำขอใน Wallet/);
  });
});
