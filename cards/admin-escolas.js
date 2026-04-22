// admin-escolas.js — Cadastro de Escolas

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, setDoc, deleteDoc, getDoc, query, orderBy, where
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

let escolaAtiva = null;

function showToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

function gerarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length: 8}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ---- LISTAR ESCOLAS ----
window.carregarEscolas = async function() {
  const listEl = document.getElementById('escolas-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="list-loading">Carregando escolas...</div>';

  try {
    const snap = await getDocs(collection(db, 'escolas'));
    listEl.innerHTML = '';

    if (snap.empty) {
      listEl.innerHTML = '<div class="list-loading">Nenhuma escola cadastrada.</div>';
      return;
    }

    const docs = [];
    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (a.id_escola || 0) - (b.id_escola || 0));

    docs.forEach(e => {
      const item = document.createElement('div');
      item.className  = 'card-item';
      item.dataset.id = e.id;
      item.innerHTML  = `
        <div class="card-item-num">ESCOLA ${e.id_escola || '—'}</div>
        <div class="card-item-nome">${e.nome || 'Sem nome'}</div>
        <div class="card-item-nivel">${e.cidade || ''}${e.uf ? ' · ' + e.uf : ''}</div>
        <span class="card-item-status ${e.ativo ? 'status-publicado' : 'status-rascunho'}">
          ${e.ativo ? 'Ativa' : 'Inativa'}
        </span>
      `;
      item.onclick = () => abrirEscola(e, item);
      listEl.appendChild(item);
    });
  } catch(err) {
    listEl.innerHTML = `<div class="list-loading" style="color:#e74c3c;">Erro: ${err.message}</div>`;
  }
};

