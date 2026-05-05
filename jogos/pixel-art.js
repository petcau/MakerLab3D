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
let estadoGrid = [];
let fase = 'pintar'; // 'pintar' | 'codificar'
let tentativaRegistrada = false, resultadoDocId = null;
let jogoAtivo = false;

// ── Init ──────────────────────────────────────────────
async function init() {
  if (!cardId) { erroLoad('Card não especificado.'); return; }
  try {
    const dados = await carregarPlayerCard({ jogoNome: 'Pixel Art', cardId });
    alunoUid  = dados.uid;
    escolaId  = dados.escolaId;
    avatarSrc = dados.avatarSrc;

    const snap = await getDoc(doc(db, 'cards', cardId));
    if (!snap.exists()) { erroLoad('Card não encontrado.'); return; }
    cardData = snap.data();

    document.getElementById('q-card-nome').textContent = cardData.nome || cardId;
    document.title = 'Pixel Art — ' + (cardData.nome || cardId);

    if (!(cardData.pixel_art_desafios?.length)) {
      erroLoad('Este card não tem desafios de Pixel Art cadastrados.');
      return;
    }

    tentativasPermitidas = cardData.pixel_art_tentativas || 3;
    resultadoDocId = alunoUid + '_pixel_art_' + cardId;

    const resultSnap = await getDoc(doc(db, 'resultados_pixel_art', resultadoDocId));
    if (resultSnap.exists()) tentativasUsadas = resultSnap.data().tentativas_usadas || 0;

    if (tentativasUsadas >= tentativasPermitidas) {
      mostrarBloqueado({ tentativasPermitidas, dados: resultSnap.exists() ? resultSnap.data() : null, labelItem: 'grids' });
      return;
    }

    desafios = [...cardData.pixel_art_desafios];
    iniciarJogo();
  } catch (e) { erroLoad('Erro ao carregar: ' + e.message); }
}

function iniciarJogo() {
  jogoAtivo = true;
  document.getElementById('loading').style.display = 'none';
  document.getElementById('pa-box').style.display  = '';
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

// ── Render desafio (fase 1) ───────────────────────────
function renderDesafio() {
  if (desafioAtual >= desafios.length) { mostrarFinal(true); return; }

  const d    = desafios[desafioAtual];
  const rows = d.linhas  || 10;
  const cols = d.colunas || 10;

  fase = 'pintar';
  estadoGrid = Array.from({ length: rows }, () => Array(cols).fill(0));

  document.getElementById('pa-num').textContent = `DESAFIO ${desafioAtual + 1} DE ${desafios.length}`;
  document.getElementById('pa-feedback').style.display = 'none';
  document.getElementById('pa-actions-pintar').style.display   = '';
  document.getElementById('pa-actions-codificar').style.display = 'none';
  document.getElementById('pa-instrucao').textContent = 'Crie seu pixel art clicando nas células';

  atualizarFases();
  renderGridPintar(rows, cols);
}

function atualizarFases() {
  const s1 = document.getElementById('pa-step-1');
  const s2 = document.getElementById('pa-step-2');
  const ln = document.querySelector('.pa-fase-linha');
  if (fase === 'pintar') {
    s1.className = 'pa-fase-step ativa';
    s2.className = 'pa-fase-step';
    if (ln) ln.className = 'pa-fase-linha';
  } else {
    s1.className = 'pa-fase-step concluida';
    s2.className = 'pa-fase-step ativa';
    if (ln) ln.className = 'pa-fase-linha ativa';
  }
}

// ── Grid fase 1: clicável ─────────────────────────────
function renderGridPintar(rows, cols) {
  const container = document.getElementById('pa-grid');
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = document.createElement('div');
      cell.className = 'pa-cell clickavel';
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.onclick = () => window.toggleCell(row, col);
      container.appendChild(cell);
    }
  }
}

