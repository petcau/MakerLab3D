import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc, collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAndgQiwxpe6wyCF8aa5NqqdMuwLJfMIMM",
  authDomain: "makerlab3d-4e455.firebaseapp.com",
  projectId: "makerlab3d-4e455",
  storageBucket: "makerlab3d-4e455.firebasestorage.app",
  messagingSenderId: "495457985822",
  appId: "1:495457985822:web:05efcebeed970ecb82150f"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const loading = document.getElementById('loading');
const content = document.getElementById('portal-content');

const perfilLabels = {
  gestor:       'Gestor',
  conteudista:  'Conteudista',
  professor:    'Professor',
  aluno:        'Aluno'
};

// ── MODO PREVIEW (sem login) ──────────────────────────────────────────
// Acesse com ?preview=1 para testar sem autenticação
const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';

if (isPreview) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('portal-content').style.display = 'block';
  document.getElementById('user-name').textContent  = 'Peterson Lobato';
  document.getElementById('user-email').textContent = 'peterson.lobato@hotmail.com';
  document.getElementById('user-avatar').textContent = 'P';
  document.getElementById('user-perfil').textContent = 'Gestor';
  document.getElementById('visualizar-como').classList.add('visivel');
  inicializarPaineis('gestor');
  carregarTrilhasAluno();
  desenharSelo(340);
  renderSemanas(2, 3, 40);
} else {

// Timeout de segurança: se Firebase demorar >6s, redireciona para login
setTimeout(() => {
  const sub = document.getElementById('loading-sub');
  if (sub) sub.style.display = 'block';
}, 3000);

const authTimeout = setTimeout(() => {
  window.location.href = 'login.html';
}, 6000);

onAuthStateChanged(auth, async user => {
  clearTimeout(authTimeout);
  console.log('[AUTH]', user ? 'logado: ' + user.email : 'não logado');

  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // Exibe conteúdo
  loading.style.display = 'none';
  content.style.display = 'block';

  // Nome e e-mail
  const nome = user.displayName || user.email.split('@')[0];
  document.getElementById('user-name').textContent = nome;
  document.getElementById('user-email').textContent = user.email;

  // Avatar
  const avatarEl = document.getElementById('user-avatar');
  if (user.photoURL) {
    avatarEl.innerHTML = `<img src="${user.photoURL}" alt="${nome}">`;
  } else {
    avatarEl.textContent = nome.charAt(0).toUpperCase();
  }

  // Buscar perfil e escola no Firestore
  try {
    const snap = await getDoc(doc(db, 'usuarios', user.uid));
    if (snap.exists()) {
      const dados = snap.data();
      const perfil = dados.perfil || '';

      // Atualiza nome e escola no ranking
      const rankNomeEl = document.getElementById('ranking-user-nome');
      if (rankNomeEl) rankNomeEl.textContent = dados.nome || nome;

      // Exibe o perfil
      const perfilEl = document.getElementById('user-perfil');
      perfilEl.textContent = perfilLabels[perfil] || perfil;

      // Mostra seletor somente para gestor
      if (perfil === 'gestor') {
        document.getElementById('visualizar-como').classList.add('visivel');
      }

      // Inicializa painéis conforme perfil
      inicializarPaineis(perfil);

      // Carrega trilhas conforme perfil
      if (perfil === 'aluno' || perfil === 'gestor') {
        carregarTrilhasAluno();
      }
      if (perfil === 'professor' || perfil === 'gestor') {
        carregarTrilhasProfessor();
      }

      // Recalcula pontos somando todas as coleções de resultados
      let ptsReais = dados.pontos_total || 0;
      try {
        const cols = ['resultados_quiz','resultados_bug','resultados_comp','resultados_ordena','resultados_complete','resultados_conecta','resultados_box'];
        const results = await Promise.allSettled(cols.map(c => getDocs(query(collection(db, c), where('aluno_id', '==', user.uid)))));
        let totalCalculado = 0;
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            r.value.forEach(d => { totalCalculado += parseFloat(d.data().melhor_pontos) || 0; });
          } else {
            console.warn('Falha ao ler ' + cols[i] + ':', r.reason);
          }
        });
        totalCalculado = Math.round(totalCalculado * 10) / 10;
        console.log('[PONTOS] calculado:', totalCalculado, '| salvo:', ptsReais);
        ptsReais = totalCalculado;
        await updateDoc(doc(db, 'usuarios', user.uid), { pontos_total: ptsReais });
      } catch(e) { console.warn('Recalculo pontos:', e); }

      desenharSelo(ptsReais);

      // Atualiza pontos na caixa de ranking
      const rankPontosEl = document.getElementById('rank-pontos');
      if (rankPontosEl) rankPontosEl.textContent = ptsReais;

      // Calcular posição no ranking (escola e geral)
      calcularPosicaoRanking(user.uid, ptsReais, dados.escola_id || '');

      // Carregar progresso real do aluno
      if (dados.perfil === 'aluno') {
        carregarProgresso(user.uid, ptsReais);
      }

      // Atualiza nome do aluno no ranking
      const nomeDisplay = user.displayName || user.email.split('@')[0];
      const gamifEuNome  = document.getElementById('gamif-eu-nome');
      const gamifEuNome2 = document.getElementById('gamif-eu-nome2');
      const gamifEuAv    = document.getElementById('gamif-eu-av');
      const gamifEuAv2   = document.getElementById('gamif-eu-av2');
      if (gamifEuNome)  gamifEuNome.textContent  = nomeDisplay;
      if (gamifEuNome2) gamifEuNome2.textContent = nomeDisplay;
      if (gamifEuAv)    gamifEuAv.textContent    = nomeDisplay.charAt(0).toUpperCase();
      if (gamifEuAv2)   gamifEuAv2.textContent   = nomeDisplay.charAt(0).toUpperCase();

      // Se for professor ou aluno, busca nome da escola
      if ((perfil === 'professor' || perfil === 'aluno') && dados.escola_id) {
        const escolaSnap = await getDoc(doc(db, 'escolas', dados.escola_id));
        const escolaEl = document.getElementById('user-escola');
        const escolaNome = escolaSnap.exists() ? (escolaSnap.data().nome || dados.escola_id) : dados.escola_id;
        if (escolaSnap.exists()) {
          escolaEl.textContent = '🏫 ' + escolaNome;
        } else {
          escolaEl.textContent = '🏫 ' + dados.escola_id;
        }
        const rankEscolaEl = document.getElementById('ranking-user-escola');
        if (rankEscolaEl) rankEscolaEl.textContent = '🏫 ' + escolaNome;
        escolaEl.style.display = 'block';
      }
    }
  } catch(e) {
    console.warn('Erro ao buscar perfil:', e);
  }
});

