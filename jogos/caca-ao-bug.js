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

function getNivelIdx(pts) {
  for (let i = NIVEL_PONTOS.length - 1; i >= 0; i--) { if (pts >= NIVEL_PONTOS[i]) return i; }
  return 0;
}

const params  = new URLSearchParams(window.location.search);
const cardId  = params.get('card');

let codigos = [], atual = 0, acertos = 0, erros = 0, pontosGanhos = 0;
let cardData = null, alunoUid = null, escolaId = null, avatarSrc = '../assets/robo 1_transparente.png';
let tentativasPermitidas = 3, tentativasUsadas = 0, resultadoDocId = null;
let tentativaRegistrada = false;
let linhasSelecionadas = []; // linhas que o aluno clicou
let codigoRespondido = false;
let tentativasNesteCodigo = 0;
const MAX_TENT_CODIGO = 2; // máximo de verificações por código

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
      document.title = 'Caça ao Bug — ' + (cardData.nome || cardId);

      if (!cardData.bug_codigos || cardData.bug_codigos.length === 0) {
        erroLoad('Este card não tem Caça ao Bug cadastrado.'); return;
      }

      tentativasPermitidas = cardData.bug_tentativas || 3;
      resultadoDocId = user.uid + '_bug_' + cardId;

      const resultSnap = await getDoc(doc(db, 'resultados_bug', resultadoDocId));
      if (resultSnap.exists()) tentativasUsadas = resultSnap.data().tentativas_usadas || 0;

      if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(resultSnap.data()); return; }

      codigos = [...cardData.bug_codigos];
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
  document.getElementById('bug-box').style.display     = '';
  document.getElementById('q-placar').style.display    = '';
  renderCodigo();
}

function renderCodigo() {
  if (atual >= codigos.length) { mostrarFinal(); return; }
  codigoRespondido = false;
  tentativasNesteCodigo = 0;
  linhasSelecionadas = [];

  const b   = codigos[atual];
  const pts = parseFloat(b.pontos) || 1.0;
  const pct = Math.round((atual / codigos.length) * 100);

  document.getElementById('prog-txt').textContent    = 'Código ' + (atual + 1) + ' de ' + codigos.length;
  document.getElementById('prog-pct').textContent    = pct + '%';
  document.getElementById('prog-fill').style.width   = pct + '%';
  document.getElementById('bug-num').textContent     = 'Código ' + (atual + 1);
  document.getElementById('bug-pts-badge').textContent = '+' + (pts % 1 === 0 ? pts : pts.toFixed(1)) + ' pt' + (pts !== 1 ? 's' : '');

  // Tentativas dots
  renderTentativasDots();

  // Código
  renderCodigoLinhas(b, false);

  document.getElementById('bug-feedback').style.display = 'none';
  document.getElementById('btn-verificar').style.display = '';
  document.getElementById('btn-prox').style.display     = 'none';
}

function renderTentativasDots() {
  const bar = document.getElementById('bug-tentativas-bar');
  bar.innerHTML = '';
  for (let i = 0; i < MAX_TENT_CODIGO; i++) {
    const dot = document.createElement('div');
    dot.className = 'bug-tent-dot' + (i < tentativasNesteCodigo ? ' usada' : '');
    bar.appendChild(dot);
  }
}

function renderCodigoLinhas(b, revelar) {
  const wrap   = document.getElementById('bug-code-wrap');
  const linhas = (b.codigo || '').split('\n');
  const erradas = b.linhas_erradas || [];

  let html = '<div class="bug-code-block">';
  linhas.forEach((linha, li) => {
    let cls = 'bug-linha';
    let icon = '';

    if (revelar) {
      cls += ' desabilitada';
      if (erradas.includes(li)) {
        const acertou = linhasSelecionadas.includes(li);
        cls += acertou ? ' correta' : ' revelada';
        icon = acertou ? '✅' : '🐛';
      } else if (linhasSelecionadas.includes(li)) {
        cls += ' incorreta';
        icon = '❌';
      }
    } else {
      if (linhasSelecionadas.includes(li)) cls += ' selecionada';
    }

    html += `<div class="${cls}" onclick="toggleLinha(${li})">
      <span class="bug-linha-num">${li + 1}</span>
      <span class="bug-linha-code">${linha.replace(/</g,'&lt;')}</span>
      ${icon ? `<span class="bug-linha-icon">${icon}</span>` : ''}
    </div>`;
  });
  html += '</div>';
  wrap.innerHTML = html;
}

window.toggleLinha = function(li) {
  if (codigoRespondido) return;
  const idx = linhasSelecionadas.indexOf(li);
  if (idx >= 0) linhasSelecionadas.splice(idx, 1);
  else linhasSelecionadas.push(li);
  const b = codigos[atual];
  renderCodigoLinhas(b, false);
};

