'use client';

import { FlaskConical } from 'lucide-react';
import { useI18n } from '@/components/LocaleProvider';
import { BRAND } from '@/lib/brand';
import { LOCALES, dictionaries } from '@/lib/i18n';

/** PROVISORIO: inicial sobre la paleta `brand`. Reemplazar por el logo oficial (por ejemplo un <img> desde /public). */
function BrandMark() {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-card">
      <span className="font-display text-xl leading-none">{BRAND.initial}</span>
    </div>
  );
}

export default function Header() {
  const { locale, t, setLocale } = useI18n();

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 py-6">
      <div className="flex items-center gap-2.5">
        <BrandMark />
        <span className="font-medium tracking-tight">{BRAND.name}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border border-line bg-white/70 px-3 py-1 text-xs font-medium text-ink-dim backdrop-blur sm:inline-flex">
          <FlaskConical size={13} className="text-brand-600" /> {t.header.badge}
        </span>
        <div
          role="group"
          aria-label={t.header.switchLanguage}
          className="inline-flex rounded-full border border-line bg-white/70 p-0.5 text-xs font-medium backdrop-blur"
        >
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={l === locale}
              onClick={() => setLocale(l)}
              className={`rounded-full px-2.5 py-1 transition ${
                l === locale ? 'bg-brand-600 text-white' : 'text-ink-dim hover:text-brand-600'
              }`}
            >
              {dictionaries[l].short}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
