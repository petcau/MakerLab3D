import { db }                                from './shared/firebase.js';
import { somEntrada, somAcerto, somErro, somFinalBom, somFinalRuim } from './shared/audio.js';
import { carregarPlayerCard }               from './shared/player-card.js';
import { registrarTentativa, salvarResultado } from './shared/resultado.js';
import { erroLoad, mostrarBloqueado, mostrarTelaFinal, voltarCard as _voltarCard } from './shared/ui.js';
import { doc, getDoc }                      from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const cardId = params.get('card');

// ── Alphabet code: A=1 … Z=26 ────────────────────────
const LABELS    = { decimal: 'DECIMAL', binario: 'BINÁRIO', letra: 'LETRA' };
const COR_FIOS  = ['#ef4444','#3b82f6','#eab308','#22c55e','#f97316','#a855f7','#ec4899','#06b6d4'];
const BITS      = [16, 8, 4, 2, 1];

function letraParaNum(l) {
  const c = (l || '').toUpperCase().trim();
  return (c.length === 1 && c >= 'A' && c <= 'Z') ? c.charCodeAt(0) - 64 : NaN;
}
function numParaBits(n) { return BITS.map(b => (n & b) !== 0 ? 1 : 0); }

function calcularResposta(valor, de, para) {
  let n;
  if      (de === 'decimal') n = parseInt(valor, 10);
  else if (de === 'binario') n = parseInt(valor, 2);
  else if (de === 'letra')   n = letraParaNum(valor);
  if (isNaN(n) || n < 1 || n > 26) return '';
  if (para === 'decimal') return n.toString();
  if (para === 'binario') return n.toString(2);
  if (para === 'letra')   return String.fromCharCode(n + 64);
  return '';
}

function validarResposta(entrada, valor, de, para) {
  const e = entrada.trim().toUpperCase();
  const correta = calcularResposta(valor, de, para);
  if (!correta) return false;
  if (para === 'binario') return parseInt(e, 2) === parseInt(correta, 2);
  if (para === 'letra')   return e === correta.toUpperCase();
  return e === correta;
}

// ── State ─────────────────────────────────────────────
let desafios = [], atualDesafio = 0;
let pontosGanhos = 0, acertos = 0, erros = 0;
let timerInterval = null, timerRestante = 0;
let tentativaRegistrada = false, resultadoDocId = null;
let tentativasUsadas = 0, tentativasPermitidas = 3;
let alunoUid = null, escolaId = null, avatarSrc = '';
let cardData = null;
let jogoAtivo = false;
let estadoBits = [0, 0, 0, 0, 0];

// ── Init ──────────────────────────────────────────────
async function init() {
  if (!cardId) { erroLoad('Card não especificado.'); return; }
  try {
    const dados = await carregarPlayerCard({ jogoNome: 'Desarmar a Bomba', cardId });
    alunoUid  = dados.uid;
    escolaId  = dados.escolaId;
    avatarSrc = dados.avatarSrc;

    const cardSnap = await getDoc(doc(db, 'cards', cardId));
    if (!cardSnap.exists()) { erroLoad('Card não encontrado.'); return; }
    cardData = cardSnap.data();

    document.getElementById('q-card-nome').textContent = cardData.nome || cardId;
    document.title = 'Desarmar a Bomba — ' + (cardData.nome || cardId);

    if (!(cardData.bomba_desafios?.length)) {
      erroLoad('Este card não tem desafios de Bomba cadastrados.');
      return;
    }

    tentativasPermitidas = cardData.bomba_tentativas || 3;
    resultadoDocId = alunoUid + '_bomba_' + cardId;

    const resultSnap = await getDoc(doc(db, 'resultados_bomba', resultadoDocId));
    if (resultSnap.exists()) tentativasUsadas = resultSnap.data().tentativas_usadas || 0;

    if (tentativasUsadas >= tentativasPermitidas) {
      mostrarBloqueado({ tentativasPermitidas, dados: resultSnap.exists() ? resultSnap.data() : null, labelItem: 'códigos' });
      return;
    }

    desafios = [...cardData.bomba_desafios];
    iniciarJogo();
  } catch(e) { erroLoad('Erro ao carregar: ' + e.message); }
}

