import { describe, expect, it } from "vitest";
import * as walletApi from "./wallet";

describe("wallet API document facade", () => {
  const options = {
    url: "https://wallet.example/trpc",
    demoMode: true,
    demoOrigin: "https://wallet.example",
    userId: "demo-patient-complete-001",
  } satisfies walletApi.WalletApiOptions;

  it("lists canonical wallet documents backed by DocumentReference metadata", async () => {
    const documents = await walletApi.listDocuments(options, {
      documentTypes: ["patient_summary"],
    });

    expect(documents.length).toBeGreaterThan(0);
    expect(documents[0]?.documentType).toBe("patient_summary");
    expect(documents[0]?.documentReference.resourceType).toBe(
      "DocumentReference",
    );
    expect(documents[0]?.fhirDocumentBundle?.type).toBe("document");
  });

  it("imports MHD DocumentReference as unverified wallet evidence", async () => {
    const record = await walletApi.importFromMhd(options, {
      documentType: "lab_result",
      category: "diagnostics_and_results",
      title: "Imported lab report",
      documentReference: {
        resourceType: "DocumentReference",
        id: "external-lab-001",
        status: "current",
        type: { text: "Lab Result" },
        subject: { reference: "Patient/demo-patient-complete-001" },
        date: "2026-07-07T03:00:00.000Z",
        content: [
          {
            attachment: {
              contentType: "application/fhir+json",
              url: "https://repo.example/mhd/DocumentReference/external-lab-001",
            },
          },
        ],
      },
    });

    expect(record.source.system).toBe("mhd");
    expect(record.trustStatus).toBe("patient_provided_unverified");
    expect(record.documentReference.id).toBe("external-lab-001");
  });

  it("creates resolver-backed VP and SHL manifest candidates from the same canonical documents", async () => {
    const documents = await walletApi.listDocuments(options);
    const selectedCardIds = documents
      .slice(0, 3)
      .map((document) => Number(document.walletCard?.id));

    const vp = await walletApi.createSharePackage(options, {
      mode: "PurposeVP",
      context: "opd_visit",
      selectedCardIds,
      recipient: "TrustCare demo verifier",
    });
    expect(vp.mode).toBe("PurposeVP");
    if ("presentation" in vp) {
      expect(vp.presentation.qrData).toContain(
        "/api/share-gateway/presentations/",
      );
    }

    const certifiedShl = await walletApi.createSharePackage(options, {
      mode: "CertifiedSHLManifestPackage",
      context: "referral",
      selectedCardIds,
      recipient: "TrustCare referral verifier",
    });
    expect(certifiedShl.mode).toBe("CertifiedSHLManifestPackage");
    if ("shl" in certifiedShl) {
      const resolved = await walletApi.resolveSharePackage(options, {
        qrPayload: certifiedShl.shl.qrPayload,
      });
      expect(resolved.shl?.ok).toBe(true);
      expect(resolved.shl?.fileCount).toBeGreaterThan(0);

      const imported = await walletApi.importFromShl(options, {
        payload: certifiedShl.shl.qrPayload,
      });
      expect(imported.trust?.status).toBe("trustcare_pending");
      expect(imported.trust?.verified).toBe(false);
    }
  });

  it("accepts a demo OID4VCI pre-authorized offer as an issued SD-JWT VC", async () => {
    const fixtures = await walletApi.interoperabilityFixtures(options);
    const issued = await walletApi.acceptCredentialOffer(options, {
      offerPayload: fixtures.credentialOfferUrl,
    });

    expect(issued.credential.credentialStatus).toBe("active");
    expect(issued.credential.credentialProof?.format).toBe("sd-jwt-vc");
    expect(issued.holderProof.jwt).toBeTruthy();
    expect(issued.storedObject.protocol).toBe("oid4vci");
  });

  it("keeps locally generated demo credentials outside the live Portal issuer namespace", async () => {
    const cardsByCategory = await walletApi.cardsByCategory({
      ...options,
      userId: "demo-patient-003",
    });
    const cards = Object.values(cardsByCategory).flat();
    const johnDemoCard = cards.find(
      (card) => card.issuerDid === "did:web:wallet-demo.invalid:issuer:tcp",
    );

    expect(johnDemoCard?.sourceSystem).toBe("trustcare_demo_issuer");
    expect(johnDemoCard?.issuerDid).not.toContain(
      "trustcare-hospital-network-production.up.railway.app",
    );
  });
});
