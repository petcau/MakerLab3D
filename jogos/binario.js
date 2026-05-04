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

function getNivelIdx(pts) {
  for (let i = NIVEL_PONTOS.length - 1; i >= 0; i--) {
    if (pts >= NIVEL_PONTOS[i]) return i;
  }
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
function somEntrada()  { try { const ctx = getAudioCtx(); [262,330,392,523].forEach((f,i) => nota(ctx,f,'triangle',i*0.10,0.18,0.22)); nota(ctx,523,'sine',0.44,0.5,0.15); } catch(e) {} }
function somAcerto()   { try { const ctx = getAudioCtx(); nota(ctx,587,'sine',0,0.12,0.30); nota(ctx,784,'sine',0.13,0.22,0.25); } catch(e) {} }
function somErro()     { try { const ctx = getAudioCtx(); nota(ctx,330,'triangle',0,0.14,0.22); nota(ctx,220,'triangle',0.14,0.28,0.18); } catch(e) {} }
function somFinalBom() { try { const ctx = getAudioCtx(); [262,330,392,523,659].forEach((f,i) => nota(ctx,f,'triangle',i*0.07,0.14,0.20)); [523,659,784].forEach(f => nota(ctx,f,'sine',0.42,0.8,0.13)); } catch(e) {} }
function somFinalRuim(){ try { const ctx = getAudioCtx(); nota(ctx,392,'triangle',0,0.22,0.20); nota(ctx,330,'triangle',0.20,0.22,0.18); nota(ctx,262,'triangle',0.40,0.40,0.16); } catch(e) {} }
document.addEventListener('click', () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); });
// ============================================================

const params = new URLSearchParams(window.location.search);
const cardId = params.get('card');

let desafios = [], atual = 0, acertos = 0, erros = 0, pontosGanhos = 0, respondida = false, cardData = null, avatarSrc = '../assets/robo 1_transparente.png';
let tentativaRegistrada = false, resultadoDocId = null, tentativasUsadas = 0, tentativasPermitidas = 3, alunoUid = null, escolaId = null, inicioJogo = 0;

function getSemanaLetiva() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), 2, 1);
  const diff = hoje - inicio;
  return Math.max(1, Math.ceil(diff / (7 * 24 * 3600 * 1000)));
}

// Converte string binária de 5 bits para decimal
function binarioParaDecimal(bin) {
  const bits = bin.padStart(5, '0').slice(0, 5);
  return parseInt(bits, 2);
}

// Gera 3 distrações plausíveis (diferentes do correto, entre 0 e 31)
function gerarDistratores(correto) {
  const usados = new Set([correto]);
  const distratores = [];

  // Candidatos próximos primeiro
  const candidatos = [];
  for (let d = 1; d <= 8; d++) {
    if (correto - d >= 0)  candidatos.push(correto - d);
    if (correto + d <= 31) candidatos.push(correto + d);
  }
  // Completa com aleatórios se precisar
  while (candidatos.length < 20) {
    const r = Math.floor(Math.random() * 32);
    if (!usados.has(r) && !candidatos.includes(r)) candidatos.push(r);
  }

  for (const c of candidatos) {
    if (!usados.has(c) && distratores.length < 3) {
      distratores.push(c);
      usados.add(c);
    }
    if (distratores.length === 3) break;
  }
  return distratores;
}

async function init() {
  if (!cardId) { erroLoad('Card não especificado.'); return; }

  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = '../login.html'; return; }

    try {
      // Dados do aluno
      const userSnap = await getDoc(doc(db, 'usuarios', user.uid));
      if (userSnap.exists()) {
        const u   = userSnap.data();
        const pts = u.pontos_total || 0;
        const idx = getNivelIdx(pts);
        const num = idx + 1;
        avatarSrc = '../assets/robo ' + num + '_transparente.png';

        document.getElementById('player-nome').textContent  = u.nome || user.displayName || user.email.split('@')[0];
        document.getElementById('player-nivel').textContent = 'Nível ' + num + ' — ' + NIVEL_NOMES[idx];
        document.getElementById('player-pts').textContent   = pts;
        document.getElementById('player-avatar').src        = avatarSrc;
        document.getElementById('player-card').style.display = '';
        alunoUid = user.uid;
        escolaId = u.escola_id || '';
        const escolaSnap = await getDoc(doc(db, 'escolas', escolaId || '_'));
        const escolaNome = escolaSnap.exists() ? (escolaSnap.data().nome || '') : '';
        const el = document.getElementById('player-escola');
        if (el && escolaNome) el.textContent = escolaNome;
        document.getElementById('player-jogo').textContent = 'Binário';
      }

      // Dados do card
      const cardSnap = await getDoc(doc(db, 'cards', cardId));
      if (!cardSnap.exists()) { erroLoad('Card não encontrado.'); return; }
      cardData = cardSnap.data();

      document.getElementById('q-card-nome').textContent = cardData.nome || cardId;
      document.title = 'Código Binário — ' + (cardData.nome || cardId);

      if (!cardData.binario_desafios || cardData.binario_desafios.length === 0) {
        erroLoad('Este card não tem desafios binários cadastrados.');
        return;
      }

      tentativasPermitidas = cardData.binario_tentativas || 3;
      resultadoDocId = user.uid + '_binario_' + cardId;

      // Verificar tentativas usadas
      const resultSnap = await getDoc(doc(db, 'resultados_binario', resultadoDocId));
      if (resultSnap.exists()) {
        tentativasUsadas = resultSnap.data().tentativas_usadas || 0;
      }

      if (tentativasUsadas >= tentativasPermitidas) {
        mostrarBloqueado(resultSnap.data());
        return;
      }

      desafios = [...cardData.binario_desafios];
      iniciarJogo();

    } catch(e) { erroLoad('Erro: ' + e.message); }
  });
}

