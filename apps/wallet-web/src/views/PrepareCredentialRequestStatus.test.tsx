import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  assessLocalReadiness,
  getDemoUser,
  getDemoWalletCards,
} from "@trustcare/wallet-core";
import { PrepareView } from "./AppViews";

describe("Prepare Wallet Exchange request status", () => {
  it("shows live item progress, the Portal next action, and a refresh action", () => {
    const user = getDemoUser("demo-patient-003");
    const cards = getDemoWalletCards(user.id);
    const html = renderToStaticMarkup(
      <PrepareView
        user={user}
        cards={cards}
        context="opd_visit"
        readiness={{
          readiness: assessLocalReadiness(cards, "opd_visit"),
        }}
        contractHub={null}
        workbench={null}
        requests={[
          {
            id: "req-1",
            requestId: "req-1",
            clientRequestId: "client-1",
            context: "opd_visit",
            documentType: "ยืนยันตัวตนผู้ป่วย",
            sourceType: "TCC",
            sourceName: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
            status: "in_progress",
            nextAction: "wait_for_maker_checker",
            items: [
              {
                requestId: "item-1",
                documentType: "PatientIdentityCredential",
                status: "needs_review",
                updatedAt: "2026-07-11T10:01:00.000Z",
              },
            ],
          },
        ]}
        importJob={null}
        onContext={vi.fn()}
        onPrepareAll={vi.fn()}
        onRunPayerLifecycle={vi.fn()}
        onRequestMissing={vi.fn()}
        onImportMissing={vi.fn()}
        onRefreshRequest={vi.fn()}
      />,
    );

    expect(html).toContain("โรงพยาบาลกำลังดำเนินการ");
    expect(html).toContain("ยืนยันตัวตนผู้ป่วย");
    expect(html).toContain("รอตรวจทาน");
    expect(html).toContain("รอขั้นตอน Maker/Checker ของโรงพยาบาล");
    expect(html).toContain("ตรวจสถานะ");
  });
});
