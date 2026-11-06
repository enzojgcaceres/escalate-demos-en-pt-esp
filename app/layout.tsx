import type { Metadata } from 'next';
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import IntercomScript from '@/components/IntercomScript';
import { LocaleProvider } from '@/components/LocaleProvider';
import { BRAND } from '@/lib/brand';
import { DEFAULT_LOCALE, dictionaries } from '@/lib/i18n';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' });
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-display' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

// Metadata inicial en el idioma por defecto; LocaleProvider la actualiza al cambiar de idioma.
const t = dictionaries[DEFAULT_LOCALE];

export const metadata: Metadata = {
  title: t.meta.title(BRAND.name),
  description: t.meta.description,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE} className={`${inter.variable} ${serif.variable} ${mono.variable}`}>
      <body className="font-sans">
        <LocaleProvider>{children}</LocaleProvider>
        <IntercomScript />
      </body>
    </html>
  );
}
