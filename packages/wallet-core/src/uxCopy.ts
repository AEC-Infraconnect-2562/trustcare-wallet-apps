import type {
  CanonicalDocumentType,
  SharePackageMode,
} from "./canonicalDocuments";
import type {
  DocumentRequestFormat,
  DocumentRequestReturnChannel,
  DocumentRequestSource,
} from "./documentRequestFlow";

export type TrustUiState =
  | "verified_active_vc"
  | "transport_verified_only"
  | "pending_review"
  | "subject_mismatch"
  | "expired"
  | "revoked"
  | "unknown_format"
  | "trustcare_certified"
  | "trustcare_pending";

export type UxCopy = {
  label: string;
  description: string;
  tone: "green" | "blue" | "yellow" | "red" | "neutral";
};

const trustStateCopy: Record<TrustUiState, UxCopy> = {
  verified_active_vc: {
    label: "ใช้ได้ / ตรวจสอบแล้ว",
    description: "ลายเซ็น ผู้ออกเอกสาร สถานะ และอายุเอกสารผ่านเงื่อนไข",
    tone: "green",
  },
  transport_verified_only: {
    label: "อ่านได้ แต่ยังไม่รับรองโดย TrustCare",
    description:
      "รูปแบบการส่งข้อมูลถูกต้อง แต่ยังไม่มี Manifest VP และ Holder VC สำหรับยืนยันในเครือข่าย TrustCare",
    tone: "blue",
  },
  pending_review: {
    label: "รอตรวจสอบ",
    description: "ต้องให้ระบบต้นทางหรือเจ้าหน้าที่ตรวจเอกสารก่อนนำไปใช้",
    tone: "yellow",
  },
  subject_mismatch: {
    label: "ไม่ใช่ของเจ้าของกระเป๋านี้",
    description:
      "ข้อมูลเจ้าของเอกสารไม่ตรงกับผู้ใช้ที่เข้าสู่ระบบ จึงไม่ควรนำเข้า Wallet นี้",
    tone: "red",
  },
  expired: {
    label: "หมดอายุ",
    description: "เอกสารหรือสิทธิการเปิดอ่านเลยเวลาที่กำหนดแล้ว",
    tone: "red",
  },
  revoked: {
    label: "ถูกเพิกถอน",
    description: "ผู้ออกเอกสารยกเลิกหรือระงับเอกสารนี้แล้ว",
    tone: "red",
  },
  unknown_format: {
    label: "ไม่รู้จักรูปแบบ",
    description: "Wallet ยังอ่าน payload นี้ไม่ได้ ให้ตรวจสอบไฟล์หรือ QR อีกครั้ง",
    tone: "red",
  },
  trustcare_certified: {
    label: "TrustCare รับรองแล้ว",
    description:
      "มี Manifest VP, Holder VC, hash และ policy ที่ตรวจสอบกับ TrustCare ได้",
    tone: "green",
  },
  trustcare_pending: {
    label: "รอ TrustCare รับรอง",
    description:
      "SHL ใช้งานแบบมาตรฐานได้ แต่ยังไม่ได้ผ่าน Maker/Checker เพื่อใช้เป็น Certified SHL",
    tone: "yellow",
  },
};

const sourceCopy: Record<DocumentRequestSource, UxCopy> = {
  trustcare_portal: {
    label: "ขอจาก TrustCare Portal",
    description: "เหมาะกับเอกสารที่ต้องให้โรงพยาบาลหรือ issuer ลงนาม",
    tone: "green",
  },
  connected_fhir: {
    label: "ดึงจาก FHIR/HIS ที่เชื่อมต่อ",
    description: "เหมาะกับประวัติ ผลตรวจ หรือชุดข้อมูลจากระบบรักษาพยาบาล",
    tone: "blue",
  },
  payer: {
    label: "ขอจากผู้จ่ายเงิน/ประกัน",
    description: "เหมาะกับสิทธิรักษา หนังสือรับรอง และเอกสารเคลม",
    tone: "blue",
  },
  patient_upload: {
    label: "นำเข้าเอง",
    description: "เหมาะกับ PDF รูปภาพ หรือไฟล์ JSON ที่ต้องรอตรวจรับรองต่อ",
    tone: "yellow",
  },
  external_wallet: {
    label: "รับจาก Wallet ภายนอก",
    description: "เหมาะกับ VP, SHL หรือ credential offer จาก partner wallet",
    tone: "blue",
  },
};

