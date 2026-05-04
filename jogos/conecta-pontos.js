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

// ============================================================
// SONS SINTÉTICOS — Web Audio API
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
function somEntrada()  { try { const c = getAudioCtx(); [262,330,392,523].forEach((f,i) => nota(c,f,'triangle',i*0.10,0.18,0.22)); nota(c,523,'sine',0.44,0.5,0.15); } catch(e) {} }
function somConecta()  { try { const c = getAudioCtx(); nota(c,440,'sine',0,0.08,0.18); nota(c,523,'sine',0.07,0.10,0.15); } catch(e) {} }
function somAcerto()   { try { const c = getAudioCtx(); nota(c,587,'sine',0,0.12,0.30); nota(c,784,'sine',0.13,0.22,0.25); } catch(e) {} }
function somErro()     { try { const c = getAudioCtx(); nota(c,330,'triangle',0,0.14,0.22); nota(c,220,'triangle',0.14,0.28,0.18); } catch(e) {} }
function somFinalBom() { try { const c = getAudioCtx(); [262,330,392,523,659].forEach((f,i) => nota(c,f,'triangle',i*0.07,0.14,0.20)); [523,659,784].forEach(f => nota(c,f,'sine',0.42,0.8,0.13)); } catch(e) {} }
function somFinalRuim(){ try { const c = getAudioCtx(); nota(c,392,'triangle',0,0.22,0.20); nota(c,330,'triangle',0.20,0.22,0.18); nota(c,262,'triangle',0.40,0.40,0.16); } catch(e) {} }
document.addEventListener('click', () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); });
// ============================================================

const TIPOS_COMP = {
  arduino:       { nome: 'Arduino',              img: 'arduino.png',              cor: '#00979D' },
  resistor:      { nome: 'Resistor',             img: 'resistor.png',             cor: '#CC6600' },
  led:           { nome: 'LED',                  img: 'led.png',                  cor: '#FFD700' },
  led_rgb:       { nome: 'LED RGB',              img: 'led rgb.png',              cor: '#FF69B4' },
  botao:         { nome: 'Botão',                img: 'botao.png',                cor: '#4A90D9' },
  potenciometro: { nome: 'Potenciômetro',        img: 'potenciometro.png',        cor: '#8B4513' },
  ldr:           { nome: 'LDR',                  img: 'ldr.png',                  cor: '#FFA500' },
  protoboard:    { nome: 'Protoboard',           img: 'protoboard.png',           cor: '#D2691E' },
  jumpers:       { nome: 'Jumpers',              img: 'jumpers.png',              cor: '#6c757d' },
  sensor_som:    { nome: 'Sensor de Som',        img: 'sensor de som.png',        cor: '#9370DB' },
  sensor_ult:    { nome: 'Sensor Ultrassônico',  img: 'sensor ultrassonico.png',  cor: '#20B2AA' },
  termistor:     { nome: 'Termistor',            img: 'termistor.png',            cor: '#DC143C' },
  matriz_led:    { nome: 'Matriz LED 8x8',       img: 'matriz de led 8x8.png',    cor: '#32CD32' },
  buzzer:        { nome: 'Buzzer',               img: 'buzzer.png',               cor: '#E91E63' },
  gnd:           { nome: 'GND',                  img: null,                       cor: '#495057' },
  vcc:           { nome: '5V / VCC',             img: null,                       cor: '#CC0000' },
};

const NIVEL_NOMES  = ['Explorador Iniciante','Curioso Digital','Aprendiz Maker','Construtor Criativo','Inventor em Ação','Programador Maker','Engenheiro Criativo','Inovador Maker','Mentor Maker','Mestre Maker'];
const NIVEL_PONTOS = [0,100,250,500,900,1400,2000,2700,3500,4500];
function getNivelIdx(pts) { for (let i = NIVEL_PONTOS.length-1; i>=0; i--) { if (pts >= NIVEL_PONTOS[i]) return i; } return 0; }

const params  = new URLSearchParams(window.location.search);
const cardId  = params.get('card');

// Estado do jogo
let desafios = [], atual = 0, acertos = 0, erros = 0, pontosGanhos = 0;
let cardData = null, alunoUid = null, escolaId = null, avatarSrc = '../assets/robo 1_transparente.png';
let tentativasPermitidas = 3, tentativasUsadas = 0, resultadoDocId = null, tentativaRegistrada = false, inicioJogo = 0;

function getSemanaLetiva() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), 2, 1);
  return Math.max(1, Math.ceil((hoje - inicio) / (7 * 24 * 3600 * 1000)));
}

