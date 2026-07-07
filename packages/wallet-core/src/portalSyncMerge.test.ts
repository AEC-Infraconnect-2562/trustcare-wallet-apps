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
    const existing = card({ id: 1, version: 1, issuedAt: "2026-07-01T00:00:00.000Z" });
    const incoming = card({ id: 2, version: 2, issuedAt: "2026-07-03T00:00:00.000Z" });
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
    const existing = card({ id: 2, version: 2, issuedAt: "2026-07-03T00:00:00.000Z" });
    const stale = card({ id: 1, version: 1, issuedAt: "2026-07-01T00:00:00.000Z" });
    const result = mergePortalSyncedCards({
      existingCards: [existing],
      incomingCards: [stale],
    });

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.id).toBe(2);
    expect(result.archivedObjects).toHaveLength(0);
    expect(result.report.staleIgnored).toBe(1);
  });

  it("builds known credential and future push payloads from the active wallet scope", () => {
    const owned = card({ id: 1, ownerUserId: "demo-patient-complete-001", version: 2 });
    const other = card({ id: 2, ownerUserId: "another-user", version: 1 });

    expect(buildPortalKnownCredentials([owned])).toHaveLength(1);
    const draft = buildPortalWalletPushDraft({
      ownerUserId: "demo-patient-complete-001",
      cards: [owned, other],
      createdAt: "2026-07-07T00:00:00.000Z",
    });

    expect(draft.schema).toBe("trustcare.wallet.push.v1");
    expect(draft.credentials).toHaveLength(1);
    expect(draft.credentials[0]?.walletCredentialId).toBe("urn:portal:vc:patient_identity");
    expect(draft.policy.operation).toBe("upsert_with_version_check");
  });
});

function card(input: {
  id?: number;
  ownerUserId?: string;
  version?: number;
  issuedAt?: string;
} = {}): WalletCard {
  const version = input.version ?? 1;
  const issuedAt = input.issuedAt ?? "2026-07-01T00:00:00.000Z";
  return {
    id: input.id ?? 1,
    cardType: "patient_identity",
    displayName: "บัตรประจำตัวผู้ป่วย",
    displayNameEn: "Patient ID Card",
    documentCategory: "identity_and_access",
    credentialId: "urn:portal:vc:patient_identity",
    credentialStatus: "active",
    credentialData: {
      id: "urn:portal:vc:patient_identity",
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      version,
      validFrom: issuedAt,
      issuer: { id: "did:web:trustcare.network:hospital:tcc" },
      credentialSubject: {
        id: "did:key:holder",
        documentReferenceId: "DocumentReference/patient-identity",
        credentialVersion: version,
      },
      evidence: [
        {
          type: "DocumentReference",
          documentReference: {
            id: "DocumentReference/patient-identity",
          },
        },
      ],
    },
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    holderDid: "did:key:holder",
    ownerUserId: input.ownerUserId ?? "demo-patient-complete-001",
    sourceSystem: "trustcare_portal",
    issuedAt,
    createdAt: issuedAt,
  };
}
