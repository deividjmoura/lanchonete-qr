<div align="center">

# 🗺️ Roadmap — Lanchonete QR

Progresso do sistema de pedidos por QR Code  
`Cliente → Cozinha → Garçom → Caixa`

</div>

---

## 📊 Visão geral

```text
v2.0 ████████████████████  MVP + Postgres          ✅
v2.1 ████████████████████  Auth + SSE              ✅
v2.2 ████████████████████  Dashboard + kanban      ✅
v2.3 ████████████████████  Relatório PDF + purge   ✅
v2.4 ████████████████████  Estoque                 ✅
v2.5 ████████████████████  Desconto / taxa / foto  ✅
v2.6 ████████████████████  PIX mesa + caixa        ✅
v2.6+████████████████████  Escolher (bebidas)      ✅
v2.7 ████████████████████  Divisão de conta        ✅
v3.x ░░░░░░░░░░░░░░░░░░░░  Gateway · delivery      ⬜
```

**Barra do v2:** `██████████████████░░` ~**90%**

---

## ✅ Feito (v2.0 → v2.7)

### Fundação
- [x] PostgreSQL no **Neon** + migrations (`0001` … `0009`)
- [x] Seed (mesas, cardápio, adicionais, removíveis)
- [x] Token **UUID** por mesa (QR opaco)
- [x] Sessão de mesa acumulativa (`mesa_sessoes`)

### Fluxo operacional
- [x] Cliente: cardápio, personalizar, carrinho, total da mesa
- [x] **Escolher** para bebidas/variantes (opção única · rádio)
- [x] Cozinha: fila `recebido` → `em_producao` → `concluido`
- [x] Garçom: `concluido` → `entregue` (soma no total da sessão)
- [x] Caixa: fechar conta, formas de pagamento, desconto / taxa
- [x] Admin: CRUD cardápio, mesas/QR, garçons

### Tempo real & segurança
- [x] **SSE** (`GET /api/events`) + fallback
- [x] Auth por papel (admin / cozinha / caixa)
- [x] Rate limit em pedido e login
- [x] Preço sempre recalculado no servidor

### Gestão
- [x] Painel de pedidos **kanban** (só ativos; histórico sob busca)
- [x] Dashboard do dia
- [x] Relatório de vendas + **purge** de histórico
- [x] Controle de estoque (baixa automática)
- [x] Fotos de produto + CSP

### Pagamento PIX (v2.6)
- [x] QR / copia-e-cola na **mesa** e no **caixa**
- [x] `PIX_CHAVE` / `PIX_NOME` / `PIX_CIDADE` no `.env`
- [x] Normalização CPF/CNPJ/telefone/nome/cidade (EMV)
- [x] Botão **Já paguei no PIX** → avisa o caixa
- [x] Caixa: badge + toast + beep + destaque + PIX pré-selecionado
- [x] Bloco de pagamento **sempre** na conta da mesa (explica se total 0 ou PIX off)

### Divisão de conta (v2.7)
- [x] Migration `sessao_pagamentos` + API `POST /api/caixa/sessoes/:id/pagamentos`
- [x] Vários pagamentos parciais na mesma sessão (dinheiro, PIX, cartões)
- [x] UX no caixa: painel **Divisão de conta**, valor/pessoa, badge pago/restante
- [x] Ao **Fechar conta**, o restante é quitado automaticamente
- [ ] *(futuro)* divisão por item · divisão na tela da mesa

---

## ⬜ Próximo

### Polimento contínuo
- [x] Cardápio mesa e admin: categorias **recolhidas** (acordeão; uma aberta por vez)
- [ ] Revisar impressão de comanda (cozinha/garçom) se necessário
- [ ] Aposentar restos legados (`data/db.json` = só seed de referência)
- [ ] Testes de fumaça: mesa → cozinha → garçom → parciais → PIX → fechar

### v3 — Gateway · delivery
- [ ] Gateway PIX (confirmação automática)
- [ ] Delivery / retirada
- [ ] Multi-loja

---

## 🚀 Futuro (v3+)

| Ideia | Nota |
|-------|------|
| Gateway PIX (MP / PagSeguro) | Confirmação automática de pagamento |
| Delivery / retirada | Fora do fluxo de mesa |
| Multi-loja | Um banco, vários pontos |
| App garçom PWA | Offline leve + push |
| Variantes nativas no admin | Hoje bebidas usam adicionais + UX Escolher |
| **Menu / sidebar de navegação** | Admin e ops: lateral com seções; mesa: chips/âncoras de categoria fixas no topo para cardápio grande |

---

## 🏗️ Decisões de arquitetura

| Tema | Escolha |
|------|--------|
| Runtime | Node.js HTTP nativo (sem Express) |
| Banco | PostgreSQL (Neon free-tier) |
| Tempo real | SSE (`LQRRealtime`) |
| PIX | Estático EMV (sem gateway por enquanto) |
| Bebidas / tamanhos | Adicionais + botão **Escolher** (rádio) |
| Commits | Conventional Commits |
| Docs | README visual + ROADMAP; atualizar após cada feature |
| UI mesa | Shell HTML + CSS/JS em módulos |

---

## 📈 Capacidade (referência)

- **Simultâneos:** dezenas de mesas com pouco delay; centenas exigem cuidado com SSE e CU-hours do Neon
- **Storage free (~0,5 GB):** use **purge** no admin + relatório PDF antes de apagar histórico

---

<div align="center">

**Lanchonete QR** · em evolução 🍔

</div>
