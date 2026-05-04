// admin-trilhas.js — Gestão de Trilhas de Aprendizagem

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAndgQiwxpe6wyCF8aa5NqqdMuwLJfMIMM",
  authDomain: "makerlab3d-4e455.firebaseapp.com",
  projectId: "makerlab3d-4e455",
  storageBucket: "makerlab3d-4e455.firebasestorage.app",
  messagingSenderId: "495457985822",
  appId: "1:495457985822:web:05efcebeed970ecb82150f"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

let trilhaAtiva  = null;
let trilhaCards  = []; // array de IDs em ordem
let todosCardsDB = {}; // cache id -> data

// ---- TAB SWITCH ----
window.switchTab = function(tab) {
  ['cards','trilhas','secoes','tipos','usuarios','escolas','config'].forEach(t => {
    const view = document.getElementById('view-' + t);
    const btn  = document.getElementById('tab-' + t);
    if (view) view.style.display = t === tab ? '' : 'none';
    if (btn)  btn.classList.toggle('active', t === tab);
  });
  if (tab === 'trilhas')  { listarTrilhas(); carregarTodosCards(); }
  if (tab === 'secoes')   { listarSecoes(); }
  if (tab === 'tipos')    { if (window.listarTipos) window.listarTipos(); }
  if (tab === 'usuarios') { carregarUsuarios(); }
  if (tab === 'escolas')  { carregarEscolas(); }
  if (tab === 'config')   { if (window.carregarConfig) window.carregarConfig(); if (window.carregarComponentes) window.carregarComponentes(); }
};

// ---- TOAST (reutiliza do admin.js) ----
function showToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ---- CARREGAR TODOS OS CARDS (para o seletor) ----
async function carregarTodosCards() {
  try {
    const snap = await getDocs(collection(db, 'cards'));
    todosCardsDB = {};
    snap.forEach(docSnap => {
      todosCardsDB[docSnap.id] = docSnap.data();
    });
  } catch(e) { console.error(e); }
}

// ---- LISTAR TRILHAS ----
async function listarTrilhas() {
  const listEl = document.getElementById('trilha-list');
  try {
    const snap = await getDocs(collection(db, 'trilhas'));
    listEl.innerHTML = '';

    if (snap.empty) {
      listEl.innerHTML = '<div class="list-loading">Nenhuma trilha ainda.<br>Clique em + Nova Trilha.</div>';
      return;
    }

    const docs = [];
    snap.forEach(d => docs.push(d));
    docs.sort((a, b) => {
      const idA = isNaN(a.id) ? a.id : Number(a.id);
      const idB = isNaN(b.id) ? b.id : Number(b.id);
      if (typeof idA === 'number' && typeof idB === 'number') return idA - idB;
      return String(idA).localeCompare(String(idB));
    });

    docs.forEach(docSnap => {
      const d    = docSnap.data();
      const item = document.createElement('div');
      item.className  = 'card-item';
      item.dataset.id = docSnap.id;
      item.innerHTML  = `
        <div class="card-item-num">TRILHA ${docSnap.id}</div>
        <div class="card-item-nome">${d.nome || 'Sem nome'}</div>
        <div class="card-item-nivel">${(d.cards || []).length} card(s)</div>
        <span class="card-item-status ${d.publicado ? 'status-publicado' : 'status-rascunho'}">
          ${d.publicado ? 'Publicada' : 'Rascunho'}
        </span>
      `;
      item.onclick = () => abrirTrilha(docSnap.id, d, item);
      listEl.appendChild(item);
    });
  } catch(err) {
    listEl.innerHTML = `<div class="list-loading" style="color:#e74c3c;">Erro: ${err.message}</div>`;
  }
}

// ---- NOVA TRILHA ----
window.novaTrilha = function() {
  trilhaAtiva = null;
  trilhaCards = [];
  document.querySelectorAll('#trilha-list .card-item').forEach(i => i.classList.remove('active'));
  renderTrilhaForm(null, {});
};