// ── Ranking real ────────────────────────────────────────────────────────
// ── Progresso real do aluno ────────────────────────────────────────────
async function carregarProgresso(uid, ptsTotal) {
  try {
    // Buscar todos os resultados do aluno
    const snap = await getDocs(collection(db, 'resultados_quiz'));
    let concluidos = 0;
    const cardsConcluidos = new Set();

    snap.forEach(d => {
      const r = d.data();
      if (r.aluno_id === uid && r.concluido) {
        concluidos++;
        cardsConcluidos.add(r.card_id);
      }
    });

    // Buscar total de cards publicados para taxa
    const cardsSnap = await getDocs(collection(db, 'cards'));
    let totalCards = 0;
    cardsSnap.forEach(d => { if (d.data().publicado) totalCards++; });

    const taxa = totalCards > 0 ? Math.round((concluidos / totalCards) * 100) : 0;

    // Semana atual baseada na data (início do ano letivo = março)
    const hoje     = new Date();
    const inicioAno = new Date(hoje.getFullYear(), 2, 1); // 1 de março
    const diffMs   = hoje - inicioAno;
    const semana   = Math.max(1, Math.min(40, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1));

    // Atualizar stats
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('prog-desafios', concluidos);
    el('prog-semana',   semana);
    el('prog-pontos',   ptsTotal);
    el('prog-taxa',     taxa + '%');

    // Renderizar grid de 40 semanas
    const grid = document.getElementById('prog-semanas-grid');
    if (grid) {
      grid.innerHTML = '';
      for (let s = 1; s <= 40; s++) {
        const div = document.createElement('div');
        div.className = 'semana-dot';
        if (s < semana)        div.classList.add('ok');
        else if (s === semana) div.classList.add('atual');
        else                   div.classList.add('vazio');
        div.textContent = s;
        grid.appendChild(div);
      }
    }
  } catch(e) { console.warn('Erro progresso:', e); }
}

