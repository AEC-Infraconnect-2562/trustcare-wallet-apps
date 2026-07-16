import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getCompleteWalletSeed } from "@trustcare/wallet-core";
import {
  CredentialDetailDialog,
  measurePaperNaturalHeight,
} from "./CredentialDetailDialog";

describe("credential inspector", () => {
  const cards = getCompleteWalletSeed("demo-patient-complete-001");

  it("keeps an identity credential at ID-1 size inside the shared inspector", () => {
    const card = cards.find((item) => item.cardType === "patient_identity")!;
    const html = renderToStaticMarkup(
      <CredentialDetailDialog
        card={card}
        open
        onClose={vi.fn()}
        onShare={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="credential-inspector"');
    expect(html).toContain('data-document-form-factor="iso_id_1"');
    expect(html).toContain("tc-form-iso-id-1");
    expect(html).toContain("ที่มาและการตรวจสอบ");
    expect(html).toContain("แชร์เอกสารนี้");
    expect(html).not.toContain("SD / ZKP");
    expect(html).not.toContain("Payload");
  });

  it("contains an A4 credential instead of allowing it to determine page height", () => {
    const card = cards.find((item) => item.cardType === "medical_certificate")!;
    const html = renderToStaticMarkup(
      <CredentialDetailDialog
        card={card}
        open
        onClose={vi.fn()}
        onShare={vi.fn()}
      />,
    );

    expect(html).toContain('data-document-form-factor="a4_portrait"');
    expect(html).toContain("credential-inspector-preview is-paper");
    expect(html).toContain("credential-paper-scaled-viewport");
    expect(html).toContain("credential-paper-scaled-frame");
    expect(html).toContain("เปิดเอกสารเต็ม");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("tc-form-a4-portrait");
  });

  it("reserves the complete paper height when content extends past one A4 sheet", () => {
    expect(
      measurePaperNaturalHeight(
        { offsetHeight: 1121, scrollHeight: 1153 },
        { offsetHeight: 1121, scrollHeight: 1210 },
      ),
    ).toBe(1210);
  });

  it("requires explicit holder consent before a Portal SHL association can run", () => {
    const card = cards.find((item) => item.cardType === "shl_manifest")!;
    const html = renderToStaticMarkup(
      <CredentialDetailDialog
        card={card}
        open
        onClose={vi.fn()}
        onShare={vi.fn()}
        onAssociateShl={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="shl-holder-association"');
    expect(html).toContain("ฉันยืนยันการผูกลิงก์นี้กับ Wallet ของฉัน");
    expect(html).toContain("ลงนามและยืนยันลิงก์");
    expect(html).toContain("disabled");
  });
});
