// admin-tipos.js — Gestão de Tipos de Card

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

function showToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

let _secaoFiltro  = '';
let _secoesCache  = [];

// ---- LISTAR TIPOS ----
window.listarTipos = async function(secaoId) {
  if (secaoId !== undefined) _secaoFiltro = secaoId;

  const container = document.getElementById('tipos-list');
  if (!container) return;
  container.innerHTML = '<div class="list-loading">Carregando...</div>';

  try {
    const [tiposSnap, secoesSnap] = await Promise.all([
      getDocs(collection(db, 'tipos_card')),
      getDocs(collection(db, 'secoes'))
    ]);

    const tipos = [];
    tiposSnap.forEach(d => tipos.push({ id: d.id, ...d.data() }));
    tipos.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    _secoesCache = [];
    secoesSnap.forEach(d => _secoesCache.push({ id: d.id, ...d.data() }));
    _secoesCache.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    // Atualiza estado global com todos os tipos ativos
    window._tiposCard = tipos.filter(t => t.ativo !== false);

    // Filtra por seção se selecionada
    const tiposFiltrados = _secaoFiltro
      ? tipos.filter(t => t.secao_id === _secaoFiltro)
      : tipos;

    const secaoOpts = _secoesCache.map(s =>
      `<option value="${s.id}" ${_secaoFiltro === s.id ? 'selected' : ''}>${s.nome || s.id}</option>`
    ).join('');

    container.innerHTML = `
      <!-- Seletor de Seção -->
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;
        background:#fff; border:1.5px solid #DDD8CC; border-radius:12px; padding:14px 18px;">
        <label style="font-size:13px; font-weight:700; color:#5F6480; white-space:nowrap; flex-shrink:0;">
          📚 Seção:
        </label>
        <select id="tipos-secao-sel" onchange="listarTipos(this.value)"
          style="flex:1; padding:8px 12px; border:1.5px solid #DDD8CC; border-radius:9px;
            font-size:13px; background:#fff; outline:none; cursor:pointer; color:#2F3447;">
          <option value="">Todas as seções</option>
          ${secaoOpts}
        </select>
      </div>

      <!-- Lista de tipos -->
      <div id="tipos-tabela-wrap">
        ${renderTiposHTML(tiposFiltrados)}
      </div>`;

  } catch(e) {
    container.innerHTML = `<div style="color:#e74c3c; padding:20px; font-size:13px;">Erro: ${e.message}</div>`;
  }
};

