# 🍔 Lanchonete QR

Sistema de pedidos por QR Code para lanchonetes — do cardápio no celular do cliente até a cozinha, o garçom e o caixa.

Cliente escaneia o QR da mesa → monta o pedido com adicionais, remoções e ponto da carne → cozinha avança o status → garçom entrega → valor entra na **comanda acumulativa da mesa** → caixa fecha a conta.

---

## Status do projeto

| Área | Estado |
|------|--------|
| Schema + migrations PostgreSQL (Neon) | ✅ |
| Seed (mesas, categorias, produtos, adicionais, removíveis, ponto da carne) | ✅ |
| `GET /api/cardapio` | ✅ |
| `POST /api/mesas/:token/pedidos` + sessão da mesa | ✅ |
| `GET /api/mesas/:token/sessao` (pedidos, itens, status, total) | ✅ |
| `GET /api/cozinha/pedidos` + `PATCH /api/pedidos/:id/status` | ✅ |
| `GET /api/garcom/pedidos` + entrega (`entregue`) | ✅ |
| `GET /api/caixa/sessoes` + `POST .../fechar` | ✅ |
| **Admin** — CRUD cardápio + QR por token | ✅ |
| UI cliente (`mesa.html`) — cardápio + **conta da mesa com status** | ✅ |
| UI cozinha / garçom / caixa | ✅ |
| Auth admin/caixa (login por senha + sessão) | ✅ |
| Rate limit na criação de pedido e no login | ✅ |
| Tema claro/escuro (Clean Corporate) | ✅ |
| SSE no lugar de polling | ✅ |

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Runtime | **Node.js** (HTTP nativo, sem Express) |
| Banco | **PostgreSQL** (Neon) |
| Driver | `pg` |
| Config | `dotenv` |
| Front | HTML + CSS + JS vanilla (mobile-first) |
| UI | Design tokens centralizados, tema claro/escuro, Inter + JetBrains Mono |
| QR | Geração on-the-fly no admin (API pública) · script Python opcional |

---

## Fluxo operacional

```
Cliente (QR na mesa)
   │  /mesa/:token
   ▼
Cardápio (Postgres) → monta pedido → POST /api/mesas/:token/pedidos
   │
   ▼
COZINHA   recebido → em_producao → concluido
   │
   ▼
GARÇOM    concluido → entregue   (valor soma em mesa_sessoes.valor_total)
   │
   ▼
Cliente pode pedir de novo → conta da mesa acumula
   │  (barra "Conta da mesa" → modal com itens + status ao vivo)
   ▼
CAIXA     fecha sessão + forma de pagamento
```

Ponto-chave: **vários pedidos por visita**. O que importa financeiramente é a **sessão/comanda da mesa**, não o pedido isolado.

### Acompanhamento do cliente

Na tela da mesa (`/mesa/:token`):

1. Barra fixa no topo mostra o **total acumulado** e quantos pedidos estão em andamento.
2. Toque na barra abre o modal **Conta da mesa**:
   - Lista de todos os pedidos da sessão (mais recentes primeiro)
   - Status de cada um: **Recebido → Na cozinha → Pronto → Entregue**
   - Itens, adicionais, remoções, observações e subtotais
3. A sessão é recarregada a cada ~8s; se o modal estiver aberto, os status atualizam sozinhos.

---

## Instalação

```bash
# 1. Dependências
npm install

# 2. Variáveis de ambiente
cp .env.example .env
# Edite DATABASE_URL (string do Neon ou Postgres local)
# DATABASE_SSL=true se o provedor exigir SSL
# ADMIN_PASSWORD=defina a senha de acesso do staff (admin/caixa)

# 3. Schema + dados iniciais
npm run db:migrate
npm run db:seed

# 4. Subir
npm start
# → http://localhost:3000
```

### Scripts

| Comando | O que faz |
|---------|-----------|
| `npm start` / `npm run dev` | Sobe o servidor |
| `npm run db:migrate` | Aplica migrations em `db/migrations/` |
| `npm run db:seed` | Popula mesas + cardápio a partir do JSON legado |
| `npm run qr` | Gera PNGs estáticos em `qr/` (legado; admin já gera QR dinâmico por token) |

---

## Rotas principais

### Público / operação (Postgres)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/cardapio` | Cardápio disponível (categorias → produtos → adicionais/removíveis) |
| `POST` | `/api/mesas/:token/pedidos` | Cria pedido, abre/reaproveita sessão, valida preço e regras no servidor |
| `GET` | `/api/mesas/:token/sessao` | Pedidos da sessão aberta + itens + status + total devido |
| `GET` | `/api/cozinha/pedidos` | Fila `recebido` / `em_producao` |
| `GET` | `/api/garcom/pedidos` | Fila `concluido` (pronto para entregar) |
| `PATCH` | `/api/pedidos/:id/status` | Avança um passo: `recebido → em_producao → concluido → entregue` |
| `GET` | `/api/caixa/sessoes` | Sessões abertas com itens entregues e total |
| `POST` | `/api/caixa/sessoes/:id/fechar` | Fecha conta (`formaPagamento`) e libera mesa |