const formatCopy: Record<DocumentRequestFormat, UxCopy> = {
  vc_vp: {
    label: "เอกสารรับรองหรือ VP",
    description: "เหมาะกับเอกสารเดี่ยวหรือชุดเล็กที่ต้องเปิดเผยเฉพาะข้อมูลจำเป็น",
    tone: "green",
  },
  oid4vci_offer: {
    label: "รับ credential จากผู้ออกเอกสาร",
    description: "เหมาะเมื่อ issuer ส่ง offer เพื่อให้ Wallet รับ VC ที่ลงนามแล้ว",
    tone: "green",
  },
  fhir_document_reference: {
    label: "เอกสาร FHIR เดี่ยว",
    description: "เหมาะกับไฟล์หรือเอกสารเดี่ยวที่มี metadata ทางการแพทย์",
    tone: "blue",
  },
  fhir_bundle: {
    label: "ชุดข้อมูล FHIR",
    description: "เหมาะกับประวัติหรือผลตรวจหลายรายการจาก HIS/EMR/LIS",
    tone: "blue",
  },
  standard_shl: {
    label: "SMART Health Link มาตรฐาน",
    description: "เหมาะกับข้อมูลชุดใหญ่และยังใช้ร่วมกับระบบภายนอกได้",
    tone: "blue",
  },
  certified_shl_manifest: {
    label: "SHL พร้อม TrustCare Manifest",
    description: "เหมาะกับชุดเอกสารที่ต้องตรวจแหล่งที่มาในระบบ TrustCare",
    tone: "green",
  },
  pdf_image: {
    label: "PDF หรือรูปภาพ",
    description: "ใช้เป็นหลักฐานนำเข้า ยังไม่ถือเป็นเอกสารรับรองจนกว่า issuer ลงนาม",
    tone: "yellow",
  },
};

const returnChannelCopy: Record<DocumentRequestReturnChannel, UxCopy> = {
  portal_sync: {
    label: "Sync กลับเข้ากระเป๋า",
    description: "เมื่อ Portal ออกเอกสารแล้ว Wallet จะดึงเข้ามาตามผู้ใช้คนนี้",
    tone: "green",
  },
  oid4vci_offer: {
    label: "รับผ่าน offer QR/link",
    description: "สแกนหรือเปิด offer เพื่อรับ credential จาก issuer",
    tone: "green",
  },
  fhir_pull: {
    label: "ดึงจาก FHIR endpoint",
    description: "ใช้ consent และ scope เพื่อดึงเอกสารจากระบบต้นทาง",
    tone: "blue",
  },
  shl_link: {
    label: "รับเป็น SHL",
    description: "รับลิงก์สุขภาพพร้อม policy การเปิดอ่าน",
    tone: "blue",
  },
  manual_upload: {
    label: "อัปโหลดเอง",
    description: "ผู้ใช้เลือกไฟล์หรือวาง JSON เข้ามาใน Wallet",
    tone: "yellow",
  },
  external_wallet: {
    label: "รับจาก Wallet อื่น",
    description: "นำเข้าจาก partner wallet ที่รองรับมาตรฐานเดียวกัน",
    tone: "blue",
  },
};

const packageCopy: Record<SharePackageMode, UxCopy> = {
  DirectVP: {
    label: "VP เอกสารเดียว",
    description: "เหมาะกับเอกสารสำคัญหนึ่งใบที่ต้องให้ verifier ตรวจทันที",
    tone: "green",
  },
  PurposeVP: {
    label: "VP ตามวัตถุประสงค์",
    description: "เหมาะกับ OPD หรือห้องยาที่ใช้เอกสารไม่มากและต้องเลือกเปิดเผยข้อมูล",
    tone: "green",
  },
  StandardSHL: {
    label: "SHL มาตรฐาน",
    description: "เหมาะกับข้อมูลขนาดใหญ่หรือข้อมูลต่อเนื่อง และยังเข้ากับระบบภายนอก",
    tone: "blue",
  },
  CertifiedSHLManifestPackage: {
    label: "SHL + Manifest VP",
    description: "เหมาะกับการส่งต่อ เคลม หรือข้ามเครือข่ายที่ต้องตรวจ trust layer",
    tone: "green",
  },
};

