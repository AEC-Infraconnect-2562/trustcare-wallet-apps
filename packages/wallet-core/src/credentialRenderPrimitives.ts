import type { CredentialRenderField, CredentialRenderItem } from "./credentialRendererTypes";

export function firstRecord(
  ...values: Array<Record<string, unknown> | undefined>
): CredentialRenderItem {
  return values.find((value) => value && Object.keys(value).length) ?? {};
}

export function getRecord(source: unknown): CredentialRenderItem {
  return source && typeof source === "object" && !Array.isArray(source)
    ? (source as CredentialRenderItem)
    : {};
}

export function getObject(
  source: unknown,
  key: string,
): CredentialRenderItem | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source))
    return undefined;
  const value = (source as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as CredentialRenderItem)
    : undefined;
}

export function getText(source: unknown, key?: string): string | undefined {
  const value = key ? getNested(source, [key]) : source;
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return undefined;
}

export function getNested(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

export function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = getText(value);
    if (text && text !== "-") return text;
  }
  return undefined;
}

export function displayName(value: unknown): string | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return firstText(
    getText(value, "nameTh"),
    getText(value, "nameEn"),
    getText(value, "name"),
    getText(value, "display"),
    getText(value, "text"),
    getText(value, "reference"),
    getText(value, "value"),
    getText(value, "organization"),
    getText(value, "hospitalNameTh"),
  );
}

export function firstNonEmptyItems(...values: unknown[]): CredentialRenderItem[] {
  for (const value of values) {
    const items = itemsFromUnknown(value);
    if (items.length > 0) return items;
  }
  return [];
}

export function itemsFromUnknown(value: unknown): CredentialRenderItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item))
      return item as CredentialRenderItem;
    const formatted = formatValue(item);
    return {
      label: formatted,
      display: formatted,
      name: formatted,
      substance: formatted,
    };
  });
}

export function benefitItems(
  benefits: CredentialRenderItem,
  coverage: CredentialRenderItem,
): CredentialRenderItem[] {
  const currency =
    getText(benefits, "annualLimitCurrency") ??
    getText(coverage, "currency") ??
    "THB";
  const items: CredentialRenderItem[] = [
    {
      benefit: "Annual coverage limit",
      limit: formatMoney(getNested(benefits, ["annualLimit"]), currency),
      remaining: formatMoney(getNested(benefits, ["remainingLimit"]), currency),
    },
    {
      benefit: "OPD",
      limit: formatValue(getNested(benefits, ["opd"])),
      remaining: "-",
    },
    {
      benefit: "IPD",
      limit: formatValue(getNested(benefits, ["ipd"])),
      remaining: "-",
    },
    {
      benefit: "Direct Billing",
      limit:
        getNested(benefits, ["directBilling"]) === true
          ? "supported"
          : "not supported",
      remaining: "-",
    },
    { benefit: "Copay", limit: getText(coverage, "copay"), remaining: "-" },
    {
      benefit: "Pre-authorization",
      limit:
        getNested(coverage, ["preAuthorizationRequired"]) === true
          ? "required"
          : "not required",
      remaining: "-",
    },
  ];
  return items.filter((item) => hasValue(item.limit) && item.limit !== "-");
}

export function isFieldWithValue(value: CredentialRenderField): boolean {
  if (Array.isArray(value.value)) return value.value.length > 0;
  if (
    value.value &&
    typeof value.value === "object" &&
    !Array.isArray(value.value) &&
    Object.keys(value.value as Record<string, unknown>).length === 0
  )
    return false;
  return (
    value.value !== undefined &&
    value.value !== null &&
    value.value !== "" &&
    value.value !== "-"
  );
}

export function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function getStringArray(source: unknown, key: string): string[] {
  const value = getNested(source, [key]);
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").map(String)
    : [];
}

export function booleanLabel(
  value: unknown,
  labels: { yes: string; no: string },
): string | undefined {
  if (value === true) return labels.yes;
  if (value === false) return labels.no;
  return getText(value);
}

export function joinDateTime(date?: string, time?: string): string | undefined {
  if (!date && !time) return undefined;
  return [date, time].filter(Boolean).join(" ");
}

export function formatDate(value: unknown): string {
  if (!hasValue(value)) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("th-TH");
}

export function formatDateTime(value: unknown): string {
  if (!hasValue(value)) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("th-TH");
}

export function formatMoney(amount: unknown, currency: unknown): string {
  const numeric = Number(amount);
  if (Number.isFinite(numeric))
    return `${numeric.toLocaleString("th-TH")} ${String(currency ?? "THB")}`;
  return formatValue(amount);
}

export function formatPeriod(period?: CredentialRenderItem): string {
  if (!period) return "-";
  const start = formatDate(getText(period, "start"));
  const end = formatDate(getText(period, "end"));
  return [start, end].filter((value) => value !== "-").join(" - ") || "-";
}

export function formatValue(value: unknown): string {
  if (!hasValue(value)) return "-";
  if (Array.isArray(value))
    return value.map((item) => formatValue(item)).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => hasValue(entry))
      .map(([key, entry]) => `${key}: ${formatValue(entry)}`)
      .join(" · ");
  }
  return String(value);
}
