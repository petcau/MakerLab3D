import { db }                                from './shared/firebase.js';
import { somEntrada, somAcerto, somErro, somFinalBom, somFinalRuim } from './shared/audio.js';
import { carregarPlayerCard }               from './shared/player-card.js';
import { registrarTentativa, salvarResultado } from './shared/resultado.js';
import { erroLoad, mostrarBloqueado, mostrarTelaFinal, voltarCard as _voltarCard } from './shared/ui.js';
import { doc, getDoc }                      from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const cardId = params.get('card');

// ── Binary helpers ───────────────────────────────────
const BITS = [16, 8, 4, 2, 1];
function letraParaNum(l) {
  const c = l.toUpperCase().charCodeAt(0);
  return (c >= 65 && c <= 90) ? c - 64 : 0;
}
function numParaBits(n) { return BITS.map(b => (n & b) !== 0 ? 1 : 0); }

// ── State ────────────────────────────────────────────
let desafios = [], atualDesafio = 0, atualLetra = 0;
let pontosGanhos = 0, acertos = 0, erros = 0;
let letrasCorretas = 0;
let totalLetrasAcertadas = 0, totalLetrasErradas = 0;
let vidas = 3;
const VIDAS_TOTAL = 3;
let palavraCorretas = [];
let timerInterval = null, timerRestante = 0;
let tentativaRegistrada = false, resultadoDocId = null;
let tentativasUsadas = 0, tentativasPermitidas = 3;
let alunoUid = null, escolaId = null, avatarSrc = '';
let cardData = null;

// ── Init ─────────────────────────────────────────────
async function init() {
  if (!cardId) { erroLoad('Card não especificado.'); return; }
  try {
    const dados = await carregarPlayerCard({ jogoNome: 'Palavra Secreta', cardId });
    alunoUid = dados.uid;
    escolaId = dados.escolaId;
    avatarSrc = dados.avatarSrc;

    const cardSnap = await getDoc(doc(db, 'cards', cardId));
    if (!cardSnap.exists()) { erroLoad('Card não encontrado.'); return; }
    cardData = cardSnap.data();

    document.getElementById('q-card-nome').textContent = cardData.nome || cardId;
    document.title = 'Palavra Secreta — ' + (cardData.nome || cardId);

    if (!(cardData.palavra_desafios?.length)) {
      erroLoad('Este card não tem desafios de Palavra Secreta cadastrados.');
      return;
    }

    tentativasPermitidas = cardData.palavra_tentativas || 3;
    resultadoDocId = alunoUid + '_palavra_' + cardId;

    const resultSnap = await getDoc(doc(db, 'resultados_palavra', resultadoDocId));
    if (resultSnap.exists()) tentativasUsadas = resultSnap.data().tentativas_usadas || 0;

    if (tentativasUsadas >= tentativasPermitidas) {
      mostrarBloqueado({ tentativasPermitidas, dados: resultSnap.exists() ? resultSnap.data() : null, labelItem: 'palavras' });
      return;
    }

    desafios = [...cardData.palavra_desafios];
    iniciarJogo();
  } catch(e) { erroLoad('Erro ao carregar: ' + e.message); }
}

function iniciarJogo() {
  document.getElementById('loading').style.display     = 'none';
  document.getElementById('q-prog-wrap').style.display = '';
  document.getElementById('ps-box').style.display      = '';
  document.getElementById('q-placar').style.display    = '';
  gerarTabelaAlfabeto();
  renderVidas();
  somEntrada();
  renderDesafio();
}

function renderVidas() {
  const el = document.getElementById('ps-vidas');
  if (!el) return;
  el.innerHTML = Array.from({ length: VIDAS_TOTAL }, (_, i) =>
    `<span class="vida ${i < vidas ? 'vida-on' : 'vida-off'}">♥</span>`
  ).join('');
}

