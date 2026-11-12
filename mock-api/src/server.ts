// API simulada del contrato ACME (openapi.json). Sin dependencias: node:http + un router mínimo.
// Datos en memoria (ver data.ts): se reinician al reiniciar el servicio o con POST /v1/_reset.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import {
  JANELAS,
  addDays,
  db,
  horasPara,
  isSunday,
  isValidDate,
  parseSlot,
  resetData,
  slotId,
  today,
  type Agendamento,
  type Boleto,
  type Periodo,
} from './data.js';

const TOKEN = process.env.ACME_API_TOKEN?.trim() ?? '';
const PORT = Number(process.env.PORT) || 4000;

if (TOKEN.length < 16) {
  console.error('ACME_API_TOKEN no está definida o tiene menos de 16 caracteres. Generala con: openssl rand -hex 24');
  process.exit(1);
}

// ── Respuestas ────────────────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(public status: number, public codigo: string, message: string) {
    super(message);
  }
}
const notFound = (msg = 'Recurso não encontrado') => new HttpError(404, 'nao_encontrado', msg);
const invalid = (msg: string) => new HttpError(422, 'dados_invalidos', msg);

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

const authorized = (req: IncomingMessage) => {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
  if (!m) return false;
  const given = Buffer.from(m[1].trim());
  const expected = Buffer.from(TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 100_000) throw invalid('Corpo da requisição muito grande');
    chunks.push(c as Buffer);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    /* cae al error de abajo */
  }
  throw invalid('O corpo precisa ser um objeto JSON válido');
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const onlyDigits = (v: string) => v.replace(/\D/g, '');
const money = (n: number) => Math.round(n * 100) / 100;

// ── Helpers de dominio ────────────────────────────────────────────────────────
const cliente = (id: string) => db.clientes.find((c) => c.customer_id === id);
const pedido = (n: string) => db.pedidos.find((p) => p.numero_pedido === n);
const agendamento = (id: string) => db.agendamentos.find((a) => a.agendamento_id === id);
const boleto = (id: string) => db.boletos.find((b) => b.boleto_id === id);

const statusBoleto = (b: Boleto) => {
  if (b.pago) return { status: 'pago', dias_atraso: 0 };
  const dias = Math.round((Date.parse(today()) - Date.parse(b.vencimento)) / 86_400_000);
  return dias > 0 ? { status: 'vencido', dias_atraso: dias } : { status: 'em_aberto', dias_atraso: 0 };
};

const slotOcupado = (data: string, periodo: Periodo, excepto?: string) =>
  db.agendamentos.some((a) => a.status !== 'cancelado' && a.data === data && a.periodo === periodo && a.agendamento_id !== excepto);

/** Valida un slot_id para reservar: formato, desde mañana, hasta 30 días, sin domingos, libre. */
function slotReservable(id: string, excepto?: string) {
  const s = parseSlot(id);
  if (!s) throw invalid('slot_id inválido; use um slot_id retornado por consultar_disponibilidade');
  const manana = addDays(today(), 1);
  if (s.data < manana || s.data > addDays(today(), 30) || isSunday(s.data)) throw invalid('Slot fora da agenda disponível');
  if (slotOcupado(s.data, s.periodo, excepto)) throw invalid('Slot já ocupado; consulte a disponibilidade novamente');
  return s;
}

const vistaAgendamento = (a: Agendamento) => ({
  agendamento_id: a.agendamento_id,
  tipo_servico: a.tipo_servico,
  data: a.data,
  janela: JANELAS[a.periodo].janela,
  status: a.status,
  tecnico: a.tecnico,
  remarcacoes_restantes: a.remarcacoes_restantes,
  horas_para_visita: horasPara(a.data, a.periodo),
});

