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
v2.8 ████████████████████  PIX multi-aviso + alertas ops ✅
v2.9 ████████████████████  Voz · upload WebP · UX  ✅
v3.x ░░░░░░░░░░░░░░░░░░░░  Gateway · WA · PWA      ⬜
```

**Barra do v2:** `████████████████████` **100%** (polimento contínuo à parte)

---

## ✅ Feito (v2.0 → v2.9)

### Fundação
- [x] PostgreSQL no **Neon** + migrations (`0001` … `0011`)
- [x] Seed (mesas, cardápio, adicionais, removíveis)
- [x] Token **UUID** por mesa (QR opaco)
- [x] Sessão de mesa acumulativa (`mesa_sessoes`)

### Fluxo operacional
- [x] Cliente: cardápio, personalizar, carrinho, total da mesa
- [x] **Escolher** para bebidas/variantes (opção única · rádio)
- [x] Cozinha: fila `recebido` → `em_producao` → `concluido`
- [x] Garçom: `concluido` → `entregue` (soma no total da sessão)
- [x] Caixa: fechar conta, formas de pagamento, desconto / taxa
- [x] Admin: CRUD cardápio (criar, editar, pausar, **excluir**), mesas/QR, garçons

### Tempo real & segurança
- [x] **SSE** (`GET /api/events`) + fallback
- [x] Auth por papel (admin / cozinha / caixa)
- [x] Rate limit em pedido e login
- [x] Preço sempre recalculado no servidor
- [x] Sessões de staff **persistentes** no Postgres (`staff_sessoes`)

### Gestão
- [x] Painel de pedidos **kanban** (só ativos; histórico sob busca)
- [x] Dashboard do dia
- [x] Relatório de vendas + **purge** de histórico
- [x] Controle de estoque (baixa automática)
- [x] Fotos de produto + CSP

### Pagamento PIX (v2.6 → v2.8)
- [x] QR / copia-e-cola na **mesa** e no **caixa**
- [x] `PIX_CHAVE` / `PIX_NOME` / `PIX_CIDADE` no `.env`
- [x] Normalização CPF/CNPJ/telefone/nome/cidade (EMV)
- [x] Botão **Já paguei no PIX** → avisa o caixa (sem baixar valor sozinho)
- [x] Vários avisos na mesma mesa (divisão entre pagantes)
- [x] Caixa: badge + toast + beep a cada novo aviso + PIX pré-selecionado
- [x] Bloco de pagamento **sempre** na conta da mesa

### Divisão de conta (v2.7)
- [x] Migration `sessao_pagamentos` + API `POST /api/caixa/sessoes/:id/pagamentos`
- [x] Vários pagamentos parciais na mesma sessão (dinheiro, PIX, cartões)
- [x] UX no caixa: painel **Divisão de conta**, valor/pessoa, badge pago/restante
- [x] Ao **Fechar conta**, o restante é quitado automaticamente
- [ ] *(futuro)* divisão por item · divisão na tela da mesa

### Alertas operacionais (v2.8 → v2.9)
- [x] Cozinha: toast + beep quando chega pedido `recebido`
- [x] Garçom: toast + beep quando pedido fica `concluido`
- [x] **Voz (Web Speech API)** — cozinha: mesa + nome do cliente; garçom: frases engraçadas só com nº da mesa; caixa: anúncio de PIX

### Fotos leves (v2.9)
- [x] Upload de arquivo no admin (**Escolher arquivo** / **Upload**)
- [x] Link https também otimizado no servidor
- [x] **sharp**: max ~480px, WebP ~q72
- [x] Foto **persistida no Postgres** (data-URL) — sobrevive a redeploy
- [x] HTTPS externo ainda suportado

### UX cards / acordeão (v2.9)
- [x] Cozinha, mesa (conta), caixa: cards **recolhidos** por padrão
- [x] Caixa: acordeão por mesa independente (sem `<details>` aninhados bugados)
- [x] Admin cardápio: categorias recolhidas; várias podem ficar abertas

### Qualidade
- [x] Smoke test automatizado (`npm run test:smoke`)
- [x] Cenários: fluxo clássico · **2 pedidos concorrentes na mesma mesa** · **2ª mesa em paralelo** · PIX ×2 · divisão parcial · fechar ambas
- [x] **Smoke OK em 2026-09-01** (local · mesas 1 e 3 · sessão compartilhada validada)

---

## ⬜ Próximo

### Polimento residual
- [x] Confirmar PIX no caixa (rota + botão → `sessao_pagamentos`)
- [x] PIX na conta só no expandido (pedido e total)
- [x] Busca mesa pin após scroll; logo/chips desvanecem
- [x] Script `npm run fotos:fix` (corrige `foto_url` em lote)
- [ ] Revisar impressão de comanda (cozinha/garçom) se necessário
- [ ] Aposentar restos legados (`data/db.json` = só seed de referência)
- [x] Não depende de disco efêmero para fotos novas
- [x] SSL Neon/Render: normalização `sslmode=verify-full` (sem SECURITY WARNING)
- [x] `npm run db:reset-senha` para alinhar staff com `.env`

### v3 — Gateway · delivery · alertas fora do browser
- [ ] Gateway PIX (confirmação automática — MP / PagSeguro / similar)
- [ ] Delivery / retirada
- [ ] Multi-loja
- [ ] **WhatsApp** — avisos em texto (pedido novo, PIX informado, status)
- [ ] **PWA ops** (caixa / cozinha / garçom) + **push** no aparelho
- [ ] Estratégia de **voz fora da aba** (limitação atual documentada abaixo)

---

## 🚀 Futuro (v3+)

| Ideia | Nota |
|-------|------|
| **WhatsApp** (avisos / pedidos) | Texto + som padrão do app; **não** substitui TTS do navegador |
| **PWA + Web Push** | Notificação com o SO fechado (caixa/cozinha); base para alerta sonoro |
| **Voz offline / sempre ligada** | Tablet na cozinha com aba aberta **ou** app nativo; TTS no browser só com página ativa |
| Gateway PIX (MP / PagSeguro) | Confirmação automática de pagamento |
| Delivery / retirada | Fora do fluxo de mesa |
| Multi-loja | Um banco, vários pontos |
| App garçom PWA | Offline leve + push |
| Variantes nativas no admin | Hoje bebidas usam adicionais + UX Escolher |
| CRM básico | Cliente recorrente (telefone) + cupom simples |
| Multi-idioma | Cardápio dinâmico — esforço baixo, turismo |
| **Menu / sidebar de navegação** | Admin e ops: lateral com seções; mesa: chips/âncoras de categoria |

### WhatsApp (v3 — planejado)
- [ ] Aviso de **pedido novo** para cozinha/admin (texto)
- [ ] Aviso de **PIX informado** pelo cliente (texto → caixa)
- [ ] Opcional: status pronto/entregue para o cliente
- [ ] API oficial Meta ou serviço intermediário (bridge)
- [ ] Config no `.env` (token, número, templates)
- [ ] **Escopo claro:** notificação WhatsApp = mensagem + som do app; voz “Mesa X…” continua no painel web/PWA

### PWA + notificações (v3 — planejado)
- [ ] Manifest + service worker nos painéis ops
- [ ] Web Push (VAPID) para pedido novo / PIX / chamada garçom
- [ ] Som de alerta no dispositivo mesmo com navegador em segundo plano (limites do iOS a validar)
- [ ] Fallback: manter **voz Web Speech** quando a aba estiver aberta (já existe)

### Voz — o que já funciona vs v3
| Situação | Hoje (v2) | v3 |
|----------|-----------|-----|
| Aba caixa/cozinha **aberta** | ✅ TTS (`voz-ops.js`) | Mantém |
| App **fechado** / outra tela | ❌ Sem voz custom | Push e/ou WhatsApp texto; voz full só com PWA/app dedicado |
| WhatsApp no celular da equipe | — | ✅ Aviso texto; som genérico do WhatsApp |


---

## 🏗️ Decisões de arquitetura

| Tema | Escolha |
|------|--------|
| Runtime | Node.js HTTP nativo (sem Express) |
| Banco | PostgreSQL (Neon free-tier) |
| Tempo real | SSE (`LQRRealtime`) |
| PIX | Estático EMV (sem gateway por enquanto) |
| Fotos | sharp → WebP data-URL no Postgres (persistente) |
| Voz ops | Web Speech API (`voz-ops.js`) — só com aba aberta |
| Alertas fora do browser | v3: WhatsApp texto e/ou PWA + Web Push |
| Bebidas / tamanhos | Adicionais + botão **Escolher** (rádio) |
| Auth staff | Cookie httpOnly + tabela `staff_sessoes` |
| Commits | Conventional Commits |
| Docs | README visual + ROADMAP; atualizar após cada feature |
| UI mesa | Shell HTML + CSS/JS em módulos |
| Testes | Smoke HTTP (`scripts/smoke.js`) multi-mesa |

---

## 📈 Capacidade (referência)

- **Simultâneos:** dezenas de mesas com pouco delay; centenas exigem cuidado com SSE e CU-hours do Neon
- **Storage free (~0,5 GB):** use **purge** no admin + relatório PDF antes de apagar histórico; fotos já entram leves em WebP

---

<div align="center">

**Lanchonete QR** · v2 completo · em evolução 🍔

</div>
