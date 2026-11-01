import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { getStoredLocale, Locale, LOCALE_STORAGE_KEY, translate, TranslationKey } from './catalog';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getStoredLocale);
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.title = translate(locale, 'title');
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      /* Browsers may disable storage. */
    }
  }, [locale]);
  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: TranslationKey, values?: Record<string, string | number>) =>
        translate(locale, key, values),
    }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale requires LocaleProvider');
  return context;
}
