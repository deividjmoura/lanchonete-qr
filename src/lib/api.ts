/** Cliente HTTP para a API Node (server.js). credentials: include para cookie de staff. */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.error) || res.statusText || "Erro na API");
  }
  return data;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  return parse(res) as Promise<T>;
}

export async function apiSend<T = unknown>(
  path: string,
  method: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse(res) as Promise<T>;
}

export const api = {
  cardapio: () => apiGet<any[]>("/api/cardapio"),
  login: (usuario: string, senha: string) =>
    apiSend<{ ok?: boolean; staff?: { papel: string; nome?: string; login?: string }; home?: string }>(
      "/api/login",
      "POST",
      { usuario, senha }
    ),
  logout: () => apiSend("/api/logout", "POST"),
  me: () => apiGet<{ id?: number; papel?: string; nome?: string; login?: string }>("/api/me"),

  mesaSessao: (token: string) => apiGet<any>(`/api/mesas/${token}/sessao`),
  checkin: (token: string, clienteNome: string) =>
    apiSend(`/api/mesas/${token}/checkin`, "POST", { clienteNome }),
  criarPedido: (token: string, body: unknown) =>
    apiSend(`/api/mesas/${token}/pedidos`, "POST", body),
  cancelarPedido: (token: string, pedidoId: number) =>
    apiSend(`/api/mesas/${token}/pedidos/${pedidoId}`, "DELETE"),
  editarPedido: (token: string, pedidoId: number, body: unknown) =>
    apiSend(`/api/mesas/${token}/pedidos/${pedidoId}`, "PUT", body),
  pixInformado: (token: string, body?: unknown) =>
    apiSend(`/api/mesas/${token}/pix-informado`, "POST", body || {}),

  statusPedido: (pedidoId: number, status: string) =>
    apiSend(`/api/pedidos/${pedidoId}/status`, "PATCH", { status }),

  cozinhaPedidos: () => apiGet<any[]>("/api/cozinha/pedidos"),
  garcomPedidos: (token: string) => apiGet<any[]>(`/api/garcom/${token}/pedidos`),
  garcomEntregar: (token: string, pedidoId: number) =>
    apiSend(`/api/garcom/${token}/pedidos/${pedidoId}/entregar`, "POST", {}),

  caixaSessoes: () => apiGet<any[]>("/api/caixa/sessoes"),
  registrarPagamento: (sessaoId: number, valor: number, formaPagamento: string) =>
    apiSend(`/api/caixa/sessoes/${sessaoId}/pagamentos`, "POST", { valor, formaPagamento }),
  fecharSessao: (sessaoId: number, body?: unknown) =>
    apiSend(`/api/caixa/sessoes/${sessaoId}/fechar`, "POST", body || {}),

  adminMesas: () => apiGet<any[]>("/api/admin/mesas"),
  adminCardapio: () => apiGet<any[]>("/api/admin/cardapio"),
  adminDashboard: () => apiGet<any>("/api/admin/dashboard"),
};

/** SSE — invalida/recarrega quando o servidor emite update. */
export function connectEvents(onUpdate: () => void): () => void {
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const bounce = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onUpdate(), 200);
  };
  try {
    es = new EventSource("/api/events");
    es.addEventListener("update", bounce);
    es.onerror = () => {
      /* browser reconecta sozinho */
    };
  } catch (_) {
    /* ignore */
  }
  return () => {
    if (timer) clearTimeout(timer);
    if (es) es.close();
  };
}
