import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getCompleteWalletSeed } from "@trustcare/wallet-core";
import { SelectiveDisclosureDialog } from "./SelectiveDisclosureDialog";

describe("review before sharing dialog", () => {
  it("uses patient language and does not promise unsupported partial disclosure", () => {
    const card = getCompleteWalletSeed("demo-patient-complete-001").find(
      (item) => item.cardType === "patient_identity",
    )!;
    const html = renderToStaticMarkup(
      <SelectiveDisclosureDialog
        card={card}
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain("ตรวจข้อมูลก่อนแชร์");
    expect(html).toContain("ส่งเอกสารที่เลือกทั้งฉบับ");
    expect(html).toContain("สร้าง QR เอกสารทั้งฉบับ");
    expect(html).not.toContain("Full VC");
    expect(html).not.toContain("Selective Disclosure");
    expect(html).not.toContain("ZKP");
    expect(html).not.toContain('type="checkbox"');
  });
});
