// Recorre los 13 endpoints y los escenarios de demo contra una instancia en marcha.
// Uso: ACME_API_TOKEN=... BASE_URL=http://localhost:4000 npm run smoke
// Ojo: deja los datos modificados y al final llama a /v1/_reset.

const BASE = (process.env.BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const TOKEN = process.env.ACME_API_TOKEN ?? '';

let failures = 0;
type Json = Record<string, any>;

async function call(method: string, path: string, body?: unknown, token = TOKEN) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as Json };
}

function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${!ok && detail ? ` → ${JSON.stringify(detail)}` : ''}`);
}

async function main() {
  await call('POST', '/v1/_reset');

  let r = await call('GET', '/v1/clientes/acme-001/pedidos', undefined, 'token-errado');
  check('401 con token inválido', r.status === 401, r);

  r = await call('GET', '/v1/clientes/acme-001/pedidos');
  check('listar_pedidos_cliente: 4 pedidos', r.status === 200 && r.json.pedidos.length === 4, r);
  r = await call('GET', '/v1/clientes/acme-001/pedidos?status=em_aberto');
  check('listar_pedidos_cliente em_aberto: sin entregues', r.json.pedidos?.every((p: Json) => p.status !== 'entregue'), r);
  r = await call('GET', '/v1/clientes/nao-existe/pedidos');
  check('listar_pedidos_cliente: cliente inexistente 404', r.status === 404, r);

  r = await call('GET', '/v1/pedidos/ACM-102939');
  check('consultar_pedido: atrasado (previsão pasada)', r.status === 200 && r.json.previsao_entrega < new Date().toISOString().slice(0, 10), r);
  r = await call('GET', '/v1/pedidos/ACM-102938?documento=123.456.789-09');
  check('consultar_pedido con documento correcto', r.status === 200, r);
  r = await call('GET', '/v1/pedidos/ACM-102938?documento=00000000000');
  check('consultar_pedido con documento ajeno 404', r.status === 404, r);
  r = await call('GET', '/v1/pedidos/102938');
  check('consultar_pedido formato inválido 422', r.status === 422, r);

  r = await call('POST', '/v1/pedidos/ACM-102939/ocorrencias', { tipo: 'atraso', descricao: 'Cliente relata atraso', conversation_id: '123' });
  check('abrir_ocorrencia_pedido', r.status === 200 && /^OC-\d{4}-\d+$/.test(r.json.protocolo), r);
  r = await call('POST', '/v1/pedidos/ACM-102939/ocorrencias', { tipo: 'outro', descricao: 'x' });
  check('abrir_ocorrencia_pedido tipo inválido 422', r.status === 422, r);

  r = await call('GET', '/v1/pedidos/ACM-102940/nota-fiscal');
  check('obter_nota_fiscal entregue', r.status === 200 && r.json.chave_acesso?.length === 44, r);
  r = await call('GET', '/v1/pedidos/ACM-102941/nota-fiscal');
  check('obter_nota_fiscal sin faturar 422', r.status === 422, r);

  r = await call('GET', '/v1/agendamentos/disponibilidade?tipo_servico=instalacao&cep=01310100');
  const slots = r.json.opcoes ?? [];
  check('consultar_disponibilidade: 5 días hábiles', r.status === 200 && slots.length >= 8, r);
  r = await call('GET', '/v1/agendamentos/disponibilidade?tipo_servico=instalacao&cep=99999999');
  check('consultar_disponibilidade CEP sin cobertura vacío', r.status === 200 && r.json.opcoes.length === 0, r);

  r = await call('POST', '/v1/agendamentos', {
    customer_id: 'acme-001', slot_id: slots[0].slot_id, tipo_servico: 'visita_tecnica',
    endereco: 'Rua Exemplo, 100', telefone_contato: '(11) 98765-4321',
  });
  check('criar_agendamento', r.status === 200 && r.json.status === 'agendado', r);
  r = await call('POST', '/v1/agendamentos', {
    customer_id: 'acme-001', slot_id: slots[0].slot_id, tipo_servico: 'visita_tecnica',
    endereco: 'Rua Exemplo, 100', telefone_contato: '11987654321',
  });
  check('criar_agendamento slot ocupado 422', r.status === 422, r);

  r = await call('GET', '/v1/clientes/acme-001/agendamentos');
  const agds: Json[] = r.json.agendamentos ?? [];
  const lejos = agds.find((a) => a.agendamento_id === 'AGD-30411');
  const cerca = agds.find((a) => a.agendamento_id === 'AGD-30412');
  check('listar_agendamentos: 3 (2 semilla + 1 creado)', agds.length === 3, r);
  check('AGD-30411 a más de 24 h', lejos?.horas_para_visita > 24, lejos);
  check('AGD-30412 a menos de 24 h', cerca?.horas_para_visita <= 24 && cerca?.horas_para_visita >= 0, cerca);

  r = await call('PATCH', '/v1/agendamentos/AGD-30411', { novo_slot_id: slots[1].slot_id });
  check('remarcar_agendamento', r.status === 200 && r.json.remarcacoes_restantes === 1, r);
  r = await call('PATCH', '/v1/agendamentos/AGD-30412', { novo_slot_id: slots[2].slot_id });
  check('remarcar_agendamento <24h 422', r.status === 422, r);

  r = await call('POST', '/v1/agendamentos/AGD-30412/cancelamento', { motivo: 'Não estarei em casa' });
  check('cancelar_agendamento <24h con taxa', r.status === 200 && r.json.taxa_aplicada > 0, r);
  r = await call('POST', '/v1/agendamentos/AGD-30411/cancelamento', {});
  check('cancelar_agendamento sin motivo 422', r.status === 422, r);

  r = await call('GET', '/v1/financeiro/boletos?customer_id=acme-001');
  check('listar_boletos em_aberto (incluye vencido): 2', r.status === 200 && r.json.boletos.length === 2, r);
  r = await call('GET', '/v1/financeiro/boletos?documento=12345678909&fator_verificacao=4321&status=todos');
  check('listar_boletos por documento + celular: 3', r.status === 200 && r.json.boletos.length === 3, r);
  r = await call('GET', '/v1/financeiro/boletos?documento=12345678909&fator_verificacao=1111');
  check('listar_boletos fator incorrecto 404', r.status === 404, r);
  r = await call('GET', '/v1/financeiro/boletos?documento=12345678909');
  check('listar_boletos sin fator 422', r.status === 422, r);

  r = await call('POST', '/v1/financeiro/boletos/BOL-88120/segunda-via');
  check('gerar_segunda_via vencido: 200 + 4 multa + 1 juros = 205', r.status === 200 && r.json.valor_atualizado === 205, r);
  r = await call('POST', '/v1/financeiro/boletos/BOL-88119/segunda-via');
  check('gerar_segunda_via pagado 422', r.status === 422, r);

  r = await call('POST', '/v1/financeiro/boletos/BOL-88121/envio');
  check('enviar_boleto_email', r.status === 200 && r.json.enviado === true, r);

  r = await call('POST', '/v1/financeiro/boletos/BOL-88121/comprovantes', {
    data_pagamento: new Date().toISOString().slice(0, 10), forma_pagamento: 'pix', url_anexo: 'https://exemplo.com/comprovante.png',
  });
  check('registrar_comprovante', r.status === 200 && /^FIN-\d{4}-\d+$/.test(r.json.protocolo), r);

  r = await call('POST', '/v1/_reset');
  check('reset', r.status === 200, r);
  r = await call('GET', '/v1/clientes/acme-001/agendamentos');
  check('después del reset vuelven los 2 agendamentos', r.json.agendamentos?.length === 2, r);

  console.log(failures ? `\n${failures} fallas` : '\nTodo OK');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