const TIPOS_SERVICO = ['instalacao', 'manutencao', 'visita_tecnica'] as const;
const TIPOS_OCORRENCIA = ['atraso', 'nao_recebido', 'avaria', 'item_faltando', 'item_errado'] as const;
/** Regla del mock (no está en el contrato): cancelar con menos de 24 h cobra esta taxa. */
const TAXA_CANCELAMENTO_TARDIO = 50;
/** CEP de ejemplo sin cobertura: devuelve disponibilidad vacía. */
const CEP_SEM_COBERTURA = '99999999';

// ── Rutas ─────────────────────────────────────────────────────────────────────
type Ctx = { params: Record<string, string>; query: URLSearchParams; body: () => Promise<Record<string, unknown>> };
type Handler = (ctx: Ctx) => unknown | Promise<unknown>;
const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + path.replace(/\{(\w+)\}/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$',
  );
  routes.push({ method, pattern, keys, handler });
}

// Pedidos
route('GET', '/v1/clientes/{customer_id}/pedidos', ({ params, query }) => {
  if (!cliente(params.customer_id)) throw notFound('Cliente não encontrado');
  const filtro = query.get('status') ?? 'todos';
  if (!['em_aberto', 'todos'].includes(filtro)) throw invalid('status deve ser em_aberto ou todos');
  const pedidos = db.pedidos
    .filter((p) => p.customer_id === params.customer_id && (filtro === 'todos' || p.status !== 'entregue'))
    .sort((a, b) => b.data_compra.localeCompare(a.data_compra))
    .map(({ numero_pedido, data_compra, status, valor_total, previsao_entrega }) => ({
      numero_pedido,
      data_compra,
      status,
      valor_total,
      previsao_entrega,
    }));
  return { pedidos };
});

route('GET', '/v1/pedidos/{numero_pedido}', ({ params, query }) => {
  if (!/^ACM-\d{6}$/.test(params.numero_pedido)) throw invalid('numero_pedido deve ter o formato ACM-000000');
  const p = pedido(params.numero_pedido);
  if (!p) throw notFound('Pedido não encontrado');
  const doc = onlyDigits(query.get('documento') ?? '');
  // Si se informa documento y no es del titular, se responde igual que si no existiera.
  if (doc && cliente(p.customer_id)?.documento !== doc) throw notFound('Pedido não encontrado');
  return {
    numero_pedido: p.numero_pedido,
    status: p.status,
    motivo_status: p.motivo_status,
    data_compra: p.data_compra,
    data_aprovacao_pagamento: p.data_aprovacao_pagamento,
    data_entrega: p.data_entrega,
    previsao_entrega: p.previsao_entrega,
    transportadora: p.transportadora,
    codigo_rastreio: p.codigo_rastreio,
    url_rastreio: p.codigo_rastreio ? `https://rastreio.exemplo.com/${p.codigo_rastreio}` : null,
    itens: p.itens,
    endereco_entrega_mascarado: p.endereco_entrega_mascarado,
  };
});

route('POST', '/v1/pedidos/{numero_pedido}/ocorrencias', async ({ params, body }) => {
  const p = pedido(params.numero_pedido);
  if (!p) throw notFound('Pedido não encontrado');
  const b = await body();
  const tipo = str(b.tipo);
  const descricao = str(b.descricao);
  if (!TIPOS_OCORRENCIA.includes(tipo as (typeof TIPOS_OCORRENCIA)[number]))
    throw invalid(`tipo deve ser um de: ${TIPOS_OCORRENCIA.join(', ')}`);
  if (!descricao) throw invalid('descricao é obrigatória');
  const protocolo = `OC-${today().slice(0, 4)}-${++db.seq.ocorrencia}`;
  p.ocorrencias.push({ protocolo, tipo, descricao, conversation_id: str(b.conversation_id) || null, criada_em: new Date().toISOString() });
  return { protocolo, prazo_retorno_dias_uteis: 2 };
});

