import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyAndgQiwxpe6wyCF8aa5NqqdMuwLJfMIMM",
  authDomain: "makerlab3d-4e455.firebaseapp.com",
  projectId: "makerlab3d-4e455",
  storageBucket: "makerlab3d-4e455.firebasestorage.app",
  messagingSenderId: "495457985822",
  appId: "1:495457985822:web:05efcebeed970ecb82150f"
});
const auth = getAuth(app);
const db   = getFirestore(app);

let NIVEL_NOMES  = ['Explorador Iniciante','Curioso Digital','Aprendiz Maker','Construtor Criativo','Inventor em Ação','Programador Maker','Engenheiro Criativo','Inovador Maker','Mentor Maker','Mestre Maker'];
let NIVEL_PONTOS = [0,100,250,500,900,1400,2000,2700,3500,4500];

function getNivelIdx(pts) {
  for (let i = NIVEL_PONTOS.length - 1; i >= 0; i--) { if (pts >= NIVEL_PONTOS[i]) return i; }
  return 0;
}

function getSemanaLetiva() {
  const hoje  = new Date();
  const inicio = new Date(hoje.getFullYear(), 2, 1);
  return Math.max(1, Math.ceil((hoje - inicio) / (7 * 24 * 3600 * 1000)));
}

const params     = new URLSearchParams(window.location.search);
const cardId     = params.get('card');
const secaoParam = params.get('secao');

let cardData   = null;
let desafios   = [];
let desafioIdx = 0;
let acertos    = 0;
let erros      = 0;
let pontosGanhos       = 0;
let tentativasUsadas   = 0;
let tentativasPermitidas = 3;
let tentativaAtual     = 0;
let respondida         = false;
let alunoUid  = '';
let escolaId  = '';
let resultadoDocId = '';
let nivelNum  = 1;

// ── Estado do drag-and-drop ──
let blocos      = [];
let zonasEstado = { configurar: [], repetir: [], palette: [] };
let dragId      = null;
let dragSource  = null;

// ────────────────────────────────────────────
// ERRO / BLOQUEIO
// ────────────────────────────────────────────
function erroLoad(msg) {
  const el = document.getElementById('loading');
  if (el) el.innerHTML = `
    <div style="font-size:48px;margin-bottom:8px;">⚠️</div>
    <p style="max-width:360px;text-align:center;line-height:1.6;color:var(--azul-med);">${msg}</p>
    <button onclick="voltarCard()" style="margin-top:16px;background:var(--azul);color:#fff;border:none;border-radius:10px;padding:10px 22px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;">← Voltar</button>
  `;
}

function mostrarBloqueado(res) {
  const melhor = res ? (res.melhor_acertos || 0) + '/' + (res.total_desafios || '?') : '—';
  erroLoad(`Você já usou todas as tentativas neste jogo.<br>Melhor resultado: ${melhor} desafios.`);
}

// ────────────────────────────────────────────
// NAVEGAÇÃO
// ────────────────────────────────────────────
window.voltarCard = function() {
  if (window.opener) window.close();
  else if (window.history.length > 1) history.back();
  else window.location.href = '../cards/card.html?id=' + cardId;
};

window.reiniciar = function() {
  if (tentativasUsadas >= tentativasPermitidas) return;
  acertos      = 0;
  erros        = 0;
  pontosGanhos = 0;
  document.getElementById('tela-final').style.display    = 'none';
  document.getElementById('jogo-box').style.display      = '';
  document.getElementById('q-prog-wrap').style.display   = '';
  document.getElementById('q-placar').style.display      = '';
  document.getElementById('tf-badge-concluido').style.display = 'none';
  document.getElementById('btn-tentar').style.display    = '';
  document.getElementById('pl-ac').textContent = '0';
  document.getElementById('pl-er').textContent = '0';
  document.getElementById('pl-pt').textContent = '0';
  carregarDesafio(0);
};