async function calcularPosicaoRanking(meuUid, meusPontos, minhaEscolaId) {
  try {
    const snap = await getDocs(collection(db, 'usuarios'));
    const alunos = [];
    const escolasSnap = await getDocs(collection(db, 'escolas'));
    const escolasMap = {};
    escolasSnap.forEach(d => { escolasMap[d.id] = d.data().nome || d.id; });

    snap.forEach(d => {
      const u = d.data();
      if (u.perfil === 'aluno') {
        alunos.push({
          uid:       d.id,
          nome:      u.nome || '—',
          pontos:    u.pontos_total || 0,
          escola_id: u.escola_id || '',
          escola:    escolasMap[u.escola_id] || u.escola_id || '—'
        });
      }
    });

    // Ordenar por pontos desc
    alunos.sort((a, b) => b.pontos - a.pontos);

    // Posição geral
    const posGeral = alunos.findIndex(a => a.uid === meuUid) + 1;
    const elGeral  = document.getElementById('rank-pos-geral');
    if (elGeral) elGeral.textContent = posGeral > 0 ? '#' + posGeral + 'º' : '—';

    // Posição na escola
    const alunosEscola = alunos.filter(a => a.escola_id === minhaEscolaId);
    const posEscola    = alunosEscola.findIndex(a => a.uid === meuUid) + 1;
    const elEscola     = document.getElementById('rank-pos-escola');
    if (elEscola) elEscola.textContent = posEscola > 0 ? '#' + posEscola + 'º' : '—';

    // Renderizar listas de gamificação
    renderGamifLista('gamif-lista-escola', alunosEscola, meuUid, true);
    renderGamifLista('gamif-lista-geral',  alunos,       meuUid, false);

  } catch(e) { console.warn('Erro ranking:', e); }
}

function renderGamifLista(containerId, lista, meuUid, mostrarEscola) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const top = lista.slice(0, 10);
  const medals = ['🥇','🥈','🥉'];
  const euIdx  = lista.findIndex(a => a.uid === meuUid);
  const euItem = lista[euIdx];

  let html = '';
  top.forEach((a, i) => {
    const souEu   = a.uid === meuUid;
    const pos     = medals[i] || (i + 1) + 'º';
    const inicial = (a.nome || '?').charAt(0).toUpperCase();
    const pts     = (a.pontos || 0).toLocaleString('pt-BR');
    const escola  = mostrarEscola ? '' : `<div class="gamif-escola-tag">${a.escola}</div>`;
    html += `
      <div class="gamif-item ${i < 3 ? 'destaque' : ''} ${souEu ? 'eu' : ''}">
        <div class="gamif-pos">${pos}</div>
        <div class="gamif-avatar${souEu ? ' eu-av' : ''}">${inicial}</div>
        <div class="gamif-info">
          <div class="gamif-nome">${souEu ? 'Você' : a.nome}</div>
          ${escola}
        </div>
        <div class="gamif-pts">${pts} pts</div>
      </div>`;
  });

  // Se eu não estou no top 10, adicionar separado
  if (euIdx >= 10 && euItem) {
    const pts = (euItem.pontos || 0).toLocaleString('pt-BR');
    html += `
      <div class="gamif-item eu" style="margin-top:8px; border-top:1px dashed #dbe2ef; padding-top:8px;">
        <div class="gamif-pos">${euIdx + 1}º</div>
        <div class="gamif-avatar eu-av">${(euItem.nome || '?').charAt(0).toUpperCase()}</div>
        <div class="gamif-info">
          <div class="gamif-nome">Você</div>
          ${mostrarEscola ? '' : `<div class="gamif-escola-tag">${euItem.escola}</div>`}
        </div>
        <div class="gamif-pts">${pts} pts</div>
      </div>`;
  }

  if (!html) html = '<div style="text-align:center;color:#bbb;font-size:13px;padding:20px;">Nenhum aluno encontrado.</div>';
  el.innerHTML = html;
}

