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
let tentativaRegistrada = false, resultadoDocId = null;
let jogoAtivo = false;

// ── Init ──────────────────────────────────────────────
async function init() {
  if (!cardId) { erroLoad('Card não especificado.'); return; }
  try {
    const dados = await carregarPlayerCard({ jogoNome: 'Pixel Code', cardId });
    alunoUid  = dados.uid;
    escolaId  = dados.escolaId;
    avatarSrc = dados.avatarSrc;

    const snap = await getDoc(doc(db, 'cards', cardId));
    if (!snap.exists()) { erroLoad('Card não encontrado.'); return; }
    cardData = snap.data();

    document.getElementById('q-card-nome').textContent = cardData.nome || cardId;
    document.title = 'Pixel Code — ' + (cardData.nome || cardId);

    if (!(cardData.pixel_desafios?.length)) {
      erroLoad('Este card não tem desafios de Pixel Code cadastrados.');
      return;
    }

    tentativasPermitidas = cardData.pixel_tentativas || 3;
    resultadoDocId = alunoUid + '_pixel_' + cardId;

    const resultSnap = await getDoc(doc(db, 'resultados_pixel', resultadoDocId));
    if (resultSnap.exists()) tentativasUsadas = resultSnap.data().tentativas_usadas || 0;

    if (tentativasUsadas >= tentativasPermitidas) {
      mostrarBloqueado({ tentativasPermitidas, dados: resultSnap.exists() ? resultSnap.data() : null, labelItem: 'grids' });
      return;
    }

    desafios = [...cardData.pixel_desafios];
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
// Números alternam vazio → preenchido → vazio…
// Ex: "3 1 2" → [0,0,0,1,0,0]  |  "0 3 1" → [1,1,1,0]
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

// ── Render ────────────────────────────────────────────
function renderDesafio() {
  if (desafioAtual >= desafios.length) { mostrarFinal(true); return; }

  const d = desafios[desafioAtual];
  const rows = d.codigos.length;
  const cols = d.colunas;

  estadoGrid = Array.from({ length: rows }, () => Array(cols).fill(0));

  document.getElementById('px-num').textContent    = `DESAFIO ${desafioAtual + 1} DE ${desafios.length}`;
  document.getElementById('px-feedback').style.display = 'none';

  const container = document.getElementById('px-grid');
  container.innerHTML = '';
  container.style.gridTemplateColumns = '';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '4px';
  container.style.alignItems = 'flex-start';

  d.codigos.forEach((codigo, row) => {
    const linha = document.createElement('div');
    linha.className = 'px-linha';

    const cellsWrap = document.createElement('div');
    cellsWrap.className = 'px-linha-cells';

    for (let col = 0; col < cols; col++) {
      const cell = document.createElement('div');
      cell.className = 'px-cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.onclick = () => window.toggleCell(row, col);
      cellsWrap.appendChild(cell);
    }

    const label = document.createElement('div');
    label.className = 'px-codigo';
    label.id = `px-codigo-${row}`;
    label.textContent = codigo;

    linha.appendChild(cellsWrap);
    linha.appendChild(label);
    container.appendChild(linha);
  });
}

// ── Toggle cell ───────────────────────────────────────
window.toggleCell = function(row, col) {
  if (!jogoAtivo) return;
  estadoGrid[row][col] ^= 1;
  const cell = document.querySelector(`.px-cell[data-row="${row}"][data-col="${col}"]`);
  if (!cell) return;
  cell.classList.toggle('px-cell-on', estadoGrid[row][col] === 1);
  cell.classList.remove('px-cell-certo', 'px-cell-errado');
};

// ── Limpar grid ───────────────────────────────────────
window.limparGrid = function() {
  if (!jogoAtivo) return;
  const d = desafios[desafioAtual];
  estadoGrid = estadoGrid.map(r => r.map(() => 0));
  document.querySelectorAll('.px-cell').forEach(c =>
    c.classList.remove('px-cell-on', 'px-cell-certo', 'px-cell-errado')
  );
  document.querySelectorAll('.px-codigo').forEach(c =>
    c.classList.remove('px-codigo-certo', 'px-codigo-errado')
  );
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
      colecao: 'resultados_pixel', docId: resultadoDocId,
      uid: alunoUid, escolaId, cardId,
      tentativasPermitidas, totalItens: desafios.length,
    });
  }

  d.codigos.forEach((codigo, row) => {
    const esperado = decodeLinha(codigo, cols);
    const linhaOk  = esperado.every((v, col) => estadoGrid[row][col] === v);
    if (!linhaOk) gridCorreto = false;

    for (let col = 0; col < cols; col++) {
      const cell = document.querySelector(`.px-cell[data-row="${row}"][data-col="${col}"]`);
      if (cell) {
        cell.classList.remove('px-cell-certo', 'px-cell-errado');
        cell.classList.add(linhaOk ? 'px-cell-certo' : 'px-cell-errado');
      }
    }
    const label = document.getElementById(`px-codigo-${row}`);
    if (label) {
      label.classList.remove('px-codigo-certo', 'px-codigo-errado');
      label.classList.add(linhaOk ? 'px-codigo-certo' : 'px-codigo-errado');
    }
  });

  if (gridCorreto) {
    acertos++;
    const pts = parseFloat(d.pontos) || Math.floor((cardData.pontos_total || 100) / desafios.length);
    pontosGanhos += pts;
    somAcerto();
    mostrarFeedbackEl('✅ Grid correto! Avançando...', true);
    setTimeout(() => { desafioAtual++; renderDesafio(); }, 1600);
  } else {
    erros++;
    somErro();
    mostrarFeedbackEl('❌ Algumas linhas estão erradas. Ajuste e tente novamente!', false);
    setTimeout(() => {
      document.getElementById('px-feedback').style.display = 'none';
      document.querySelectorAll('.px-cell').forEach(c => c.classList.remove('px-cell-certo', 'px-cell-errado'));
      document.querySelectorAll('.px-codigo').forEach(c => c.classList.remove('px-codigo-certo', 'px-codigo-errado'));
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
      perfeito: { emoji: '🎨', titulo: 'Pixel Perfeito!',     msg: `Incrível! Você pintou todos os ${total} grids corretamente!` },
      bom:      { emoji: '🖼️', titulo: 'Muito bem!',          msg: `Você acertou ${acertos} de ${total} grids!` },
      esforco:  { emoji: '🖌️', titulo: 'Continue tentando!',  msg: `Você acertou ${acertos} de ${total} grids. Releia os códigos!` },
      fraco:    { emoji: '🔄', titulo: 'Não desista!',         msg: `Você acertou ${acertos} de ${total} grids. Pratique mais!` },
    },
  });

  const top = document.getElementById('tf-top');
  if (top) top.className = 'tf-top ' + (sucesso ? 'top-ok' : 'top-err');

  salvarResultado({
    colecao: 'resultados_pixel', docId: resultadoDocId,
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
