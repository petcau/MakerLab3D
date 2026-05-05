import { db }                                        from './shared/firebase.js';
import { somEntrada, somAcerto, somErro, somFinalBom, somFinalRuim } from './shared/audio.js';
import { carregarPlayerCard }                           from './shared/player-card.js';
import { registrarTentativa, salvarResultado }          from './shared/resultado.js';
import { erroLoad, mostrarBloqueado, mostrarTelaFinal, voltarCard as _voltarCard } from './shared/ui.js';
import { doc, getDoc }                                  from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const params = new URLSearchParams(window.location.search);
const cardId = params.get('card');

let cardData, alunoUid, escolaId, avatarSrc;
let desafios = [], tentativasPermitidas = 3, tentativasUsadas = 0;
let desafioAtual = 0, acertos = 0, erros = 0, pontosGanhos = 0;
let tentativaRegistrada = false, resultadoDocId = null;
let jogoAtivo = false;

// ── Init ──────────────────────────────────────────────
async function init() {
  if (!cardId) { erroLoad('Card não especificado.'); return; }
  try {
    const dados = await carregarPlayerCard({ jogoNome: 'Pixel Image', cardId });
    alunoUid  = dados.uid;
    escolaId  = dados.escolaId;
    avatarSrc = dados.avatarSrc;

    const snap = await getDoc(doc(db, 'cards', cardId));
    if (!snap.exists()) { erroLoad('Card não encontrado.'); return; }
    cardData = snap.data();

    document.getElementById('q-card-nome').textContent = cardData.nome || cardId;
    document.title = 'Pixel Image — ' + (cardData.nome || cardId);

    if (!(cardData.pixel_img_desafios?.length)) {
      erroLoad('Este card não tem desafios de Pixel Image cadastrados.');
      return;
    }

    tentativasPermitidas = cardData.pixel_img_tentativas || 3;
    resultadoDocId = alunoUid + '_pixel_img_' + cardId;

    const resultSnap = await getDoc(doc(db, 'resultados_pixel_img', resultadoDocId));
    if (resultSnap.exists()) tentativasUsadas = resultSnap.data().tentativas_usadas || 0;

    if (tentativasUsadas >= tentativasPermitidas) {
      mostrarBloqueado({ tentativasPermitidas, dados: resultSnap.exists() ? resultSnap.data() : null, labelItem: 'grids' });
      return;
    }

    desafios = [...cardData.pixel_img_desafios];
    iniciarJogo();
  } catch (e) { erroLoad('Erro ao carregar: ' + e.message); }
}

// ── Start ─────────────────────────────────────────────
function iniciarJogo() {
  jogoAtivo = true;
  document.getElementById('loading').style.display = 'none';
  document.getElementById('px-box').style.display  = '';
  somEntrada();
  renderDesafio();
}

// ── RLE decode ────────────────────────────────────────
function decodeLinha(codigo, numCols) {
  const nums  = codigo.trim().split(/\s+/).map(Number);
  const cells = [];
  nums.forEach((n, i) => {
    const val = i % 2 === 0 ? 0 : 1;
    for (let j = 0; j < n; j++) cells.push(val);
  });
  while (cells.length < numCols) cells.push(0);
  return cells.slice(0, numCols);
}

// Compara dois códigos decodificando ambos (aceita espaços extras, zeros à esquerda, etc.)
function codigosEquivalentes(digitado, original, numCols) {
  if (!digitado.trim()) return false;
  try {
    const d1 = decodeLinha(digitado, numCols);
    const d2 = decodeLinha(original, numCols);
    return d1.every((v, i) => v === d2[i]);
  } catch { return false; }
}

