import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion, increment, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

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

const NIVEL_NOMES  = ['Explorador Iniciante','Curioso Digital','Aprendiz Maker','Construtor Criativo','Inventor em Ação','Programador Maker','Engenheiro Criativo','Inovador Maker','Mentor Maker','Mestre Maker'];
const NIVEL_PONTOS = [0,100,250,500,900,1400,2000,2700,3500,4500];

const COMPONENTES = [
  { id: 'arduino',             nome: 'Arduino',              arquivo: 'arduino.png' },
  { id: 'protoboard',          nome: 'Protoboard',           arquivo: 'protoboard.png' },
  { id: 'led',                 nome: 'LED',                  arquivo: 'led.png' },
  { id: 'botao',               nome: 'Botão',                arquivo: 'botao.png' },
  { id: 'resistor',            nome: 'Resistor',             arquivo: 'resistor.png' },
  { id: 'potenciometro',       nome: 'Potenciômetro',        arquivo: 'potenciometro.png' },
  { id: 'ldr',                 nome: 'LDR',                  arquivo: 'ldr.png' },
  { id: 'termistor',           nome: 'Termistor',            arquivo: 'termistor.png' },
  { id: 'matriz de led 8x8',          nome: 'Matriz de LED 8x8',   arquivo: 'matriz de led 8x8.png' },
  { id: 'sensor de som',          nome: 'Sensor de Som',        arquivo: 'sensor de som.png' },
  { id: 'sensor ultrassonico', nome: 'Sensor Ultrassônico',  arquivo: 'sensor ultrassonico.png' },
  { id: 'led rgb',             nome: 'LED RGB',              arquivo: 'led rgb.png' },
  { id: 'jumpers', nome: 'Jumpers', arquivo: 'jumpers.png' },
];

function getNivelIdx(pts) {
  for (let i = NIVEL_PONTOS.length - 1; i >= 0; i--) { if (pts >= NIVEL_PONTOS[i]) return i; }
  return 0;
}

// ============================================================
// SONS SINTÉTICOS — Web Audio API
// ============================================================
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Primitiva: toca uma nota com envelope simples
function nota(ctx, freq, tipo, inicio, duracao, vol = 0.28) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + inicio);
  gain.gain.setValueAtTime(0, ctx.currentTime + inicio);
  gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + inicio + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracao);
  osc.start(ctx.currentTime + inicio);
  osc.stop(ctx.currentTime + inicio + duracao + 0.02);
}

// Entrada no jogo — arpejo ascendente festivo (Dó-Mi-Sol-Dó)
function somEntrada() {
  try {
    const ctx = getAudioCtx();
    const freqs = [262, 330, 392, 523];
    freqs.forEach((f, i) => nota(ctx, f, 'triangle', i * 0.10, 0.18, 0.22));
    nota(ctx, 523, 'sine', 0.44, 0.5, 0.15); // sustain final suave
  } catch(e) {}
}

// Acerto — dois pings ascendentes rápidos
function somAcerto() {
  try {
    const ctx = getAudioCtx();
    nota(ctx, 587, 'sine', 0,    0.12, 0.30); // Ré5
    nota(ctx, 784, 'sine', 0.13, 0.22, 0.25); // Sol5
  } catch(e) {}
}

// Erro — dois tons descendentes graves, suaves (não assusta)
function somErro() {
  try {
    const ctx = getAudioCtx();
    nota(ctx, 330, 'triangle', 0,    0.14, 0.22); // Mi4
    nota(ctx, 220, 'triangle', 0.14, 0.28, 0.18); // Lá3
  } catch(e) {}
}

// Final bom (≥70%) — fanfarra: escala rápida + acorde triunfante
function somFinalBom() {
  try {
    const ctx = getAudioCtx();
    [262, 330, 392, 523, 659].forEach((f, i) =>
      nota(ctx, f, 'triangle', i * 0.07, 0.14, 0.20));
    // acorde maior no final
    [523, 659, 784].forEach(f =>
      nota(ctx, f, 'sine', 0.42, 0.8, 0.13));
  } catch(e) {}
}