function abrirEscola(e, el) {
  escolaAtiva = e.id;
  document.querySelectorAll('#escolas-list .card-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  renderEscolaForm(e.id, e);
}

// Garante que o botão salvar sempre use o id correto
window.getEscolaAtiva = function() { return escolaAtiva; };

window.novaEscola = async function() {
  escolaAtiva = null;
  document.querySelectorAll('#escolas-list .card-item').forEach(i => i.classList.remove('active'));

  // Gera próximo ID sequencial
  let proximoId = 1;
  try {
    const snap = await getDocs(collection(db, 'escolas'));
    snap.forEach(d => {
      const n = d.data().id_escola || 0;
      if (n >= proximoId) proximoId = n + 1;
    });
  } catch(e) {}

  renderEscolaForm(null, { id_escola: proximoId, codigo_acesso: gerarCodigo(), ativo: true });
};

// ---- RENDER FORM ----
async function renderEscolaForm(id, e = {}) {
  const content = document.getElementById('escolas-content');
  if (!content) return;

  // Busca seções para o select
  let secaoOptions = '<option value="">Selecione uma seção...</option>';
  try {
    const snapSec = await getDocs(collection(db, 'secoes'));
    const secoes = [];
    snapSec.forEach(d => secoes.push({ id: d.id, ...d.data() }));
    secoes.sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
    secaoOptions += secoes
      .map(s => `<option value="${s.id}" ${e.secao_id === s.id ? 'selected' : ''}>${s.nome || s.id}</option>`)
      .join('');
  } catch(_) {}

  const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const ufOptions = ufs.map(u => `<option value="${u}" ${e.uf === u ? 'selected' : ''}>${u}</option>`).join('');

  content.innerHTML = `
    <div class="form-header" style="position:relative; top:0; margin:0 -32px 20px; flex-direction:column; gap:0; align-items:stretch; padding:0; background:var(--cinza-claro); border-bottom:1px solid var(--cinza-medio);">
      ${id ? `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:12px 24px 10px; border-bottom:1px solid var(--cinza-medio); background:var(--off-white);">
        ${window._perfilAtual === 'gestor' ? `
        <div style="position:relative;" id="escola-config-wrap">
          <button onclick="toggleConfigEscola()" style="padding:5px 12px;border:1px solid #ccc;border-radius:7px;background:#f5f5f5;color:#555;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;">
            ⚙ Config
          </button>
          <div id="escola-config-menu" style="display:none;position:absolute;left:0;top:calc(100% + 4px);background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:100;min-width:220px;overflow:hidden;">
            <button onclick="toggleConfigEscola();abrirLimparHistorico('${id}','professor')" style="display:block;width:100%;padding:10px 16px;border:none;background:#fff;text-align:left;font-size:13px;cursor:pointer;color:#333;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">🗂 Limpar Histórico Professores</button>
            <button onclick="toggleConfigEscola();abrirLimparHistorico('${id}','aluno')" style="display:block;width:100%;padding:10px 16px;border:none;background:#fff;text-align:left;font-size:13px;cursor:pointer;color:#333;border-top:1px solid #f0f0f0;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">🗂 Limpar Histórico Alunos</button>
            <button onclick="toggleConfigEscola();abrirLimparMeuHistorico()" style="display:block;width:100%;padding:10px 16px;border:none;background:#fff;text-align:left;font-size:13px;cursor:pointer;color:#333;border-top:1px solid #f0f0f0;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">🧹 Limpar Meu Histórico</button>
          </div>
        </div>
        ` : '<div></div>'}
        <div style="display:flex;gap:8px;">
          <button class="btn-convidar" onclick="abrirModalConvite('${id}')">📩 Convidar Professor</button>
          <button class="btn-convidar" style="background:#8e44ad;" onclick="abrirModalConviteAluno('${id}')">🎒 Convidar Aluno</button>
        </div>
      </div>` : ''}
      <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 24px;">
        <div class="form-title" style="margin:0;">${id ? `Escola ${e.id_escola || ''}` : 'Nova Escola'}</div>
        <div style="display:flex; gap:8px;">
          ${id ? `<button class="btn-deletar" onclick="deletarEscola('${id}')">🗑 Remover</button>` : ''}
          <button class="btn-publicar" onclick="salvarEscola(getEscolaAtiva())">💾 Salvar</button>
        </div>
      </div>
    </div>

    <!-- DADOS GERAIS -->
    <div class="form-section">
      <div class="section-title">Dados Gerais</div>
      <div class="form-grid">
        <input type="hidden" id="e-id-escola" value="${e.id_escola || ''}">
        <div class="form-group">
          <label>Status</label>
          <select id="e-ativo">
            <option value="true"  ${e.ativo !== false ? 'selected' : ''}>Ativa</option>
            <option value="false" ${e.ativo === false  ? 'selected' : ''}>Inativa</option>
          </select>
        </div>
        <div class="form-group">
          <label>Código de Acesso</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="e-codigo" value="${e.codigo_acesso || ''}" readonly style="font-family:monospace; font-weight:700; letter-spacing:2px; flex:1;">
            <button class="vg-btn-add" onclick="regenerarCodigo()" title="Gerar novo código">🔄</button>
          </div>
          <span class="helper-text">Compartilhe este código com a escola para acesso ao portal.</span>
        </div>
        <div class="form-group full">
          <label>Nome da Escola *</label>
          <input type="text" id="e-nome" value="${e.nome || ''}" placeholder="Ex: EMEF João da Silva">
        </div>
        <div class="form-group full">
          <label>Seção</label>
          <select id="e-secao">
            ${secaoOptions}
          </select>
          <span class="helper-text">Seção de trilhas que esta escola irá utilizar. Deixe em branco para utilizar todas as trilhas.</span>
        </div>

      </div>
    </div>

    <!-- LOCALIZAÇÃO -->
    <div class="form-section">
      <div class="section-title">Localização</div>
      <div class="form-grid">
        <div class="form-group full">
          <label>Endereço</label>
          <input type="text" id="e-endereco" value="${e.endereco || ''}" placeholder="Rua, número">
        </div>
        <div class="form-group">
          <label>Bairro</label>
          <input type="text" id="e-bairro" value="${e.bairro || ''}" placeholder="Bairro">
        </div>
        <div class="form-group">
          <label>Cidade *</label>
          <input type="text" id="e-cidade" value="${e.cidade || ''}" placeholder="Cidade">
        </div>
        <div class="form-group">
          <label>UF</label>
          <select id="e-uf">
            <option value="">Selecione</option>
            ${ufOptions}
          </select>
        </div>
        <div class="form-group">
          <label>CEP</label>
          <input type="text" id="e-cep" value="${e.cep || ''}" placeholder="00000-000" maxlength="9">
        </div>
      </div>
    </div>

    <!-- CONTATO -->
    <div class="form-section">
      <div class="section-title">Contato</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Responsável / Contato</label>
          <input type="text" id="e-contato" value="${e.contato || ''}" placeholder="Nome do responsável">
        </div>
        <div class="form-group">
          <label>Telefone</label>
          <input type="text" id="e-telefone" value="${e.telefone || ''}" placeholder="(00) 00000-0000">
        </div>
        <div class="form-group full">
          <label>E-mail</label>
          <input type="email" id="e-email" value="${e.email || ''}" placeholder="escola@email.com">
        </div>
      </div>
    </div>

    <!-- CLASSIFICAÇÃO -->
    <div class="form-section">
      <div class="section-title">Classificação</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Dependência Administrativa</label>
          <select id="e-dep-admin">
            <option value="">Selecione</option>
            ${['Municipal','Estadual','Federal','Privada'].map(d =>
              `<option value="${d}" ${e.dependencia_administrativa === d ? 'selected' : ''}>${d}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    </div>

    <!-- NÍVEIS DE ENSINO -->
    <div class="form-section">
      <div class="section-title">Níveis de Ensino</div>
      <div class="form-grid">
        <div class="form-group full">
          <div class="checkboxes-grid">
            ${[
              ['e-ef1',  'ensino_fundamental_I',  'Ensino Fundamental I'],
              ['e-ef2',  'ensino_fundamental_II', 'Ensino Fundamental II'],
              ['e-em',   'ensino_medio',          'Ensino Médio'],
              ['e-eja',  'eja',                   'EJA'],
            ].map(([id, key, label]) => `
              <label class="checkbox-label">
                <input type="checkbox" id="${id}" ${e[key] ? 'checked' : ''}>
                ${label}
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- ESTRUTURA MAKER -->
    <div class="form-section">
      <div class="section-title">Estrutura Maker</div>
      <div class="form-grid">
        <div class="form-group full">
          <label class="checkbox-label" style="margin-bottom:12px;">
            <input type="checkbox" id="e-espaco-maker" ${e.possui_espaco_maker ? 'checked' : ''}>
            Possui Espaço Maker
          </label>
          <label>Descrição do Espaço Maker</label>
          <textarea id="e-desc-espaco" placeholder="Descreva o espaço maker da escola..." style="min-height:80px;">${e.descricao_espaco_maker || ''}</textarea>
        </div>
      </div>
    </div>

    <!-- EQUIPE -->
    <div class="form-section">
      <div class="section-title">Equipe</div>
      <div class="form-grid">
        <div class="form-group full">
          <div class="checkboxes-grid">
            <label class="checkbox-label">
              <input type="checkbox" id="e-med-tec" ${e.possui_mediador_tecnico ? 'checked' : ''}>
              Possui Mediador Técnico
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="e-med-ped" ${e.possui_mediador_pedagogico ? 'checked' : ''}>
              Possui Mediador Pedagógico
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- GESTÃO DO PROJETO -->
    <div class="form-section">
      <div class="section-title">Gestão do Projeto</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Data de Implantação</label>
          <input type="date" id="e-data-impl" value="${e.data_implantacao || ''}">
        </div>
        <div class="form-group">
          <label>Status do Projeto</label>
          <select id="e-status-proj">
            <option value="">Selecione</option>
            ${[['implantacao','Implantação'],['ativo','Ativo'],['pausado','Pausado'],['finalizado','Finalizado']].map(([v,l]) =>
              `<option value="${v}" ${e.status_projeto === v ? 'selected' : ''}>${l}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    </div>

    <!-- OBSERVAÇÕES -->
    <div class="form-section">
      <div class="section-title">Observações</div>
      <div class="form-group">
        <textarea id="e-obs" placeholder="Observações gerais sobre a escola ou o projeto..." style="min-height:80px;">${e.observacoes || ''}</textarea>
      </div>
    </div>

    ${id ? `
    <!-- PROFESSORES -->
    <div class="form-section">
      <div class="section-title-row">
        <span class="section-title">👨‍🏫 Professores</span>
        <button class="btn-convidar" onclick="abrirModalConvite('${id}')">📩 Convidar Professor</button>
      </div>
      <div id="professores-list-${id}" class="professores-list">
        <div class="list-loading">Carregando professores...</div>
      </div>
    </div>

    <!-- ALUNOS -->
    <div class="form-section">
      <div class="section-title-row">
        <span class="section-title">🎒 Alunos</span>
        <button class="btn-convidar" style="background:#8e44ad;" onclick="abrirModalConviteAluno('${id}')">📩 Convidar Aluno</button>
      </div>
      <div id="alunos-list-${id}" class="professores-list">
        <div class="list-loading">Carregando alunos...</div>
      </div>
    </div>

    <!-- TURMAS -->
    <div class="form-section">
      <div class="section-title-row">
        <span class="section-title">🏫 Turmas</span>
        <button class="btn-convidar" style="background:#16a085;" onclick="abrirModalTurma('${id}', null)">+ Nova Turma</button>
      </div>
      <div id="turmas-list-${id}" class="professores-list">
        <div class="list-loading">Carregando turmas...</div>
      </div>
    </div>` : ''}
  `;

  if (id) { carregarProfessores(id); carregarAlunos(id); carregarTurmas(id); }
}

// ---- REGENERAR CÓDIGO ----
window.regenerarCodigo = function() {
  const input = document.getElementById('e-codigo');
  if (input) input.value = gerarCodigo();
};

// ---- SALVAR ESCOLA ----
window.salvarEscola = async function(id) {
  const nome = document.getElementById('e-nome')?.value?.trim();
  if (!nome) { showToast('⚠️ Informe o nome da escola.', 'error'); return; }

  const docId = (id && id !== 'null' && id !== '') ? id : (escolaAtiva || `escola-${Date.now()}`);

  const data = {
    id_escola:                  parseInt(document.getElementById('e-id-escola')?.value) || 1,
    nome,
    codigo_acesso:              document.getElementById('e-codigo')?.value?.trim()     || gerarCodigo(),
    ativo:                      document.getElementById('e-ativo')?.value === 'true',
    endereco:                   document.getElementById('e-endereco')?.value?.trim()   || '',
    bairro:                     document.getElementById('e-bairro')?.value?.trim()     || '',
    cidade:                     document.getElementById('e-cidade')?.value?.trim()     || '',
    uf:                         document.getElementById('e-uf')?.value                || '',
    cep:                        document.getElementById('e-cep')?.value?.trim()        || '',
    contato:                    document.getElementById('e-contato')?.value?.trim()    || '',
    telefone:                   document.getElementById('e-telefone')?.value?.trim()   || '',
    email:                      document.getElementById('e-email')?.value?.trim()      || '',
    dependencia_administrativa: document.getElementById('e-dep-admin')?.value          || '',
    ensino_fundamental_I:       document.getElementById('e-ef1')?.checked              || false,
    ensino_fundamental_II:      document.getElementById('e-ef2')?.checked              || false,
    ensino_medio:               document.getElementById('e-em')?.checked               || false,
    eja:                        document.getElementById('e-eja')?.checked              || false,
    possui_espaco_maker:        document.getElementById('e-espaco-maker')?.checked     || false,
    descricao_espaco_maker:     document.getElementById('e-desc-espaco')?.value?.trim()|| '',
    possui_mediador_tecnico:    document.getElementById('e-med-tec')?.checked          || false,
    possui_mediador_pedagogico: document.getElementById('e-med-ped')?.checked          || false,
    data_implantacao:           document.getElementById('e-data-impl')?.value          || '',
    status_projeto:             document.getElementById('e-status-proj')?.value        || '',
    secao_id:                   document.getElementById('e-secao')?.value              || '',
    observacoes:                document.getElementById('e-obs')?.value?.trim()        || '',
    atualizado_em:              new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'escolas', docId), data);
    escolaAtiva = docId;
    showToast('✅ Escola salva!', 'success');
    await carregarEscolas();
    document.querySelectorAll('#escolas-list .card-item').forEach(item => {
      if (item.dataset.id === docId) item.classList.add('active');
    });
  } catch(err) {
    showToast('❌ Erro: ' + err.message, 'error');
  }
};

// ---- DELETAR ESCOLA ----
window.deletarEscola = async function(id) {
  if (!confirm('Remover esta escola? Esta ação não pode ser desfeita.')) return;
  try {
    await deleteDoc(doc(db, 'escolas', id));
    showToast('🗑 Escola removida.', '');
    escolaAtiva = null;
    document.getElementById('escolas-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏫</div>
        <p>Escola removida.</p>
      </div>`;
    await carregarEscolas();
  } catch(err) {
    showToast('❌ Erro: ' + err.message, 'error');
  }
};

// ==============================
// ---- PROFESSORES ----
// ==============================

let professorEditando = null;

window.carregarProfessores = async function(escolaId) {
  const listEl = document.getElementById(`professores-list-${escolaId}`);
  if (!listEl) return;
  listEl.innerHTML = '<div class="list-loading" style="font-size:12px;">Carregando...</div>';

  try {
    const snap = await getDocs(collection(db, 'usuarios'));
    const profs = [];
    snap.forEach(d => {
      const u = d.data();
      if (u.perfil === 'professor' && u.escola_id === escolaId) {
        profs.push({ id: d.id, ...u });
      }
    });

    if (profs.length === 0) {
      listEl.innerHTML = '<div class="prof-empty">Nenhum professor cadastrado ainda.</div>';
      return;
    }

    profs.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    listEl.innerHTML = '';
    profs.forEach(p => {
      const row = document.createElement('div');
      row.className = 'prof-row';
      row.innerHTML = `
        <div class="prof-info">
          <div class="prof-nome">${p.nome || '—'}</div>
          <div class="prof-email">${p.email || ''}</div>
        </div>
        <div class="prof-actions">
          <button class="prof-btn-edit" onclick="editarProfessor('${p.id}', '${escolaId}')">✏️ Editar</button>
          <button class="prof-btn-del"  onclick="deletarProfessor('${p.id}', '${escolaId}')">🗑</button>
        </div>
      `;
      listEl.appendChild(row);
    });
  } catch(err) {
    listEl.innerHTML = `<div class="list-loading" style="color:#e74c3c; font-size:12px;">Erro: ${err.message}</div>`;
  }
};

window.novoProfessor = function(escolaId) {
  professorEditando = null;
  mostrarModalProfessor(escolaId, null);
};

window.editarProfessor = async function(uid, escolaId) {
  professorEditando = uid;
  const snap = await getDoc(doc(db, 'usuarios', uid));
  if (snap.exists()) mostrarModalProfessor(escolaId, { id: uid, ...snap.data() });
};

function mostrarModalProfessor(escolaId, p) {
  document.getElementById('modal-professor')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-professor';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box modal-box-lg">
      <div class="modal-header">
        <div class="modal-title">${p ? 'Editar Professor' : 'Novo Professor'}</div>
        <button class="modal-close" onclick="document.getElementById('modal-professor').remove()">×</button>
      </div>
      <div class="modal-body modal-scroll">

        <!-- Dados Pessoais -->
        <div class="modal-secao-titulo">Dados Pessoais</div>
        <div class="modal-grid">
          <div class="form-group full">
            <label>Nome *</label>
            <input type="text" id="p-nome" value="${p?.nome || ''}" placeholder="Nome completo">
          </div>
          <div class="form-group">
            <label>E-mail *</label>
            <input type="email" id="p-email" value="${p?.email || ''}" placeholder="professor@email.com"
              ${p ? 'readonly style="opacity:0.5"' : ''}>
          </div>
          <div class="form-group">
            <label>Telefone *</label>
            <input type="text" id="p-telefone" value="${p?.telefone || ''}" placeholder="(00) 00000-0000">
          </div>
          ${!p ? `
          <div class="form-group full">
            <label>Senha *</label>
            <input type="password" id="p-senha" placeholder="Mínimo 6 caracteres">
          </div>` : ''}
          <div class="form-group">
            <label>Status</label>
            <select id="p-ativo">
              <option value="true"  ${p?.ativo !== false ? 'selected' : ''}>Ativo</option>
              <option value="false" ${p?.ativo === false  ? 'selected' : ''}>Inativo</option>
            </select>
          </div>
        </div>

        <!-- Atuação -->
        <div class="modal-secao-titulo" style="margin-top:18px;">Atuação</div>
        <div class="modal-grid">
          <div class="form-group">
            <label>Tipo de Vínculo *</label>
            <select id="p-vinculo">
              <option value="">Selecione</option>
              <option value="efetivo"    ${p?.tipo_vinculo === 'efetivo'    ? 'selected' : ''}>Efetivo</option>
              <option value="contratado" ${p?.tipo_vinculo === 'contratado' ? 'selected' : ''}>Contratado</option>
              <option value="temporario" ${p?.tipo_vinculo === 'temporario' ? 'selected' : ''}>Temporário</option>
            </select>
          </div>
          <div class="form-group">
            <label>Área de Atuação *</label>
            <input type="text" id="p-area" value="${p?.area_atuacao || ''}" placeholder="Matemática, Ciências, Maker, Português">
          </div>
          <div class="form-group full">
            <label>Formação *</label>
            <input type="text" id="p-formacao" value="${p?.formacao || ''}" placeholder="Ex: Licenciatura em Computação">
          </div>
        </div>

        <!-- Experiência Maker -->
        <div class="modal-secao-titulo" style="margin-top:18px;">Experiência Maker</div>
        <div class="modal-grid">
          <div class="form-group full">
            <label>Nível de Experiência *</label>
            <select id="p-nivel">
              <option value="">Selecione</option>
              <option value="iniciante"     ${p?.nivel_experiencia_maker === 'iniciante'     ? 'selected' : ''}>Iniciante</option>
              <option value="intermediario" ${p?.nivel_experiencia_maker === 'intermediario' ? 'selected' : ''}>Intermediário</option>
              <option value="avancado"      ${p?.nivel_experiencia_maker === 'avancado'      ? 'selected' : ''}>Avançado</option>
            </select>
          </div>
          <div class="form-group full">
            <label>Funções</label>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
              <label class="checkbox-label">
                <input type="checkbox" id="p-form-maker" ${p?.possui_formacao_maker   ? 'checked' : ''}> Formação Maker
              </label>
              <label class="checkbox-label">
                <input type="checkbox" id="p-med-tec"    ${p?.mediador_tecnico        ? 'checked' : ''}> Mediador Técnico
              </label>
              <label class="checkbox-label">
                <input type="checkbox" id="p-med-ped"    ${p?.mediador_pedagogico     ? 'checked' : ''}> Mediador Pedagógico
              </label>
            </div>
          </div>
        </div>

        <!-- Observações (interno) -->
        <div class="modal-secao-titulo" style="margin-top:18px;">Observações Internas</div>
        <div class="form-group">
          <textarea id="p-obs" placeholder="Anotações internas sobre o professor..." style="min-height:70px;">${p?.observacoes || ''}</textarea>
        </div>

      </div>
      <div class="modal-footer">
        <button class="btn-salvar" onclick="document.getElementById('modal-professor').remove()">Cancelar</button>
        <button class="btn-publicar" onclick="salvarProfessor('${escolaId}', '${p?.id || ''}')">💾 Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('p-nome')?.focus();
}

window.salvarProfessor = async function(escolaId, uid) {
  const nome     = document.getElementById('p-nome')?.value?.trim();
  const email    = document.getElementById('p-email')?.value?.trim();
  const senha    = document.getElementById('p-senha')?.value;
  const telefone = document.getElementById('p-telefone')?.value?.trim();
  const vinculo  = document.getElementById('p-vinculo')?.value;
  const area     = document.getElementById('p-area')?.value?.trim();
  const formacao = document.getElementById('p-formacao')?.value?.trim();
  const nivel    = document.getElementById('p-nivel')?.value;
  const ativo    = document.getElementById('p-ativo')?.value !== 'false';

  if (!nome)     { showToast('⚠️ Informe o nome.', 'error'); return; }
  if (!email)    { showToast('⚠️ Informe o e-mail.', 'error'); return; }
  if (!telefone) { showToast('⚠️ Informe o telefone.', 'error'); return; }
  if (!vinculo)  { showToast('⚠️ Selecione o tipo de vínculo.', 'error'); return; }
  if (!area)     { showToast('⚠️ Informe a área de atuação.', 'error'); return; }
  if (!formacao) { showToast('⚠️ Informe a formação.', 'error'); return; }
  if (!nivel)    { showToast('⚠️ Selecione o nível de experiência.', 'error'); return; }

  const dados = {
    nome, telefone, ativo,
    tipo_vinculo:            vinculo,
    area_atuacao:            area,
    formacao,
    nivel_experiencia_maker: nivel,
    possui_formacao_maker:   document.getElementById('p-form-maker')?.checked || false,
    mediador_tecnico:        document.getElementById('p-med-tec')?.checked    || false,
    mediador_pedagogico:     document.getElementById('p-med-ped')?.checked    || false,
    observacoes:             document.getElementById('p-obs')?.value?.trim()  || '',
    escola_id:               escolaId,
    atualizado_em:           new Date().toISOString()
  };

  try {
    if (uid && uid !== '') {
      await setDoc(doc(db, 'usuarios', uid), dados, { merge: true });
      showToast('✅ Professor atualizado!', 'success');
    } else {
      if (!senha || senha.length < 6) { showToast('⚠️ Senha com mínimo 6 caracteres.', 'error'); return; }
      const { getAuth, createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js");
      const auth = getAuth();
      const cred = await createUserWithEmailAndPassword(auth, email, senha);

      // Gera id_professor sequencial
      let maxId = 0;
      const snap = await getDocs(collection(db, 'usuarios'));
      snap.forEach(d => { const n = d.data().id_professor || 0; if (n > maxId) maxId = n; });

      await setDoc(doc(db, 'usuarios', cred.user.uid), {
        ...dados, email,
        id_professor: maxId + 1,
        perfil:       'professor',
        criado_em:    new Date().toISOString()
      });
      showToast('✅ Professor cadastrado!', 'success');
    }
    document.getElementById('modal-professor')?.remove();
    await carregarProfessores(escolaId);
  } catch(err) {
    const msgs = {
      'auth/email-already-in-use': 'E-mail já cadastrado.',
      'auth/weak-password':        'Senha muito fraca.',
    };
    showToast('❌ ' + (msgs[err.code] || err.message), 'error');
  }
};

window.deletarProfessor = async function(uid, escolaId) {
  if (!confirm('Remover este professor da escola?')) return;
  try {
    await deleteDoc(doc(db, 'usuarios', uid));
    showToast('🗑 Professor removido.', '');
    await carregarProfessores(escolaId);
  } catch(err) {
    showToast('❌ Erro: ' + err.message, 'error');
  }
};

// ---- MODAL CONVITE ----
window.abrirModalConvite = function(escolaId) {
  document.getElementById('modal-convite')?.remove();

  const base = window.location.origin + window.location.pathname.replace('admin.html', 'cadastro-professor.html');
  const url  = `${base}?escola=${escolaId}`;

  const modal = document.createElement('div');
  modal.id = 'modal-convite';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">📩 Convidar Professor</div>
        <button class="modal-close" onclick="document.getElementById('modal-convite').remove()">×</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px; color:#5F6480; margin-bottom:12px;">
          Compartilhe o link abaixo com o professor. Ele precisará do <strong>Código de Acesso</strong> da escola para se cadastrar.
        </p>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="text" value="${url}" readonly
            style="flex:1; font-size:11px; background:#F5F3EE; border:1.5px solid #DDD8CC; border-radius:8px; padding:9px 12px; font-family:monospace; color:#2F3447;">
          <button class="vg-btn-add" onclick="navigator.clipboard.writeText('${url}').then(()=>showToast('🔗 Link copiado!','success'))">
            Copiar
          </button>
        </div>
      </div>
      <div class="modal-footer" style="gap:10px;">
        <button class="btn-salvar" onclick="document.getElementById('modal-convite').remove()">Fechar</button>
        <button class="btn-whatsapp" onclick="convidarWhatsApp('${escolaId}'); document.getElementById('modal-convite').remove();">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Enviar por WhatsApp
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

// ---- CONVIDAR PROFESSOR ----
window.copiarLinkConvite = function(escolaId) {
  const base = window.location.origin + window.location.pathname.replace('admin.html', 'cadastro-professor.html');
  const url  = `${base}?escola=${escolaId}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('📩 Link copiado!', 'success');
  });
};

window.convidarWhatsApp = async function(escolaId) {
  const base = window.location.origin + window.location.pathname.replace('admin.html', 'cadastro-professor.html');
  const url  = `${base}?escola=${escolaId}`;

  // Busca nome da escola
  let nomeEscola = 'a escola';
  try {
    const snap = await getDoc(doc(db, 'escolas', escolaId));
    if (snap.exists()) nomeEscola = snap.data().nome || nomeEscola;
  } catch(e) {}

  const msg = encodeURIComponent(
    `🎓 *MakerLab 3D — Convite de Cadastro*

` +
    `Você foi convidado(a) para se cadastrar como professor(a) em *${nomeEscola}*.

` +
    `Acesse o link abaixo, informe o *Código de Acesso* da sua escola e complete seu cadastro:

` +
    `🔗 ${url}

` +
    `_Qualquer dúvida, fale com o gestor da escola._`
  );

  window.open(`https://wa.me/?text=${msg}`, '_blank');
};

// ==============================
// ---- ALUNOS ----
// ==============================

window.carregarAlunos = async function(escolaId) {
  const listEl = document.getElementById(`alunos-list-${escolaId}`);
  if (!listEl) return;
  listEl.innerHTML = '<div class="list-loading" style="font-size:12px;">Carregando...</div>';

  try {
    const snap  = await getDocs(collection(db, 'usuarios'));
    const alunos = [];
    snap.forEach(d => {
      const u = d.data();
      if (u.perfil === 'aluno' && u.escola_id === escolaId) alunos.push({ id: d.id, ...u });
    });

    if (alunos.length === 0) {
      listEl.innerHTML = '<div class="prof-empty">Nenhum aluno cadastrado ainda.</div>';
      return;
    }

    alunos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    listEl.innerHTML = '';
    alunos.forEach(a => {
      const row = document.createElement('div');
      row.className = 'prof-row';
      row.innerHTML = `
        <div class="prof-info">
          <div class="prof-nome">${a.nome || '—'} <span style="font-size:10px;color:#999;font-weight:400;">${a.ano_letivo?.replace('_',' ') || ''} · ${a.turno || ''}</span></div>
          <div class="prof-email">${a.email || ''} · Matrícula: ${a.matricula || '—'}</div>
        </div>
        <div class="prof-actions">
          <button class="prof-btn-edit" onclick="editarAluno('${a.id}', '${escolaId}')">✏️ Editar</button>
          <button class="prof-btn-del"  onclick="deletarAluno('${a.id}', '${escolaId}')">🗑</button>
        </div>
      `;
      listEl.appendChild(row);
    });
  } catch(err) {
    listEl.innerHTML = `<div class="list-loading" style="color:#e74c3c;font-size:12px;">Erro: ${err.message}</div>`;
  }
};

window.editarAluno = async function(uid, escolaId) {
  const snap = await getDoc(doc(db, 'usuarios', uid));
  if (snap.exists()) mostrarModalAluno(escolaId, { id: uid, ...snap.data() });
};

window.deletarAluno = async function(uid, escolaId) {
  if (!confirm('Remover este aluno da escola?')) return;
  try {
    await deleteDoc(doc(db, 'usuarios', uid));
    showToast('🗑 Aluno removido.', '');
    await carregarAlunos(escolaId);
  } catch(err) {
    showToast('❌ Erro: ' + err.message, 'error');
  }
};

function mostrarModalAluno(escolaId, a) {
  document.getElementById('modal-aluno')?.remove();

  const anoOptions = ['1_ano','2_ano','3_ano','4_ano','5_ano','6_ano','7_ano','8_ano','9_ano','1_em','2_em','3_em','eja']
    .map(v => {
      const label = v.includes('em') ? v.replace('_em', 'º Ano EM') : v.replace('_ano', 'º Ano');
      return `<option value="${v}" ${a?.ano_letivo === v ? 'selected' : ''}>${label.charAt(0).toUpperCase() + label.slice(1)}</option>`;
    }).join('');

  const modal = document.createElement('div');
  modal.id = 'modal-aluno';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box modal-box-lg">
      <div class="modal-header">
        <div class="modal-title">${a?.id ? 'Editar Aluno' : 'Novo Aluno'}</div>
        <button class="modal-close" onclick="document.getElementById('modal-aluno').remove()">×</button>
      </div>
      <div class="modal-body modal-scroll">

        <div class="modal-secao-titulo">Dados Pessoais</div>
        <div class="modal-grid">
          <div class="form-group full">
            <label>Nome *</label>
            <input type="text" id="a-nome" value="${a?.nome || ''}" placeholder="Nome completo">
          </div>
          <div class="form-group">
            <label>Data de Nascimento *</label>
            <input type="date" id="a-nasc" value="${a?.data_nascimento || ''}">
          </div>
          <div class="form-group">
            <label>Sexo *</label>
            <select id="a-sexo">
              <option value="">Selecione</option>
              <option value="masculino"          ${a?.sexo === 'masculino'          ? 'selected' : ''}>Masculino</option>
              <option value="feminino"           ${a?.sexo === 'feminino'           ? 'selected' : ''}>Feminino</option>
              <option value="outro"              ${a?.sexo === 'outro'              ? 'selected' : ''}>Outro</option>
              <option value="prefiro_nao_informar" ${a?.sexo === 'prefiro_nao_informar' ? 'selected' : ''}>Prefiro não informar</option>
            </select>
          </div>
          <div class="form-group">
            <label>E-mail</label>
            <input type="text" value="${a?.email || '—'}" readonly style="opacity:0.5;">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="a-ativo">
              <option value="true"  ${a?.ativo !== false ? 'selected' : ''}>Ativo</option>
              <option value="false" ${a?.ativo === false  ? 'selected' : ''}>Inativo</option>
            </select>
          </div>
        </div>

        <div class="modal-secao-titulo" style="margin-top:18px;">Dados Escolares</div>
        <div class="modal-grid">
          <div class="form-group">
            <label>Matrícula *</label>
            <input type="text" id="a-matricula" value="${a?.matricula || ''}" placeholder="Número de matrícula">
          </div>
          <div class="form-group">
            <label>Ano Letivo *</label>
            <select id="a-ano">
              <option value="">Selecione</option>
              ${anoOptions}
            </select>
          </div>
          <div class="form-group">
            <label>Turno *</label>
            <select id="a-turno">
              <option value="">Selecione</option>
              <option value="matutino"   ${a?.turno === 'matutino'   ? 'selected' : ''}>Matutino</option>
              <option value="vespertino" ${a?.turno === 'vespertino' ? 'selected' : ''}>Vespertino</option>
              <option value="noturno"    ${a?.turno === 'noturno'    ? 'selected' : ''}>Noturno</option>
            </select>
          </div>
        </div>

        <div class="modal-secao-titulo" style="margin-top:18px;">Maker</div>
        <div class="modal-grid">
          <div class="form-group">
            <label>Nível Maker</label>
            <select id="a-nivel">
              <option value="Explorador" ${a?.nivel_maker === 'Explorador' ? 'selected' : ''}>Explorador</option>
              <option value="Criador"    ${a?.nivel_maker === 'Criador'    ? 'selected' : ''}>Criador</option>
              <option value="Inovador"   ${a?.nivel_maker === 'Inovador'   ? 'selected' : ''}>Inovador</option>
            </select>
          </div>
          <div class="form-group" style="justify-content:flex-end; padding-bottom:4px;">
            <label class="checkbox-label" style="margin-top:auto;">
              <input type="checkbox" id="a-participa" ${a?.participa_maker ? 'checked' : ''}> Participa do Maker
            </label>
          </div>
        </div>

        <div class="modal-secao-titulo" style="margin-top:18px;">Observações Internas</div>
        <div class="form-group">
          <textarea id="a-obs" placeholder="Anotações internas sobre o aluno..." style="min-height:70px;">${a?.observacoes || ''}</textarea>
        </div>

      </div>
      <div class="modal-footer">
        <button class="btn-salvar" onclick="document.getElementById('modal-aluno').remove()">Cancelar</button>
        <button class="btn-publicar" onclick="salvarAluno('${escolaId}', '${a?.id || ''}')">💾 Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.salvarAluno = async function(escolaId, uid) {
  const nome     = document.getElementById('a-nome')?.value?.trim();
  const nasc     = document.getElementById('a-nasc')?.value;
  const sexo     = document.getElementById('a-sexo')?.value;
  const matricula = document.getElementById('a-matricula')?.value?.trim();
  const ano      = document.getElementById('a-ano')?.value;
  const turno    = document.getElementById('a-turno')?.value;

  if (!nome)     { showToast('⚠️ Informe o nome.', 'error'); return; }
  if (!nasc)     { showToast('⚠️ Informe a data de nascimento.', 'error'); return; }
  if (!sexo)     { showToast('⚠️ Selecione o sexo.', 'error'); return; }
  if (!matricula){ showToast('⚠️ Informe a matrícula.', 'error'); return; }
  if (!ano)      { showToast('⚠️ Selecione o ano letivo.', 'error'); return; }
  if (!turno)    { showToast('⚠️ Selecione o turno.', 'error'); return; }

  const dados = {
    nome,
    data_nascimento:   nasc,
    sexo,
    matricula,
    ano_letivo:        ano,
    turno,
    ativo:             document.getElementById('a-ativo')?.value !== 'false',
    participa_maker:   document.getElementById('a-participa')?.checked || false,
    nivel_maker:       document.getElementById('a-nivel')?.value || 'Explorador',
    observacoes:       document.getElementById('a-obs')?.value?.trim() || '',
    escola_id:         escolaId,
    atualizado_em:     new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'usuarios', uid), dados, { merge: true });
    showToast('✅ Aluno atualizado!', 'success');
    document.getElementById('modal-aluno')?.remove();
    await carregarAlunos(escolaId);
  } catch(err) {
    showToast('❌ Erro: ' + err.message, 'error');
  }
};

// ==============================
// ---- TURMAS ----
// ==============================

window.carregarTurmas = async function(escolaId) {
  const listEl = document.getElementById(`turmas-list-${escolaId}`);
  if (!listEl) return;
  listEl.innerHTML = '<div class="list-loading" style="font-size:12px;">Carregando...</div>';

  try {
    const snap = await getDocs(query(collection(db, 'turmas'), where('escola_id', '==', escolaId)));
    const turmas = [];
    snap.forEach(d => turmas.push({ id: d.id, ...d.data() }));

    if (turmas.length === 0) {
      listEl.innerHTML = '<div class="prof-empty">Nenhuma turma cadastrada ainda.</div>';
      return;
    }

    turmas.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    listEl.innerHTML = '';
    turmas.forEach(t => {
      const row = document.createElement('div');
      row.className = 'prof-row';
      row.style.flexDirection = 'column';
      row.style.alignItems = 'stretch';
      row.style.gap = '8px';
      row.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div class="prof-info" style="flex:1;">
            <div class="prof-nome">
              ${t.nome || '—'}
              <span style="font-size:10px; color:#999; font-weight:400; margin-left:8px;">
                ${t.ativa ? '✅ Ativa' : '⏸ Inativa'}
                ${t.inicio ? ' · Início: ' + t.inicio : ''}
              </span>
            </div>
            <div class="prof-email">
              Cód: <strong>${t.codigo || '—'}</strong>
              ${t.professor_nome ? ' · Prof: ' + t.professor_nome : ''}
              · ${(t.alunos || []).length} aluno(s)
            </div>
          </div>
          <div class="prof-actions" style="flex-shrink:0;">
            <button class="prof-btn-edit" onclick="abrirModalTurma('${escolaId}', '${t.id}')">✏️ Editar</button>
            <button class="prof-btn-edit" style="background:#16a085;color:#fff;border-color:#16a085;" onclick="gerenciarAlunosTurma('${t.id}', '${escolaId}')">🎒 Alunos</button>
            <button class="prof-btn-del"  onclick="deletarTurma('${t.id}', '${escolaId}')">🗑</button>
          </div>
        </div>
      `;
      listEl.appendChild(row);
    });
  } catch(err) {
    listEl.innerHTML = `<div class="list-loading" style="color:#e74c3c;font-size:12px;">Erro: ${err.message}</div>`;
  }
};

window.abrirModalTurma = async function(escolaId, turmaId) {
  document.getElementById('modal-turma')?.remove();

  let turma = {};
  if (turmaId) {
    const snap = await getDoc(doc(db, 'turmas', turmaId));
    if (snap.exists()) turma = { id: snap.id, ...snap.data() };
  }

  // Busca professores da escola
  let profOptions = '<option value="">Sem professor designado</option>';
  try {
    const snap = await getDocs(collection(db, 'usuarios'));
    const profs = [];
    snap.forEach(d => {
      const u = d.data();
      if (u.escola_id === escolaId && u.perfil === 'professor') profs.push({ id: d.id, ...u });
    });
    profs.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    profOptions += profs.map(p =>
      `<option value="${p.id}" data-nome="${p.nome || ''}" ${turma.professor_id === p.id ? 'selected' : ''}>${p.nome || p.email}</option>`
    ).join('');
  } catch(_) {}

  const modal = document.createElement('div');
  modal.id = 'modal-turma';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box modal-box-lg">
      <div class="modal-header">
        <div class="modal-title">${turmaId ? 'Editar Turma' : 'Nova Turma'}</div>
        <button class="modal-close" onclick="document.getElementById('modal-turma').remove()">×</button>
      </div>
      <div class="modal-body modal-scroll">
        <div class="modal-secao-titulo">Dados da Turma</div>
        <div class="modal-grid">
          <div class="form-group">
            <label>Código da Turma *</label>
            <input type="text" id="tm-codigo" value="${turma.codigo || ''}" placeholder="Ex: 6A, 7B, TURMA-01">
          </div>
          <div class="form-group">
            <label>Nome da Turma *</label>
            <input type="text" id="tm-nome" value="${turma.nome || ''}" placeholder="Ex: 6º Ano A — Matutino">
          </div>
          <div class="form-group">
            <label>Início</label>
            <input type="date" id="tm-inicio" value="${turma.inicio || ''}">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="tm-ativa">
              <option value="true"  ${turma.ativa !== false ? 'selected' : ''}>Ativa</option>
              <option value="false" ${turma.ativa === false  ? 'selected' : ''}>Inativa</option>
            </select>
          </div>
          <div class="form-group full">
            <label>Professor Responsável</label>
            <select id="tm-professor">
              ${profOptions}
            </select>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-salvar" onclick="document.getElementById('modal-turma').remove()">Cancelar</button>
        <button class="btn-publicar" onclick="salvarTurma('${escolaId}', '${turmaId || ''}')">💾 Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('tm-codigo')?.focus();
};

window.salvarTurma = async function(escolaId, turmaId) {
  const codigo = document.getElementById('tm-codigo')?.value?.trim();
  const nome   = document.getElementById('tm-nome')?.value?.trim();
  if (!codigo) { showToast('⚠️ Informe o código da turma.', 'error'); return; }
  if (!nome)   { showToast('⚠️ Informe o nome da turma.', 'error'); return; }

  const profSel     = document.getElementById('tm-professor');
  const professorId = profSel?.value || '';
  const professorNome = profSel?.options[profSel.selectedIndex]?.dataset?.nome || '';

  const docId = (turmaId && turmaId !== '') ? turmaId : `turma-${escolaId}-${Date.now()}`;

  const dados = {
    codigo,
    nome,
    inicio:          document.getElementById('tm-inicio')?.value || '',
    ativa:           document.getElementById('tm-ativa')?.value !== 'false',
    professor_id:    professorId,
    professor_nome:  professorNome,
    escola_id:       escolaId,
    alunos:          [], // preserva alunos existentes se edição
    atualizado_em:   new Date().toISOString()
  };

  // Se editando, preserva array de alunos
  if (turmaId && turmaId !== '') {
    try {
      const snap = await getDoc(doc(db, 'turmas', turmaId));
      if (snap.exists()) dados.alunos = snap.data().alunos || [];
    } catch(_) {}
  } else {
    dados.criado_em = new Date().toISOString();
  }

  try {
    await setDoc(doc(db, 'turmas', docId), dados);
    showToast('✅ Turma salva!', 'success');
    document.getElementById('modal-turma')?.remove();
    await carregarTurmas(escolaId);
  } catch(err) {
    showToast('❌ Erro: ' + err.message, 'error');
  }
};

window.deletarTurma = async function(turmaId, escolaId) {
  if (!confirm('Remover esta turma? Esta ação não pode ser desfeita.')) return;
  try {
    await deleteDoc(doc(db, 'turmas', turmaId));
    showToast('🗑 Turma removida.', '');
    await carregarTurmas(escolaId);
  } catch(err) {
    showToast('❌ Erro: ' + err.message, 'error');
  }
};

// ---- GERENCIAR ALUNOS DA TURMA ----
window.gerenciarAlunosTurma = async function(turmaId, escolaId) {
  document.getElementById('modal-alunos-turma')?.remove();

  let turmaAlunos = [];
  let turmaData   = {};
  try {
    const snap = await getDoc(doc(db, 'turmas', turmaId));
    if (snap.exists()) { turmaData = snap.data(); turmaAlunos = turmaData.alunos || []; }
  } catch(_) {}

  // Carrega todos os alunos da escola
  let todosAlunos = [];
  try {
    const snap = await getDocs(collection(db, 'usuarios'));
    snap.forEach(d => {
      const u = d.data();
      if (u.escola_id === escolaId && u.perfil === 'aluno') todosAlunos.push({ id: d.id, ...u });
    });
    todosAlunos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  } catch(_) {}

  // Estado compartilhado — buildListas sempre lê daqui
  window._turmaAlunosState = { turmaAlunos, todosAlunos };

  function buildListas() {
    const ta  = window._turmaAlunosState.turmaAlunos;
    const all = window._turmaAlunosState.todosAlunos;
    const nasTurma  = all.filter(a => ta.includes(a.id));
    const foraTurma = all.filter(a => !ta.includes(a.id));

    const htmlNa = nasTurma.length === 0
      ? '<div class="prof-empty" style="font-size:12px;">Nenhum aluno na turma.</div>'
      : nasTurma.map(a => `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border:1.5px solid #DDD8CC; border-radius:10px; margin-bottom:6px; background:#fff;">
            <div style="flex:1; min-width:0;">
              <div style="font-size:13px; font-weight:600; color:#2F3447; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${a.nome || '—'}</div>
              <div style="font-size:11px; color:#8B9BB4;">${a.matricula || ''}</div>
            </div>
            <button onclick="removerAlunoTurma('${turmaId}','${a.id}','${escolaId}')"
              style="flex-shrink:0; padding:5px 10px; font-size:11px; font-weight:600; background:#e74c3c; color:#fff; border:none; border-radius:6px; cursor:pointer;">
              Remover
            </button>
          </div>`).join('');

    const htmlFora = foraTurma.length === 0
      ? '<div class="prof-empty" style="font-size:12px;">Todos os alunos já estão na turma.</div>'
      : foraTurma.map(a => `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border:1.5px solid #DDD8CC; border-radius:10px; margin-bottom:6px; background:#fff;">
            <div style="flex:1; min-width:0;">
              <div style="font-size:13px; font-weight:600; color:#2F3447; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${a.nome || '—'}</div>
              <div style="font-size:11px; color:#8B9BB4;">${a.matricula || ''}</div>
            </div>
            <button onclick="adicionarAlunoTurma('${turmaId}','${a.id}','${escolaId}')"
              style="flex-shrink:0; padding:5px 10px; font-size:11px; font-weight:600; background:#16a085; color:#fff; border:none; border-radius:6px; cursor:pointer;">
              Adicionar
            </button>
          </div>`).join('');

    const el = document.getElementById('modal-alunos-turma');
    if (el) {
      el.querySelector('#at-na-turma').innerHTML   = htmlNa;
      el.querySelector('#at-fora-turma').innerHTML = htmlFora;
      el.querySelector('#at-contagem').textContent = `${nasTurma.length} aluno(s) na turma`;
    }
  }

  window._turmaAlunosState.buildListas = buildListas;

  const modal = document.createElement('div');
  modal.id = 'modal-alunos-turma';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box modal-box-lg">
      <div class="modal-header">
        <div class="modal-title">🎒 Alunos — ${turmaData.nome || 'Turma'}</div>
        <button class="modal-close" onclick="document.getElementById('modal-alunos-turma').remove()">×</button>
      </div>
      <div class="modal-body modal-scroll" style="padding:0;">
        <div style="display:grid; grid-template-columns:1fr 1fr; height:100%;">
          <!-- Alunos na turma -->
          <div style="border-right:1px solid #DDD8CC; padding:16px;">
            <div style="font-size:12px; font-weight:700; color:#8B9BB4; text-transform:uppercase; letter-spacing:.5px; margin-bottom:10px;">
              Na Turma · <span id="at-contagem">0 aluno(s)</span>
            </div>
            <div id="at-na-turma" class="professores-list" style="max-height:340px; overflow-y:auto;"></div>
          </div>
          <!-- Alunos disponíveis -->
          <div style="padding:16px;">
            <div style="font-size:12px; font-weight:700; color:#8B9BB4; text-transform:uppercase; letter-spacing:.5px; margin-bottom:10px;">
              Disponíveis (escola)
            </div>
            <div id="at-fora-turma" class="professores-list" style="max-height:340px; overflow-y:auto;"></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-publicar" onclick="document.getElementById('modal-alunos-turma').remove()">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  buildListas();
};

window.adicionarAlunoTurma = async function(turmaId, alunoId, escolaId) {
  try {
    const alunos = [...(window._turmaAlunosState.turmaAlunos || [])];
    if (alunos.includes(alunoId)) return;
    alunos.push(alunoId);
    window._turmaAlunosState.turmaAlunos = alunos;
    window._turmaAlunosState.buildListas();
    await setDoc(doc(db, 'turmas', turmaId), { alunos }, { merge: true });
    carregarTurmas(escolaId);
  } catch(err) { showToast('❌ Erro: ' + err.message, 'error'); }
};

window.removerAlunoTurma = async function(turmaId, alunoId, escolaId) {
  try {
    const alunos = (window._turmaAlunosState.turmaAlunos || []).filter(id => id !== alunoId);
    window._turmaAlunosState.turmaAlunos = alunos;
    window._turmaAlunosState.buildListas();
    await setDoc(doc(db, 'turmas', turmaId), { alunos }, { merge: true });
    carregarTurmas(escolaId);
  } catch(err) { showToast('❌ Erro: ' + err.message, 'error'); }
};

// ---- CONVITE ALUNO WHATSAPP ----
window.abrirModalConviteAluno = async function(escolaId) {
  document.getElementById('modal-convite-aluno')?.remove();

  const base = window.location.origin + window.location.pathname.replace('admin.html', 'cadastro-aluno.html');
  const url  = `${base}?escola=${escolaId}`;

  let nomeEscola = 'a escola';
  try {
    const snap = await getDoc(doc(db, 'escolas', escolaId));
    if (snap.exists()) nomeEscola = snap.data().nome || nomeEscola;
  } catch(e) {}

  const msgWA = encodeURIComponent(
    `🎓 *MakerLab 3D — Cadastro de Aluno*\n\n` +
    `Você foi convidado(a) para se cadastrar como aluno(a) em *${nomeEscola}*.\n\n` +
    `Acesse o link abaixo, informe o *Código de Acesso* da sua escola e complete seu cadastro:\n\n` +
    `🔗 ${url}\n\n` +
    `_Qualquer dúvida, fale com seu professor._`
  );

  const modal = document.createElement('div');
  modal.id = 'modal-convite-aluno';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">🎒 Convidar Aluno</div>
        <button class="modal-close" onclick="document.getElementById('modal-convite-aluno').remove()">×</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px; color:#5F6480; margin-bottom:12px;">
          Compartilhe o link com o aluno. Ele precisará do <strong>Código de Acesso</strong> da escola.
        </p>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="text" value="${url}" readonly
            style="flex:1; font-size:11px; background:#F5F3EE; border:1.5px solid #DDD8CC; border-radius:8px; padding:9px 12px; font-family:monospace; color:#2F3447;">
          <button class="vg-btn-add" onclick="navigator.clipboard.writeText('${url}').then(()=>showToast('🔗 Link copiado!','success'))">Copiar</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-salvar" onclick="document.getElementById('modal-convite-aluno').remove()">Fechar</button>
        <button class="btn-whatsapp" onclick="window.open('https://wa.me/?text=${msgWA}','_blank'); document.getElementById('modal-convite-aluno').remove();">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Enviar por WhatsApp
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

// ── LIMPAR HISTÓRICO ──────────────────────────────────────────────────────────
window.abrirLimparHistorico = function(escolaId, perfil) {
  const label = perfil === 'aluno' ? 'Alunos' : 'Professores';
  const cor   = perfil === 'aluno' ? '#c0392b' : '#e67e22';

  const modal = document.createElement('div');
  modal.id = 'modal-limpar-historico';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:32px;max-width:440px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
      <div style="font-size:20px;font-weight:700;margin-bottom:8px;color:${cor};">⚠️ Limpar Histórico de ${label}</div>
      <p style="font-size:14px;color:#555;margin-bottom:16px;line-height:1.6;">
        Todos os resultados de jogos dos <strong>${label.toLowerCase()}</strong> desta escola serão <strong>apagados permanentemente</strong>.<br>
        Esta ação não pode ser desfeita.
      </p>
      <div style="margin-bottom:20px;">
        <label style="font-size:12px;font-weight:600;color:#333;display:block;margin-bottom:6px;">Confirme digitando sua senha:</label>
        <input type="password" id="lh-senha" placeholder="Digite sua senha" autocomplete="new-password" readonly
          style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <div id="lh-erro" style="color:#c0392b;font-size:12px;margin-top:6px;display:none;"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="document.getElementById('modal-limpar-historico').remove()"
          style="padding:9px 20px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;">Cancelar</button>
        <button onclick="confirmarLimparHistorico('${escolaId}','${perfil}')"
          style="padding:9px 20px;border:none;border-radius:8px;background:${cor};color:#fff;font-weight:700;cursor:pointer;font-size:13px;">Confirmar e Apagar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => {
    const inp = document.getElementById('lh-senha');
    if (!inp) return;
    inp.removeAttribute('readonly');
    inp.value = '';
    inp.focus();
  }, 150);
};

window.confirmarLimparHistorico = async function(escolaId, perfil) {
  const senhaInput = document.getElementById('lh-senha');
  const erroEl    = document.getElementById('lh-erro');
  const senha = senhaInput?.value?.trim();

  if (!senha) {
    erroEl.textContent = 'Digite sua senha para confirmar.';
    erroEl.style.display = 'block';
    return;
  }
  erroEl.style.display = 'none';

  try {
    const { getAuth, reauthenticateWithCredential, EmailAuthProvider } =
      await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js");
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error('Sessão expirada. Faça login novamente.');
    const credencial = EmailAuthProvider.credential(user.email, senha);
    await reauthenticateWithCredential(user, credencial);
  } catch(e) {
    const erroEl2 = document.getElementById('lh-erro');
    if (erroEl2) {
      erroEl2.textContent = (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential')
        ? 'Senha incorreta.' : (e.message || 'Erro ao verificar senha.');
      erroEl2.style.display = 'block';
    }
    return;
  }

  document.getElementById('modal-limpar-historico').remove();
  showToast('Apagando histórico...', '');

  const colsResultados = [
    'resultados_quiz', 'resultados_bug', 'resultados_comp', 'resultados_ordena',
    'resultados_complete', 'resultados_conecta', 'resultados_box', 'resultados_binario',
  ];

  try {
    const usuariosSnap = await getDocs(
      query(collection(db, 'usuarios'), where('escola_id', '==', escolaId), where('perfil', '==', perfil))
    );
    const uids = [];
    usuariosSnap.forEach(d => uids.push(d.id));

    if (uids.length === 0) {
      showToast('Nenhum usuário encontrado para limpar.', '');
      return;
    }

    let totalApagados = 0;
    for (const uid of uids) {
      for (const col of colsResultados) {
        try {
          const snap = await getDocs(query(collection(db, col), where('aluno_id', '==', uid)));
          for (const d of snap.docs) {
            await deleteDoc(d.ref);
            totalApagados++;
          }
        } catch(e) {}
      }
      try {
        const firestoreModule = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
        await firestoreModule.updateDoc(doc(db, 'usuarios', uid), { pontos_total: 0 });
      } catch(e) {}
    }

    const label = perfil === 'aluno' ? 'alunos' : 'professores';
    showToast(`✅ Histórico de ${uids.length} ${label} apagado (${totalApagados} registros).`, 'success');
  } catch(err) {
    showToast('Erro ao apagar histórico: ' + err.message, 'error');
  }
};

window.toggleConfigEscola = function() {
  const menu = document.getElementById('escola-config-menu');
  if (!menu) return;
  const aberto = menu.style.display === 'block';
  menu.style.display = aberto ? 'none' : 'block';
  if (!aberto) {
    const fechar = (e) => {
      if (!document.getElementById('escola-config-wrap')?.contains(e.target)) {
        menu.style.display = 'none';
        document.removeEventListener('click', fechar);
      }
    };
    setTimeout(() => document.addEventListener('click', fechar), 10);
  }
};

window.abrirLimparMeuHistorico = function() {
  const modal = document.createElement('div');
  modal.id = 'modal-limpar-historico';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:32px;max-width:440px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
      <div style="font-size:20px;font-weight:700;margin-bottom:8px;color:#555;">🧹 Limpar Meu Histórico</div>
      <p style="font-size:14px;color:#555;margin-bottom:16px;line-height:1.6;">
        Todos os seus resultados de jogos serão <strong>apagados permanentemente</strong>.<br>
        Esta ação não pode ser desfeita.
      </p>
      <div style="margin-bottom:20px;">
        <label style="font-size:12px;font-weight:600;color:#333;display:block;margin-bottom:6px;">Confirme digitando sua senha:</label>
        <input type="password" id="lh-senha" placeholder="Digite sua senha" autocomplete="new-password" readonly
          style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <div id="lh-erro" style="color:#c0392b;font-size:12px;margin-top:6px;display:none;"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="document.getElementById('modal-limpar-historico').remove()"
          style="padding:9px 20px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;">Cancelar</button>
        <button onclick="confirmarLimparMeuHistorico()"
          style="padding:9px 20px;border:none;border-radius:8px;background:#555;color:#fff;font-weight:700;cursor:pointer;font-size:13px;">Confirmar e Apagar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => {
    const inp = document.getElementById('lh-senha');
    if (!inp) return;
    inp.removeAttribute('readonly');
    inp.value = '';
    inp.focus();
  }, 150);
};

window.confirmarLimparMeuHistorico = async function() {
  const senhaInput = document.getElementById('lh-senha');
  const erroEl    = document.getElementById('lh-erro');
  const senha = senhaInput?.value?.trim();

  if (!senha) {
    erroEl.textContent = 'Digite sua senha para confirmar.';
    erroEl.style.display = 'block';
    return;
  }
  erroEl.style.display = 'none';

  let uid = null;
  try {
    const { getAuth, reauthenticateWithCredential, EmailAuthProvider } =
      await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js");
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error('Sessão expirada. Faça login novamente.');
    uid = user.uid;
    const credencial = EmailAuthProvider.credential(user.email, senha);
    await reauthenticateWithCredential(user, credencial);
  } catch(e) {
    const erroEl2 = document.getElementById('lh-erro');
    if (erroEl2) {
      erroEl2.textContent = (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential')
        ? 'Senha incorreta.' : (e.message || 'Erro ao verificar senha.');
      erroEl2.style.display = 'block';
    }
    return;
  }

  document.getElementById('modal-limpar-historico').remove();
  showToast('Apagando seu histórico...', '');

  const colsResultados = [
    'resultados_quiz', 'resultados_bug', 'resultados_comp', 'resultados_ordena',
    'resultados_complete', 'resultados_conecta', 'resultados_box', 'resultados_binario',
  ];

  try {
    let totalApagados = 0;
    for (const col of colsResultados) {
      try {
        const snap = await getDocs(query(collection(db, col), where('aluno_id', '==', uid)));
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
          totalApagados++;
        }
      } catch(e) {}
    }
    try {
      const firestoreModule = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
      await firestoreModule.updateDoc(doc(db, 'usuarios', uid), { pontos_total: 0 });
    } catch(e) {}

    showToast(`✅ Seu histórico foi apagado (${totalApagados} registros).`, 'success');
  } catch(err) {
    showToast('Erro ao apagar histórico: ' + err.message, 'error');
  }
};
