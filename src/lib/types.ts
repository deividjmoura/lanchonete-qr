/* Modelo de domínio — espelha as entidades do sistema (mesa, sessão, pedido…)
   sem alterar o comportamento original. */

export type Role = "admin" | "cozinha" | "caixa";

export interface Opcao {
  id: string;
  nome: string;
  preco: number; // acréscimo em R$
}

export interface Removivel {
  id: string;
  nome: string;
}

export type TipoProduto = "simples" | "personalizavel" | "escolher";

export interface Produto {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  categoria: string;
  foto: string;
  tipo: TipoProduto;
  adicionais: Opcao[]; // multi-seleção
  removiveis: Removivel[]; // toggles "sem X"
  ativo: boolean;
  estoque: number | null; // null = não controla
  vendidos: number;
}

export interface ItemPedido {
  id: string;
  produtoId: number;
  nome: string;
  qtd: number;
  precoBase: number;
  adicionais: Opcao[];
  removidos: string[];
  escolha: Opcao | null;
  obs: string;
  totalUnit: number; // (base + adicionais + escolha)
}

export type PedidoStatus = "na_fila" | "em_producao" | "pronto" | "entregue";

export interface Pedido {
  id: number;
  sessaoId: number;
  mesaId: number;
  mesaNome: string;
  clienteNome: string;
  itens: ItemPedido[];
  status: PedidoStatus;
  criadoEm: number;
  total: number;
}

export type FormaPagamento = "pix" | "dinheiro" | "credito" | "debito";

export interface Pagamento {
  id: number;
  valor: number;
  forma: FormaPagamento;
  criadoEm: number;
}

export type SessaoStatus = "aberta" | "fechada";

export interface Sessao {
  id: number;
  mesaId: number;
  mesaNome: string;
  status: SessaoStatus;
  abertaEm: number;
  fechadaEm: number | null;
  pagamentos: Pagamento[];
  pixAvisos: number;
  desconto: number; // R$
  taxa: number; // R$
}

export interface Mesa {
  id: number;
  numero: number;
  token: string;
  nome: string;
}

export type EventoTipo =
  | "pedido-novo"
  | "pedido-aceito"
  | "pedido-pronto"
  | "pedido-entregue"
  | "pix-avisado"
  | "sessao-fechada";

export interface Evento {
  seq: number;
  tipo: EventoTipo;
  texto: string;
  mesaNome?: string;
  em: number;
}

export interface PixConfig {
  chave: string;
  nome: string;
  cidade: string;
}
