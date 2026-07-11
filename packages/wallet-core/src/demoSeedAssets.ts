import walletExchangeConfig from "../../../config/wallet-exchange-v2.json";

/**
 * Synthetic Wallet demo fixtures.
 *
 * These issuer identifiers are deliberately outside the live TrustCare Portal
 * DID namespace. Locally generated demo credentials must never impersonate a
 * hospital issuer whose private keys are owned by Portal/KMS.
 */
export const NON_AUTHORITATIVE_DEMO_ISSUER_DIDS = {
  tcc: "did:web:wallet-demo.invalid:issuer:tcc",
  tcp: "did:web:wallet-demo.invalid:issuer:tcp",
  tcm: "did:web:wallet-demo.invalid:issuer:tcm",
} as const;

/** Public sandbox assets only; this is not an authentication or API fallback. */
export const TRUSTCARE_PORTAL_ASSET_ORIGIN = walletExchangeConfig.portalBaseUrl;

function portalStorageAsset(path: string): string {
  const normalized = path.replace(/^\/?manus-storage\//, "");
  return `${TRUSTCARE_PORTAL_ASSET_ORIGIN}/manus-storage/${normalized}`;
}

export const trustCarePortalPersonImages = {
  demoPatient001: portalStorageAsset("patient_somsak_a2e00e97.jpg"),
  demoPatient002: portalStorageAsset("patient_malee_74d2ef04.jpg"),
  demoPatient003: portalStorageAsset("patient_john_williams_b4e9e7f3.jpg"),
  demoHospadmin001: portalStorageAsset("hospadmin_wipa_aeeee791.jpg"),
  sysadmin: portalStorageAsset("sysadmin_somchai_7aa02209.jpg"),
  doctorMale: portalStorageAsset("doctor_thanawat_f91f7278.jpg"),
  doctorFemale: portalStorageAsset("doctor_napa_abd67502.jpg"),
  nurseFemale: portalStorageAsset("nurse_pimjai_ace1fd06.jpg"),
  nurseMale: portalStorageAsset("nurse_anucha_e814499a.jpg"),
  pharmacistMale: portalStorageAsset("engineer_piya_eb6aeff4.jpg"),
  radiologist: portalStorageAsset("doctor_kriangkrai_b6bcdefb.jpg"),
  medTech: portalStorageAsset("doctor_prasit_2ed84c26.jpg"),
  patientMale: portalStorageAsset("patient_somsak_a2e00e97.jpg"),
  patientFemale: portalStorageAsset("patient_malee_74d2ef04.jpg"),
} as const;
