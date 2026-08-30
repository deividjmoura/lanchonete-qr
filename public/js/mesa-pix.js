// PIX na conta da mesa — sobrescreve openSessao + "Já paguei"
(function () {
  function waitReady(fn) {
    if (typeof openSessao === 'function' && window.LQRPix) return fn();
    setTimeout(function () { waitReady(fn); }, 30);
  }

  waitReady(async function () {
    try { await LQRPix.loadConfig(); } catch (_) {}
    const gatewayAtivo = !!(window.LQRPix && LQRPix.config && LQRPix.config.gatewayAtivo);

    const _open = openSessao;
    window.openSessao = function openSessaoPix() {
      _open();
      const s = window.sessaoData || { totalDevido: 0, pedidos: [], valorPago: 0, valorRestante: 0 };
      const totalConta = Number(s.totalDevido || 0);
      const pago = Number(s.valorPago || 0);
      const restante =
        s.valorRestante != null
          ? Number(s.valorRestante)
          : Math.max(0, Number((totalConta - pago).toFixed(2)));
      // QR e copia-e-cola usam o que ainda falta pagar
      const total = restante;
      const sheet = document.querySelector('.modal-sheet');
      if (!sheet || sheet.querySelector('.pix-mesa')) return;

      const br = function (n) {
        return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
      };

      const div = document.createElement('div');
      div.className = 'pix-mesa';
      div.style.cssText =
        'margin-top:16px;padding:14px;border:1px dashed rgba(240,235,224,.25);border-radius:12px;text-align:center';

      const temPedido = (s.pedidos || []).length > 0;
      const temPendente = (s.pedidos || []).some(function (p) {
        return p.status && p.status !== 'entregue';
      });

      if (totalConta <= 0) {
        let msg =
          'Quando os pedidos forem <b>entregues</b>, o total aparece aqui com QR Code PIX para pagar na mesa.';
        if (temPedido && temPendente) {
          msg =
            'Há pedido em andamento. O QR PIX libera assim que o garçom marcar como <b>entregue</b>.';
        } else if (!temPedido) {
          msg = 'Faça um pedido — depois de entregue, o PIX da conta aparece aqui.';
        }
        div.innerHTML =
          '<div style="font-weight:700;margin-bottom:6px">Pagamento</div>' +
          '<p class="muted" style="font-size:.85rem;margin:0">' +
          msg +
          '</p>';
        sheet.appendChild(div);
      } else if (total <= 0.009) {
        div.innerHTML =
          '<div style="font-weight:700;margin-bottom:6px">Pagamento</div>' +
          '<p class="muted" style="font-size:.85rem;margin:0;color:#86efac">Conta quitada no caixa (nada a pagar no momento).</p>';
        sheet.appendChild(div);
      } else if (LQRPix.disponivel()) {
        const payload = LQRPix.montarPayload(total);
        const qr = LQRPix.qrUrl(total);
        // Enquanto houver restante, o botão fica disponível para cada pagante avisar.
        // Se já avisou recentemente, mostra um lembrete + opção de avisar de novo.
        const jaAvisou = !!s.pixInformadoEm;
        let ja;
        if (gatewayAtivo) {
          ja =
            '<button class="btn primary" type="button" style="width:100%;margin-top:10px" id="btnPixGateway">Gerar PIX PagBank · confirmação automática</button>' +
            '<p class="muted" style="margin:8px 0 0;font-size:.8rem">Ou use o QR estático abaixo e avise o caixa manualmente.</p>' +
            (jaAvisou
              ? '<button class="btn" type="button" style="width:100%;margin-top:8px" id="btnPixPago">Já paguei (estático) · avisar de novo</button>'
              : '<button class="btn" type="button" style="width:100%;margin-top:8px" id="btnPixPago">Já paguei (estático) · avisar o caixa</button>');
        } else {
          ja = jaAvisou
            ? '<p class="muted" style="margin:12px 0 8px;font-size:.85rem;color:#86efac">✓ Caixa já foi avisado. Se outro da mesa também pagou, avise de novo.</p>' +
              '<button class="btn" type="button" style="width:100%" id="btnPixPago">Já paguei no PIX · avisar de novo</button>'
            : '<button class="btn" type="button" style="width:100%;margin-top:10px" id="btnPixPago">Já paguei no PIX · avisar o caixa</button>';
        }
        const detalhe =
          pago > 0.009
            ? 'Restante a pagar · ' +
              br(total) +
              ' (conta ' +
              br(totalConta) +
              ' − pago ' +
              br(pago) +
              ')'
            : 'Valor da conta · ' + br(total);
        div.innerHTML =
          '<div style="font-weight:700;margin-bottom:6px">💳 Pagar com PIX</div>' +
          '<p class="muted" style="font-size:.85rem;margin:0 0 10px">' +
          detalhe +
          '. Escaneie o QR, pague e toque em “Já paguei” (ou mostre o comprovante no caixa). O caixa confirma o valor de cada um.</p>' +
          '<img src="' + qr + '" alt="QR PIX" width="200" height="200" style="border-radius:12px;background:#fff;padding:8px" loading="lazy">' +
          '<button class="btn primary" type="button" style="width:100%;margin-top:12px" id="btnCopiarPixMesa">Copiar código PIX</button>' +
          ja;
        sheet.appendChild(div);

        const copyBtn = document.getElementById('btnCopiarPixMesa');
        if (copyBtn) {
          copyBtn.addEventListener('click', function () {
            navigator.clipboard.writeText(payload).then(
              function () {
                if (typeof showToast === 'function') showToast('Código PIX copiado', 2200);
                else alert('Código PIX copiado');
              },
              function () { alert('Não foi possível copiar'); }
            );
          });
        }
        const pagoBtn = document.getElementById('btnPixPago');
        if (pagoBtn) {
          pagoBtn.addEventListener('click', async function () {
            pagoBtn.disabled = true;
            pagoBtn.textContent = 'Avisando…';
            try {
              const token = location.pathname.split('/').filter(Boolean).pop();
              const r = await fetch('/api/mesas/' + token + '/pix-informado', { method: 'POST' });
              const d = await r.json().catch(function () { return {}; });
              if (!r.ok) {
                alert(d.error || 'Não foi possível avisar');
                pagoBtn.disabled = false;
                pagoBtn.textContent = jaAvisou
                  ? 'Já paguei no PIX · avisar de novo'
                  : 'Já paguei no PIX · avisar o caixa';
                return;
              }
              if (window.sessaoData) {
                window.sessaoData.pixInformadoEm = d.pixInformadoEm || new Date().toISOString();
                if (d.valorPago != null) window.sessaoData.valorPago = Number(d.valorPago);
                if (d.valorRestante != null) window.sessaoData.valorRestante = Number(d.valorRestante);
                if (d.valorTotal != null) window.sessaoData.totalDevido = Number(d.valorTotal);
              }
              if (typeof showToast === 'function') showToast('Caixa avisado · obrigado!', 2800);
              if (typeof loadSessao === 'function') {
                await loadSessao();
              } else {
                pagoBtn.disabled = false;
                pagoBtn.textContent = 'Já paguei no PIX · avisar de novo';
                const hint = pagoBtn.previousElementSibling;
                if (hint && hint.classList && hint.classList.contains('muted')) {
                  hint.textContent = '✓ Caixa avisado de novo. Se mais alguém pagou, pode avisar outra vez.';
                  hint.style.color = '#86efac';
                }
              }
            } catch (e) {
              alert('Falha de rede');
              pagoBtn.disabled = false;
              pagoBtn.textContent = jaAvisou
                ? 'Já paguei no PIX · avisar de novo'
                : 'Já paguei no PIX · avisar o caixa';
            }
          });
        }
        const gwBtn = document.getElementById('btnPixGateway');
        if (gwBtn) {
          gwBtn.addEventListener('click', async function () {
            gwBtn.disabled = true;
            gwBtn.textContent = 'Gerando cobrança…';
            try {
              const token = location.pathname.split('/').filter(Boolean).pop();
              const r = await fetch('/api/mesas/' + token + '/pix-cobranca', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ valor: total }),
              });
              const d = await r.json().catch(function () { return {}; });
              if (!r.ok) {
                alert(d.error || 'Não foi possível gerar PIX PagBank');
                gwBtn.disabled = false;
                gwBtn.textContent = 'Gerar PIX PagBank · confirmação automática';
                return;
              }
              const area = document.createElement('div');
              area.style.cssText = 'margin-top:12px;padding:12px;border:1px solid #16a34a;border-radius:12px;background:rgba(22,163,74,.08)';
              area.innerHTML =
                '<div style="font-weight:700;margin-bottom:6px">PIX PagBank · R$ ' +
                Number(d.valor).toFixed(2).replace('.', ',') +
                '</div>' +
                (d.qrPngUrl
                  ? '<img src="' + d.qrPngUrl + '" alt="QR PagBank" width="200" height="200" style="border-radius:12px;background:#fff;padding:8px" loading="lazy">'
                  : '') +
                (d.qrText
                  ? '<button class="btn primary" type="button" style="width:100%;margin-top:10px" id="btnCopiarPixGw">Copiar código PIX</button>'
                  : '') +
                '<p class="muted" style="margin:10px 0 0;font-size:.8rem">Pague este QR. A confirmação é automática — o caixa recebe o aviso sozinho.</p>';
              const host = document.querySelector('.pix-mesa');
              if (host) host.appendChild(area);
              const cpy = document.getElementById('btnCopiarPixGw');
              if (cpy && d.qrText) {
                cpy.addEventListener('click', function () {
                  navigator.clipboard.writeText(d.qrText).then(
                    function () {
                      if (typeof showToast === 'function') showToast('Código PIX copiado', 2200);
                      else alert('Código PIX copiado');
                    },
                    function () { alert('Não foi possível copiar'); }
                  );
                });
              }
              gwBtn.textContent = 'Cobrança gerada · aguardando pagamento';
              if (typeof showToast === 'function') showToast('PIX PagBank gerado', 2500);
              // polling leve do status
              if (d.cobrancaId) {
                let n = 0;
                const t = setInterval(async function () {
                  n += 1;
                  if (n > 60) { clearInterval(t); return; }
                  try {
                    const sr = await fetch('/api/pix-cobrancas/' + d.cobrancaId);
                    const sd = await sr.json();
                    if (sd && sd.status === 'PAID') {
                      clearInterval(t);
                      if (typeof showToast === 'function') showToast('Pagamento confirmado! ✓', 3500);
                      if (typeof loadSessao === 'function') await loadSessao();
                    }
                  } catch (_) {}
                }, 4000);
              }
            } catch (e) {
              alert('Falha de rede');
              gwBtn.disabled = false;
              gwBtn.textContent = 'Gerar PIX PagBank · confirmação automática';
            }
          });
        }
      } else {
        div.innerHTML =
          '<div style="font-weight:700;margin-bottom:6px">Pagamento</div>' +
          '<p class="muted" style="font-size:.85rem;margin:0">PIX ainda não configurado neste servidor. Pague no caixa ou chame o atendente.</p>';
        sheet.appendChild(div);
      }
    };
  });
})();
