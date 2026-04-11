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

const NIVEL_NOMES  = ['Explorador Iniciante','Curioso Digital','Aprendiz Maker','Construtor Criativo','Inventor em Ação','Programador Maker','Engenheiro Criativo','Inovador Maker','Mentor Maker','Mestre Maker'];
const NIVEL_PONTOS = [0,100,250,500,900,1400,2000,2700,3500,4500];
function getNivelIdx(pts) { for (let i=NIVEL_PONTOS.length-1;i>=0;i--) { if(pts>=NIVEL_PONTOS[i]) return i; } return 0; }

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
function somEntrada() { try { const ctx = getAudioCtx(); [262,330,392,523].forEach((f,i) => nota(ctx,f,'triangle',i*0.10,0.18,0.22)); nota(ctx,523,'sine',0.44,0.5,0.15); } catch(e) {} }
function somAcerto()  { try { const ctx = getAudioCtx(); nota(ctx,587,'sine',0,0.12,0.30); nota(ctx,784,'sine',0.13,0.22,0.25); } catch(e) {} }
function somErro()    { try { const ctx = getAudioCtx(); nota(ctx,330,'triangle',0,0.14,0.22); nota(ctx,220,'triangle',0.14,0.28,0.18); } catch(e) {} }
function somFinalBom(){ try { const ctx = getAudioCtx(); [262,330,392,523,659].forEach((f,i) => nota(ctx,f,'triangle',i*0.07,0.14,0.20)); [523,659,784].forEach(f => nota(ctx,f,'sine',0.42,0.8,0.13)); } catch(e) {} }
function somFinalRuim(){ try { const ctx = getAudioCtx(); nota(ctx,392,'triangle',0,0.22,0.20); nota(ctx,330,'triangle',0.20,0.22,0.18); nota(ctx,262,'triangle',0.40,0.40,0.16); } catch(e) {} }
document.addEventListener('click', () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); });
// ============================================================

const params = new URLSearchParams(window.location.search);
const cardId = params.get('card');

let desafios = [], atual = 0, acertos = 0, erros = 0, pontosGanhos = 0;
let cardData = null, alunoUid = null, escolaId = null, avatarSrc = '../assets/robo 1_transparente.png';
let tentativasPermitidas = 3, tentativasUsadas = 0, resultadoDocId = null, tentativaRegistrada = false;

// Estado do desafio atual
let lacunaAtiva = null;      // índice da lacuna selecionada
let respostas   = {};        // { indice: valorEscolhido }
let respondido  = false;

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
        document.getElementById('player-jogo').textContent = 'Complete o Codigo';
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
      document.title = 'Complete o Código — ' + (cardData.nome || cardId);

      if (!cardData.complete_desafios || cardData.complete_desafios.length === 0) {
        erroLoad('Este card não tem o jogo Complete o Código cadastrado.'); return;
      }

      tentativasPermitidas = cardData.complete_tentativas || 3;
      resultadoDocId = user.uid + '_complete_' + cardId;

      const resultSnap = await getDoc(doc(db, 'resultados_complete', resultadoDocId));
      if (resultSnap.exists()) tentativasUsadas = resultSnap.data().tentativas_usadas || 0;
      if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(resultSnap.data()); return; }

      desafios = [...cardData.complete_desafios];
      iniciarJogo();

    } catch(e) { erroLoad('Erro: ' + e.message); }
  });
}

function erroLoad(msg) {
  document.getElementById('loading').innerHTML = '<p style="color:#e74c3c;font-weight:700;">' + msg + '</p>';
}

function iniciarJogo() {
  document.getElementById('loading').style.display      = 'none';
  document.getElementById('q-prog-wrap').style.display  = '';
  document.getElementById('comp-box').style.display     = '';
  document.getElementById('q-placar').style.display     = '';
  somEntrada();
  renderDesafio();
}

function renderDesafio() {
  if (atual >= desafios.length) { mostrarFinal(); return; }
  lacunaAtiva = null;
  respostas   = {};
  respondido  = false;

  const d   = desafios[atual];
  const pts = parseFloat(d.pontos) || 1.0;
  const pct = Math.round((atual / desafios.length) * 100);

  document.getElementById('prog-txt').textContent      = 'Desafio ' + (atual+1) + ' de ' + desafios.length;
  document.getElementById('prog-pct').textContent      = pct + '%';
  document.getElementById('prog-fill').style.width     = pct + '%';
  document.getElementById('comp-num').textContent      = 'Desafio ' + (atual+1);
  document.getElementById('comp-descricao').textContent = d.descricao || 'Complete o código!';
  document.getElementById('comp-pts-badge').textContent = '+' + (pts%1===0?pts:pts.toFixed(1)) + ' pt' + (pts!==1?'s':'');

  renderCodigo(false);

  document.getElementById('comp-opcoes-wrap').style.display  = 'none';
  document.getElementById('comp-feedback').style.display     = 'none';
  document.getElementById('btn-verificar').style.display     = '';
  document.getElementById('btn-prox').style.display          = 'none';
}

