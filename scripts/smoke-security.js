#!/usr/bin/env node
/**
 * Smoke de segurança — cobre os patches de:
 *   4. SSRF em db/foto.js (upload-foto por URL)
 *   5. Rate limit (login, checkin, trocar-senha)
 *   6. Rotação de senha (POST /api/trocar-senha)
 *
 * IMPORTANTE — rode este script por último (ou sozinho): ele "gasta" de
 * propósito a janela de tentativas de /api/login e /api/mesas/:token/checkin
 * para provocar o 429. Isso deixa login temporariamente bloqueado para o IP
 * de teste por alguns minutos (janela de 5 min), o que pode derrubar os
 * outros smokes se rodarem logo em seguida na mesma máquina.
 *
 * Pré-requisitos:
 *   - servidor no ar (npm start) com a migration 0014 aplicada
 *   - banco com pelo menos 1 mesa (npm run db:seed)
 *   - STAFF_SEED_PASSWORD no .env (default: troque-esta-senha)
 *
 * Uso:
 *   BASE_URL=http://localhost:3000 npm run test:security
 */
require('dotenv').config();
const { criarCliente } = require('./_smoke-lib');

const { BASE, SENHA, log, skip, fail, req, login } = criarCliente();

async function main() {
  console.log(`\n🔒 Smoke Segurança · ${BASE}\n`);

  const cookieAdmin = await login('admin');

  // ==========================================================================
  // 4. SSRF — upload-foto por URL não pode alcançar rede interna
  // ==========================================================================
  console.log('\n  ── SSRF (upload-foto) ──');

  const alvosInternos = [
    'http://169.254.169.254/latest/meta-data/', // metadata AWS/GCP
    'http://127.0.0.1:5432/',
    'http://10.0.0.5/x.png',
    'http://192.168.0.1/x.png',
    'http://localhost/x.png',
    'http://user:pass@example.com/x.png', // credenciais embutidas
  ];
  for (const url of alvosInternos) {
    const { res, data } = await req('POST', '/api/admin/upload-foto', {
      cookie: cookieAdmin,
      body: { url },
    });
    if (res.status !== 400) {
      fail(`upload-foto deveria recusar "${url}" com 400 (veio ${res.status})`, data);
    }
    log(`bloqueado: ${url}`);
  }

  {
    const { res, data } = await req('POST', '/api/admin/upload-foto', {
      cookie: cookieAdmin,
      body: { url: 'ftp://example.com/x.png' },
    });
    if (res.status !== 400) fail('esquema ftp:// deveria ser recusado com 400', data);
    log('bloqueado: esquema não-http(s)');
  }

  {
    // URL pública real: não deve cair no bloqueio de SSRF (pode falhar por
    // outro motivo — rede indisponível no ambiente de teste — e tudo bem).
    const { res, data } = await req('POST', '/api/admin/upload-foto', {
      cookie: cookieAdmin,
      body: { url: 'https://httpbin.org/image/png' },
    });
    if (res.status === 400 && /endereço de rede|resolver o host/.test(data?.error || '')) {
      fail('URL pública sendo bloqueada como se fosse rede interna', data);
    }
    log('URL pública não é tratada como alvo interno');
  }

  // ==========================================================================
  // 5. Rate limit
  // ==========================================================================
  console.log('\n  ── Rate limit ──');

  {
    let tentativas = 0;
    let bloqueado = false;
    for (let i = 1; i <= 15; i++) {
      tentativas = i;
      const { res } = await req('POST', '/api/login', {
        body: { usuario: 'admin', senha: 'senha-errada-' + i },
      });
      if (res.status === 429) {
        bloqueado = true;
        break;
      }
      if (res.status !== 401) fail(`login inválido deveria dar 401 (veio ${res.status})`);
    }
    if (!bloqueado) fail(`/api/login nunca retornou 429 após ${tentativas} tentativas`);
    log(`/api/login → 429 após ${tentativas} tentativa(s) nesta rodada`);
  }

  {
    const { data: mesas } = await req('GET', '/api/admin/mesas', {
      cookie: cookieAdmin,
      expectStatus: 200,
    });
    const mesa = Array.isArray(mesas) ? mesas[0] : null;
    if (!mesa?.token) {
      skip('sem mesa disponível — pulando rate limit de checkin');
    } else {
      let tentativas = 0;
      let bloqueado = false;
      for (let i = 1; i <= 30; i++) {
        tentativas = i;
        const { res } = await req('POST', `/api/mesas/${mesa.token}/checkin`, {
          body: { clienteNome: 'Rate Limit Test' },
        });
        if (res.status === 429) {
          bloqueado = true;
          break;
        }
      }
      if (!bloqueado) fail(`checkin nunca retornou 429 após ${tentativas} tentativas`);
      log(`checkin → 429 após ${tentativas} tentativa(s) nesta rodada`);
    }
  }

  // ==========================================================================
  // 6. Rotação de senha
  // ==========================================================================
  console.log('\n  ── Rotação de senha ──');

  const sessaoQueTroca = await login('admin');
  const outraSessao = await login('admin'); // deve ser derrubada pela troca
  const SENHA_TEMP = SENHA + '-tmp1';

  {
    const { res, data } = await req('POST', '/api/trocar-senha', {
      cookie: sessaoQueTroca,
      body: { senhaAtual: 'com-certeza-errada', novaSenha: SENHA_TEMP },
    });
    if (res.status !== 401) fail('senha atual incorreta deveria dar 401', { status: res.status, data });
    log('recusa senha atual incorreta');
  }

  {
    const { res, data } = await req('POST', '/api/trocar-senha', {
      cookie: sessaoQueTroca,
      body: { senhaAtual: SENHA, novaSenha: '123' },
    });
    if (res.status !== 400) fail('senha nova curta demais deveria dar 400', { status: res.status, data });
    log('recusa senha nova curta demais');
  }

  {
    const { res, data } = await req('POST', '/api/trocar-senha', {
      cookie: sessaoQueTroca,
      body: { senhaAtual: SENHA, novaSenha: 'admin' },
    });
    if (res.status !== 400) fail('senha igual ao login deveria dar 400', { status: res.status, data });
    log('recusa senha igual ao usuário');
  }

  {
    const { res, data } = await req('POST', '/api/trocar-senha', {
      cookie: sessaoQueTroca,
      body: { senhaAtual: SENHA, novaSenha: SENHA_TEMP },
    });
    if (res.status !== 200 || !data?.ok) fail('troca de senha válida falhou', { status: res.status, data });
    log('senha trocada com sucesso');
  }

  {
    const { res } = await req('GET', '/api/me', { cookie: outraSessao });
    if (res.status !== 401) fail('outra sessão do mesmo usuário deveria ter sido derrubada', { status: res.status });
    log('outras sessões do usuário foram invalidadas pela troca');
  }

  {
    const { res, data } = await req('GET', '/api/me', { cookie: sessaoQueTroca, expectStatus: 200 });
    if (typeof data?.staff?.precisaTrocarSenha !== 'boolean') {
      fail('staff.precisaTrocarSenha ausente ou não-booleano', data);
    }
    log(`sessão que trocou continua válida · precisaTrocarSenha=${data.staff.precisaTrocarSenha}`);
  }

  {
    // reverte para não quebrar os outros smokes, que dependem de STAFF_SEED_PASSWORD
    const { res, data } = await req('POST', '/api/trocar-senha', {
      cookie: sessaoQueTroca,
      body: { senhaAtual: SENHA_TEMP, novaSenha: SENHA },
    });
    if (res.status !== 200 || !data?.ok) {
      fail('não foi possível reverter a senha para o valor original — rode scripts/reset-senha.js', {
        status: res.status,
        data,
      });
    }
    log('senha revertida para STAFF_SEED_PASSWORD');
  }

  console.log('\n✅ Smoke Segurança OK — SSRF, rate limit e rotação de senha cobertos.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