// ── Painéis por visão ──────────────────────────────────────────────────
const paineis = {
  aluno:     document.getElementById('painel-aluno'),
  professor: document.getElementById('painel-professor'),
  gestor:    document.getElementById('painel-gestor'),
};

const subtitulos = {
  gestor:    'Bem-vindo ao seu espaço maker. Acesse trilhas, desafios, materiais e recursos pedagógicos integrados.',
  professor: 'Visualizando como Professor — acesse planos de aula, trilhas formativas e gerencie suas turmas.',
  aluno:     'Visualizando como Aluno — explore desafios, acumule pontos e avance nas trilhas maker.',
};

function mostrarPaineis(visao) {
  // Gestor vê todos os painéis; outros veem só o seu
  if (visao === 'gestor') {
    Object.values(paineis).forEach(p => p && p.classList.add('visivel'));
  } else {
    Object.entries(paineis).forEach(([k, p]) => {
      if (!p) return;
      p.classList.toggle('visivel', k === visao);
    });
  }
}

// Inicializa painel conforme perfil real do usuário
function inicializarPaineis(perfil) {
  mostrarPaineis(perfil);
}

// Seletor de visualização (apenas gestor)
let visaoAtual = 'gestor';

window.mudarVisao = function(visao) {
  visaoAtual = visao;

  // Botões
  document.querySelectorAll('.btn-visao').forEach(btn => {
    btn.classList.toggle('ativo', btn.dataset.visao === visao);
  });

  // Subtítulo
  const sub = document.querySelector('.portal-hero-text p');
  if (sub) sub.textContent = subtitulos[visao] || subtitulos.gestor;

  // Badge
  const perfilEl = document.getElementById('user-perfil');
  const labels = { gestor: 'Gestor', professor: 'Professor', aluno: 'Aluno' };
  if (visao !== 'gestor') {
    perfilEl.textContent = labels[visao] + ' (visualização)';
    perfilEl.style.background = 'rgba(255,255,255,0.15)';
    perfilEl.style.color = '#fff';
  } else {
    perfilEl.textContent = 'Gestor';
    perfilEl.style.background = '#f5c400';
    perfilEl.style.color = '#23314d';
  }

  // Painéis
  mostrarPaineis(visao);
};

// ── Gamificação tabs ───────────────────────────────────────────────────
window.gamifTab = function(tipo) {
  document.querySelectorAll('.gamif-tab').forEach(b => b.classList.remove('ativo'));
  document.querySelector(`.gamif-tab[onclick="gamifTab('${tipo}')"]`).classList.add('ativo');
  document.getElementById('gamif-lista-escola').style.display = tipo === 'escola' ? 'flex' : 'none';
  document.getElementById('gamif-lista-geral').style.display  = tipo === 'geral'  ? 'flex' : 'none';
};

// ── Grid de semanas ────────────────────────────────────────────────────
function renderSemanas(concluidas, atual, total) {
  const grid = document.getElementById('prog-semanas-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const dot = document.createElement('div');
    dot.title = 'Semana ' + i;
    dot.textContent = i;
    if (i < atual)      dot.className = 'semana-dot ok';
    else if (i === atual) dot.className = 'semana-dot atual';
    else                  dot.className = 'semana-dot vazio';
    grid.appendChild(dot);
  }
}
renderSemanas(2, 3, 40);