function erroLoad(msg) {
  document.getElementById('loading').innerHTML = '<p style="color:#e74c3c;font-weight:700;">' + msg + '</p>';
}

function iniciarJogo() {
  document.getElementById('loading').style.display    = 'none';
  document.getElementById('q-prog-wrap').style.display = '';
  document.getElementById('q-box').style.display       = '';
  document.getElementById('q-placar').style.display    = '';
  somEntrada();
  renderDesafio();
}

function renderDesafio() {
  if (atual >= desafios.length) { mostrarFinal(); return; }
  respondida = false;
  const d   = desafios[atual];
  const pct = Math.round((atual / desafios.length) * 100);

  document.getElementById('prog-txt').textContent  = 'Desafio ' + (atual + 1) + ' de ' + desafios.length;
  document.getElementById('prog-pct').textContent  = pct + '%';
  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('q-num').textContent     = 'Desafio ' + (atual + 1);

  const pts = parseFloat(d.pontos) || 1.0;
  document.getElementById('q-pts-badge').textContent = '+' + (pts % 1 === 0 ? pts : pts.toFixed(1)) + ' pt' + (pts !== 1 ? 's' : '');

  // Renderiza os bits
  const bin = (d.binario || '00000').padStart(5, '0').slice(0, 5);
  for (let i = 0; i < 5; i++) {
    const el = document.getElementById('bit-' + (4 - i));
    const b  = bin[i];
    el.textContent = b;
    el.className   = 'bin-bit ' + (b === '1' ? 'bit-um' : 'bit-zero');
  }

  // Gera alternativas
  const correto = binarioParaDecimal(bin);
  const distratores = gerarDistratores(correto);
  const alternativas = [correto, ...distratores].sort(() => Math.random() - 0.5);
  const idxCorreto = alternativas.indexOf(correto);

  const altsEl = document.getElementById('q-alts');
  altsEl.innerHTML = '';
  const letras = ['A','B','C','D'];
  alternativas.forEach((val, i) => {
    const btn = document.createElement('button');
    btn.className = 'q-alt';
    btn.innerHTML = '<span class="q-alt-letra">' + letras[i] + '</span>' + val;
    btn.onclick = () => responder(i, idxCorreto, pts);
    altsEl.appendChild(btn);
  });

  document.getElementById('q-feedback').style.display = 'none';
  document.getElementById('btn-prox').style.display   = 'none';
}

window.responder = function(idx, idxCorreto, pts) {
  if (respondida) return;
  respondida = true;

  // Registrar tentativa ao responder ao 1º desafio
  if (!tentativaRegistrada && atual === 0) {
    tentativaRegistrada = true;
    registrarTentativa();
  }

  const alts    = document.querySelectorAll('.q-alt');
  const acertou = idx === idxCorreto;

  alts.forEach(b => b.disabled = true);
  alts[idx].classList.add(acertou ? 'correta' : 'errada');
  if (!acertou && alts[idxCorreto]) alts[idxCorreto].classList.add('revelada');

  if (acertou) { acertos++; pontosGanhos += pts; somAcerto(); } else { erros++; somErro(); }

  document.getElementById('pl-ac').textContent = acertos;
  document.getElementById('pl-er').textContent = erros;
  document.getElementById('pl-pt').textContent = pontosGanhos % 1 === 0 ? pontosGanhos : pontosGanhos.toFixed(1);

  const fb = document.getElementById('q-feedback');
  fb.className   = 'q-feedback ' + (acertou ? 'acerto' : 'erro');
  fb.textContent = acertou ? '✅ Correto! Você converteu o binário para decimal.' : '❌ Incorreto. Observe cada bit e seu valor posicional.';
  fb.style.display = 'block';

  const btnP = document.getElementById('btn-prox');
  btnP.style.display = 'block';
  btnP.textContent   = atual < desafios.length - 1 ? 'Próxima →' : 'Ver Resultado 🎖️';
};

