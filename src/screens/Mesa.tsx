import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck, Banknote, Check, ChevronRight, CircleCheck, ClipboardList, Copy,
  Flame, HandPlatter, Minus, PartyPopper, Plus, QrCode, Receipt, Search,
  ShoppingBag, Sparkles, Timer, Trash2, UtensilsCrossed, X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Btn, Input, Logo, Modal, Qtd } from "../components/ui";
import { ir } from "../router";
import { PIX_CONFIG } from "../lib/data";
import type { Opcao, Pedido, Produto } from "../lib/types";
import { usePub, sessaoDaMesa, totalSessao } from "../store/usePub";
import { BRL, montarPixEMV } from "../lib/utils";
import { cn } from "../utils/cn";

/* ---------- item do carrinho ---------- */
interface CartItem {
  uid: string;
  produto: Produto;
  qtd: number;
  adicionais: Opcao[];
  removidos: string[];
  escolha: Opcao | null;
  obs: string;
}
const totalItem = (c: CartItem) =>
  (c.produto.preco + c.adicionais.reduce((a, b) => a + b.preco, 0) + (c.escolha?.preco ?? 0)) * c.qtd;

const STATUS_ORDEM: { id: Pedido["status"]; label: string }[] = [
  { id: "na_fila", label: "Recebido" },
  { id: "em_producao", label: "Na chapa" },
  { id: "pronto", label: "Pronto" },
  { id: "entregue", label: "Na mesa" },
];