// Estado do circuito
let posicoes        = {};   // { compId: { x: %, y: % } }
let selecionadoPino = null; // ID do pino selecionado
let conexoesUsuario = [];   // ["pinoA-pinoB", ...]
let testado         = false;
let tempLinha       = null;

// ============================================================
// INICIALIZAÇÃO
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
        const escolaSnap = await getDoc(doc(db, 'escolas', escolaId || '_'));
        const escolaNome = escolaSnap.exists() ? (escolaSnap.data().nome || '') : '';
        const el = document.getElementById('player-escola');
        if (el && escolaNome) el.textContent = escolaNome;
        document.getElementById('player-jogo').textContent = 'Conecta os Pontos';
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
      document.title = 'Conecta os Pontos — ' + (cardData.nome || cardId);

      if (!cardData.conecta_desafios || cardData.conecta_desafios.length === 0) {
        erroLoad('Este card não tem o jogo Conecta os Pontos cadastrado.'); return;
      }

      tentativasPermitidas = cardData.conecta_tentativas || 3;
      resultadoDocId = user.uid + '_conecta_' + cardId;

      const resultSnap = await getDoc(doc(db, 'resultados_conecta', resultadoDocId));
      if (resultSnap.exists()) tentativasUsadas = resultSnap.data().tentativas_usadas || 0;
      if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(resultSnap.data()); return; }

      desafios = [...cardData.conecta_desafios];
      iniciarJogo();

    } catch(e) { erroLoad('Erro: ' + e.message); }
  });
}

function erroLoad(msg) {
  document.getElementById('loading').innerHTML = '<p style="color:#e74c3c;font-weight:700;padding:20px;">' + msg + '</p>';
}

function iniciarJogo() {
  document.getElementById('loading').style.display      = 'none';
  document.getElementById('q-prog-wrap').style.display  = '';
  document.getElementById('conect-box').style.display   = '';
  document.getElementById('q-placar').style.display     = '';
  somEntrada();
  renderDesafio();
}

// ============================================================
// RENDER DO DESAFIO
// ============================================================
function renderDesafio() {
  if (atual >= desafios.length) { mostrarFinal(); return; }

  // Reset estado do circuito
  selecionadoPino = null;
  conexoesUsuario = [];
  testado         = false;
  tempLinha       = null;

  const d   = desafios[atual];
  const pts = parseFloat(d.pontos) || 2.0;
  const pct = Math.round((atual / desafios.length) * 100);

  document.getElementById('prog-txt').textContent      = 'Desafio ' + (atual+1) + ' de ' + desafios.length;
  document.getElementById('prog-pct').textContent      = pct + '%';
  document.getElementById('prog-fill').style.width     = pct + '%';
  document.getElementById('comp-num').textContent      = 'Desafio ' + (atual+1);
  document.getElementById('comp-descricao').textContent = d.descricao || 'Monte o circuito!';
  document.getElementById('comp-pts-badge').textContent = '+' + (pts%1===0?pts:pts.toFixed(1)) + ' pt' + (pts!==1?'s':'');
  document.getElementById('conect-instrucao').textContent = 'Clique em um pino e depois em outro para conectar';

  posicoes = gerarPosicoes(d.componentes || []);
  renderComponentes(d.componentes || []);
  limparSVG();

  document.getElementById('btn-testar').style.display   = '';
  document.getElementById('btn-prox').style.display     = 'none';
  document.getElementById('conect-feedback').style.display = 'none';
}

// ============================================================
// POSIÇÕES DOS COMPONENTES (layout circular + jitter)
// ============================================================
function gerarPosicoes(componentes) {
  const n   = componentes.length;
  const pos = {};
  if (n === 0) return pos;

  const raio = n <= 2 ? 22 : n <= 4 ? 28 : n <= 6 ? 33 : 37;

  componentes.forEach((c, i) => {
    const ang = (2 * Math.PI * i / n) - Math.PI / 2;
    pos[c.id] = {
      x: Math.max(14, Math.min(86, 50 + raio * Math.cos(ang) + (Math.random() - 0.5) * 10)),
      y: Math.max(14, Math.min(86, 50 + raio * Math.sin(ang) + (Math.random() - 0.5) * 10))
    };
  });
  return pos;
}