route('GET', '/v1/pedidos/{numero_pedido}/nota-fiscal', ({ params }) => {
  const p = pedido(params.numero_pedido);
  if (!p) throw notFound('Pedido não encontrado');
  if (!p.nota_fiscal) throw invalid('Pedido ainda não faturado; a NF-e é emitida após a confirmação do pagamento');
  const { numero_nf, chave_acesso } = p.nota_fiscal;
  return {
    numero_nf,
    chave_acesso,
    url_pdf: `https://minhaconta.acme.com.br/nf/${numero_nf}.pdf`,
    url_xml: `https://minhaconta.acme.com.br/nf/${numero_nf}.xml`,
  };
});

// Agendamentos
route('GET', '/v1/agendamentos/disponibilidade', ({ query }) => {
  const tipo = query.get('tipo_servico') ?? '';
  const cep = query.get('cep') ?? '';
  if (!TIPOS_SERVICO.includes(tipo as (typeof TIPOS_SERVICO)[number]))
    throw invalid(`tipo_servico deve ser um de: ${TIPOS_SERVICO.join(', ')}`);
  if (!/^\d{8}$/.test(cep)) throw invalid('cep deve ter 8 dígitos, somente números');
  const manana = addDays(today(), 1);
  const pedida = query.get('data_inicial');
  if (pedida && !isValidDate(pedida)) throw invalid('data_inicial deve estar no formato AAAA-MM-DD');
  if (cep === CEP_SEM_COBERTURA) return { opcoes: [] };

  const opcoes: { slot_id: string; data: string; periodo: Periodo; janela: string }[] = [];
  let data = pedida && pedida > manana ? pedida : manana;
  for (let dias = 0; dias < 5; data = addDays(data, 1)) {
    if (isSunday(data)) continue;
    dias++;
    for (const periodo of ['manha', 'tarde'] as const) {
      if (!slotOcupado(data, periodo)) opcoes.push({ slot_id: slotId(data, periodo), data, periodo, janela: JANELAS[periodo].janela });
    }
  }
  return { opcoes };
});

route('POST', '/v1/agendamentos', async ({ body }) => {
  const b = await body();
  const customer_id = str(b.customer_id);
  const tipo = str(b.tipo_servico);
  const endereco = str(b.endereco);
  const telefone = onlyDigits(str(b.telefone_contato));
  const numero_pedido = str(b.numero_pedido) || null;
  if (!cliente(customer_id)) throw notFound('Cliente não encontrado');
  if (!TIPOS_SERVICO.includes(tipo as (typeof TIPOS_SERVICO)[number]))
    throw invalid(`tipo_servico deve ser um de: ${TIPOS_SERVICO.join(', ')}`);
  if (!endereco) throw invalid('endereco é obrigatório');
  if (telefone.length < 10 || telefone.length > 11) throw invalid('telefone_contato deve ter DDD + número');
  if (numero_pedido && pedido(numero_pedido)?.customer_id !== customer_id) throw notFound('Pedido não encontrado');
  const s = slotReservable(str(b.slot_id));

  const a: Agendamento = {
    agendamento_id: `AGD-${++db.seq.agendamento}`,
    customer_id,
    tipo_servico: tipo as Agendamento['tipo_servico'],
    data: s.data,
    periodo: s.periodo,
    status: 'agendado',
    tecnico: null,
    remarcacoes_restantes: 2,
    endereco,
    telefone_contato: telefone,
    numero_pedido,
    motivo_cancelamento: null,
  };
  db.agendamentos.push(a);
  return { agendamento_id: a.agendamento_id, status: a.status, data: a.data, janela: JANELAS[a.periodo].janela };
});

route('GET', '/v1/clientes/{customer_id}/agendamentos', ({ params }) => {
  if (!cliente(params.customer_id)) throw notFound('Cliente não encontrado');
  const agendamentos = db.agendamentos
    .filter((a) => a.customer_id === params.customer_id)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map(vistaAgendamento);
  return { agendamentos };
});

