'use client';

import { AlertTriangle, ShieldCheck } from 'lucide-react';
import Header from '@/components/Header';
import Sandbox from '@/components/Sandbox';
import { useI18n } from '@/components/LocaleProvider';
import { BRAND } from '@/lib/brand';
import {
  INTERCOM_APP_ID,
  INTERCOM_APP_ID_STATUS,
  INTERCOM_CONFIGURED,
  INTERCOM_REGION,
  INTERCOM_REGION_VALID,
} from '@/lib/intercom';

export default function Home() {
  const { t } = useI18n();

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[880px] -translate-x-1/2 rounded-full bg-brand-100/60 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Header />

        <section className="py-14 sm:py-20">
          {INTERCOM_CONFIGURED && (
            <p className="mb-4 inline-flex flex-wrap items-center gap-2 text-sm font-medium text-brand-600">
              <ShieldCheck size={16} /> {t.hero.eyebrow} · app_id <code className="font-mono">{INTERCOM_APP_ID}</code> ·{' '}
              {t.hero.region} <code className="font-mono">{INTERCOM_REGION}</code>
            </p>
          )}
          <h1 className="max-w-3xl font-display text-5xl leading-[1.05] tracking-tight sm:text-7xl">
            {t.hero.titleBefore} <em className="text-brand-600">{t.hero.titleEmphasis}</em>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-dim">{t.hero.subtitle}</p>
        </section>

        {!INTERCOM_REGION_VALID && (
          <Notice title={t.config.regionWarning(process.env.NEXT_PUBLIC_INTERCOM_REGION ?? '')} />
        )}

        {INTERCOM_CONFIGURED ? (
          <Sandbox />
        ) : (
          <Notice
            title={INTERCOM_APP_ID_STATUS === 'invalid' ? t.config.invalidTitle : t.config.missingTitle}
            body={t.config.body}
          />
        )}

        <footer className="mt-16 border-t border-line pt-6 text-sm text-ink-dim">{t.footer(BRAND.name)}</footer>
      </div>
    </main>
  );
}

function Notice({ title, body }: { title: string; body?: string }) {
  return (
    <div role="alert" className="mb-6 flex gap-3 rounded-2xl border border-pulse/40 bg-white p-5 shadow-card">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-pulse" />
      <div>
        <p className="font-medium">{title}</p>
        {body && <p className="mt-1 text-sm text-ink-dim">{body}</p>}
      </div>
    </div>
  );
}
