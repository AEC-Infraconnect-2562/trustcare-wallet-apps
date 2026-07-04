import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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

export function NativeLanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>("th");
  const setLanguage = useCallback((next: Language) => setLang(next), []);
  const value = useMemo(() => ({ lang, setLang: setLanguage, t: (key: string) => translate(lang, key) }), [lang, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useNativeLanguage() {
  return useContext(LanguageContext);
}