// ────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────
async function init() {
  if (!cardId) { erroLoad('Card não especificado.'); return; }

  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = '../login.html'; return; }
    alunoUid = user.uid;

    try {
      // Perfil do aluno
      const userSnap = await getDoc(doc(db, 'usuarios', user.uid));
      if (userSnap.exists()) {
        const u   = userSnap.data();
        const pts = u.pontos_total || 0;
        escolaId  = u.escola_id || '';

        if (secaoParam) {
          try {
            const sSnap = await getDoc(doc(db, 'secoes', secaoParam));
            if (sSnap.exists()) {
              const niveis = sSnap.data().niveis;
              if (Array.isArray(niveis) && niveis.length === 10) {
                NIVEL_NOMES  = niveis.map(n => n.nome  || '');
                NIVEL_PONTOS = niveis.map(n => n.pontos ?? 0);
              }
            }
          } catch(_) {}
        }

        const idx = getNivelIdx(pts);
        nivelNum  = idx + 1;
        document.getElementById('player-jogo').textContent   = 'Lógica do Sistema';
        document.getElementById('player-nome').textContent   = u.nome || user.email.split('@')[0];
        document.getElementById('player-nivel').textContent  = 'Nível ' + nivelNum + ' — ' + NIVEL_NOMES[idx];
        document.getElementById('player-pts').textContent    = pts;
        document.getElementById('player-avatar').src         = '../assets/robo ' + nivelNum + '_transparente.png';
        document.getElementById('player-card').style.display = '';

        if (escolaId) {
          try {
            const eSnap = await getDoc(doc(db, 'escolas', escolaId));
            const el = document.getElementById('player-escola');
            if (el && eSnap.exists()) el.textContent = eSnap.data().nome || '';
          } catch(_) {}
        }
      }

      // Card
      const cardSnap = await getDoc(doc(db, 'cards', cardId));
      if (!cardSnap.exists()) { erroLoad('Card não encontrado.'); return; }
      cardData = cardSnap.data();

      document.getElementById('q-card-nome').textContent = cardData.nome || cardId;
      document.title = 'Lógica do Sistema — ' + (cardData.nome || cardId);

      if (!cardData.logica_desafios || cardData.logica_desafios.length === 0) {
        erroLoad('Este card não tem o jogo Lógica do Sistema cadastrado.');
        return;
      }

      tentativasPermitidas = cardData.logica_tentativas || 3;
      resultadoDocId       = user.uid + '_logica_' + cardId;

      const resSnap = await getDoc(doc(db, 'resultados_logica', resultadoDocId));
      if (resSnap.exists()) tentativasUsadas = resSnap.data().tentativas_usadas || 0;
      if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(resSnap.exists() ? resSnap.data() : null); return; }

      desafios = [...cardData.logica_desafios];

      document.getElementById('loading').style.display      = 'none';
      document.getElementById('jogo-box').style.display     = '';
      document.getElementById('q-prog-wrap').style.display  = '';
      document.getElementById('q-placar').style.display     = '';

      carregarDesafio(0);

    } catch(e) { erroLoad('Erro: ' + e.message); }
  });
}

// ────────────────────────────────────────────
// DESAFIO
// ────────────────────────────────────────────
function carregarDesafio(idx) {
  desafioIdx     = idx;
  tentativaAtual = 0;
  respondida     = false;

  const d    = desafios[idx];
  const pct  = Math.round(idx / desafios.length * 100);

  document.getElementById('q-num').textContent       = 'Desafio ' + (idx + 1) + ' de ' + desafios.length;
  document.getElementById('q-texto').textContent     = d.titulo || 'Organize o programa';
  document.getElementById('q-pts-badge').textContent = '+' + (d.pontos || 2) + ' pts';
  document.getElementById('prog-txt').textContent    = 'Desafio ' + (idx + 1) + ' de ' + desafios.length;
  document.getElementById('prog-pct').textContent    = pct + '%';
  document.getElementById('prog-fill').style.width   = pct + '%';

  const fb = document.getElementById('feedback');
  fb.textContent = '';
  fb.className   = 'jogo-feedback';
  fb.style.display = 'none';

  const btn = document.getElementById('btn-verificar');
  btn.disabled = false;

  renderTentativas();
  initDesafio(d);
}

