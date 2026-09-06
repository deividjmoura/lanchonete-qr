import { AnimatePresence, motion } from "framer-motion";
import { BellRing, CheckCheck, ConciergeBell, Footprints, Sparkles, Timer } from "lucide-react";
import { OpsShell, useAnuncios } from "../components/OpsShell";
import { Badge, Btn } from "../components/ui";
import { ir, useAgora } from "../router";
import { GARCOM_NOME } from "../lib/data";
import type { Pedido } from "../lib/types";
import { usePub } from "../store/usePub";
import { elapsed } from "../lib/utils";

export default function Garcom({ token }: { token: string }) {
  useAnuncios("garcom");
  useAgora(1000);

  const pedidos = usePub((s) => s.pedidos);
  const entregar = usePub((s) => s.entregarPedido);

  const prontos = pedidos.filter((p) => p.status === "pronto").sort((a, b) => a.criadoEm - b.criadoEm);
  const entregues = pedidos
    .filter((p) => p.status === "entregue")
    .sort((a, b) => b.criadoEm - a.criadoEm)
    .slice(0, 6);

  if (!token) {
    ir("/");
    return null;
  }

  const extras = (
    <div className="flex items-center gap-2">
      <Badge tone="zinc">token ok · {GARCOM_NOME}</Badge>
      <Badge tone={prontos.length ? "amber" : "zinc"} pulse={prontos.length > 0}>
        {prontos.length} pra entregar
      </Badge>
    </div>
  );

  return (
    <OpsShell ativo="garcom" kicker="operação · garçom" titulo={<>Corre, <span className="text-gradient">{GARCOM_NOME}!</span></>} extra={extras}>
      <div className="grid gap-6 lg:grid-cols-3">
        {/* prontos */}
        <section className="lg:col-span-2">
          <AnimatePresence mode="popLayout">
            {prontos.length === 0 ? (
              <motion.div
                key="vazio"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="grid place-items-center rounded-3xl border border-dashed border-white/12 py-24 text-center"
              >
                <div>
                  <motion.div animate={{ rotate: [0, 6, -6, 0] }} transition={{ repeat: Infinity, duration: 3 }}>
                    <ConciergeBell className="size-14 text-stone-600 mx-auto" />
                  </motion.div>
                  <h3 className="font-display text-4xl text-white mt-4">Nada na bancada</h3>
                  <p className="text-sm text-stone-400 mt-1.5">
                    Quando a cozinha concluir, sua voz de rádio anuncia o número da mesa.
                  </p>
                </div>
              </motion.div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {prontos.map((p) => (
                  <CardPronto key={p.id} pedido={p} onEntregar={() => entregar(p.id)} />
                ))}
              </div>
            )}
          </AnimatePresence>
        </section>

        {/* entregues */}
        <aside className="glass rounded-3xl p-5 h-fit">
          <h3 className="font-display text-3xl text-white flex items-center gap-2">
            <CheckCheck className="size-5 text-lime-400" /> Entregues
          </h3>
          <p className="text-[11px] text-stone-500 mt-0.5 mb-4">últimas corridas do salão</p>
          <div className="space-y-2.5">
            <AnimatePresence initial={false}>
              {entregues.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-stone-500">
                  nenhuma entrega ainda
                </p>
              )}
              {entregues.map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3 rounded-2xl bg-white/[0.04] border border-white/[0.07] p-3"
                >
                  <span className="grid place-items-center size-10 rounded-xl bg-lime-400/12 border border-lime-400/25 font-display text-2xl text-lime-300 leading-none pt-0.5">
                    {p.mesaNome.replace("Mesa ", "")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white truncate">
                      {p.clienteNome} · {p.itens.reduce((a, i) => a + i.qtd, 0)} itens
                    </p>
                    <p className="text-[11px] text-stone-500 font-mono tabular">há {elapsed(p.criadoEm)}</p>
                  </div>
                  <CheckCheck className="size-4 text-lime-400 shrink-0" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </OpsShell>
  );
}

function CardPronto({ pedido, onEntregar }: { pedido: Pedido; onEntregar: () => void }) {
  const esfriando = Date.now() - pedido.criadoEm > 1000 * 60 * 25;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.9, y: 26 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -20, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="relative overflow-hidden rounded-3xl glass-deep noise p-6 text-center"
    >
      <div className="glow-orb absolute -top-16 -right-16 size-44 bg-amber-500/16" />
      <Badge tone={esfriando ? "rose" : "amber"} pulse>
        {esfriando ? "esfriando!" : "pronto p/ entrega"}
      </Badge>

      <p className="mt-3 text-[10px] uppercase tracking-[0.3em] font-bold text-stone-500">levar para a</p>
      <motion.p
        key={pedido.id}
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 12 }}
        className="font-display leading-[0.9] text-[7rem] sm:text-[8.5rem] text-gradient drop-shadow-[0_0_40px_rgba(255,150,20,0.25)]"
      >
        {pedido.mesaNome.replace("Mesa ", "")}
      </motion.p>

      <p className="text-sm text-stone-300">
        p/ <b className="text-amber-300">{pedido.clienteNome}</b> · pedido #{pedido.id}
      </p>

      <ul className="mx-auto mt-4 max-w-xs space-y-1.5 rounded-2xl bg-black/35 border border-white/[0.07] p-3.5 text-left">
        {pedido.itens.map((i) => (
          <li key={i.id} className="text-[13px] text-stone-200 leading-snug">
            <b className="font-mono text-amber-300">{i.qtd}×</b> {i.nome}
            {i.escolha && <span className="text-sky-300 text-[11px]"> · {i.escolha.nome}</span>}
            {i.removidos.length > 0 && <span className="block text-[11px] text-rose-300/85">sem {i.removidos.join(", ")}</span>}
          </li>
        ))}
      </ul>

      <p className="mt-3 flex items-center justify-center gap-1.5 font-mono text-xs text-stone-500 tabular">
        <Timer className="size-3.5" /> pronto há {elapsed(pedido.criadoEm)}
      </p>

      <div className="mt-4">
        <Btn full size="lg" variant="lime" onClick={onEntregar}>
          <Footprints className="size-5" /> Levei na mesa!
        </Btn>
      </div>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-stone-500">
        <Sparkles className="size-3" /> a voz anuncia só o número — do jeito divertido
        <BellRing className="size-3" />
      </p>
    </motion.article>
  );
}
