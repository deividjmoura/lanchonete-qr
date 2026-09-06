import { create } from "zustand";
import type {
  Categoria,
  Evento,
  EventoTipo,
  FormaPagamento,
  ItemPedido,
  Mesa,
  Pagamento,
  Pedido,
  Produto,
  Role,
  Sessao,
} from "../lib/types";
import { CATEGORIAS_SEED, MESAS_SEED, PRODUTOS_SEED, STAFF } from "../lib/data";

interface PubState {
  mesas: Mesa[];
  produtos: Produto[];
  categorias: Categoria[];
  sessoes: Sessao[];
  pedidos: Pedido[];
  eventos: Evento[];
  auth: { role: Role; nome: string } | null;
  somLigado: boolean;
  seqPedido: number;
  seqSessao: number;
  seqPagamento: number;
  seqEvento: number;
  seqCategoria: number;

  /* cliente / mesa */
  criarPedido: (mesaId: number, clienteNome: string, itens: ItemPedido[]) => number | null;
  cancelarPedido: (pedidoId: number) => boolean;
  editarPedido: (pedidoId: number, itens: ItemPedido[]) => boolean;
  informarPix: (mesaId: number) => void;

  /* cozinha */
  aceitarPedido: (pedidoId: number) => void;
  concluirPedido: (pedidoId: number) => void;

  /* garçom */
  entregarPedido: (pedidoId: number) => void;

  /* caixa */
  registrarPagamento: (sessaoId: number, valor: number, forma: FormaPagamento) => void;
  setDesconto: (sessaoId: number, valor: number) => void;
  setTaxa: (sessaoId: number, valor: number) => void;
  fecharSessao: (sessaoId: number, forma: FormaPagamento) => void;

  /* admin */
  upsertProduto: (p: Produto) => void;
  removerProduto: (id: number) => void;
  toggleProduto: (id: number) => void;
  ajustarEstoque: (id: number, delta: number) => void;
  addCategoria: (nome: string) => void;
  renameCategoria: (id: number, nome: string) => void;
  removeCategoria: (id: number) => void;
  moverCategoria: (id: number, delta: -1 | 1) => void;
  setCategoriasOrdem: (ids: number[]) => void;

  /* auth + som */
  login: (usuario: string, senha: string) => Role | null;
  logout: () => void;
  toggleSom: () => void;
  limparEventos: () => void;
}

const emit = (get: () => PubState, set: (p: Partial<PubState>) => void, tipo: EventoTipo, texto: string, mesaNome?: string) => {
  const seqEvento = get().seqEvento + 1;
  const eventos = [...get().eventos, { seq: seqEvento, tipo, texto, mesaNome, em: Date.now() }].slice(-40);
  set({ eventos, seqEvento });
};

const sessaoAberta = (sessoes: Sessao[], mesaId: number) =>
  sessoes.find((s) => s.mesaId === mesaId && s.status === "aberta");

/* ---- cenário demo inicial: casa em movimento ---- */
const agora = Date.now();
const seedSessoes: Sessao[] = [
  { id: 41, mesaId: 2, mesaNome: "Mesa 02", status: "aberta", abertaEm: agora - 1000 * 60 * 34, fechadaEm: null, pagamentos: [], pixAvisos: 0, desconto: 0, taxa: 0 },
  { id: 42, mesaId: 5, mesaNome: "Mesa 05", status: "aberta", abertaEm: agora - 1000 * 60 * 52, fechadaEm: null, pagamentos: [{ id: 1, valor: 25, forma: "pix", criadoEm: agora - 1000 * 60 * 10 }], pixAvisos: 1, desconto: 0, taxa: 0 },
  { id: 40, mesaId: 7, mesaNome: "Mesa 07", status: "fechada", abertaEm: agora - 1000 * 60 * 148, fechadaEm: agora - 1000 * 60 * 96, pagamentos: [{ id: 0, valor: 63, forma: "credito", criadoEm: agora - 1000 * 60 * 96 }], pixAvisos: 0, desconto: 0, taxa: 0 },
];

const item = (
  produtoId: number,
  nome: string,
  qtd: number,
  precoBase: number,
  adicionais: { id: string; nome: string; preco: number }[] = [],
  removidos: string[] = [],
  escolha: { id: string; nome: string; preco: number } | null = null,
  obs = ""
): ItemPedido => {
  const soma = adicionais.reduce((a, b) => a + b.preco, 0) + (escolha ? escolha.preco : 0);
  return {
    id: Math.random().toString(36).slice(2, 9),
    produtoId, nome, qtd, precoBase, adicionais, removidos, escolha, obs,
    totalUnit: precoBase + soma,
  };
};

