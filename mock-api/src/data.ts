// Datos ficticios en memoria. Todo se arma con fechas relativas a "hoy" (horario de Brasília),
// así los escenarios (pedido atrasado, boleto vencido, visita a menos de 24 h) siguen valiendo
// cualquier día que se haga la demo. `resetData()` vuelve todo al estado inicial.

// ── Fechas ────────────────────────────────────────────────────────────────────
// Brasil no tiene horario de verano desde 2019: Brasília = UTC-3 todo el año.
const BRT_OFFSET_H = -3;

/** "Ahora" expresado como si el reloj UTC marcara la hora de Brasília. */
const brtNow = () => new Date(Date.now() + BRT_OFFSET_H * 3600_000);

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const today = () => isoDate(brtNow());
export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};
export const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
export const isValidDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && isoDate(new Date(`${v}T00:00:00Z`)) === v;

// ── Slots de agenda ───────────────────────────────────────────────────────────
export type Periodo = 'manha' | 'tarde';
export const JANELAS: Record<Periodo, { janela: string; inicio: number }> = {
  manha: { janela: '08:00-12:00', inicio: 8 },
  tarde: { janela: '13:00-18:00', inicio: 13 },
};

/** SLT-AAAAMMDD-M / SLT-AAAAMMDD-T */
export const slotId = (date: string, p: Periodo) => `SLT-${date.replaceAll('-', '')}-${p === 'manha' ? 'M' : 'T'}`;
export const parseSlot = (id: string): { data: string; periodo: Periodo } | null => {
  const m = /^SLT-(\d{4})(\d{2})(\d{2})-([MT])$/.exec(id);
  if (!m) return null;
  const data = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isValidDate(data)) return null;
  return { data, periodo: m[4] === 'M' ? 'manha' : 'tarde' };
};

/** Horas que faltan hasta el inicio de la ventana (puede ser negativo). */
export const horasPara = (data: string, periodo: Periodo) => {
  const inicioUtc = Date.parse(`${data}T00:00:00Z`) + (JANELAS[periodo].inicio - BRT_OFFSET_H) * 3600_000;
  return Math.floor((inicioUtc - Date.now()) / 3600_000);
};

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type Cliente = {
  customer_id: string;
  nome: string;
  documento: string;
  data_nascimento: string;
  celular: string;
  email: string;
};

export type Pedido = {
  numero_pedido: string;
  customer_id: string;
  status: 'aguardando_pagamento' | 'em_transito' | 'entregue';
  motivo_status: string | null;
  data_compra: string;
  data_aprovacao_pagamento: string | null;
  data_entrega: string | null;
  previsao_entrega: string;
  valor_total: number;
  transportadora: string | null;
  codigo_rastreio: string | null;
  itens: { sku: string; descricao: string; quantidade: number }[];
  endereco_entrega_mascarado: string;
  nota_fiscal: { numero_nf: string; chave_acesso: string } | null;
  ocorrencias: { protocolo: string; tipo: string; descricao: string; conversation_id: string | null; criada_em: string }[];
};

export type Agendamento = {
  agendamento_id: string;
  customer_id: string;
  tipo_servico: 'instalacao' | 'manutencao' | 'visita_tecnica';
  data: string;
  periodo: Periodo;
  status: 'agendado' | 'confirmado' | 'cancelado';
  tecnico: string | null;
  remarcacoes_restantes: number;
  endereco: string;
  telefone_contato: string;
  numero_pedido: string | null;
  motivo_cancelamento: string | null;
};

export type Boleto = {
  boleto_id: string;
  customer_id: string;
  referencia: string;
  valor_original: number;
  vencimento: string;
  pago: boolean;
  comprovantes: { protocolo: string; data_pagamento: string; forma_pagamento: string; url_anexo: string }[];
};

type Db = {
  clientes: Cliente[];
  pedidos: Pedido[];
  agendamentos: Agendamento[];
  boletos: Boleto[];
  seq: { ocorrencia: number; agendamento: number; comprovante: number };
};

