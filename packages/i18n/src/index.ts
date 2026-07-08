import { en } from "./en";
import { th } from "./th";

export type Language = "th" | "en";
export type TranslationKey = keyof typeof th | keyof typeof en;

export const dictionaries = { th, en } as const;

export function translate(lang: Language, key: string): string {
  return (dictionaries[lang] as Record<string, string>)[key] ?? key;
}

export * from "./en";
export * from "./th";
