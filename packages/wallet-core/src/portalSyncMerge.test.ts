import { describe, expect, it } from "vitest";
import type { WalletCard } from "./models";
import {
  buildPortalKnownCredentials,
  mergePortalSyncedCards,
} from "./portalSyncMerge";
import { buildPortalWalletPushDraft } from "./portalWalletPush";

describe("portal sync merge", () => {
  it("keeps one active credential when Portal sends the same credential again", () => {
    const existing = card({ version: 1, issuedAt: "2026-07-01T00:00:00.000Z" });
    const result = mergePortalSyncedCards({
      existingCards: [existing],
      incomingCards: [existing],
      syncedAt: "2026-07-07T00:00:00.000Z",
    });

    expect(result.cards).toHaveLength(1);
    expect(result.report).toMatchObject({
      added: 0,
      updated: 0,
      unchanged: 1,
      archived: 0,
    });
  });

  it("archives an older active credential when a newer version arrives", () => {
    const existing = card({
      id: 1,
      version: 1,
      issuedAt: "2026-07-01T00:00:00.000Z",
    });
    const incoming = card({
      id: 2,
      version: 2,
      issuedAt: "2026-07-03T00:00:00.000Z",
    });
    const result = mergePortalSyncedCards({
      existingCards: [existing],
      incomingCards: [incoming],
      syncedAt: "2026-07-07T00:00:00.000Z",
    });

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.id).toBe(2);
    expect(result.archivedObjects).toHaveLength(1);
    expect(result.archivedObjects[0]?.status).toBe("superseded");
    expect(result.report).toMatchObject({
      updated: 1,
      archived: 1,
    });
  });

  it("ignores stale incoming credentials for the same lineage", () => {
    const existing = card({
      id: 2,
      version: 2,
      issuedAt: "2026-07-03T00:00:00.000Z",
    });
    const stale = card({
      id: 1,
      version: 1,
      issuedAt: "2026-07-01T00:00:00.000Z",
    });
    const result = mergePortalSyncedCards({
      existingCards: [existing],
      incomingCards: [stale],
    });

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.id).toBe(2);
    expect(result.archivedObjects).toHaveLength(0);
    expect(result.report.staleIgnored).toBe(1);
  });

  it("deduplicates Portal reseeded credentials by stable subject when document references change", () => {
    const existing = card({
      id: 1,
      credentialId: "urn:portal:old:patient-identity",
      documentReferenceId: "DocumentReference/old-patient-identity",
      carepassId: "CP-TH-2026-000001",
      version: 1,
      issuedAt: "2026-07-01T00:00:00.000Z",
    });
    const incoming = card({
      id: 2,
      credentialId: "urn:portal:new:patient-identity",
      documentReferenceId: "DocumentReference/new-patient-identity",
      carepassId: "CP-TH-2026-000001",
      version: 2,
      issuedAt: "2026-07-03T00:00:00.000Z",
    });

    const result = mergePortalSyncedCards({
      existingCards: [existing],
      incomingCards: [incoming],
      syncedAt: "2026-07-07T00:00:00.000Z",
    });

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.credentialId).toBe(
      "urn:portal:new:patient-identity",
    );
    expect(result.archivedObjects).toHaveLength(1);
    expect(result.report).toMatchObject({
      updated: 1,
      archived: 1,
    });
  });

  it("keeps separate clinical documents for the same patient when document lineage differs", () => {
    const firstPrescription = card({
      id: 10,
      cardType: "prescription",
      displayName: "ใบสั่งยา",
      displayNameEn: "Prescription",
      documentCategory: "medication_and_pharmacy",
      credentialId: "urn:portal:vc:prescription:1",
      documentReferenceId: "DocumentReference/prescription-1",
      version: 1,
      issuedAt: "2026-07-01T00:00:00.000Z",
    });
    const secondPrescription = card({
      id: 11,
      cardType: "prescription",
      displayName: "ใบสั่งยา",
      displayNameEn: "Prescription",
      documentCategory: "medication_and_pharmacy",
      credentialId: "urn:portal:vc:prescription:2",
      documentReferenceId: "DocumentReference/prescription-2",
      version: 1,
      issuedAt: "2026-07-02T00:00:00.000Z",
    });

    const result = mergePortalSyncedCards({
      existingCards: [],
      incomingCards: [firstPrescription, secondPrescription],
      syncedAt: "2026-07-07T00:00:00.000Z",
    });

    expect(result.cards).toHaveLength(2);
    expect(result.report.added).toBe(2);
  });

  it("keeps active Portal credential over expired duplicate from the same lineage", () => {
    const active = card({
      id: 21,
      credentialId: "urn:portal:vc:patient_identity:active",
      version: 2,
      issuedAt: "2026-07-02T00:00:00.000Z",
      credentialStatus: "active",
    });
    const expiredDuplicate = card({
      id: 20,
      credentialId: "urn:portal:vc:patient_identity:expired",
      version: 2,
      issuedAt: "2026-07-04T00:00:00.000Z",
      credentialStatus: "expired",
    });

    const result = mergePortalSyncedCards({
      existingCards: [active],
      incomingCards: [expiredDuplicate],
      syncedAt: "2026-07-07T00:00:00.000Z",
    });

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.credentialId).toBe(
      "urn:portal:vc:patient_identity:active",
    );
    expect(result.report.staleIgnored).toBe(1);
    expect(result.archivedObjects).toHaveLength(0);
  });

  it("archives Portal credentials missing from an authoritative snapshot", () => {
    const oldIdentity = card({
      id: 1,
      version: 1,
      issuedAt: "2026-07-01T00:00:00.000Z",
    });
    const oldQuotation = card({
      id: 3,
      cardType: "quotation",
      displayName: "ใบเสนอราคาค่ารักษา",
      displayNameEn: "Treatment Quotation",
      documentCategory: "claims_and_finance",
      credentialId: "urn:portal:vc:old-quotation",
      documentReferenceId: "DocumentReference/old-quotation",
      version: 1,
      issuedAt: "2026-07-01T00:00:00.000Z",
    });
    const incomingIdentity = card({
      id: 2,
      version: 2,
      issuedAt: "2026-07-03T00:00:00.000Z",
    });

    const result = mergePortalSyncedCards({
      existingCards: [oldIdentity, oldQuotation],
      incomingCards: [incomingIdentity],
      syncedAt: "2026-07-07T00:00:00.000Z",
      authoritativeSnapshot: true,
    });

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.id).toBe(2);
    expect(result.report).toMatchObject({
      active: 1,
      updated: 1,
      archived: 2,
    });
    expect(result.archivedObjects.map((object) => object.status)).toEqual([
      "superseded",
      "superseded",
    ]);
    expect(
      result.archivedObjects.some(
        (object) =>
          (object.payload as { archivedReason?: string }).archivedReason ===
          "portal_sync_authoritative_snapshot_removed",
      ),
    ).toBe(true);
  });

  it("builds known credential and future push payloads from the active wallet scope", () => {
    const owned = card({
      id: 1,
      ownerUserId: "demo-patient-complete-001",
      version: 2,
    });
    const other = card({ id: 2, ownerUserId: "another-user", version: 1 });

    expect(buildPortalKnownCredentials([owned])).toHaveLength(1);
    const draft = buildPortalWalletPushDraft({
      ownerUserId: "demo-patient-complete-001",
      cards: [owned, other],
      createdAt: "2026-07-07T00:00:00.000Z",
    });

    expect(draft.schema).toBe("trustcare.wallet.push.v1");
    expect(draft.credentials).toHaveLength(1);
    expect(draft.credentials[0]?.walletCredentialId).toBe(
      "urn:portal:vc:patient_identity",
    );
    expect(draft.policy.operation).toBe("upsert_with_version_check");
  });
});

