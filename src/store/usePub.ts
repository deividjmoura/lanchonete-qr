import { create } from "zustand";
import type {
  Categoria,
  Evento,
  EventoTipo,
  FormaPagamento,
  ItemPedido,
  Mesa,
  Pedido,
  Produto,
  Role,
  Sessao,
} from "../lib/types";
import { api } from "../lib/api";
import {
  itensToApiBody,
  mapCaixaSessoes,
  mapCardapio,
  mapCozinhaPedidos,
  mapMesas,
  mapSessaoFromMesaApi,
  statusToApi,
} from "../lib/mappers";

interface PubState {
  mesas: Mesa[];
  produtos: Produto[];
  categorias: Categoria[];
  sessoes: Sessao[];
  pedidos: Pedido[];
  eventos: Evento[];
  auth: { role: Role; nome: string } | null;
  somLigado: boolean;
  loading: boolean;
  apiReady: boolean;
  lastError: string | null;
  seqEvento: number;

  /* bootstrap / refresh */
  hydrateCardapio: () => Promise<void>;
  hydrateMesas: () => Promise<void>;
  hydrateMesaToken: (token: string) => Promise<void>;
  hydrateCozinha: () => Promise<void>;
  hydrateGarcom: (token: string) => Promise<void>;
  hydrateCaixa: () => Promise<void>;
  hydrateMe: () => Promise<void>;

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