// ============================================================
// RENDER DOS COMPONENTES — card com imagem + pinos clicáveis
// ============================================================
function renderComponentes(componentes) {
  const wrap = document.getElementById('componentes-wrap');
  wrap.innerHTML = '';

  componentes.forEach(c => {
    const info  = TIPOS_COMP[c.tipo] || { nome: c.tipo, img: null, cor: '#888' };
    const pos   = posicoes[c.id];
    if (!pos) return;
    const pinos = c.pinos || [];

    const card = document.createElement('div');
    card.className  = 'comp-card';
    card.id         = 'card-' + c.id;
    card.style.left = pos.x + '%';
    card.style.top  = pos.y + '%';
    card.style.setProperty('--comp-cor', info.cor);

    const imgHTML = info.img
      ? `<img class="comp-card-img" src="../assets/eletronicos/${info.img}" alt="${c.label}" onerror="this.style.opacity='0.3'">`
      : `<span class="comp-card-sym">${c.tipo === 'gnd' ? '⏚' : c.tipo === 'vcc' ? '5V' : c.label.slice(0,4)}</span>`;

    const pinosHTML = pinos.map(p => `
      <div class="pino-dot" id="pino-${p.id}" data-pino="${p.id}">
        <div class="pino-circulo"></div>
        <span class="pino-label">${p.label}</span>
      </div>
    `).join('');

    card.innerHTML = `
      <div class="comp-card-visual">
        <div class="comp-card-circle">${imgHTML}</div>
        <div class="comp-card-nome">${c.label}</div>
      </div>
      ${pinos.length > 0 ? `<div class="comp-pinos">${pinosHTML}</div>` : '<div class="comp-sem-pinos">sem pinos</div>'}
    `;

    wrap.appendChild(card);
  });
}

// ============================================================
// INTERAÇÃO — CLIQUE NOS PINOS
// ============================================================
function onPinoClick(pinoId) {
  if (testado) return;

  if (selecionadoPino === null) {
    selecionadoPino = pinoId;
    document.getElementById('pino-' + pinoId)?.classList.add('selecionado');
    document.getElementById('circuito-area').classList.add('tem-selecionado');
    criarLinhaTemp(pinoId);
    document.getElementById('conect-instrucao').textContent = 'Agora clique no pino de destino para conectar';
  } else if (selecionadoPino === pinoId) {
    desselecionarAtual();
  } else {
    const pair = makePair(selecionadoPino, pinoId);
    const idx  = conexoesUsuario.indexOf(pair);
    if (idx >= 0) {
      conexoesUsuario.splice(idx, 1);
    } else {
      conexoesUsuario.push(pair);
      somConecta();
    }
    desselecionarAtual();
    renderLinhas();
    document.getElementById('conect-instrucao').textContent = 'Clique em um pino e depois em outro para conectar';
  }
}

function desselecionarAtual() {
  if (selecionadoPino) {
    document.getElementById('pino-' + selecionadoPino)?.classList.remove('selecionado');
  }
  selecionadoPino = null;
  document.getElementById('circuito-area').classList.remove('tem-selecionado');
  removerLinhaTemp();
}

function makePair(a, b) {
  return [a, b].sort().join('-');
}

// ============================================================
// RUBBER-BAND LINE (segue o mouse)
// ============================================================
function criarLinhaTemp(pinoId) {
  removerLinhaTemp();
  const svg = document.getElementById('circuito-svg');
  const c   = getPinCenterSVG(pinoId);
  if (!c) return;
  tempLinha = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  tempLinha.setAttribute('x1', c.x);
  tempLinha.setAttribute('y1', c.y);
  tempLinha.setAttribute('x2', c.x);
  tempLinha.setAttribute('y2', c.y);
  tempLinha.classList.add('circuito-linha', 'linha-temp');
  svg.appendChild(tempLinha);
}

function removerLinhaTemp() {
  if (tempLinha) { tempLinha.remove(); tempLinha = null; }
}

// ============================================================
// RENDER DAS LINHAS NO SVG
// ============================================================
function renderLinhas(estado = 'pendente') {
  const svg = document.getElementById('circuito-svg');
  svg.querySelectorAll('.circuito-linha:not(.linha-temp)').forEach(l => l.remove());

  // Limpa estados visuais dos pinos
  document.querySelectorAll('.pino-dot').forEach(p => {
    p.classList.remove('tem-conexao', 'conexao-correta', 'conexao-errada');
  });

  const corretasSet = new Set((desafios[atual]?.conexoes_corretas) || []);

  conexoesUsuario.forEach(pair => {
    const sep = pair.indexOf('-');
    const a   = pair.slice(0, sep);
    const b   = pair.slice(sep + 1);
    const ca  = getPinCenterSVG(a);
    const cb  = getPinCenterSVG(b);
    if (!ca || !cb) return;

    const eCerto   = corretasSet.has(pair);
    const lineClass = estado === 'verificado' ? (eCerto ? 'linha-correta' : 'linha-incorreta') : 'linha-pendente';
    const pinoClass = estado === 'verificado' ? (eCerto ? 'conexao-correta' : 'conexao-errada') : 'tem-conexao';

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', ca.x); line.setAttribute('y1', ca.y);
    line.setAttribute('x2', cb.x); line.setAttribute('y2', cb.y);
    line.classList.add('circuito-linha', lineClass);
    svg.appendChild(line);

    document.getElementById('pino-' + a)?.classList.add(pinoClass);
    document.getElementById('pino-' + b)?.classList.add(pinoClass);
  });
}