const seedPedidos: Pedido[] = [
  {
    id: 96, sessaoId: 41, mesaId: 2, mesaNome: "Mesa 02", clienteNome: "Alpha",
    itens: [item(1, "Major Smash duplo", 1, 32, [{ id: "a1", nome: "Bacon crocante", preco: 5 }], ["Cebola"])],
    status: "na_fila", criadoEm: agora - 1000 * 60 * 12,
    total: 37,
  },
  {
    id: 97, sessaoId: 42, mesaId: 5, mesaNome: "Mesa 05", clienteNome: "Renata",
    itens: [
      item(2, "Clássico da casa", 2, 27),
      item(8, "Chopp da casa", 2, 9, [], [], { id: "a16", nome: "Caneca 500ml", preco: 4 }),
    ],
    status: "na_fila", criadoEm: agora - 1000 * 60 * 22,
    total: 80,
  },
  {
    id: 98, sessaoId: 42, mesaId: 5, mesaNome: "Mesa 05", clienteNome: "Caio",
    itens: [item(5, "Batata rústica da casa", 1, 22, [{ id: "a13", nome: "Cheddar em creme", preco: 6 }])],
    status: "entregue", criadoEm: agora - 1000 * 60 * 40,
    total: 28,
  },
  {
    id: 95, sessaoId: 40, mesaId: 7, mesaNome: "Mesa 07", clienteNome: "Bruno",
    itens: [
      item(2, "Clássico da casa", 1, 27),
      item(9, "Refrigerante", 2, 6, [], [], { id: "a18", nome: "Lata 350ml", preco: 0 }),
      item(11, "Brownie vulcão", 1, 18, [{ id: "a23", nome: "Bola de sorvete", preco: 7 }]),
    ],
    status: "entregue", criadoEm: agora - 1000 * 60 * 140,
    total: 64,
  },
];