// ── Render Desafio ───────────────────────────────────
function renderDesafio() {
  if (atualDesafio >= desafios.length) { mostrarFinal(); return; }
  atualLetra      = 0;
  letrasCorretas  = 0;
  palavraCorretas = [];

  const d   = desafios[atualDesafio];
  const pct = Math.round((atualDesafio / desafios.length) * 100);
  document.getElementById('prog-txt').textContent   = 'Palavra ' + (atualDesafio + 1) + ' de ' + desafios.length;
  document.getElementById('prog-pct').textContent   = pct + '%';
  document.getElementById('prog-fill').style.width  = pct + '%';
  document.getElementById('ps-desafio-num').textContent = 'Palavra ' + (atualDesafio + 1);

  const pts = parseFloat(d.pontos) || 1.0;
  document.getElementById('ps-pts-badge').textContent = '+' + (pts % 1 === 0 ? pts : pts.toFixed(1)) + ' pt' + (pts !== 1 ? 's' : '');

  const dicaEl = document.getElementById('ps-dica');
  if (d.dica) {
    dicaEl.textContent = '💬 ' + d.dica;
    dicaEl.style.display = '';
  } else {
    dicaEl.style.display = 'none';
  }

  renderWordSlots(d.palavra);

  const tempo = parseInt(d.tempo) || 0;
  clearInterval(timerInterval);
  const timerEl = document.getElementById('ps-timer');
  if (tempo > 0) {
    timerRestante = tempo;
    timerEl.style.display = '';
    timerEl.className = 'ps-timer';
    document.getElementById('timer-val').textContent = timerRestante;
    timerInterval = setInterval(timerTick, 1000);
  } else {
    timerEl.style.display = 'none';
  }

  renderLetraAtual();
}

function timerTick() {
  timerRestante--;
  document.getElementById('timer-val').textContent = timerRestante;
  if (timerRestante <= 10) document.getElementById('ps-timer').className = 'ps-timer ps-timer-urgente';
  if (timerRestante <= 0) {
    clearInterval(timerInterval);
    const d = desafios[atualDesafio];
    while (atualLetra < d.palavra.length) { palavraCorretas.push(false); atualLetra++; }
    document.getElementById('ps-input-wrap').style.display = 'none';
    mostrarFeedback('⏱ Tempo esgotado!', false);
    renderWordSlots(d.palavra);
    setTimeout(() => finalizarPalavra(), 2000);
  }
}

// ── Word Slots ───────────────────────────────────────
function renderWordSlots(palavra) {
  const slots = document.getElementById('ps-word-slots');
  slots.innerHTML = '';
  for (let i = 0; i < palavra.length; i++) {
    const div = document.createElement('div');
    if (i < palavraCorretas.length) {
      div.className = 'ps-slot ' + (palavraCorretas[i] ? 'ps-slot-ok' : 'ps-slot-err');
      div.textContent = palavraCorretas[i] ? palavra[i] : '?';
    } else if (i === atualLetra) {
      div.className = 'ps-slot ps-slot-ativo';
      div.textContent = '?';
    } else {
      div.className = 'ps-slot';
      div.textContent = '_';
    }
    slots.appendChild(div);
  }
}

function renderLetraAtual() {
  const d = desafios[atualDesafio];
  if (atualLetra >= d.palavra.length) { finalizarPalavra(); return; }
  const num = letraParaNum(d.palavra[atualLetra]);
  document.getElementById('ps-letra-pos').textContent = 'Decodifique a letra ' + (atualLetra + 1) + ' de ' + d.palavra.length;
  renderBoard(num);
  const input = document.getElementById('ps-input');
  input.value = '';
  input.disabled = false;
  input.focus();
  document.getElementById('ps-feedback').style.display = 'none';
  document.getElementById('ps-input-wrap').style.display = '';
}

function renderBoard(num) {
  const bits  = numParaBits(num);
  const board = document.getElementById('ps-board');
  board.innerHTML = BITS.map((val, i) => `
    <div class="ps-bit-card ${bits[i] ? 'ps-bit-on' : 'ps-bit-off'}">
      <div class="ps-bit-val">${val}</div>
      <div class="ps-bit-circle"></div>
    </div>
  `).join('');
}

