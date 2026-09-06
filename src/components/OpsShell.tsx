import { motion } from "framer-motion";
import { ChefHat, ConciergeBell, House, LogOut, Volume2, VolumeX, Wallet, LayoutGrid } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { usePub } from "../store/usePub";
import { ir } from "../router";
import { cn } from "../utils/cn";
import { LivePill, Logo } from "./ui";
import { audioMudo, beepAlerta, beepDuplo, falar, setMudo } from "../lib/sonus";
import { FRASES_GARCOM, GARCOM_TOKEN } from "../lib/data";

const NAV = [
  { id: "cozinha", label: "Cozinha", icon: ChefHat, to: "/cozinha" },
  { id: "garcom", label: "Garçom", icon: ConciergeBell, to: `/garcom/${GARCOM_TOKEN}` },
  { id: "caixa", label: "Caixa", icon: Wallet, to: "/caixa" },
  { id: "admin", label: "Admin", icon: LayoutGrid, to: "/admin" },
];

/* Anúncios por papel — reproduz o comportamento dos alertas de voz do projeto:
   · Cozinha: pedido novo → mesa + cliente
   · Garçom: pedido pronto → nº da mesa (tom leve)
   · Caixa: pix informado / sessão fechada                          */
export function useAnuncios(papel: "cozinha" | "garcom" | "caixa") {
  const eventos = usePub((s) => s.eventos);
  const visto = useRef(0);
  useEffect(() => {
    const novos = eventos.filter((e) => e.seq > visto.current);
    if (!novos.length) return;
    visto.current = novos[novos.length - 1].seq;
    if (audioMudo()) return;
    const ultimo = novos[novos.length - 1];
    const mesaNum = (ultimo.mesaNome || "").replace(/\D/g, "");
    if (papel === "cozinha" && ultimo.tipo === "pedido-novo") {
      beepAlerta();
      falar(`Pedido novo! ${ultimo.texto.replace("Pedido novo · ", "")}`);
    }
    if (papel === "garcom" && ultimo.tipo === "pedido-pronto" && mesaNum) {
      beepDuplo();
      const frase = FRASES_GARCOM[Math.floor(Math.random() * FRASES_GARCOM.length)];
      falar(frase(mesaNum), { rate: 1.06, pitch: 1.05 });
    }
    if (papel === "caixa" && ultimo.tipo === "pix-avisado" && mesaNum) {
      beepDuplo();
      falar(`Aviso de PIX! Mesa ${mesaNum} disse que pagou.`);
    }
  }, [eventos, papel]);
}

export function OpsShell({
  ativo,
  children,
  titulo,
  kicker,
  extra,
}: {
  ativo: string;
  children: ReactNode;
  titulo: ReactNode;
  kicker: string;
  extra?: ReactNode;
}) {
  const somLigado = usePub((s) => s.somLigado);
  const toggleSom = usePub((s) => s.toggleSom);
  const logout = usePub((s) => s.logout);

  useEffect(() => {
    setMudo(!somLigado);
  }, [somLigado]);

  return (
    <div className="relative min-h-dvh">
      {/* ambientes */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="glow-orb absolute -top-40 left-1/4 size-[34rem] bg-amber-500/14" />
        <div className="glow-orb absolute top-1/3 -right-40 size-[28rem] bg-orange-600/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,#0c0a07_78%)]" />
      </div>

      {/* header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-coal-950/78 backdrop-blur-xl">
        <div className="mx-auto max-w-400 px-4 sm:px-6 h-16 flex items-center gap-3">
          <button onClick={() => ir("/")} className="cursor-pointer shrink-0">
            <Logo size="sm" />
          </button>
          <span className="hidden sm:block h-6 w-px bg-white/10" />
          <p className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-stone-400">
            {kicker} <LivePill />
          </p>

          <div className="flex-1" />

          <nav className="flex items-center gap-1 rounded-full bg-white/[0.05] border border-white/[0.08] p-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => ir(n.to)}
                className={cn(
                  "btn-press relative flex items-center gap-1.5 rounded-full px-3 sm:px-3.5 h-9 text-xs font-semibold cursor-pointer transition-colors",
                  ativo === n.id ? "text-zinc-950" : "text-stone-400 hover:text-white"
                )}
              >
                {ativo === n.id && (
                  <motion.span
                    layoutId="ops-nav"
                    className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400 to-orange-500"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <n.icon className="relative z-10 size-4" />
                <span className="relative z-10 hidden md:inline">{n.label}</span>
              </button>
            ))}
          </nav>

          <button
            onClick={toggleSom}
            title={somLigado ? "Silenciar alertas de voz" : "Ativar alertas de voz"}
            className={cn(
              "btn-press grid place-items-center size-10 rounded-full border cursor-pointer transition-colors",
              somLigado
                ? "bg-amber-400/12 border-amber-400/35 text-amber-300"
                : "bg-white/[0.05] border-white/10 text-stone-500"
            )}
          >
            {somLigado ? <Volume2 className="size-4.5" /> : <VolumeX className="size-4.5" />}
          </button>
          <button
            onClick={() => {
              ir("/");
            }}
            title="Início"
            className="btn-press hidden sm:grid place-items-center size-10 rounded-full bg-white/[0.05] border border-white/10 text-stone-400 hover:text-white cursor-pointer"
          >
            <House className="size-4.5" />
          </button>
          <button
            onClick={() => {
              logout();
              ir("/login");
            }}
            title="Sair"
            className="btn-press hidden sm:grid place-items-center size-10 rounded-full bg-white/[0.05] border border-white/10 text-stone-400 hover:text-rose-300 cursor-pointer"
          >
            <LogOut className="size-4.5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-400 px-4 sm:px-6 py-6 sm:py-10 pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-400/90">{kicker}</p>
            <h1 className="font-display text-5xl sm:text-7xl leading-[0.95] text-white mt-1">{titulo}</h1>
          </div>
          {extra}
        </div>
        {children}
      </main>
    </div>
  );
}