// ── Semilla ───────────────────────────────────────────────────────────────────
function seed(): Db {
  const hoy = today();
  const hora = brtNow().getUTCHours();

  // Visita "a menos de 24 h": la próxima ventana que empiece dentro de las próximas 24 h.
  const proxima: { data: string; periodo: Periodo } =
    hora < 6 ? { data: hoy, periodo: 'manha' } : hora < 11 ? { data: hoy, periodo: 'tarde' } : { data: addDays(hoy, 1), periodo: 'manha' };

  return {
    clientes: [
      {
        customer_id: 'acme-001',
        nome: 'Ana Souza',
        documento: '12345678909',
        data_nascimento: '1990-05-14',
        celular: '11987654321',
        email: 'ana.souza@exemplo.com.br',
      },
    ],
    pedidos: [
      // En camino, dentro del plazo.
      {
        numero_pedido: 'ACM-102938',
        customer_id: 'acme-001',
        status: 'em_transito',
        motivo_status: null,
        data_compra: addDays(hoy, -5),
        data_aprovacao_pagamento: addDays(hoy, -5),
        data_entrega: null,
        previsao_entrega: addDays(hoy, 3),
        valor_total: 459.9,
        transportadora: 'Transportadora Exemplo',
        codigo_rastreio: 'TX123456789BR',
        itens: [{ sku: 'A-100', descricao: 'Purificador de água Exemplo', quantidade: 1 }],
        endereco_entrega_mascarado: 'Rua Ex***, 1** - São Paulo/SP',
        nota_fiscal: { numero_nf: '000123456', chave_acesso: '35261100000000000100550010001234561000000000' },
        ocorrencias: [],
      },
      // Atrasado: la previsión ya pasó y sigue en tránsito → abrir ocorrência.
      {
        numero_pedido: 'ACM-102939',
        customer_id: 'acme-001',
        status: 'em_transito',
        motivo_status: 'Atraso na transportadora',
        data_compra: addDays(hoy, -12),
        data_aprovacao_pagamento: addDays(hoy, -12),
        data_entrega: null,
        previsao_entrega: addDays(hoy, -4),
        valor_total: 129.9,
        transportadora: 'Transportadora Exemplo',
        codigo_rastreio: 'TX987654321BR',
        itens: [{ sku: 'R-210', descricao: 'Refil de filtro Exemplo', quantidade: 2 }],
        endereco_entrega_mascarado: 'Rua Ex***, 1** - São Paulo/SP',
        nota_fiscal: { numero_nf: '000123470', chave_acesso: '35261100000000000100550010001234701000000000' },
        ocorrencias: [],
      },
      // Entregue, con NF-e.
      {
        numero_pedido: 'ACM-102940',
        customer_id: 'acme-001',
        status: 'entregue',
        motivo_status: null,
        data_compra: addDays(hoy, -20),
        data_aprovacao_pagamento: addDays(hoy, -19),
        data_entrega: addDays(hoy, -14),
        previsao_entrega: addDays(hoy, -14),
        valor_total: 89.9,
        transportadora: 'Transportadora Exemplo',
        codigo_rastreio: 'TX555666777BR',
        itens: [{ sku: 'K-050', descricao: 'Kit de instalação Exemplo', quantidade: 1 }],
        endereco_entrega_mascarado: 'Rua Ex***, 1** - São Paulo/SP',
        nota_fiscal: { numero_nf: '000123401', chave_acesso: '35261100000000000100550010001234011000000000' },
        ocorrencias: [],
      },
      // Esperando pago (boleto em aberto) → sin NF-e todavía.
      {
        numero_pedido: 'ACM-102941',
        customer_id: 'acme-001',
        status: 'aguardando_pagamento',
        motivo_status: 'Boleto ainda não compensado',
        data_compra: addDays(hoy, -1),
        data_aprovacao_pagamento: null,
        data_entrega: null,
        previsao_entrega: addDays(hoy, 10),
        valor_total: 249.0,
        transportadora: null,
        codigo_rastreio: null,
        itens: [{ sku: 'B-300', descricao: 'Bebedouro Exemplo', quantidade: 1 }],
        endereco_entrega_mascarado: 'Rua Ex***, 1** - São Paulo/SP',
        nota_fiscal: null,
        ocorrencias: [],
      },
    ],
    agendamentos: [
      // Más de 24 h y con remarcações → se puede reprogramar o cancelar sin taxa.
      {
        agendamento_id: 'AGD-30411',
        customer_id: 'acme-001',
        tipo_servico: 'instalacao',
        data: isSunday(addDays(hoy, 3)) ? addDays(hoy, 4) : addDays(hoy, 3),
        periodo: 'manha',
        status: 'confirmado',
        tecnico: 'Carlos',
        remarcacoes_restantes: 2,
        endereco: 'Rua Exemplo, 100 - São Paulo/SP',
        telefone_contato: '11987654321',
        numero_pedido: 'ACM-102938',
        motivo_cancelamento: null,
      },
      // Menos de 24 h → reprogramar da 422; cancelar cobra taxa.
      {
        agendamento_id: 'AGD-30412',
        customer_id: 'acme-001',
        tipo_servico: 'manutencao',
        data: proxima.data,
        periodo: proxima.periodo,
        status: 'confirmado',
        tecnico: 'Juliana',
        remarcacoes_restantes: 1,
        endereco: 'Rua Exemplo, 100 - São Paulo/SP',
        telefone_contato: '11987654321',
        numero_pedido: null,
        motivo_cancelamento: null,
      },
    ],
    boletos: [
      // Vencido hace 15 días → segunda via con multa y juros.
      {
        boleto_id: 'BOL-88120',
        customer_id: 'acme-001',
        referencia: 'Contrato de manutenção — mensalidade',
        valor_original: 200.0,
        vencimento: addDays(hoy, -15),
        pago: false,
        comprovantes: [],
      },
      // En abierto, todavía no vence (es el del pedido ACM-102941).
      {
        boleto_id: 'BOL-88121',
        customer_id: 'acme-001',
        referencia: 'Pedido ACM-102941',
        valor_original: 249.0,
        vencimento: addDays(hoy, 2),
        pago: false,
        comprovantes: [],
      },
      // Pagado.
      {
        boleto_id: 'BOL-88119',
        customer_id: 'acme-001',
        referencia: 'Pedido ACM-102940',
        valor_original: 89.9,
        vencimento: addDays(hoy, -21),
        pago: true,
        comprovantes: [],
      },
    ],
    seq: { ocorrencia: 558811, agendamento: 30412, comprovante: 11872 },
  };
}

export let db: Db = seed();
export const resetData = () => {
  db = seed();
};