// ---- ABRIR TRILHA ----
function abrirTrilha(id, data, el) {
  trilhaAtiva = id;
  trilhaCards = data.cards ? [...data.cards] : [];
  document.querySelectorAll('#trilha-list .card-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTrilhaForm(id, data);
}

// ---- RENDER FORM ----
function renderTrilhaForm(id, d) {
  const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', 'trilha.html');
  const trilhaUrl = id ? `${baseUrl}?id=${id}` : '—';

  document.getElementById('trilha-content').innerHTML = `
    <div class="form-header">
      <div class="form-title">${id ? 'Editar Trilha' : 'Nova Trilha'}</div>
      <div class="form-actions">
        ${id ? `<button class="btn-deletar" onclick="deletarTrilha('${id}')">🗑 Deletar</button>` : ''}
        <button class="btn-salvar"   onclick="salvarTrilha(false)">💾 Salvar Rascunho</button>
        <button class="btn-publicar" onclick="salvarTrilha(true)">🚀 Publicar</button>
      </div>
    </div>

    <!-- Identificação -->
    <div class="form-section">
      <div class="section-title">Identificação</div>
      <div class="form-grid">
        <div class="form-group">
          <label>ID da Trilha *</label>
          <input type="text" id="t-id" value="${id || ''}" placeholder="ex: eletronika-basica"
            ${id ? 'readonly style="opacity:0.5"' : ''}>
          <span class="helper-text">Sem espaços, use hífen. Ex: eletronica-basica</span>
        </div>
        <div class="form-group">
          <label>Nome da Trilha *</label>
          <input type="text" id="t-nome" value="${d.nome || ''}" placeholder="Ex: Eletrônica Básica">
        </div>
        <div class="form-group full">
          <label>Descrição</label>
          <textarea id="t-descricao" placeholder="Descreva brevemente a trilha..." style="min-height:80px;">${d.descricao || ''}</textarea>
        </div>
        <div class="form-group full">
          <label>Objetivo</label>
          <textarea id="t-objetivo" placeholder="O que o aluno vai aprender ao concluir esta trilha?" style="min-height:80px;">${d.objetivo || ''}</textarea>
        </div>
        <div class="form-group full">
          <label>Vídeo de Apresentação (YouTube)</label>
          <input type="url" id="t-video" value="${d.video_url || ''}" placeholder="https://www.youtube.com/watch?v=...">
        </div>
      </div>
    </div>

    <!-- Cards da Trilha -->
    <div class="form-section">
      <div class="section-title">Cards da Trilha</div>
      <span class="helper-text" style="display:block; margin-bottom:14px;">Adicione cards e arraste para definir a ordem. O aluno seguirá essa sequência.</span>

      <!-- Seletor de cards -->
      <div class="trilha-add-row">
        <select id="trilha-card-select" class="vg-select">
          <option value="">Selecione um card para adicionar...</option>
        </select>
        <button class="vg-btn-add" onclick="adicionarCardTrilha()">Adicionar</button>
      </div>

      <!-- Lista ordenável -->
      <div class="trilha-cards-list" id="trilha-cards-list"></div>
    </div>

    ${id ? `
    <div class="form-section">
      <div class="section-title">Link da Trilha</div>
      <div class="card-link-box">
        <span class="card-link-url">${trilhaUrl}</span>
        <button class="btn-copiar" onclick="copiarLinkTrilha('${trilhaUrl}')">Copiar</button>
      </div>
    </div>` : ''}
  `;

  popularSelectCards();
  renderTrilhaCardsList();
}

// ---- POPULAR SELECT COM TODOS OS CARDS ----
function popularSelectCards() {
  const sel = document.getElementById('trilha-card-select');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);

  const sorted = Object.entries(todosCardsDB).sort((a, b) => (a[1].numero || 0) - (b[1].numero || 0));
  sorted.forEach(([id, d]) => {
    if (trilhaCards.includes(id)) return; // já adicionado
    const opt = document.createElement('option');
    opt.value       = id;
    opt.textContent = `${(d.tipo || 'Card')} ${String(d.numero||0).padStart(2,'0')} — ${d.nome || id}`;
    sel.appendChild(opt);
  });
}

// ---- ADICIONAR CARD À TRILHA ----
window.adicionarCardTrilha = function() {
  const sel = document.getElementById('trilha-card-select');
  if (!sel || !sel.value) { showToast('⚠️ Selecione um card.', 'error'); return; }
  trilhaCards.push(sel.value);
  sel.value = '';
  popularSelectCards();
  renderTrilhaCardsList();
};

