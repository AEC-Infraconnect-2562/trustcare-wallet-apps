import { normalizeDocumentType } from "./canonicalDocuments";
import type { CredentialPhysicalFormFactor } from "./credentialRendererTypes";

const identityCardDocumentTypes = new Set([
  "patient_identity",
  "staff_identity",
  "student_identity",
]);

const identityCardLayouts = new Set([
  "photo_identity_card",
  "staff_badge",
  "student_identity_card",
]);

export function credentialPhysicalFormFactor(
  documentType: string,
  declaredLayout?: string,
): CredentialPhysicalFormFactor {
  const normalizedType = normalizeDocumentType(documentType) ?? documentType;
  const normalizedLayout = declaredLayout?.trim().toLowerCase();
  const isCanonicalIdentityCard = identityCardDocumentTypes.has(normalizedType);
  const isAllowedIdentityLayout =
    isCanonicalIdentityCard &&
    Boolean(normalizedLayout && identityCardLayouts.has(normalizedLayout));

  if (isCanonicalIdentityCard || isAllowedIdentityLayout) {
    return {
      kind: "iso_id_1",
      widthMm: 85.6,
      heightMm: 53.98,
      orientation: "landscape",
    };
  }

  return {
    kind: "a4_portrait",
    widthMm: 210,
    heightMm: 297,
    orientation: "portrait",
  };
}