// ── Render ────────────────────────────────────────────
function renderDesafio() {
  if (desafioAtual >= desafios.length) { mostrarFinal(true); return; }

  const d    = desafios[desafioAtual];
  const rows = d.codigos.length;
  const cols = d.colunas;

  document.getElementById('px-num').textContent        = `DESAFIO ${desafioAtual + 1} DE ${desafios.length}`;
  document.getElementById('px-feedback').style.display = 'none';

  const container = document.getElementById('px-grid');
  container.innerHTML = '';
  // Grid: N células + 1 coluna de input
  container.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size)) auto`;

  d.codigos.forEach((codigo, row) => {
    // Células pintadas (estáticas)
    const cells = decodeLinha(codigo, cols);
    for (let col = 0; col < cols; col++) {
      const cell = document.createElement('div');
      cell.className = 'px-cell' + (cells[col] === 1 ? ' px-cell-on' : '');
      container.appendChild(cell);
    }
    // Input do código
    const input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'px-codigo-input';
    input.id          = `px-input-${row}`;
    input.placeholder = 'ex: 3 1 2';
    input.autocomplete = 'off';
    input.addEventListener('keydown', e => { if (e.key === 'Enter') window.verificar(); });
    container.appendChild(input);
  });

  // Foca no primeiro input
  setTimeout(() => document.getElementById('px-input-0')?.focus(), 100);
}

// ── Limpar inputs ─────────────────────────────────────
window.limparCodigos = function() {
  if (!jogoAtivo) return;
  const d = desafios[desafioAtual];
  d.codigos.forEach((_, row) => {
    const input = document.getElementById(`px-input-${row}`);
    if (input) { input.value = ''; input.className = 'px-codigo-input'; }
  });
  document.getElementById('px-feedback').style.display = 'none';
};

// ── Verificar ─────────────────────────────────────────
window.verificar = function() {
  if (!jogoAtivo) return;

  const d    = desafios[desafioAtual];
  const cols = d.colunas;
  let gridCorreto = true;

  if (!tentativaRegistrada) {
    tentativaRegistrada = true;
    tentativasUsadas++;
    registrarTentativa({
      colecao: 'resultados_pixel_img', docId: resultadoDocId,
      uid: alunoUid, escolaId, cardId,
      tentativasPermitidas, totalItens: desafios.length,
    });
  }

  d.codigos.forEach((codigoOriginal, row) => {
    const input    = document.getElementById(`px-input-${row}`);
    if (!input) return;
    const digitado = input.value.trim();
    const linhaOk  = codigosEquivalentes(digitado, codigoOriginal, cols);
    if (!linhaOk) gridCorreto = false;
    input.classList.remove('px-input-certo', 'px-input-errado');
    input.classList.add(linhaOk ? 'px-input-certo' : 'px-input-errado');
  });

  if (gridCorreto) {
    acertos++;
    const pts = parseFloat(d.pontos) || Math.floor((cardData.pontos_total || 100) / desafios.length);
    pontosGanhos += pts;
    somAcerto();
    mostrarFeedbackEl('✅ Código correto! Avançando...', true);
    setTimeout(() => { desafioAtual++; renderDesafio(); }, 1600);
  } else {
    erros++;
    somErro();
    mostrarFeedbackEl('❌ Alguns códigos estão errados. Corrija e tente novamente!', false);
    setTimeout(() => {
      document.getElementById('px-feedback').style.display = 'none';
      d.codigos.forEach((_, row) => {
        const input = document.getElementById(`px-input-${row}`);
        if (input) input.classList.remove('px-input-certo', 'px-input-errado');
      });
    }, 1800);
  }
};

function mostrarFeedbackEl(texto, ok) {
  const fb = document.getElementById('px-feedback');
  fb.textContent = texto;
  fb.className = 'px-feedback ' + (ok ? 'px-feedback-ok' : 'px-feedback-err');
  fb.style.display = '';
}

// ── Final screen ──────────────────────────────────────
function mostrarFinal(sucesso) {
  jogoAtivo = false;
  document.getElementById('px-box').style.display = 'none';
  const total = desafios.length;

  sucesso ? somFinalBom() : somFinalRuim();

  mostrarTelaFinal({
    acertos, total, pontos: pontosGanhos,
    tentativasPermitidas, tentativasUsadas,
    avatarSrc, concluirCom: 100,
    mensagens: {
      perfeito: { emoji: '🖼️', titulo: 'Imagem Decodificada!', msg: `Incrível! Você codificou todos os ${total} grids corretamente!` },
      bom:      { emoji: '🎨', titulo: 'Muito bem!',            msg: `Você acertou ${acertos} de ${total} grids!` },
      esforco:  { emoji: '🖌️', titulo: 'Continue tentando!',   msg: `Você acertou ${acertos} de ${total} grids. Revise os códigos!` },
      fraco:    { emoji: '🔄', titulo: 'Não desista!',           msg: `Você acertou ${acertos} de ${total} grids. Pratique mais!` },
    },
  });

  const top = document.getElementById('tf-top');
  if (top) top.className = 'tf-top ' + (sucesso ? 'top-ok' : 'top-err');

  salvarResultado({
    colecao: 'resultados_pixel_img', docId: resultadoDocId,
    uid: alunoUid, acertos, pontos: pontosGanhos, total, concluirCom: 100,
  }).catch(e => console.warn('Erro ao salvar:', e));
}

// ── Reiniciar ─────────────────────────────────────────
window.reiniciar = function() {
  if (tentativasUsadas >= tentativasPermitidas) {
    mostrarBloqueado({ tentativasPermitidas, dados: null, labelItem: 'grids' });
    return;
  }
  tentativaRegistrada = false;
  desafioAtual = 0;
  acertos = 0; erros = 0; pontosGanhos = 0;
  jogoAtivo = true;
  document.getElementById('tela-final').style.display    = 'none';
  document.getElementById('tf-badge-concluido').style.display = 'none';
  document.getElementById('px-box').style.display        = '';
  renderDesafio();
};

window.voltarCard = function() { _voltarCard(cardId); };

init();