// Final ruim (<70%) — três notas descendentes, leve
function somFinalRuim() {
  try {
    const ctx = getAudioCtx();
    nota(ctx, 392, 'triangle', 0,    0.22, 0.20); // Sol4
    nota(ctx, 330, 'triangle', 0.20, 0.22, 0.18); // Mi4
    nota(ctx, 262, 'triangle', 0.40, 0.40, 0.16); // Dó4
  } catch(e) {}
}

// Garante que o contexto retoma após qualquer interação do usuário
document.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
});

// ============================================================

const params  = new URLSearchParams(window.location.search);
const cardId  = params.get('card');

let perguntas = [], atual = 0, acertos = 0, erros = 0, pontosGanhos = 0;
let selecionados = [], respondida = false;
let listaEmbaralhada = [];
let cardData = null, alunoUid = null, escolaId = null, avatarSrc = '../assets/robo 1_transparente.png';
let tentativasPermitidas = 3, tentativasUsadas = 0, resultadoDocId = null, tentativaRegistrada = false, inicioJogo = 0;

function getSemanaLetiva() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), 2, 1);
  return Math.max(1, Math.ceil((hoje - inicio) / (7 * 24 * 3600 * 1000)));
}

async function init() {
  if (!cardId) { erroLoad('Card não especificado.'); return; }

  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = '../login.html'; return; }
    alunoUid = user.uid;

    try {
      const userSnap = await getDoc(doc(db, 'usuarios', user.uid));
      if (userSnap.exists()) {
        const u   = userSnap.data();
        const pts = u.pontos_total || 0;
        const idx = getNivelIdx(pts);
        const num = idx + 1;
        escolaId  = u.escola_id || '';
        const escolaSnap = await getDoc(doc(db, 'escolas', escolaId || '_'));
        const escolaNome = escolaSnap.exists() ? (escolaSnap.data().nome || '') : '';
        const el = document.getElementById('player-escola');
        if (el && escolaNome) el.textContent = escolaNome;
        document.getElementById('player-jogo').textContent = 'Qual Componente?';
        avatarSrc = '../assets/robo ' + num + '_transparente.png';
        document.getElementById('player-nome').textContent   = u.nome || user.displayName || user.email.split('@')[0];
        document.getElementById('player-nivel').textContent  = 'Nível ' + num + ' — ' + NIVEL_NOMES[idx];
        document.getElementById('player-pts').textContent    = pts;
        document.getElementById('player-avatar').src         = avatarSrc;
        document.getElementById('player-card').style.display = '';
      }

      const cardSnap = await getDoc(doc(db, 'cards', cardId));
      if (!cardSnap.exists()) { erroLoad('Card não encontrado.'); return; }
      cardData = cardSnap.data();
      document.getElementById('q-card-nome').textContent = cardData.nome || cardId;
      document.title = 'Qual Componente? — ' + (cardData.nome || cardId);

      if (!cardData.comp_perguntas || cardData.comp_perguntas.length === 0) {
        erroLoad('Este card não tem o jogo Qual Componente? cadastrado.'); return;
      }

      tentativasPermitidas = cardData.comp_tentativas || 3;
      resultadoDocId = user.uid + '_comp_' + cardId;

      const resultSnap = await getDoc(doc(db, 'resultados_comp', resultadoDocId));
      if (resultSnap.exists()) tentativasUsadas = resultSnap.data().tentativas_usadas || 0;

      if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(resultSnap.data()); return; }

      perguntas = [...cardData.comp_perguntas].sort(() => Math.random() - 0.5);
      iniciarJogo();

    } catch(e) { erroLoad('Erro: ' + e.message); }
  });
}

function erroLoad(msg) {
  document.getElementById('loading').innerHTML = '<p style="color:#e74c3c;font-weight:700;">' + msg + '</p>';
}

