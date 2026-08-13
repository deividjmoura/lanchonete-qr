# Plano — Lanchonete QR (PostgreSQL)
Repositório: https://github.com/deividjmoura/lanchonete-qr
Objetivo: evoluir o MVP atual (Node.js + arquivos JSON) para um sistema completo com PostgreSQL, cobrindo cardápio dinâmico, fluxo de pedido (cliente → cozinha → garçom → caixa) e conta de mesa acumulativa.
---
## ✅ Status atual
- Banco PostgreSQL provisionado no Neon, schema completo (`db/migrations/0001_init.sql`, `0002_ingredientes_ponto_carne.sql`) e seed rodados — mesas, categorias, produtos, adicionais, ingredientes removíveis por produto e flag de ponto da carne já populados.
- **Backend novo, em paralelo ao antigo:**
  - `GET /api/cardapio` — lê do Postgres
  - `POST /api/mesas/:token/pedidos` — cria pedido, abre/reaproveita sessão da mesa, valida tudo contra o banco (preço, disponibilidade, adicionais/removíveis permitidos), grava com snapshot de preço
  - `GET /api/mesas/:token/sessao` — pedidos da sessão aberta + total devido
  - `GET /api/cozinha/pedidos` — fila `recebido`/`em_producao`
  - `GET /api/garcom/pedidos` — fila `concluido`
  - `PATCH /api/pedidos/:id/status` — avança um passo por vez (`recebido → em_producao → concluido → entregue`), soma em `mesa_sessoes.valor_total` ao chegar em `entregue`
  - `GET /api/caixa/sessoes` — sessões abertas com itens entregues e total
  - `POST /api/caixa/sessoes/:id/fechar` — forma de pagamento + libera mesa
  - Código em `db/queries.js`, `db/cardapio.js`, `db/pedidos.js`, `db/caixa.js`
- **Admin migrado pro Postgres** (`db/admin.js` + rotas `/api/admin/*` + `public/admin.html`):
  - Listagem de mesas com **token UUID** e QR dinâmico (não mais `/mesa/:numero`)
  - CRUD de categorias, produtos, adicionais e ingredientes removíveis
  - Toggle de disponibilidade e flag de ponto da carne
- **Cliente (`mesa.html`) migrado pro Postgres:**
  - Rota `/mesa/:token` (UUID opaco; número sequencial rejeitado)
  - Consome `GET /api/cardapio`, `POST /api/mesas/:token/pedidos`, `GET /api/mesas/:token/sessao`
  - Barra fixa **"Total da mesa até agora"** sempre visível
  - Após enviar pedido permanece na mesa (conta acumulativa) e atualiza o total
  - **Adicionar** (toast + pill) ou **Personalizar** (modal overlay)
  - **Carrinho em modal** (não ocupa a tela; abre pelo ícone 🛒)
  - Ponto da carne **não é mais escolha fechada** — vai na observação do item (texto livre)
  - Hambúrguer extra garantido nos lanches/combos (`0003_hamburguer_extra.sql` + seed)
- **Cozinha (`cozinha.html`)** — fila Postgres, avanço até `concluido`
- **Garçom (`garcom.html`)** — fila `concluido` → `entregue`
- **Caixa (`caixa.html`)** — sessões abertas, fechar conta + pagamento