route('PATCH', '/v1/agendamentos/{agendamento_id}', async ({ params, body }) => {
  const a = agendamento(params.agendamento_id);
  if (!a) throw notFound('Agendamento não encontrado');
  if (a.status === 'cancelado') throw invalid('Agendamento cancelado não pode ser remarcado');
  if (horasPara(a.data, a.periodo) <= 24) throw invalid('Remarcação só é permitida com mais de 24h de antecedência');
  if (a.remarcacoes_restantes <= 0) throw invalid('Sem remarcações restantes para este agendamento');
  const b = await body();
  const s = slotReservable(str(b.novo_slot_id), a.agendamento_id);
  a.data = s.data;
  a.periodo = s.periodo;
  a.status = 'agendado';
  a.remarcacoes_restantes -= 1;
  return {
    agendamento_id: a.agendamento_id,
    status: a.status,
    data: a.data,
    janela: JANELAS[a.periodo].janela,
    remarcacoes_restantes: a.remarcacoes_restantes,
  };
});

route('POST', '/v1/agendamentos/{agendamento_id}/cancelamento', async ({ params, body }) => {
  const a = agendamento(params.agendamento_id);
  if (!a) throw notFound('Agendamento não encontrado');
  if (a.status === 'cancelado') throw invalid('Agendamento já está cancelado');
  const motivo = str((await body()).motivo);
  if (!motivo) throw invalid('motivo é obrigatório');
  const taxa = horasPara(a.data, a.periodo) <= 24 ? TAXA_CANCELAMENTO_TARDIO : 0;
  a.status = 'cancelado';
  a.motivo_cancelamento = motivo;
  return { agendamento_id: a.agendamento_id, status: a.status, taxa_aplicada: taxa };
});

// Financeiro
route('GET', '/v1/financeiro/boletos', ({ query }) => {
  const customer_id = query.get('customer_id')?.trim();
  const documento = onlyDigits(query.get('documento') ?? '');
  const fator = (query.get('fator_verificacao') ?? '').trim();
  const filtro = query.get('status') ?? 'em_aberto';
  if (!['em_aberto', 'vencido', 'pago', 'todos'].includes(filtro)) throw invalid('status deve ser em_aberto, vencido, pago ou todos');

  let c;
  if (customer_id) {
    c = cliente(customer_id);
    if (!c) throw notFound('Cliente não encontrado');
  } else {
    if (!documento || !fator) throw invalid('Informe customer_id, ou documento junto com fator_verificacao');
    c = db.clientes.find((x) => x.documento === documento);
    const confere = c && (fator === c.data_nascimento || fator === c.celular.slice(-4));
    // Documento inexistente y fator incorrecto responden igual, para no revelar cuál falló.
    if (!c || !confere) throw notFound('Não foi possível validar o titular com os dados informados');
  }

  const titular = c;
  const boletos = db.boletos
    .filter((b) => b.customer_id === titular.customer_id)
    .map((b) => ({ b, ...statusBoleto(b) }))
    // em_aberto = no pagado (incluye vencidos): es lo que se busca para segunda via.
    .filter((x) => filtro === 'todos' || (filtro === 'em_aberto' ? x.status !== 'pago' : x.status === filtro))
    .map(({ b, status, dias_atraso }) => ({
      boleto_id: b.boleto_id,
      referencia: b.referencia,
      valor_original: b.valor_original,
      vencimento: b.vencimento,
      status,
      dias_atraso,
    }));
  return { titular_mascarado: `***.${titular.documento.slice(3, 6)}.${titular.documento.slice(6, 9)}-**`, boletos };
});

