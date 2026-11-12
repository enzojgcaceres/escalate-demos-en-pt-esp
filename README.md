# Sandbox del Messenger de Intercom — Escalate Ops

Página de pruebas y demos del chat web de Intercom (Messenger + Fin), pensada para el equipo de Brasil. Interfaz en portugués de Brasil (por defecto), español e inglés. Basada en el template que se armó para un cliente, sin datos de ese cliente.

Stack: Next.js 14 (App Router) · TypeScript · Tailwind 3 · next/font · framer-motion · lucide-react · npm. Deploy en Vercel.

## Qué permite probar

| Sección | Qué hace | API de Intercom |
|---|---|---|
| Estado | Widget cargado, Messenger abierto, no leídos, identidad actual | `booted`, `onShow`, `onHide`, `onUnreadCountChange` |
| Messenger | Abrir, cerrar, ir a cada espacio, abrir conversación con texto precargado | `show`, `hide`, `showSpace`, `showNewMessage` |
| Identidad | Reiniciar como usuario (nombre, email, user_id) o como visitante, con idioma del Messenger forzado | `shutdown` + `boot`, `language_override` |
| Atributo | Enviar un atributo personalizado | `update` |
| Evento | Disparar un evento para workflows u outbound | `trackEvent` |
| Log en vivo | Registra cada acción del panel y cada callback del widget | `onUserEmailSupplied` y los de arriba |

### Idioma de la página vs. idioma del Messenger

Son dos cosas separadas:

- **Página**: toggle PT · ES · EN en el header. Se guarda en `localStorage` (si el navegador lo bloquea, funciona igual pero no se recuerda). Cambia todos los textos, `<html lang>`, el título, el formato de hora del log (incluidas las entradas ya registradas) y los valores precargados que no se hayan editado.
- **Messenger**: selector «Idioma del Messenger» en la tarjeta de identidad. Opciones: automático (navegador), pt-BR, es, en, o **seguir el idioma de la página**. Esta última reinicia el Messenger con `language_override` igual al idioma de la página apenas se elige, y de nuevo cada vez que se cambia el idioma de la página, conservando la identidad activa.

## Backend de prueba para Fin (`mock-api/`)

El repo incluye una API simulada del contrato ACME (`mock-api/openapi.json`) para conectarla a Fin como Data connectors y probarla desde este sandbox, entrando con user_id `acme-001`. Va en Render, separada del front; Vercel no la compila. Datos ficticios, escenarios, deploy y cómo conectar Fin: ver [`mock-api/README.md`](mock-api/README.md).

## Variables de entorno

| Variable | Obligatoria | Valores | Qué hace |
|---|---|---|---|
| `NEXT_PUBLIC_INTERCOM_APP_ID` | Sí | p. ej. `alc97xwr` (workspace de demos de Escalate) | app_id del workspace. Se saca de Intercom › Settings › Installation › Web. **No hay valor por defecto**: si falta o no es válido, la página muestra un aviso y no carga el snippet. |
| `NEXT_PUBLIC_INTERCOM_REGION` | No | `us` (defecto), `eu`, `au` | Define el `api_base`: `api-iam.intercom.io`, `api-iam.eu.intercom.io` o `api-iam.au.intercom.io`. Un valor inválido muestra un aviso y usa `us`. |

Las `NEXT_PUBLIC_*` se inyectan **en el build**: si se cambian en Vercel, hay que redeployar.

En local: copiar `.env.example` a `.env.local` y completar.

## Correr en local

```bash
npm install
cp .env.example .env.local   # y completar el app_id
npm run dev                  # http://localhost:3000
```

## Agregar una clave al diccionario

Todos los textos de la interfaz salen de `lib/i18n.ts`. No hay textos escritos directo en los componentes.

1. Agregar la clave en el objeto `pt` (es el que define la forma, el tipo `Dict`).
2. Agregar la misma clave en `es` y `en`. Si falta en alguno, `npm run build` falla con error de tipos.
3. Usarla en el componente con `const { t } = useI18n();` → `t.seccion.clave`.

Textos con datos variables: definirlos como función, p. ej. `onUnread: (n: number) => \`${n} não lidas\``. Los mensajes del log se guardan como funciones del diccionario, así que se retraducen solos al cambiar de idioma.

