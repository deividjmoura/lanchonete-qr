// PIX na conta da mesa — só após entrega; total fora dos cards
(function () {
  function whenReady(fn) {
    if (typeof openSessao === 'function' && window.LQRPix) return fn();
    setTimeout(function () { whenReady(fn); }, 40);
  }

  function getPayPref() {
    try {
      const token = location.pathname.split('/').filter(Boolean).pop();
      return sessionStorage.getItem('lq-pay-pref-' + token) || window._payPref || '';
    } catch (_) {
      return window._payPref || '';
    }
  }

  function pixBoxHtml(valor, opts) {
    opts = opts || {};
    const title = opts.title || 'Pagar no PIX';
    if (!LQRPix.disponivel()) {
      return (
        '<div class="pix-box">' +
        '<div class="pix-box__title">' + title + '</div>' +
        '<p class="muted" style="font-size:.82rem;margin:0">PIX ainda não configurado no servidor (PIX_CHAVE). Peça maquininha ao garçom ou pague no caixa.</p>' +
        '</div>'
      );
    }
    const payload = LQRPix.montarPayload(valor);
    if (!payload) {
      return (
        '<div class="pix-box">' +
        '<div class="pix-box__title">' + title + '</div>' +
        '<p class="muted" style="font-size:.82rem;margin:0">Não foi possível gerar o código PIX.</p>' +
        '</div>'
      );
    }
    const qr = LQRPix.qrUrl(valor);
    const brl = 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
    return (
      '<div class="pix-box">' +
      '<div class="pix-box__title">' + title + ' · <b>' + brl + '</b></div>' +
      '<div class="pix-box__row">' +
      '<img class="pix-box__qr" src="' + qr + '" alt="QR PIX" width="120" height="120" loading="lazy">' +
      '<div class="pix-box__copy">' +
      '<button type="button" class="btn pix-copy-btn">Copiar código PIX</button>' +
      '<p class="muted" style="font-size:.75rem;margin:8px 0 0">Cole no app do banco</p>' +
      '</div></div>' +
      '<input type="hidden" class="pix-payload" value="">' +
      '</div>'
    );
  }

  function wireCopy(root, valor) {
    if (!root || !window.LQRPix) return;
    const payload = LQRPix.montarPayload(valor);
    const btn = root.querySelector('.pix-copy-btn');
    if (btn && payload) {
      btn.addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(payload).then(function () {
            btn.textContent = 'Copiado!';
            setTimeout(function () { btn.textContent = 'Copiar código PIX'; }, 1600);
          }).catch(function () {
            prompt('Copie o código PIX:', payload);
          });
        } else {
          prompt('Copie o código PIX:', payload);
        }
      });
    }
  }

  function injectPix(s) {
    s = s || window.sessaoData || {};
    if (!window.LQRPix) return;
    const pref = getPayPref();

    // PIX por pedido: somente entregue + (pref pix ou ainda não escolheu)
    document.querySelectorAll('.pix-pedido').forEach(function (el) {
      if (el.getAttribute('data-pix-ready')) return;
      const valor = Number(el.getAttribute('data-valor') || 0);
      const status = el.getAttribute('data-status') || 'entregue';
      if (status !== 'entregue' || !(valor > 0.009)) {
        el.innerHTML = '';
        el.setAttribute('data-pix-ready', '1');
        return;
      }
      if (pref === 'garcom') {
        el.innerHTML =
          '<div class="pix-box"><p class="muted" style="margin:0;font-size:.85rem">Você pediu maquininha/troco com o garçom. Se preferir PIX agora, use o total da conta abaixo.</p></div>';
        el.setAttribute('data-pix-ready', '1');
        return;
      }
      el.innerHTML = pixBoxHtml(valor, { title: 'PIX deste pedido' });
      el.setAttribute('data-pix-ready', '1');
      wireCopy(el, valor);
    });

    // PIX total da conta (só o que já foi entregue / a pagar)
    const totalEl = document.querySelector('.pix-mesa-total');
    if (totalEl && !totalEl.getAttribute('data-pix-ready')) {
      const pago = Number(s.valorPago || 0);
      const rest =
        s.valorRestante != null
          ? Number(s.valorRestante)
          : Math.max(0, Number(s.totalDevido || 0) - pago);

      if (!(rest > 0.009)) {
        totalEl.innerHTML =
          '<p class="muted" style="font-size:.85rem;margin:8px 0 0">Nada a pagar no momento (só entram itens já <b>entregues</b>).</p>';
        totalEl.setAttribute('data-pix-ready', '1');
        return;
      }

      if (pref === 'garcom') {
        totalEl.innerHTML =
          '<div class="pix-box">' +
          '<div class="pix-box__title">Pagamento com o garçom</div>' +
          '<p class="muted" style="font-size:.85rem;margin:0 0 10px">Você escolheu maquininha/troco. A pagar: <b>R$ ' +
          rest.toFixed(2).replace('.', ',') +
          '</b>.</p>' +
          '<button type="button" class="btn" id="payPrefSwitchPix" style="width:100%">Prefiro pagar com PIX</button>' +
          '</div>';
        const sw = totalEl.querySelector('#payPrefSwitchPix');
        if (sw) {
          sw.onclick = function () {
            try {
              const token = location.pathname.split('/').filter(Boolean).pop();
              sessionStorage.setItem('lq-pay-pref-' + token, 'pix');
            } catch (_) {}
            window._payPref = 'pix';
            totalEl.removeAttribute('data-pix-ready');
            document.querySelectorAll('.pix-pedido').forEach(function (el) {
              el.removeAttribute('data-pix-ready');
            });
            injectPix(s);
          };
        }
        totalEl.setAttribute('data-pix-ready', '1');
        return;
      }

      if (LQRPix.disponivel()) {
        totalEl.innerHTML =
          pixBoxHtml(rest, { title: 'PIX do total da conta' }) +
          '<p class="muted pix-mesa-hint" style="font-size:.82rem;margin:10px 0 8px">Após pagar, avise o caixa.</p>' +
          '<button type="button" class="btn primary" id="pixJaPagueiBtn">' +
          (s.pixInformadoEm
            ? 'Já paguei no PIX · avisar de novo'
            : 'Já paguei no PIX · avisar o caixa') +
          '</button>';
        wireCopy(totalEl, rest);
        const pagoBtn = totalEl.querySelector('#pixJaPagueiBtn');
        if (pagoBtn) {
          const jaAvisou = !!s.pixInformadoEm;
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
              if (typeof loadSessao === 'function') await loadSessao();
            } catch (e) {
              alert('Falha de rede');
              pagoBtn.disabled = false;
              pagoBtn.textContent = jaAvisou
                ? 'Já paguei no PIX · avisar de novo'
                : 'Já paguei no PIX · avisar o caixa';
            }
          });
        }
      } else {
        totalEl.innerHTML =
          '<div class="pix-box"><div class="pix-box__title">Pagamento</div>' +
          '<p class="muted" style="font-size:.85rem;margin:0">Configure <code>PIX_CHAVE</code> no servidor para gerar QR. Enquanto isso, peça maquininha ao garçom.</p></div>';
      }
      totalEl.setAttribute('data-pix-ready', '1');
    }
  }

  whenReady(function () {
    LQRPix.loadConfig().then(function () {
      window._afterOpenSessao = function (s) {
        injectPix(s);
      };
    });
  });
})();