function iniciarJogo() {
  document.getElementById('loading').style.display     = 'none';
  document.getElementById('q-prog-wrap').style.display = '';
  document.getElementById('comp-box').style.display    = '';
  document.getElementById('q-placar').style.display    = '';
  somEntrada();
  renderPergunta();
}

function renderPergunta() {
  if (atual >= perguntas.length) { mostrarFinal(); return; }
  respondida = false;
  selecionados = [];

  const q   = perguntas[atual];
  const pts = parseFloat(q.pontos) || 1.0;
  const pct = Math.round((atual / perguntas.length) * 100);

  document.getElementById('prog-txt').textContent     = 'Pergunta ' + (atual + 1) + ' de ' + perguntas.length;
  document.getElementById('prog-pct').textContent     = pct + '%';
  document.getElementById('prog-fill').style.width    = pct + '%';
  document.getElementById('comp-num').textContent     = 'Pergunta ' + (atual + 1);
  document.getElementById('comp-pergunta').textContent = q.pergunta || '—';
  document.getElementById('comp-pts-badge').textContent = '+' + (pts % 1 === 0 ? pts : pts.toFixed(1)) + ' pt' + (pts !== 1 ? 's' : '');

  listaEmbaralhada = [...COMPONENTES].sort(() => Math.random() - 0.5);
  renderGrid(q, false);

  document.getElementById('comp-feedback').style.display  = 'none';
  document.getElementById('btn-verificar').style.display  = '';
  document.getElementById('btn-prox').style.display       = 'none';
}

function renderGrid(q, revelar) {
  const wrap    = document.getElementById('comp-grid-jogo');
  const corretos = q.corretos || [];

  // Usa lista já embaralhada (embaralha só uma vez por pergunta)
  const lista = listaEmbaralhada;

  wrap.innerHTML = '';
  lista.forEach(c => {
    const div      = document.createElement('div');
    const ehCorreto = corretos.includes(c.id);
    const selecionado = selecionados.includes(c.id);
    let cls = 'comp-item';

    if (revelar) {
      cls += ' desabilitado';
      if (ehCorreto && selecionado) cls += ' correto';
      else if (ehCorreto && !selecionado) cls += ' revelado';
      else if (!ehCorreto && selecionado) cls += ' incorreto';
    } else {
      if (selecionado) cls += ' selecionado';
    }

    const icon = revelar
      ? (ehCorreto && selecionado ? '<span class="comp-item-icon">✅</span>'
        : ehCorreto ? '<span class="comp-item-icon">🔍</span>'
        : selecionado ? '<span class="comp-item-icon">❌</span>' : '')
      : (selecionado ? '<span class="comp-item-icon" style="color:var(--roxo)">✓</span>' : '');

    div.className = cls;
    div.innerHTML =
      '<img class="comp-item-img" src="../assets/eletronicos/' + c.arquivo + '" alt="' + c.nome + '" onerror="this.style.opacity=\'0.25\'">' +
      '<div class="comp-item-nome">' + c.nome + '</div>' +
      icon;

    if (!revelar) div.onclick = () => toggleComp(c.id, q);
    wrap.appendChild(div);
  });
}

function toggleComp(id, q) {
  if (respondida) return;
  const idx = selecionados.indexOf(id);
  if (idx >= 0) selecionados.splice(idx, 1);
  else selecionados.push(id);
  renderGrid(q, false);
}