function limparSVG() {
  const svg = document.getElementById('circuito-svg');
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  tempLinha = null;
}

// Pega o centro do círculo do pino em coordenadas SVG (relativas à circuito-area)
function getPinCenterSVG(pinoId) {
  const area   = document.getElementById('circuito-area');
  const pinEl  = document.getElementById('pino-' + pinoId);
  if (!area || !pinEl) return null;
  const circulo   = pinEl.querySelector('.pino-circulo') || pinEl;
  const areaRect  = area.getBoundingClientRect();
  const pinRect   = circulo.getBoundingClientRect();
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
    const fb = document.getElementById('conect-feedback');
    fb.className = 'conect-feedback erro';
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

  const fb = document.getElementById('conect-feedback');
  if (acertou) {
    acertos++;
    pontosGanhos += pts;
    somAcerto();
    animarLEDs();
    fb.className   = 'conect-feedback acerto';
    fb.textContent = '✅ ' + (d.feedback_acerto || 'Circuito correto! Todas as conexões estão certas!');
  } else {
    erros++;
    somErro();
    let hint = d.feedback_erro || '';
    if (!hint) {
      if (faltando.length > 0) hint += faltando.length + ' conexão(ões) faltando. ';
      if (extras.length > 0)   hint += extras.length + ' conexão(ões) incorreta(s).';
    }
    fb.className   = 'conect-feedback erro';
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

function somBuzzer() {
  try {
    const c = getAudioCtx();
    // beep curto repetido: 4 pulsos de 80ms com pausa
    [0, 0.18, 0.36, 0.54].forEach(t => nota(c, 880, 'square', t, 0.10, 0.18));
  } catch(e) {}
}

function animarLEDs() {
  const d = desafios[atual];
  let temBuzzer = false;
  (d.componentes || []).forEach(c => {
    if (c.tipo === 'led' || c.tipo === 'led_rgb') {
      document.getElementById('card-' + c.id)?.classList.add('led-animado');
    }
    if (c.tipo === 'buzzer') {
      document.getElementById('card-' + c.id)?.classList.add('buzzer-animado');
      temBuzzer = true;
    }
  });
  if (temBuzzer) somBuzzer();
}

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
  if (pct === 100)    { emoji='⚡'; titulo='Circuito Perfeito!';  msg='Incrível! Você conectou tudo corretamente. Engenheiro Maker!'; }
  else if (pct >= 70) { emoji='🔋'; titulo='Muito bem!';          msg='Você acertou '+acertos+' de '+total+'. Continue explorando!'; }
  else if (pct >= 40) { emoji='🔌'; titulo='Bom esforço!';        msg='Você acertou '+acertos+' de '+total+'. Revise o circuito e tente de novo!'; }
  else                { emoji='💡'; titulo='Não desista!';         msg='Eletrônica tem prática. Estude as conexões e tente novamente!'; }

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
// FIREBASE — TENTATIVAS E RESULTADOS
// ============================================================
async function registrarTentativa() {
  if (!resultadoDocId || !alunoUid) return;
  inicioJogo = Date.now();
  try {
    const ref  = doc(db, 'resultados_conecta', resultadoDocId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        aluno_id: alunoUid, card_id: cardId, escola_id: escolaId,
        tentativas_permitidas: tentativasPermitidas, tentativas_usadas: 1,
        concluido: false, melhor_pontos: 0, melhor_acertos: 0,
        total_desafios: desafios.length,
        primeira_vez: serverTimestamp(), ultima_vez: serverTimestamp(), historico: [],
        duracao_total_segundos: 0, historico_pontos: [],
        semana_letiva: getSemanaLetiva(), dispositivo: window.innerWidth < 768 ? 'mobile' : 'desktop'
      });
    } else {
      await updateDoc(ref, { tentativas_usadas: (snap.data().tentativas_usadas||0)+1, ultima_vez: serverTimestamp() });
    }
    tentativasUsadas++;
  } catch(e) { console.warn('Tentativa conecta:', e); }
}

