import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClinicalDocumentGraphPresentation } from "@trustcare/ui-web";
import type { ClinicalDocumentGraphPresentation as Presentation } from "@trustcare/contracts";

describe("ClinicalDocumentGraphPresentation", () => {
  it("renders all eight stages and keeps certified SHL trust objects distinct", () => {
    const openUnderlyingDocument = vi.fn();
    const html = renderToStaticMarkup(
      <ClinicalDocumentGraphPresentation
        presentation={presentation()}
        onOpenArtifact={openUnderlyingDocument}
      />,
    );

    expect(html).toContain('data-selected-artifact-id="shl-transport-1"');
    expect(html).toContain('data-node-count="4"');
    expect(html).toContain('data-edge-count="3"');
    for (const stage of [
      "source",
      "fhir",
      "document",
      "retrieval",
      "attestation",
      "vc",
      "shl",
      "vp",
    ]) {
      expect(html).toContain(`data-stage="${stage}"`);
    }
    expect(html).toContain("Smart Health Link transport");
    expect(html).toContain("Portal-signed Manifest / Document VC");
    expect(html).toContain("Wallet-signed Holder VP");
    expect(html).toContain("binds-manifest");
    expect(html).toContain("Shared Renderer");
    expect(html).toContain("เปิดเอกสาร");
    expect(openUnderlyingDocument).not.toHaveBeenCalled();
  });
});

function presentation(): Presentation {
  const digest = (character: string) => `sha256:${character.repeat(64)}`;
  const node = (
    artifactId: string,
    artifactType: string,
    semanticClass: Presentation["nodes"][number]["semanticClass"],
    hash: string,
    mediaType: string,
    retrievable = false,
  ): Presentation["nodes"][number] => ({
    artifactId,
    artifactType,
    semanticClass,
    lifecycleStatus: "active",
    versionId: `version-${artifactId}`,
    contentHash: hash,
    profileUris: [],
    retrievable,
    object: {
      objectId: `object-${artifactId}`,
      mediaType,
      schemaId: `urn:trustcare:schema:${artifactType}`,
      schemaVersion: "2.0.0",
      profileUris: [],
      contentHash: hash as `sha256:${string}`,
      canonicalization: "JCS",
      requiredFields: [],
      extensions: { tenantReference: "hospital:1" },
    },
  });
  const stages: Presentation["stages"] = [
    "source",
    "fhir",
    "document",
    "retrieval",
    "attestation",
    "vc",
    "shl",
    "vp",
  ].map((key) => ({
    key: key as Presentation["stages"][number]["key"],
    status: "available",
    artifactIds: ["shl-transport-1"],
    labelTh: key,
    labelEn: key,
    detailTh: `รายละเอียด ${key}`,
    detailEn: `Detail ${key}`,
  }));
  return {
    contractVersion: "2026.07.pcdg.v2",
    presentationId: "graph-presentation:shl-transport-1",
    requestedArtifactId: "shl-transport-1",
    rootArtifactId: "shl-transport-1",
    issuerHospitalId: 1,
    subjectId: null,
    subjectReference: "did:key:z6MkhGraphHolder",
    artifactType: "shl-transport",
    titleTh: "ชุดเอกสาร SHL ที่โรงพยาบาลรับรอง",
    titleEn: "Hospital-certified SHL",
    lifecycleStatus: "active",
    trustState: "fully_verified",
    stages,
    nodes: [
      node(
        "shl-transport-1",
        "shl-transport",
        "transport_artifact",
        digest("a"),
        "application/shlink",
        true,
      ),
      node(
        "manifest-vc-1",
        "verifiable-credential",
        "trust_artifact",
        digest("b"),
        "application/vc+jwt",
      ),
      node(
        "holder-vp-1",
        "holder-presentation",
        "presentation_artifact",
        digest("c"),
        "application/vp+jwt",
      ),
      node(
        "clinical-document-1",
        "clinical-document",
        "clinical_document",
        digest("d"),
        "application/fhir+json",
        true,
      ),
    ],
    edges: [
      {
        edgeId: "edge-manifest",
        sourceArtifactId: "shl-transport-1",
        targetArtifactId: "manifest-vc-1",
        edgeType: "binds-manifest",
      },
      {
        edgeId: "edge-presents",
        sourceArtifactId: "holder-vp-1",
        targetArtifactId: "manifest-vc-1",
        edgeType: "presents",
      },
      {
        edgeId: "edge-packages",
        sourceArtifactId: "shl-transport-1",
        targetArtifactId: "clinical-document-1",
        edgeType: "packages",
      },
    ],
    evidence: {
      passed: 4,
      warnings: 0,
      failed: 0,
      humanApprovals: 1,
      openTasks: 0,
    },
    generatedAt: "2026-07-13T04:00:00.000Z",
  };
}