function renderTentativas() {
  const row  = document.getElementById('tentativas-row');
  const dots = Array.from({ length: tentativasPermitidas }, (_, i) =>
    `<span style="font-size:15px;">${i < tentativaAtual ? '💔' : '❤️'}</span>`
  ).join('');
  row.innerHTML = '<span style="font-size:12px;color:rgba(255,255,255,0.6);margin-right:4px;">Tentativas:</span>' + dots;
}

function initDesafio(d) {
  blocos = [];
  (d.configurar || []).forEach((texto, i) =>
    blocos.push({ id: 'cfg_' + i, texto, zona_correta: 'configurar', ordem_correta: i })
  );
  (d.repetir || []).forEach((texto, i) =>
    blocos.push({ id: 'rep_' + i, texto, zona_correta: 'repetir', ordem_correta: i })
  );

  const shuffled = [...blocos].sort(() => Math.random() - 0.5);
  zonasEstado = {
    configurar: [],
    repetir:    [],
    palette:    shuffled.map(b => b.id),
  };
  renderAll();
}

// ────────────────────────────────────────────
// RENDER
// ────────────────────────────────────────────
function renderAll() {
  renderPalette();
  renderZona('configurar');
  renderZona('repetir');
}

function renderPalette() {
  const el = document.getElementById('palette');
  el.innerHTML = '';
  if (zonasEstado.palette.length === 0) {
    el.innerHTML = '<div class="palette-vazio">Todos os blocos foram colocados</div>';
    return;
  }
  zonasEstado.palette.forEach(id => {
    const b = blocos.find(x => x.id === id);
    if (b) el.appendChild(criarBlocoEl(b, 'palette'));
  });
}

function renderZona(zona) {
  const el   = document.getElementById('zona-' + zona);
  const hint = document.getElementById('hint-' + zona);
  el.querySelectorAll('.bloco, .insert-line').forEach(n => n.remove());

  if (zonasEstado[zona].length === 0) {
    if (hint) hint.style.display = '';
  } else {
    if (hint) hint.style.display = 'none';
    zonasEstado[zona].forEach(id => {
      const b = blocos.find(x => x.id === id);
      if (b) el.appendChild(criarBlocoEl(b, zona));
    });
  }
}

function criarBlocoEl(bloco, source) {
  const div     = document.createElement('div');
  div.className = 'bloco bloco-' + source;
  div.draggable = true;
  div.dataset.id     = bloco.id;
  div.dataset.source = source;

  const icon = source === 'configurar' ? '⚙️' : source === 'repetir' ? '🔄' : '▣';
  div.innerHTML = `<span class="bloco-icon">${icon}</span>${bloco.texto}`;

  div.addEventListener('dragstart', e => {
    dragId     = bloco.id;
    dragSource = source;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => div.classList.add('dragging'), 0);
  });
  div.addEventListener('dragend', () => {
    div.classList.remove('dragging');
    clearInsertLines();
    clearDragOver();
  });
  div.addEventListener('dragover', e => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId || dragId === bloco.id) return;
    const rect   = div.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    clearInsertLines(div.parentElement);
    const line = document.createElement('div');
    line.className = 'insert-line';
    div.parentElement.insertBefore(line, before ? div : div.nextSibling);
  });
  div.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId || dragId === bloco.id) return;
    const rect   = div.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    moverBloco(dragId, dragSource, source, bloco.id, before);
    dragId = null; dragSource = null;
  });

  return div;
}

// ────────────────────────────────────────────
// DRAG & DROP — zonas
// ────────────────────────────────────────────
window.onDragOverZona = function(e, zona) {
  e.preventDefault();
  const el = zona === 'palette' ? document.getElementById('palette') : document.getElementById('zona-' + zona);
  if (el) el.classList.add('drag-over');
};

