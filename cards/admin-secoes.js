// admin-secoes.js — Gestão de Seções

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

let secaoAtiva   = null;
let secaoTrilhas = [];
let todasTrilhasDB = {};

const NIVEIS_PADRAO = [
  { nome: 'Explorador Iniciante', pontos: 0    },
  { nome: 'Curioso Digital',      pontos: 100  },
  { nome: 'Aprendiz Maker',       pontos: 250  },
  { nome: 'Construtor Criativo',  pontos: 500  },
  { nome: 'Inventor em Ação',     pontos: 900  },
  { nome: 'Programador Maker',    pontos: 1400 },
  { nome: 'Engenheiro Criativo',  pontos: 2000 },
  { nome: 'Inovador Maker',       pontos: 2700 },
  { nome: 'Mentor Maker',         pontos: 3500 },
  { nome: 'Mestre Maker',         pontos: 4500 },
];

// ---- TOAST ----
function showToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ---- CARREGAR TODAS AS TRILHAS (para o seletor) ----
async function carregarTodasTrilhas() {
  try {
    const snap = await getDocs(collection(db, 'trilhas'));
    todasTrilhasDB = {};
    snap.forEach(docSnap => {
      todasTrilhasDB[docSnap.id] = docSnap.data();
    });
  } catch(e) { console.error(e); }
}

// ---- LISTAR SEÇÕES ----
window.listarSecoes = async function() {
  const listEl = document.getElementById('secao-list');
  try {
    await carregarTodasTrilhas();
    const snap = await getDocs(collection(db, 'secoes'));
    listEl.innerHTML = '';

    if (snap.empty) {
      listEl.innerHTML = '<div class="list-loading">Nenhuma seção ainda.<br>Clique em + Nova Seção.</div>';
      return;
    }

    const docs = [];
    snap.forEach(d => docs.push(d));
    docs.sort((a, b) => {
      const nA = a.data().ordem ?? 99;
      const nB = b.data().ordem ?? 99;
      return nA - nB;
    });

    docs.forEach(docSnap => {
      const d    = docSnap.data();
      const item = document.createElement('div');
      item.className  = 'card-item';
      item.dataset.id = docSnap.id;
      item.innerHTML  = `
        <div class="card-item-num">SEÇÃO ${docSnap.id}</div>
        <div class="card-item-nome">${d.nome || 'Sem nome'}</div>
        <div class="card-item-nivel">${(d.trilhas || []).length} trilha(s)</div>
        <span class="card-item-status ${d.publicado ? 'status-publicado' : 'status-rascunho'}">
          ${d.publicado ? 'Publicada' : 'Rascunho'}
        </span>
      `;
      item.onclick = () => abrirSecao(docSnap.id, d, item);
      listEl.appendChild(item);
    });
  } catch(err) {
    listEl.innerHTML = `<div class="list-loading" style="color:#e74c3c;">Erro: ${err.message}</div>`;
  }
};

// ---- NOVA SEÇÃO ----
window.novaSecao = function() {
  secaoAtiva   = null;
  secaoTrilhas = [];
  document.querySelectorAll('#secao-list .card-item').forEach(i => i.classList.remove('active'));
  renderSecaoForm(null, {});
};

