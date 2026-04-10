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

const params = new URLSearchParams(window.location.search);
const cardId = params.get('card');

let perguntas = [], atual = 0, acertos = 0, erros = 0, pontosGanhos = 0, respondida = false, cardData = null, avatarSrc = '../assets/robo 1_transparente.png';
let tentativaRegistrada = false, resultadoDocId = null, tentativasUsadas = 0, tentativasPermitidas = 3, alunoUid = null, escolaId = null;

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
      }

      // Dados do card
      const cardSnap = await getDoc(doc(db, 'cards', cardId));
      if (!cardSnap.exists()) { erroLoad('Card não encontrado.'); return; }
      cardData = cardSnap.data();

      document.getElementById('q-card-nome').textContent = cardData.nome || cardId;
      document.title = 'Quiz — ' + (cardData.nome || cardId);

      if (!cardData.quiz || cardData.quiz.length === 0) { erroLoad('Este card não tem quiz cadastrado.'); return; }

      tentativasPermitidas = cardData.tentativas || 3;
      resultadoDocId = user.uid + '_' + cardId;

      // Verificar tentativas usadas
      const resultSnap = await getDoc(doc(db, 'resultados_quiz', resultadoDocId));
      if (resultSnap.exists()) {
        tentativasUsadas = resultSnap.data().tentativas_usadas || 0;
      }

      if (tentativasUsadas >= tentativasPermitidas) {
        mostrarBloqueado(resultSnap.data());
        return;
      }

      perguntas = [...cardData.quiz].sort(() => Math.random() - 0.5);
      iniciarJogo();

    } catch(e) { erroLoad('Erro: ' + e.message); }
  });
}

function erroLoad(msg) {
  document.getElementById('loading').innerHTML = '<p style="color:var(--vermelho);font-weight:700;">' + msg + '</p>';
}

function iniciarJogo() {
  document.getElementById('loading').style.display   = 'none';
  document.getElementById('q-prog-wrap').style.display = '';
  document.getElementById('q-box').style.display      = '';
  document.getElementById('q-placar').style.display   = '';
  renderPergunta();
}