function renderTiposHTML(tipos) {
  if (tipos.length === 0) {
    const msg = _secaoFiltro
      ? 'Nenhum tipo cadastrado para esta seção.'
      : 'Nenhum tipo cadastrado ainda.';
    return `
      <div style="text-align:center; padding:48px 20px; background:#fff; border:1.5px solid #DDD8CC; border-radius:14px;">
        <div style="font-size:40px; margin-bottom:12px;">🏷️</div>
        <div style="font-size:14px; font-weight:600; color:#5F6480; margin-bottom:6px;">${msg}</div>
        ${!_secaoFiltro ? `
          <div style="font-size:13px; color:#aaa; margin-bottom:20px;">
            Selecione uma seção e clique em <strong>+ Novo Tipo</strong>, ou importe os padrões.
          </div>
          <button onclick="importarTiposPadrao()"
            style="padding:10px 22px; background:#16a085; color:#fff; border:none; border-radius:9px;
              font-size:13px; font-weight:700; cursor:pointer;">
            📥 Importar Padrões
          </button>` : ''}
      </div>`;
  }

  const secoesMap = Object.fromEntries(_secoesCache.map(s => [s.id, s.nome || s.id]));

  return `
    <div style="background:#fff; border:1.5px solid #DDD8CC; border-radius:14px; overflow:hidden;">
      <div style="display:grid; grid-template-columns:60px 1fr ${_secaoFiltro ? '' : '140px '}80px 90px 110px;
        align-items:center; padding:10px 16px; background:#F5F3EE; border-bottom:1px solid #DDD8CC; gap:12px;
        font-size:11px; font-weight:700; color:#8B9BB4; text-transform:uppercase; letter-spacing:.5px;">
        <div>Ordem</div>
        <div>Nome</div>
        ${_secaoFiltro ? '' : '<div>Seção</div>'}
        <div style="text-align:center;">Ícone</div>
        <div>Status</div>
        <div style="text-align:right;">Ações</div>
      </div>
      ${tipos.map((t, i) => `
        <div style="display:grid; grid-template-columns:60px 1fr ${_secaoFiltro ? '' : '140px '}80px 90px 110px;
          align-items:center; padding:13px 16px; gap:12px;
          border-bottom:${i < tipos.length - 1 ? '1px solid #F0EDE6' : 'none'};
          background:${i % 2 === 0 ? '#fff' : '#fafaf8'};">
          <div style="display:flex; gap:4px; align-items:center;">
            <button onclick="moverTipo('${t.id}', -1)"
              style="width:24px;height:24px;border:none;background:#f0ede6;border-radius:6px;cursor:pointer;font-size:11px;
                ${i === 0 ? 'opacity:.3;pointer-events:none;' : ''}">▲</button>
            <button onclick="moverTipo('${t.id}', 1)"
              style="width:24px;height:24px;border:none;background:#f0ede6;border-radius:6px;cursor:pointer;font-size:11px;
                ${i === tipos.length - 1 ? 'opacity:.3;pointer-events:none;' : ''}">▼</button>
          </div>
          <div style="font-size:14px; font-weight:700; color:#2F3447;">${t.nome || '—'}</div>
          ${_secaoFiltro ? '' : `
            <div style="font-size:12px; color:#8B9BB4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${t.secao_id ? (secoesMap[t.secao_id] || t.secao_id) : '<span style="color:#ccc;">—</span>'}
            </div>`}
          <div style="font-size:24px; text-align:center;">${t.icone || '📌'}</div>
          <div>
            <span style="font-size:11px; padding:3px 10px; border-radius:20px; font-weight:700;
              background:${t.ativo !== false ? '#e8f8f5' : '#f5f5f5'};
              color:${t.ativo !== false ? '#16a085' : '#aaa'};">
              ${t.ativo !== false ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          <div style="display:flex; gap:6px; justify-content:flex-end;">
            <button onclick="editarTipo('${t.id}')"
              style="padding:6px 12px; font-size:12px; font-weight:600; background:#f5f3ee; color:#5F6480;
                border:1.5px solid #DDD8CC; border-radius:8px; cursor:pointer;">✏️</button>
            <button onclick="deletarTipo('${t.id}', '${(t.nome || '').replace(/'/g, "\\'")}')"
              style="padding:6px 10px; font-size:12px; background:#fff0f0; color:#e74c3c;
                border:1.5px solid #fdd; border-radius:8px; cursor:pointer;">🗑</button>
          </div>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:10px; font-size:12px; color:#aaa; text-align:right;">
      ${tipos.length} tipo(s)${_secaoFiltro ? ' nesta seção' : ' no total'}
    </div>`;
}

// ---- NOVO / EDITAR TIPO ----
window.novoTipo = function() {
  abrirModalTipo(null, { secao_id: _secaoFiltro });
};

window.editarTipo = async function(id) {
  try {
    const snap = await getDocs(collection(db, 'tipos_card'));
    let tipo = null;
    snap.forEach(d => { if (d.id === id) tipo = { id: d.id, ...d.data() }; });
    if (tipo) abrirModalTipo(id, tipo);
  } catch(e) { showToast('Erro ao carregar tipo.', 'error'); }
};

async function abrirModalTipo(id, tipo) {
  document.getElementById('modal-tipo')?.remove();
  const t = tipo || {};

  // Garante seções carregadas
  if (_secoesCache.length === 0) {
    try {
      const snap = await getDocs(collection(db, 'secoes'));
      snap.forEach(d => _secoesCache.push({ id: d.id, ...d.data() }));
      _secoesCache.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    } catch(_) {}
  }

  const proximaOrdem = window._tiposCard.length > 0
    ? Math.max(...window._tiposCard.map(x => x.ordem || 0)) + 1
    : 1;

  const secaoOpts = _secoesCache.map(s =>
    `<option value="${s.id}" ${(t.secao_id || '') === s.id ? 'selected' : ''}>${s.nome || s.id}</option>`
  ).join('');

  const modal = document.createElement('div');
  modal.id = 'modal-tipo';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:18px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.3);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px 14px;border-bottom:1px solid #F0EDE6;">
        <div style="font-size:16px;font-weight:800;color:#2F3447;">${id ? '✏️ Editar Tipo' : '🏷️ Novo Tipo'}</div>
        <button onclick="document.getElementById('modal-tipo').remove()"
          style="width:32px;height:32px;border-radius:50%;border:none;background:#f5f3ee;font-size:18px;cursor:pointer;color:#555;">×</button>
      </div>
      <div style="padding:20px 22px; display:flex; flex-direction:column; gap:14px;">

        <!-- Seção -->
        <div>
          <label style="font-size:12px;font-weight:700;color:#5F6480;display:block;margin-bottom:5px;">
            📚 Seção *
          </label>
          <select id="mt-secao"
            style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid #DDD8CC;
              border-radius:9px;font-size:14px;background:#fff;outline:none;color:#2F3447;">
            <option value="">Selecione uma seção...</option>
            ${secaoOpts}
          </select>
        </div>

        <!-- Nome + Ícone -->
        <div style="display:grid; grid-template-columns:1fr 90px; gap:12px; align-items:end;">
          <div>
            <label style="font-size:12px;font-weight:700;color:#5F6480;display:block;margin-bottom:5px;">Nome do Tipo *</label>
            <input id="mt-nome" type="text" value="${t.nome || ''}" placeholder="Ex: Programação, Projeto, Tutorial..."
              style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid #DDD8CC;border-radius:9px;font-size:14px;outline:none;">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#5F6480;display:block;margin-bottom:5px;">Ícone</label>
            <input id="mt-icone" type="text" value="${t.icone || ''}" placeholder="🎯"
              style="width:100%;box-sizing:border-box;padding:9px 8px;border:1.5px solid #DDD8CC;
                border-radius:9px;font-size:22px;text-align:center;outline:none;">
          </div>
        </div>

        <!-- Ordem + Status -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px;font-weight:700;color:#5F6480;display:block;margin-bottom:5px;">Ordem de exibição</label>
            <input id="mt-ordem" type="number" value="${t.ordem ?? proximaOrdem}" min="1"
              style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid #DDD8CC;border-radius:9px;font-size:14px;outline:none;">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#5F6480;display:block;margin-bottom:5px;">Status</label>
            <select id="mt-ativo"
              style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid #DDD8CC;
                border-radius:9px;font-size:14px;background:#fff;outline:none;">
              <option value="true"  ${t.ativo !== false ? 'selected' : ''}>Ativo</option>
              <option value="false" ${t.ativo === false  ? 'selected' : ''}>Inativo</option>
            </select>
          </div>
        </div>

      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;padding:14px 22px;border-top:1px solid #F0EDE6;">
        <button onclick="document.getElementById('modal-tipo').remove()"
          style="padding:9px 18px;border:1.5px solid #DDD8CC;background:#fff;border-radius:9px;
            font-size:13px;font-weight:600;cursor:pointer;color:#5F6480;">
          Cancelar
        </button>
        <button onclick="salvarTipo('${id || ''}')"
          style="padding:9px 20px;background:#16a085;color:#fff;border:none;border-radius:9px;
            font-size:13px;font-weight:700;cursor:pointer;">
          💾 Salvar
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.getElementById('mt-nome')?.focus();
}

// ---- SALVAR ----
window.salvarTipo = async function(tipoId) {
  const secao_id = document.getElementById('mt-secao')?.value || '';
  const nome     = document.getElementById('mt-nome')?.value?.trim();
  const icone    = document.getElementById('mt-icone')?.value?.trim();
  const ordem    = parseInt(document.getElementById('mt-ordem')?.value) || 1;
  const ativo    = document.getElementById('mt-ativo')?.value !== 'false';

  if (!secao_id) { alert('Selecione a seção do tipo.'); return; }
  if (!nome)     { alert('Informe o nome do tipo.'); return; }

  const duplicado = (window._tiposCard || []).find(
    t => t.nome.toLowerCase() === nome.toLowerCase() && t.id !== (tipoId || null)
  );
  if (duplicado) { alert(`Já existe um tipo com o nome "${nome}".`); return; }

  const docId = tipoId && tipoId !== '' ? tipoId : `tipo-${Date.now()}`;
  try {
    await setDoc(doc(db, 'tipos_card', docId), { nome, icone: icone || '📌', ordem, ativo, secao_id });
    document.getElementById('modal-tipo')?.remove();
    showToast('Tipo salvo com sucesso!', 'success');
    await window.listarTipos();
    if (window._recarregarTiposCard) window._recarregarTiposCard();
  } catch(e) { showToast('Erro ao salvar: ' + e.message, 'error'); }
};

// ---- DELETAR ----
window.deletarTipo = async function(id, nome) {
  try {
    const cardsSnap = await getDocs(collection(db, 'cards'));
    const emUso = [];
    cardsSnap.forEach(d => { if (d.data().tipo === nome) emUso.push(d.data().nome || d.id); });
    if (emUso.length > 0) {
      alert(
        `Este tipo está em uso por ${emUso.length} card(s):\n` +
        emUso.slice(0, 5).join('\n') +
        (emUso.length > 5 ? `\n...e mais ${emUso.length - 5}` : '') +
        '\n\nAltere o tipo desses cards antes de excluir.'
      );
      return;
    }
  } catch(_) { /* permite deletar se falhar a verificação */ }

  if (!confirm(`Excluir o tipo "${nome}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await deleteDoc(doc(db, 'tipos_card', id));
    showToast('Tipo excluído.', 'success');
    await window.listarTipos();
    if (window._recarregarTiposCard) window._recarregarTiposCard();
  } catch(e) { showToast('Erro ao excluir: ' + e.message, 'error'); }
};