// ---- RENDERIZAR LISTA ORDENÁVEL ----
function renderTrilhaCardsList() {
  const list = document.getElementById('trilha-cards-list');
  if (!list) return;

  if (trilhaCards.length === 0) {
    list.innerHTML = '<div class="trilha-empty">Nenhum card adicionado ainda.</div>';
    return;
  }

  list.innerHTML = '';
  trilhaCards.forEach((cardId, i) => {
    const d     = todosCardsDB[cardId];
    const nome  = d ? (d.nome  || cardId) : cardId;
    const tipo  = d ? (d.tipo  || 'Card') : 'Card';
    const num   = d ? String(d.numero || 0).padStart(2, '0') : '—';
    const tema  = d ? (d.tema  || '') : '';

    const item = document.createElement('div');
    item.className       = 'trilha-card-item';
    item.dataset.index   = i;
    item.draggable       = true;
    item.innerHTML = `
      <div class="trilha-card-drag">⠿</div>
      <div class="trilha-card-ordem">${i + 1}</div>
      <div class="trilha-card-info">
        <div class="trilha-card-meta">${tipo} ${num}${tema ? ' · ' + tema : ''}</div>
        <div class="trilha-card-nome">${nome}</div>
      </div>
      <div class="trilha-card-actions">
        <button class="trilha-btn-up"   onclick="moverCard(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button>
        <button class="trilha-btn-down" onclick="moverCard(${i},  1)" ${i === trilhaCards.length - 1 ? 'disabled' : ''} title="Descer">▼</button>
        <button class="trilha-btn-rem"  onclick="removerCardTrilha(${i})" title="Remover">×</button>
      </div>
    `;

    // Drag & Drop
    item.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', i);
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', e => { e.preventDefault(); item.classList.add('drag-over'); });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const from = parseInt(e.dataTransfer.getData('text/plain'));
      const to   = parseInt(item.dataset.index);
      if (from !== to) {
        const moved = trilhaCards.splice(from, 1)[0];
        trilhaCards.splice(to, 0, moved);
        popularSelectCards();
        renderTrilhaCardsList();
      }
    });

    list.appendChild(item);
  });
}

// ---- MOVER CARD (botões ▲▼) ----
window.moverCard = function(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= trilhaCards.length) return;
  [trilhaCards[i], trilhaCards[j]] = [trilhaCards[j], trilhaCards[i]];
  renderTrilhaCardsList();
};

// ---- REMOVER CARD ----
window.removerCardTrilha = function(i) {
  trilhaCards.splice(i, 1);
  popularSelectCards();
  renderTrilhaCardsList();
};

// ---- SALVAR TRILHA ----
window.salvarTrilha = async function(publicar) {
  const id = trilhaAtiva || document.getElementById('t-id')?.value?.trim().toLowerCase().replace(/\s+/g, '-');
  if (!id) { showToast('⚠️ Informe o ID da trilha', 'error'); return; }
  const nome = document.getElementById('t-nome')?.value?.trim();
  if (!nome) { showToast('⚠️ Informe o nome da trilha', 'error'); return; }

  const data = {
    nome,
    descricao:  document.getElementById('t-descricao')?.value?.trim() || '',
    objetivo:   document.getElementById('t-objetivo')?.value?.trim()  || '',
    video_url:  document.getElementById('t-video')?.value?.trim()     || '',
    cards:      trilhaCards,
    publicado:  publicar,
    atualizado_em: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'trilhas', id), data);
    trilhaAtiva = id;
    showToast(publicar ? '🚀 Trilha publicada!' : '💾 Rascunho salvo!', 'success');
    await listarTrilhas();
    document.querySelectorAll('#trilha-list .card-item').forEach(item => {
      if (item.dataset.id === id) item.classList.add('active');
    });
  } catch(err) {
    showToast(`❌ Erro: ${err.message}`, 'error');
  }
};

// ---- DELETAR TRILHA ----
window.deletarTrilha = async function(id) {
  if (!confirm(`Deletar a trilha "${id}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await deleteDoc(doc(db, 'trilhas', id));
    showToast('🗑 Trilha deletada', '');
    trilhaAtiva = null;
    document.getElementById('trilha-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🗺️</div>
        <p>Trilha deletada.<br>Selecione outra ou crie uma nova.</p>
      </div>`;
    await listarTrilhas();
  } catch(err) {
    showToast(`❌ Erro: ${err.message}`, 'error');
  }
};

// ---- COPIAR LINK ----
window.copiarLinkTrilha = function(url) {
  navigator.clipboard.writeText(url).then(() => showToast('🔗 Link copiado!', 'success'));
};

// Atualiza regras do Firestore para aceitar trilhas
// (collection 'trilhas' precisa de allow read/write)

// ---- ABRIR ABA PELO PORTAL ----
(function() {
  const aba = localStorage.getItem('admin_aba_destino');
  if (aba) {
    localStorage.removeItem('admin_aba_destino');
    setTimeout(() => {
      if (typeof window.switchTab === 'function') window.switchTab(aba);
    }, 800);
  }
})();