function card(
  input: {
    id?: number;
    ownerUserId?: string;
    version?: number;
    issuedAt?: string;
    cardType?: string;
    displayName?: string;
    displayNameEn?: string;
    documentCategory?: string;
    credentialId?: string;
    documentReferenceId?: string | null;
    carepassId?: string;
    hn?: string;
    credentialStatus?: WalletCard["credentialStatus"];
  } = {},
): WalletCard {
  const version = input.version ?? 1;
  const issuedAt = input.issuedAt ?? "2026-07-01T00:00:00.000Z";
  const credentialId = input.credentialId ?? "urn:portal:vc:patient_identity";
  const documentReferenceId =
    input.documentReferenceId === undefined
      ? "DocumentReference/patient-identity"
      : input.documentReferenceId;
  const credentialSubject: Record<string, unknown> = {
    id: "did:key:holder",
    credentialVersion: version,
    patient: {
      carepassId: input.carepassId ?? "CP-TEST-001",
      hn: input.hn ?? "HN-TEST-001",
    },
  };
  if (documentReferenceId)
    credentialSubject.documentReferenceId = documentReferenceId;
  const evidence = documentReferenceId
    ? [
        {
          type: "DocumentReference",
          documentReference: {
            id: documentReferenceId,
          },
        },
      ]
    : [];
  return {
    id: input.id ?? 1,
    cardType: input.cardType ?? "patient_identity",
    displayName: input.displayName ?? "บัตรประจำตัวผู้ป่วย",
    displayNameEn: input.displayNameEn ?? "Patient ID Card",
    documentCategory: input.documentCategory ?? "identity_and_access",
    credentialId,
    credentialStatus: input.credentialStatus ?? "active",
    credentialData: {
      id: credentialId,
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      version,
      validFrom: issuedAt,
      issuer: { id: "did:web:trustcare.network:hospital:tcc" },
      credentialSubject,
      evidence,
    },
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    holderDid: "did:key:holder",
    ownerUserId: input.ownerUserId ?? "demo-patient-complete-001",
    sourceSystem: "trustcare_portal",
    issuedAt,
    createdAt: issuedAt,
  };
}