export default function Mesa({ token }: { token: string }) {
  const mesas = usePub((s) => s.mesas);
  const produtos = usePub((s) => s.produtos);
  const sessoes = usePub((s) => s.sessoes);
  const pedidos = usePub((s) => s.pedidos);
  const criarPedido = usePub((s) => s.criarPedido);
  const informarPix = usePub((s) => s.informarPix);

  const mesa = mesas.find((m) => m.token === token);

  const [categoria, setCategoria] = useState("Lanches");
  const [busca, setBusca] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [produtoModal, setProdutoModal] = useState<Produto | null>(null);
  const [sheet, setSheet] = useState<"cart" | "conta" | null>(null);
  const [nome, setNome] = useState(() => sessionStorage.getItem(`pub-nome-${token}`) || "");
  const [enviado, setEnviado] = useState(false);
  const [pixInfo, setPixInfo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(`pub-nome-${token}`, nome);
  }, [nome, token]);

  const sessao = mesa ? sessaoDaMesa(sessoes, mesa.id) : undefined;
  const pedidosMesa = sessao ? pedidos.filter((p) => p.sessaoId === sessao.id).sort((a, b) => b.criadoEm - a.criadoEm) : [];
  const totalConta = sessao ? totalSessao(pedidos, sessao.id) : 0;
  const totalCart = cart.reduce((a, c) => a + totalItem(c), 0);
  const qtdCart = cart.reduce((a, c) => a + c.qtd, 0);

  const categorias = useMemo(() => {
    const set = [...new Set(produtos.filter((p) => p.ativo).map((p) => p.categoria))];
    return set;
  }, [produtos]);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return produtos.filter(
      (p) =>
        p.ativo &&
        (b ? p.nome.toLowerCase().includes(b) || p.descricao.toLowerCase().includes(b) : p.categoria === categoria)
    );
  }, [produtos, categoria, busca]);

  const pixCodigo = useMemo(
    () =>
      montarPixEMV({
        ...PIX_CONFIG,
        valor: totalConta > 0 ? totalConta : null,
        txid: mesa ? `MESA${mesa.numero}` : "PUB",
      }),
    [totalConta, mesa]
  );

  if (!mesa) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div>
          <Logo size="sm" />
          <h1 className="font-display text-5xl text-white mt-6">QR inválido</h1>
          <p className="text-stone-400 mt-2 text-sm">Este QR Code não pertence a nenhuma mesa do pub.</p>
          <Btn className="mt-6" onClick={() => ir("/")}>Voltar ao início</Btn>
        </div>
      </div>
    );
  }

  const addCart = (item: CartItem) => setCart((c) => [...c, item]);

  const enviar = () => {
    if (!cart.length) return;
    const itens = cart.map((c) => ({
      id: c.uid,
      produtoId: c.produto.id,
      nome: c.produto.nome,
      qtd: c.qtd,
      precoBase: c.produto.preco,
      adicionais: c.adicionais,
      removidos: c.removidos,
      escolha: c.escolha,
      obs: c.obs,
      totalUnit: totalItem(c) / c.qtd,
    }));
    const id = criarPedido(mesa.id, nome, itens);
    if (id) {
      setCart([]);
      setSheet(null);
      setEnviado(true);
      setTimeout(() => {
        setEnviado(false);
        setSheet("conta");
      }, 2100);
    }
  };

  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(pixCodigo);
    } catch {
      /* clipboard pode falhar fora de https */
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  };

  /* ==================== painéis reutilizáveis ==================== */

  const painelCarrinho = (
    <div className="flex h-full flex-col">
      <h3 className="font-display text-3xl text-white flex items-center gap-2">
        <ShoppingBag className="size-6 text-amber-400" /> Seu pedido
      </h3>
      {cart.length === 0 ? (
        <div className="flex-1 grid place-items-center py-14 text-center">
          <div>
            <UtensilsCrossed className="size-10 text-stone-600 mx-auto" />
            <p className="mt-3 text-sm text-stone-400">Carrinho vazio por aqui…<br />Bateu aquela fome?</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex-1 space-y-2.5 overflow-y-auto pr-1 no-scrollbar">
            <AnimatePresence initial={false}>
              {cart.map((c) => (
                <motion.div
                  key={c.uid}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                  className="flex gap-3 rounded-2xl bg-white/[0.04] border border-white/[0.07] p-3"
                >
                  <img src={c.produto.foto} alt="" className="size-14 rounded-xl object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white leading-tight">{c.produto.nome}</p>
                      <button onClick={() => setCart((x) => x.filter((y) => y.uid !== c.uid))} className="text-stone-500 hover:text-rose-400 cursor-pointer shrink-0">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-500 leading-snug">
                      {c.escolha && <span className="text-sky-300">{c.escolha.nome} · </span>}
                      {c.adicionais.map((a) => `+${a.nome}`).join(", ")}
                      {c.removidos.length > 0 && <span className="text-rose-300/80"> · sem {c.removidos.join(", ")}</span>}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <Qtd size="sm" valor={c.qtd} onChange={(v) => setCart((x) => x.map((y) => (y.uid === c.uid ? { ...y, qtd: v } : y)))} />
                      <span className="font-mono text-sm font-semibold text-amber-300">{BRL(totalItem(c))}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="pt-4 mt-4 border-t border-white/[0.08] space-y-3">
            <Input value={nome} onChange={setNome} placeholder="Seu nome (p/ a cozinha chamar)" />
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">total do pedido</span>
              <span className="font-display text-4xl text-gradient">{BRL(totalCart)}</span>
            </div>
            <Btn full size="lg" onClick={enviar} disabled={!cart.length}>
              Enviar pra cozinha <ChevronRight className="size-4.5" />
            </Btn>
          </div>
        </>
      )}
    </div>
  );

  const painelConta = (
    <div className="flex h-full flex-col">
      <h3 className="font-display text-3xl text-white flex items-center gap-2">
        <Receipt className="size-6 text-amber-400" /> Sua conta
      </h3>

      {pedidosMesa.length === 0 ? (
        <div className="flex-1 grid place-items-center py-14 text-center">
          <div>
            <Timer className="size-10 text-stone-600 mx-auto" />
            <p className="mt-3 text-sm text-stone-400">Nenhum pedido ainda nesta visita.<br />Faça o primeiro!</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1 no-scrollbar">
          {pedidosMesa.map((p) => {
            const stepIdx = STATUS_ORDEM.findIndex((s) => s.id === p.status);
            return (
              <div key={p.id} className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-stone-400">
                    Pedido <span className="font-mono text-white">#{p.id}</span> · {p.clienteNome}
                  </p>
                  <Badge tone={p.status === "entregue" ? "lime" : p.status === "pronto" ? "sky" : p.status === "em_producao" ? "amber" : "zinc"} pulse={p.status !== "entregue"}>
                    {STATUS_ORDEM[stepIdx].label}
                  </Badge>
                </div>

                {/* linha de progresso */}
                <div className="mt-3 flex items-center gap-1">
                  {STATUS_ORDEM.map((s, i) => (
                    <div key={s.id} className="flex-1">
                      <div className={cn("h-1.5 rounded-full transition-colors duration-500", i <= stepIdx ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-white/[0.08]")} />
                    </div>
                  ))}
                </div>

                <ul className="mt-3 space-y-1">
                  {p.itens.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3 text-[13px] text-stone-300">
                      <span className="leading-snug">
                        <b className="text-white font-mono">{i.qtd}×</b> {i.nome}
                        <span className="block text-[11px] text-stone-500">
                          {[i.escolha?.nome, ...i.adicionais.map((a) => `+${a.nome}`), i.removidos.length ? `sem ${i.removidos.join(", ")}` : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="font-mono text-stone-400">{BRL(i.totalUnit * i.qtd)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* bloco PIX sempre visível */}
      <div className="pt-4 mt-4 border-t border-white/[0.08]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">total da visita</span>
          <span className="font-display text-4xl text-gradient">{BRL(totalConta)}</span>
        </div>

        {totalConta > 0 ? (
          <AnimatePresence mode="wait">
            {!pixInfo ? (
              <motion.div
                key="cta"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-400/12 to-orange-500/[0.07] p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center size-11 rounded-xl bg-black/40 border border-amber-400/30">
                    <QrCode className="size-5 text-amber-300" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">Pague no PIX, sem esperar</p>
                    <p className="text-[11px] text-stone-400">QR com o valor da visita · opcional</p>
                  </div>
                  <Btn size="sm" onClick={() => setPixInfo(true)}>Ver QR</Btn>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="qr"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-400/12 to-orange-500/[0.07] p-4 space-y-3"
              >
                <div className="flex items-start gap-4">
                  <motion.div
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    className="rounded-2xl bg-white p-3 shadow-[0_10px_36px_-10px_rgba(0,0,0,0.7)]"
                  >
                    <QRCodeSVG value={pixCodigo} size={118} fgColor="#131009" level="M" />
                  </motion.div>
                  <div className="flex-1 space-y-2">
                    <p className="font-display text-3xl text-white leading-none">{BRL(totalConta)}</p>
                    <p className="text-[11px] text-stone-400 leading-snug">Aponte a câmera do app do banco e confira o valor.</p>
                    <Btn size="sm" variant="outline" full onClick={copiarPix}>
                      {copiado ? <CircleCheck className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copiado ? "Código copiado!" : "Copiar código"}
                    </Btn>
                  </div>
                </div>
                <Btn
                  full
                  variant={sessao && sessao.pixAvisos > 0 ? "lime" : "brand"}
                  onClick={() => {
                    informarPix(mesa.id);
                  }}
                  disabled={!sessao}
                >
                  <BadgeCheck className="size-4.5" />
                  {sessao && sessao.pixAvisos > 0 ? `PIX já avisado (${sessao.pixAvisos}×) — avisar de novo` : "Já paguei no PIX"}
                </Btn>
                <p className="text-[10px] text-center text-stone-500">O caixa confirma e fecha a conta — nada fecha sozinho.</p>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 flex items-center gap-3">
            <Banknote className="size-5 text-stone-500" />
            <p className="text-xs text-stone-400">O bloco de pagamento aparece aqui assim que houver itens na conta.</p>
          </div>
        )}
      </div>
    </div>
  );

  /* ==================== render ==================== */
  return (
    <div className="relative min-h-dvh pb-32 lg:pb-12">
      {/* fundo */}
      <div className="fixed inset-0 -z-10">
        <div className="glow-orb absolute -top-40 right-[10%] size-[28rem] bg-amber-500/12" />
        <div className="glow-orb absolute bottom-[-8rem] left-[-6rem] size-[26rem] bg-orange-700/10" />
        <div className="noise absolute inset-0" />
      </div>

      {/* header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-coal-950/80 backdrop-blur-xl">
        <div className="mx-auto max-w-400 px-4 sm:px-6 h-16 flex items-center gap-3">
          <Logo size="sm" />
          <Badge tone="amber" className="ml-1">{mesa.nome}</Badge>
          {sessao && sessao.pixAvisos > 0 && <Badge tone="lime">pix {sessao.pixAvisos}×</Badge>}
          <div className="flex-1" />
          <button
            onClick={() => setSheet("conta")}
            className="btn-press lg:hidden flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/10 h-10 pl-3.5 pr-4 text-xs font-bold text-stone-200 cursor-pointer"
          >
            <Receipt className="size-4 text-amber-300" />
            <span className="tabular">{BRL(totalConta)}</span>
          </button>
          <button
            onClick={() => setSheet("cart")}
            className="btn-press relative grid place-items-center size-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-950 cursor-pointer"
          >
            <ShoppingBag className="size-4.5" />
            <AnimatePresence>
              {qtdCart > 0 && (
                <motion.span
                  key={qtdCart}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1.5 -right-1.5 grid place-items-center min-w-5 h-5 px-1 rounded-full bg-lime-400 text-zinc-950 text-[10px] font-bold border-2 border-coal-950"
                >
                  {qtdCart}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-400 px-4 sm:px-6">
        <div className="lg:grid lg:grid-cols-12 lg:gap-8">
          {/* -------- coluna cardápio -------- */}
          <section className="lg:col-span-8 xl:col-span-8">
            {/* hero da mesa */}
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="pt-8 sm:pt-10 pb-6">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.3em] text-amber-400/90">
                <HandPlatter className="size-4" /> bem-vindo(a) à {mesa.nome}
              </p>
              <h1 className="font-display text-6xl sm:text-8xl leading-[0.9] text-white mt-2">
                Bateu a fome?<br /><span className="text-gradient">Pede sem esperar.</span>
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge tone="lime" pulse>cozinha recebendo</Badge>
                <Badge tone="zinc">peça quantas vezes quiser</Badge>
                <Badge tone="zinc">tudo entra na mesma conta</Badge>
              </div>
            </motion.div>

            {/* busca + categorias */}
            <div className="sticky top-16 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-coal-950/85 backdrop-blur-xl">
              <div className="relative mb-3">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-stone-500" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar no cardápio…"
                  className="w-full h-11 rounded-full bg-white/[0.05] border border-white/10 pl-11 pr-10 text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-amber-400/50 transition"
                />
                {busca && (
                  <button onClick={() => setBusca("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-white cursor-pointer">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
                {categorias.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setCategoria(c);
                      setBusca("");
                    }}
                    className={cn(
                      "btn-press relative shrink-0 h-10 px-4.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors border",
                      categoria === c && !busca
                        ? "text-zinc-950 border-transparent"
                        : "text-stone-400 border-white/10 hover:text-white bg-white/[0.03]"
                    )}
                  >
                    {categoria === c && !busca && (
                      <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400 to-orange-500" transition={{ type: "spring", stiffness: 420, damping: 32 }} />
                    )}
                    <span className="relative z-10">{c}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* título da seção */}
            <div className="mt-5 mb-4 flex items-center gap-2">
              <Flame className="size-4 text-amber-400" />
              <h2 className="font-display text-3xl text-white">{busca ? `Resultados p/ “${busca}”` : categoria}</h2>
              <span className="text-xs font-mono text-stone-500 mt-1">{lista.length} itens</span>
            </div>

            {/* grid de produtos */}
            <motion.div layout className="grid sm:grid-cols-2 gap-3.5">
              <AnimatePresence mode="popLayout">
                {lista.map((p) => {
                  const esgotado = p.estoque !== null && p.estoque <= 0;
                  return (
                    <motion.article
                      key={p.id}
                      layout
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                      className={cn(
                        "card-img-zoom group relative glass rounded-3xl overflow-hidden",
                        esgotado && "opacity-60 grayscale-[0.6]"
                      )}
                    >
                      <div className="relative h-44 overflow-hidden">
                        <img src={p.foto} alt={p.nome} loading="lazy" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-coal-950/90 via-transparent to-transparent" />
                        <div className="absolute top-3 left-3 flex gap-1.5">
                          {p.vendidos > 90 && <Badge tone="amber"><Sparkles className="size-3" /> hit da casa</Badge>}
                          {p.estoque !== null && p.estoque > 0 && p.estoque <= 8 && <Badge tone="rose" pulse>últimos {p.estoque}</Badge>}
                          {esgotado && <Badge tone="zinc">esgotado</Badge>}
                        </div>
                        <p className="absolute bottom-3 left-4 font-mono text-lg font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                          {BRL(p.preco)}
                        </p>
                      </div>

                      <div className="p-4">
                        <h3 className="font-semibold text-white leading-tight">{p.nome}</h3>
                        <p className="mt-1 text-xs text-stone-400 leading-relaxed line-clamp-2 min-h-8">{p.descricao}</p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-stone-500">
                            {p.tipo === "escolher" ? "escolha 1 opção" : p.tipo === "personalizavel" ? `${p.adicionais.length} adicionais` : "do jeito da casa"}
                          </span>
                          {p.tipo === "simples" ? (
                            <Btn
                              size="sm"
                              disabled={esgotado}
                              onClick={() =>
                                addCart({ uid: Math.random().toString(36).slice(2), produto: p, qtd: 1, adicionais: [], removidos: [], escolha: null, obs: "" })
                              }
                            >
                              <Plus className="size-4" /> Adicionar
                            </Btn>
                          ) : (
                            <Btn size="sm" variant="outline" disabled={esgotado} onClick={() => setProdutoModal(p)}>
                              {p.tipo === "escolher" ? "Escolher" : "Personalizar"} <ChevronRight className="size-3.5" />
                            </Btn>
                          )}
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </section>

          {/* -------- coluna lateral (desktop) -------- */}
          <aside className="hidden lg:block lg:col-span-4 pt-10">
            <div className="sticky top-24 glass-deep noise rounded-3xl p-5 max-h-[calc(100dvh-8.5rem)] flex flex-col gap-0 overflow-hidden">
              <PainelComAbas
                cart={cart}
                totalConta={totalConta}
                painelCarrinho={painelCarrinho}
                painelConta={painelConta}
              />
            </div>
          </aside>
        </div>
      </div>

      {/* -------- barra inferior (mobile) -------- */}
      <AnimatePresence>
        {(qtdCart > 0 || pedidosMesa.length > 0) && (
          <motion.div
            initial={{ y: 90 }}
            animate={{ y: 0 }}
            exit={{ y: 90 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="lg:hidden fixed bottom-0 inset-x-0 z-50 p-4 pt-8 bg-gradient-to-t from-coal-950 via-coal-950/95 to-transparent"
          >
            <div className="flex gap-2.5 max-w-md mx-auto">
              <button
                onClick={() => setSheet("conta")}
                className="btn-press flex-1 h-13 rounded-2xl glass-deep flex items-center justify-center gap-2 cursor-pointer"
              >
                <Receipt className="size-4.5 text-amber-300" />
                <span className="text-sm font-bold text-white tabular">{BRL(totalConta)}</span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-stone-500">conta</span>
              </button>
              <button
                onClick={() => setSheet("cart")}
                className="btn-press flex-[1.3] h-13 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 shadow-[0_14px_38px_-8px_rgba(255,150,20,0.6)] cursor-pointer"
              >
                <ShoppingBag className="size-4.5" />
                {qtdCart === 0 ? "Pedir" : `Pedir · ${BRL(totalCart)}`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* -------- sheets mobile -------- */}
      <Modal open={sheet === "cart"} onClose={() => setSheet(null)}>
        <div className="p-5 sm:p-6 min-h-[55dvh]">{painelCarrinho}</div>
      </Modal>
      <Modal open={sheet === "conta"} onClose={() => setSheet(null)}>
        <div className="p-5 sm:p-6 min-h-[55dvh]">{painelConta}</div>
      </Modal>

      {/* -------- modal produto -------- */}
      <ProdutoModal
        produto={produtoModal}
        onClose={() => setProdutoModal(null)}
        onAdd={(item) => {
          addCart(item);
        }}
      />

      {/* -------- celebração enviado -------- */}
      <AnimatePresence>
        {enviado && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-95 grid place-items-center bg-coal-950/85 backdrop-blur-md p-6"
          >
            <motion.div
              initial={{ scale: 0.7, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="text-center"
            >
              <motion.div
                animate={{ rotate: [0, -8, 8, 0] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
                className="mx-auto grid place-items-center size-24 rounded-3xl bg-gradient-to-br from-lime-300 to-lime-500 text-zinc-950 shadow-[0_20px_60px_-10px_rgba(163,230,53,0.5)]"
              >
                <PartyPopper className="size-11" />
              </motion.div>
              <h2 className="font-display text-6xl text-white mt-6">PEDIDO ENVIADO!</h2>
              <p className="mt-2 text-stone-300 flex items-center justify-center gap-2 text-sm">
                <Check className="size-4 text-lime-400" /> Já está na fila da cozinha — acompanhe na sua conta
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- painel com abas (desktop) ---------- */
function PainelComAbas({
  cart,
  totalConta,
  painelCarrinho,
  painelConta,
}: {
  cart: CartItem[];
  totalConta: number;
  painelCarrinho: React.ReactNode;
  painelConta: React.ReactNode;
}) {
  const [aba, setAba] = useState<"cart" | "conta">("cart");
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/40 border border-white/[0.08] p-1 mb-5">
        {([
          { id: "cart", label: "Seu pedido", icon: ShoppingBag },
          { id: "conta", label: `Conta · ${BRL(totalConta)}`, icon: ClipboardList },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            className={cn(
              "relative h-10 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors",
              aba === t.id ? "text-zinc-950" : "text-stone-400 hover:text-white"
            )}
          >
            {aba === t.id && (
              <motion.span layoutId="painel-aba" className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <t.icon className="size-3.5" /> {t.label}
              {t.id === "cart" && cart.length > 0 && <span className="grid place-items-center min-w-4.5 h-4.5 px-1 rounded-full bg-zinc-950/20 text-[10px] font-bold">{cart.length}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{aba === "cart" ? painelCarrinho : painelConta}</div>
    </div>
  );
}

/* ---------- modal do produto ---------- */
function ProdutoModal({
  produto,
  onClose,
  onAdd,
}: {
  produto: Produto | null;
  onClose: () => void;
  onAdd: (c: CartItem) => void;
}) {
  const [qtd, setQtd] = useState(1);
  const [ads, setAds] = useState<Opcao[]>([]);
  const [rems, setRems] = useState<string[]>([]);
  const [escolha, setEscolha] = useState<Opcao | null>(null);
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (produto) {
      setQtd(1);
      setAds([]);
      setRems([]);
      setObs("");
      setEscolha(produto.tipo === "escolher" ? null : null);
    }
  }, [produto]);

  if (!produto) return null;
  const precisaEscolha = produto.tipo === "escolher";
  const unit =
    produto.preco + ads.reduce((a, b) => a + b.preco, 0) + (escolha?.preco ?? 0);
  const pode = !precisaEscolha || !!escolha;

  const confirmar = () => {
    if (!pode) return;
    onAdd({ uid: Math.random().toString(36).slice(2), produto, qtd, adicionais: ads, removidos: rems, escolha, obs });
    onClose();
  };

  return (
    <Modal open onClose={onClose}>
      <div>
        <div className="relative h-52">
          <img src={produto.foto} alt={produto.nome} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-coal-900 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-5 right-14">
            <Badge tone="amber">{produto.categoria}</Badge>
            <h3 className="font-display text-4xl text-white leading-none mt-2 drop-shadow-lg">{produto.nome}</h3>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-sm text-stone-400 leading-relaxed">{produto.descricao}</p>

          {/* escolha única (rádio) */}
          {precisaEscolha && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-300 mb-2.5">escolha uma opção</p>
              <div className="space-y-2">
                {produto.adicionais.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setEscolha(a)}
                    className={cn(
                      "btn-press w-full flex items-center gap-3 rounded-2xl border p-3.5 text-left cursor-pointer transition-all",
                      escolha?.id === a.id ? "border-sky-400/60 bg-sky-400/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"
                    )}
                  >
                    <span className={cn("grid place-items-center size-5 rounded-full border-2 transition-colors", escolha?.id === a.id ? "border-sky-300" : "border-stone-600")}>
                      {escolha?.id === a.id && <span className="size-2.5 rounded-full bg-sky-300" />}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-white">{a.nome}</span>
                    <span className="font-mono text-xs text-stone-400">{a.preco > 0 ? `+ ${BRL(a.preco)}` : "incluso"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* adicionais (multi) */}
          {!precisaEscolha && produto.adicionais.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300 mb-2.5">adições</p>
              <div className="flex flex-wrap gap-2">
                {produto.adicionais.map((a) => {
                  const on = ads.some((x) => x.id === a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => setAds((x) => (on ? x.filter((y) => y.id !== a.id) : [...x, a]))}
                      className={cn(
                        "btn-press inline-flex items-center gap-1.5 rounded-full border px-3.5 h-10 text-xs font-semibold cursor-pointer transition-all",
                        on ? "border-amber-400/60 bg-amber-400/15 text-amber-200" : "border-white/12 bg-white/[0.03] text-stone-300 hover:border-white/30"
                      )}
                    >
                      {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                      {a.nome}
                      <span className="font-mono opacity-70">+{BRL(a.preco)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* removíveis */}
          {produto.removiveis.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-rose-300 mb-2.5">tirar do jeito que vem</p>
              <div className="flex flex-wrap gap-2">
                {produto.removiveis.map((r) => {
                  const on = rems.includes(r.nome);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRems((x) => (on ? x.filter((y) => y !== r.nome) : [...x, r.nome]))}
                      className={cn(
                        "btn-press inline-flex items-center gap-1.5 rounded-full border px-3.5 h-9 text-xs font-semibold cursor-pointer transition-all",
                        on ? "border-rose-400/60 bg-rose-400/15 text-rose-200" : "border-white/12 bg-white/[0.03] text-stone-400 hover:border-white/30"
                      )}
                    >
                      <Minus className="size-3" /> sem {r.nome.toLowerCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Input value={obs} onChange={setObs} placeholder="Observação p/ cozinha (ponto da carne, gelo à parte…)" />

          <div className="flex items-center justify-between gap-4 pt-1">
            <Qtd valor={qtd} onChange={setQtd} />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500">subtotal</p>
              <p className="font-display text-4xl text-gradient leading-none">{BRL(unit * qtd)}</p>
            </div>
          </div>

          <Btn full size="lg" onClick={confirmar} disabled={!pode}>
            {pode ? <>Adicionar ao pedido · {BRL(unit * qtd)}</> : "Escolha uma opção pra continuar"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
