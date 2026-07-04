import type { ShlPackage } from "./models";

export function shlAccessSummary(shl: Pick<ShlPackage, "passcodeRequired" | "expiresAt" | "currentAccessCount" | "maxAccessCount" | "status">): string[] {
  const lines = [
    shl.passcodeRequired ? "ต้องใช้ passcode" : "ไม่ต้องใช้ passcode",
    shl.expiresAt ? `หมดอายุ ${new Date(shl.expiresAt).toLocaleString("th-TH")}` : "ไม่มีวันหมดอายุที่ระบุ",
    `เข้าถึงแล้ว ${shl.currentAccessCount ?? 0}${shl.maxAccessCount ? `/${shl.maxAccessCount}` : ""} ครั้ง`,
    `สถานะ ${shl.status}`
  ];
  return lines;
}

export function isShlActive(shl: Pick<ShlPackage, "status" | "expiresAt">, now = new Date()): boolean {
  if (shl.status !== "active") return false;
  if (!shl.expiresAt) return true;
  return new Date(shl.expiresAt).getTime() > now.getTime();
}

