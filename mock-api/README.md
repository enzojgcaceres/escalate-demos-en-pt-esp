# ACME mock API — backend de prueba para los Data connectors de Fin

API simulada que implementa el contrato `openapi.json` («ACME API de Atendimento», 13 endpoints). Sirve para conectar Fin a datos de un cliente ficticio y probarlo desde el sandbox del Messenger. Todo es inventado: no hay datos de clientes reales.

- Node 20+ y TypeScript, **sin dependencias en tiempo de ejecución** (`node:http`).
- Datos **en memoria**: cada reinicio del servicio, o `POST /v1/_reset`, vuelve todo al estado inicial. No hay base de datos.
- Las fechas se calculan desde «hoy» (horario de Brasília), así los escenarios valen cualquier día.

## Cómo encaja con el sandbox

```
Navegador ── Messenger (sandbox en Vercel) ──► Intercom / Fin ──► mock API (Render)
                 user_id = acme-001                 Authorization: Bearer <token>
```

El front **no llama** a esta API: la llama Fin desde los servidores de Intercom. Por eso la API tiene que estar publicada en una URL pública (Render) y no alcanza con `localhost`.

### customer_id = user_id

Varios endpoints piden `customer_id`, el ID del cliente en ACME. Para que Fin sepa quién es la persona sin preguntárselo:

1. En el sandbox, «Entrar como usuário» con **user_id `acme-001`** (nombre y e-mail, los que quieras).
2. En cada Data connector que lleve `customer_id`, mapear ese parámetro al atributo **User ID** del contacto de Intercom.

Así, «¿dónde está mi pedido?» funciona sin pedir datos. Si entrás como visitante, Fin no tiene `customer_id`. En ese caso pueden usarse los endpoints que identifican por documento (consultar pedido, listar boletos).

## Datos de prueba

Un único cliente ficticio:

| Campo | Valor |
|---|---|
| customer_id | `acme-001` |
| Nombre | Ana Souza |
| CPF (documento) | `12345678909` |
| Fecha de nacimiento | `1990-05-14` |
| Celular | `11987654321` (4 últimos: `4321`) |
| E-mail | `ana.souza@exemplo.com.br` |

### Escenarios

| Para probar | Usar | Qué pasa |
|---|---|---|
| Pedido en camino | `ACM-102938` | En tránsito, dentro del plazo |
| Pedido atrasado → abrir ocorrência | `ACM-102939` | La previsión ya pasó; `abrir_ocorrencia_pedido` devuelve protocolo `OC-…` |
| Pedido entregado + NF-e | `ACM-102940` | `obter_nota_fiscal` devuelve PDF, XML y clave de acceso |
| Pedido esperando pago | `ACM-102941` | Sin NF-e todavía (422) |
| Reprogramar visita | `AGD-30411` | A más de 24 h, con 2 reprogramaciones |
| Visita a menos de 24 h | `AGD-30412` | Reprogramar → 422; cancelar → cobra taxa |
| Disponibilidad | cualquier CEP de 8 dígitos | 5 días hábiles (sin domingos), mañana y tarde |
| Sin cobertura | CEP `99999999` | Disponibilidad vacía |
| Boleto vencido → segunda via | `BOL-88120` | 15 días de atraso: 200,00 + multa 4,00 + juros 1,00 = 205,00 |
| Boleto en abierto | `BOL-88121` | Vence en 2 días; enviar por e-mail o registrar comprovante |
| Boleto pagado | `BOL-88119` | Segunda via → 422 |
| Identificar sin login | documento `12345678909` + fator `1990-05-14` o `4321` | Lista los boletos; un fator incorrecto devuelve 404 |

### Reglas del mock que no están en el contrato

Son decisiones para que la demo tenga casos interesantes. **No vienen del contrato**; si el contrato real dice otra cosa, se cambian.

