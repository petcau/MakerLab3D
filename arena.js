// arena.js — Arena MakerLab 3D

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore, collection, doc,
  getDocs, setDoc, deleteDoc, getDoc,
  query, orderBy, where, serverTimestamp, onSnapshot
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

let arenaAtiva      = null;
let usuarioUid      = null;
let usuarioPerfil   = null;
let cardsPermitidos = null; // Set de card IDs permitidos (null = todos)
let trilhaCards     = [];   // [{id, nome, numero, tipo}]
let todosCards      = [];   // cache de todos os cards do Firestore

// ── AUTH ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  document.getElementById('loading-auth').style.display = 'none';

  if (!user) {
    document.getElementById('acesso-negado').style.display = 'flex';
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'usuarios', user.uid));
    if (!snap.exists()) throw new Error('Usuário não encontrado.');

    const dados  = snap.data();
    const perfil = dados.perfil;

    if (perfil !== 'gestor' && perfil !== 'professor') {
      document.getElementById('acesso-negado').style.display = 'flex';
      return;
    }

    usuarioUid    = user.uid;
    usuarioPerfil = perfil;

    // Preenche hero com dados do usuário
    const nome = dados.nome || user.email;
    const inicial = nome.charAt(0).toUpperCase();
    document.getElementById('arena-user-avatar').textContent = inicial;
    document.getElementById('arena-user-name').textContent   = nome;
    document.getElementById('arena-user-email').textContent  = user.email;
    document.getElementById('arena-user-perfil').textContent = perfil.charAt(0).toUpperCase() + perfil.slice(1);
    if (dados.escola_id) {
      try {
        const escSnap = await getDoc(doc(db, 'escolas', dados.escola_id));
        if (escSnap.exists()) {
          const escEl = document.getElementById('arena-user-escola');
          escEl.textContent = '🏫 ' + (escSnap.data().nome || dados.escola_id);
          escEl.style.display = 'block';
        }
      } catch(e) {}
    }

    if (perfil === 'professor' && dados.escola_id) {
      cardsPermitidos = await resolverCardsPermitidos(dados.escola_id);
    } else {
      cardsPermitidos = null;
    }
  } catch(e) {
    document.getElementById('acesso-negado').style.display = 'flex';
    return;
  }

  document.getElementById('arena-app').style.display = 'block';
  carregarArenas();
});

