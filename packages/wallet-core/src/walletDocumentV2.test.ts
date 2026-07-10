import { describe, expect, it } from "vitest";
import { completeWalletSeedCards } from "./completeSeedData";
import {
  groupWalletDocumentsV2ByEpisode,
  mergeWalletDocumentRecordsV2,
  walletDocumentRecordV2FromCard,
  walletDocumentRecordV2FromMhd,
} from "./walletDocumentV2";

const now = "2026-07-10T08:00:00.000Z";

describe("WalletDocumentRecordV2 migration", () => {
  it("normalizes every canonical complete-seed document without inventing verified trust", () => {
    const records = completeWalletSeedCards.map((card) =>
      walletDocumentRecordV2FromCard(card, { now }),
    );

    expect(records).toHaveLength(25);
    expect(records.every((record) => record.schemaVersion === "2.0")).toBe(true);
    expect(records.every((record) => Boolean(record.owner.id))).toBe(true);
    expect(
      records
        .filter((record) => record.documentType !== "staff_identity")
        .every((record) => record.owner.id === "demo-patient-complete-001"),
    ).toBe(true);
    expect(records.every((record) => record.trust.state !== "verified")).toBe(true);
  });

  it("maps DocumentReference attachments, record time and privacy explicitly", () => {
    const record = walletDocumentRecordV2FromCard(
      completeWalletSeedCards.find((card) => card.cardType === "patient_summary")!,
      { now, availableOffline: true, cachedAt: now },
    );

    expect(record.content.documentReference.resourceType).toBe("DocumentReference");
    expect(record.content.originalAttachments[0]?.contentType).toBeTruthy();
    expect(record.clinicalContext.recordTime).toBeTruthy();
    expect(record.privacy.defaultDisclosure).toBe("ask");
    expect(record.local.availableOffline).toBe(true);
  });

  it("normalizes patient-scoped MHD imports through the same V2 migration", () => {
    const record = walletDocumentRecordV2FromMhd(
      {
        resourceType: "DocumentReference",
        id: "mhd-lab-1",
        status: "current",
        docStatus: "final",
        date: "2026-07-01T00:00:00.000Z",
        content: [
          {
            attachment: {
              contentType: "application/fhir+json",
              url: "https://repository.example.test/Binary/lab-1",
              hash: "sha256-example",
            },
          },
        ],
      },
      {
        id: "mhd:lab-1",
        ownerUserId: "patient-1",
        patientId: "patient-1",
        documentType: "lab_result",
        category: "diagnostics_and_results",
        importedAt: now,
        repositoryEndpoint: "https://repository.example.test/fhir",
      },
      { now },
    );

    expect(record.provenance.sourceKind).toBe("mhd_repository");
    expect(record.content.originalAttachments[0]).toMatchObject({
      contentType: "application/fhir+json",
      hash: "sha256-example",
    });
    expect(record.trust.state).toBe("patient_provided_unverified");
  });

  it("requires proof, issuer, holder, status, expiry and policy checks before verified", () => {
    const seed = completeWalletSeedCards.find(
      (card) => card.cardType === "patient_identity",
    )!;
    const record = walletDocumentRecordV2FromCard(
      {
        ...seed,
        expiresAt: "2027-07-10T00:00:00.000Z",
        credentialJwt: "header.payload.signature",
        credentialProof: {
          type: "W3C VC JWT",
          format: "vc+jwt",
          jwt: "header.payload.signature",
        },
        portalVerification: {
          verified: true,
          status: "verified",
          checkedAt: now,
        },
      },
      { now },
    );

    expect(record.trust.state).toBe("verified");
    expect(record.trust.checks).toHaveLength(6);
    expect(record.trust.checks.every((check) => check.status === "passed")).toBe(true);
  });

  it("is idempotent for the same version and rejects content mutation without a version change", () => {
    const record = walletDocumentRecordV2FromCard(completeWalletSeedCards[0], {
      now,
    });
    expect(mergeWalletDocumentRecordsV2([record], [record])).toEqual([record]);
    expect(() =>
      mergeWalletDocumentRecordsV2([record], [
        { ...record, title: { ...record.title, th: "mutated" } },
      ]),
    ).toThrow(/without a new versionId/);
  });

  it("rejects cross-owner merges and groups records by episode", () => {
    const first = walletDocumentRecordV2FromCard(completeWalletSeedCards[0], {
      now,
    });
    const second = {
      ...walletDocumentRecordV2FromCard(completeWalletSeedCards[1], { now }),
      owner: { ...first.owner },
      clinicalContext: { episodeId: "episode-1" },
    };
    expect(groupWalletDocumentsV2ByEpisode([first, second])).toMatchObject({
      unassigned: [first],
      "episode-1": [second],
    });
    expect(() =>
      mergeWalletDocumentRecordsV2([first], [
        { ...second, owner: { id: "different-owner" } },
      ]),
    ).toThrow(/different owners/);
  });
});
