export type SelectableField = {
  path: string;
  label: string;
  valuePreview: string;
  recommended: boolean;
};

const hiddenPathFragments = [
  "proof",
  "signature",
  "sdJwt",
  "jwt",
  "base64",
  "photo",
  "watermark",
];

const nonDisclosableSubjectKeys = new Set([
  "id",
  "documentreference",
  "humandocument",
  "source",
  "sourcesystem",
  "sourcetype",
  "sourcehash",
  "sourcebundlehash",
  "rawsource",
  "metadata",
  "provenance",
  "audit",
  "display",
  "renderer",
  "rendererversion",
  "trustcare",
  "vcbinding",
  "accessbinding",
  "objectlinks",
]);

function preview(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string")
    return value.length > 42 ? `${value.slice(0, 42)}...` : value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return `${value.length} รายการ`;
  return "object";
}

export function extractSelectableFields(
  data: Record<string, unknown> | null | undefined,
  prefix = "",
): SelectableField[] {
  if (!data) return [];
  if (!prefix) {
    const recommendedFields = extractRecommendedFieldPaths(data);
    if (recommendedFields.length) {
      const allowlistedFields = uniqueFields(
        recommendedFields.flatMap((path) =>
          extractAllowlistedField(data, path),
        ),
      );
      if (allowlistedFields.length) return allowlistedFields;
    }
  }
  if (!prefix && isRecord(data.credentialSubject)) {
    return extractSubjectFields(data.credentialSubject, "credentialSubject");
  }
  return extractSubjectFields(data, prefix);
}

function extractSubjectFields(
  data: Record<string, unknown>,
  prefix = "",
): SelectableField[] {
  const fields: SelectableField[] = [];
  for (const [key, value] of Object.entries(data)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (shouldSkipField(path, key)) continue;
    if (
      hiddenPathFragments.some((fragment) =>
        path.toLowerCase().includes(fragment.toLowerCase()),
      )
    )
      continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      fields.push(
        ...extractSubjectFields(value as Record<string, unknown>, path),
      );
      continue;
    }
    fields.push({
      path,
      label: labelForPath(path),
      valuePreview: preview(value),
      recommended: isRecommendedPath(path),
    });
  }
  return fields;
}

function extractRecommendedFieldPaths(data: Record<string, unknown>): string[] {
  const trustcare = isRecord(data.trustcare) ? data.trustcare : undefined;
  const recommended = Array.isArray(
    trustcare?.selectiveDisclosureRecommendedFields,
  )
    ? trustcare.selectiveDisclosureRecommendedFields
    : [];
  return recommended.filter((path): path is string => {
    if (typeof path !== "string") return false;
    if (!path.startsWith("credentialSubject.")) return false;
    const key = path.split(".").at(-1) ?? "";
    return (
      !shouldSkipField(path, key) &&
      !hiddenPathFragments.some((fragment) =>
        path.toLowerCase().includes(fragment.toLowerCase()),
      )
    );
  });
}

function extractAllowlistedField(
  root: Record<string, unknown>,
  path: string,
): SelectableField[] {
  const value = valueAtPath(root, path);
  const key = path.split(".").at(-1) ?? "";
  if (value === undefined || shouldSkipField(path, key)) return [];
  if (
    hiddenPathFragments.some((fragment) =>
      path.toLowerCase().includes(fragment.toLowerCase()),
    )
  )
    return [];
  if (isRecord(value)) return extractSubjectFields(value, path);
  return [
    {
      path,
      label: labelForPath(path),
      valuePreview: preview(value),
      recommended: isRecommendedPath(path),
    },
  ];
}

function valueAtPath(root: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, root);
}

function uniqueFields(fields: SelectableField[]): SelectableField[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (seen.has(field.path)) return false;
    seen.add(field.path);
    return true;
  });
}

function labelForPath(path: string): string {
  return path.replace(/credentialSubject\./, "").replace(/\./g, " / ");
}

function isRecommendedPath(path: string): boolean {
  return !["nationalId", "passportNo", "phone", "email"].some((sensitive) =>
    path.toLowerCase().includes(sensitive.toLowerCase()),
  );
}

function shouldSkipField(path: string, key: string): boolean {
  const lowerKey = key.toLowerCase();
  const lowerPath = path.toLowerCase();
  if (nonDisclosableSubjectKeys.has(lowerKey)) return true;
  if (
    lowerKey.startsWith("source") &&
    (lowerKey.endsWith("system") ||
      lowerKey.endsWith("hash") ||
      lowerKey.endsWith("type"))
  )
    return true;
  if (
    lowerPath.includes(".documentreference") ||
    lowerPath.includes(".humandocument")
  )
    return true;
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function requireAtLeastOneField(paths: string[]): string[] {
  const selected = paths.filter(Boolean);
  if (!selected.length) {
    throw new Error("กรุณาเลือกข้อมูลอย่างน้อย 1 รายการ");
  }
  return selected;
}
