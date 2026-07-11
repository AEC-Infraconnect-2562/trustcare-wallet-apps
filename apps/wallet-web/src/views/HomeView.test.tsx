import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  getCompleteWalletSeed,
  getDemoUser,
} from "@trustcare/wallet-core";
import { HomeView, NavButton } from "./AppViews";
import type { ServiceReadinessSummary } from "./appViewModel";
import { Home } from "lucide-react";

describe("premium patient Home", () => {
  const userId = "demo-patient-complete-001";
  const user = getDemoUser(userId);
  const cards = getCompleteWalletSeed(userId);
  const serviceReadiness: ServiceReadinessSummary[] = [
    {
      context: "opd_visit",
      label: "เตรียมเข้ารับบริการ OPD",
      purpose: "ลงทะเบียนและเริ่มรับบริการตรวจรักษา",
      score: 100,
      criticalReady: true,
      requiredReady: 3,
      requiredTotal: 3,
      recommendedReady: 2,
      recommendedTotal: 2,
      missingRequired: 0,
      readyLabels: ["ตัวตน", "ข้อมูลแพ้ยา", "รายการยา"],
      missingLabels: [],
    },
  ];

  it("renders a task-first Home with bounded document entry points", () => {
    const html = renderToStaticMarkup(
      <HomeView
        cards={cards}
        user={user}
        readiness={{ readiness: { score: 100, criticalReady: true } }}
        history={[]}
        offlineOnline
        onOpenCard={vi.fn()}
        onView={vi.fn()}
        serviceReadiness={serviceReadiness}
        activeReadinessContext="opd_visit"
        canSyncPortalWallet={false}
        portalSyncBusy={false}
        onSyncPortal={vi.fn()}
        onPrepareContext={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="clinical-home"');
    expect(html).toContain("พร้อมสำหรับนัดหมายถัดไป");
    expect(html).toContain("เอกสารสำคัญ");
    expect(html).toContain("ล่าสุด");
    expect(html).toContain("appointment-hospital.png");
    expect(html).toContain("patient_somsak_a2e00e97.jpg");
    expect(html).toContain("รูปผู้ถือเอกสารจาก credential เดียวกัน");
    expect(html).toContain("clinical-pass-summary");
    expect(html).toContain("HN");
    expect(html).toContain("ผู้รับประกัน");
    expect(html).toContain("Metformin");
    expect(html).not.toContain("doctor_napa_abd67502.jpg");
    expect(html).not.toContain("ภาพรวม Health Passport");
  });

  it("marks the active navigation destination semantically", () => {
    const html = renderToStaticMarkup(
      <NavButton
        active
        icon={<Home />}
        label="หน้าแรก"
        onClick={vi.fn()}
      />,
    );

    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="หน้าแรก"');
  });

  it("uses the canonical appointment start instead of credential expiry", () => {
    const appointment = cards.find(
      (card) => card.cardType === "appointment",
    )!;
    const html = renderToStaticMarkup(
      <HomeView
        cards={[
          ...cards.filter((card) => card.id !== appointment.id),
          { ...appointment, expiresAt: "2030-07-15T16:59:59.000Z" },
        ]}
        user={user}
        readiness={{ readiness: { score: 100, criticalReady: true } }}
        history={[]}
        offlineOnline
        onOpenCard={vi.fn()}
        onView={vi.fn()}
        serviceReadiness={serviceReadiness}
        activeReadinessContext="opd_visit"
        canSyncPortalWallet={false}
        portalSyncBusy={false}
        onSyncPortal={vi.fn()}
        onPrepareContext={vi.fn()}
      />,
    );

    expect(html).toContain("12 ส.ค. 2569");
    expect(html).not.toContain("15 ก.ค. 2573");
  });
});