// Parseia o código substituindo ___ por spans clicáveis
function renderCodigo(revelar) {
  const d      = desafios[atual];
  const codigo = d.codigo || '';
  const lacunas = d.lacunas || [];
  const block   = document.getElementById('comp-code-block');

  let lacunaIdx = 0;
  // Quebrar o código por ___
  const partes = codigo.split('___');
  let html = '';

  partes.forEach((parte, i) => {
    html += parte.replace(/</g, '&lt;');
    if (i < partes.length - 1) {
      const li   = lacunaIdx;
      const lac  = lacunas[li] || {};
      const resp = respostas[li];

      let cls  = 'lacuna';
      let txt  = resp || '___';
      let icon = '';

      if (revelar) {
        cls += resp === lac.correta ? ' correta' : ' incorreta';
        icon = resp === lac.correta ? ' ✅' : ' ❌';
        txt  = resp || '___';
      } else {
        if (resp)             cls += ' preenchida';
        if (lacunaAtiva===li) cls += ' ativa';
      }

      html += `<span class="${cls}" data-li="${li}" onclick="selecionarLacuna(${li})">${txt.replace(/</g,'&lt;')}${icon}</span>`;
      lacunaIdx++;
    }
  });

  block.innerHTML = html;
}

window.selecionarLacuna = function(li) {
  if (respondido) return;
  lacunaAtiva = li;
  renderCodigo(false);
  mostrarOpcoes(li);
};

function mostrarOpcoes(li) {
  const d    = desafios[atual];
  const lac  = (d.lacunas || [])[li];
  if (!lac) return;

  const wrap  = document.getElementById('comp-opcoes-wrap');
  const titulo = document.getElementById('comp-opcoes-titulo');
  const grid  = document.getElementById('comp-opcoes-grid');

  titulo.textContent = 'Lacuna ' + (li+1) + ':';
  wrap.style.display = '';

  // Embaralha opções
  const opcoes = [...(lac.opcoes || [])].sort(() => Math.random() - 0.5);

  grid.innerHTML = '';
  opcoes.forEach(op => {
    const btn = document.createElement('button');
    btn.className = 'comp-opcao-btn' + (respostas[li] === op ? ' selecionada' : '');
    btn.textContent = op;
    btn.onclick = () => escolherOpcao(li, op);
    grid.appendChild(btn);
  });
}

function escolherOpcao(li, valor) {
  respostas[li] = valor;
  renderCodigo(false);
  // Atualizar botões de opção
  document.querySelectorAll('.comp-opcao-btn').forEach(btn => {
    btn.classList.toggle('selecionada', btn.textContent === valor);
  });
}

window.verificar = function() {
  if (respondido) return;
  const d      = desafios[atual];
  const lacunas = d.lacunas || [];
  const total  = lacunas.length;

  // Checar se todas estão preenchidas
  const preenchidas = Object.keys(respostas).length;
  if (preenchidas < total) {
    const fb = document.getElementById('comp-feedback');
    fb.className = 'comp-feedback parcial';
    fb.textContent = '⚠️ Preencha todas as ' + total + ' lacuna' + (total!==1?'s':'') + ' antes de verificar! (' + preenchidas + '/' + total + ' preenchida' + (preenchidas!==1?'s':'') + ')';
    fb.style.display = 'block';
    return;
  }

  if (!tentativaRegistrada && atual === 0) {
    tentativaRegistrada = true;
    registrarTentativa();
  }

  respondido = true;
  lacunaAtiva = null;
  document.getElementById('comp-opcoes-wrap').style.display = 'none';

  const pts    = parseFloat(d.pontos) || 1.0;
  let corretas = 0;
  lacunas.forEach((lac, li) => {
    if (respostas[li] === lac.correta) corretas++;
  });

  const todoCerto = corretas === total;
  renderCodigo(true);

  const fb = document.getElementById('comp-feedback');
  if (todoCerto) {
    acertos++;
    pontosGanhos += pts;
    somAcerto();
    fb.className = 'comp-feedback acerto';
    fb.textContent = '✅ Perfeito! ' + (d.feedback || 'Todas as lacunas estão corretas!');
  } else {
    erros++;
    somErro();
    fb.className = 'comp-feedback erro';
    fb.textContent = '❌ ' + corretas + '/' + total + ' lacunas corretas. ' + (d.feedback || 'Veja os destaques no código!');
  }
  fb.style.display = 'block';

  document.getElementById('pl-ac').textContent = acertos;
  document.getElementById('pl-er').textContent = erros;
  document.getElementById('pl-pt').textContent = pontosGanhos%1===0?pontosGanhos:pontosGanhos.toFixed(1);

  document.getElementById('btn-verificar').style.display = 'none';

  if (atual >= desafios.length - 1) {
    setTimeout(mostrarFinal, 1500);
  } else {
    document.getElementById('btn-prox').style.display = 'block';
  }
};