// ── Selo Canvas ────────────────────────────────────────────────────────
const NIVEIS = [
  { nivel: 1,  nome: 'Explorador Iniciante', min: 0,    max: 99,   emoji: '🔍', cor1: '#5d8a6e', cor2: '#3a6b4f', desc: 'Primeiro contato com o mundo maker. Descobrindo conceitos básicos.'         },
  { nivel: 2,  nome: 'Curioso Digital',       min: 100,  max: 249,  emoji: '💡', cor1: '#2980b9', cor2: '#1a5276', desc: 'Começa a experimentar e entender como as coisas funcionam.'                },
  { nivel: 3,  nome: 'Aprendiz Maker',        min: 250,  max: 499,  emoji: '🧠', cor1: '#8e44ad', cor2: '#6c3483', desc: 'Já domina conceitos básicos e realiza pequenos desafios.'                  },
  { nivel: 4,  nome: 'Construtor Criativo',   min: 500,  max: 899,  emoji: '🛠️', cor1: '#d35400', cor2: '#a04000', desc: 'Constrói projetos simples e começa a conectar ideias.'                    },
  { nivel: 5,  nome: 'Inventor em Ação',      min: 900,  max: 1399, emoji: '⚙️', cor1: '#c0392b', cor2: '#922b21', desc: 'Cria soluções com autonomia e resolve problemas práticos.'                },
  { nivel: 6,  nome: 'Programador Maker',     min: 1400, max: 1999, emoji: '💻', cor1: '#16a085', cor2: '#0e6655', desc: 'Integra lógica, eletrônica e programação nos projetos.'                   },
  { nivel: 7,  nome: 'Engenheiro Criativo',   min: 2000, max: 2699, emoji: '🧩', cor1: '#2471a3', cor2: '#1a5276', desc: 'Desenvolve projetos mais complexos e estruturados.'                       },
  { nivel: 8,  nome: 'Inovador Maker',        min: 2700, max: 3499, emoji: '🚀', cor1: '#7d3c98', cor2: '#5b2c6f', desc: 'Propõe soluções originais e melhora projetos existentes.'                 },
  { nivel: 9,  nome: 'Mentor Maker',          min: 3500, max: 4499, emoji: '🧑‍🏫', cor1: '#1e8449', cor2: '#145a32', desc: 'Ajuda outros alunos e compartilha conhecimento.'                       },
  { nivel: 10, nome: 'Mestre Maker',          min: 4500, max: 99999,emoji: '👑', cor1: '#b7950b', cor2: '#9a7d0a', desc: 'Domina todo o processo: cria, inova e inspira outros.'                   },
];

function getNivel(pts) {
  for (let i = NIVEIS.length - 1; i >= 0; i--) {
    if (pts >= NIVEIS[i].min) return NIVEIS[i];
  }
  return NIVEIS[0];
}

function atualizarListaNiveis(pts) {
  const lista = document.getElementById('niveis-lista');
  if (!lista) return;
  const items = lista.querySelectorAll('.nivel-item');
  items.forEach((item, i) => {
    const n = NIVEIS[i];
    if (!n) return;
    item.classList.remove('conquistado', 'atual');
    if (pts >= n.min && (i === NIVEIS.length - 1 || pts < NIVEIS[i+1].min)) {
      item.classList.add('atual');
    } else if (pts >= n.min) {
      item.classList.add('conquistado');
    }
  });
}

function desenharSelo(pts) {
  const nivel = getNivel(pts);
  const prox  = NIVEIS.find(n => n.min > pts);
  const pct   = prox ? Math.min((pts - nivel.min) / (prox.min - nivel.min), 1) : 1;

  // Atualiza imagem do robô
  const roboImg = document.getElementById('robo-avatar');
  if (roboImg) roboImg.src = 'assets/robo ' + (nivel.nivel || 1) + '_transparente.png';

  // Atualiza textos externos
  atualizarListaNiveis(pts);
  const nomeEl = document.getElementById('selo-nivel-nome');
  const ptsEl  = document.getElementById('selo-nivel-pts');
  if (nomeEl) nomeEl.textContent = nivel.emoji + ' Nível ' + (nivel.nivel || '') + ' — ' + nivel.nome;
  if (ptsEl)  ptsEl.textContent  = pts + ' pontos';

  // Atualiza barra do ranking
  const barra = document.getElementById('rank-barra');
  if (barra) barra.style.width = Math.round(pct * 100) + '%';

  // Próximo nível na caixa de pontos
  const proxEl     = document.getElementById('rank-pts-prox');
  const proxNomeEl = document.getElementById('rank-prox-nome');
  const proxTxtEl  = document.getElementById('rank-proximo-txt');
  if (prox) {
    if (proxEl)     proxEl.textContent     = (prox.min - pts) + ' pts';
    if (proxNomeEl) proxNomeEl.textContent = proxNomeEl ? prox.nome : '';
    if (proxTxtEl)  proxTxtEl.style.display = '';
  } else {
    if (proxTxtEl) proxTxtEl.innerHTML = '<strong>Nível máximo atingido!</strong> 🎉';
  }
}

