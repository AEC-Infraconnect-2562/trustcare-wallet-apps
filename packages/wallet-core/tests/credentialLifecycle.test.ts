import { describe, expect, it } from "vitest";
import {
  credentialPayloadDigest,
  evaluateCredentialLifecycle,
  evaluatePresentationLifecycle,
  summarizeCredentialSources,
  type WalletCard,
} from "../src";

describe("credential lifecycle policy", () => {
  it("does not let the wallet re-sign Portal-synced credentials", () => {
    const portalCard = walletCard({
      sourceSystem: "trustcare_portal",
      issuerDid: "did:web:portal.example:hospital:tcc",
      credentialProof: {
        type: "DataIntegrityProof",
        format: "vc+json",
        source: "trustcare_portal_sync_proof",
      },
      portalVerification: { verified: true, trustLevel: "green" },
    });

    const evaluation = evaluateCredentialLifecycle({
      card: portalCard,
      expectedSchemaVersion: "payer-claim-v2",
      changedFields: ["credentialSubject.claimDetails"],
    });

    expect(evaluation.sourceAuthority).toBe("portal_synced");
    expect(evaluation.canWalletReissue).toBe(false);
    expect(evaluation.verifyWith).toBe("source_issuer_did");
    expect(evaluation.signingOwner).toBe("source_issuer");
    expect(evaluation.action).toBe("verify_source");
  });

  it("requires source issuer proof when Portal sync has no proof", () => {
    const portalCard = walletCard({
      sourceSystem: "trustcare_portal",
      issuerDid: "did:web:portal.example:hospital:tcp",
      credentialProof: undefined,
      credentialJwt: undefined,
      portalVerification: { verified: false, trustLevel: "yellow" },
    });

    const evaluation = evaluateCredentialLifecycle({ card: portalCard });

    expect(evaluation.sourceAuthority).toBe("portal_synced");
    expect(evaluation.proofPresent).toBe(false);
    expect(evaluation.action).toBe("request_issuer_signature");
  });

  it("requires payer adapter re-issue and re-sign when claim payload changes", () => {
    const payerCard = walletCard({
      cardType: "claim_package",
      credentialType: "ClaimSubmissionReceiptCredential",
      sourceSystem: "payer_adapter",
      issuerDid: "did:web:wallet-demo.invalid:issuer:payer:global-care",
      credentialProof: {
        type: "DataIntegrityProof",
        format: "vc+json",
        source: "payer_adapter_result",
        kid: "did:web:wallet-demo.invalid:issuer:payer:global-care#key-1",
      },
      credentialData: {
        trustcare: { schemaVersion: "payer-claim-v1" },
        credentialSubject: {
          payerId: "global_care_insurance_demo",
          claimCaseId: "claim-001",
        },
      },
    });

    const evaluation = evaluateCredentialLifecycle({
      card: payerCard,
      expectedPayerId: "global_care_insurance_demo",
      expectedSchemaVersion: "payer-claim-v2",
      changedFields: ["credentialSubject.totalAmount"],
    });

    expect(evaluation.sourceAuthority).toBe("payer_adapter");
    expect(evaluation.signingOwner).toBe("payer_adapter");
    expect(evaluation.action).toBe("reissue_and_resign");
    expect(evaluation.mismatches).toEqual(
      expect.arrayContaining(["schema_version", "changed_fields"]),
    );
  });

  it("keeps wallet-issued credentials when issuer, schema, payer, and payload digest match", () => {
    const walletIssued = walletCard({
      sourceSystem: "oid4vci_demo_issuer",
      issuerDid: "did:web:wallet.example:issuer",
      credentialProof: {
        type: "JsonWebSignature2020",
        format: "vc+jwt",
        source: "oid4vci_demo_issuer",
        kid: "did:web:wallet.example:issuer#key-1",
      },
      credentialData: {
        trustcare: { schemaVersion: "wallet-v1" },
        credentialSubject: { payerId: "global_care_insurance_demo" },
      },
    });
    const digest = credentialPayloadDigest(walletIssued);

    const evaluation = evaluateCredentialLifecycle({
      card: walletIssued,
      expectedIssuerDid: "did:web:wallet.example:issuer",
      expectedPayerId: "global_care_insurance_demo",
      expectedSchemaVersion: "wallet-v1",
      expectedPayloadDigest: digest,
    });

    expect(evaluation.sourceAuthority).toBe("wallet_issued");
    expect(evaluation.canWalletReissue).toBe(true);
    expect(evaluation.action).toBe("keep");
  });

  it("rebuilds VP packages when purpose, recipient, selection, expiry, or credential digest changes", () => {
    const card = walletCard({ credentialId: "credential-1" });
    const first = evaluatePresentationLifecycle({
      selectedCards: [card],
      purpose: "opd-registration",
      recipient: "did:web:hospital.example",
      selectedFields: ["name"],
      holderDid: "did:key:holder",
      expiresAt: "2026-07-10T09:00:00.000Z",
    });
    const unchanged = evaluatePresentationLifecycle({
      selectedCards: [card],
      purpose: "opd-registration",
      recipient: "did:web:hospital.example",
      selectedFields: ["name"],
      holderDid: "did:key:holder",
      expiresAt: "2026-07-10T09:00:00.000Z",
      currentPresentationDigest: first.presentationDigest,
    });
    const changed = evaluatePresentationLifecycle({
      selectedCards: [card],
      purpose: "claim-submission",
      recipient: "did:web:payer.example",
      selectedFields: ["name", "coverage"],
      holderDid: "did:key:holder",
      expiresAt: "2026-07-10T10:00:00.000Z",
      currentPresentationDigest: first.presentationDigest,
    });

    expect(unchanged.action).toBe("keep");
    expect(changed.action).toBe("rebuild_and_sign");
  });

  it("summarizes credential sources for UX without mixing trust boundaries", () => {
    const summary = summarizeCredentialSources([
      walletCard({ sourceSystem: "trustcare_portal" }),
      walletCard({ sourceSystem: "payer_adapter", cardType: "claim_package" }),
      walletCard({ sourceSystem: "partner_wallet" }),
      walletCard({ issuerDid: undefined, credentialProof: undefined }),
    ]);

    expect(summary.portalSynced).toBe(1);
    expect(summary.payerAdapter).toBe(1);
    expect(summary.partnerWallet).toBe(1);
    expect(summary.patientProvided).toBe(1);
  });

  it("does not classify a provider-issued claim document as payer authority by type alone", () => {
    const providerClaim = walletCard({
      cardType: "claim_package",
      credentialType: "ClaimPackageCredential",
      sourceSystem: "trustcare_demo_issuer",
      issuerDid: "did:web:wallet-demo.invalid:issuer:tcc",
      credentialProof: undefined,
      credentialJwt: undefined,
    });

    const summary = summarizeCredentialSources([providerClaim]);
    expect(summary.payerAdapter).toBe(0);
    expect(summary.issuerSigned).toBe(1);
  });
});

function walletCard(overrides: Partial<WalletCard> = {}): WalletCard {
  return {
    id: 1,
    cardType: "patient_identity",
    displayName: "Patient ID Card",
    documentCategory: "identity_and_access",
    credentialId: "credential-1",
    credentialStatus: "active",
    issuerHospitalName: "TrustCare Hospital",
    issuerDid: "did:web:portal.example:hospital:tcc",
    holderDid: "did:key:holder",
    credentialData: {
      id: "urn:credential:1",
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      issuer: { id: "did:web:portal.example:hospital:tcc" },
      credentialSubject: { id: "did:key:holder" },
    },
    credentialProof: {
      type: "DataIntegrityProof",
      format: "vc+json",
      kid: "did:web:portal.example:hospital:tcc#key-1",
    },
    createdAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}
