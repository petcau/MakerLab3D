import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

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

// ============================================================
// SONS SINTÉTICOS
// ============================================================
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function nota(ctx, freq, tipo, inicio, duracao, vol = 0.28) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + inicio);
  gain.gain.setValueAtTime(0, ctx.currentTime + inicio);
  gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + inicio + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracao);
  osc.start(ctx.currentTime + inicio);
  osc.stop(ctx.currentTime + inicio + duracao + 0.02);
}
function somEntrada()  { try { const c = getAudioCtx(); [262,330,392,523].forEach((f,i) => nota(c,f,'triangle',i*0.10,0.18,0.22)); } catch(e) {} }
function somConecta()  { try { const c = getAudioCtx(); nota(c,440,'sine',0,0.07,0.18); nota(c,550,'sine',0.06,0.09,0.14); } catch(e) {} }
function somAcerto()   { try { const c = getAudioCtx(); nota(c,587,'sine',0,0.12,0.30); nota(c,784,'sine',0.13,0.22,0.25); } catch(e) {} }
function somErro()     { try { const c = getAudioCtx(); nota(c,330,'triangle',0,0.14,0.22); nota(c,220,'triangle',0.14,0.28,0.18); } catch(e) {} }
function somFinalBom() { try { const c = getAudioCtx(); [262,330,392,523,659].forEach((f,i) => nota(c,f,'triangle',i*0.07,0.14,0.20)); } catch(e) {} }
function somFinalRuim(){ try { const c = getAudioCtx(); nota(c,392,'triangle',0,0.22,0.20); nota(c,262,'triangle',0.40,0.40,0.16); } catch(e) {} }
document.addEventListener('click', () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); });

