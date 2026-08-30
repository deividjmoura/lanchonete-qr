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
v2.7 ░░░░░░░░░░░░░░░░░░░░  Divisão de conta        ⬜
v3.x ░░░░░░░░░░░░░░░░░░░░  Gateway · delivery      ⬜
```

**Barra do v2:** `████████████████░░░░` ~**80%**

---

## ✅ Feito (v2.0 → v2.6)

### Fundação
- [x] PostgreSQL no **Neon** + migrations (`0001` … `0008`)
- [x] Seed (mesas, cardápio, adicionais, removíveis)
- [x] Token **UUID** por mesa (QR opaco)
- [x] Sessão de mesa acumulativa (`mesa_sessoes`)

### Fluxo operacional
- [x] Cliente: cardápio, personalizar, carrinho, total da mesa
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

---

## ⬜ Próximo

### v2.7 — Divisão de conta
- [ ] Cliente/caixa divide o total (por pessoa ou por item)
- [ ] Vários pagamentos parciais na mesma sessão
- [ ] UX clara no mobile da mesa e no caixa

### Polimento contínuo
- [ ] Revisar impressão de comanda (cozinha/garçom)
- [ ] Aposentar restos legados (`data/db.json` se ainda existir)
- [ ] Testes de fumaça documentados (mesa → PIX → caixa)

---

## 🚀 Futuro (v3+)

| Ideia | Nota |
|-------|------|
| Gateway PIX (MP / PagSeguro) | Confirmação automática de pagamento |
| Delivery / retirada | Fora do fluxo de mesa |
| Multi-loja | Um banco, vários pontos |
| App garçom PWA | Offline leve + push |

---

## 🏗️ Decisões de arquitetura

| Tema | Escolha |
|------|--------|
| Runtime | Node.js HTTP nativo (sem Express) |
| Banco | PostgreSQL (Neon free-tier) |
| Tempo real | SSE (`LQRRealtime`) |
| PIX | Estático EMV (sem gateway por enquanto) |
| Commits | Conventional Commits |
| UI mesa | Shell HTML + CSS/JS em módulos (tamanho) |

---

## 📈 Capacidade (referência)

Com o stack atual (SSE + Neon free):

- **Simultâneos:** dezenas de mesas ativas com pouco delay é realista; centenas exigem cuidado com conexões SSE e CU-hours do Neon
- **Storage free Neon (~0,5 GB):** histórico de pedidos enche ao longo dos meses → use **purge** no admin e relatórios em PDF antes de apagar

---

## 📝 Notas

- O antigo `PLANO.md` foi **substituído** por este arquivo + o [README.md](./README.md).
- Quando um item do “Próximo” fechar, marque aqui e atualize a barra no README.

<div align="center">

**Lanchonete QR** · em evolução 🍔

</div>