// ---- REORDENAR (dentro da mesma seção) ----
window.moverTipo = async function(id, direcao) {
  const tipoAtual = (window._tiposCard || []).find(t => t.id === id);
  if (!tipoAtual) return;

  // Filtra pela mesma seção e mesma visão atual
  const lista = _secaoFiltro
    ? (window._tiposCard || []).filter(t => t.secao_id === _secaoFiltro)
    : [...(window._tiposCard || [])];

  const idx     = lista.findIndex(t => t.id === id);
  const novoIdx = idx + direcao;
  if (idx < 0 || novoIdx < 0 || novoIdx >= lista.length) return;

  const ordemA = lista[idx].ordem;
  const ordemB = lista[novoIdx].ordem;
  try {
    await Promise.all([
      setDoc(doc(db, 'tipos_card', lista[idx].id),     { ...lista[idx],     ordem: ordemB }),
      setDoc(doc(db, 'tipos_card', lista[novoIdx].id), { ...lista[novoIdx], ordem: ordemA }),
    ]);
    await window.listarTipos();
    if (window._recarregarTiposCard) window._recarregarTiposCard();
  } catch(e) { showToast('Erro ao reordenar.', 'error'); }
};

// ---- IMPORTAR PADRÕES ----
window.importarTiposPadrao = async function() {
  if (_secoesCache.length === 0) {
    alert('Cadastre ao menos uma seção antes de importar os padrões.');
    return;
  }
  const secao_id = _secoesCache[0].id;
  if (!confirm(`Importar os tipos padrão na seção "${_secoesCache[0].nome || secao_id}"?`)) return;
  const TIPOS_PADRAO = [
    { nome: 'Desafio',             icone: '🎯', ordem: 1, ativo: true, secao_id },
    { nome: 'Componente',          icone: '🔩', ordem: 2, ativo: true, secao_id },
    { nome: 'Conexão com o Mundo', icone: '🌍', ordem: 3, ativo: true, secao_id },
  ];
  try {
    await Promise.all(TIPOS_PADRAO.map((t, i) =>
      setDoc(doc(db, 'tipos_card', `tipo-padrao-${i + 1}`), t)
    ));
    showToast('Tipos padrão importados!', 'success');
    await window.listarTipos();
    if (window._recarregarTiposCard) window._recarregarTiposCard();
  } catch(e) { showToast('Erro: ' + e.message, 'error'); }
};
