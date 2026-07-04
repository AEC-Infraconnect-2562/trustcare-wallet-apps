export type SelectableField = {
  path: string;
  label: string;
  valuePreview: string;
  recommended: boolean;
};

const hiddenPathFragments = ["proof", "signature", "sdJwt", "jwt", "base64", "photo"];

function preview(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.length > 42 ? `${value.slice(0, 42)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} รายการ`;
  return "object";
}

export function extractSelectableFields(data: Record<string, unknown> | null | undefined, prefix = ""): SelectableField[] {
  if (!data) return [];
  const fields: SelectableField[] = [];
  for (const [key, value] of Object.entries(data)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (hiddenPathFragments.some(fragment => path.toLowerCase().includes(fragment.toLowerCase()))) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      fields.push(...extractSelectableFields(value as Record<string, unknown>, path));
      continue;
    }
    fields.push({
      path,
      label: path.replace(/credentialSubject\./, "").replace(/\./g, " / "),
      valuePreview: preview(value),
      recommended: !["nationalId", "passportNo", "phone", "email"].some(sensitive => path.toLowerCase().includes(sensitive.toLowerCase()))
    });
  }
  return fields;
}

export function requireAtLeastOneField(paths: string[]): string[] {
  const selected = paths.filter(Boolean);
  if (!selected.length) {
    throw new Error("กรุณาเลือกข้อมูลอย่างน้อย 1 รายการ");
  }
  return selected;
}