// ── Start game ────────────────────────────────────────
function iniciarJogo() {
  jogoAtivo = true;
  document.getElementById('loading').style.display = 'none';
  document.getElementById('bm-box').style.display  = '';
  renderFios();
  gerarTabelaAlfabeto();
  somEntrada();
  iniciarTimer();
  renderDesafio();
}

function gerarTabelaAlfabeto() {
  const tabela = document.getElementById('bm-tabela');
  if (!tabela) return;
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const cards = Array.from(letras).map((l, i) =>
    `<div class="alfa-card" onclick="clicarLetra('${l}')" title="${l} = ${i + 1}">
      <div class="alfa-num">${i + 1}</div>
      <div class="alfa-letra">${l}</div>
    </div>`
  ).join('');
  tabela.innerHTML = `<div class="alfa-titulo">Alphabet code</div><div class="alfa-grid">${cards}</div>`;
}

window.clicarLetra = function(letra) {
  if (!jogoAtivo) return;
  const input = document.getElementById('bm-input');
  if (!input || input.disabled) return;
  const d = desafios[atualDesafio];
  input.value = (d?.para === 'decimal') ? letraParaNum(letra).toString() : letra;
  input.classList.add('bm-input-flash');
  setTimeout(() => {
    input.classList.remove('bm-input-flash');
    window.confirmarResposta();
  }, 150);
};

function renderBoard(valor, de, para) {
  const wrap = document.getElementById('bm-board-wrap');
  const board = document.getElementById('bm-board');
  if (!wrap || !board) return;

  if (para === 'binario') {
    // Modo interativo: cartões em branco, aluno clica para ativar bits
    estadoBits = [0, 0, 0, 0, 0];
    board.innerHTML = BITS.map((val, i) => `
      <div class="ps-bit-card ps-bit-off ps-bit-clicavel" id="bm-bit-${i}" onclick="toggleBit(${i})">
        <div class="ps-bit-val">${val}</div>
        <div class="ps-bit-circle"></div>
      </div>
    `).join('');
    wrap.style.display = '';
    return;
  }

  if (de === 'binario') {
    // Modo referência: mostra os bits do valor fonte pintados
    const n    = parseInt(valor, 2);
    const bits = numParaBits(isNaN(n) ? 0 : n);
    board.innerHTML = BITS.map((val, i) => `
      <div class="ps-bit-card ${bits[i] ? 'ps-bit-on' : 'ps-bit-off'}">
        <div class="ps-bit-val">${val}</div>
        <div class="ps-bit-circle"></div>
      </div>
    `).join('');
    wrap.style.display = '';
    return;
  }

  wrap.style.display = 'none';
}

window.toggleBit = function(i) {
  if (!jogoAtivo) return;
  estadoBits[i] = estadoBits[i] ? 0 : 1;
  const card = document.getElementById('bm-bit-' + i);
  if (card) card.className = 'ps-bit-card ps-bit-clicavel ' + (estadoBits[i] ? 'ps-bit-on' : 'ps-bit-off');
  document.getElementById('bm-input').value = estadoBits.join('');
};


// ── Timer ─────────────────────────────────────────────
function iniciarTimer() {
  timerRestante = parseInt(cardData.bomba_tempo) || 60;
  atualizarTimer();
  timerInterval = setInterval(timerTick, 1000);
}

function timerTick() {
  timerRestante--;
  atualizarTimer();
  if (timerRestante <= 10) {
    document.getElementById('bm-timer').classList.add('urgente');
  }
  if (timerRestante <= 0) {
    clearInterval(timerInterval);
    bombaExplode();
  }
}

function atualizarTimer() {
  const min = Math.floor(timerRestante / 60);
  const seg = timerRestante % 60;
  const txt = min > 0
    ? min + ':' + (seg < 10 ? '0' : '') + seg
    : (seg < 10 ? '0' : '') + seg + 's';
  document.getElementById('bm-timer-val').textContent = txt;
}

