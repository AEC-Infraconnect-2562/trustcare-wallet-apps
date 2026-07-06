export const TRUSTCARE_PORTAL_WEB_ORIGIN = "https://trustcarehealth.live";
export const TRUSTCARE_PORTAL_JWKS_URL = `${TRUSTCARE_PORTAL_WEB_ORIGIN}/.well-known/jwks.json`;
export const TRUSTCARE_PORTAL_SYNCED_AT = "2026-07-06T16:55:00.000Z";

function storageProxy(path: string): string {
  const normalized = path.replace(/^\/?manus-storage\//, "");
  return `${TRUSTCARE_PORTAL_WEB_ORIGIN}/api/storage-proxy/${normalized}`;
}

export const trustCarePortalPersonImages = {
  demoPatient001: storageProxy("patient_somsak_a2e00e97.jpg"),
  demoPatient002: storageProxy("patient_malee_74d2ef04.jpg"),
  demoPatient003: storageProxy("patient_john_williams_b4e9e7f3.jpg"),
  demoHospadmin001: storageProxy("hospadmin_wipa_aeeee791.jpg"),
  sysadmin: storageProxy("sysadmin_somchai_7aa02209.jpg"),
  doctorMale: storageProxy("doctor_thanawat_f91f7278.jpg"),
  doctorFemale: storageProxy("doctor_napa_abd67502.jpg"),
  nurseFemale: storageProxy("nurse_pimjai_ace1fd06.jpg"),
  nurseMale: storageProxy("nurse_anucha_e814499a.jpg"),
  pharmacistMale: storageProxy("engineer_piya_eb6aeff4.jpg"),
  radiologist: storageProxy("doctor_kriangkrai_b6bcdefb.jpg"),
  medTech: storageProxy("doctor_prasit_2ed84c26.jpg"),
  patientMale: storageProxy("patient_somsak_a2e00e97.jpg"),
  patientFemale: storageProxy("patient_malee_74d2ef04.jpg")
} as const;

export type PortalSyncedUser = {
  openId: string;
  portalUserId: number;
  name: string;
  email: string;
  systemRole: "patient" | "hospital_admin" | string;
  hospitalId: number;
  avatarStoragePath: string;
  avatarUrl: string;
  updatedAt: string;
};

export const portalSyncedUsers: Record<string, PortalSyncedUser> = {
  "demo-patient-001": {
    openId: "demo-patient-001",
    portalUserId: 414,
    name: "นายสมชาย ใจดี",
    email: "somsak@gmail.com",
    systemRole: "patient",
    hospitalId: 4,
    avatarStoragePath: "/manus-storage/patient_somsak_a2e00e97.jpg",
    avatarUrl: trustCarePortalPersonImages.demoPatient001,
    updatedAt: "2026-07-06T09:23:34.000Z"
  },
  "demo-patient-002": {
    openId: "demo-patient-002",
    portalUserId: 415,
    name: "นางสาวมาลี วัฒนา",
    email: "napa@gmail.com",
    systemRole: "patient",
    hospitalId: 8,
    avatarStoragePath: "/manus-storage/patient_malee_74d2ef04.jpg",
    avatarUrl: trustCarePortalPersonImages.demoPatient002,
    updatedAt: "2026-07-06T07:54:03.000Z"
  },
  "demo-patient-003": {
    openId: "demo-patient-003",
    portalUserId: 416,
    name: "Mr. John Williams",
    email: "wichai@gmail.com",
    systemRole: "patient",
    hospitalId: 8,
    avatarStoragePath: "/manus-storage/patient_john_williams_b4e9e7f3.jpg",
    avatarUrl: trustCarePortalPersonImages.demoPatient003,
    updatedAt: "2026-07-06T09:48:28.000Z"
  },
  "demo-hospadmin-001": {
    openId: "demo-hospadmin-001",
    portalUserId: 408,
    name: "นางวิภา บริหารเก่ง",
    email: "wipa@trustcare-central.th",
    systemRole: "hospital_admin",
    hospitalId: 4,
    avatarStoragePath: "/manus-storage/hospadmin_wipa_aeeee791.jpg",
    avatarUrl: trustCarePortalPersonImages.demoHospadmin001,
    updatedAt: "2026-07-06T07:52:37.000Z"
  }
};

export type PortalIssuerCode = "TCC" | "TCP" | "TCM";

export const portalIssuerRegistry: Record<PortalIssuerCode, {
  code: PortalIssuerCode;
  nameTh: string;
  nameEn: string;
  did: string;
}> = {
  TCC: {
    code: "TCC",
    nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
    nameEn: "TrustCare Central Hospital",
    did: "did:web:trustcare.network:hospital:tcc"
  },
  TCP: {
    code: "TCP",
    nameTh: "โรงพยาบาลทรัสต์แคร์ ภูเก็ต อินเตอร์เนชันแนล",
    nameEn: "TrustCare Phuket International Hospital",
    did: "did:web:trustcare.network:hospital:tcp"
  },
  TCM: {
    code: "TCM",
    nameTh: "โรงพยาบาลทรัสต์แคร์ เชียงใหม่ ครอสบอร์เดอร์",
    nameEn: "TrustCare Chiang Mai Cross-Border Hospital",
    did: "did:web:trustcare.network:hospital:tcm"
  }
};
