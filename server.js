require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const { getCardapio, invalidarCardapio } = require('./db/cardapio');
const {
  criarPedido,
  avancarStatus,
  getSessao,
  getFilaCozinha,
  getFilaGarcom,
  checkinCliente,
  ErroPedido,
} = require('./db/pedidos');
const {
  ErroAdmin,
  listMesas,
  getCardapioAdmin,
  criarCategoria,
  atualizarCategoria,
  criarProduto,
  atualizarProduto,
  criarAdicional,
  removerAdicional,
  setRemoviveis,
} = require('./db/admin');
const {
  listSessoesAbertas,
  fecharSessao,
  ErroCaixa,
} = require('./db/caixa');
const {
  login,
  logout,
  requireAuth,
  ErroAuth,
} = require('./db/auth');
const { golpePermitido } = require('./db/rateLimit');
const { subscribe, broadcast } = require('./db/events');
const {
  ErroGarcom,
  listGarcons,
  criarGarcom,
  setGarcomAtivo,
  removerGarcom,
  getGarcomPorToken,
  entregarComoGarcom,
  listPedidosRecentes,
} = require('./db/garcons');

// NOTE: truncated intentionally - use full file from local