## Agregar un idioma

1. En `lib/i18n.ts`, sumar el código a `LOCALES` (p. ej. `'fr'`). Usar un código BCP 47 válido: se usa para `<html lang>`, para el formato de hora y para `language_override` del Messenger.
2. Crear el objeto `const fr: Dict = { ... }` con todas las claves (el tipo obliga a completarlas, incluida `identity.languages.fr`, que también hay que sumar en `pt`, `es` y `en`).
3. Agregarlo a `dictionaries`. El toggle del header lo muestra solo, con la etiqueta de `short`.

Para que el **Messenger** hable ese idioma, además tiene que estar habilitado en el workspace (ver limitaciones).

## Cambiar la marca

| Qué | Dónde |
|---|---|
| Colores | Paleta `brand` en `tailwind.config.ts` (6 tonos). Cambia botones, acentos, retícula del fondo, foco de campos y estados en vivo. |
| Nombre | `BRAND.name` en `lib/brand.ts` (se usa en header, título y pie). |
| Logo | `BrandMark` en `components/Header.tsx`. Hoy es una inicial (`BRAND.initial`); para un logo, poner el archivo en `public/` y reemplazar por `<img>` o `next/image`. |
| Tipografías | `app/layout.tsx` (next/font) y `fontFamily` en `tailwind.config.ts`. |

> **Pendiente:** la paleta y el logo actuales son **provisorios** (tonos neutros + inicial «E») hasta tener los oficiales de Escalate Ops.

## Deploy en Vercel

1. Subir el repo a GitHub e importarlo en Vercel (framework: Next.js, sin configuración extra).
2. En Project › Settings › Environment Variables, cargar `NEXT_PUBLIC_INTERCOM_APP_ID` (y `NEXT_PUBLIC_INTERCOM_REGION` si el workspace no es de EE. UU.).
3. Deploy. Si las variables se cargan después del primer deploy, redeployar.
4. Si el workspace restringe dominios, agregar el dominio de Vercel (ver abajo).

## Archivos

| Archivo | Qué contiene |
|---|---|
| `lib/intercom.ts` | Lectura y validación de app_id y región, `api_base`, helper `ic()` y `reboot()` (shutdown + boot) |
| `lib/i18n.ts` | Diccionario único pt-BR / es / en |
| `lib/brand.ts` | Nombre y logo provisorio |
| `components/IntercomScript.tsx` | El snippet oficial de instalación, sin cambios salvo app_id y api_base parametrizados. No se renderiza sin app_id válido |
| `components/LocaleProvider.tsx` | Idioma actual, persistencia en `localStorage`, `<html lang>` y metadata |
| `components/Header.tsx` | Marca y toggle de idioma |
| `components/Sandbox.tsx` | Panel de pruebas y log en vivo |
| `app/page.tsx` | Portada y aviso de configuración |
| `tailwind.config.ts` | Paleta y tipografías |

## Limitaciones conocidas

- **Verificación de identidad (JWT / user_hash)**: si el workspace exige Messenger security, «Entrar como usuario» falla porque la página no firma al usuario. Hace falta un endpoint que genere el token con el secreto del workspace; el secreto nunca va en el frontend.
- **Atributos**: Intercom ignora los atributos personalizados que no existan en el workspace. Lo mismo para eventos que no estén pensados en workflows: se registran pero no disparan nada.
- **Traducir la página no traduce el Messenger ni Fin**: el toggle cambia solo la interfaz de esta página. El idioma del Messenger lo define el navegador o `language_override`, y para que funcione el workspace tiene que tener ese idioma habilitado, con los mensajes, el contenido de la base de conocimiento y las respuestas de Fin disponibles en ese idioma.
- **Dominios restringidos**: si el workspace limita los dominios donde carga el Messenger, agregar el dominio de Vercel (y `localhost` para pruebas locales).
- **Primer render en pt-BR**: el HTML sale del servidor en pt-BR y el idioma guardado se aplica al cargar en el navegador; puede verse un parpadeo breve.
- La página se marca `noindex`, pero cualquiera con el link la ve. No cargar datos reales de clientes.