### Admin (Postgres)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/mesas` | Mesas com token, status e sessão aberta |
| `GET` | `/api/admin/cardapio` | Cardápio completo (inclui indisponíveis) |
| `POST` | `/api/admin/categorias` | Nova categoria |
| `PATCH` | `/api/admin/categorias/:id` | Atualiza categoria |
| `POST` | `/api/admin/produtos` | Novo produto |
| `PATCH` | `/api/admin/produtos/:id` | Atualiza produto (preço, disponibilidade, ponto da carne…) |
| `POST` | `/api/admin/produtos/:id/adicionais` | Adiciona adicional |
| `DELETE` | `/api/admin/adicionais/:id` | Remove adicional |
| `PUT` | `/api/admin/produtos/:id/removiveis` | Substitui lista de ingredientes removíveis |

### Telas

| URL | Papel |
|-----|--------|
| `/mesa/:token` | Cliente — cardápio, carrinho e **conta da mesa com status** |
| `/cozinha` | Cozinha |
| `/garcom` | Garçom — pedidos prontos → entregue |
| `/admin` | Cardápio + QR por token — **exige login** |
| `/caixa` | Caixa — fecha sessão + pagamento — **exige login** |
| `/login` | Login do staff (senha única, `ADMIN_PASSWORD`) |

### Autenticação (staff — admin/caixa)

Login por senha única (`ADMIN_PASSWORD` no `.env`), sessão em memória via cookie
`HttpOnly`, válida por 12h. Sem tabela de usuários — todo o time compartilha a
mesma senha, o que é suficiente pro tamanho da operação hoje.

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/login` | `{ senha }` → cria sessão e seta cookie |
| `POST` | `/api/logout` | Encerra a sessão atual |

- Acessar `/admin` ou `/caixa` sem sessão válida redireciona para `/login?next=...`.
- Qualquer chamada a `/api/admin/*` ou `/api/caixa/*` sem sessão válida retorna `401`.
- `/api/mesas/:token/pedidos` (e a rota legada `/api/orders`) têm rate limit de
  10 pedidos a cada 5 minutos por IP+mesa. `/api/login` limita a 8 tentativas a
  cada 5 minutos por IP.

---

## UI / tema

- Design system em `public/style.css` com CSS variables (tokens).
- Temas **claro** e **escuro** (Clean Corporate): primary azul, Inter + JetBrains Mono.
- Toggle 🌓 em todas as telas; preferência salva em `localStorage` (`lq-theme`).
- Respeita `prefers-color-scheme` quando o usuário ainda não escolheu.

---

## Tempo real (SSE)

- Endpoint: `GET /api/events` (Server-Sent Events)
- Eventos: `hello` (conexão) e `update` (`pedido_criado`, `status_alterado`, `sessao_fechada`)
- Disparados ao criar pedido, avançar status e fechar sessão
- Telas cozinha, garçom, caixa e mesa escutam o stream e recarregam a fila/sessão
- Fallback: polling lento (15–30s) se `EventSource` não existir ou a conexão oscilar
- Keepalive a cada 25s para não cair em proxies

---

## Segurança já aplicada

- Token UUID opaco na URL da mesa (não o número sequencial)
- Preço e regras de personalização **sempre recalculados no servidor**
- Snapshot de preço em `itens_pedido` / `itens_pedido_adicionais` (pedido antigo não muda se o cardápio mudar)
- Constraint de sessão única aberta por mesa (`uq_mesa_sessao_aberta`)
- Auth staff + rate limit em pedido e login

---

## Estrutura

```
├── db/
│   ├── migrations/     # 0001_init, 0002_ingredientes_ponto_carne, 0003_hamburguer_extra
│   ├── admin.js        # CRUD cardápio + mesas
│   ├── auth.js         # login / sessão staff
│   ├── cardapio.js     # leitura pública
│   ├── pedidos.js      # criar pedido, status, sessão, fila
│   ├── caixa.js        # sessões abertas + fechar conta
│   ├── rateLimit.js
│   ├── queries.js
│   ├── pool.js
│   ├── migrate.js
│   └── seed.js
├── public/
│   ├── admin.html      # painel admin (cardápio + QR)
│   ├── mesa.html       # cliente: cardápio + conta da mesa
│   ├── cozinha.html
│   ├── garcom.html
│   ├── caixa.html
│   ├── login.html
│   ├── index.html
│   ├── pedido.html     # legado (acompanhamento por id)
│   └── style.css       # design tokens + tema
├── data/db.json        # legado — será aposentado
├── server.js
└── package.json
```

---

## Próximos passos (ordem sugerida)

1. ~~Migrar `mesa.html`~~ ✅
2. ~~Migrar `cozinha.html`~~ ✅
3. ~~Tela `/garcom`~~ ✅
4. ~~Tela `/caixa`~~ ✅
5. ~~Auth + rate limit~~ ✅
6. ~~Conta da mesa com status no cliente~~ ✅
7. SSE (substituir polling) e desligar rotas / `db.json` antigos

---

## Licença

Uso interno / educacional. Ajuste conforme a necessidade do projeto.