// Selo será atualizado após login com pontos reais

// ── Carregar trilhas do Firestore ──────────────────────────────────────
async function carregarTrilhasAluno() {
  const container = document.getElementById('trilhas-aluno-container');
  if (!container) return;

  // Dados simulados de progresso do aluno
  const progressoSimulado = {
    'pensamento-computacional': ['card-01', 'card-02', 'card-03'],
    'eletronica-basica':        ['card-04'],
    'robotica-criativa':        [],
  };

  try {
    const trilhasSnap = await getDocs(collection(db, 'trilhas'));

    if (trilhasSnap.empty) {
      // Sem trilhas cadastradas → mostra dados simulados
      container.innerHTML = renderTrilhaSimulada();
      return;
    }

    const trilhas = [];
    trilhasSnap.forEach(d => { if (d.data().publicado) { const t = { id: d.id, ...d.data() }; trilhas.push(t); trilhasCache[d.id] = t; } });
    trilhas.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    if (trilhas.length === 0) {
      container.innerHTML = renderTrilhaSimulada();
      return;
    }

    // Buscar dados dos cards
    const cardsSnap = await getDocs(collection(db, 'cards'));
    const cardsDB   = {};
    cardsSnap.forEach(d => { cardsDB[d.id] = d.data(); });

    container.innerHTML = '';
    trilhas.forEach(trilha => {
      const concluidos = (progressoSimulado[trilha.id] || []).length;
      const total      = (trilha.cards || []).length;
      const pct        = total ? Math.round((concluidos / total) * 100) : 0;

      const bloco = document.createElement('div');
      bloco.className = 'trilha-bloco';
      bloco.innerHTML = `
        <div class="trilha-bloco-header">
          <div class="trilha-bloco-nome-wrap">
            <div class="trilha-bloco-nome">${trilha.nome || trilha.id}</div>
            <button class="btn-saiba-mais" data-trilha-id="${trilha.id}">Saiba mais →</button>
          </div>
          <div class="trilha-bloco-prog">${concluidos}/${total} desafios · ${pct}%</div>
        </div>
        <div class="trilha-progress-bar">
          <div class="trilha-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="trilha-cards-row">
          ${(trilha.cards || []).map((cid, i) => {
            const c    = cardsDB[cid] || {};
            const done = (progressoSimulado[trilha.id] || []).includes(cid);
            const next = !done && i === concluidos;
            const cls  = done ? 'concluido' : next ? 'proximo' : 'bloqueado';
            const ico  = done ? '✅' : next ? '&#9654;' : '🔒';
            const url      = 'cards/card.html?id=' + cid;
            const clicavel = cls !== 'bloqueado';
            const tag      = clicavel ? 'a' : 'div';
            const href     = clicavel ? ' href="' + url + '" target="_blank"' : '';
            const div = '<' + tag + ' class="trilha-card-item ' + cls + '"' + href + ' style="text-decoration:none;">'
              + '<div class="trilha-card-status">' + ico + '</div>'
              + '<div class="trilha-card-num">' + (c.tipo || 'Desafio') + ' ' + String(c.numero || (i+1)).padStart(2,'0') + '</div>'
              + '<div class="trilha-card-nome">' + (c.nome || cid) + '</div>'
              + '<div class="trilha-card-pts">' + (c.pontos || 10) + ' pts</div>'
              + '</' + tag + '>';
            return div;
          }).join('')}
        </div>
      `;
      container.appendChild(bloco);
    });

  } catch(e) {
    console.warn('Firestore trilhas:', e);
    container.innerHTML = renderTrilhaSimulada();
  }
}

