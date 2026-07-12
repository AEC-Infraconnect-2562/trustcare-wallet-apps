import {
  readinessContextLabels,
  type ReadinessContext,
} from "@trustcare/wallet-core";
import {
  categoryLabels,
  type ScanOutcome,
  type ShareTransport,
} from "./appViewModel";

export function categoryLabel(category?: string): string {
  if (!category) return "-";
  return categoryLabels[category]?.th ?? category;
}

export function transportLabel(transport: ShareTransport): string {
  const labels: Record<ShareTransport, string> = {
    vp_qr: "VP QR",
    shl_recommended: "SHL/VP Bundle",
    shl_manifest: "SHL พร้อม TrustCare Manifest",
  };
  return labels[transport];
}

export function contextLabel(context: ScanOutcome["context"]): string {
  if (context in readinessContextLabels) {
    return readinessContextLabels[context as ReadinessContext].th;
  }
  const labels: Record<string, string> = {
    home: "หน้าแรก",
    documents: "เอกสาร",
    receive: "รับเอกสาร",
    share: "แชร์/ตรวจสอบ",
    prepare: "เตรียมเข้ารับบริการ",
    store: "คลังพกพา",
    history: "ประวัติ",
    settings: "ตั้งค่า",
    qr_scan: "สแกน QR",
  };
  return labels[String(context)] ?? String(context);
}

export function statusLabel(status?: string | null): string {
  const labels: Record<string, string> = {
    active: "ใช้งานได้",
    verified: "ตรวจสอบแล้ว",
    valid: "ถูกต้อง",
    pending: "รอดำเนินการ",
    expired: "หมดอายุ",
    revoked: "ถูกเพิกถอน",
    invalid: "ไม่ถูกต้อง",
    suspended: "ระงับชั่วคราว",
    superseded: "มีเอกสารใหม่แทนแล้ว",
    ready: "พร้อม",
    partial: "บางส่วน",
    imported: "นำเข้าแล้ว",
    recorded: "บันทึกแล้ว",
  };
  return labels[String(status ?? "")] ?? String(status ?? "-");
}