// ── Confirm Letter ───────────────────────────────────
window.confirmarLetra = function() {
  const input  = document.getElementById('ps-input');
  const valor  = input.value.trim().toUpperCase();
  if (!valor || !/^[A-Z]$/.test(valor)) {
    input.classList.add('ps-input-shake');
    setTimeout(() => input.classList.remove('ps-input-shake'), 400);
    return;
  }
  input.disabled = true;

  if (!tentativaRegistrada && atualDesafio === 0 && atualLetra === 0) {
    tentativaRegistrada = true;
    registrarTentativa({
      colecao: 'resultados_palavra', docId: resultadoDocId,
      uid: alunoUid, escolaId, cardId,
      tentativasPermitidas, totalItens: desafios.length,
    });
    tentativasUsadas++;
  }

  const d            = desafios[atualDesafio];
  const letraCorreta = d.palavra[atualLetra].toUpperCase();
  const acertou      = valor === letraCorreta;

  if (acertou) {
    palavraCorretas.push(true);
    letrasCorretas++;
    totalLetrasAcertadas++;
    atualizarPlacar();
    renderWordSlots(d.palavra);
    somAcerto();
    mostrarFeedback('✅ Correto!', true);
    atualLetra++;
    setTimeout(() => {
      document.getElementById('ps-feedback').style.display = 'none';
      if (atualLetra >= d.palavra.length) finalizarPalavra();
      else renderLetraAtual();
    }, 800);
  } else {
    totalLetrasErradas++;
    atualizarPlacar();
    vidas--;
    const vidaEls = document.querySelectorAll('.vida');
    if (vidaEls[vidas]) {
      vidaEls[vidas].classList.remove('vida-on');
      vidaEls[vidas].classList.add('vida-off', 'vida-perdida');
    }
    somErro();
    if (vidas <= 0) {
      clearInterval(timerInterval);
      mostrarFeedback('💔 Sem vidas! Jogo encerrado.', false);
      document.getElementById('ps-input-wrap').style.display = 'none';
      setTimeout(() => mostrarFinal(), 2000);
      return;
    }
    mostrarFeedback('❌ Incorreto! Você digitou: ' + valor + ' — ' + vidas + ' vida' + (vidas > 1 ? 's' : '') + ' restante' + (vidas > 1 ? 's' : ''), false);
    setTimeout(() => {
      document.getElementById('ps-feedback').style.display = 'none';
      input.value = '';
      input.disabled = false;
      input.focus();
    }, 1200);
  }
};

function atualizarPlacar() {
  document.getElementById('pl-ac').textContent = totalLetrasAcertadas;
  document.getElementById('pl-er').textContent = totalLetrasErradas;
}

// ── Finish Word ──────────────────────────────────────
function finalizarPalavra() {
  const d          = desafios[atualDesafio];
  clearInterval(timerInterval);
  const palavraOk  = palavraCorretas.every(c => c);
  const pts        = parseFloat(d.pontos) || 1.0;
  const ptsParciais = Math.round(pts * (letrasCorretas / d.palavra.length) * 10) / 10;
  pontosGanhos    += ptsParciais;
  if (palavraOk) acertos++; else erros++;

  document.getElementById('pl-pt').textContent = pontosGanhos % 1 === 0 ? pontosGanhos : pontosGanhos.toFixed(1);
  document.getElementById('ps-input-wrap').style.display = 'none';

  abrirCofre(d.palavra, palavraOk, () => { atualDesafio++; renderDesafio(); });
}

function abrirCofre(palavra, sucesso, onDone) {
  const overlay   = document.getElementById('ps-cofre-overlay');
  const iconeEl   = document.getElementById('ps-cofre-icone');
  const palavraEl = document.getElementById('ps-cofre-palavra');
  const msgEl     = document.getElementById('ps-cofre-msg');

  iconeEl.textContent   = '🔒';
  iconeEl.className     = 'ps-cofre-icone';
  palavraEl.textContent = '';
  msgEl.textContent     = '';
  overlay.style.display = 'flex';

  setTimeout(() => {
    if (sucesso) {
      iconeEl.textContent = '🔓';
      iconeEl.className   = 'ps-cofre-icone ps-cofre-aberto';
      palavraEl.textContent = palavra;
      palavraEl.style.color = '#86efac';
      msgEl.textContent     = 'Palavra decodificada!';
      msgEl.style.color     = '#86efac';
    } else {
      palavraEl.textContent = palavra;
      palavraEl.style.color = '#fca5a5';
      msgEl.textContent     = 'A resposta era...';
      msgEl.style.color     = '#fca5a5';
    }
  }, 500);

  setTimeout(() => {
    overlay.style.display = 'none';
    iconeEl.className = 'ps-cofre-icone';
    onDone();
  }, 2800);
}