// ── Wires ─────────────────────────────────────────────
function renderFios() {
  const container = document.getElementById('bm-fios');
  container.innerHTML = desafios.map((_, i) => `
    <div class="bm-fio" id="bm-fio-${i}">
      <div class="bm-fio-conector"></div>
      <div class="bm-fio-linha" style="background:${COR_FIOS[i % COR_FIOS.length]};color:${COR_FIOS[i % COR_FIOS.length]}"></div>
      <div class="bm-fio-conector"></div>
      <div class="bm-fio-meta">
        <span class="bm-fio-num">Código ${i + 1}</span>
        <span class="bm-fio-status" id="bm-fio-st-${i}">🔒</span>
      </div>
    </div>
  `).join('');
  atualizarFioAtual();
}

function atualizarFioAtual() {
  desafios.forEach((_, i) => {
    const el = document.getElementById('bm-fio-' + i);
    if (!el) return;
    el.classList.remove('bm-fio-atual', 'bm-fio-ok', 'bm-fio-err');
    const st = document.getElementById('bm-fio-st-' + i);
    if (i < atualDesafio) {
      el.classList.add('bm-fio-ok');
      if (st) st.textContent = '✂️';
    } else if (i === atualDesafio) {
      el.classList.add('bm-fio-atual');
      if (st) st.textContent = '⚡';
    }
  });
}

// ── Render challenge ──────────────────────────────────
function renderDesafio() {
  if (atualDesafio >= desafios.length) { bombaDesarmada(); return; }
  const d = desafios[atualDesafio];
  document.getElementById('bm-num').textContent   = 'CÓDIGO ' + (atualDesafio + 1) + ' DE ' + desafios.length;
  document.getElementById('bm-valor').textContent = d.valor;
  document.getElementById('bm-de').textContent    = LABELS[d.de]   || d.de;
  document.getElementById('bm-para').textContent  = LABELS[d.para] || d.para;

  renderBoard(d.valor, d.de, d.para);

  const input = document.getElementById('bm-input');
  input.value = '';
  input.disabled = false;
  input.placeholder = '?';
  document.getElementById('bm-feedback').style.display = 'none';
}

// ── Confirm answer ────────────────────────────────────
window.confirmarResposta = function() {
  if (!jogoAtivo) return;
  const input = document.getElementById('bm-input');
  const valor = input.value.trim();
  if (!valor) {
    input.classList.add('bm-input-shake');
    setTimeout(() => input.classList.remove('bm-input-shake'), 400);
    return;
  }
  input.disabled = true;

  if (!tentativaRegistrada && atualDesafio === 0) {
    tentativaRegistrada = true;
    registrarTentativa({
      colecao: 'resultados_bomba', docId: resultadoDocId,
      uid: alunoUid, escolaId, cardId,
      tentativasPermitidas, totalItens: desafios.length,
    });
    tentativasUsadas++;
  }

  const d = desafios[atualDesafio];
  const acertou = validarResposta(valor, d.valor, d.de, d.para);

  if (acertou) {
    acertos++;
    const pts = parseFloat(d.pontos) || 1.0;
    pontosGanhos += pts;
    somAcerto();
    mostrarFeedback('✅ Código desarmado!', true);
    atualDesafio++;
    setTimeout(() => {
      atualizarFioAtual();
      document.getElementById('bm-feedback').style.display = 'none';
      renderDesafio();
    }, 900);
  } else {
    erros++;
    somErro();
    const correta = calcularResposta(d.valor, d.de, d.para);
    mostrarFeedback('❌ Incorreto! Tente novamente.', false);
    setTimeout(() => {
      document.getElementById('bm-feedback').style.display = 'none';
      input.value = '';
      input.disabled = false;
    }, 1200);
  }
};