// ── Trilhas do Professor (todas desbloqueadas) ───────────────────────
async function carregarTrilhasProfessor() {
  const container = document.getElementById('trilhas-professor-container');
  console.log('[PROF TRILHAS] container:', container ? 'encontrado' : 'NÃO encontrado');
  if (!container) return;

  try {
    const snap = await getDocs(collection(db, 'trilhas'));
    console.log('[PROF TRILHAS] docs:', snap.size);
    if (snap.empty) {
      container.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">Nenhuma trilha publicada ainda.</p>';
      return;
    }

    const docs = [];
    snap.forEach(d => { if (d.data().publicado) docs.push(d); });
    docs.sort((a, b) => {
      const ia = isNaN(a.id) ? a.id : Number(a.id);
      const ib = isNaN(b.id) ? b.id : Number(b.id);
      return typeof ia === 'number' && typeof ib === 'number' ? ia - ib : String(ia).localeCompare(String(ib));
    });

    // Busca dados dos cards
    const todosIds = new Set();
    docs.forEach(d => (d.data().cards || []).forEach(id => todosIds.add(id)));
    const cardsDB = {};
    await Promise.all([...todosIds].map(async id => {
      try {
        const s = await getDoc(doc(db, 'cards', id));
        if (s.exists()) cardsDB[id] = s.data();
      } catch(e) {}
    }));

    container.innerHTML = '';
    docs.forEach(docSnap => {
      const t      = { id: docSnap.id, ...docSnap.data() };
      trilhasCache[docSnap.id] = t;
      const cardIds = t.cards || [];
      const total   = cardIds.length;

      const bloco = document.createElement('div');
      bloco.className = 'trilha-bloco';

      // Cards — todos desbloqueados para professor
      const cardsHtml = cardIds.map((cid, i) => {
        const c   = cardsDB[cid] || {};
        const url = 'cards/card.html?id=' + cid;
        return '<a class="trilha-card-item proximo" href="' + url + '" target="_blank" style="text-decoration:none;">'
          + '<div class="trilha-card-status">&#9654;</div>'
          + '<div class="trilha-card-num">' + (c.tipo || 'Card') + ' ' + String(c.numero || (i+1)).padStart(2,'0') + '</div>'
          + '<div class="trilha-card-nome">' + (c.nome || cid) + '</div>'
          + '<div class="trilha-card-pts">' + (c.pontos || 10) + ' pts</div>'
          + '</a>';
      }).join('');

      bloco.innerHTML = '<div class="trilha-bloco-header">'
        + '<div class="trilha-bloco-nome-wrap">'
        + '<div class="trilha-bloco-nome">🚀 ' + (t.nome || docSnap.id) + '</div>'
        + '<button class="btn-saiba-mais" data-trilha-id="' + docSnap.id + '">Saiba mais →</button>'
        + '</div>'
        + '<div class="trilha-bloco-prog">' + total + ' card' + (total !== 1 ? 's' : '') + ' · Todos desbloqueados</div>'
        + '</div>'
        + '<div class="trilha-progress-bar"><div class="trilha-progress-fill" style="width:100%;background:linear-gradient(90deg,#30446f,#465f94);"></div></div>'
        + '<div class="trilha-cards-row">' + cardsHtml + '</div>';

      container.appendChild(bloco);
    });

  } catch(err) {
    console.warn('Trilhas professor:', err);
    container.innerHTML = '<p style="color:#e74c3c;padding:16px;">Erro ao carregar trilhas.</p>';
  }
}