// ============================================================
// MAPA COMPLETO DE PINOS DO BOX
// x e y em % da área da imagem (baseado na proporção 1330x875)
// ============================================================
const PINOS_BOX = {
  // ---- LEDS ----
  '1':  { label: '1',       grupo: 'LEDS',          x: 6.5,  y: 11.0, cor: '#e74c3c' },
  '2':  { label: '2',       grupo: 'LEDS',          x: 25.4, y: 10.7, cor: '#e74c3c' },
  '3':  { label: '3',       grupo: 'LEDS',          x: 6.8,  y: 19.2, cor: '#e74c3c' },
  '4':  { label: '4',       grupo: 'LEDS',          x: 25.4, y: 19.0, cor: '#e74c3c' },
  '5':  { label: '5',       grupo: 'LEDS',          x: 6.8,  y: 27.8, cor: '#e74c3c' },
  '6':  { label: '6',       grupo: 'LEDS',          x: 25.2, y: 27.8, cor: '#e74c3c' },
  // ---- RGB ----
  '7':  { label: '7 −',     grupo: 'RGB',           x: 6.8,  y: 39.2, cor: '#9b59b6' },
  '8':  { label: '8 R',     grupo: 'RGB',           x: 25.2, y: 39.4, cor: '#9b59b6' },
  '9':  { label: '9 B',     grupo: 'RGB',           x: 6.7,  y: 49.6, cor: '#9b59b6' },
  '10': { label: '10 G',    grupo: 'RGB',           x: 25.3, y: 49.3, cor: '#9b59b6' },
  // ---- BUTTON ----
  '11': { label: 'B1',      grupo: 'BUTTON',        x: 34.8, y: 11.5, cor: '#3498db' },
  '12': { label: 'B2',      grupo: 'BUTTON',        x: 52.8, y: 11.6, cor: '#3498db' },
  // ---- RESISTORS (topo) ----
  '15': { label: '15',      grupo: 'RESISTORS',     x: 32.7, y: 25.8, cor: '#f39c12' },
  '17': { label: '17',      grupo: 'RESISTORS',     x: 38.7, y: 26.1, cor: '#f39c12' },
  '19': { label: '19',      grupo: 'RESISTORS',     x: 44.4, y: 25.8, cor: '#f39c12' },
  '21': { label: '21',      grupo: 'RESISTORS',     x: 49.8, y: 25.8, cor: '#f39c12' },
  '23': { label: '23',      grupo: 'RESISTORS',     x: 55.5, y: 25.8, cor: '#f39c12' },
  // ---- RESISTORS (base) ----
  '16': { label: '16',      grupo: 'RESISTORS',     x: 32.8, y: 49.0, cor: '#f39c12' },
  '18': { label: '18',      grupo: 'RESISTORS',     x: 39.0, y: 48.7, cor: '#f39c12' },
  '20': { label: '20',      grupo: 'RESISTORS',     x: 44.5, y: 48.7, cor: '#f39c12' },
  '22': { label: '22',      grupo: 'RESISTORS',     x: 50.3, y: 49.0, cor: '#f39c12' },
  '24': { label: '24',      grupo: 'RESISTORS',     x: 56.0, y: 48.7, cor: '#f39c12' },
  // ---- POTENCIÔMETRO ----
  '31': { label: '31 GND',  grupo: 'POTENCIÔMETRO', x: 64.8, y: 29.1, cor: '#16a085' },
  '32': { label: '32 AN',   grupo: 'POTENCIÔMETRO', x: 70.3, y: 29.0, cor: '#16a085' },
  '33': { label: '33 5V',   grupo: 'POTENCIÔMETRO', x: 76.0, y: 29.3, cor: '#16a085' },
  // ---- BEEP ----
  '34': { label: '34 LOG',  grupo: 'BEEP',          x: 65.1, y: 60.3, cor: '#e67e22' },
  '35': { label: '35 GND',  grupo: 'BEEP',          x: 74.6, y: 60.3, cor: '#e67e22' },
  // ---- SENSOR ----
  '36': { label: '36',      grupo: 'SENSOR',        x: 62.9, y: 77.9, cor: '#27ae60' },
  '37': { label: '37',      grupo: 'SENSOR',        x: 67.5, y: 78.2, cor: '#27ae60' },
  '38': { label: '38',      grupo: 'SENSOR',        x: 72.2, y: 78.1, cor: '#27ae60' },
  '39': { label: '39',      grupo: 'SENSOR',        x: 76.8, y: 77.8, cor: '#27ae60' },
  // ---- PROTOBOARD-A ----
  '61': { label: '61',      grupo: 'PROTOBOARD-A',  x: 7.8,  y: 63.8, cor: '#27ae60' },
  '62': { label: '62',      grupo: 'PROTOBOARD-A',  x: 12.7, y: 63.8, cor: '#27ae60' },
  '63': { label: '63',      grupo: 'PROTOBOARD-A',  x: 18.1, y: 63.9, cor: '#27ae60' },
  '64': { label: '64',      grupo: 'PROTOBOARD-A',  x: 23.4, y: 64.1, cor: '#27ae60' },
  '65': { label: '65',      grupo: 'PROTOBOARD-A',  x: 27.8, y: 64.1, cor: '#27ae60' },
  // ---- PROTOBOARD-B ----
  '66': { label: '66',      grupo: 'PROTOBOARD-B',  x: 34.5, y: 63.9, cor: '#e67e22' },
  '67': { label: '67',      grupo: 'PROTOBOARD-B',  x: 39.3, y: 64.1, cor: '#e67e22' },
  '68': { label: '68',      grupo: 'PROTOBOARD-B',  x: 44.7, y: 64.2, cor: '#e67e22' },
  '69': { label: '69',      grupo: 'PROTOBOARD-B',  x: 50.1, y: 64.4, cor: '#e67e22' },
  '70': { label: '70',      grupo: 'PROTOBOARD-B',  x: 54.5, y: 64.4, cor: '#e67e22' },
  // ---- LOGIC GATES ----
  'L02': { label: 'L02',    grupo: 'LOGIC GATES',   x: 8.0,  y: 84.3, cor: '#f1c40f' },
  'L03': { label: 'L03',    grupo: 'LOGIC GATES',   x: 12.1, y: 84.1, cor: '#f1c40f' },
  'L04': { label: 'L04',    grupo: 'LOGIC GATES',   x: 16.3, y: 84.3, cor: '#f1c40f' },
  'L05': { label: 'L05',    grupo: 'LOGIC GATES',   x: 20.8, y: 84.1, cor: '#f1c40f' },
  'L06': { label: 'L06',    grupo: 'LOGIC GATES',   x: 25.3, y: 84.4, cor: '#f1c40f' },
  'L07': { label: 'L07',    grupo: 'LOGIC GATES',   x: 29.6, y: 84.0, cor: '#f1c40f' },
  'L08': { label: 'L08',    grupo: 'LOGIC GATES',   x: 34.1, y: 84.1, cor: '#f1c40f' },
  'L09': { label: 'L09',    grupo: 'LOGIC GATES',   x: 38.3, y: 84.1, cor: '#f1c40f' },
  'L10': { label: 'L10',    grupo: 'LOGIC GATES',   x: 43.3, y: 84.1, cor: '#f1c40f' },
  'L11': { label: 'L11',    grupo: 'LOGIC GATES',   x: 47.4, y: 84.1, cor: '#f1c40f' },
  'L12': { label: 'L12',    grupo: 'LOGIC GATES',   x: 51.7, y: 84.1, cor: '#f1c40f' },
  'L13': { label: 'L13',    grupo: 'LOGIC GATES',   x: 56.2, y: 84.6, cor: '#f1c40f' },
  // ---- TEST ----
  'T2': { label: 'T2',      grupo: 'TEST',          x: 91.4, y: 8.5,  cor: '#95a5a6' },
  'T1': { label: 'T1',      grupo: 'TEST',          x: 91.6, y: 18.1, cor: '#95a5a6' },
  // ---- ANALOG ----
  'A2': { label: 'A2',      grupo: 'ANALOG',        x: 84.4, y: 27.0, cor: '#8e44ad' },
  'A5': { label: 'A5',      grupo: 'ANALOG',        x: 91.2, y: 27.0, cor: '#8e44ad' },
  'A1': { label: 'A1',      grupo: 'ANALOG',        x: 84.6, y: 33.9, cor: '#8e44ad' },
  'A4': { label: 'A4',      grupo: 'ANALOG',        x: 91.1, y: 33.6, cor: '#8e44ad' },
  'A0': { label: 'A0',      grupo: 'ANALOG',        x: 84.7, y: 40.8, cor: '#8e44ad' },
  'A3': { label: 'A3',      grupo: 'ANALOG',        x: 91.2, y: 40.5, cor: '#8e44ad' },
  // ---- TX/RX ----
  'TX': { label: 'TX',      grupo: 'TX/RX',         x: 88.8, y: 50.2, cor: '#d35400' },
  'L1': { label: 'L1',      grupo: 'TX/RX',         x: 88.6, y: 50.4, cor: '#d35400' },
  'RX': { label: 'RX',      grupo: 'TX/RX',         x: 88.8, y: 57.2, cor: '#d35400' },
  'L0': { label: 'L0',      grupo: 'TX/RX',         x: 88.8, y: 57.1, cor: '#d35400' },
  // ---- POWER ----
  '86': { label: '86 5V',   grupo: 'POWER',         x: 88.6, y: 67.4, cor: '#c0392b' },
  '85': { label: '85 3.3V', grupo: 'POWER',         x: 89.0, y: 74.9, cor: '#c0392b' },
  '84': { label: '84 GND',  grupo: 'POWER',         x: 88.6, y: 82.0, cor: '#c0392b' },
  '83': { label: '83 GND',  grupo: 'POWER',         x: 88.6, y: 89.8, cor: '#c0392b' },
};