- Cancelar con **24 h o menos** de anticipación cobra **taxa de R$ 50,00**. Con más de 24 h, `0`.
- Segunda via de un boleto vencido: **multa 2 %** + **juros 1 % al mes pro rata**, con nuevo vencimiento a 3 días.
- `listar_boletos` con `status=em_aberto` (por defecto) incluye los **vencidos**, porque es lo que se busca para la segunda via.
- `listar_pedidos_cliente` sin `status` devuelve **todos**.
- Los slots se pueden reservar desde mañana y hasta 30 días, sin domingos. Un slot ocupado devuelve 422.
- Si `consultar_pedido` recibe un `documento` que no es del titular, responde 404, igual que si el pedido no existiera.
- Errores: `{ "erro": { "codigo": "...", "mensagem": "..." } }` con 401, 404, 405, 422 o 500.

## Endpoints extra (fuera del contrato)

| Endpoint | Auth | Para qué |
|---|---|---|
| `GET /health` | No | Health check de Render |
| `POST /v1/_reset` | Sí | Volver los datos al estado inicial antes de una demo |

## Correr en local

```bash
cd mock-api
npm install
cp .env.example .env          # completar ACME_API_TOKEN (openssl rand -hex 24)
npm run dev                   # http://localhost:4000
```

Sin `ACME_API_TOKEN`, o con menos de 16 caracteres, el servicio no arranca.

Prueba de punta a punta (33 verificaciones sobre los 13 endpoints; al final resetea los datos):

```bash
ACME_API_TOKEN=<token> BASE_URL=http://localhost:4000 npm run smoke
```

Con `BASE_URL=https://<servicio>.onrender.com` verifica el deploy.

## Deploy en Render

El repo trae `render.yaml` en la raíz.

1. Render › New › **Blueprint** › elegir este repo. Toma `render.yaml` y crea el servicio `acme-mock-api` con raíz en `mock-api/`.
2. Cuando lo pida, cargar `ACME_API_TOKEN`. El token no va en el repo ni en chats.
3. Al terminar, probar `https://<servicio>.onrender.com/health` → `{"ok":true}`.

Alternativa manual: New › Web Service, Root Directory `mock-api`, Build `npm ci && npm run build`, Start `npm start`, Health check `/health`, y la variable `ACME_API_TOKEN`.

## Conectar Fin

En Intercom, crear un Data connector por endpoint, con la URL base del servicio de Render (`https://<servicio>.onrender.com/v1`) y el header `Authorization: Bearer <token>`. Para cada uno, la descripción del `openapi.json` (campo `description`) sirve como instrucción de cuándo usarlo.

- `customer_id` → atributo **User ID** del contacto (ver arriba).
- `conversation_id` (en `abrir_ocorrencia_pedido`) → ID de la conversación.
- El resto de los parámetros (`numero_pedido`, `cep`, `slot_id`, etc.) los pide Fin en la conversación.
- Las acciones que modifican datos (crear, reprogramar o cancelar visitas, abrir ocorrências, registrar comprovantes) conviene configurarlas con confirmación del cliente, como dice el contrato.

`servers` en `openapi.json` sigue apuntando a `api.acme.com.br` (ficticio). Si se importa el archivo en algún lado, reemplazar esa URL por la de Render.

## Limitaciones conocidas

- **Arranque en frío (plan free de Render)**: después de unos 15 minutos sin uso, el servicio se duerme y la primera request tarda entre 30 y 60 s. Fin puede cortar por timeout. **Antes de cada demo, abrir `/health`** para despertarlo. Además, al dormirse se pierden los cambios: la demo arranca de cero, que es lo que buscamos.
- **Una sola instancia**: los datos viven en la memoria del proceso. Con más de una instancia, cada una tendría datos distintos.
- **Boletos sin titular**: segunda via, envío y comprovantes solo piden `boleto_id`, como el contrato. En un sistema real habría que validar el titular.
- **Links ficticios**: las URLs de PDF, XML, rastreo y Pix apuntan a dominios de ejemplo y no abren nada.
- **No envía e-mails**: `enviar_boleto_email` solo responde `enviado: true`.