route('POST', '/v1/financeiro/boletos/{boleto_id}/segunda-via', ({ params }) => {
  const b = boleto(params.boleto_id);
  if (!b) throw notFound('Boleto não encontrado');
  const { status, dias_atraso } = statusBoleto(b);
  if (status === 'pago') throw invalid('Boleto já está pago');
  // Vencido: multa 2% + juros 1% ao mês pro rata (regras do mock).
  const multa = status === 'vencido' ? money(b.valor_original * 0.02) : 0;
  const juros = status === 'vencido' ? money((b.valor_original * 0.01 * dias_atraso) / 30) : 0;
  const valor_atualizado = money(b.valor_original + multa + juros);
  const novo_vencimento = status === 'vencido' ? addDays(today(), 3) : b.vencimento;
  const centavos = String(Math.round(valor_atualizado * 100)).padStart(10, '0');
  return {
    boleto_id: b.boleto_id,
    valor_original: b.valor_original,
    multa,
    juros,
    valor_atualizado,
    novo_vencimento,
    linha_digitavel: `00190.00009 01234.567890 12345.678901 1 9876${centavos}`,
    pix_copia_e_cola: `00020126580014BR.GOV.BCB.PIX-EXEMPLO-${b.boleto_id}-${centavos}6304ABCD`,
    url_pdf: `https://minhaconta.acme.com.br/boletos/${b.boleto_id}.pdf`,
  };
});

route('POST', '/v1/financeiro/boletos/{boleto_id}/envio', ({ params }) => {
  const b = boleto(params.boleto_id);
  if (!b) throw notFound('Boleto não encontrado');
  const email = cliente(b.customer_id)!.email;
  const [user, domain] = email.split('@');
  return { enviado: true, email_mascarado: `${user.slice(0, 2)}***@${domain}` };
});

route('POST', '/v1/financeiro/boletos/{boleto_id}/comprovantes', async ({ params, body }) => {
  const b = boleto(params.boleto_id);
  if (!b) throw notFound('Boleto não encontrado');
  const x = await body();
  const data_pagamento = str(x.data_pagamento);
  const forma = str(x.forma_pagamento);
  const url_anexo = str(x.url_anexo);
  if (!isValidDate(data_pagamento) || data_pagamento > today()) throw invalid('data_pagamento deve ser uma data válida (AAAA-MM-DD) até hoje');
  if (!['pix', 'boleto'].includes(forma)) throw invalid('forma_pagamento deve ser pix ou boleto');
  if (!/^https?:\/\/\S+$/.test(url_anexo)) throw invalid('url_anexo deve ser uma URL http(s)');
  const protocolo = `FIN-${today().slice(0, 4)}-${++db.seq.comprovante}`;
  b.comprovantes.push({ protocolo, data_pagamento, forma_pagamento: forma, url_anexo });
  return { protocolo, prazo_retorno_dias_uteis: 2 };
});

// Utilidad para demos: vuelve todos los datos al estado inicial.
route('POST', '/v1/_reset', () => {
  resetData();
  return { ok: true, mensagem: 'Dados de demonstração restaurados' };
});

// ── Servidor ──────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';
  // Solo método, ruta y status: nunca query string (puede traer CPF) ni headers (token).
  res.on('finish', () => console.log(`${method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`));
  try {
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    if (!url.pathname.startsWith('/v1/')) throw notFound();
    if (!authorized(req)) throw new HttpError(401, 'token_invalido', 'Token inválido');

    const candidates = routes.filter((r) => r.pattern.test(url.pathname));
    if (!candidates.length) throw notFound();
    const r = candidates.find((c) => c.method === method);
    if (!r) throw new HttpError(405, 'metodo_nao_permitido', `Use ${candidates.map((c) => c.method).join(', ')}`);

    const m = r.pattern.exec(url.pathname)!;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const result = await r.handler({ params, query: url.searchParams, body: () => readJson(req) });
    send(res, 200, result);
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(500, 'erro_interno', 'Erro interno');
    if (!(e instanceof HttpError)) console.error(e);
    send(res, err.status, { erro: { codigo: err.codigo, mensagem: err.message } });
  }
});

server.listen(PORT, () => console.log(`ACME mock API escuchando en :${PORT}`));