const documentTypeCopy: Record<CanonicalDocumentType, UxCopy> = {
  patient_identity: {
    label: "ยืนยันตัวตนผู้ป่วย",
    description: "ข้อมูลตัวตนและเลขประจำตัวผู้ป่วย",
    tone: "green",
  },
  staff_identity: {
    label: "ยืนยันตัวตนเจ้าหน้าที่",
    description: "ข้อมูลเจ้าหน้าที่หรือผู้ให้บริการ",
    tone: "green",
  },
  consent_receipt: {
    label: "หลักฐานความยินยอม",
    description: "บันทึกการให้ความยินยอมและขอบเขตการใช้ข้อมูล",
    tone: "blue",
  },
  mpi_link_certificate: {
    label: "ใบเชื่อมโยงตัวตน",
    description: "หลักฐานเชื่อมโยงรหัสผู้ป่วยระหว่างระบบ",
    tone: "blue",
  },
  patient_summary: {
    label: "สรุปสุขภาพ",
    description: "ข้อมูลสุขภาพสำคัญสำหรับการดูแลต่อเนื่อง",
    tone: "green",
  },
  allergy_alert: {
    label: "ข้อมูลแพ้ยา/แพ้อาหาร",
    description: "รายการแพ้ยา แพ้อาหาร หรือข้อควรระวัง",
    tone: "red",
  },
  immunization: {
    label: "ประวัติวัคซีน",
    description: "ข้อมูลการได้รับวัคซีนตามวันเวลา",
    tone: "blue",
  },
  medical_certificate: {
    label: "ใบรับรองแพทย์",
    description: "เอกสารรับรองทางการแพทย์",
    tone: "green",
  },
  medication_summary: {
    label: "รายการยาปัจจุบัน",
    description: "ยาที่ใช้อยู่และคำแนะนำที่เกี่ยวข้อง",
    tone: "blue",
  },
  prescription: {
    label: "ใบสั่งยา",
    description: "รายการยาที่แพทย์สั่งและเงื่อนไขการจ่ายยา",
    tone: "blue",
  },
  pharmacy_dispense: {
    label: "ประวัติจ่ายยา",
    description: "ข้อมูลการจ่ายยาจากห้องยา",
    tone: "blue",
  },
  lab_result: {
    label: "ผลตรวจแล็บ",
    description: "ผลตรวจทางห้องปฏิบัติการ",
    tone: "blue",
  },
  diagnostic_report: {
    label: "รายงานวินิจฉัย",
    description: "ผลอ่านหรือรายงานประกอบการวินิจฉัย",
    tone: "blue",
  },
  referral_vc: {
    label: "ใบส่งต่อ",
    description: "เอกสารส่งต่อผู้ป่วยไปยังหน่วยบริการอื่น",
    tone: "green",
  },
  discharge_summary: {
    label: "สรุปจำหน่าย",
    description: "สรุปการรักษาเมื่อออกจากโรงพยาบาล",
    tone: "blue",
  },
  insurance_eligibility: {
    label: "สิทธิรักษา/ประกัน",
    description: "ข้อมูลสิทธิ ความคุ้มครอง หรือ eligibility",
    tone: "green",
  },
  claim_package: {
    label: "ชุดเอกสารเคลม",
    description: "เอกสารประกอบการเคลมหรือเบิกจ่าย",
    tone: "blue",
  },
  claim_receipt: {
    label: "ใบเสร็จ/หลักฐานค่าใช้จ่าย",
    description: "ข้อมูลค่าใช้จ่ายและหลักฐานการชำระเงิน",
    tone: "blue",
  },
  travel_document_verification: {
    label: "ตรวจเอกสารเดินทาง",
    description: "หลักฐานยืนยันเอกสารเดินทางสำหรับบริการข้ามประเทศ",
    tone: "blue",
  },
  visa_support_letter: {
    label: "หนังสือประกอบวีซ่า",
    description: "เอกสารสนับสนุนการเดินทางเพื่อรักษา",
    tone: "blue",
  },
  quotation: {
    label: "ใบเสนอราคา",
    description: "ประมาณการค่าใช้จ่ายหรือแผนบริการ",
    tone: "blue",
  },
  guarantee_letter: {
    label: "หนังสือรับรองค่าใช้จ่าย",
    description: "หลักฐานรับรองการชำระเงินหรือผู้ค้ำประกัน",
    tone: "blue",
  },
  shl_manifest: {
    label: "รายการกำกับ SHL",
    description: "trust artifact สำหรับชุดข้อมูล SHL",
    tone: "yellow",
  },
  sync_receipt: {
    label: "หลักฐานการซิงก์",
    description: "บันทึกการนำเข้าหรือซิงก์ข้อมูล",
    tone: "yellow",
  },
  appointment: {
    label: "นัดหมาย",
    description: "ข้อมูลวัน เวลา และบริการที่นัดหมาย",
    tone: "blue",
  },
};

export function getTrustStateCopy(state: TrustUiState): UxCopy {
  return trustStateCopy[state];
}

export function getDocumentSourceCopy(source: DocumentRequestSource): UxCopy {
  return sourceCopy[source];
}

export function getDocumentFormatCopy(format: DocumentRequestFormat): UxCopy {
  return formatCopy[format];
}

export function getReturnChannelCopy(channel: DocumentRequestReturnChannel): UxCopy {
  return returnChannelCopy[channel];
}

export function getSharePackageCopy(mode: SharePackageMode): UxCopy {
  return packageCopy[mode];
}

export function getCanonicalDocumentTypeCopy(type: CanonicalDocumentType): UxCopy {
  return documentTypeCopy[type];
}

export function technicalLabel(value: string): string {
  return `รายละเอียดทางเทคนิค: ${value}`;
}