function renderTrilhaSimulada() {
  const trilhas = [
    { nome: 'Pensamento Computacional', cards: [
      { num:'01', nome:'Pisca-Pisca',      pts:10, status:'concluido' },
      { num:'02', nome:'Sensor de Luz',    pts:10, status:'concluido' },
      { num:'03', nome:'Potenciômetro',    pts:15, status:'concluido' },
      { num:'04', nome:'Buzzer Musical',   pts:15, status:'proximo'   },
      { num:'05', nome:'Semáforo',         pts:20, status:'bloqueado' },
      { num:'06', nome:'Termômetro',       pts:20, status:'bloqueado' },
    ]},
    { nome: 'Eletrônica Básica', cards: [
      { num:'01', nome:'Circuito LED',     pts:10, status:'concluido' },
      { num:'02', nome:'Resistores',       pts:10, status:'proximo'   },
      { num:'03', nome:'Protoboard',       pts:15, status:'bloqueado' },
      { num:'04', nome:'Corrente',         pts:15, status:'bloqueado' },
    ]},
    { nome: 'Robótica Criativa', cards: [
      { num:'01', nome:'Montagem Básica',  pts:20, status:'bloqueado' },
      { num:'02', nome:'Motores',          pts:20, status:'bloqueado' },
      { num:'03', nome:'Sensores',         pts:25, status:'bloqueado' },
    ]},
  ];

  return trilhas.map(t => {
    const total     = t.cards.length;
    const concluidos = t.cards.filter(c => c.status === 'concluido').length;
    const pct        = Math.round((concluidos / total) * 100);
    const cardsHtml = t.cards.map(c => {
            const ico = c.status === 'concluido' ? '✅' : c.status === 'proximo' ? '&#9654;' : '🔒';
            return '<div class="trilha-card-item ' + c.status + '">'
              + '<div class="trilha-card-status">' + ico + '</div>'
              + '<div class="trilha-card-num">Desafio ' + c.num + '</div>'
              + '<div class="trilha-card-nome">' + c.nome + '</div>'
              + '<div class="trilha-card-pts">' + c.pts + ' pts</div>'
              + '</div>';
          }).join('');
    return '<div class="trilha-bloco">'
      + '<div class="trilha-bloco-header">'
      + '<div class="trilha-bloco-nome">' + t.nome + '</div>'
      + '<div class="trilha-bloco-prog">' + concluidos + '/' + total + ' desafios · ' + pct + '%</div>'
      + '</div>'
      + '<div class="trilha-progress-bar"><div class="trilha-progress-fill" style="width:' + pct + '%"></div></div>'
      + '<div class="trilha-cards-row">' + cardsHtml + '</div>'
      + '</div>';
  }).join('');
}

} // fim do else (modo preview)

// Cache de trilhas para o modal
const trilhasCache = {};

// Event delegation — captura cliques em qualquer btn-saiba-mais
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.btn-saiba-mais');
  if (!btn) return;
  const id = btn.dataset.trilhaId;
  if (id && trilhasCache[id]) abrirInfoTrilha(trilhasCache[id]);
});

// ---- MODAL SAIBA MAIS TRILHA ----
window.abrirInfoTrilha = function(t) {

  document.getElementById('modal-trilha-nome').textContent = t.nome || '—';

  const descWrap = document.getElementById('modal-trilha-desc-wrap');
  const descEl   = document.getElementById('modal-trilha-desc');
  if (t.descricao) { descEl.textContent = t.descricao; descWrap.style.display = ''; }
  else { descWrap.style.display = 'none'; }

  const objWrap = document.getElementById('modal-trilha-obj-wrap');
  const objEl   = document.getElementById('modal-trilha-obj');
  if (t.objetivo) { objEl.textContent = t.objetivo; objWrap.style.display = ''; }
  else { objWrap.style.display = 'none'; }

  // Vídeo YouTube
  const videoWrap   = document.getElementById('modal-trilha-video-wrap');
  const videoIframe = document.getElementById('modal-trilha-iframe');
  const embed = toEmbed(t.video_url || '');
  if (embed) {
    videoIframe.src = embed;
    videoWrap.style.display = '';
  } else {
    videoIframe.src = '';
    videoWrap.style.display = 'none';
  }

  document.getElementById('modal-trilha-info').style.display = 'flex';
};

window.fecharInfoTrilha = function(e) {
  if (e.target === document.getElementById('modal-trilha-info')) {
    document.getElementById('modal-trilha-info').style.display = 'none';
    document.getElementById('modal-trilha-iframe').src = '';
  }
};

function toEmbed(url) {
  if (!url) return '';
  const m1 = url.match(/youtu\.be\/([^?&]+)/);
  if (m1) return 'https://www.youtube.com/embed/' + m1[1];
  const m2 = url.match(/[?&]v=([^?&]+)/);
  if (m2) return 'https://www.youtube.com/embed/' + m2[1];
  if (url.includes('/embed/')) return url;
  return '';
}

// Abre o admin na aba correta via localStorage
window.abrirAdminAba = function(aba, event) {
  localStorage.setItem('admin_aba_destino', aba);
};

// Botão sair
document.getElementById('btn-sair').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'login.html';
});