window.verificar = function() {
  if (codigoRespondido) return;
  if (linhasSelecionadas.length === 0) {
    const fb = document.getElementById('bug-feedback');
    fb.className = 'bug-feedback erro';
    fb.textContent = '⚠️ Selecione ao menos uma linha antes de verificar!';
    fb.style.display = 'block';
    return;
  }

  // Registrar tentativa ao verificar pela 1ª vez
  if (!tentativaRegistrada && atual === 0 && tentativasNesteCodigo === 0) {
    tentativaRegistrada = true;
    registrarTentativa();
  }

  tentativasNesteCodigo++;
  renderTentativasDots();

  const b       = codigos[atual];
  const erradas = b.linhas_erradas || [];
  const pts     = parseFloat(b.pontos) || 1.0;

  // Verificar acerto total
  const acertouTodas = erradas.length > 0 &&
    erradas.every(l => linhasSelecionadas.includes(l)) &&
    linhasSelecionadas.every(l => erradas.includes(l));

  const fb = document.getElementById('bug-feedback');

  if (acertouTodas) {
    codigoRespondido = true;
    acertos++;
    pontosGanhos += pts;
    document.getElementById('pl-ac').textContent = acertos;
    document.getElementById('pl-pt').textContent = pontosGanhos % 1 === 0 ? pontosGanhos : pontosGanhos.toFixed(1);

    renderCodigoLinhas(b, true);
    fb.className = 'bug-feedback acerto';
    fb.textContent = '✅ Perfeito! ' + (b.feedback || 'Você encontrou todos os bugs!');
    fb.style.display = 'block';
    document.getElementById('btn-verificar').style.display = 'none';
    if (atual >= codigos.length - 1) {
      // Último código — vai automaticamente pro resultado após 1.5s
      setTimeout(mostrarFinal, 1500);
    } else {
      document.getElementById('btn-prox').style.display = '';
      document.getElementById('btn-prox').textContent = 'Próximo →';
    }

  } else if (tentativasNesteCodigo >= MAX_TENT_CODIGO) {
    // Esgotou tentativas neste código
    codigoRespondido = true;
    erros++;
    document.getElementById('pl-er').textContent = erros;

    renderCodigoLinhas(b, true);
    fb.className = 'bug-feedback erro';
    fb.textContent = '❌ ' + (b.feedback || 'Os bugs estão nas linhas marcadas em verde.');
    fb.style.display = 'block';
    document.getElementById('btn-verificar').style.display = 'none';
    if (atual >= codigos.length - 1) {
      setTimeout(mostrarFinal, 1500);
    } else {
      document.getElementById('btn-prox').style.display = '';
      document.getElementById('btn-prox').textContent = 'Próximo →';
    }

  } else {
    // Parcial — ainda tem tentativas
    const faltam = erradas.filter(l => !linhasSelecionadas.includes(l)).length;
    const extras = linhasSelecionadas.filter(l => !erradas.includes(l)).length;
    let msg = '🔍 Quase! ';
    if (extras > 0) msg += 'Você marcou ' + extras + ' linha(s) que não têm erro. ';
    if (faltam > 0) msg += 'Ainda faltam ' + faltam + ' bug(s) para encontrar. ';
    msg += 'Tente novamente! (' + (MAX_TENT_CODIGO - tentativasNesteCodigo) + ' tentativa(s) restante(s))';
    fb.className = 'bug-feedback parcial';
    fb.textContent = msg;
    fb.style.display = 'block';
  }
};

window.proxCodigo = function() { atual++; renderCodigo(); };

function mostrarFinal() {

  const total = codigos.length;
  const pct   = Math.round((acertos / total) * 100);

  document.getElementById('res-ac').textContent = acertos;
  document.getElementById('res-er').textContent = erros;
  document.getElementById('res-pt').textContent = pontosGanhos % 1 === 0 ? pontosGanhos : pontosGanhos.toFixed(1);
  document.getElementById('tf-avatar').src      = avatarSrc;

  let emoji, titulo, msg;
  if (pct === 100)      { emoji = '🏆'; titulo = 'Bug Hunter Supremo!'; msg = 'Você encontrou todos os bugs! Parabéns, excelente leitura de código!'; }
  else if (pct >= 70)   { emoji = '🐛'; titulo = 'Bom trabalho!'; msg = 'Você achou ' + acertos + ' de ' + total + ' bugs. Continue praticando!'; }
  else if (pct >= 40)   { emoji = '🔍'; titulo = 'Precisa de prática!'; msg = 'Você achou ' + acertos + ' de ' + total + ' bugs. Revise o código e tente novamente!'; }
  else                  { emoji = '💡'; titulo = 'Não desista!'; msg = 'Os bugs são difíceis de encontrar. Leia o código com calma e tente de novo!'; }

  const concluido = pct >= 70;
  document.getElementById('tf-emoji').textContent              = emoji;
  document.getElementById('tf-titulo').textContent             = titulo;
  document.getElementById('tf-sub').textContent                = pct + '% de aproveitamento';
  document.getElementById('res-msg').textContent               = msg;
  document.getElementById('tf-badge-concluido').style.display  = concluido ? '' : 'none';

  const restantes = tentativasPermitidas - tentativasUsadas;
  const tentEl = document.getElementById('tf-tent-rest');
  if (tentEl) {
    tentEl.textContent = restantes > 0 ? restantes + ' tentativa(s) restante(s)' : 'Nenhuma tentativa restante';
    tentEl.style.color = restantes > 0 ? '#62708c' : '#e74c3c';
  }
  const btnTentar = document.querySelector('.btn-tentar');
  if (btnTentar) btnTentar.style.display = restantes > 0 ? '' : 'none';

  document.getElementById('tela-final').style.display = 'flex';
  salvarResultado(acertos, pontosGanhos, total, concluido).catch(e => console.warn(e));
}