function mostrarFeedback(texto, ok) {
  const fb = document.getElementById('bm-feedback');
  fb.textContent  = texto;
  fb.className    = 'bm-feedback ' + (ok ? 'bm-feedback-ok' : 'bm-feedback-err');
  fb.style.display = '';
}

// ── Bomb explodes ─────────────────────────────────────
function bombaExplode() {
  jogoAtivo = false;
  somFinalRuim();
  document.getElementById('bm-bomba-emoji').textContent = '💥';
  document.body.classList.add('explodindo');
  // mark remaining wires as failed
  for (let i = atualDesafio; i < desafios.length; i++) {
    const el = document.getElementById('bm-fio-' + i);
    if (el) { el.classList.remove('bm-fio-atual'); el.classList.add('bm-fio-err'); }
    const st = document.getElementById('bm-fio-st-' + i);
    if (st) st.textContent = '💥';
    erros++;
  }
  document.getElementById('bm-input').disabled = true;
  setTimeout(() => {
    document.body.classList.remove('explodindo');
    mostrarFinal(false);
  }, 1500);
}

// ── Bomb defused ──────────────────────────────────────
function bombaDesarmada() {
  jogoAtivo = false;
  clearInterval(timerInterval);
  somFinalBom();
  document.getElementById('bm-bomba-emoji').textContent = '🔓';
  setTimeout(() => mostrarFinal(true), 800);
}

// ── Final screen ──────────────────────────────────────
function mostrarFinal(sucesso) {
  clearInterval(timerInterval);
  document.getElementById('bm-box').style.display = 'none';

  const total = desafios.length;

  mostrarTelaFinal({
    acertos, total, pontos: pontosGanhos,
    tentativasPermitidas, tentativasUsadas,
    avatarSrc, concluirCom: 100,
    mensagens: {
      perfeito: { emoji: '🔓', titulo: 'Bomba Desarmada!', msg: `Parabéns! Você converteu todos os ${total} códigos corretamente.` },
      bom:      { emoji: '💥', titulo: 'Bomba Explodiu!',  msg: `Você desarmou ${acertos} de ${total} códigos antes da explosão.` },
      esforco:  { emoji: '💥', titulo: 'Bomba Explodiu!',  msg: `Você desarmou ${acertos} de ${total} códigos. Revise as conversões!` },
      fraco:    { emoji: '💥', titulo: 'Bomba Explodiu!',  msg: acertos === 0 ? 'Você não conseguiu desarmar nenhum código. Revise as conversões!' : `Você desarmou ${acertos} de ${total} códigos. Continue treinando!` },
    },
  });

  const top = document.getElementById('tf-top');
  if (top) top.className = 'tf-top ' + (sucesso ? 'top-ok' : 'top-explode');

  salvarResultado({
    colecao: 'resultados_bomba', docId: resultadoDocId,
    uid: alunoUid, acertos, pontos: pontosGanhos, total, concluirCom: 100,
  }).catch(e => console.warn('Erro ao salvar:', e));
}

// ── Reiniciar ─────────────────────────────────────────
window.reiniciar = function() {
  if (tentativasUsadas >= tentativasPermitidas) {
    mostrarBloqueado({ tentativasPermitidas, dados: null, labelItem: 'códigos' });
    return;
  }
  tentativaRegistrada = false;
  atualDesafio = 0;
  acertos = 0; erros = 0; pontosGanhos = 0;
  jogoAtivo = true;
  clearInterval(timerInterval);
  desafios = [...cardData.bomba_desafios];
  document.getElementById('tela-final').style.display = 'none';
  document.getElementById('bm-box').style.display     = '';
  document.getElementById('bm-bomba-emoji').textContent = '💣';
  document.getElementById('bm-timer').classList.remove('urgente');
  document.getElementById('tf-badge-concluido').style.display = 'none';
  renderFios();
  iniciarTimer();
  renderDesafio();
};

window.voltarCard = function() { _voltarCard(cardId); };

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && jogoAtivo) {
    const input = document.getElementById('bm-input');
    if (input && !input.disabled) window.confirmarResposta();
  }
});

init();