const NIVEL_NOMES  = ['Explorador Iniciante','Curioso Digital','Aprendiz Maker','Construtor Criativo','Inventor em Ação','Programador Maker','Engenheiro Criativo','Inovador Maker','Mentor Maker','Mestre Maker'];
const NIVEL_PONTOS = [0,100,250,500,900,1400,2000,2700,3500,4500];
function getNivelIdx(pts) { for (let i = NIVEL_PONTOS.length-1; i>=0; i--) { if (pts >= NIVEL_PONTOS[i]) return i; } return 0; }

const params = new URLSearchParams(window.location.search);
const cardId = params.get('card');

// Estado
let desafios = [], atual = 0, acertos = 0, erros = 0, pontosGanhos = 0;
let cardData = null, alunoUid = null, escolaId = null, avatarSrc = '../assets/robo 1_transparente.png';
let tentativasPermitidas = 3, tentativasUsadas = 0, resultadoDocId = null, tentativaRegistrada = false;

// Circuito
let selecionado    = null;
let conexoesUsuario = [];
let testado        = false;
let tempLinha      = null;

// ============================================================
// INIT
// ============================================================
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
        avatarSrc = '../assets/robo ' + num + '_transparente.png';
        document.getElementById('player-nome').textContent  = u.nome || user.displayName || user.email.split('@')[0];
        document.getElementById('player-nivel').textContent = 'Nível ' + num + ' — ' + NIVEL_NOMES[idx];
        document.getElementById('player-pts').textContent   = pts;
        document.getElementById('player-avatar').src        = avatarSrc;
        document.getElementById('player-card').style.display = '';
      }

      const cardSnap = await getDoc(doc(db, 'cards', cardId));
      if (!cardSnap.exists()) { erroLoad('Card não encontrado.'); return; }
      cardData = cardSnap.data();
      document.getElementById('q-card-nome').textContent = cardData.nome || cardId;
      document.title = 'Simulador BOX — ' + (cardData.nome || cardId);

      if (!cardData.box_desafios || cardData.box_desafios.length === 0) {
        erroLoad('Este card não tem o Simulador BOX cadastrado.'); return;
      }

      tentativasPermitidas = cardData.box_tentativas || 3;
      resultadoDocId = user.uid + '_box_' + cardId;

      const resultSnap = await getDoc(doc(db, 'resultados_box', resultadoDocId));
      if (resultSnap.exists()) tentativasUsadas = resultSnap.data().tentativas_usadas || 0;
      if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(resultSnap.data()); return; }

      desafios = [...cardData.box_desafios];
      iniciarJogo();
    } catch(e) { erroLoad('Erro: ' + e.message); }
  });
}