window.proxima = function() { atual++; renderDesafio(); };

function mostrarFinal() {
  document.getElementById('q-prog-wrap').style.display = 'none';
  document.getElementById('q-box').style.display       = 'none';
  document.getElementById('q-placar').style.display    = 'none';

  const total = desafios.length;
  const pct   = Math.round((acertos / total) * 100);

  document.getElementById('res-ac').textContent = acertos;
  document.getElementById('res-er').textContent = erros;
  document.getElementById('res-pt').textContent = pontosGanhos % 1 === 0 ? pontosGanhos : pontosGanhos.toFixed(1);
  document.getElementById('tf-avatar').src      = avatarSrc;

  let emoji, titulo, msg;
  if (pct === 100) {
    emoji = '👑'; titulo = 'Perfeito!';
    msg = 'Você converteu todos os ' + total + ' números binários! Mestre Maker!';
  } else if (pct >= 70) {
    emoji = '🎖️'; titulo = 'Muito bem!';
    msg = 'Você acertou ' + acertos + ' de ' + total + ' desafios. Continue assim!';
  } else if (pct >= 40) {
    emoji = '💡'; titulo = 'Bom esforço!';
    msg = 'Você acertou ' + acertos + ' de ' + total + ' desafios. Revise e tente de novo!';
  } else {
    emoji = '🔄'; titulo = 'Não desista!';
    msg = 'Você acertou ' + acertos + ' de ' + total + '. Relembre os valores: 16, 8, 4, 2, 1.';
  }

  document.getElementById('tf-emoji').textContent  = emoji;
  document.getElementById('tf-titulo').textContent = titulo;
  document.getElementById('tf-sub').textContent    = pct + '% de aproveitamento';
  document.getElementById('res-msg').textContent   = msg;

  const badgeConcluido = document.getElementById('tf-badge-concluido');
  if (badgeConcluido) badgeConcluido.style.display = pct >= 70 ? '' : 'none';

  const restantes = tentativasPermitidas - tentativasUsadas;
  const tentEl = document.getElementById('tf-tentativas-restantes');
  if (tentEl) {
    tentEl.textContent = restantes > 0
      ? restantes + ' tentativa' + (restantes !== 1 ? 's' : '') + ' restante' + (restantes !== 1 ? 's' : '')
      : 'Nenhuma tentativa restante';
    tentEl.style.color = restantes > 0 ? '#5F6480' : '#e74c3c';
  }

  const btnTentar = document.querySelector('.btn-tentar');
  if (btnTentar) btnTentar.style.display = restantes > 0 ? '' : 'none';

  pct >= 70 ? somFinalBom() : somFinalRuim();
  document.getElementById('tela-final').style.display = 'flex';

  salvarResultado(acertos, pontosGanhos, total).catch(e => console.warn('Erro ao salvar:', e));
}

window.voltarCard = function() {
  const cardUrl = '../cards/card.html?id=' + cardId;
  if (window.opener) {
    window.close();
  } else if (window.history.length > 1) {
    history.back();
  } else {
    window.location.href = cardUrl;
  }
};

window.reiniciar = function() {
  if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(null); return; }
  tentativaRegistrada = false;
  atual = 0; acertos = 0; erros = 0; pontosGanhos = 0; respondida = false;
  desafios = [...cardData.binario_desafios];
  document.getElementById('tela-final').style.display  = 'none';
  document.getElementById('q-prog-wrap').style.display = '';
  document.getElementById('q-box').style.display       = '';
  document.getElementById('q-placar').style.display    = '';
  document.getElementById('pl-ac').textContent = '0';
  document.getElementById('pl-er').textContent = '0';
  document.getElementById('pl-pt').textContent = '0';
  renderDesafio();
};

// ── Registra uso da tentativa ao responder ao 1º desafio ──
async function registrarTentativa() {
  if (!resultadoDocId || !alunoUid) return;
  inicioJogo = Date.now();
  try {
    const ref  = doc(db, 'resultados_binario', resultadoDocId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        aluno_id:              alunoUid,
        card_id:               cardId,
        escola_id:             escolaId,
        tentativas_permitidas: tentativasPermitidas,
        tentativas_usadas:     1,
        concluido:             false,
        melhor_pontos:         0,
        melhor_acertos:        0,
        total_desafios:        desafios.length,
        primeira_vez:          serverTimestamp(),
        ultima_vez:            serverTimestamp(),
        historico:             [],
        duracao_total_segundos: 0,
        historico_pontos:      [],
        semana_letiva:         getSemanaLetiva(),
        dispositivo:           window.innerWidth < 768 ? 'mobile' : 'desktop'
      });
    } else {
      await updateDoc(ref, {
        tentativas_usadas: (snap.data().tentativas_usadas || 0) + 1,
        ultima_vez:        serverTimestamp()
      });
    }
    tentativasUsadas++;
    atualizarContadorTentativas();
  } catch(e) { console.warn('Erro ao registrar tentativa:', e); }
}