window.proxDesafio = function() { atual++; renderDesafio(); };

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
  if (pct===100)    { emoji='🏆'; titulo='Código Completo!';  msg='Incrível! Você preencheu todas as lacunas corretamente!'; }
  else if(pct>=70)  { emoji='📝'; titulo='Muito bem!';        msg='Você acertou '+acertos+' de '+total+'. Continue praticando!'; }
  else if(pct>=40)  { emoji='💡'; titulo='Bom esforço!';      msg='Você acertou '+acertos+' de '+total+'. Revise o código e tente de novo!'; }
  else              { emoji='🔍'; titulo='Não desista!';       msg='A sintaxe leva tempo. Leia o código com calma e tente de novo!'; }

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
  try {
    const ref  = doc(db, 'resultados_complete', resultadoDocId);
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
  } catch(e) { console.warn('Tentativa complete:', e); }
}

async function salvarResultado(acertos, pontos, total, concluido) {
  if (!resultadoDocId) return;
  const ref = doc(db, 'resultados_complete', resultadoDocId);
  await updateDoc(ref, {
    concluido, melhor_pontos: pontos, melhor_acertos: acertos,
    historico: arrayUnion({ data: new Date().toISOString(), pontos, acertos, pct: Math.round((acertos/total)*100) }),
    ultima_vez: serverTimestamp()
  });
  const cols = ['resultados_quiz','resultados_bug','resultados_comp','resultados_ordena','resultados_complete','resultados_conecta','resultados_box'];
  const snaps = await Promise.all(cols.map(c => getDocs(query(collection(db,c), where('aluno_id','==',alunoUid)))));
  let total2 = 0;
  snaps.forEach(s => s.forEach(d => { total2 += parseFloat(d.data().melhor_pontos)||0; }));
  await updateDoc(doc(db,'usuarios',alunoUid), { pontos_total: Math.round(total2*10)/10 });
  document.getElementById('player-pts').textContent = Math.round(total2*10)/10;
}

function mostrarBloqueado(dados) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('comp-box').innerHTML = `
    <div style="padding:40px 28px;text-align:center;">
      <div style="font-size:52px;margin-bottom:16px;">🔒</div>
      <div style="font-family:'Nunito',sans-serif;font-size:22px;font-weight:900;color:#2F3447;margin-bottom:8px;">Jogo encerrado</div>
      <div style="font-size:14px;color:#5F6480;margin-bottom:24px;">Você já usou todas as <strong>${tentativasPermitidas}</strong> tentativas.</div>
      ${dados?`<div style="background:#e8f8f5;border:1.5px solid #16a085;border-radius:16px;padding:16px;margin-bottom:24px;display:inline-block;">
        <div style="font-family:'Nunito',sans-serif;font-size:24px;font-weight:900;color:#0e6655;">${dados.melhor_acertos}/${dados.total_desafios} corretos</div>
        <div style="color:#16a085;font-weight:700;">${dados.melhor_pontos} pontos</div>
        ${dados.concluido?'<div style="margin-top:8px;font-size:13px;color:#15803d;font-weight:700;">✅ Desafio concluído!</div>':''}
      </div>`:''}
      <br><button class="btn-voltar" onclick="voltarCard()" style="max-width:280px;margin:0 auto;">← Voltar ao Card</button>
    </div>`;
  document.getElementById('comp-box').style.display = '';
}

window.reiniciar = function() {
  if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(null); return; }
  atual=0; acertos=0; erros=0; pontosGanhos=0; tentativaRegistrada=false;
  lacunaAtiva=null; respostas={}; respondido=false;
  document.getElementById('tela-final').style.display='none';
  document.getElementById('pl-ac').textContent='0';
  document.getElementById('pl-er').textContent='0';
  document.getElementById('pl-pt').textContent='0';
  renderDesafio();
};

window.voltarCard = function() {
  if (window.opener) window.close();
  else if (window.history.length > 1) history.back();
  else window.location.href = '../cards/card.html?id=' + cardId;
};

init();
