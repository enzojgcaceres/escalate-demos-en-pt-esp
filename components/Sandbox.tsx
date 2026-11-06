'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BellDot,
  Eye,
  EyeOff,
  Globe,
  Inbox,
  LogOut,
  MessageSquarePlus,
  Send,
  Tag,
  Trash2,
  UserRound,
  Zap,
} from 'lucide-react';
import { useI18n } from '@/components/LocaleProvider';
import { LOCALES, type Dict } from '@/lib/i18n';
import { INTERCOM_APP_ID, ic, reboot } from '@/lib/intercom';

// Cada entrada guarda el instante y una función que produce el texto: así el log entero
// (textos y formato de hora) se vuelve a mostrar en el idioma actual cuando cambia.
type Kind = keyof Dict['log']['kinds'];
type Text = string | ((t: Dict) => string);
type LogEntry = { id: number; at: Date; kind: Kind; text: Text };

const SPACES = ['home', 'messages', 'help', 'news', 'tasks'] as const;

/** Valores del selector de idioma del Messenger. '' = sin language_override (lo decide el navegador). */
const FOLLOW_PAGE = 'page';
const MESSENGER_LANGUAGES = [FOLLOW_PAGE, '', ...LOCALES] as const;

type Defaults = Dict['defaults'];

let seq = 0;

