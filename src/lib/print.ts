/** Utilitários de impressão (comanda + relatório PDF via janela do browser). */

import type { Pedido } from "./types";
import { BRL } from "./utils";

export function imprimirComanda(pedido: Pedido) {
  const itens = (pedido.itens || [])
    .map((it) => {
      const extras = [
        ...(it.adicionais || []).map((a) => `+ ${a.nome}`),
        ...(it.removidos || []).map((r) => `sem ${r}`),
        it.escolha ? `→ ${it.escolha.nome}` : "",
        it.obs ? `(${it.obs})` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<tr>
        <td style="padding:4px 0;vertical-align:top">${it.qtd}x</td>
        <td style="padding:4px 0">${it.nome}${extras ? `<br><small style="color:#444">${extras}</small>` : ""}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Comanda #${pedido.id}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:16px;color:#000;max-width:320px;margin:0 auto}
  h1{font-size:1.25rem;margin:0 0 4px}
  .meta{font-size:.85rem;color:#333;margin-bottom:12px}
  table{width:100%;border-collapse:collapse;font-size:.95rem}
  hr{border:none;border-top:1px dashed #999;margin:12px 0}
  @media print{body{padding:0}}
</style></head><body>
  <h1>Comanda #${pedido.id}</h1>
  <div class="meta">
    <div><b>${pedido.mesaNome || "Mesa"}</b></div>
    <div>${pedido.clienteNome || "—"}</div>
    <div>${new Date(pedido.criadoEm).toLocaleString("pt-BR")}</div>
    <div>Status: ${pedido.status}</div>
  </div>
  <hr/>
  <table>${itens || "<tr><td>Sem itens</td></tr>"}</table>
  <hr/>
  <p style="text-align:right;font-weight:700;font-size:1.1rem">Total ${BRL(pedido.total || 0)}</p>
  <script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>
</body></html>`;

  const w = window.open("", "_blank", "noopener,noreferrer,width=420,height=640");
  if (!w) {
    alert("Permita pop-ups para imprimir a comanda");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function imprimirRelatorioPdf(opts: {
  from: string;
  to: string;
  resumo: Record<string, unknown>;
  contas: any[];
  porDia?: any[];
}) {
  const { from, to, resumo, contas, porDia = [] } = opts;
  const fat = Number(resumo.faturamento ?? 0);
  const qtd = Number(resumo.contasFechadas ?? contas.length);
  const ticket = Number(resumo.ticketMedio ?? (qtd ? fat / qtd : 0));
  const porForma = (resumo.porFormaPagamento || {}) as Record<string, number>;

  const rows = contas
    .map(
      (c) =>
        `<tr>
          <td>${c.id}</td><td>${c.mesa ?? ""}</td><td>${c.cliente ?? "—"}</td>
          <td style="text-align:right">${BRL(Number(c.valorCobrado ?? c.valor ?? 0))}</td>
          <td>${c.forma ?? ""}</td>
          <td>${c.fechadaEm ? String(c.fechadaEm).slice(0, 16).replace("T", " ") : ""}</td>
        </tr>`
    )
    .join("");

  const dias = porDia
    .map(
      (d) =>
        `<tr><td>${d.dia}</td><td>${d.contas}</td><td style="text-align:right">${BRL(Number(d.faturamento || 0))}</td></tr>`
    )
    .join("");

  const formas = Object.entries(porForma)
    .map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${BRL(Number(v || 0))}</td></tr>`)
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Relatório ${from} — ${to}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:900px;margin:0 auto}
  h1{font-size:1.5rem;margin:0 0 8px}
  .kpis{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}
  .kpi{border:1px solid #ddd;border-radius:8px;padding:12px 16px;min-width:120px}
  .kpi span{display:block;font-size:.75rem;color:#666;text-transform:uppercase}
  .kpi b{font-size:1.15rem}
  table{width:100%;border-collapse:collapse;font-size:.9rem;margin:12px 0 24px}
  th,td{border-bottom:1px solid #e5e5e5;padding:8px 6px;text-align:left}
  th{font-size:.7rem;text-transform:uppercase;color:#666}
  @media print{button{display:none}}
</style></head><body>
  <button onclick="window.print()" style="padding:10px 16px;font-weight:600;cursor:pointer;margin-bottom:12px">Imprimir / Salvar PDF</button>
  <h1>Relatório de vendas</h1>
  <p>Período: <b>${from}</b> → <b>${to}</b> · Gerado em ${new Date().toLocaleString("pt-BR")}</p>
  <div class="kpis">
    <div class="kpi"><span>Faturamento</span><b>${BRL(fat)}</b></div>
    <div class="kpi"><span>Contas</span><b>${qtd}</b></div>
    <div class="kpi"><span>Ticket médio</span><b>${BRL(ticket)}</b></div>
  </div>
  ${formas ? `<h2>Por forma de pagamento</h2><table><thead><tr><th>Forma</th><th>Total</th></tr></thead><tbody>${formas}</tbody></table>` : ""}
  ${dias ? `<h2>Por dia</h2><table><thead><tr><th>Dia</th><th>Contas</th><th>Faturamento</th></tr></thead><tbody>${dias}</tbody></table>` : ""}
  <h2>Contas fechadas</h2>
  <table>
    <thead><tr><th>#</th><th>Mesa</th><th>Cliente</th><th>Valor</th><th>Forma</th><th>Fechada</th></tr></thead>
    <tbody>${rows || "<tr><td colspan=6>Nenhuma conta no período</td></tr>"}</tbody>
  </table>
  <p style="font-size:.8rem;color:#666">Use “Salvar como PDF” na impressão do navegador.</p>
</body></html>`;

  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) {
    alert("Permita pop-ups para gerar o PDF");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