window.onDragLeaveZona = function(e, zona) {
  const el = zona === 'palette' ? document.getElementById('palette') : document.getElementById('zona-' + zona);
  if (el && !el.contains(e.relatedTarget)) el.classList.remove('drag-over');
};

window.onDropZona = function(e, zona) {
  e.preventDefault();
  const el = zona === 'palette' ? document.getElementById('palette') : document.getElementById('zona-' + zona);
  if (el) el.classList.remove('drag-over');
  if (!dragId) return;
  moverBloco(dragId, dragSource, zona, null, false);
  dragId = null; dragSource = null;
};

function moverBloco(id, fromZona, toZona, relativoId, insertBefore) {
  if (fromZona === 'palette') {
    zonasEstado.palette = zonasEstado.palette.filter(x => x !== id);
  } else if (fromZona) {
    zonasEstado[fromZona] = (zonasEstado[fromZona] || []).filter(x => x !== id);
  }

  if (toZona === 'palette') {
    zonasEstado.palette.push(id);
  } else {
    const arr = zonasEstado[toZona] || [];
    if (relativoId) {
      const ref = arr.indexOf(relativoId);
      arr.splice(ref >= 0 ? (insertBefore ? ref : ref + 1) : arr.length, 0, id);
    } else {
      arr.push(id);
    }
    zonasEstado[toZona] = arr;
  }

  renderAll();
}

