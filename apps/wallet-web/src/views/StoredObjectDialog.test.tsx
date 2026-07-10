import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCompleteWalletSeed,
  getDemoUser,
  walletObjectsFromCards,
  type WalletStoredObject,
} from "@trustcare/wallet-core";
import {
  extractScannablePayload,
  getObjectScanPayload,
  printStoredCredential,
  StoredObjectDialog,
  storedCredentialCardForRendering,
} from "./AppViews";

const user = getDemoUser("demo-patient-complete-001");
const card = getCompleteWalletSeed("demo-patient-complete-001").find(
  (item) => item.cardType === "prescription",
)!;

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog(object: WalletStoredObject) {
  return renderToStaticMarkup(
    <StoredObjectDialog
      user={user}
      object={object}
      onClose={vi.fn()}
      onExport={vi.fn()}
    />,
  );
}

describe("stored object detail rendering", () => {
  it("uses the shared credential document for a stored WalletCard VC", () => {
    const object = walletObjectsFromCards([card])[0];
    const html = renderDialog(object);

    expect(storedCredentialCardForRendering(object)).toBe(card);
    expect(html).toContain("stored-vc-document");
    expect(html).toContain("tc-clinical-paper");
    expect(html).toContain("Metformin XR");
    expect(html).not.toContain("branded-share-pass");
    expect(html).toContain("ดู Payload สำหรับนักพัฒนา");
    expect(html).toContain("คัดลอก Payload");
    expect(html).toContain("พิมพ์ / บันทึก PDF");
    expect(html).toContain("ประเภท");

    const encodedPayload = extractScannablePayload(
      getObjectScanPayload(object),
    );
    expect(JSON.parse(encodedPayload)).toEqual(card.credentialData);
    expect(encodedPayload).not.toContain('"cardType"');
  });

  it("preserves the ID-1 form factor for a stored patient identity VC", () => {
    const identityCard = getCompleteWalletSeed(
      "demo-patient-complete-001",
    ).find((item) => item.cardType === "patient_identity")!;
    const object = walletObjectsFromCards([identityCard])[0];
    const html = renderDialog(object);

    expect(html).toContain('data-document-form-factor="iso_id_1"');
    expect(html).toContain("tc-form-iso-id-1");
  });

  it("prints only when the browser print API is available", () => {
    expect(printStoredCredential()).toBe(false);

    const print = vi.fn();
    vi.stubGlobal("window", { print });

    expect(printStoredCredential()).toBe(true);
    expect(print).toHaveBeenCalledOnce();
  });

  it("adapts an imported raw VC without inferring a verified state", () => {
    const object: WalletStoredObject = {
      id: "vc:raw-prescription",
      type: "vc",
      title: "Imported prescription",
      status: "pending",
      protocol: "trustcare",
      createdAt: "2026-07-10T00:00:00.000Z",
      payload: card.credentialData,
    };
    const renderCard = storedCredentialCardForRendering(object);
    const html = renderDialog(object);

    expect(renderCard?.credentialData).toBe(card.credentialData);
    expect(html).toContain("tc-clinical-paper");
    expect(html).not.toContain(
      "ตรวจสอบ proof, issuer, status, expiry และ policy ผ่านแล้ว",
    );
  });

  it("keeps VP and SHL objects on their existing non-VC renderers", () => {
    const vpObject: WalletStoredObject = {
      id: "vp:test",
      type: "vp",
      title: "Stored VP",
      status: "active",
      protocol: "trustcare",
      createdAt: "2026-07-10T00:00:00.000Z",
      payload: { presentationId: "urn:vp:test", purpose: "care" },
    };
    const shlObject: WalletStoredObject = {
      id: "shl:test",
      type: "shl",
      title: "Stored SHL",
      status: "active",
      protocol: "shl",
      createdAt: "2026-07-10T00:00:00.000Z",
      payload: {
        id: 7,
        status: "active",
        qrPayload: "shlink:/eyJ1cmwiOiJodHRwczovL2V4YW1wbGUuY29tIn0",
      },
    };

    expect(storedCredentialCardForRendering(vpObject)).toBeNull();
    expect(storedCredentialCardForRendering(shlObject)).toBeNull();
    const vpHtml = renderDialog(vpObject);
    const shlHtml = renderDialog(shlObject);

    expect(vpHtml).toContain("branded-share-pass");
    expect(shlHtml).toContain("branded-share-pass");
    expect(shlHtml).toContain("shl-manifest-viewer");
    expect(vpHtml).not.toContain("พิมพ์ / บันทึก PDF");
    expect(shlHtml).not.toContain("พิมพ์ / บันทึก PDF");
  });
});