// Renderiza texto da pergunta — detecta blocos de código entre ``` ou por palavras-chave
function renderPerguntaTexto(texto) {
  const el = document.getElementById('q-texto');

  // Caso 1: tem marcadores ```
  if (texto.includes('```')) {
    const partes = texto.split('```');
    let html = '';
    partes.forEach((parte, i) => {
      if (!parte.trim()) return;
      if (i % 2 === 0) {
        html += '<span class="q-texto-narrativo">' + parte.replace(/</g, '&lt;') + '</span>';
      } else {
        const linhas = parte.split('\n');
        if (linhas[0].trim().match(/^[a-zA-Z]+$/)) linhas.shift();
        html += '<pre class="q-code-block"><code>' + linhas.join('\n').replace(/</g, '&lt;') + '</code></pre>';
      }
    });
    el.innerHTML = html;
    return;
  }

  // Caso 2: sem marcadores — detectar automaticamente linhas de código
  const KEYWORDS = /^(void|int|bool|float|char|String|if|else|for|while|do|switch|case|return|digitalWrite|digitalRead|analogWrite|analogRead|delay|Serial|#include|#define|\{|\})/;
  const linhas = texto.split('\n');
  const blocos = [];
  let modoAtual = null; // 'texto' ou 'codigo'
  let buffer = [];

  linhas.forEach(linha => {
    const eCodigo = KEYWORDS.test(linha.trim()) || linha.includes(';') || linha.trim() === '{' || linha.trim() === '}';
    const tipo = eCodigo ? 'codigo' : 'texto';

    if (tipo !== modoAtual) {
      if (buffer.length) blocos.push({ tipo: modoAtual, linhas: [...buffer] });
      buffer = [];
      modoAtual = tipo;
    }
    buffer.push(linha);
  });
  if (buffer.length) blocos.push({ tipo: modoAtual, linhas: buffer });

  // Se só tem texto (nenhum bloco de código detectado), exibe simples
  const temCodigo = blocos.some(b => b.tipo === 'codigo');
  if (!temCodigo) {
    el.textContent = texto;
    return;
  }

  let html = '';
  blocos.forEach(bloco => {
    if (bloco.tipo === 'texto') {
      const t = bloco.linhas.join(' ').trim();
      if (t) html += '<span class="q-texto-narrativo">' + t.replace(/</g, '&lt;') + '</span>';
    } else {
      html += '<pre class="q-code-block"><code>' + bloco.linhas.join('\n').replace(/</g, '&lt;') + '</code></pre>';
    }
  });

  el.innerHTML = html;
}

function renderPergunta() {
  if (atual >= perguntas.length) { mostrarFinal(); return; }
  respondida = false;
  const q   = perguntas[atual];
  const pct = Math.round((atual / perguntas.length) * 100);

  document.getElementById('prog-txt').textContent    = 'Pergunta ' + (atual + 1) + ' de ' + perguntas.length;
  document.getElementById('prog-pct').textContent    = pct + '%';
  document.getElementById('prog-fill').style.width   = pct + '%';
  document.getElementById('q-num').textContent       = 'Pergunta ' + (atual + 1);
  renderPerguntaTexto(q.pergunta || '—');
  const pts = parseFloat(q.pontos) || 1.0;
  document.getElementById('q-pts-badge').textContent = '+' + (pts % 1 === 0 ? pts : pts.toFixed(1)) + ' pt' + (pts !== 1 ? 's' : '');

  const altsEl = document.getElementById('q-alts');
  altsEl.innerHTML = '';
  const letras = ['A','B','C','D'];
  (q.alternativas || []).forEach((alt, i) => {
    if (!alt && alt !== 0) return;
    const btn = document.createElement('button');
    btn.className = 'q-alt';
    btn.innerHTML = '<span class="q-alt-letra">' + letras[i] + '</span>' + alt;
    btn.onclick = () => responder(i, q);
    altsEl.appendChild(btn);
  });

  document.getElementById('q-feedback').style.display = 'none';
  document.getElementById('btn-prox').style.display   = 'none';
}

window.responder = function(idx, q) {
  if (respondida) return;
  respondida = true;

  // Registrar tentativa ao responder a 1ª pergunta
  if (!tentativaRegistrada && atual === 0) {
    tentativaRegistrada = true;
    registrarTentativa();
  }

  const alts    = document.querySelectorAll('.q-alt');
  const correta = q.correta;
  const pts     = parseFloat(q.pontos) || 1.0;
  const acertou = idx === correta;

  alts.forEach(b => b.disabled = true);
  alts[idx].classList.add(acertou ? 'correta' : 'errada');
  if (!acertou && alts[correta]) alts[correta].classList.add('revelada');

  if (acertou) { acertos++; pontosGanhos += pts; } else { erros++; }

  document.getElementById('pl-ac').textContent = acertos;
  document.getElementById('pl-er').textContent = erros;
  document.getElementById('pl-pt').textContent = pontosGanhos % 1 === 0 ? pontosGanhos : pontosGanhos.toFixed(1);

  const fb = document.getElementById('q-feedback');
  fb.className    = 'q-feedback ' + (acertou ? 'acerto' : 'erro');
  fb.textContent  = (acertou ? '✅ ' : '❌ ') + (q.feedback || (acertou ? 'Correto!' : 'Resposta incorreta.'));
  fb.style.display = 'block';

  const btnP = document.getElementById('btn-prox');
  btnP.style.display = 'block';
  btnP.textContent   = atual < perguntas.length - 1 ? 'Próxima →' : 'Ver Resultado 🎖️';
};

window.proxima = function() { atual++; renderPergunta(); };

function mostrarFinal() {
  document.getElementById('q-prog-wrap').style.display = 'none';
  document.getElementById('q-box').style.display       = 'none';
  document.getElementById('q-placar').style.display    = 'none';

  const total = perguntas.length;
  const pct   = Math.round((acertos / total) * 100);

  document.getElementById('res-ac').textContent = acertos;
  document.getElementById('res-er').textContent = erros;
  document.getElementById('res-pt').textContent = pontosGanhos % 1 === 0 ? pontosGanhos : pontosGanhos.toFixed(1);
  document.getElementById('tf-avatar').src      = avatarSrc;

  let emoji, titulo, msg;
  if (pct === 100) {
    emoji = '👑'; titulo = 'Perfeito!';
    msg = 'Você acertou todas as ' + total + ' perguntas! Desempenho excepcional, Mestre Maker!';
  } else if (pct >= 70) {
    emoji = '🎖️'; titulo = 'Muito bem!';
    msg = 'Você acertou ' + acertos + ' de ' + total + ' perguntas. Continue assim!';
  } else if (pct >= 40) {
    emoji = '💡'; titulo = 'Bom esforço!';
    msg = 'Você acertou ' + acertos + ' de ' + total + ' perguntas. Revise o card e tente novamente!';
  } else {
    emoji = '🔄'; titulo = 'Não desista!';
    msg = 'Você acertou ' + acertos + ' de ' + total + ' perguntas. Releia o conteúdo e tente de novo!';
  }

  document.getElementById('tf-emoji').textContent  = emoji;
  document.getElementById('tf-titulo').textContent = titulo;
  document.getElementById('tf-sub').textContent    = pct + '% de aproveitamento';
  document.getElementById('res-msg').textContent   = msg;

  // Badge concluído
  const badgeConcluido = document.getElementById('tf-badge-concluido');
  if (badgeConcluido) {
    badgeConcluido.style.display = pct >= 70 ? '' : 'none';
  }

  // Mostrar tentativas restantes na tela final
  const restantes = tentativasPermitidas - tentativasUsadas;
  const tentEl = document.getElementById('tf-tentativas-restantes');
  if (tentEl) {
    tentEl.textContent = restantes > 0
      ? restantes + ' tentativa' + (restantes !== 1 ? 's' : '') + ' restante' + (restantes !== 1 ? 's' : '')
      : 'Nenhuma tentativa restante';
    tentEl.style.color = restantes > 0 ? 'var(--azul-med)' : 'var(--vermelho)';
  }

  // Esconde botão tentar novamente se não tiver mais tentativas
  const btnTentar = document.querySelector('.btn-tentar');
  if (btnTentar) btnTentar.style.display = restantes > 0 ? '' : 'none';

  document.getElementById('tela-final').style.display = 'flex';

  // Salva resultado em background (não bloqueia a UI)
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
  perguntas = [...cardData.quiz].sort(() => Math.random() - 0.5);
  document.getElementById('tela-final').style.display = 'none';
  document.getElementById('q-prog-wrap').style.display  = '';
  document.getElementById('q-box').style.display        = '';
  document.getElementById('q-placar').style.display     = '';
  document.getElementById('pl-ac').textContent = '0';
  document.getElementById('pl-er').textContent = '0';
  document.getElementById('pl-pt').textContent = '0';
  renderPergunta();
};

// ── Registra uso da tentativa ao responder 1ª pergunta ──
async function registrarTentativa() {
  if (!resultadoDocId || !alunoUid) return;
  try {
    const ref  = doc(db, 'resultados_quiz', resultadoDocId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        aluno_id:             alunoUid,
        card_id:              cardId,
        escola_id:            escolaId,
        tentativas_permitidas: tentativasPermitidas,
        tentativas_usadas:    1,
        concluido:            false,
        melhor_pontos:        0,
        melhor_acertos:       0,
        total_perguntas:      perguntas.length,
        primeira_vez:         serverTimestamp(),
        ultima_vez:           serverTimestamp(),
        historico:            []
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
async function salvarResultado(acertos, pontosGanhos, total) {
  if (!resultadoDocId || !alunoUid) return;
  try {
    const pct      = Math.round((acertos / total) * 100);
    const concluiu = pct >= 70;
    const ref      = doc(db, 'resultados_quiz', resultadoDocId);
    const snap     = await getDoc(ref);
    const anterior = snap.exists() ? snap.data() : {};

    const jaConcluidoAntes = anterior.concluido || false;

    // Salva resultado com arrayUnion para o histórico (mais seguro)
    // melhor_pontos e melhor_acertos = última tentativa
    await updateDoc(ref, {
      concluido:      concluiu || jaConcluidoAntes,
      melhor_pontos:  pontosGanhos,
      melhor_acertos: acertos,
      historico:      arrayUnion({
        data:    new Date().toISOString(),
        pontos:  pontosGanhos,
        acertos: acertos,
        pct:     pct
      }),
      ultima_vez: serverTimestamp()
    });

    // Recalcular e atualizar pontos totais do aluno
    await recalcularPontosAluno();

  } catch(e) { console.warn('Erro ao salvar resultado:', e); }
}

// ── Recalcula pontos totais somando melhor_pontos de todos os resultados do aluno ──
async function recalcularPontosAluno() {
  try {
    const q    = query(collection(db, 'resultados_quiz'), where('aluno_id', '==', alunoUid));
    const snap = await getDocs(q);
    let total  = 0;
    snap.forEach(d => { total += parseFloat(d.data().melhor_pontos) || 0; });

    await updateDoc(doc(db, 'usuarios', alunoUid), {
      pontos_total: Math.round(total * 10) / 10
    });

    // Atualizar pontos no player card em tempo real
    document.getElementById('player-pts').textContent = Math.round(total * 10) / 10;
  } catch(e) { console.warn('Erro ao recalcular pontos:', e); }
}

// ── Tela de bloqueio ──
function mostrarBloqueado(dados) {
  document.getElementById('loading').style.display = 'none';
  const restantes = tentativasPermitidas - tentativasUsadas;
  document.getElementById('q-box').innerHTML = `
    <div style="padding:40px 28px; text-align:center;">
      <div style="font-size:52px; margin-bottom:16px;">🔒</div>
      <div style="font-family:'Nunito',sans-serif; font-size:22px; font-weight:900; color:var(--azul); margin-bottom:8px;">Quiz encerrado</div>
      <div style="font-size:14px; color:var(--azul-med); margin-bottom:24px;">
        Você já usou todas as <strong>${tentativasPermitidas}</strong> tentativas permitidas.
      </div>
      ${dados ? `
      <div style="background:#fffbea; border:1.5px solid var(--ouro); border-radius:16px; padding:16px; margin-bottom:24px; display:inline-block;">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--ouro-esc); margin-bottom:8px;">Seu melhor resultado</div>
        <div style="font-family:'Nunito',sans-serif; font-size:28px; font-weight:900; color:var(--azul);">${dados.melhor_acertos}/${dados.total_perguntas} perguntas</div>
        <div style="font-size:14px; color:var(--ouro-esc); font-weight:700;">${dados.melhor_pontos % 1 === 0 ? dados.melhor_pontos : dados.melhor_pontos.toFixed(1)} pontos</div>
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