function clearInsertLines(parent) {
  (parent || document).querySelectorAll('.insert-line').forEach(l => l.remove());
}
function clearDragOver() {
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

// ────────────────────────────────────────────
// VERIFICAR
// ────────────────────────────────────────────
window.verificarResposta = function() {
  if (respondida) return;

  const d       = desafios[desafioIdx];
  const corrCfg = d.configurar || [];
  const corrRep = d.repetir    || [];

  const estadoCfg = zonasEstado.configurar.map(id => blocos.find(b => b.id === id)?.texto || '');
  const estadoRep = zonasEstado.repetir.map(id    => blocos.find(b => b.id === id)?.texto || '');

  const cfgOk  = JSON.stringify(estadoCfg) === JSON.stringify(corrCfg);
  const repOk  = JSON.stringify(estadoRep) === JSON.stringify(corrRep);
  const correto = cfgOk && repOk;

  tentativaAtual++;
  renderTentativas();

  const fb  = document.getElementById('feedback');
  fb.style.display = '';

  if (correto) {
    respondida = true;
    const pts = parseFloat(d.pontos) || 2.0;
    pontosGanhos += pts;
    acertos++;
    fb.textContent = '✅ Correto! Programa montado na ordem certa!';
    fb.className   = 'jogo-feedback acerto';
    document.getElementById('btn-verificar').disabled = true;
    atualizarPlacar();
    setTimeout(() => avancarOuFinalizar(), 1400);
  } else {
    erros++;
    let dica = '';
    if (!cfgOk && !repOk) dica = 'As duas áreas estão incorretas.';
    else if (!cfgOk)       dica = 'A área "configurar" está incorreta.';
    else                   dica = 'A área "repetir" está incorreta.';

    atualizarPlacar();

    if (tentativaAtual >= tentativasPermitidas) {
      respondida = true;
      fb.textContent = '❌ Tentativas esgotadas. ' + dica;
      fb.className   = 'jogo-feedback erro';
      document.getElementById('btn-verificar').disabled = true;
      setTimeout(() => avancarOuFinalizar(), 2000);
    } else {
      const restam = tentativasPermitidas - tentativaAtual;
      fb.textContent = `❌ ${dica} Ainda ${restam} tentativa${restam !== 1 ? 's' : ''}.`;
      fb.className   = 'jogo-feedback erro';
    }
  }
};

function atualizarPlacar() {
  document.getElementById('pl-ac').textContent = acertos;
  document.getElementById('pl-er').textContent = erros;
  const val = Number.isInteger(pontosGanhos) ? pontosGanhos : pontosGanhos.toFixed(1);
  document.getElementById('pl-pt').textContent = val;
}

function avancarOuFinalizar() {
  if (desafioIdx + 1 < desafios.length) {
    carregarDesafio(desafioIdx + 1);
  } else {
    finalizarJogo();
  }
}

// ────────────────────────────────────────────
// FINALIZAR
// ────────────────────────────────────────────
async function finalizarJogo() {
  document.getElementById('jogo-box').style.display    = 'none';
  document.getElementById('q-placar').style.display    = 'none';
  document.getElementById('q-prog-wrap').style.display = 'none';

  const total  = desafios.length;
  const pct    = Math.round(acertos / total * 100);
  const ptsVal = Number.isInteger(pontosGanhos) ? pontosGanhos : pontosGanhos.toFixed(1);

  let emoji, titulo, msg;
  if (pct === 100) {
    emoji = '🏆'; titulo = 'Programa perfeito!';
    msg   = 'Você organizou todos os blocos corretamente. Pensa como um programador!';
  } else if (pct >= 60) {
    emoji = '⚙️'; titulo = 'Bom trabalho!';
    msg   = `Você acertou ${acertos} de ${total} desafios. Continue praticando a lógica!`;
  } else {
    emoji = '🔧'; titulo = 'Continue praticando!';
    msg   = `Você acertou ${acertos} de ${total}. Revise a ordem dos blocos e tente novamente!`;
  }

  document.getElementById('tf-emoji').textContent  = emoji;
  document.getElementById('tf-titulo').textContent = titulo;
  document.getElementById('tf-sub').textContent    = msg;
  document.getElementById('res-ac').textContent    = acertos;
  document.getElementById('res-er').textContent    = total - acertos;
  document.getElementById('res-pt').textContent    = ptsVal;
  document.getElementById('tf-avatar').src         = '../assets/robo ' + nivelNum + '_transparente.png';

  if (pct === 100) document.getElementById('tf-badge-concluido').style.display = '';

  tentativasUsadas++;
  const restantes = tentativasPermitidas - tentativasUsadas;
  const tentEl = document.getElementById('tf-tent-rest');
  if (restantes > 0) {
    tentEl.textContent = `Você ainda tem ${restantes} tentativa${restantes !== 1 ? 's' : ''} restante${restantes !== 1 ? 's' : ''}.`;
  } else {
    tentEl.textContent = 'Você usou todas as tentativas.';
    document.getElementById('btn-tentar').style.display = 'none';
  }

  document.getElementById('tela-final').style.display = 'flex';

  // Salva resultado
  try {
    const concluiu = acertos === total;
    const ref  = doc(db, 'resultados_logica', resultadoDocId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        aluno_id:              alunoUid,
        card_id:               cardId,
        escola_id:             escolaId,
        tentativas_permitidas: tentativasPermitidas,
        tentativas_usadas:     tentativasUsadas,
        concluido:             concluiu,
        melhor_pontos:         pontosGanhos,
        melhor_acertos:        acertos,
        total_desafios:        total,
        primeira_vez:          serverTimestamp(),
        ultima_vez:            serverTimestamp(),
        historico:             [],
      });
    } else {
      const prev = snap.data();
      await updateDoc(ref, {
        tentativas_usadas: tentativasUsadas,
        concluido:         concluiu || (prev.concluido === true),
        melhor_pontos:     Math.max(prev.melhor_pontos || 0, pontosGanhos),
        melhor_acertos:    Math.max(prev.melhor_acertos || 0, acertos),
        ultima_vez:        serverTimestamp(),
        historico:         arrayUnion({ data: new Date().toISOString(), pontos: pontosGanhos, acertos, total }),
      });
    }

    if (pontosGanhos > 0) {
      const semana = getSemanaLetiva();
      await updateDoc(doc(db, 'usuarios', alunoUid), {
        pontos_total:                increment(pontosGanhos),
        [`pontos_semana_${semana}`]: increment(pontosGanhos),
        [`pontos_logica_${cardId}`]: increment(pontosGanhos),
      });
    }
  } catch(e) { console.warn('Erro ao salvar resultado:', e); }
}

// ────────────────────────────────────────────
init();
