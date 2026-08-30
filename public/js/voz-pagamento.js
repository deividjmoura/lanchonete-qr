/**
 * voz-pagamento.js
 * Anuncia por voz (Web Speech API) quando uma mesa informa pagamento via PIX.
 * Sem custo / sem API key — TTS nativo do navegador.
 *
 * Modos: formal | engracado | silvio | aleatorio
 * Uso: window.anunciarPagamento({ mesa: 2, forma: 'pix' })
 *
 * Nota: a voz real do Silvio Santos não existe no navegador.
 * O modo "silvio" usa frases no estilo + tom de apresentador (homenagem).
 */
(function (global) {
  const CONFIG = {
    ativo: true,
    modo: 'silvio', // 'formal' | 'engracado' | 'silvio' | 'aleatorio'
    volume: 1,
    pitch: 1.15,
    rate: 1.08,
    idioma: 'pt-BR',
  };

  const FRASES_FORMAIS = [
    (mesa, forma) => 'A conta da mesa ' + mesa + ' foi paga via ' + forma + '.',
    (mesa, forma) => 'Pagamento confirmado. Mesa ' + mesa + ', ' + forma + '.',
    (mesa, forma) => 'Mesa ' + mesa + ' quitada. Forma de pagamento: ' + forma + '.',
  ];

  const FRASES_ENGRACADAS = [
    (mesa, forma) => 'Ihaaa! A mesa ' + mesa + ' já pagou no ' + forma + '!',
    (mesa, forma) => 'Dinheiro na conta! Mesa ' + mesa + ' mandou o ' + forma + '!',
    (mesa, forma) => 'Alerta de sucesso: mesa ' + mesa + ' pagou no ' + forma + ', bora liberar!',
    (mesa, forma) => 'Isso aí! Mesa ' + mesa + ' acabou de pagar via ' + forma + '!',
    (mesa, forma) => 'Show de bola, mesa ' + mesa + ' quitou no ' + forma + '!',
  ];

  // Homenagem ao estilo de apresentador (não é a voz real)
  const FRASES_SILVIO = [
    (mesa, forma) => 'Ma oê! A mesa ' + mesa + ' pagou no ' + forma + '! Quem quer dinheiro? Essa mesa já mandou!',
    (mesa, forma) => 'É o milhão! Ops, é o ' + forma + ' da mesa ' + mesa + '! Valendo!',
    (mesa, forma) => 'Olha o aviãozinho! Chegou o pagamento da mesa ' + mesa + ' no ' + forma + '!',
    (mesa, forma) => 'Mah oê! Mesa ' + mesa + ' no ' + forma + '! Pode abrir o baú, caixa!',
    (mesa, forma) => 'Não é o SBT, mas a mesa ' + mesa + ' pagou no ' + forma + '! É de verdade!',
    (mesa, forma) => 'Ritmo total! Mesa ' + mesa + ' acabou de pagar via ' + forma + '! Próximo quadro: liberar a mesa!',
    (mesa, forma) => 'Certo ou errado? Certo! Mesa ' + mesa + ' quitou no ' + forma + '!',
    (mesa, forma) => 'Atenção auditório! Mesa ' + mesa + ' mandou o ' + forma + '! Pode comemorar!',
  ];

  const fila = [];
  let falando = false;
  let vozesCache = null;

  function escolherVoz() {
    if (!vozesCache || vozesCache.length === 0) {
      vozesCache = global.speechSynthesis.getVoices() || [];
    }
    if (!vozesCache.length) return null;

    const pt = vozesCache.filter(function (v) {
      return v.lang && (v.lang === 'pt-BR' || v.lang.indexOf('pt') === 0);
    });
    const lista = pt.length ? pt : vozesCache;

    const masc = lista.find(function (v) {
      return /male|homem|daniel|ricardo|felipe|google português do brasil|pt-br/i.test(
        (v.name || '') + ' ' + (v.voiceURI || '')
      );
    });
    if (masc) return masc;

    return (
      lista.find(function (v) { return v.lang === 'pt-BR'; }) ||
      lista.find(function (v) { return v.lang && v.lang.indexOf('pt') === 0; }) ||
      lista[0] ||
      null
    );
  }

  if ('speechSynthesis' in global) {
    global.speechSynthesis.onvoiceschanged = function () {
      vozesCache = global.speechSynthesis.getVoices();
    };
  }

  function paramsPorModo(modo) {
    if (modo === 'silvio') return { pitch: 1.18, rate: 1.12 };
    if (modo === 'formal') return { pitch: 1.0, rate: 0.98 };
    return { pitch: CONFIG.pitch, rate: CONFIG.rate };
  }

  function processarFila() {
    if (falando || fila.length === 0) return;
    falando = true;
    const item = fila.shift();
    const texto = typeof item === 'string' ? item : item.texto;
    const modo = (item && item.modo) || CONFIG.modo;
    const params = paramsPorModo(modo);

    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = CONFIG.idioma;
    utter.volume = CONFIG.volume;
    utter.pitch = params.pitch;
    utter.rate = params.rate;
    const voz = escolherVoz();
    if (voz) utter.voice = voz;
    utter.onend = utter.onerror = function () {
      falando = false;
      processarFila();
    };
    global.speechSynthesis.speak(utter);
  }

  function bancoDoModo(modo) {
    if (modo === 'formal') return FRASES_FORMAIS;
    if (modo === 'silvio') return FRASES_SILVIO;
    if (modo === 'engracado') return FRASES_ENGRACADAS;
    return FRASES_FORMAIS.concat(FRASES_ENGRACADAS, FRASES_SILVIO);
  }

  function anunciarPagamento(opts) {
    opts = opts || {};
    const mesa = opts.mesa;
    let forma = opts.forma || 'pix';
    if (String(forma).toUpperCase() === 'PIX') forma = 'PIX';
    const modo = opts.modo || CONFIG.modo;

    if (!CONFIG.ativo) return;
    if (!('speechSynthesis' in global)) {
      console.warn('[voz-pagamento] Web Speech API não suportada neste navegador.');
      return;
    }
    if (mesa === undefined || mesa === null) {
      console.warn('[voz-pagamento] número da mesa não informado.');
      return;
    }

    const banco = bancoDoModo(modo);
    const gerador = banco[Math.floor(Math.random() * banco.length)];
    fila.push({ texto: gerador(mesa, forma), modo: modo });
    processarFila();
  }

  function definirAtivo(ativo) {
    CONFIG.ativo = !!ativo;
    if (!ativo && global.speechSynthesis) {
      global.speechSynthesis.cancel();
      fila.length = 0;
      falando = false;
    }
  }

  function definirModo(modo) {
    CONFIG.modo = modo;
  }

  global.anunciarPagamento = anunciarPagamento;
  global.vozPagamentoConfig = CONFIG;
  global.vozPagamentoDefinirAtivo = definirAtivo;
  global.vozPagamentoDefinirModo = definirModo;
})(window);
