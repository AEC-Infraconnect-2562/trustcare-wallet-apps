import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  getCompleteWalletSeed,
  getDemoUser,
  walletDocumentRecordV2FromCard,
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
        testId="nav-home"
        onClick={vi.fn()}
      />,
    );

    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="หน้าแรก"');
  });

  it("explains deferred share policy without claiming hospital certification is missing", () => {
    const card = cards[0]!;
    const checkedAt = "2026-07-18T10:00:00.000Z";
    const record = walletDocumentRecordV2FromCard(card, { now: checkedAt });
    record.trust = {
      state: "issuer_signed_untrusted",
      checks: [
        ...["proof", "issuer", "status", "expiry", "holder"].map((key) => ({
          key,
          status: "passed" as const,
          checkedAt,
        })),
        {
          key: "policy",
          status: "pending",
          detail: "public_issuer_status_policy_unavailable",
          checkedAt,
        },
      ],
    };

    const html = renderToStaticMarkup(
      <HomeView
        cards={[card]}
        exchangeDocuments={[record]}
        user={user}
        offlineOnline
        onOpenCard={vi.fn()}
        onView={vi.fn()}
        serviceReadiness={serviceReadiness}
        activeReadinessContext="opd_visit"
        canSyncPortalWallet
        portalSyncBusy={false}
        onSyncPortal={vi.fn()}
        onPrepareContext={vi.fn()}
      />,
    );

    expect(html).toContain("ตรวจที่มาแล้ว · ตรวจนโยบายเมื่อแชร์");
    expect(html).not.toContain("รอโรงพยาบาลรับรอง");
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