function erroLoad(msg) {
  document.getElementById('loading').innerHTML = '<p style="color:#e74c3c;font-weight:700;padding:20px;">' + msg + '</p>';
}

function iniciarJogo() {
  document.getElementById('loading').style.display     = 'none';
  document.getElementById('q-prog-wrap').style.display = '';
  document.getElementById('sim-box').style.display     = '';
  document.getElementById('q-placar').style.display    = '';
  somEntrada();
  renderDesafio();
}

// ============================================================
// RENDER DO DESAFIO
// ============================================================
function renderDesafio() {
  if (atual >= desafios.length) { mostrarFinal(); return; }

  selecionado     = null;
  conexoesUsuario = [];
  testado         = false;
  tempLinha       = null;

  const d   = desafios[atual];
  const pts = parseFloat(d.pontos) || 2.0;
  const pct = Math.round((atual / desafios.length) * 100);

  document.getElementById('prog-txt').textContent      = 'Desafio ' + (atual+1) + ' de ' + desafios.length;
  document.getElementById('prog-pct').textContent      = pct + '%';
  document.getElementById('prog-fill').style.width     = pct + '%';
  document.getElementById('sim-num').textContent       = 'Desafio ' + (atual+1);
  document.getElementById('sim-descricao').textContent = d.descricao || 'Monte o circuito!';
  document.getElementById('sim-pts-badge').textContent = '+' + (pts%1===0?pts:pts.toFixed(1)) + ' pt' + (pts!==1?'s':'');
  document.getElementById('sim-instrucao').textContent = 'Clique em um pino e depois em outro para conectar';

  renderPinos(d);
  renderLegenda(d);
  limparSVG();

  document.getElementById('btn-testar').style.display   = '';
  document.getElementById('btn-prox').style.display     = 'none';
  document.getElementById('sim-feedback').style.display = 'none';
}