window.verificar = function() {
  if (respondida) return;
  const q = perguntas[atual];

  if (selecionados.length === 0) {
    const fb = document.getElementById('comp-feedback');
    fb.className = 'comp-feedback erro';
    fb.textContent = '⚠️ Selecione ao menos um componente!';
    fb.style.display = 'block';
    return;
  }

  if (!tentativaRegistrada && atual === 0) {
    tentativaRegistrada = true;
    registrarTentativa();
  }

  respondida = true;
  const corretos  = q.corretos || [];
  const pts       = parseFloat(q.pontos) || 1.0;
  const acertouTodos = corretos.length > 0 &&
    corretos.every(c => selecionados.includes(c)) &&
    selecionados.every(c => corretos.includes(c));

  renderGrid(q, true);

  const fb = document.getElementById('comp-feedback');
  if (acertouTodos) {
    acertos++;
    pontosGanhos += pts;
    somAcerto();
    fb.className = 'comp-feedback acerto';
    fb.textContent = '✅ Correto! ' + (q.feedback || 'Você identificou o(s) componente(s) certo(s)!');
  } else {
    erros++;
    somErro();
    fb.className = 'comp-feedback erro';
    fb.textContent = '❌ ' + (q.feedback || 'Os componentes corretos foram destacados em verde.');
  }
  fb.style.display = 'block';

  document.getElementById('pl-ac').textContent = acertos;
  document.getElementById('pl-er').textContent = erros;
  document.getElementById('pl-pt').textContent = pontosGanhos % 1 === 0 ? pontosGanhos : pontosGanhos.toFixed(1);

  if (atual >= perguntas.length - 1) {
    setTimeout(mostrarFinal, 1500);
  } else {
    document.getElementById('btn-verificar').style.display = 'none';
    document.getElementById('btn-prox').style.display = 'block';
  }
};

window.proxPergunta = function() { atual++; renderPergunta(); };

function mostrarFinal() {
  const total = perguntas.length;
  const pct   = Math.round((acertos / total) * 100);
  const concluido = pct >= 70;

  document.getElementById('res-ac').textContent = acertos;
  document.getElementById('res-er').textContent = erros;
  document.getElementById('res-pt').textContent = pontosGanhos % 1 === 0 ? pontosGanhos : pontosGanhos.toFixed(1);
  document.getElementById('tf-avatar').src      = avatarSrc;
  document.getElementById('tf-badge-concluido').style.display = concluido ? '' : 'none';

  let emoji, titulo, msg;
  if (pct === 100)    { emoji = '🏆'; titulo = 'Expert em Componentes!'; msg = 'Perfeito! Você reconheceu todos os componentes corretamente!'; }
  else if (pct >= 70) { emoji = '🔋'; titulo = 'Muito bem!'; msg = 'Você acertou ' + acertos + ' de ' + total + '. Continue explorando!'; }
  else if (pct >= 40) { emoji = '🔋'; titulo = 'Bom esforço!'; msg = 'Você acertou ' + acertos + ' de ' + total + '. Estude os componentes e tente de novo!'; }
  else                { emoji = '🔋'; titulo = 'Precisa praticar!'; msg = 'Revise os componentes do card e tente novamente!'; }

  document.getElementById('tf-emoji').textContent  = emoji;
  document.getElementById('tf-titulo').textContent = titulo;
  document.getElementById('tf-sub').textContent    = pct + '% de aproveitamento';
  document.getElementById('res-msg').textContent   = msg;

  const restantes = tentativasPermitidas - tentativasUsadas;
  const tentEl = document.getElementById('tf-tent-rest');
  if (tentEl) {
    tentEl.textContent = restantes > 0 ? restantes + ' tentativa(s) restante(s)' : 'Nenhuma tentativa restante';
    tentEl.style.color = restantes > 0 ? '#62708c' : '#e74c3c';
  }
  const btnTentar = document.querySelector('.btn-tentar');
  if (btnTentar) btnTentar.style.display = restantes > 0 ? '' : 'none';

  concluido ? somFinalBom() : somFinalRuim();
  document.getElementById('tela-final').style.display = 'flex';
  salvarResultado(acertos, pontosGanhos, total, concluido).catch(e => console.warn(e));
}

