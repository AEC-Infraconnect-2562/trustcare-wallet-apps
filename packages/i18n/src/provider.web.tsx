import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type Language } from "./index";

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: "th",
  setLang: () => undefined,
  t: key => key
});

const storageKey = "trustcare_language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof localStorage === "undefined") return "th";
    const stored = localStorage.getItem(storageKey);
    return stored === "en" || stored === "th" ? stored : "th";
  });

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    localStorage.setItem(storageKey, next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t: (key: string) => translate(lang, key) }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

