// PIX na conta da mesa — sobrescreve openSessao + "Já paguei"
(function () {
  function waitReady(fn) {
    if (typeof openSessao === 'function' && window.LQRPix) return fn();
    setTimeout(function () { waitReady(fn); }, 30);
  }

  waitReady(async function () {
    try { await LQRPix.loadConfig(); } catch (_) {}

    const _open = openSessao;
    window.openSessao = function openSessaoPix() {
      _open();
      const s = window.sessaoData || { totalDevido: 0 };
      const total = Number(s.totalDevido || 0);
      const sheet = document.querySelector('.modal-sheet');
      if (!sheet || sheet.querySelector('.pix-mesa')) return;

      const br = function (n) {
        return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
      };

      const div = document.createElement('div');
      div.className = 'pix-mesa';
      div.style.cssText =
        'margin-top:16px;padding:14px;border:1px dashed rgba(240,235,224,.25);border-radius:12px;text-align:center';

      if (total <= 0) {
        div.innerHTML =
          '<div style="font-weight:700;margin-bottom:6px">Pagamento</div>' +
          '<p class="muted" style="font-size:.85rem;margin:0">Quando os pedidos forem <b>entregues</b>, o total aparece aqui com QR Code PIX para pagar na mesa.</p>';
        sheet.appendChild(div);
      } else if (LQRPix.disponivel()) {
        const payload = LQRPix.montarPayload(total);
        const qr = LQRPix.qrUrl(total);
        const ja = s.pixInformadoEm
          ? '<p class="muted" style="margin:12px 0 0;font-size:.85rem;color:#86efac">✓ Você avisou que pagou. Aguarde o caixa confirmar.</p>'
          : '<button class="btn" type="button" style="width:100%;margin-top:10px" id="btnPixPago">Já paguei no PIX · avisar o caixa</button>';
        div.innerHTML =
          '<div style="font-weight:700;margin-bottom:6px">💳 Pagar com PIX</div>' +
          '<p class="muted" style="font-size:.85rem;margin:0 0 10px">Valor da conta · ' +
          br(total) +
          '. Escaneie o QR, pague e toque em “Já paguei” (ou mostre o comprovante no caixa).</p>' +
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
                pagoBtn.textContent = 'Já paguei no PIX · avisar o caixa';
                return;
              }
              if (window.sessaoData) window.sessaoData.pixInformadoEm = d.pixInformadoEm || new Date().toISOString();
              if (typeof showToast === 'function') showToast('Caixa avisado · obrigado!', 2800);
              pagoBtn.replaceWith(
                Object.assign(document.createElement('p'), {
                  className: 'muted',
                  style: 'margin:12px 0 0;font-size:.85rem;color:#86efac',
                  textContent: '✓ Você avisou que pagou. Aguarde o caixa confirmar.',
                })
              );
            } catch (e) {
              alert('Falha de rede');
              pagoBtn.disabled = false;
              pagoBtn.textContent = 'Já paguei no PIX · avisar o caixa';
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