// ---- ABRIR SEÇÃO ----
function abrirSecao(id, data, el) {
  secaoAtiva   = id;
  secaoTrilhas = data.trilhas ? [...data.trilhas] : [];
  document.querySelectorAll('#secao-list .card-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  renderSecaoForm(id, data);
}

// ---- RENDER FORM ----
function renderSecaoForm(id, d) {
  document.getElementById('secao-content').innerHTML = `
    <div class="form-header">
      <div class="form-title">${id ? 'Editar Seção' : 'Nova Seção'}</div>
      <div class="form-actions">
        ${id ? `<button class="btn-deletar" onclick="deletarSecao('${id}')">🗑 Deletar</button>` : ''}
        <button class="btn-salvar"   onclick="salvarSecao(false)">💾 Salvar Rascunho</button>
        <button class="btn-publicar" onclick="salvarSecao(true)">🚀 Publicar</button>
      </div>
    </div>

    <!-- Identificação -->
    <div class="form-section">
      <div class="section-title">Identificação</div>
      <div class="form-grid">
        <div class="form-group">
          <label>ID da Seção *</label>
          <input type="text" id="s-id" value="${id || ''}" placeholder="ex: modulo-1"
            ${id ? 'readonly style="opacity:0.5"' : ''}>
          <span class="helper-text">Sem espaços, use hífen. Ex: modulo-eletronika</span>
        </div>
        <div class="form-group">
          <label>Nome da Seção *</label>
          <input type="text" id="s-nome" value="${d.nome || ''}" placeholder="Ex: Módulo 1 — Eletrônica">
        </div>
        <div class="form-group">
          <label>Ordem de exibição</label>
          <input type="number" id="s-ordem" value="${d.ordem ?? ''}" placeholder="1, 2, 3...">
          <span class="helper-text">Define a posição da seção na listagem.</span>
        </div>
        <div class="form-group">
          <label>🏟️ Arena MakerLab 3D</label>
          <select id="s-arena-ativa">
            <option value="true"  ${d.arena_ativa !== false ? 'selected' : ''}>Ativada</option>
            <option value="false" ${d.arena_ativa === false  ? 'selected' : ''}>Desativada</option>
          </select>
          <span class="helper-text">Se ativada, alunos e professores desta seção verão o Jogo de Arena no portal.</span>
        </div>
        <div class="form-group full">
          <label>Descrição</label>
          <textarea id="s-descricao" placeholder="Descreva brevemente esta seção..." style="min-height:80px;">${d.descricao || ''}</textarea>
        </div>
      </div>
    </div>

    <!-- Níveis de Gamificação -->
    <div class="form-section">
      <div class="section-title">Níveis de Gamificação</div>
      <span class="helper-text" style="display:block;margin-bottom:16px;">
        Personalize os nomes e a pontuação mínima de cada nível. O Nível 1 sempre começa em 0 pts.
      </span>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${NIVEIS_PADRAO.map((n, i) => `
          <div style="display:grid;grid-template-columns:28px 1fr 120px;gap:8px;align-items:center;">
            <span style="font-size:12px;font-weight:700;color:#aaa;text-align:right;">${i+1}</span>
            <input type="text" id="s-nivel-nome-${i}" value="${(d.niveis && d.niveis[i]) ? d.niveis[i].nome : n.nome}"
              placeholder="Nome do nível ${i+1}"
              style="padding:8px 10px;border:1px solid #ddd;border-radius:7px;font-size:13px;font-family:inherit;">
            <div style="display:flex;align-items:center;gap:4px;">
              <input type="number" id="s-nivel-pts-${i}" value="${(d.niveis && d.niveis[i]) ? d.niveis[i].pontos : n.pontos}"
                min="0" ${i===0 ? 'readonly style="opacity:.5;background:#f5f5f5;"' : ''}
                style="padding:8px 10px;border:1px solid #ddd;border-radius:7px;font-size:13px;width:100%;font-family:inherit;">
              <span style="font-size:11px;color:#aaa;white-space:nowrap;">pts</span>
            </div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Trilhas da Seção -->
    <div class="form-section">
      <div class="section-title">Trilhas da Seção</div>
      <span class="helper-text" style="display:block; margin-bottom:14px;">
        Adicione trilhas e use ▲▼ para definir a ordem em que serão exibidas.
      </span>

      <div class="trilha-add-row">
        <select id="secao-trilha-select" class="vg-select">
          <option value="">Selecione uma trilha para adicionar...</option>
        </select>
        <button class="vg-btn-add" onclick="adicionarTrilhaSecao()">Adicionar</button>
      </div>

      <div class="trilha-cards-list" id="secao-trilhas-list"></div>
    </div>
  `;

  popularSelectTrilhas();
  renderSecaoTrilhasList();
}

// ---- POPULAR SELECT COM TODAS AS TRILHAS ----
function popularSelectTrilhas() {
  const sel = document.getElementById('secao-trilha-select');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);

  const sorted = Object.entries(todasTrilhasDB).sort((a, b) => {
    const nA = isNaN(a[0]) ? a[0] : Number(a[0]);
    const nB = isNaN(b[0]) ? b[0] : Number(b[0]);
    if (typeof nA === 'number' && typeof nB === 'number') return nA - nB;
    return String(nA).localeCompare(String(nB));
  });

  sorted.forEach(([id, d]) => {
    if (secaoTrilhas.includes(id)) return; // já adicionada
    const opt = document.createElement('option');
    opt.value       = id;
    opt.textContent = `${id} — ${d.nome || id} (${(d.cards || []).length} cards)`;
    sel.appendChild(opt);
  });
}

// ---- ADICIONAR TRILHA À SEÇÃO ----
window.adicionarTrilhaSecao = function() {
  const sel = document.getElementById('secao-trilha-select');
  if (!sel || !sel.value) { showToast('⚠️ Selecione uma trilha.', 'error'); return; }
  secaoTrilhas.push(sel.value);
  sel.value = '';
  popularSelectTrilhas();
  renderSecaoTrilhasList();
};

// ---- MOVER TRILHA ----
window.moverTrilhaSecao = function(idx, dir) {
  const dest = idx + dir;
  if (dest < 0 || dest >= secaoTrilhas.length) return;
  [secaoTrilhas[idx], secaoTrilhas[dest]] = [secaoTrilhas[dest], secaoTrilhas[idx]];
  renderSecaoTrilhasList();
};

// ---- REMOVER TRILHA DA SEÇÃO ----
window.removerTrilhaSecao = function(idx) {
  secaoTrilhas.splice(idx, 1);
  popularSelectTrilhas();
  renderSecaoTrilhasList();
};

// ---- RENDERIZAR LISTA DE TRILHAS ----
function renderSecaoTrilhasList() {
  const list = document.getElementById('secao-trilhas-list');
  if (!list) return;

  if (secaoTrilhas.length === 0) {
    list.innerHTML = '<div class="trilha-empty">Nenhuma trilha adicionada ainda.</div>';
    return;
  }

  list.innerHTML = '';
  secaoTrilhas.forEach((trilhaId, i) => {
    const d     = todasTrilhasDB[trilhaId];
    const nome  = d ? (d.nome || trilhaId) : trilhaId;
    const total = d ? (d.cards || []).length : 0;
    const desc  = d ? (d.descricao || '') : '';

    const item = document.createElement('div');
    item.className = 'trilha-card-item';
    item.innerHTML = `
      <div class="trilha-card-ordem">${i + 1}</div>
      <div class="trilha-card-info">
        <div class="trilha-card-meta">TRILHA ${trilhaId} · ${total} card(s)</div>
        <div class="trilha-card-nome">${nome}</div>
        ${desc ? `<div class="trilha-card-meta" style="margin-top:2px;font-style:italic;">${desc}</div>` : ''}
      </div>
      <div class="trilha-card-actions">
        <button class="trilha-btn-up"   onclick="moverTrilhaSecao(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button>
        <button class="trilha-btn-down" onclick="moverTrilhaSecao(${i},  1)" ${i === secaoTrilhas.length - 1 ? 'disabled' : ''} title="Descer">▼</button>
        <button class="trilha-btn-rem"  onclick="removerTrilhaSecao(${i})" title="Remover">×</button>
      </div>
    `;
    list.appendChild(item);
  });
}

// ---- SALVAR SEÇÃO ----
window.salvarSecao = async function(publicar) {
  const id = secaoAtiva || document.getElementById('s-id')?.value?.trim().toLowerCase().replace(/\s+/g, '-');
  if (!id) { showToast('⚠️ Informe o ID da seção', 'error'); return; }
  const nome = document.getElementById('s-nome')?.value?.trim();
  if (!nome) { showToast('⚠️ Informe o nome da seção', 'error'); return; }

  const niveis = NIVEIS_PADRAO.map((n, i) => ({
    nome:   document.getElementById(`s-nivel-nome-${i}`)?.value?.trim() || n.nome,
    pontos: i === 0 ? 0 : (parseInt(document.getElementById(`s-nivel-pts-${i}`)?.value) || n.pontos)
  }));

  const data = {
    nome,
    descricao:   document.getElementById('s-descricao')?.value?.trim() || '',
    ordem:       parseInt(document.getElementById('s-ordem')?.value) || 0,
    arena_ativa: document.getElementById('s-arena-ativa')?.value !== 'false',
    niveis,
    trilhas:     secaoTrilhas,
    publicado:   publicar,
    atualizado_em: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'secoes', id), data);
    secaoAtiva = id;
    showToast(publicar ? '🚀 Seção publicada!' : '💾 Rascunho salvo!', 'success');
    await listarSecoes();
    document.querySelectorAll('#secao-list .card-item').forEach(item => {
      if (item.dataset.id === id) item.classList.add('active');
    });
  } catch(err) {
    showToast(`❌ Erro: ${err.message}`, 'error');
  }
};

// ---- DELETAR SEÇÃO ----
window.deletarSecao = async function(id) {
  if (!confirm(`Deletar a seção "${id}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await deleteDoc(doc(db, 'secoes', id));
    secaoAtiva   = null;
    secaoTrilhas = [];
    showToast('🗑 Seção deletada.', 'success');
    await listarSecoes();
    document.getElementById('secao-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <p>Selecione uma seção na lista<br>ou crie uma nova para começar.</p>
      </div>`;
  } catch(err) {
    showToast(`❌ Erro: ${err.message}`, 'error');
  }
};
