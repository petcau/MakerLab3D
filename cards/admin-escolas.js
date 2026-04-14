// admin-escolas.js — Cadastro de Escolas

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, setDoc, deleteDoc, getDoc, query, orderBy
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
function renderEscolaForm(id, e = {}) {
  const content = document.getElementById('escolas-content');
  if (!content) return;

  const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const ufOptions = ufs.map(u => `<option value="${u}" ${e.uf === u ? 'selected' : ''}>${u}</option>`).join('');

  content.innerHTML = `
    <div class="form-header" style="position:relative; top:0; margin:0 -32px 20px; flex-direction:column; gap:0; align-items:stretch; padding:0; background:var(--cinza-claro); border-bottom:1px solid var(--cinza-medio);">
      ${id ? `
      <div style="display:flex; justify-content:flex-end; gap:8px; padding:12px 24px 10px; border-bottom:1px solid var(--cinza-medio); background:var(--off-white);">
        <button class="btn-convidar" onclick="abrirModalConvite('${id}')">📩 Convidar Professor</button>
        <button class="btn-convidar" style="background:#8e44ad;" onclick="abrirModalConviteAluno('${id}')">🎒 Convidar Aluno</button>
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
    </div>` : ''}
  `;

  if (id) { carregarProfessores(id); carregarAlunos(id); }
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