async function registrarTentativa() {
  if (!resultadoDocId || !alunoUid) return;
  inicioJogo = Date.now();
  try {
    const ref  = doc(db, 'resultados_comp', resultadoDocId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        aluno_id: alunoUid, card_id: cardId, escola_id: escolaId,
        tentativas_permitidas: tentativasPermitidas, tentativas_usadas: 1,
        concluido: false, melhor_pontos: 0, melhor_acertos: 0,
        total_perguntas: perguntas.length,
        primeira_vez: serverTimestamp(), ultima_vez: serverTimestamp(), historico: [],
        duracao_total_segundos: 0, historico_pontos: [],
        semana_letiva: getSemanaLetiva(), dispositivo: window.innerWidth < 768 ? 'mobile' : 'desktop'
      });
    } else {
      await updateDoc(ref, { tentativas_usadas: (snap.data().tentativas_usadas || 0) + 1, ultima_vez: serverTimestamp() });
    }
    tentativasUsadas++;
  } catch(e) { console.warn('Tentativa comp:', e); }
}

async function salvarResultado(acertos, pontos, total, concluido) {
  if (!resultadoDocId) return;
  const duracao = Math.round((Date.now() - inicioJogo) / 1000);
  const ref = doc(db, 'resultados_comp', resultadoDocId);
  await updateDoc(ref, {
    concluido, melhor_pontos: pontos, melhor_acertos: acertos,
    historico: arrayUnion({ data: new Date().toISOString(), pontos, acertos, pct: Math.round((acertos/total)*100) }),
    historico_pontos: arrayUnion(pontos),
    duracao_total_segundos: increment(duracao),
    ultima_vez: serverTimestamp()
  });
  const cols = ['resultados_quiz','resultados_bug','resultados_comp','resultados_ordena','resultados_complete','resultados_conecta','resultados_box','resultados_binario'];
  const snaps = await Promise.all(cols.map(c => getDocs(query(collection(db,c), where('aluno_id','==',alunoUid)))));
  let total2 = 0;
  snaps.forEach(s => s.forEach(d => { total2 += parseFloat(d.data().melhor_pontos)||0; }));
  await updateDoc(doc(db, 'usuarios', alunoUid), { pontos_total: Math.round(total2 * 10) / 10 });
  document.getElementById('player-pts').textContent = Math.round(total2 * 10) / 10;
}

function mostrarBloqueado(dados) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('comp-box').innerHTML = `
    <div style="padding:40px 28px;text-align:center;">
      <div style="font-size:52px;margin-bottom:16px;">🔒</div>
      <div style="font-family:'Nunito',sans-serif;font-size:22px;font-weight:900;color:#2F3447;margin-bottom:8px;">Jogo encerrado</div>
      <div style="font-size:14px;color:#5F6480;margin-bottom:24px;">Você já usou todas as <strong>${tentativasPermitidas}</strong> tentativas.</div>
      ${dados ? `<div style="background:#f5eef8;border:1.5px solid #9b59b6;border-radius:16px;padding:16px;margin-bottom:24px;display:inline-block;">
        <div style="font-family:'Nunito',sans-serif;font-size:24px;font-weight:900;color:#4a235a;">${dados.melhor_acertos}/${dados.total_perguntas} corretos</div>
        <div style="color:#6c3483;font-weight:700;">${dados.melhor_pontos} pontos</div>
        ${dados.concluido ? '<div style="margin-top:8px;font-size:13px;color:#15803d;font-weight:700;">✅ Desafio concluído!</div>' : ''}
      </div>` : ''}
      <br><button class="btn-voltar" onclick="voltarCard()" style="max-width:280px;margin:0 auto;">← Voltar ao Card</button>
    </div>`;
  document.getElementById('comp-box').style.display = '';
}

window.reiniciar = function() {
  if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(null); return; }
  atual = 0; acertos = 0; erros = 0; pontosGanhos = 0;
  tentativaRegistrada = false; selecionados = []; respondida = false;
  perguntas = [...cardData.comp_perguntas].sort(() => Math.random() - 0.5);
  document.getElementById('tela-final').style.display = 'none';
  document.getElementById('pl-ac').textContent = '0';
  document.getElementById('pl-er').textContent = '0';
  document.getElementById('pl-pt').textContent = '0';
  renderPergunta();
};

window.voltarCard = function() {
  if (window.opener) window.close();
  else if (window.history.length > 1) history.back();
  else window.location.href = '../cards/card.html?id=' + cardId;
};

init();