// ============================================================
// RENDER DOS PINOS (apenas os usados no desafio)
// ============================================================
function renderPinos(d) {
  const wrap = document.getElementById('pinos-wrap');
  wrap.innerHTML = '';

  // Coleta todos os pinos envolvidos (nas conexões corretas)
  const pinosUsados = new Set();
  (d.conexoes_corretas || []).forEach(conn => {
    const sep = conn.indexOf('-');
    pinosUsados.add(conn.slice(0, sep));
    pinosUsados.add(conn.slice(sep + 1));
  });

  pinosUsados.forEach(pinoId => {
    const info = PINOS_BOX[pinoId];
    if (!info) return;

    const el = document.createElement('div');
    el.className   = 'pino';
    el.id          = 'pino-' + pinoId;
    el.dataset.id  = pinoId;
    el.style.left  = info.x + '%';
    el.style.top   = info.y + '%';
    el.style.setProperty('--pino-cor', info.cor);

    el.innerHTML = `
      <div class="pino-circulo"></div>
      <span class="pino-label">${info.label}</span>
    `;

    wrap.appendChild(el);
  });
}

// ============================================================
// LEGENDA DOS GRUPOS ENVOLVIDOS
// ============================================================
function renderLegenda(d) {
  const legEl = document.getElementById('sim-legenda');
  const grupos = new Set();
  (d.conexoes_corretas || []).forEach(conn => {
    const sep = conn.indexOf('-');
    const a = PINOS_BOX[conn.slice(0, sep)];
    const b = PINOS_BOX[conn.slice(sep + 1)];
    if (a) grupos.add(a.grupo + '|' + a.cor);
    if (b) grupos.add(b.grupo + '|' + b.cor);
  });

  legEl.innerHTML = [...grupos].map(g => {
    const [nome, cor] = g.split('|');
    return `<div class="legenda-item"><div class="legenda-dot" style="background:${cor}"></div>${nome}</div>`;
  }).join('');
}

// ============================================================
// INTERAÇÃO — CLIQUE NOS PINOS
// ============================================================
function onPinoClick(pinoId) {
  if (testado) return;

  if (selecionado === null) {
    selecionado = pinoId;
    document.getElementById('pino-' + pinoId)?.classList.add('selecionado');
    document.getElementById('box-area').classList.add('tem-selecionado');
    criarLinhaTemp(pinoId);
    document.getElementById('sim-instrucao').textContent = 'Agora clique no pino de destino';
  } else if (selecionado === pinoId) {
    desselecionarAtual();
  } else {
    const pair = makePair(selecionado, pinoId);
    const idx  = conexoesUsuario.indexOf(pair);
    if (idx >= 0) {
      conexoesUsuario.splice(idx, 1);
    } else {
      conexoesUsuario.push(pair);
      somConecta();
    }
    desselecionarAtual();
    renderLinhas();
    document.getElementById('sim-instrucao').textContent = 'Clique em um pino e depois em outro para conectar';
  }
}

function desselecionarAtual() {
  if (selecionado) document.getElementById('pino-' + selecionado)?.classList.remove('selecionado');
  selecionado = null;
  document.getElementById('box-area').classList.remove('tem-selecionado');
  removerLinhaTemp();
}

function makePair(a, b) { return [a, b].sort().join('-'); }