export const usePub = create<PubState>((set, get) => ({
  mesas: MESAS_SEED,
  produtos: PRODUTOS_SEED,
  categorias: CATEGORIAS_SEED.map((c) => ({ ...c })),
  sessoes: seedSessoes,
  pedidos: seedPedidos,
  eventos: [],
  auth: JSON.parse(sessionStorage.getItem("pub-auth") || "null"),
  somLigado: true,
  seqPedido: 99,
  seqSessao: 42,
  seqPagamento: 2,
  seqEvento: 0,
  seqCategoria: 4,

  criarPedido: (mesaId, clienteNome, itens) => {
    if (!itens.length) return null;
    const st = get();
    const mesa = st.mesas.find((m) => m.id === mesaId);
    if (!mesa) return null;

    // produto indisponível / estoque zerado
    if (itens.some((i) => {
      const p = st.produtos.find((x) => x.id === i.produtoId);
      return !p || !p.ativo || (p.estoque !== null && p.estoque <= 0);
    })) return null;

    let sessoes = [...st.sessoes];
    let seqSessao = st.seqSessao;
    let s = sessaoAberta(sessoes, mesaId);
    if (!s) {
      seqSessao += 1;
      s = { id: seqSessao, mesaId, mesaNome: mesa.nome, status: "aberta", abertaEm: Date.now(), fechadaEm: null, pagamentos: [], pixAvisos: 0, desconto: 0, taxa: 0 };
      sessoes.push(s);
      emit(get, set, "sessao-fechada", `${mesa.nome} abriu conta`, mesa.nome);
    }

    const id = st.seqPedido + 1;
    const total = itens.reduce((a, i) => a + i.totalUnit * i.qtd, 0);
    const pedido: Pedido = {
      id, sessaoId: s.id, mesaId, mesaNome: mesa.nome,
      clienteNome: clienteNome.trim() || "Cliente",
      itens, status: "na_fila", criadoEm: Date.now(), total,
    };

    // baixa de estoque
    const produtos = st.produtos.map((p) => {
      const usados = itens.filter((i) => i.produtoId === p.id).reduce((a, i) => a + i.qtd, 0);
      if (!usados) return p;
      return {
        ...p,
        estoque: p.estoque === null ? null : Math.max(0, p.estoque - usados),
        vendidos: p.vendidos + usados,
      };
    });

    set({ pedidos: [...st.pedidos, pedido], sessoes, seqPedido: id, produtos });
    emit(get, set, "pedido-novo", `Pedido novo · ${mesa.nome} · ${pedido.clienteNome}`, mesa.nome);
    return id;
  },

  informarPix: (mesaId) => {
    const st = get();
    const s = sessaoAberta(st.sessoes, mesaId);
    if (!s) return;
    const sessoes = st.sessoes.map((x) => (x.id === s.id ? { ...x, pixAvisos: x.pixAvisos + 1 } : x));
    set({ sessoes });
    emit(get, set, "pix-avisado", `PIX informado na ${s.mesaNome}`, s.mesaNome);
  },

  cancelarPedido: (pedidoId) => {
    const st = get();
    const p = st.pedidos.find((x) => x.id === pedidoId);
    if (!p || p.status !== "na_fila") return false;
    set({ pedidos: st.pedidos.filter((x) => x.id !== pedidoId) });
    emit(get, set, "pedido-cancelado", `Pedido #${pedidoId} cancelado · ${p.mesaNome}`, p.mesaNome);
    return true;
  },
  editarPedido: (pedidoId, itens) => {
    const st = get();
    const p = st.pedidos.find((x) => x.id === pedidoId);
    if (!p || p.status !== "na_fila") return false;
    const total = itens.reduce((a, i) => a + i.totalUnit * i.qtd, 0);
    set({
      pedidos: st.pedidos.map((x) => (x.id === pedidoId ? { ...x, itens, total } : x)),
    });
    return true;
  },

  aceitarPedido: (pedidoId) => {
    const st = get();
    const p = st.pedidos.find((x) => x.id === pedidoId);
    if (!p || p.status !== "na_fila") return;
    set({ pedidos: st.pedidos.map((x) => (x.id === pedidoId ? { ...x, status: "em_producao" } : x)) });
    emit(get, set, "pedido-aceito", `${p.mesaNome} em produção`, p.mesaNome);
  },

  concluirPedido: (pedidoId) => {
    const st = get();
    const p = st.pedidos.find((x) => x.id === pedidoId);
    if (!p || p.status !== "em_producao") return;
    set({ pedidos: st.pedidos.map((x) => (x.id === pedidoId ? { ...x, status: "pronto" } : x)) });
    emit(get, set, "pedido-pronto", `Pronto para entrega · ${p.mesaNome}`, p.mesaNome);
  },

  entregarPedido: (pedidoId) => {
    const st = get();
    const p = st.pedidos.find((x) => x.id === pedidoId);
    if (!p || p.status !== "pronto") return;
    set({ pedidos: st.pedidos.map((x) => (x.id === pedidoId ? { ...x, status: "entregue" } : x)) });
    emit(get, set, "pedido-entregue", `Entregue na ${p.mesaNome}`, p.mesaNome);
  },

  registrarPagamento: (sessaoId, valor, forma) => {
    const st = get();
    if (valor <= 0) return;
    const s = st.sessoes.find((x) => x.id === sessaoId && x.status === "aberta");
    if (!s) return;
    const pag: Pagamento = { id: st.seqPagamento, valor, forma, criadoEm: Date.now() };
    const sessoes = st.sessoes.map((x) => (x.id === sessaoId ? { ...x, pagamentos: [...x.pagamentos, pag] } : x));
    set({ sessoes, seqPagamento: st.seqPagamento + 1 });
    emit(get, set, "sessao-fechada", `Pagamento parcial · ${s.mesaNome}`, s.mesaNome);
  },

  setDesconto: (sessaoId, valor) =>
    set({ sessoes: get().sessoes.map((s) => (s.id === sessaoId ? { ...s, desconto: Math.max(0, valor) } : s)) }),
  setTaxa: (sessaoId, valor) =>
    set({ sessoes: get().sessoes.map((s) => (s.id === sessaoId ? { ...s, taxa: Math.max(0, valor) } : s)) }),

  fecharSessao: (sessaoId, forma) => {
    const st = get();
    const s = st.sessoes.find((x) => x.id === sessaoId && x.status === "aberta");
    if (!s) return;
    const total = totalSessao(st.pedidos, sessaoId) - s.desconto + s.taxa;
    const pago = s.pagamentos.reduce((a, p) => a + p.valor, 0);
    const restante = Math.max(0, total - pago);
    let pagamentos = [...s.pagamentos];
    let seqPagamento = st.seqPagamento;
    if (restante > 0.004) {
      pagamentos = [...pagamentos, { id: seqPagamento, valor: restante, forma, criadoEm: Date.now() }];
      seqPagamento += 1;
    }
    const sessoes = st.sessoes.map((x) =>
      x.id === sessaoId ? { ...x, status: "fechada" as const, fechadaEm: Date.now(), pagamentos } : x
    );
    set({ sessoes, seqPagamento });
    emit(get, set, "sessao-fechada", `${s.mesaNome} fechada · mesa liberada`, s.mesaNome);
  },

  upsertProduto: (p) => {
    const st = get();
    const existe = st.produtos.some((x) => x.id === p.id);
    const produtos = existe ? st.produtos.map((x) => (x.id === p.id ? p : x)) : [...st.produtos, p];
    set({ produtos });
  },
  removerProduto: (id) => set({ produtos: get().produtos.filter((p) => p.id !== id) }),
  toggleProduto: (id) =>
    set({ produtos: get().produtos.map((p) => (p.id === id ? { ...p, ativo: !p.ativo } : p)) }),
  ajustarEstoque: (id, delta) =>
    set({
      produtos: get().produtos.map((p) =>
        p.id === id && p.estoque !== null ? { ...p, estoque: Math.max(0, p.estoque + delta) } : p
      ),
    }),

  addCategoria: (nome) => {
    const n = nome.trim();
    if (!n) return;
    const st = get();
    if (st.categorias.some((c) => c.nome.toLowerCase() === n.toLowerCase())) return;
    const seqCategoria = st.seqCategoria + 1;
    const ordem = st.categorias.length ? Math.max(...st.categorias.map((c) => c.ordem)) + 1 : 0;
    set({
      categorias: [...st.categorias, { id: seqCategoria, nome: n, ordem }],
      seqCategoria,
    });
  },
  renameCategoria: (id, nome) => {
    const n = nome.trim();
    if (!n) return;
    const st = get();
    const oldCat = st.categorias.find((c) => c.id === id);
    if (!oldCat || oldCat.nome === n) return;
    const categorias = st.categorias.map((c) => (c.id === id ? { ...c, nome: n } : c));
    const produtos = st.produtos.map((p) => (p.categoria === oldCat.nome ? { ...p, categoria: n } : p));
    set({ categorias, produtos });
  },
  removeCategoria: (id) => {
    const st = get();
    const cat = st.categorias.find((c) => c.id === id);
    if (!cat) return;
    if (st.produtos.some((p) => p.categoria === cat.nome)) return;
    set({ categorias: st.categorias.filter((c) => c.id !== id) });
  },
  moverCategoria: (id, delta) => {
    const st = get();
    const sorted = [...st.categorias].sort((a, b) => a.ordem - b.ordem);
    const idx = sorted.findIndex((c) => c.id === id);
    const j = idx + delta;
    if (idx < 0 || j < 0 || j >= sorted.length) return;
    const ids = sorted.map((c) => c.id);
    const tmp = ids[idx];
    ids[idx] = ids[j];
    ids[j] = tmp;
    const categorias = st.categorias.map((c) => ({ ...c, ordem: ids.indexOf(c.id) }));
    set({ categorias });
  },
  setCategoriasOrdem: (ids) => {
    const st = get();
    const categorias = st.categorias.map((c) => {
      const i = ids.indexOf(c.id);
      return { ...c, ordem: i >= 0 ? i : c.ordem };
    });
    set({ categorias });
  },

  login: (usuario, senha) => {
    const r = STAFF[usuario.trim().toLowerCase()];
    if (!r || r.senha !== senha) return null;
    const auth = { role: r.role, nome: r.nome };
    sessionStorage.setItem("pub-auth", JSON.stringify(auth));
    set({ auth });
    return r.role;
  },
  logout: () => {
    sessionStorage.removeItem("pub-auth");
    set({ auth: null });
  },
  toggleSom: () => set({ somLigado: !get().somLigado }),
  limparEventos: () => set({ eventos: [] }),
}));

