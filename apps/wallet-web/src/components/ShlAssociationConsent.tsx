import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@trustcare/ui-web";
import type { WalletShlAssociation } from "@trustcare/contracts";

export function ShlAssociationConsent({
  associationKey,
  onAssociate,
}: {
  associationKey: string;
  onAssociate: () => Promise<WalletShlAssociation>;
}) {
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "submitting" }
    | { status: "complete"; association: WalletShlAssociation }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    setConsentConfirmed(false);
    setState({ status: "idle" });
  }, [associationKey]);

  async function confirm() {
    if (!consentConfirmed || state.status === "submitting") return;
    setState({ status: "submitting" });
    try {
      const association = await onAssociate();
      setState({ status: "complete", association });
      setConsentConfirmed(false);
    } catch (reason) {
      setState({
        status: "error",
        message:
          reason instanceof Error
            ? reason.message
            : "ไม่สามารถยืนยันลิงก์สุขภาพได้",
      });
    }
  }

  return (
    <section
      className="credential-inspector-section shl-association-consent"
      data-testid="shl-holder-association"
      data-association-key={associationKey}
    >
      <div className="credential-inspector-section-title">
        <ShieldCheck size={18} />
        <h3>ยืนยันลิงก์สุขภาพนี้</h3>
      </div>
      {state.status === "complete" ? (
        <p className="shl-association-result is-complete" role="status">
          <CheckCircle2 size={18} />
          ผูก Holder VP แล้ว ลิงก์นี้ได้รับการยืนยันจากโรงพยาบาล
        </p>
      ) : (
        <>
          <p className="shl-association-explanation">
            Wallet จะลงนามเฉพาะ Holder VP เพื่อยืนยันว่าคุณยินยอมใช้ Manifest
            Credential ฉบับนี้ โดยไม่แก้เอกสารที่โรงพยาบาลลงนาม
          </p>
          <label className="shl-association-check">
            <input
              type="checkbox"
              checked={consentConfirmed}
              disabled={state.status === "submitting"}
              onChange={(event) =>
                setConsentConfirmed(event.currentTarget.checked)
              }
            />
            <span>ฉันยืนยันการผูกลิงก์นี้กับ Wallet ของฉัน</span>
          </label>
          <Button
            disabled={!consentConfirmed || state.status === "submitting"}
            onClick={() => void confirm()}
          >
            <ShieldCheck size={18} />
            {state.status === "submitting"
              ? "กำลังยืนยัน..."
              : "ลงนามและยืนยันลิงก์"}
          </Button>
          {state.status === "error" ? (
            <p className="shl-association-result is-error" role="alert">
              {state.message}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