window.toggleCell = function(row, col) {
  if (!jogoAtivo || fase !== 'pintar') return;
  estadoGrid[row][col] ^= 1;
  const cell = document.querySelector(`.pa-cell[data-row="${row}"][data-col="${col}"]`);
  if (cell) cell.classList.toggle('pa-cell-on', estadoGrid[row][col] === 1);
};

window.limparGrid = function() {
  if (!jogoAtivo || fase !== 'pintar') return;
  const d = desafios[desafioAtual];
  estadoGrid = estadoGrid.map(r => r.map(() => 0));
  document.querySelectorAll('.pa-cell').forEach(c => c.classList.remove('pa-cell-on'));
};

// ── Avançar para fase 2 ───────────────────────────────
window.avancarParaCodificar = function() {
  if (!jogoAtivo) return;
  fase = 'codificar';
  document.getElementById('pa-actions-pintar').style.display   = 'none';
  document.getElementById('pa-actions-codificar').style.display = '';
  document.getElementById('pa-instrucao').textContent = 'Escreva o código de cada linha da sua imagem';
  document.getElementById('pa-feedback').style.display = 'none';
  atualizarFases();
  renderGridCodificar();
};

// ── Grid fase 2: estático + inputs ───────────────────
function renderGridCodificar() {
  const d    = desafios[desafioAtual];
  const rows = d.linhas  || 10;
  const cols = d.colunas || 10;

  const container = document.getElementById('pa-grid');
  container.innerHTML = '';
  container.style.gridTemplateColumns = '';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '4px';
  container.style.alignItems = 'flex-start';

  for (let row = 0; row < rows; row++) {
    const linha = document.createElement('div');
    linha.className = 'pa-linha';

    const cellsWrap = document.createElement('div');
    cellsWrap.className = 'pa-linha-cells';

    for (let col = 0; col < cols; col++) {
      const cell = document.createElement('div');
      cell.className = 'pa-cell' + (estadoGrid[row][col] === 1 ? ' pa-cell-on' : '');
      cellsWrap.appendChild(cell);
    }

    const input = document.createElement('input');
    input.type         = 'text';
    input.className    = 'pa-codigo-input';
    input.id           = `pa-input-${row}`;
    input.placeholder  = 'ex: 3 1 2';
    input.autocomplete = 'off';
    input.addEventListener('keydown', e => { if (e.key === 'Enter') window.verificar(); });

    linha.appendChild(cellsWrap);
    linha.appendChild(input);
    container.appendChild(linha);
  }

  setTimeout(() => document.getElementById('pa-input-0')?.focus(), 100);
}

// ── Voltar para fase 1 ────────────────────────────────
window.voltarParaPintar = function() {
  if (!jogoAtivo) return;
  fase = 'pintar';
  document.getElementById('pa-actions-pintar').style.display   = '';
  document.getElementById('pa-actions-codificar').style.display = 'none';
  document.getElementById('pa-instrucao').textContent = 'Crie seu pixel art clicando nas células';
  document.getElementById('pa-feedback').style.display = 'none';
  atualizarFases();

  const d    = desafios[desafioAtual];
  const rows = d.linhas  || 10;
  const cols = d.colunas || 10;
  renderGridPintar(rows, cols);
  // Restaura estado pintado
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (estadoGrid[row][col] === 1) {
        const cell = document.querySelector(`.pa-cell[data-row="${row}"][data-col="${col}"]`);
        if (cell) cell.classList.add('pa-cell-on');
      }
    }
  }
};

