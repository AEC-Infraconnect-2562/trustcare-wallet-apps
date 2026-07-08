import { decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { parseJwtPayload } from "./credentialProof";
import { credentialRenderModelFromCard } from "./credentialRenderer";
import { getDemoWalletCards } from "./demoData";
import { presentationEnvelopeFromWalletCard } from "./presentationEnvelope";
import {
  createDemoOid4vciIssuerMetadata,
  createDemoOid4vciPreAuthorizedOffer,
  createDemoOid4vciTokenResponse,
  createOid4vciHolderProofJwt,
  issueDemoOid4vciCredential,
} from "./oid4vciIssuer";

describe("OID4VCI demo issuer standards layer", () => {
  it("defines issuer metadata and pre-authorized token nonce contract", () => {
    const offer = createDemoOid4vciPreAuthorizedOffer({
      issuerOrigin: "https://issuer.trustcare.example",
      credentialTypes: ["PatientSummaryCredential"],
      holderDid: "did:key:holder",
      userId: "demo-patient-001",
    });
    const metadata = createDemoOid4vciIssuerMetadata({
      issuerOrigin: offer.issuer ?? "",
      credentialTypes: offer.configurationIds,
    });
    const token = createDemoOid4vciTokenResponse({ offer });

    expect(offer.grantTypes).toContain(
      "urn:ietf:params:oauth:grant-type:pre-authorized_code",
    );
    expect(metadata.credential_endpoint).toBe(
      "https://issuer.trustcare.example/oid4vci/credential",
    );
    expect(metadata.credential_configurations_supported).toHaveProperty(
      "PatientSummaryCredential",
    );
    expect(token.token_type).toBe("Bearer");
    expect(token.c_nonce).toMatch(/^demo-cnonce-/);
  });

  it("creates holder proof JWT with OID4VCI typ, audience, and nonce", async () => {
    const proof = await createOid4vciHolderProofJwt({
      holderDid: "did:key:holder",
      audience: "https://issuer.trustcare.example",
      nonce: "nonce-123",
      now: new Date("2026-07-08T00:00:00.000Z"),
    });
    const header = decodeProtectedHeader(proof.jwt);
    const payload = parseJwtPayload(proof.jwt);

    expect(header.typ).toBe("openid4vci-proof+jwt");
    expect(header.alg).toBe("ES256");
    expect(payload?.iss).toBe("did:key:holder");
    expect(payload?.aud).toBe("https://issuer.trustcare.example");
    expect(payload?.nonce).toBe("nonce-123");
  });

  it("issues an SD-JWT VC wallet card that the shared renderer can display", async () => {
    const sourceCard = getDemoWalletCards("demo-patient-complete-001")[0];
    expect(sourceCard).toBeTruthy();
    const offer = createDemoOid4vciPreAuthorizedOffer({
      issuerOrigin: "https://issuer.trustcare.example",
      credentialTypes: [sourceCard.credentialType ?? "TrustCareCredential"],
      holderDid: "did:key:holder",
      userId: "demo-patient-complete-001",
    });
    const issued = await issueDemoOid4vciCredential({
      sourceCard,
      offer,
      holderDid: "did:key:holder",
      userId: "demo-patient-complete-001",
      now: new Date("2026-07-08T00:00:00.000Z"),
    });
    const renderModel = credentialRenderModelFromCard(issued.credential);
    const envelope = presentationEnvelopeFromWalletCard(issued.credential);

    expect(issued.sdJwtVc).toContain("~");
    expect(issued.credential.credentialStatus).toBe("active");
    expect(issued.credential.credentialProof?.format).toBe("sd-jwt-vc");
    expect(issued.storedObject.protocol).toBe("oid4vci");
    expect(renderModel.narrative.title).toBeTruthy();
    expect(renderModel.sections.length).toBeGreaterThan(0);
    expect(envelope.trust.status).not.toBe("proof_missing");
  });
});