// ── CARDS PERMITIDOS (professor) ──────────────────────────────────────────────
async function resolverCardsPermitidos(escolaId) {
  try {
    const escolaSnap = await getDoc(doc(db, 'escolas', escolaId));
    if (!escolaSnap.exists()) return new Set();
    const secaoId = escolaSnap.data().secao_id;
    if (!secaoId) return new Set();

    const secaoSnap = await getDoc(doc(db, 'secoes', secaoId));
    if (!secaoSnap.exists()) return new Set();
    const trilhaIds = secaoSnap.data().trilhas || [];

    const cardIds = new Set();
    await Promise.all(trilhaIds.map(async tid => {
      try {
        const t = await getDoc(doc(db, 'trilhas', tid));
        if (t.exists()) (t.data().cards || []).forEach(cid => cardIds.add(cid));
      } catch(e) {}
    }));
    return cardIds;
  } catch(e) {
    return new Set();
  }
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ── LISTAR ────────────────────────────────────────────────────────────────────
async function carregarArenas() {
  const listEl = document.getElementById('arena-list');
  listEl.innerHTML = '<div class="list-empty">Carregando...</div>';

  try {
    const snap = await getDocs(query(collection(db, 'arenas'), where('criado_por', '==', usuarioUid), orderBy('data', 'desc')));
    listEl.innerHTML = '';

    if (snap.empty) {
      listEl.innerHTML = '<div class="list-empty">Nenhuma arena cadastrada.</div>';
      return;
    }

    snap.forEach(d => {
      const a = { id: d.id, ...d.data() };
      const item = document.createElement('div');
      item.className = 'arena-item' + (arenaAtiva === a.id ? ' active' : '');
      item.dataset.id = a.id;
      item.innerHTML = `
        <div class="arena-item-nome">${a.nome || '—'}</div>
        <div class="arena-item-data">${formatarData(a.data)}</div>
        <span class="arena-item-status ${a.ativo ? 'ativo' : 'inativo'}">${a.ativo ? 'Ativa' : 'Inativa'}</span>
      `;
      item.onclick = () => abrirArena(a, item);
      listEl.appendChild(item);
    });
  } catch(err) {
    listEl.innerHTML = `<div class="list-empty" style="color:#e74c3c;">Erro: ${err.message}</div>`;
  }
}

function formatarData(data) {
  if (!data) return '—';
  const [ano, mes, dia] = data.split('-');
  if (!ano) return data;
  return `${dia}/${mes}/${ano}`;
}

// ── ABRIR ─────────────────────────────────────────────────────────────────────
function abrirArena(a, el) {
  arenaAtiva = a.id;
  trilhaCards = (a.trilha_cards || []).map(c => ({ ...c }));
  document.querySelectorAll('.arena-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  renderForm(a.id, a);
}

// ── NOVA ──────────────────────────────────────────────────────────────────────
window.novaArena = function() {
  arenaAtiva  = null;
  trilhaCards = [];
  document.querySelectorAll('.arena-item').forEach(i => i.classList.remove('active'));
  const hoje = new Date().toISOString().split('T')[0];
  renderForm(null, { data: hoje });
};

// ── RENDER FORM ───────────────────────────────────────────────────────────────
function renderForm(id, a = {}) {
  const content = document.getElementById('arena-content');

  content.innerHTML = `
    <div class="form-header">
      <div class="form-title">${id ? 'Editar Arena' : 'Nova Arena'}</div>
      <div class="form-actions">
        ${id ? `<button class="btn-deletar" onclick="deletarArena('${id}')">🗑 Remover</button>` : ''}
        <button class="btn-salvar" onclick="salvarArena(${id ? `'${id}'` : 'null'})">💾 Salvar</button>
      </div>
    </div>

    <div class="form-section">
      <div class="section-title">Dados da Arena</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Data *</label>
          <input type="date" id="a-data" value="${a.data || ''}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="a-ativo">
            <option value="true"  ${a.ativo !== false ? 'selected' : ''}>Ativa</option>
            <option value="false" ${a.ativo === false  ? 'selected' : ''}>Inativa</option>
          </select>
        </div>
        <div class="form-group full">
          <label>Nome da Arena *</label>
          <input type="text" id="a-nome" value="${a.nome || ''}" placeholder="Ex: Arena Primavera 2025">
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="section-title">Cards da Trilha</div>
      <p style="font-size:12px;color:#999;margin-bottom:14px;">Adicione cards e use as setas para definir a ordem. Os participantes seguirão essa sequência.</p>
      <button onclick="abrirModalCards()" style="margin-bottom:14px;padding:9px 18px;background:var(--preto);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">+ Adicionar Card</button>
      <div id="arena-trilha-lista" style="border:1px dashed var(--cinza-medio);border-radius:8px;min-height:56px;padding:8px;"></div>
    </div>

    ${id ? `
    <div style="background:linear-gradient(135deg,#23314d,#30446f);border-radius:12px;padding:28px;text-align:center;margin-bottom:8px;">
      <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:6px;">🎮 Pronto para jogar?</div>
      <div style="font-size:13px;color:rgba(255,255,255,.65);margin-bottom:20px;">Configure o modo de jogo e inicie a arena com os participantes.</div>
      <button id="btn-criar-jogo" onclick="abrirModalCriarJogo('${id}')" class="btn-criar-jogo"
        style="padding:14px 40px;font-size:15px;font-weight:800;border-radius:10px;border:2px solid #f5c842;background:#f5c842;color:#23314d;cursor:pointer;transition:all .15s;letter-spacing:.3px;">
        🚀 Criar Jogo
      </button>
    </div>
    ` : ''}
  `;

  carregarTodosCards();
  renderTrilhaArena();
}

// ── SALVAR ────────────────────────────────────────────────────────────────────
window.salvarArena = async function(id) {
  const nome  = document.getElementById('a-nome')?.value?.trim();
  const data  = document.getElementById('a-data')?.value?.trim();
  const ativo = document.getElementById('a-ativo')?.value === 'true';
  if (!nome) { showToast('Informe o nome da arena.', 'error'); return; }
  if (!data) { showToast('Informe a data.', 'error'); return; }

  const docId = id || ('arena-' + Date.now());

  try {
    await setDoc(doc(db, 'arenas', docId), {
      nome,
      data,
      ativo,
      trilha_cards: trilhaCards,
      atualizado_em: new Date().toISOString(),
      ...(id ? {} : { criado_por: usuarioUid, criado_em: new Date().toISOString() })
    }, { merge: true });

    arenaAtiva = docId;
    showToast('✅ Arena salva!', 'success');
    await carregarArenas();

    // Reabre o form com dados atualizados
    const snap = await getDoc(doc(db, 'arenas', docId));
    if (snap.exists()) renderForm(docId, { id: docId, ...snap.data() });
  } catch(err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  }
};

// ── DELETAR ───────────────────────────────────────────────────────────────────
// ── TRILHA DA ARENA ───────────────────────────────────────────────────────────
async function carregarTodosCards() {
  if (todosCards.length > 0) return;
  try {
    const snap = await getDocs(collection(db, 'cards'));
    todosCards = [];
    snap.forEach(d => todosCards.push({ id: d.id, ...d.data() }));
    todosCards.sort((a, b) => (a.numero || 0) - (b.numero || 0));
  } catch(e) {}
}

let selecionadosModal = new Set();

window.abrirModalCards = async function() {
  await carregarTodosCards();
  selecionadosModal = new Set();

  const usados = new Set(trilhaCards.map(c => c.id));
  const disponiveis = todosCards.filter(c =>
    !usados.has(c.id) && (cardsPermitidos === null || cardsPermitidos.has(c.id))
  );
  const tipos = ['Todos', ...new Set(disponiveis.map(c => c.tipo || 'Sem tipo').filter(Boolean))];

  const modal = document.createElement('div');
  modal.id = 'modal-cards-arena';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;width:720px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.2);">
      <div style="padding:18px 24px 14px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <div style="font-size:16px;font-weight:700;">Selecionar Cards</div>
        <button onclick="document.getElementById('modal-cards-arena').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999;line-height:1;">✕</button>
      </div>

      <div style="padding:10px 24px;border-bottom:1px solid #eee;display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0;">
        ${tipos.map(t => `
          <button onclick="filtrarModalCards('${t}',this)" class="filtro-tipo-btn"
            style="padding:5px 14px;border-radius:20px;border:1px solid #ddd;background:${t==='Todos'?'#1a1a1a':'#f5f5f5'};color:${t==='Todos'?'#fff':'#333'};font-size:12px;font-weight:600;cursor:pointer;">
            ${t}
          </button>`).join('')}
      </div>

      <div id="modal-cards-grid" style="overflow-y:auto;flex:1;padding:16px 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:12px;">
        ${renderCardsGrid(disponiveis)}
      </div>

      <div style="padding:14px 24px;border-top:1px solid #eee;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#fafaf8;border-radius:0 0 12px 12px;">
        <span id="modal-sel-count" style="font-size:13px;color:#888;">Nenhum card selecionado</span>
        <div style="display:flex;gap:8px;">
          <button onclick="document.getElementById('modal-cards-arena').remove()"
            style="padding:9px 18px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;">Cancelar</button>
          <button onclick="confirmarSelecaoCards()"
            style="padding:9px 20px;border:none;border-radius:8px;background:#1a1a1a;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Adicionar à Trilha</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

function renderCardsGrid(cards) {
  if (cards.length === 0) return '<div style="grid-column:1/-1;text-align:center;color:#aaa;font-size:13px;padding:24px;">Nenhum card disponível.</div>';
  return cards.map(c => {
    const sel = selecionadosModal.has(c.id);
    return `
    <div id="card-modal-${c.id}" onclick="toggleCardModal('${c.id}')"
      style="border:2px solid ${sel?'#f5c842':'#e0e0e0'};border-radius:10px;padding:12px;cursor:pointer;transition:all .15s;background:${sel?'#fffbea':'#fff'};position:relative;">
      ${sel ? `<div style="position:absolute;top:8px;right:8px;background:#f5c842;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">✓</div>` : ''}
      ${c.imagem_url ? `<img src="${c.imagem_url}" style="width:100%;height:75px;object-fit:cover;border-radius:6px;margin-bottom:8px;" onerror="this.style.display='none'">` : ''}
      <div style="font-size:10px;color:#999;font-weight:600;margin-bottom:3px;">${c.tipo || ''} ${String(c.numero||'').padStart(2,'0')}</div>
      <div style="font-size:12px;font-weight:700;color:#1a1a1a;line-height:1.3;">${c.nome || c.id}</div>
    </div>`;
  }).join('');
}

window.toggleCardModal = function(cardId) {
  if (selecionadosModal.has(cardId)) {
    selecionadosModal.delete(cardId);
  } else {
    selecionadosModal.add(cardId);
  }
  // Atualiza visual do card sem re-renderizar tudo
  const card = todosCards.find(c => c.id === cardId);
  const el = document.getElementById('card-modal-' + cardId);
  if (el && card) {
    const sel = selecionadosModal.has(cardId);
    el.style.borderColor = sel ? '#f5c842' : '#e0e0e0';
    el.style.background  = sel ? '#fffbea' : '#fff';
    el.innerHTML = `
      ${sel ? `<div style="position:absolute;top:8px;right:8px;background:#f5c842;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">✓</div>` : ''}
      ${card.imagem_url ? `<img src="${card.imagem_url}" style="width:100%;height:75px;object-fit:cover;border-radius:6px;margin-bottom:8px;" onerror="this.style.display='none'">` : ''}
      <div style="font-size:10px;color:#999;font-weight:600;margin-bottom:3px;">${card.tipo || ''} ${String(card.numero||'').padStart(2,'0')}</div>
      <div style="font-size:12px;font-weight:700;color:#1a1a1a;line-height:1.3;">${card.nome || card.id}</div>`;
  }
  const n = selecionadosModal.size;
  const countEl = document.getElementById('modal-sel-count');
  if (countEl) countEl.textContent = n === 0 ? 'Nenhum card selecionado' : `${n} card${n>1?'s':''} selecionado${n>1?'s':''}`;
};

window.filtrarModalCards = function(tipo, btn) {
  document.querySelectorAll('.filtro-tipo-btn').forEach(b => {
    b.style.background = '#f5f5f5'; b.style.color = '#333';
  });
  btn.style.background = '#1a1a1a'; btn.style.color = '#fff';
  const usados = new Set(trilhaCards.map(c => c.id));
  const disponiveis = todosCards.filter(c =>
    !usados.has(c.id) && (cardsPermitidos === null || cardsPermitidos.has(c.id))
  );
  const filtrados = tipo === 'Todos' ? disponiveis : disponiveis.filter(c => (c.tipo || 'Sem tipo') === tipo);
  document.getElementById('modal-cards-grid').innerHTML = renderCardsGrid(filtrados);
};

window.confirmarSelecaoCards = function() {
  selecionadosModal.forEach(cardId => {
    const card = todosCards.find(c => c.id === cardId);
    if (card) trilhaCards.push({ id: card.id, nome: card.nome || card.id, numero: card.numero || 0, tipo: card.tipo || '' });
  });
  document.getElementById('modal-cards-arena')?.remove();
  renderTrilhaArena();
};

window.removerCardArena = function(i) {
  trilhaCards.splice(i, 1);
  renderTrilhaArena();
  carregarCardsSelect();
};

window.moverCardArena = function(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= trilhaCards.length) return;
  [trilhaCards[i], trilhaCards[j]] = [trilhaCards[j], trilhaCards[i]];
  renderTrilhaArena();
};

function renderTrilhaArena() {
  const lista = document.getElementById('arena-trilha-lista');
  if (!lista) return;

  // Habilita/desabilita botão Criar Jogo conforme trilha preenchida
  const btnCriar = document.getElementById('btn-criar-jogo');
  if (btnCriar) {
    btnCriar.disabled = trilhaCards.length === 0;
    if (trilhaCards.length === 0) {
      btnCriar.style.opacity = '.35';
      btnCriar.style.cursor  = 'not-allowed';
    } else {
      btnCriar.style.opacity = '1';
      btnCriar.style.cursor  = 'pointer';
    }
  }
  if (trilhaCards.length === 0) {
    lista.innerHTML = '<div style="text-align:center;color:#bbb;font-size:13px;padding:14px;">Nenhum card adicionado ainda.</div>';
    return;
  }
  lista.innerHTML = trilhaCards.map((c, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff;border:1px solid var(--cinza-medio);border-radius:8px;margin-bottom:6px;">
      <span style="font-size:12px;font-weight:700;color:#aaa;min-width:22px;">${String(i+1).padStart(2,'0')}</span>
      <span style="flex:1;font-size:13px;font-weight:600;color:var(--preto);">${c.nome}</span>
      <span style="font-size:11px;color:#999;">${c.tipo || ''}</span>
      <button onclick="moverCardArena(${i},-1)" ${i===0?'disabled':''} style="padding:3px 7px;border:1px solid #ddd;border-radius:5px;background:#fafafa;cursor:pointer;font-size:12px;" title="Mover para cima">▲</button>
      <button onclick="moverCardArena(${i},1)" ${i===trilhaCards.length-1?'disabled':''} style="padding:3px 7px;border:1px solid #ddd;border-radius:5px;background:#fafafa;cursor:pointer;font-size:12px;" title="Mover para baixo">▼</button>
      <button onclick="removerCardArena(${i})" style="padding:3px 8px;border:none;background:#fee;color:#c0392b;border-radius:5px;cursor:pointer;font-size:12px;" title="Remover">✕</button>
    </div>
  `).join('');
}

// ── CRIAR JOGO ────────────────────────────────────────────────────────────────
function gerarCodigoJogo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

window.abrirModalCriarJogo = function(arenaId) {
  const codigo = gerarCodigoJogo();

  const modal = document.createElement('div');
  modal.id = 'modal-criar-jogo';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;width:460px;max-width:95vw;box-shadow:0 8px 40px rgba(0,0,0,.2);overflow:hidden;">
      <div style="background:linear-gradient(135deg,#23314d,#30446f);padding:20px 24px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:17px;font-weight:700;color:#fff;">🎮 Criar Jogo</div>
        <button onclick="document.getElementById('modal-criar-jogo').remove()" style="background:none;border:none;color:rgba(255,255,255,.6);font-size:20px;cursor:pointer;line-height:1;">✕</button>
      </div>

      <div style="padding:20px 24px;background:#f8f9fe;border-bottom:1px solid #eee;text-align:center;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:10px;">Código do Jogo</div>
        <div id="jogo-codigo-display" data-codigo="${codigo}"
          style="font-family:'Courier New',monospace;font-size:36px;font-weight:900;letter-spacing:10px;color:#23314d;background:#fff;border:2px dashed #d0d7e8;border-radius:12px;padding:14px 20px;display:inline-block;min-width:220px;">
          ${codigo}
        </div>
        <div style="margin-top:8px;font-size:11px;color:#aaa;">Compartilhe este código com os participantes</div>
      </div>

      <div style="padding:24px;display:flex;flex-direction:column;gap:18px;">

        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#555;">Modo do Jogo *</label>
          <select id="jogo-modo" onchange="toggleQtdTimesJogo()"
            style="padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:#fafaf8;">
            <option value="individual">👤 Individual</option>
            <option value="times">👥 Times</option>
          </select>
        </div>

        <div id="jogo-qtd-wrap" style="display:none;flex-direction:column;gap:6px;">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#555;">Quantidade de Times *</label>
          <input type="number" id="jogo-qtd-times" min="2" max="50" value="2" placeholder="Ex: 4"
            style="padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:#fafaf8;">
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#555;">Tempo Predefinido (minutos)</label>
          <input type="number" id="jogo-tempo" min="1" max="300" placeholder="Em branco = sem limite de tempo"
            style="padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:#fafaf8;">
          <span style="font-size:11px;color:#aaa;">Deixe em branco para jogo sem limite de tempo.</span>
        </div>

      </div>

      <div style="padding:16px 24px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid #f0f0f0;">
        <button onclick="document.getElementById('modal-criar-jogo').remove()"
          style="padding:10px 20px;border:1px solid #ddd;border-radius:9px;background:#fff;font-size:13px;cursor:pointer;">Cancelar</button>
        <button onclick="carregarJogadores('${arenaId}')"
          style="padding:10px 22px;border:none;border-radius:9px;background:linear-gradient(135deg,#23314d,#30446f);color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px;">
          👥 Carregar Jogadores
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.toggleQtdTimesJogo = function() {
  const modo = document.getElementById('jogo-modo')?.value;
  const wrap = document.getElementById('jogo-qtd-wrap');
  if (wrap) wrap.style.display = modo === 'times' ? 'flex' : 'none';
};

const TIMES_GREGOS = [
  { nome: 'Alfa',    cor: '#3b82f6', bg: '#dbeafe' },
  { nome: 'Beta',    cor: '#ef4444', bg: '#fee2e2' },
  { nome: 'Gama',    cor: '#22c55e', bg: '#dcfce7' },
  { nome: 'Delta',   cor: '#a855f7', bg: '#f3e8ff' },
  { nome: 'Épsilon', cor: '#f97316', bg: '#ffedd5' },
  { nome: 'Zeta',    cor: '#14b8a6', bg: '#ccfbf1' },
  { nome: 'Eta',     cor: '#ec4899', bg: '#fce7f3' },
  { nome: 'Teta',    cor: '#eab308', bg: '#fef9c3' },
  { nome: 'Iota',    cor: '#6366f1', bg: '#e0e7ff' },
  { nome: 'Kapa',    cor: '#84cc16', bg: '#ecfccb' },
  { nome: 'Lambda',  cor: '#06b6d4', bg: '#cffafe' },
  { nome: 'Mi',      cor: '#f43f5e', bg: '#ffe4e6' },
];

let jogoListener = null;

window.carregarJogadores = async function(arenaId) {
  const modo     = document.getElementById('jogo-modo')?.value;
  const qtdTimes = modo === 'times' ? parseInt(document.getElementById('jogo-qtd-times')?.value) || 0 : null;
  const tempo    = parseInt(document.getElementById('jogo-tempo')?.value) || null;
  const codigo   = document.getElementById('jogo-codigo-display')?.dataset.codigo || '';

  if (modo === 'times' && (!qtdTimes || qtdTimes < 2)) {
    document.getElementById('jogo-qtd-times').style.borderColor = '#e74c3c';
    document.getElementById('jogo-qtd-times').focus();
    return;
  }

  // Monta estrutura de times
  const times = modo === 'times'
    ? Array.from({ length: qtdTimes }, (_, i) => ({
        nome:      'Equipe ' + (TIMES_GREGOS[i]?.nome || `Time ${i + 1}`),
        cor:       TIMES_GREGOS[i]?.cor  || '#888',
        bg:        TIMES_GREGOS[i]?.bg   || '#f5f5f5',
        jogadores: []
      }))
    : [];

  // Obtém nome da arena
  let arenaNome = 'Arena';
  try {
    const aSnap = await getDoc(doc(db, 'arenas', arenaId));
    if (aSnap.exists()) arenaNome = aSnap.data().nome || arenaNome;
  } catch(e) {}

  // Salva jogo no Firestore
  const jogoId = 'jogo-' + Date.now();
  try {
    await setDoc(doc(db, 'jogos', jogoId), {
      arena_id:  arenaId,
      arena_nome: arenaNome,
      codigo,
      modo,
      qtd_times:  qtdTimes,
      tempo,
      status:    'aguardando',
      times,
      jogadores: [],
      trilha_cards: trilhaCards,
      criado_por: usuarioUid,
      criado_em:  new Date().toISOString()
    });
  } catch(err) {
    showToast('Erro ao criar jogo: ' + err.message, 'error');
    return;
  }

  document.getElementById('modal-criar-jogo').remove();
  abrirSalaEspera(jogoId, { codigo, modo, qtdTimes, tempo, times, arenaNome });
};

// ── SALA DE ESPERA ────────────────────────────────────────────────────────────
function abrirSalaEspera(jogoId, cfg) {
  document.getElementById('sala-espera')?.remove();
  if (jogoListener) { jogoListener(); jogoListener = null; }

  const { codigo, modo, times, arenaNome, tempo } = cfg;

  const overlay = document.createElement('div');
  overlay.id = 'sala-espera';
  overlay.style.cssText = 'position:fixed;inset:0;background:#f0ede8;z-index:9998;display:flex;flex-direction:column;overflow:hidden;';
  overlay.innerHTML = `
    <style>
      @keyframes pulse-dot {
        0%,100% { opacity:1; transform:scale(1); }
        50%      { opacity:.4; transform:scale(.7); }
      }
      @keyframes fadeInUp {
        from { opacity:0; transform:translateY(12px); }
        to   { opacity:1; transform:translateY(0); }
      }
      .jogador-chip {
        display:flex;align-items:center;gap:8px;
        background:#fff;border-radius:10px;padding:10px 14px;
        border:1px solid #e0ddd8;animation:fadeInUp .25s ease;
        font-size:13px;font-weight:600;color:#1a1a1a;
      }
      .jogador-chip .chip-avatar {
        width:30px;height:30px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:13px;flex-shrink:0;
      }
    </style>

    <!-- TOPBAR -->
    <div style="background:linear-gradient(135deg,#23314d,#30446f);padding:0 32px;flex-shrink:0;">
      <div style="max-width:1600px;margin:0 auto;height:64px;display:flex;align-items:center;justify-content:space-between;gap:20px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="font-family:'Poppins',sans-serif;font-size:18px;font-weight:800;color:#fff;">
            MakerLab<span style="color:#f5c842;">3D</span>
          </div>
          <span style="font-size:12px;color:rgba(255,255,255,.45);">|</span>
          <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.75);">🏟️ ${arenaNome}</div>
        </div>
        <div style="display:flex;align-items:center;gap:20px;">
          ${tempo ? `<div style="font-size:12px;color:rgba(255,255,255,.55);">⏱ ${tempo} min</div>` : ''}
          <div style="text-align:right;">
            <div style="font-size:10px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Código</div>
            <div style="font-family:'Courier New',monospace;font-size:22px;font-weight:900;letter-spacing:6px;color:#f5c842;">${codigo}</div>
          </div>
          <button onclick="fecharSalaEspera()"
            style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;">
            ✕ Fechar
          </button>
        </div>
      </div>
    </div>

    <!-- STATUS BAR -->
    <div style="background:#fff;border-bottom:1px solid #e0ddd8;padding:10px 32px;display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <div style="width:8px;height:8px;border-radius:50%;background:#27ae60;animation:pulse-dot 1.5s ease-in-out infinite;"></div>
      <span style="font-size:13px;font-weight:600;color:#27ae60;">Aguardando jogadores...</span>
      <span style="font-size:13px;color:#bbb;margin-left:4px;" id="sala-contador-txt">0 participantes</span>
      <div style="margin-left:auto;font-size:12px;color:#888;">
        Modo: <strong>${modo === 'times' ? `Times — ${times.length} equipes` : 'Individual'}</strong>
      </div>
    </div>

    <!-- ÁREA PRINCIPAL -->
    <div style="flex:1;overflow-y:auto;padding:28px 32px;" id="sala-area">
      ${modo === 'individual' ? renderSalaIndividual([]) : renderSalaTimes(times)}
    </div>

    <!-- FOOTER -->
    <div style="background:#fff;border-top:2px solid #e0ddd8;padding:18px 32px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div id="sala-info-rodape" style="font-size:13px;color:#aaa;">Aguardando jogadores entrarem com o código <strong style="color:#23314d;font-family:'Courier New',monospace;letter-spacing:2px;">${codigo}</strong></div>
      <button id="btn-comecar-jogo" onclick="comecarJogo('${jogoId}')"
        style="padding:14px 44px;border:none;border-radius:10px;background:linear-gradient(135deg,#27ae60,#2ecc71);color:#fff;font-size:15px;font-weight:800;cursor:pointer;letter-spacing:.3px;box-shadow:0 4px 20px rgba(39,174,96,.35);transition:transform .1s;">
        ▶ Começar Jogo
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Listener real-time do jogo
  jogoListener = onSnapshot(doc(db, 'jogos', jogoId), (snap) => {
    if (!snap.exists()) return;
    atualizarSalaEspera(snap.data(), modo);
  });
}

function renderSalaIndividual(jogadores) {
  if (jogadores.length === 0) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:#bbb;padding:60px 0;">
        <div style="font-size:56px;">🎮</div>
        <div style="font-size:15px;font-weight:600;">Nenhum jogador conectado ainda</div>
        <div style="font-size:13px;">Os participantes devem acessar o jogo e digitar o código</div>
      </div>`;
  }
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
      ${jogadores.map((j, i) => `
        <div class="jogador-chip">
          <div class="chip-avatar" style="background:#e8f0fe;color:#3b82f6;">${(j.nome||'?').charAt(0).toUpperCase()}</div>
          <span>${j.nome || 'Jogador ' + (i+1)}</span>
        </div>`).join('')}
    </div>`;
}

function renderSalaTimes(times) {
  const cols = times.length <= 4 ? times.length : Math.ceil(times.length / 2);
  return `
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px;align-items:start;">
      ${times.map((t) => `
        <div style="border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07);">
          <div style="background:${t.cor};padding:14px 18px;display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:15px;font-weight:800;color:#fff;">${t.nome}</div>
            <div id="badge-${slugify(t.nome)}" style="background:rgba(255,255,255,.25);color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">0</div>
          </div>
          <div id="time-lista-${slugify(t.nome)}"
            style="background:${t.bg};min-height:120px;padding:12px;display:flex;flex-direction:column;gap:8px;">
            <div style="text-align:center;color:#bbb;font-size:12px;padding:20px 0;">Aguardando jogadores...</div>
          </div>
        </div>`).join('')}
    </div>`;
}

function slugify(nome) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'-').toLowerCase();
}