export default function Sandbox() {
  const { locale, t } = useI18n();

  const [log, setLog] = useState<LogEntry[]>([]);
  const [booted, setBooted] = useState(false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [identity, setIdentity] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [language, setLanguage] = useState<string>('');
  const [message, setMessage] = useState(t.defaults.message);
  const [attrKey, setAttrKey] = useState(t.defaults.attrKey);
  const [attrValue, setAttrValue] = useState(t.defaults.attrValue);
  const [eventName, setEventName] = useState(t.defaults.eventName);

  /** Identidad activa (name / email / user_id) para conservarla al reiniciar por cambio de idioma. */
  const identityRef = useRef<Record<string, unknown>>({});

  const push = useCallback((kind: Kind, text: Text) => {
    setLog((l) => [{ id: ++seq, at: new Date(), kind, text }, ...l].slice(0, 80));
  }, []);

  const run = (label: Text, fn: () => boolean | void) => {
    const ok = fn();
    if (ok === false) push('error', (tt) => tt.log.notLoaded(typeof label === 'string' ? label : label(tt)));
    else push('action', label);
    return ok !== false;
  };

  // Valores precargados: al cambiar de idioma se reemplazan los que el usuario no editó.
  const prevDefaults = useRef<Defaults>(t.defaults);
  useEffect(() => {
    const prev = prevDefaults.current;
    const next = t.defaults;
    if (prev === next) return;
    const swap = (set: (fn: (v: string) => string) => void, k: keyof Defaults) =>
      set((v) => (v === prev[k] ? next[k] : v));
    swap(setMessage, 'message');
    swap(setAttrKey, 'attrKey');
    swap(setAttrValue, 'attrValue');
    swap(setEventName, 'eventName');
    prevDefaults.current = next;
  }, [t]);

  // Callbacks del Messenger: el stub los encola aunque el widget no haya terminado de cargar.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!window.Intercom) return;
      clearInterval(timer);
      ic('onShow', () => { setOpen(true); push('event', (tt) => tt.log.onShow); });
      ic('onHide', () => { setOpen(false); push('event', (tt) => tt.log.onHide); });
      ic('onUnreadCountChange', (n: number) => { setUnread(n); push('event', (tt) => tt.log.onUnread(n)); });
      ic('onUserEmailSupplied', () => push('event', (tt) => tt.log.onEmail));
    }, 200);
    return () => clearInterval(timer);
  }, [push]);

  // `booted` lo setea el widget real cuando termina de iniciar.
  useEffect(() => {
    const timer = setInterval(() => {
      if (window.Intercom?.booted) {
        setBooted(true);
        push('event', (tt) => tt.log.booted(INTERCOM_APP_ID));
        clearInterval(timer);
      }
    }, 400);
    return () => clearInterval(timer);
  }, [push]);

  // "Seguir el idioma de la página": al elegirlo, y cada vez que cambia el idioma de la página
  // mientras está elegido, reinicia el Messenger con ese idioma conservando la identidad.
  useEffect(() => {
    if (language !== FOLLOW_PAGE) return;
    run((tt) => tt.log.rebootedLanguage(locale), () => reboot({ ...identityRef.current, language_override: locale }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, locale]);

  const languageOverride = () => {
    if (language === FOLLOW_PAGE) return { language_override: locale };
    return language ? { language_override: language } : {};
  };

  const identify = () => {
    if (!email && !userId) return push('error', (tt) => tt.log.needIdentifier);
    const who: Record<string, unknown> = {};
    if (name) who.name = name;
    if (email) who.email = email;
    if (userId) who.user_id = userId;
    const id = email || userId;
    if (run((tt) => tt.log.rebootedUser(id), () => reboot({ ...who, ...languageOverride() }))) {
      identityRef.current = who;
      setIdentity(id);
    }
  };

  const asVisitor = () => {
    if (run((tt) => tt.log.rebootedVisitor, () => reboot(languageOverride()))) {
      identityRef.current = {};
      setIdentity(null);
    }
  };

  const sendAttribute = () => {
    if (!attrKey.trim()) return push('error', (tt) => tt.log.needAttrKey);
    run(`update({ ${attrKey}: "${attrValue}" })`, () => ic('update', { [attrKey]: attrValue }));
  };

  const fireEvent = () => {
    if (!eventName.trim()) return push('error', (tt) => tt.log.needEventName);
    run(`trackEvent("${eventName}")`, () => ic('trackEvent', eventName));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {/* Estado */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<Activity size={16} />} label={t.stats.widget} value={booted ? t.stats.loaded : t.stats.loading} live={booted} />
          <Stat icon={open ? <Eye size={16} /> : <EyeOff size={16} />} label={t.stats.messenger} value={open ? t.stats.open : t.stats.closed} live={open} />
          <Stat icon={<BellDot size={16} />} label={t.stats.unread} value={String(unread)} live={unread > 0} />
          <Stat icon={<UserRound size={16} />} label={t.stats.identity} value={identity ?? t.stats.visitor} live={!!identity} />
        </div>

        {/* Abrir / mensajes */}
        <Card title={t.messenger.title} icon={<Inbox size={18} />} hint={t.messenger.hint}>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => run('show', () => ic('show'))}>
              <Eye size={16} /> {t.messenger.open}
            </button>
            <button className="btn-ghost" onClick={() => run('hide', () => ic('hide'))}>
              <EyeOff size={16} /> {t.messenger.close}
            </button>
            {SPACES.map((s) => (
              <button key={s} className="btn-ghost" onClick={() => run(`showSpace("${s}")`, () => ic('showSpace', s))}>
                {t.messenger.spaces[s]}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input className="field" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.messenger.messagePlaceholder} />
            <button className="btn-primary shrink-0" onClick={() => run(`showNewMessage("${message}")`, () => ic('showNewMessage', message))}>
              <MessageSquarePlus size={16} /> {t.messenger.newConversation}
            </button>
          </div>
        </Card>

        {/* Identidad */}
        <Card title={t.identity.title} icon={<UserRound size={18} />} hint={t.identity.hint}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.identity.name}><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.identity.namePlaceholder} /></Field>
            <Field label={t.identity.email}><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.identity.emailPlaceholder} /></Field>
            <Field label={t.identity.userId}><input className="field" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={t.identity.userIdPlaceholder} /></Field>
            <Field label={t.identity.language} help={t.identity.languageHint}>
              <div className="relative">
                <Globe size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
                <select className="field pl-8" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {MESSENGER_LANGUAGES.map((v) => (
                    <option key={v || 'auto'} value={v}>
                      {v === FOLLOW_PAGE ? t.identity.languages.follow : v === '' ? t.identity.languages.auto : t.identity.languages[v]}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={identify}><UserRound size={16} /> {t.identity.signIn}</button>
            <button className="btn-ghost" onClick={asVisitor}><LogOut size={16} /> {t.identity.asVisitor}</button>
          </div>
        </Card>

        {/* Atributos y eventos */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card title={t.attribute.title} icon={<Tag size={18} />} hint={t.attribute.hint}>
            <div className="flex gap-2">
              <input className="field" value={attrKey} onChange={(e) => setAttrKey(e.target.value)} placeholder={t.attribute.keyPlaceholder} />
              <input className="field" value={attrValue} onChange={(e) => setAttrValue(e.target.value)} placeholder={t.attribute.valuePlaceholder} />
            </div>
            <button className="btn-ghost mt-3 w-full" onClick={sendAttribute}>
              <Send size={16} /> {t.attribute.send}
            </button>
          </Card>
          <Card title={t.event.title} icon={<Zap size={18} />} hint={t.event.hint}>
            <input className="field" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder={t.event.placeholder} />
            <button className="btn-ghost mt-3 w-full" onClick={fireEvent}>
              <Zap size={16} /> {t.event.fire}
            </button>
          </Card>
        </div>
      </div>

      {/* Log */}
      <aside className="flex h-[640px] flex-col overflow-hidden rounded-2xl border border-line bg-ink text-white shadow-card lg:sticky lg:top-6">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-pulse" />
            </span>
            {t.log.title}
          </div>
          <button className="text-white/50 transition hover:text-white" onClick={() => setLog([])} aria-label={t.log.clear} title={t.log.clear}>
            <Trash2 size={15} />
          </button>
        </div>
        <ul className="flex-1 space-y-1.5 overflow-y-auto p-3 font-mono text-[12px]">
          {log.length === 0 && <li className="px-1 py-2 text-white/40">{t.log.empty}</li>}
          <AnimatePresence initial={false}>
            {log.map((e) => (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-md bg-white/[0.04] px-2.5 py-1.5"
              >
                <span className="text-white/40">{e.at.toLocaleTimeString(locale, { hour12: false })}</span>{' '}
                <span className={e.kind === 'event' ? 'text-brand-400' : e.kind === 'error' ? 'text-pulse' : 'text-sky-300'}>
                  {t.log.kinds[e.kind]}
                </span>{' '}
                <span className="text-white/85">{typeof e.text === 'string' ? e.text : e.text(t)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </aside>
    </div>
  );
}

function Card({ title, icon, hint, children }: { title: string; icon: React.ReactNode; hint: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-line bg-white p-5 shadow-card"
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-sm text-ink-dim">{hint}</p>
        </div>
      </div>
      {children}
    </motion.section>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-dim">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs text-ink-dim">{help}</span>}
    </label>
  );
}

function Stat({ icon, label, value, live }: { icon: React.ReactNode; label: string; value: string; live: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3.5 shadow-card">
      <div className="flex items-center justify-between text-ink-dim">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">{icon}{label}</span>
        <span className={`h-2 w-2 rounded-full transition ${live ? 'bg-brand-400 shadow-[0_0_0_4px] shadow-brand-100' : 'bg-line'}`} />
      </div>
      <div className="mt-2 truncate text-lg font-medium">{value}</div>
    </div>
  );
}
