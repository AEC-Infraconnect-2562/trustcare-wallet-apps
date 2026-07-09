type StorageValidator = (value: unknown) => boolean;

type StorageOptions<T> = {
  fallback: T;
  legacyKeys?: string[];
  validate?: StorageValidator;
};

export function readJsonStorage<T>(key: string, options: StorageOptions<T>): T {
  const raw = readStorageText(key, options.legacyKeys);
  if (!raw) return options.fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (options.validate && !options.validate(parsed)) return options.fallback;
    return parsed as T;
  } catch {
    return options.fallback;
  }
}

export function writeJsonStorage<T>(key: string, value: T) {
  writeStorageText(key, JSON.stringify(value));
}

export function readStringStorage(
  key: string,
  legacyKeys: string[] = [],
): string | null {
  return readStorageText(key, legacyKeys);
}

export function writeStringStorage(key: string, value: string) {
  writeStorageText(key, value);
}

export function removeStorageValue(key: string, legacyKeys: string[] = []) {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
    for (const legacyKey of legacyKeys) storage.removeItem(legacyKey);
  } catch {
    // Storage can be blocked or unavailable in privacy modes.
  }
}

export function isRecordOfArrays(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(Array.isArray);
}

function readStorageText(key: string, legacyKeys: string[] = []) {
  const storage = browserStorage();
  if (!storage) return null;
  for (const candidate of [key, ...legacyKeys]) {
    try {
      const value = storage.getItem(candidate);
      if (value !== null) return value;
    } catch {
      return null;
    }
  }
  return null;
}

function writeStorageText(key: string, value: string) {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Quota exceeded or disabled storage should not break core wallet UI.
  }
}

function browserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