// ── Verificar ─────────────────────────────────────────
window.verificar = function() {
  if (!jogoAtivo || fase !== 'codificar') return;

  const d    = desafios[desafioAtual];
  const rows = d.linhas  || 10;
  const cols = d.colunas || 10;
  let gridCorreto = true;

  if (!tentativaRegistrada) {
    tentativaRegistrada = true;
    tentativasUsadas++;
    registrarTentativa({
      colecao: 'resultados_pixel_art', docId: resultadoDocId,
      uid: alunoUid, escolaId, cardId,
      tentativasPermitidas, totalItens: desafios.length,
    });
  }

  for (let row = 0; row < rows; row++) {
    const input    = document.getElementById(`pa-input-${row}`);
    if (!input) continue;
    const digitado = input.value.trim();

    let linhaOk = false;
    if (digitado) {
      try {
        const decoded = decodeLinha(digitado, cols);
        linhaOk = estadoGrid[row].every((v, c) => v === decoded[c]);
      } catch { linhaOk = false; }
    }

    if (!linhaOk) gridCorreto = false;
    input.classList.remove('pa-input-certo', 'pa-input-errado');
    input.classList.add(linhaOk ? 'pa-input-certo' : 'pa-input-errado');
  }

  // Feedback visual por linha nas células
  const allCells = document.querySelectorAll('#pa-grid .pa-cell');
  for (let row = 0; row < rows; row++) {
    const input   = document.getElementById(`pa-input-${row}`);
    const linhaOk = input?.classList.contains('pa-input-certo');
    for (let col = 0; col < cols; col++) {
      const cell = allCells[row * cols + col];
      if (cell) {
        cell.classList.remove('pa-cell-certo', 'pa-cell-errado');
        cell.classList.add(linhaOk ? 'pa-cell-certo' : 'pa-cell-errado');
      }
    }
  }

  if (gridCorreto) {
    acertos++;
    pontosGanhos += parseFloat(d.pontos) || 5.0;
    somAcerto();
    mostrarFeedbackEl('✅ Perfeito! Código correto!', true);
    setTimeout(() => { desafioAtual++; renderDesafio(); }, 1600);
  } else {
    erros++;
    somErro();
    mostrarFeedbackEl('❌ Alguns códigos estão errados. Corrija e tente novamente!', false);
    setTimeout(() => {
      document.getElementById('pa-feedback').style.display = 'none';
      document.querySelectorAll('.pa-codigo-input').forEach(i => i.classList.remove('pa-input-certo', 'pa-input-errado'));
      document.querySelectorAll('#pa-grid .pa-cell').forEach(c => c.classList.remove('pa-cell-certo', 'pa-cell-errado'));
    }, 1800);
  }
};

function container() { return document.getElementById('pa-grid'); }

function mostrarFeedbackEl(texto, ok) {
  const fb = document.getElementById('pa-feedback');
  fb.textContent = texto;
  fb.className = 'pa-feedback ' + (ok ? 'pa-feedback-ok' : 'pa-feedback-err');
  fb.style.display = '';
}

// ── Final ─────────────────────────────────────────────
function mostrarFinal(sucesso) {
  jogoAtivo = false;
  document.getElementById('pa-box').style.display = 'none';
  const total = desafios.length;

  sucesso ? somFinalBom() : somFinalRuim();

  mostrarTelaFinal({
    acertos, total, pontos: pontosGanhos,
    tentativasPermitidas, tentativasUsadas,
    avatarSrc, concluirCom: 100,
    mensagens: {
      perfeito: { emoji: '🎨', titulo: 'Pixel Mestre!',       msg: `Incrível! Você criou e codificou todos os ${total} grids!` },
      bom:      { emoji: '🖌️', titulo: 'Muito bem!',          msg: `Você acertou ${acertos} de ${total} grids!` },
      esforco:  { emoji: '🖼️', titulo: 'Continue tentando!',  msg: `Você acertou ${acertos} de ${total} grids. Revise a codificação!` },
      fraco:    { emoji: '🔄', titulo: 'Não desista!',          msg: `Você acertou ${acertos} de ${total} grids. Pratique mais!` },
    },
  });

  const top = document.getElementById('tf-top');
  if (top) top.className = 'tf-top ' + (sucesso ? 'top-ok' : 'top-err');

  salvarResultado({
    colecao: 'resultados_pixel_art', docId: resultadoDocId,
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
  document.getElementById('pa-box').style.display        = '';
  renderDesafio();
};

window.voltarCard = function() { _voltarCard(cardId); };

init();
