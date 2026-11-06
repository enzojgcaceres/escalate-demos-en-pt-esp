'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BRAND } from '@/lib/brand';
import { DEFAULT_LOCALE, dictionaries, isLocale, type Dict, type Locale } from '@/lib/i18n';

const STORAGE_KEY = 'escalate-demos.locale';

type Ctx = { locale: Locale; t: Dict; setLocale: (l: Locale) => void };

const LocaleContext = createContext<Ctx>({
  locale: DEFAULT_LOCALE,
  t: dictionaries[DEFAULT_LOCALE],
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // El servidor siempre renderiza pt-BR; el idioma guardado se aplica al montar.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isLocale(saved)) setLocaleState(saved);
    } catch {
      // localStorage bloqueado (modo privado, cookies deshabilitadas): se queda en el idioma por defecto.
    }
  }, []);

  // <html lang>, título y descripción siguen al idioma de la página.
  useEffect(() => {
    const t = dictionaries[locale];
    document.documentElement.lang = locale;
    document.title = t.meta.title(BRAND.name);
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // Sin persistencia: el cambio vale para esta visita.
    }
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, t: dictionaries[locale], setLocale }}>{children}</LocaleContext.Provider>
  );
}

export const useI18n = () => useContext(LocaleContext);