// ============================================================
// RUBBER-BAND LINE
// ============================================================
function criarLinhaTemp(pinoId) {
  removerLinhaTemp();
  const svg = document.getElementById('box-svg');
  const c   = getPinCenter(pinoId);
  if (!c) return;
  tempLinha = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  tempLinha.setAttribute('x1', c.x); tempLinha.setAttribute('y1', c.y);
  tempLinha.setAttribute('x2', c.x); tempLinha.setAttribute('y2', c.y);
  tempLinha.classList.add('box-linha', 'linha-temp');
  svg.appendChild(tempLinha);
}

function removerLinhaTemp() {
  if (tempLinha) { tempLinha.remove(); tempLinha = null; }
}

// ============================================================
// RENDER DAS LINHAS
// ============================================================
function renderLinhas(estado = 'pendente') {
  const svg = document.getElementById('box-svg');
  svg.querySelectorAll('.box-linha:not(.linha-temp)').forEach(l => l.remove());

  document.querySelectorAll('.pino').forEach(p => {
    p.classList.remove('tem-conexao', 'conexao-correta', 'conexao-errada');
  });

  const corretasSet = new Set((desafios[atual]?.conexoes_corretas) || []);

  conexoesUsuario.forEach(pair => {
    const sep  = pair.indexOf('-');
    const a    = pair.slice(0, sep);
    const b    = pair.slice(sep + 1);
    const ca   = getPinCenter(a);
    const cb   = getPinCenter(b);
    if (!ca || !cb) return;

    const eCerto    = corretasSet.has(pair);
    const lineClass = estado === 'verificado' ? (eCerto ? 'linha-correta' : 'linha-incorreta') : 'linha-pendente';
    const pinoClass = estado === 'verificado' ? (eCerto ? 'conexao-correta' : 'conexao-errada') : 'tem-conexao';

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', ca.x); line.setAttribute('y1', ca.y);
    line.setAttribute('x2', cb.x); line.setAttribute('y2', cb.y);
    line.classList.add('box-linha', lineClass);
    svg.appendChild(line);

    document.getElementById('pino-' + a)?.classList.add(pinoClass);
    document.getElementById('pino-' + b)?.classList.add(pinoClass);
  });
}

function limparSVG() {
  const svg = document.getElementById('box-svg');
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  tempLinha = null;
}

// Pega o centro do pino em coordenadas do SVG
function getPinCenter(pinoId) {
  const area  = document.getElementById('box-area');
  const pinEl = document.getElementById('pino-' + pinoId);
  if (!area || !pinEl) return null;
  const circ     = pinEl.querySelector('.pino-circulo') || pinEl;
  const areaRect = area.getBoundingClientRect();
  const pinRect  = circ.getBoundingClientRect();
  return {
    x: pinRect.left + pinRect.width  / 2 - areaRect.left,
    y: pinRect.top  + pinRect.height / 2 - areaRect.top
  };
}

// ============================================================
// CONTROLES
// ============================================================
window.desfazerConexao = function() {
  if (testado || conexoesUsuario.length === 0) return;
  conexoesUsuario.pop();
  renderLinhas();
};

window.limparConexoes = function() {
  if (testado) return;
  conexoesUsuario = [];
  renderLinhas();
};