/* ---------- seletores ---------- */
export const totalSessao = (pedidos: Pedido[], sessaoId: number) =>
  pedidos.filter((p) => p.sessaoId === sessaoId).reduce((a, p) => a + p.total, 0);

export const pagoSessao = (s: Sessao) => s.pagamentos.reduce((a, p) => a + p.valor, 0);

export const sessaoDaMesa = (sessoes: Sessao[], mesaId: number) => sessaoAberta(sessoes, mesaId);

export const FORMAS: { id: FormaPagamento; label: string }[] = [
  { id: "pix", label: "PIX" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "credito", label: "Crédito" },
  { id: "debito", label: "Débito" },
];

/* faturamento dos últimos 7 dias (histórico + hoje ao vivo) */
export function faturamentoSemana(sessoes: Sessao[]): { dia: string; valor: number }[] {
  const base = [1820, 2140, 1660, 2480, 2890, 3420, 0];
  const hoje = sessoes
    .filter((s) => s.status === "fechada")
    .reduce((a, s) => a + pagoSessao(s), 0);
  const abertas = sessoes
    .filter((s) => s.status === "aberta")
    .reduce((a, s) => a + pagoSessao(s), 0);
  const dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Hoje"];
  return base.map((v, i) => ({ dia: dias[i], valor: i === 6 ? 620 + hoje + abertas : v }));
}
