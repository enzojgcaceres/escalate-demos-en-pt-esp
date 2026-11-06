// Configuración del Messenger. Todo sale de variables de entorno: no hay app_id por defecto.
// Las NEXT_PUBLIC_* se inyectan en el build: si cambian en Vercel, hay que redeployar.

const REGIONS = {
  us: 'https://api-iam.intercom.io',
  eu: 'https://api-iam.eu.intercom.io',
  au: 'https://api-iam.au.intercom.io',
} as const;

export type IntercomRegion = keyof typeof REGIONS;

const rawRegion = (process.env.NEXT_PUBLIC_INTERCOM_REGION || 'us').trim().toLowerCase();
export const INTERCOM_REGION_VALID = rawRegion in REGIONS;
export const INTERCOM_REGION: IntercomRegion = INTERCOM_REGION_VALID ? (rawRegion as IntercomRegion) : 'us';
export const INTERCOM_API_BASE = REGIONS[INTERCOM_REGION];

const rawAppId = (process.env.NEXT_PUBLIC_INTERCOM_APP_ID || '').trim();
/** 'missing' si no está definida, 'invalid' si tiene caracteres que no corresponden a un app_id. */
export const INTERCOM_APP_ID_STATUS: 'ok' | 'missing' | 'invalid' = !rawAppId
  ? 'missing'
  : /^[a-z0-9]+$/i.test(rawAppId)
    ? 'ok'
    : 'invalid';
export const INTERCOM_APP_ID = INTERCOM_APP_ID_STATUS === 'ok' ? rawAppId : '';
export const INTERCOM_CONFIGURED = INTERCOM_APP_ID_STATUS === 'ok';

type IntercomFn = ((command: string, ...args: unknown[]) => void) & { booted?: boolean };

declare global {
  interface Window {
    Intercom?: IntercomFn;
    intercomSettings?: Record<string, unknown>;
  }
}

export function ic(command: string, ...args: unknown[]) {
  if (typeof window === 'undefined' || !window.Intercom) return false;
  window.Intercom(command, ...args);
  return true;
}

/** Reinicia el Messenger con una identidad nueva (o como visitante si no se pasa ninguna). */
export function reboot(settings: Record<string, unknown> = {}) {
  if (!ic('shutdown')) return false;
  const next = { api_base: INTERCOM_API_BASE, app_id: INTERCOM_APP_ID, ...settings };
  window.intercomSettings = next;
  ic('boot', next);
  return true;
}