// ============================================================
// TESTAR CIRCUITO
// ============================================================
window.testarCircuito = function() {
  if (testado) return;
  if (conexoesUsuario.length === 0) {
    const fb = document.getElementById('sim-feedback');
    fb.className = 'sim-feedback erro';
    fb.textContent = '⚠️ Faça pelo menos uma conexão antes de testar!';
    fb.style.display = 'block';
    return;
  }

  testado = true;
  desselecionarAtual();

  if (!tentativaRegistrada && atual === 0) {
    tentativaRegistrada = true;
    registrarTentativa();
  }

  const d        = desafios[atual];
  const corretas = new Set(d.conexoes_corretas || []);
  const usuario  = new Set(conexoesUsuario);
  const faltando = [...corretas].filter(c => !usuario.has(c));
  const extras   = [...usuario].filter(c => !corretas.has(c));
  const acertou  = faltando.length === 0 && extras.length === 0;
  const pts      = parseFloat(d.pontos) || 2.0;

  renderLinhas('verificado');

  const fb = document.getElementById('sim-feedback');
  if (acertou) {
    acertos++;
    pontosGanhos += pts;
    somAcerto();
    fb.className   = 'sim-feedback acerto';
    fb.textContent = '✅ ' + (d.feedback_acerto || 'Circuito correto! Todas as conexões estão certas!');
  } else {
    erros++;
    somErro();
    let hint = d.feedback_erro || '';
    if (!hint) {
      if (faltando.length > 0) hint += faltando.length + ' conexão(ões) faltando. ';
      if (extras.length > 0)   hint += extras.length + ' conexão(ões) incorreta(s).';
    }
    fb.className   = 'sim-feedback erro';
    fb.textContent = '❌ ' + hint.trim();
  }
  fb.style.display = 'block';

  document.getElementById('pl-ac').textContent = acertos;
  document.getElementById('pl-er').textContent = erros;
  document.getElementById('pl-pt').textContent = pontosGanhos%1===0?pontosGanhos:pontosGanhos.toFixed(1);
  document.getElementById('btn-testar').style.display = 'none';

  if (atual >= desafios.length - 1) {
    setTimeout(mostrarFinal, 1800);
  } else {
    document.getElementById('btn-prox').style.display = 'block';
  }
};

window.proxDesafio = function() { atual++; renderDesafio(); };

// ============================================================
// TELA FINAL
// ============================================================
function mostrarFinal() {
  const total     = desafios.length;
  const pct       = Math.round((acertos / total) * 100);
  const concluido = pct >= 70;

  document.getElementById('res-ac').textContent = acertos;
  document.getElementById('res-er').textContent = erros;
  document.getElementById('res-pt').textContent = pontosGanhos%1===0?pontosGanhos:pontosGanhos.toFixed(1);
  document.getElementById('tf-avatar').src      = avatarSrc;
  document.getElementById('tf-badge-concluido').style.display = concluido ? '' : 'none';

  let emoji, titulo, msg;
  if (pct === 100)    { emoji='⚡'; titulo='Circuito Perfeito!';  msg='Incrível! Você montou tudo corretamente. Engenheiro Maker!'; }
  else if (pct >= 70) { emoji='🔋'; titulo='Muito bem!';          msg='Você acertou '+acertos+' de '+total+'. Continue explorando!'; }
  else if (pct >= 40) { emoji='🔌'; titulo='Bom esforço!';        msg='Você acertou '+acertos+' de '+total+'. Revise e tente de novo!'; }
  else                { emoji='💡'; titulo='Não desista!';         msg='Eletrônica tem prática. Tente novamente!'; }

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

// ============================================================
// FIREBASE
// ============================================================
async function registrarTentativa() {
  if (!resultadoDocId || !alunoUid) return;
  try {
    const ref  = doc(db, 'resultados_box', resultadoDocId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        aluno_id: alunoUid, card_id: cardId, escola_id: escolaId,
        tentativas_permitidas: tentativasPermitidas, tentativas_usadas: 1,
        concluido: false, melhor_pontos: 0, melhor_acertos: 0,
        total_desafios: desafios.length,
        primeira_vez: serverTimestamp(), ultima_vez: serverTimestamp(), historico: []
      });
    } else {
      await updateDoc(ref, { tentativas_usadas: (snap.data().tentativas_usadas||0)+1, ultima_vez: serverTimestamp() });
    }
    tentativasUsadas++;
  } catch(e) { console.warn('Tentativa box:', e); }
}

