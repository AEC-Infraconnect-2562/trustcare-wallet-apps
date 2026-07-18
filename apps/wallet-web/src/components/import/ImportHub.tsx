import { Camera, ClipboardPaste, Cloud, Upload } from "lucide-react";
import { Button } from "@trustcare/ui-web";
import {
  detectImportPayload,
  type ImportDetectionModel,
} from "@trustcare/wallet-core";
import { ImportDetectionPanel } from "./ImportDetectionPanel";

export function ImportHub({
  payload,
  livePortalSync,
  canSyncPortal,
  syncBusy,
  onPayload,
  onScan,
  onImport,
  onSyncPortal,
}: {
  payload: string;
  livePortalSync: boolean;
  canSyncPortal: boolean;
  syncBusy?: boolean;
  onPayload: (value: string) => void;
  onScan: () => void;
  onImport: () => void;
  onSyncPortal?: () => void;
}) {
  const detection: ImportDetectionModel = detectImportPayload(payload);

  return (
    <section className="import-hub">
      <div className="import-hub-main">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">รับเอกสารเข้า Wallet</span>
            <h2>สแกน วาง อัปโหลด หรือ Sync จาก Portal</h2>
            <p>
              วางลิงก์หรือข้อมูลที่ได้รับมา
              ระบบจะแยกประเภทให้อัตโนมัติและบอกความน่าเชื่อถือก่อนบันทึกเข้ากระเป๋า
            </p>
          </div>
        </div>
        <div className="import-source-row">
          <button type="button" onClick={onScan}>
            <Camera size={18} />
            สแกน QR
          </button>
          <button
            type="button"
            disabled={!canSyncPortal}
            onClick={onSyncPortal}
            title={
              canSyncPortal
                ? undefined
                : "ใช้ได้กับผู้ใช้ที่ผูก TrustCare Portal"
            }
          >
            <Cloud size={18} />
            {syncBusy
              ? "กำลัง Sync"
              : livePortalSync
                ? "Sync Portal"
                : "เชื่อม Portal"}
          </button>
          <button type="button" disabled>
            <Upload size={18} />
            อัปโหลดไฟล์
          </button>
        </div>
        <label className="payload-input-label">
          วางข้อมูลหรือ link ที่ได้รับ
          <textarea
            value={payload}
            onChange={(event) => onPayload(event.target.value)}
            placeholder="วางลิงก์สุขภาพ ลิงก์รับเอกสาร หรือข้อมูลเอกสารที่ได้รับมา"
          />
        </label>
        <Button
          disabled={!payload.trim() || !detection.canImport}
          onClick={onImport}
        >
          <ClipboardPaste size={18} />
          นำเข้า Wallet
        </Button>
      </div>
      <ImportDetectionPanel detection={detection} />
    </section>
  );
}