function atualizarSalaEspera(data, modo) {
  if (modo === 'individual') {
    const jogadores = data.jogadores || [];
    const area = document.getElementById('sala-area');
    if (area) area.innerHTML = renderSalaIndividual(jogadores);
    const txt = document.getElementById('sala-contador-txt');
    if (txt) txt.textContent = jogadores.length + (jogadores.length === 1 ? ' participante' : ' participantes');
  } else {
    const times = data.times || [];
    let total = 0;
    times.forEach(t => {
      const slug = slugify(t.nome);
      const lista = document.getElementById('time-lista-' + slug);
      const badge = document.getElementById('badge-' + slug);
      const jogs  = t.jogadores || [];
      total += jogs.length;
      if (lista) {
        lista.innerHTML = jogs.length === 0
          ? '<div style="text-align:center;color:#bbb;font-size:12px;padding:20px 0;">Aguardando jogadores...</div>'
          : jogs.map(j => `
              <div class="jogador-chip">
                <div class="chip-avatar" style="background:${t.cor}22;color:${t.cor};">${(j.nome||'?').charAt(0).toUpperCase()}</div>
                <span>${j.nome || '—'}</span>
              </div>`).join('');
      }
      if (badge) badge.textContent = jogs.length;
    });
    const txt = document.getElementById('sala-contador-txt');
    if (txt) txt.textContent = total + (total === 1 ? ' participante' : ' participantes');
  }
}