async function registrarTentativa() {
  if (!resultadoDocId || !alunoUid) return;
  try {
    const ref  = doc(db, 'resultados_bug', resultadoDocId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        aluno_id: alunoUid, card_id: cardId, escola_id: escolaId,
        tentativas_permitidas: tentativasPermitidas, tentativas_usadas: 1,
        concluido: false, melhor_pontos: 0, melhor_acertos: 0,
        total_codigos: codigos.length,
        primeira_vez: serverTimestamp(), ultima_vez: serverTimestamp(), historico: []
      });
    } else {
      await updateDoc(ref, { tentativas_usadas: (snap.data().tentativas_usadas || 0) + 1, ultima_vez: serverTimestamp() });
    }
    tentativasUsadas++;
  } catch(e) { console.warn('Erro registrar tentativa bug:', e); }
}

async function salvarResultado(acertos, pontos, total, concluido) {
  if (!resultadoDocId) return;
  const ref = doc(db, 'resultados_bug', resultadoDocId);
  await updateDoc(ref, {
    concluido: concluido,
    melhor_pontos: pontos,
    melhor_acertos: acertos,
    historico: arrayUnion({ data: new Date().toISOString(), pontos, acertos, pct: Math.round((acertos/total)*100) }),
    ultima_vez: serverTimestamp()
  });
  // Recalcular pontos totais do aluno
  const qQuiz = query(collection(db, 'resultados_quiz'), where('aluno_id', '==', alunoUid));
  const qBug  = query(collection(db, 'resultados_bug'),  where('aluno_id', '==', alunoUid));
  const [sqSnap, sbSnap] = await Promise.all([getDocs(qQuiz), getDocs(qBug)]);
  let total2 = 0;
  sqSnap.forEach(d => { total2 += parseFloat(d.data().melhor_pontos) || 0; });
  sbSnap.forEach(d => { total2 += parseFloat(d.data().melhor_pontos) || 0; });
  await updateDoc(doc(db, 'usuarios', alunoUid), { pontos_total: Math.round(total2 * 10) / 10 });
  document.getElementById('player-pts').textContent = Math.round(total2 * 10) / 10;
}

function mostrarBloqueado(dados) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('bug-box').innerHTML = `
    <div style="padding:40px 28px;text-align:center;">
      <div style="font-size:52px;margin-bottom:16px;">🔒</div>
      <div style="font-family:'Nunito',sans-serif;font-size:22px;font-weight:900;color:#2F3447;margin-bottom:8px;">Caça ao Bug encerrada</div>
      <div style="font-size:14px;color:#5F6480;margin-bottom:24px;">Você já usou todas as <strong>${tentativasPermitidas}</strong> tentativas.</div>
      ${dados ? `<div style="background:#fffbea;border:1.5px solid #C9A830;border-radius:16px;padding:16px;margin-bottom:24px;display:inline-block;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#b8910e;margin-bottom:8px;">Seu resultado</div>
        <div style="font-family:'Nunito',sans-serif;font-size:28px;font-weight:900;color:#2F3447;">${dados.melhor_acertos}/${dados.total_codigos} bugs encontrados</div>
        <div style="font-size:14px;color:#C9A830;font-weight:700;">${dados.melhor_pontos} pontos</div>
        ${dados.concluido ? '<div style="margin-top:8px;font-size:13px;color:#15803d;font-weight:700;">✅ Desafio concluído!</div>' : ''}
      </div>` : ''}
      <br>
      <button class="btn-voltar" onclick="voltarCard()" style="max-width:280px;margin:0 auto;">← Voltar ao Card</button>
    </div>`;
  document.getElementById('bug-box').style.display = '';
}

window.reiniciar = function() {
  if (tentativasUsadas >= tentativasPermitidas) { mostrarBloqueado(null); return; }
  atual = 0; acertos = 0; erros = 0; pontosGanhos = 0;
  tentativaRegistrada = false; linhasSelecionadas = []; codigoRespondido = false;
  document.getElementById('tela-final').style.display = 'none';
  document.getElementById('pl-ac').textContent = '0';
  document.getElementById('pl-er').textContent = '0';
  document.getElementById('pl-pt').textContent = '0';
  renderCodigo();
};

window.voltarCard = function() {
  if (window.opener) window.close();
  else if (window.history.length > 1) history.back();
  else window.location.href = '../cards/card.html?id=' + cardId;
};

init();
