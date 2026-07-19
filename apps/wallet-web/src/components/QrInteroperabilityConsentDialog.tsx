import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, FileCheck2, KeyRound, X } from "lucide-react";
import { Button, IconButton } from "@trustcare/ui-web";
import type { ResolvedOid4vciOffer } from "@trustcare/api-client/qrInteroperability";
import type { WalletOid4vpConsentRequest } from "@trustcare/api-client/walletExchangeWorkflow";

export type PendingQrInteroperabilityConsent =
  | {
      kind: "oid4vci";
      qrPayload: string;
      offer: ResolvedOid4vciOffer;
    }
  | {
      kind: "oid4vp";
      consentRequest: WalletOid4vpConsentRequest;
    };

export function QrInteroperabilityConsentDialog({
  pending,
  busy,
  error,
  onClose,
  onAcceptCredential,
  onSharePresentation,
}: {
  pending: PendingQrInteroperabilityConsent | null;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onAcceptCredential: (transactionCode?: string) => void;
  onSharePresentation: () => void;
}) {
  const [transactionCode, setTransactionCode] = useState("");

  useEffect(() => {
    setTransactionCode("");
  }, [pending]);

  if (!pending) return null;
  const receiving = pending.kind === "oid4vci";
  const transactionCodeRequired =
    receiving && pending.offer.transactionCodeRequired;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="qr-consent-dialog" aria-labelledby="qr-consent-title">
        <header className="modal-header">
          <div className="dialog-title-block">
            <button
              type="button"
              className="dialog-back-button"
              onClick={onClose}
              disabled={busy}
            >
              <ArrowLeft size={15} /> กลับ
            </button>
            <div className="dialog-heading-row">
              {receiving ? <KeyRound size={22} /> : <FileCheck2 size={22} />}
              <strong id="qr-consent-title">
                {receiving ? "รับเอกสารเข้ากระเป๋า" : "ตรวจข้อมูลก่อนแชร์"}
              </strong>
            </div>
          </div>
          <IconButton aria-label="ปิด" onClick={onClose} disabled={busy}>
            <X size={20} />
          </IconButton>
        </header>

        <div className="qr-consent-content">
          {receiving ? (
            <>
              <div className="qr-consent-summary">
                <BadgeCheck size={22} />
                <div>
                  <strong>โรงพยาบาลเตรียมเอกสารไว้ให้คุณ</strong>
                  <p>
                    Wallet จะตรวจลายเซ็น ผู้ออกเอกสาร อายุ และสถานะเอกสาร
                    ก่อนบันทึก จากนั้นจึงยืนยันการรับกับ Portal
                  </p>
                </div>
              </div>
              {transactionCodeRequired && (
                <label className="qr-transaction-code">
                  <span>รหัสครั้งเดียวจากโรงพยาบาล</span>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={pending.offer.transactionCodeLength ?? 12}
                    value={transactionCode}
                    onChange={(event) =>
                      setTransactionCode(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder={`${pending.offer.transactionCodeLength ?? 6} หลัก`}
                    disabled={busy}
                  />
                  <small>รับรหัสผ่านช่องทางแยกจาก QR เพื่อความปลอดภัย</small>
                </label>
              )}
            </>
          ) : (
            <>
              <div className="qr-consent-summary">
                <FileCheck2 size={22} />
                <div>
                  <strong>{pending.consentRequest.request.purpose}</strong>
                  <p>
                    จะแชร์กับ {pending.consentRequest.request.issuer.didDocument.trustcare?.name ?? pending.consentRequest.request.issuer.hospitalCode}
                    และใช้ได้เฉพาะรายการนี้ภายในเวลาที่กำหนด
                  </p>
                </div>
              </div>
              <div className="qr-disclosure-list">
                <span>เอกสารที่จะเปิดเผย</span>
                {pending.consentRequest.documents.map((document) => (
                  <div key={document.id}>
                    <BadgeCheck size={18} />
                    <div>
                      <strong>{document.title}</strong>
                      <small>{document.credentialType}</small>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {error && (
            <p className="qr-consent-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="qr-consent-actions">
          <Button className="secondary" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button
            onClick={() =>
              receiving
                ? onAcceptCredential(transactionCode || undefined)
                : onSharePresentation()
            }
            disabled={
              busy ||
              (transactionCodeRequired &&
                transactionCode.length !== pending.offer.transactionCodeLength)
            }
          >
            {busy
              ? "กำลังตรวจสอบ..."
              : receiving
                ? "ตรวจและรับเอกสาร"
                : "ยืนยันและแชร์"}
          </Button>
        </footer>
      </section>
    </div>
  );
}