window.fecharSalaEspera = function() {
  if (jogoListener) { jogoListener(); jogoListener = null; }
  document.getElementById('sala-espera')?.remove();
};

window.comecarJogo = async function(jogoId) {
  const btn = document.getElementById('btn-comecar-jogo');
  if (btn) { btn.disabled = true; btn.textContent = 'Iniciando...'; }
  try {
    await setDoc(doc(db, 'jogos', jogoId), { status: 'em_andamento', iniciado_em: new Date().toISOString() }, { merge: true });
    showToast('🎮 Jogo iniciado!', 'success');
    // TODO: redirecionar para tela de jogo em andamento
  } catch(err) {
    showToast('Erro ao iniciar jogo: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '▶ Começar Jogo'; }
  }
};

// ── DELETAR ───────────────────────────────────────────────────────────────────
window.deletarArena = function(id) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:28px;max-width:380px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
      <div style="font-size:18px;font-weight:700;margin-bottom:8px;color:#e74c3c;">⚠️ Remover Arena</div>
      <p style="font-size:14px;color:#555;margin-bottom:20px;">Tem certeza que deseja remover esta arena? Esta ação não pode ser desfeita.</p>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="this.closest('div[style]').remove()"
          style="padding:8px 18px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;">Cancelar</button>
        <button onclick="confirmarDeletarArena('${id}',this)"
          style="padding:8px 18px;border:none;border-radius:8px;background:#e74c3c;color:#fff;font-weight:700;cursor:pointer;font-size:13px;">Remover</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.confirmarDeletarArena = async function(id, btn) {
  btn.closest('div[style]').remove();
  try {
    await deleteDoc(doc(db, 'arenas', id));
    arenaAtiva = null;
    showToast('Arena removida.', '');
    document.getElementById('arena-content').innerHTML = `
      <div class="arena-empty-state">
        <div class="icon">🏟️</div>
        <p>Selecione uma arena ou crie uma nova.</p>
      </div>`;
    await carregarArenas();
  } catch(err) {
    showToast('Erro ao remover: ' + err.message, 'error');
  }
};