async function salvarResultado(ac, pontos, total, concluido) {
  if (!resultadoDocId) return;
  const duracao = Math.round((Date.now() - inicioJogo) / 1000);
  const ref = doc(db, 'resultados_conecta', resultadoDocId);
  await updateDoc(ref, {
    concluido, melhor_pontos: pontos, melhor_acertos: ac,
    historico: arrayUnion({ data: new Date().toISOString(), pontos, acertos: ac, pct: Math.round((ac/total)*100) }),
    historico_pontos: arrayUnion(pontos),
    duracao_total_segundos: increment(duracao),
    ultima_vez: serverTimestamp()
  });
  const cols = ['resultados_quiz','resultados_bug','resultados_comp','resultados_ordena','resultados_complete','resultados_conecta','resultados_box','resultados_binario'];
  const snaps = await Promise.all(cols.map(c => getDocs(query(collection(db,c), where('aluno_id','==',alunoUid)))));
  let totalPts = 0;
  snaps.forEach(s => s.forEach(d => { totalPts += parseFloat(d.data().melhor_pontos)||0; }));
  await updateDoc(doc(db,'usuarios',alunoUid), { pontos_total: Math.round(totalPts*10)/10 });
  document.getElementById('player-pts').textContent = Math.round(totalPts*10)/10;
}

function mostrarBloqueado(dados) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('conect-box').innerHTML = `
    <div style="padding:40px 28px;text-align:center;">
      <div style="font-size:52px;margin-bottom:16px;">🔒</div>
      <div style="font-family:'Nunito',sans-serif;font-size:22px;font-weight:900;color:#2F3447;margin-bottom:8px;">Jogo encerrado</div>
      <div style="font-size:14px;color:#5F6480;margin-bottom:24px;">Você já usou todas as <strong>${tentativasPermitidas}</strong> tentativas.</div>
      ${dados?`<div style="background:#e8f4fd;border:1.5px solid #0984e3;border-radius:16px;padding:16px;margin-bottom:24px;display:inline-block;">
        <div style="font-family:'Nunito',sans-serif;font-size:24px;font-weight:900;color:#0652b3;">${dados.melhor_acertos}/${dados.total_desafios} circuitos</div>
        <div style="color:#0984e3;font-weight:700;">${dados.melhor_pontos} pontos</div>
        ${dados.concluido?'<div style="margin-top:8px;font-size:13px;color:#15803d;font-weight:700;">✅ Desafio concluído!</div>':''}
      </div>`:''}
      <br><button class="btn-voltar" onclick="voltarCard()" style="max-width:280px;margin:0 auto;">← Voltar ao Card</button>
    </div>`;
  document.getElementById('conect-box').style.display = '';
}

window.reiniciar = function() {
  if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(null); return; }
  atual=0; acertos=0; erros=0; pontosGanhos=0;
  tentativaRegistrada=false; selecionadoPino=null; testado=false;
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
// EVENTOS DO CIRCUITO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const area = document.getElementById('circuito-area');
  if (!area) return;

  // Rubber-band (desktop)
  area.addEventListener('mousemove', e => {
    if (!selecionadoPino || !tempLinha) return;
    const rect = area.getBoundingClientRect();
    tempLinha.setAttribute('x2', e.clientX - rect.left);
    tempLinha.setAttribute('y2', e.clientY - rect.top);
  });

  // Touch rubber-band
  area.addEventListener('touchmove', e => {
    if (!selecionadoPino || !tempLinha) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect  = area.getBoundingClientRect();
    tempLinha.setAttribute('x2', touch.clientX - rect.left);
    tempLinha.setAttribute('y2', touch.clientY - rect.top);
  }, { passive: false });

  // Clique delegado — pinos dentro da área
  area.addEventListener('click', e => {
    const pinoEl = e.target.closest('.pino-dot');
    if (pinoEl && !testado) {
      e.stopPropagation();
      onPinoClick(pinoEl.dataset.pino);
      return;
    }
    // Clique no fundo cancela seleção
    if (e.target === area || e.target.tagName === 'svg' || e.target.tagName === 'line') {
      desselecionarAtual();
    }
  });
});

// Redesenha ao redimensionar (posições getBoundingClientRect mudam)
window.addEventListener('resize', () => {
  if (desafios[atual]) renderLinhas(testado ? 'verificado' : 'pendente');
});

init();