  /* admin (local + best-effort API depois) */
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
  loginApi: (usuario: string, senha: string) => Promise<Role | null>;
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

function formaToApi(forma: FormaPagamento): string {
  if (forma === "credito") return "cartao_credito";
  if (forma === "debito") return "cartao_debito";
  return forma;
}

function mesaToken(get: () => PubState, mesaId: number): string | null {
  return get().mesas.find((m) => m.id === mesaId)?.token || null;
}

function tokenByPedido(get: () => PubState, pedidoId: number): string | null {
  const p = get().pedidos.find((x) => x.id === pedidoId);
  if (!p) return null;
  return mesaToken(get, p.mesaId);
}

export const usePub = create<PubState>((set, get) => ({
  mesas: [],
  produtos: [],
  categorias: [],
  sessoes: [],
  pedidos: [],
  eventos: [],
  auth: JSON.parse(sessionStorage.getItem("pub-auth") || "null"),
  somLigado: true,
  loading: false,
  apiReady: false,
  lastError: null,
  seqEvento: 0,

  hydrateCardapio: async () => {
    try {
      const raw = await api.cardapio();
      const { categorias, produtos } = mapCardapio(raw);
      set({ categorias, produtos, apiReady: true, lastError: null });
    } catch (e: any) {
      set({ lastError: e.message || "Falha ao carregar cardápio" });
    }
  },

  hydrateMesas: async () => {
    try {
      let rows: any[];
      try {
        rows = await api.mesasPublic();
      } catch {
        rows = await api.adminMesas();
      }
      set({ mesas: mapMesas(rows), lastError: null });
    } catch (e: any) {
      set({ lastError: e.message || "Falha ao carregar mesas" });
    }
  },

  hydrateMesaToken: async (token: string) => {
    try {
      set({ loading: true });
      const [card, sess] = await Promise.all([api.cardapio(), api.mesaSessao(token)]);
      const { categorias, produtos } = mapCardapio(card);

      let mesas = get().mesas;
      let mesa = mesas.find((m) => m.token === token);
      if (!mesa) {
        /* monta mesa mínima a partir da sessão */
        const numero = Number(sess.mesa) || 0;
        mesa = {
          id: numero || Date.now(),
          numero,
          token,
          nome: `Mesa ${String(numero).padStart(2, "0")}`,
        };
        mesas = [...mesas.filter((m) => m.token !== token), mesa];
      }

      const { sessao, pedidos } = mapSessaoFromMesaApi(token, mesa, sess);
      const otherSessoes = get().sessoes.filter((s) => s.mesaId !== mesa!.id);
      const otherPedidos = get().pedidos.filter((p) => p.mesaId !== mesa!.id);

      set({
        categorias,
        produtos,
        mesas,
        sessoes: sessao ? [...otherSessoes, sessao] : otherSessoes,
        pedidos: [...otherPedidos, ...pedidos],
        loading: false,
        apiReady: true,
        lastError: null,
      });
    } catch (e: any) {
      set({ loading: false, lastError: e.message || "Falha ao carregar mesa" });
    }
  },

  hydrateCozinha: async () => {
    try {
      const rows = await api.cozinhaPedidos();
      const cozinha = mapCozinhaPedidos(rows);
      /* mantém pedidos de outras origens (mesa) que não estão na fila */
      const ids = new Set(cozinha.map((p) => p.id));
      const rest = get().pedidos.filter((p) => !ids.has(p.id) && p.status === "entregue");
      set({ pedidos: [...cozinha, ...rest], lastError: null });
    } catch (e: any) {
      set({ lastError: e.message || "Falha ao carregar cozinha" });
    }
  },

  hydrateGarcom: async (token: string) => {
    try {
      const rows = await api.garcomPedidos(token);
      const prontos = mapCozinhaPedidos(rows).map((p) => ({ ...p, status: "pronto" as const }));
      const others = get().pedidos.filter((p) => p.status !== "pronto");
      set({ pedidos: [...prontos, ...others], lastError: null });
    } catch (e: any) {
      set({ lastError: e.message || "Falha ao carregar fila do garçom" });
    }
  },

  hydrateCaixa: async () => {
    try {
      const rows = await api.caixaSessoes();
      const { sessoes, pedidos } = mapCaixaSessoes(rows);
      set({ sessoes, pedidos, lastError: null });
    } catch (e: any) {
      set({ lastError: e.message || "Falha ao carregar caixa" });
    }
  },

  hydrateMe: async () => {
    try {
      const me = await api.me();
      if (me && me.papel) {
        const auth = { role: me.papel as Role, nome: me.nome || me.papel };
        sessionStorage.setItem("pub-auth", JSON.stringify(auth));
        set({ auth });
      }
    } catch (_) {
      /* anônimo ok */
    }
  },

  criarPedido: (mesaId, clienteNome, itens) => {
    if (!itens.length) return null;
    const token = mesaToken(get, mesaId);
    if (!token) {
      set({ lastError: "Mesa sem token — recarregue a página" });
      return null;
    }
    const tempId = -Date.now();
    /* otimista: UI responde; API confirma em seguida */
    void (async () => {
      try {
        if (clienteNome) await api.checkin(token, clienteNome).catch(() => null);
        await api.criarPedido(token, {
          clienteNome,
          items: itensToApiBody(itens),
          note: "",
        });
        emit(get, set, "pedido-novo", `Novo pedido · ${clienteNome || "cliente"}`, get().mesas.find((m) => m.id === mesaId)?.nome);
        await get().hydrateMesaToken(token);
      } catch (e: any) {
        set({ lastError: e.message || "Erro ao enviar pedido" });
        alert(e.message || "Erro ao enviar pedido");
      }
    })();
    return tempId;
  },

  cancelarPedido: (pedidoId) => {
    const token = tokenByPedido(get, pedidoId);
    if (!token) return false;
    void (async () => {
      try {
        await api.cancelarPedido(token, pedidoId);
        emit(get, set, "pedido-cancelado", `Pedido #${pedidoId} cancelado`);
        await get().hydrateMesaToken(token);
      } catch (e: any) {
        alert(e.message || "Não foi possível cancelar");
      }
    })();
    return true;
  },

  editarPedido: (pedidoId, itens) => {
    const token = tokenByPedido(get, pedidoId);
    if (!token || !itens.length) return false;
    void (async () => {
      try {
        await api.editarPedido(token, pedidoId, { items: itensToApiBody(itens), note: "" });
        await get().hydrateMesaToken(token);
      } catch (e: any) {
        alert(e.message || "Não foi possível editar");
      }
    })();
    return true;
  },

  informarPix: (mesaId) => {
    const token = mesaToken(get, mesaId);
    if (!token) return;
    void (async () => {
      try {
        await api.pixInformado(token, {});
        emit(get, set, "pix-avisado", "Cliente avisou PIX", get().mesas.find((m) => m.id === mesaId)?.nome);
        await get().hydrateMesaToken(token);
      } catch (e: any) {
        alert(e.message || "Erro ao avisar PIX");
      }
    })();
  },

  aceitarPedido: (pedidoId) => {
    void (async () => {
      try {
        await api.statusPedido(pedidoId, statusToApi("em_producao"));
        emit(get, set, "pedido-aceito", `Pedido #${pedidoId} em produção`);
        await get().hydrateCozinha();
      } catch (e: any) {
        alert(e.message || "Erro ao aceitar");
      }
    })();
  },

  concluirPedido: (pedidoId) => {
    void (async () => {
      try {
        await api.statusPedido(pedidoId, statusToApi("pronto"));
        emit(get, set, "pedido-pronto", `Pedido #${pedidoId} pronto`);
        await get().hydrateCozinha();
      } catch (e: any) {
        alert(e.message || "Erro ao concluir");
      }
    })();
  },

  entregarPedido: (pedidoId) => {
    void (async () => {
      try {
        await api.statusPedido(pedidoId, statusToApi("entregue"));
        emit(get, set, "pedido-entregue", `Pedido #${pedidoId} entregue`);
        await get().hydrateCozinha();
        await get().hydrateCaixa().catch(() => null);
      } catch (e: any) {
        alert(e.message || "Erro ao entregar");
      }
    })();
  },

  registrarPagamento: (sessaoId, valor, forma) => {
    void (async () => {
      try {
        await api.registrarPagamento(sessaoId, valor, formaToApi(forma));
        await get().hydrateCaixa();
      } catch (e: any) {
        alert(e.message || "Erro no pagamento");
      }
    })();
  },

  setDesconto: (sessaoId, valor) => {
    set({
      sessoes: get().sessoes.map((s) => (s.id === sessaoId ? { ...s, desconto: Math.max(0, valor) } : s)),
    });
  },
  setTaxa: (sessaoId, valor) => {
    set({
      sessoes: get().sessoes.map((s) => (s.id === sessaoId ? { ...s, taxa: Math.max(0, valor) } : s)),
    });
  },

  fecharSessao: (sessaoId, forma) => {
    void (async () => {
      try {
        const s = get().sessoes.find((x) => x.id === sessaoId);
        await api.fecharSessao(sessaoId, {
          formaPagamento: formaToApi(forma),
          desconto: s?.desconto || 0,
          taxaServico: s?.taxa || 0,
        });
        emit(get, set, "sessao-fechada", `Sessão #${sessaoId} fechada`, s?.mesaNome);
        await get().hydrateCaixa();
        await get().hydrateMesas().catch(() => null);
      } catch (e: any) {
        alert(e.message || "Erro ao fechar conta");
      }
    })();
  },

  /* admin local até plugar CRUD completo */
  upsertProduto: (p) => {
    const st = get();
    const i = st.produtos.findIndex((x) => x.id === p.id);
    if (i >= 0) {
      const produtos = st.produtos.slice();
      produtos[i] = p;
      set({ produtos });
    } else set({ produtos: [...st.produtos, p] });
  },
  removerProduto: (id) => set({ produtos: get().produtos.filter((p) => p.id !== id) }),
  toggleProduto: (id) =>
    set({
      produtos: get().produtos.map((p) => (p.id === id ? { ...p, ativo: !p.ativo } : p)),
    }),
  ajustarEstoque: (id, delta) =>
    set({
      produtos: get().produtos.map((p) =>
        p.id === id && p.estoque != null ? { ...p, estoque: Math.max(0, p.estoque + delta) } : p
      ),
    }),
  addCategoria: (nome) => {
    const n = nome.trim();
    if (!n) return;
    const st = get();
    if (st.categorias.some((c) => c.nome.toLowerCase() === n.toLowerCase())) return;
    const id = Math.max(0, ...st.categorias.map((c) => c.id)) + 1;
    set({ categorias: [...st.categorias, { id, nome: n, ordem: st.categorias.length }] });
  },
  renameCategoria: (id, nome) => {
    const n = nome.trim();
    if (!n) return;
    const st = get();
    const old = st.categorias.find((c) => c.id === id);
    if (!old) return;
    set({
      categorias: st.categorias.map((c) => (c.id === id ? { ...c, nome: n } : c)),
      produtos: st.produtos.map((p) => (p.categoria === old.nome ? { ...p, categoria: n } : p)),
    });
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
    set({ categorias: st.categorias.map((c) => ({ ...c, ordem: ids.indexOf(c.id) })) });
  },
  setCategoriasOrdem: (ids) => {
    const st = get();
    set({
      categorias: st.categorias.map((c) => {
        const i = ids.indexOf(c.id);
        return { ...c, ordem: i >= 0 ? i : c.ordem };
      }),
    });
  },

  login: (usuario, senha) => {
    /* compat: preferir loginApi no Login.tsx */
    return null;
  },
  loginApi: async (usuario: string, senha: string): Promise<Role | null> => {
    try {
      const out = await api.login(usuario, senha);
      const r = (out.staff?.papel || "") as Role;
      if (!r) return null;
      const auth = { role: r, nome: out.staff?.nome || r };
      sessionStorage.setItem("pub-auth", JSON.stringify(auth));
      set({ auth, lastError: null });
      return r;
    } catch (e: any) {
      set({ lastError: e.message || "Login inválido" });
      return null;
    }
  },


  logout: () => {
    void api.logout().catch(() => null);
    sessionStorage.removeItem("pub-auth");
    set({ auth: null });
  },
  toggleSom: () => set({ somLigado: !get().somLigado }),
  limparEventos: () => set({ eventos: [] }),
}));

/* ---------- seletores ---------- */
export const totalSessao = (pedidos: Pedido[], sessaoId: number) =>
  pedidos.filter((p) => p.sessaoId === sessaoId && p.status === "entregue").reduce((a, p) => a + p.total, 0);

export const pagoSessao = (s: Sessao) => s.pagamentos.reduce((a, p) => a + p.valor, 0);

export const sessaoDaMesa = (sessoes: Sessao[], mesaId: number) => sessaoAberta(sessoes, mesaId);

export const FORMAS: { id: FormaPagamento; label: string }[] = [
  { id: "pix", label: "PIX" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "credito", label: "Crédito" },
  { id: "debito", label: "Débito" },
];

export function faturamentoSemana(sessoes: Sessao[]): { dia: string; valor: number }[] {
  const base = [0, 0, 0, 0, 0, 0, 0];
  const hoje = sessoes.filter((s) => s.status === "fechada").reduce((a, s) => a + pagoSessao(s), 0);
  const abertas = sessoes.filter((s) => s.status === "aberta").reduce((a, s) => a + pagoSessao(s), 0);
  const dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Hoje"];
  return base.map((v, i) => ({ dia: dias[i], valor: i === 6 ? hoje + abertas : v }));
}