**Pendente:** aposentar rotas legadas e `data/db.json`.
**Feito recentemente:** SSE; auth admin/caixa; rate limit; conta da mesa; menu sanduíche.
---
## 1. Visão geral do fluxo
```
Cliente (QR na mesa)
   │ lê QR → abre /mesa/:token
   ▼
Cardápio (do banco) → adiciona / personaliza → envia
   │
   ▼
COZINHA status: recebido → em_producao → concluido
   │
   ▼
GARÇOM pega pedido "concluido" → entrega na mesa → status: entregue
   │ (nesse momento o valor entra na conta da mesa)
   ▼
Cliente pode pedir mais → repete o ciclo → conta da mesa vai somando
   │
   ▼
CAIXA vê conta aberta da mesa → fecha conta → registra pagamento
```
Ponto-chave: uma mesa pode gerar **vários pedidos** na mesma visita. O que importa financeiramente não é "o pedido", é a **sessão/comanda da mesa**, que soma todos os pedidos entregues até o caixa fechar.
---
## 2. Telas / papéis
| Papel | Rota | Ação principal | Status |
|---|---|---|---|
| Cliente | `/mesa/:token` | ver cardápio, adicionar/personalizar, acompanhar total da sessão | ✅ |
| Cozinha | `/cozinha` | fila `recebido`/`em_producao` → até `concluido` | ✅ |
| Garçom | `/garcom` | pedidos `concluido` → `entregue` | ✅ |
| Caixa | `/caixa` | sessões abertas, fechar conta + forma de pagamento | ✅ |
| Admin | `/admin` | CRUD cardápio + QR por mesa | ✅ |
---
## 3. Tempo real
~~Polling~~ → **SSE** em `GET /api/events`. Cozinha, garçom, caixa e mesa atualizam sob evento; polling lento só como fallback.
---
## 4. Segurança básica
- ~~Token opaco (uuid) na URL da mesa~~ ✅
- ~~Preço sempre recalculado no servidor~~ ✅
- ~~Admin/Caixa atrás de autenticação~~ ✅
- ~~Rate limit básico no endpoint de criar pedido~~ ✅
- ~~SSE~~ ✅
---
## 5. Ordem de execução (histórico)
1. ~~Setup do PostgreSQL~~ ✅
2. ~~Migrar cardápio pro Postgres~~ ✅
3. ~~Refazer criação de pedido~~ ✅
4. ~~Implementar `mesa_sessoes`~~ ✅
5. ~~Backend do avanço de status + soma em `valor_total`~~ ✅
6. ~~Migrar `admin.html`~~ ✅
7. ~~Migrar `mesa.html`~~ ✅
8. ~~Migrar `cozinha.html`~~ ✅
9. ~~Tela do garçom~~ ✅
10. ~~Tela do caixa + fechar sessão~~ ✅
11. ~~SSE + auth + rate limit~~ ✅
12. **Próximo:** aposentar rotas legadas (`/api/menu`, `/api/orders*`) e `data/db.json`
---
## 6. Decisões já tomadas
- Banco: **PostgreSQL** (Neon)
- Evolução incremental do `server.js` (HTTP nativo + `pg`), sem reescrita
- Ponto da carne: **texto livre na observação do item** (não enum obrigatório na UI)
- Adicionais (ex.: hambúrguer extra, bacon, queijo) vêm do seed/`db.json` e do CRUD admin por produto
---
## 7. UX cliente (atual)
- **Adicionar** — coloca o item no carrinho sem abrir modal
- **Personalizar** — só aparece se o produto tiver adicionais ou removíveis; abre **modal fixo** (overlay + bottom sheet no mobile)
- Observação do item: livre (ponto da carne, preferências etc.)
- Hambúrguer extra: é um **adicional** cadastrado nos hambúrgueres/combos no seed (ex.: “Hambúrguer extra 150g”). Se não aparecer no cardápio, conferir no Admin → produto → adicionais, ou re-seed em ambiente limpo
---
## 8. Commits desta evolução (resumo)
| Tema | Mensagem (conventional) |
|---|---|
| Admin | `feat(admin): API CRUD…` / `feat(admin): painel admin…` |
| Mesa | `feat(mesa): migra cardápio do cliente para token + Postgres` |
| Cozinha | `feat(cozinha): migra fila da cozinha para Postgres` |
| Garçom | `feat(garcom): tela e fila de entrega no Postgres` |
| Caixa | `feat(caixa): sessões abertas e fechamento de conta no Postgres` |
| UX mesa | `fix(mesa): modal de personalização, add rápido e obs. livre` |
