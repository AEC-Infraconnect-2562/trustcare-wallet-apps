import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translate, type Language } from "./index";

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: "th",
  setLang: () => undefined,
  t: (key) => key,
});

const storageKey = "trustcare_language:v1";
const legacyStorageKey = "trustcare_language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(readStoredLanguage);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    writeStoredLanguage(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t: (key: string) => translate(lang, key) }),
    [lang, setLang],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

function readStoredLanguage(): Language {
  const stored =
    readStorageText(storageKey) ?? readStorageText(legacyStorageKey);
  return stored === "en" || stored === "th" ? stored : "th";
}

function writeStoredLanguage(next: Language) {
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    // Storage can be unavailable in privacy modes; language still updates in memory.
  }
}

function readStorageText(key: string) {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