function mostrarFeedback(texto, ok) {
  const fb = document.getElementById('ps-feedback');
  fb.textContent = texto;
  fb.className   = 'ps-feedback ' + (ok ? 'ps-feedback-ok' : 'ps-feedback-err');
  fb.style.display = '';
}

// ── Final Screen ─────────────────────────────────────
function mostrarFinal() {
  document.getElementById('q-prog-wrap').style.display = 'none';
  document.getElementById('ps-box').style.display      = 'none';
  document.getElementById('q-placar').style.display    = 'none';

  const total = desafios.length;
  mostrarTelaFinal({
    acertos, total, pontos: pontosGanhos,
    tentativasPermitidas, tentativasUsadas,
    avatarSrc, concluirCom: 70,
    mensagens: {
      perfeito: { emoji: '🔓', titulo: 'Cofre Aberto!',     msg: `Você decodificou todas as ${total} palavras com código binário!` },
      bom:      { emoji: '🗝️', titulo: 'Muito bem!',         msg: `Você abriu ${acertos} de ${total} cofres. Continue assim!` },
      esforco:  { emoji: '💡', titulo: 'Bom esforço!',       msg: `Você abriu ${acertos} de ${total} cofres. Pratique os valores binários!` },
      fraco:    { emoji: '🔐', titulo: 'Continue tentando!', msg: `Você abriu ${acertos} de ${total} cofres. Revise a tabela do alfabeto!` },
    },
  });

  const pct = Math.round((acertos / total) * 100);
  pct >= 70 ? somFinalBom() : somFinalRuim();

  salvarResultado({
    colecao: 'resultados_palavra', docId: resultadoDocId,
    uid: alunoUid, acertos, pontos: pontosGanhos, total, concluirCom: 70,
  }).catch(e => console.warn('Erro ao salvar:', e));
}

window.reiniciar = function() {
  if (tentativasUsadas >= tentativasPermitidas) {
    mostrarBloqueado({ tentativasPermitidas, dados: null, labelItem: 'palavras' });
    return;
  }
  tentativaRegistrada = false;
  atualDesafio = 0; atualLetra = 0;
  acertos = 0; erros = 0; pontosGanhos = 0;
  letrasCorretas = 0; palavraCorretas = [];
  totalLetrasAcertadas = 0; totalLetrasErradas = 0;
  vidas = VIDAS_TOTAL;
  renderVidas();
  clearInterval(timerInterval);
  desafios = [...cardData.palavra_desafios];
  document.getElementById('tela-final').style.display  = 'none';
  document.getElementById('q-prog-wrap').style.display = '';
  document.getElementById('ps-box').style.display      = '';
  document.getElementById('q-placar').style.display    = '';
  document.getElementById('pl-ac').textContent = '0';
  document.getElementById('pl-er').textContent = '0';
  document.getElementById('pl-pt').textContent = '0';
  atualizarPlacar();
  renderDesafio();
};

window.voltarCard = function() { _voltarCard(cardId); };

// ── Alphabet Reference Table ─────────────────────────
function gerarTabelaAlfabeto() {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const tabela = document.getElementById('ps-tabela');
  if (!tabela) return;
  const cards = Array.from(letras).map((l, i) =>
    `<div class="alfa-card" onclick="selecionarLetra('${l}')" title="${l} = ${i + 1}">
      <div class="alfa-num">${i + 1}</div>
      <div class="alfa-letra">${l}</div>
    </div>`
  ).join('');
  tabela.innerHTML = `<div class="alfa-titulo">Alphabet code</div><div class="alfa-grid">${cards}</div>`;
}

window.selecionarLetra = function(letra) {
  const input = document.getElementById('ps-input');
  const wrap  = document.getElementById('ps-input-wrap');
  if (!input || !wrap || wrap.style.display === 'none' || input.disabled) return;
  input.value = letra;
  input.classList.add('ps-input-selecionado');
  setTimeout(() => {
    input.classList.remove('ps-input-selecionado');
    window.confirmarLetra();
  }, 200);
};

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const wrap = document.getElementById('ps-input-wrap');
    if (wrap && wrap.style.display !== 'none') window.confirmarLetra();
  }
});

init();