// ── Salva resultado ao terminar ──
async function salvarResultado(acertos, pontos, total) {
  if (!resultadoDocId || !alunoUid) return;
  try {
    const pct      = Math.round((acertos / total) * 100);
    const concluiu = pct >= 70;
    const ref      = doc(db, 'resultados_binario', resultadoDocId);
    const snap     = await getDoc(ref);
    const anterior = snap.exists() ? snap.data() : {};

    const jaConcluidoAntes = anterior.concluido || false;
    const duracao = Math.round((Date.now() - inicioJogo) / 1000);

    await updateDoc(ref, {
      concluido:      concluiu || jaConcluidoAntes,
      melhor_pontos:  pontos,
      melhor_acertos: acertos,
      historico:      arrayUnion({
        data:    new Date().toISOString(),
        pontos:  pontos,
        acertos: acertos,
        pct:     pct
      }),
      historico_pontos:       arrayUnion(pontos),
      duracao_total_segundos: increment(duracao),
      ultima_vez:             serverTimestamp()
    });

    await recalcularPontosAluno();

  } catch(e) { console.warn('Erro ao salvar resultado:', e); }
}

// ── Recalcula pontos totais somando melhor_pontos de todos os resultados do aluno ──
async function recalcularPontosAluno() {
  try {
    const cols = ['resultados_quiz','resultados_bug','resultados_comp','resultados_ordena','resultados_complete','resultados_conecta','resultados_box','resultados_binario'];
    const snaps = await Promise.all(cols.map(c => getDocs(query(collection(db,c), where('aluno_id','==',alunoUid)))));
    let total = 0;
    snaps.forEach(s => s.forEach(d => { total += parseFloat(d.data().melhor_pontos)||0; }));

    await updateDoc(doc(db, 'usuarios', alunoUid), {
      pontos_total: Math.round(total * 10) / 10
    });

    document.getElementById('player-pts').textContent = Math.round(total * 10) / 10;
  } catch(e) { console.warn('Erro ao recalcular pontos:', e); }
}

// ── Tela de bloqueio ──
function mostrarBloqueado(dados) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('q-box').innerHTML = `
    <div style="padding:40px 28px; text-align:center;">
      <div style="font-size:52px; margin-bottom:16px;">🔒</div>
      <div style="font-family:'Nunito',sans-serif; font-size:22px; font-weight:900; color:#2F3447; margin-bottom:8px;">Jogo encerrado</div>
      <div style="font-size:14px; color:#5F6480; margin-bottom:24px;">
        Você já usou todas as <strong>${tentativasPermitidas}</strong> tentativas permitidas.
      </div>
      ${dados ? `
      <div style="background:#f9f0ff; border:1.5px solid #c39bd3; border-radius:16px; padding:16px; margin-bottom:24px; display:inline-block;">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#6c3483; margin-bottom:8px;">Seu melhor resultado</div>
        <div style="font-family:'Nunito',sans-serif; font-size:28px; font-weight:900; color:#2F3447;">${dados.melhor_acertos}/${dados.total_desafios} desafios</div>
        <div style="font-size:14px; color:#6c3483; font-weight:700;">${dados.melhor_pontos % 1 === 0 ? dados.melhor_pontos : dados.melhor_pontos.toFixed(1)} pontos</div>
        ${dados.concluido ? '<div style="margin-top:8px; font-size:13px; color:#15803d; font-weight:700;">✅ Desafio concluído!</div>' : ''}
      </div>` : ''}
      <br>
      <button class="btn-voltar" onclick="voltarCard()" style="max-width:280px; margin:0 auto;">← Voltar ao Card</button>
    </div>
  `;
  document.getElementById('q-box').style.display = '';
}

// ── Atualiza contador de tentativas no player card ──
function atualizarContadorTentativas() {
  const restantes = tentativasPermitidas - tentativasUsadas;
  const el = document.getElementById('player-nivel');
  if (el) el.textContent = el.textContent.split(' |')[0] + ' | ' + restantes + ' tentativa' + (restantes !== 1 ? 's' : '') + ' restante' + (restantes !== 1 ? 's' : '');
}

init();