async function salvarResultado(ac, pontos, total, concluido) {
  if (!resultadoDocId) return;
  const ref = doc(db, 'resultados_box', resultadoDocId);
  await updateDoc(ref, {
    concluido, melhor_pontos: pontos, melhor_acertos: ac,
    historico: arrayUnion({ data: new Date().toISOString(), pontos, acertos: ac, pct: Math.round((ac/total)*100) }),
    ultima_vez: serverTimestamp()
  });
  const cols = ['resultados_quiz','resultados_bug','resultados_comp','resultados_ordena','resultados_complete','resultados_conecta','resultados_box'];
  const snaps = await Promise.all(cols.map(c => getDocs(query(collection(db,c), where('aluno_id','==',alunoUid)))));
  let totalPts = 0;
  snaps.forEach(s => s.forEach(d => { totalPts += parseFloat(d.data().melhor_pontos)||0; }));
  await updateDoc(doc(db,'usuarios',alunoUid), { pontos_total: Math.round(totalPts*10)/10 });
  document.getElementById('player-pts').textContent = Math.round(totalPts*10)/10;
}

function mostrarBloqueado(dados) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('sim-box').innerHTML = `
    <div style="padding:40px 28px;text-align:center;">
      <div style="font-size:52px;margin-bottom:16px;">🔒</div>
      <div style="font-family:'Nunito',sans-serif;font-size:22px;font-weight:900;color:#2F3447;margin-bottom:8px;">Jogo encerrado</div>
      <div style="font-size:14px;color:#5F6480;margin-bottom:24px;">Você já usou todas as <strong>${tentativasPermitidas}</strong> tentativas.</div>
      ${dados?`<div style="background:#fff8ec;border:1.5px solid #e67e22;border-radius:16px;padding:16px;margin-bottom:24px;display:inline-block;">
        <div style="font-family:'Nunito',sans-serif;font-size:24px;font-weight:900;color:#7d3500;">${dados.melhor_acertos}/${dados.total_desafios} desafios</div>
        <div style="color:#e67e22;font-weight:700;">${dados.melhor_pontos} pontos</div>
        ${dados.concluido?'<div style="margin-top:8px;font-size:13px;color:#15803d;font-weight:700;">✅ Concluído!</div>':''}
      </div>`:''}
      <br><button class="btn-voltar" onclick="voltarCard()" style="max-width:280px;margin:0 auto;">← Voltar ao Card</button>
    </div>`;
  document.getElementById('sim-box').style.display = '';
}

window.reiniciar = function() {
  if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(null); return; }
  atual=0; acertos=0; erros=0; pontosGanhos=0;
  tentativaRegistrada=false; selecionado=null; testado=false;
  document.getElementById('tela-final').style.display = 'none';
  document.getElementById('pl-ac').textContent = '0';
  document.getElementById('pl-er').textContent = '0';
  document.getElementById('pl-pt').textContent = '0';
  renderDesafio();
};

window.voltarCard = function() {
  if (window.opener) window.close();
  else if (window.history.length > 1) history.back();
  else window.location.href = '../cards/card.html?id=' + cardId;
};

// ============================================================
// EVENTOS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const area = document.getElementById('box-area');
  if (!area) return;

  // Rubber-band desktop
  area.addEventListener('mousemove', e => {
    if (!selecionado || !tempLinha) return;
    const rect = area.getBoundingClientRect();
    tempLinha.setAttribute('x2', e.clientX - rect.left);
    tempLinha.setAttribute('y2', e.clientY - rect.top);
  });

  // Rubber-band touch
  area.addEventListener('touchmove', e => {
    if (!selecionado || !tempLinha) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect  = area.getBoundingClientRect();
    tempLinha.setAttribute('x2', touch.clientX - rect.left);
    tempLinha.setAttribute('y2', touch.clientY - rect.top);
  }, { passive: false });

  // Clique delegado nos pinos
  area.addEventListener('click', e => {
    const pinoEl = e.target.closest('.pino');
    if (pinoEl && !testado) {
      e.stopPropagation();
      onPinoClick(pinoEl.dataset.id);
      return;
    }
    if (e.target === area || e.target.tagName === 'svg') desselecionarAtual();
  });
});

window.addEventListener('resize', () => {
  if (desafios[atual]) renderLinhas(testado ? 'verificado' : 'pendente');
});

init();
