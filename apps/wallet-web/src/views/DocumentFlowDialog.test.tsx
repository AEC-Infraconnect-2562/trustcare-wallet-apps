import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalServiceProfiles,
  getDemoUser,
} from "@trustcare/wallet-core";
import { DocumentFlowDialog } from "./AppViews";

describe("missing-document request experience", () => {
  const user = getDemoUser("demo-patient-003");
  const canonicalRequirement = canonicalServiceProfiles.opd_visit.requirements.find(
    (item) => item.key === "allergy",
  )!;
  const requirement = {
    key: canonicalRequirement.key,
    label: canonicalRequirement.label,
    labelEn: canonicalRequirement.labelEn,
    category: canonicalRequirement.category,
    required: canonicalRequirement.required,
    cardTypes: [...canonicalRequirement.documentTypes],
    action: "request_missing_documents",
    sourceHint: "FHIR/HIS",
  };

  it("keeps technical route choices out of the patient request flow", () => {
    const html = renderToStaticMarkup(
      <DocumentFlowDialog
        mode="request"
        user={user}
        context="opd_visit"
        requirements={[requirement]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(html).toContain("ระบบจัดการวิธีรับเอกสารให้");
    expect(html).toContain("คุณไม่ต้องเลือกรูปแบบไฟล์หรือมาตรฐานทางเทคนิค");
    expect(html).toContain("ระบบจะหยุดและแจ้งขั้นตอนที่ทำต่อได้");
    expect(html).not.toMatch(
      /VC\/VP|OID4VCI|FHIR|SHL|Document Bundle|รับกลับอย่างไร/,
    );
  });

  it("keeps explicit format controls only in the separate import flow", () => {
    const html = renderToStaticMarkup(
      <DocumentFlowDialog
        mode="import"
        user={user}
        context="opd_visit"
        requirements={[requirement]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(html).toContain("รูปแบบเอกสาร");
    expect(html).toContain("FHIR DocumentReference");
  });
});
