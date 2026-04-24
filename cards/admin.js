// admin.js — MakerLab 3D — Painel CRUD

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, setDoc, deleteDoc, getDoc, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getStorage, ref,
  uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAndgQiwxpe6wyCF8aa5NqqdMuwLJfMIMM",
  authDomain: "makerlab3d-4e455.firebaseapp.com",
  projectId: "makerlab3d-4e455",
  storageBucket: "makerlab3d-4e455.firebasestorage.app",
  messagingSenderId: "495457985822",
  appId: "1:495457985822:web:05efcebeed970ecb82150f"
};

const app     = initializeApp(firebaseConfig);
const db      = getFirestore(app);
const storage = getStorage(app);

let cardAtivo  = null;
let imagemURL  = '';
let atividadeImagemURL = '';
window.glossarioState = [];
let tagsState  = {};
let todosCards = {};

// Mapeamento legado: mantém compatibilidade com campos já salvos no Firestore
const VMAP_LEGADO = {
  'Desafio':             'links_desafios',
  'Componente':          'links_componentes',
  'Conexão com o Mundo': 'links_conexoes',
};

function tipoKey(nome) {
  if (VMAP_LEGADO[nome]) return VMAP_LEGADO[nome];
  return 'links_' + nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function tipoElemId(nome, prefixo) {
  const slug = nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return prefixo + slug;
}

function getVMAP() {
  return (window._tiposCard || []).map(t => ({
    tipo:  t.nome,
    icone: t.icone || '📌',
    key:   tipoKey(t.nome),
    sel:   tipoElemId(t.nome, 'vsel-'),
    list:  tipoElemId(t.nome, 'vlist-'),
  }));
}

function renderVinculadosGruposHTML() {
  return (window._tiposCard || []).map(t => {
    const key  = tipoKey(t.nome);
    const sel  = tipoElemId(t.nome, 'vsel-');
    const list = tipoElemId(t.nome, 'vlist-');
    return `
      <div class="vg">
        <div class="vg-header">
          <span class="vg-title">${t.icone || '📌'} ${t.nome}</span>
          <div class="vg-add-row">
            <select class="vg-select" id="${sel}">
              <option value="">Selecione um card do tipo ${t.nome}...</option>
            </select>
            <button class="vg-btn-add" onclick="addVinculado('${key}','${sel}','${list}')">Adicionar</button>
          </div>
        </div>
        <div class="vg-list" id="${list}"></div>
      </div>`;
  }).join('');
}

// Tipos dinâmicos — carregados do Firestore, com fallback nos 3 padrões
window._tiposCard = [
  { id: null, nome: 'Desafio',             icone: '🎯', ordem: 1 },
  { id: null, nome: 'Componente',          icone: '🔩', ordem: 2 },
  { id: null, nome: 'Conexão com o Mundo', icone: '🌍', ordem: 3 },
];

let _filtroTipo = '';

async function carregarTiposCard() {
  try {
    const snap = await getDocs(collection(db, 'tipos_card'));
    if (!snap.empty) {
      const tipos = [];
      snap.forEach(d => tipos.push({ id: d.id, ...d.data() }));
      tipos.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      window._tiposCard = tipos;
    }
  } catch(e) { console.warn('carregarTiposCard:', e); }
  popularFiltroTipos();
}

function popularFiltroTipos() {
  const sel = document.getElementById('card-tipo-filtro');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todos os tipos</option>'
    + window._tiposCard.map(t =>
        `<option value="${t.nome}" ${atual === t.nome ? 'selected' : ''}>${t.icone ? t.icone + ' ' : ''}${t.nome}</option>`
      ).join('');
}

window.filtrarCardsTipo = function(tipo) {
  _filtroTipo = tipo;
  listarCards();
};

// Callback chamado pelo admin-tipos.js após salvar/deletar um tipo
window._recarregarTiposCard = function() {
  carregarTiposCard().then(() => {
    listarCards();
  });
};

// ---- TOAST ----
function showToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ---- LISTAR CARDS ----
async function listarCards() {
  const listEl = document.getElementById('card-list');
  try {
    const snap = await getDocs(collection(db, 'cards'));
    listEl.innerHTML = '';

    if (snap.empty) {
      listEl.innerHTML = '<div class="list-loading">Nenhum card ainda.<br>Clique em + Novo Card.</div>';
      return;
    }

    // Ordena por número no cliente
    const docs = [];
    snap.forEach(docSnap => docs.push(docSnap));
    docs.sort((a, b) => (a.data().numero || 0) - (b.data().numero || 0));

    // Agrupa por tipo (usa tipos dinâmicos)
    const grupos = {};
    window._tiposCard.forEach(t => { grupos[t.nome] = []; });

    docs.forEach(docSnap => {
      const d    = docSnap.data();
      const tipo = d.tipo || window._tiposCard[0]?.nome || 'Desafio';
      if (!grupos[tipo]) grupos[tipo] = []; // tipo desconhecido vai para grupo próprio
      grupos[tipo].push({ id: docSnap.id, data: d });
    });

    const ordem = window._tiposCard.map(t => t.nome);
    // Adiciona tipos desconhecidos que apareçam nos cards mas não estejam na lista
    Object.keys(grupos).forEach(g => { if (!ordem.includes(g)) ordem.push(g); });

    // Aplica filtro por tipo
    const ordemFiltrada = _filtroTipo ? ordem.filter(g => g === _filtroTipo) : ordem;
    let temConteudo = false;

    ordemFiltrada.forEach(grupo => {
      const cards = grupos[grupo];
      if (!cards || cards.length === 0) return;
      temConteudo = true;

      const sep = document.createElement('div');
      sep.className   = 'list-group-label';
      sep.textContent = grupo;
      listEl.appendChild(sep);

      cards.forEach(({ id, data: d }) => {
        const item     = document.createElement('div');
        item.className  = 'card-item';
        item.dataset.id = id;
        const tipoLabel = (d.tipo || 'Desafio').toUpperCase();
        const numPad    = String(d.numero || 0).padStart(2, '0');

        // Conta jogos configurados
        const jogoCampos = [
          { k: 'quiz', def: 1.0 }, { k: 'bug_codigos', def: 1.0 },
          { k: 'comp_perguntas', def: 1.0 }, { k: 'ordena_desafios', def: 1.0 },
          { k: 'complete_desafios', def: 1.0 }, { k: 'conecta_desafios', def: 2.0 },
          { k: 'box_desafios', def: 2.0 }, { k: 'binario_desafios', def: 1.0 },
        ];
        let qtdJogos = 0;
        let qtdPontos = 0;
        jogoCampos.forEach(({ k, def }) => {
          const arr = d[k];
          if (Array.isArray(arr) && arr.length > 0) {
            qtdJogos++;
            arr.forEach(item => { qtdPontos += parseFloat(item.pontos) || def; });
          }
        });
        const ptsLabel = qtdPontos % 1 === 0 ? qtdPontos : qtdPontos.toFixed(1);

        item.innerHTML = `
          <div style="display:flex;gap:8px;align-items:flex-start;">
            ${d.imagem_url
              ? `<img src="${d.imagem_url}" style="width:38px;height:38px;object-fit:cover;border-radius:6px;flex-shrink:0;margin-top:2px;" onerror="this.style.display='none'">`
              : `<div style="width:38px;height:38px;border-radius:6px;background:#f0ede8;flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center;font-size:16px;">🃏</div>`}
            <div style="flex:1;min-width:0;">
              <div class="card-item-num">${tipoLabel} ${numPad}</div>
              <div class="card-item-nome">${d.nome || 'Sem nome'}</div>
              <div style="margin-top:4px;">
                <span class="card-item-status ${d.publicado ? 'status-publicado' : 'status-rascunho'}" style="margin:0;">
                  ${d.publicado ? 'Publicado' : 'Rascunho'}
                </span>
              </div>
              <div style="display:flex;align-items:center;gap:4px;margin-top:4px;flex-wrap:nowrap;overflow:hidden;">
                <span title="Jogos configurados" style="font-size:10px;color:#888;background:#f5f5f5;border:1px solid #e0ddd8;border-radius:4px;padding:1px 6px;font-weight:600;white-space:nowrap;">🎮 ${qtdJogos}</span>
                <span title="Pontuação total disponível" style="font-size:10px;color:#b7950b;background:#fef9e7;border:1px solid #f9e79f;border-radius:4px;padding:1px 6px;font-weight:600;white-space:nowrap;">⭐ ${ptsLabel} pts</span>
                ${(() => { const qtdVinc = Object.keys(d).filter(k => k.startsWith('links_')).reduce((acc, k) => acc + (Array.isArray(d[k]) ? d[k].length : 0), 0); return `<span title="Cards vinculados" style="font-size:10px;color:${qtdVinc ? '#7d3c98' : '#bbb'};background:${qtdVinc ? '#f5eef8' : '#f5f5f5'};border:1px solid ${qtdVinc ? '#d7bde2' : '#e0ddd8'};border-radius:4px;padding:1px 6px;font-weight:600;white-space:nowrap;">🧩 ${qtdVinc}</span>`; })()}
                ${(() => { const qtdAnexos = Array.isArray(d.anexos) ? d.anexos.filter(a => a.titulo || a.url).length : 0; return `<span title="Anexos" style="font-size:10px;color:${qtdAnexos ? '#1a6fa8' : '#bbb'};background:${qtdAnexos ? '#eaf4fd' : '#f5f5f5'};border:1px solid ${qtdAnexos ? '#aed6f1' : '#e0ddd8'};border-radius:4px;padding:1px 6px;font-weight:600;white-space:nowrap;">🗂️ ${qtdAnexos}</span>`; })()}
              </div>
            </div>
          </div>
        `;
        item.onclick = () => abrirCard(id, d, item);
        listEl.appendChild(item);
      });
    });

    if (!temConteudo) {
      listEl.innerHTML = '<div class="list-loading">Nenhum card ainda.<br>Clique em + Novo Card.</div>';
    }
  } catch (err) {
    listEl.innerHTML = `<div class="list-loading" style="color:#e74c3c;">Erro: ${err.message}</div>`;
  }
}

// ---- ABRIR CARD ----
function abrirCard(id, data, el) {
  cardAtivo = id;
  document.querySelectorAll('.card-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  renderForm(id, data);
}

// ---- NOVO CARD ----
window.novoCard = function () {
  cardAtivo = null;
  document.querySelectorAll('.card-item').forEach(i => i.classList.remove('active'));
  renderForm(null, {});
};

// ---- RENDER FORM ----
function renderForm(id, d) {
  imagemURL = d.imagem_url || '';
  atividadeImagemURL = d.atividade_imagem_url || '';
  window.quizState = d.quiz ? JSON.parse(JSON.stringify(d.quiz)) : [];
  window.bugState  = d.bug_codigos ? JSON.parse(JSON.stringify(d.bug_codigos)) : [];
  window.compState  = d.comp_perguntas ? JSON.parse(JSON.stringify(d.comp_perguntas)) : [];
  window.ordenaState   = d.ordena_desafios   ? JSON.parse(JSON.stringify(d.ordena_desafios))   : [];
  window.completeState = d.complete_desafios ? JSON.parse(JSON.stringify(d.complete_desafios)) : [];
  window.conectaState  = d.conecta_desafios  ? JSON.parse(JSON.stringify(d.conecta_desafios))  : [];
  window.boxState      = d.box_desafios      ? JSON.parse(JSON.stringify(d.box_desafios))      : [];
  window.binarioState  = d.binario_desafios  ? JSON.parse(JSON.stringify(d.binario_desafios))  : [];
  window.glossarioState = d.glossario ? JSON.parse(JSON.stringify(d.glossario)) : [];
  window.anexosState   = d.anexos ? JSON.parse(JSON.stringify(d.anexos)) : [];
  // Carrega links de todos os tipos dinâmicos (com fallback para legado)
  tagsState = {};
  getVMAP().forEach(({ key }) => {
    tagsState[key] = d[key] ? [...d[key]] : [];
  });
  // Preserva campos legados que existam no documento mas não tenham tipo cadastrado
  Object.keys(d).filter(k => k.startsWith('links_') && !tagsState[k]).forEach(k => {
    tagsState[k] = [...d[k]];
  });
  const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', 'card.html');
  const cardUrl = id ? `${baseUrl}?id=${id}` : '—';

  document.getElementById('main-content').innerHTML = `
    <div class="form-header">
      <div class="form-title">${id ? 'Editar Card' : 'Novo Card'}</div>
      <div class="form-actions">
        ${id ? `<button class="btn-historico" onclick="abrirHistoricoCard('${id}')">📋 Histórico</button>` : ''}
        ${id ? `<button class="btn-deletar" onclick="deletarCard('${id}')">🗑 Deletar</button>` : ''}
        ${id ? `<button class="btn-ver-card" onclick="window.open('card.html?id=${id}','_blank')" type="button">👁 Ver Card</button>` : ''}
        <button class="btn-salvar"   onclick="salvarCard(false)">💾 Salvar Rascunho</button>
        <button class="btn-publicar" onclick="salvarCard(true)">🚀 Publicar</button>
      </div>
    </div>

    <!-- Identificação -->
    <div class="form-section">
      <div class="section-title">Identificação</div>
      <div class="form-grid">
        <div class="form-group">
          <label>ID do Card *</label>
          <input type="text" id="f-id" value="${id || ''}" placeholder="ex: pisca-pisca"
            ${id ? 'readonly style="opacity:0.5"' : ''}>
          <span class="helper-text">Sem espaços, use hífen. Ex: pisca-pisca</span>
        </div>
        <div class="form-group">
          <label>Número *</label>
          <input type="number" id="f-numero" value="${d.numero || ''}" placeholder="1">
        </div>
        <div class="form-group">
          <label>Nome do Desafio *</label>
          <input type="text" id="f-nome" value="${d.nome || ''}" placeholder="Pisca-Pisca">
        </div>
        <div class="form-group">
          <label>Nível</label>
          <select id="f-nivel">
            <option value="Nível 1 — Explorador" ${(d.nivel||'').includes('Explorador') ? 'selected':''}>Nível 1 — Explorador</option>
            <option value="Nível 2 — Criador"    ${(d.nivel||'').includes('Criador')    ? 'selected':''}>Nível 2 — Criador</option>
            <option value="Nível 3 — Inovador"   ${(d.nivel||'').includes('Inovador')   ? 'selected':''}>Nível 3 — Inovador</option>
          </select>
        </div>
        <div class="form-group">
          <label>Tipo do Card</label>
          <select id="f-tipo">
            <option value="" ${!d.tipo ? 'selected':''}>Selecione...</option>
            ${window._tiposCard.filter(t => t.ativo !== false).map(t =>
              `<option value="${t.nome}" ${(d.tipo||'') === t.nome ? 'selected':''}>${t.icone ? t.icone + ' ' : ''}${t.nome}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Tema do Card</label>
          <input type="text" id="f-tema" value="${d.tema || ''}" placeholder="Ex: Eletrônica, História, Programação...">
        </div>

      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;padding-top:20px;border-top:1px solid #eee;">
        <button class="btn-prompt-ia"  onclick="abrirPromptIA()" type="button">🤖 Prompt IA</button>
        <button class="btn-gerar-ia"   onclick="gerarPorIA()"    type="button">✨ Gerar por IA (Claude)</button>
      </div>
    </div>

    <!-- Imagem -->
    <div class="form-section">
      <div class="section-title">Imagem de Capa</div>
      <p style="font-size:11px;color:#8B9BB4;margin:0 0 10px;">A imagem deve ser 1×1 — tamanho recomendado: <strong>800×800px</strong></p>
      <div class="upload-area upload-area-capa ${imagemURL ? 'tem-imagem' : ''}" id="upload-area">
        ${imagemURL
          ? `<img src="${imagemURL}" alt="Imagem" class="upload-preview">
             <div class="upload-overlay" onclick="document.getElementById('f-imagem').click()">
               <div class="upload-overlay-icon">📷</div>
               <div class="upload-overlay-text">Trocar imagem</div>
             </div>`
          : `<div class="upload-placeholder" onclick="document.getElementById('f-imagem').click()">
               <div class="upload-icon">📷</div>
               <div class="upload-text">Clique para fazer upload da imagem</div>
               <div class="upload-subtext">PNG, JPG ou WebP — máx. 2MB</div>
             </div>`
        }
      </div>
      <input type="file" id="f-imagem" accept="image/*" style="display:none" onchange="handleImageUpload(event)">
      <div class="upload-progress" id="upload-progress" style="display:none;">
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <span class="progress-label" id="progress-label">Enviando...</span>
      </div>
      <div style="display:flex; gap:8px; margin-top:10px; align-items:center;">
        <input type="text" id="f-imagem-url" value="${imagemURL}" placeholder="Ou cole a URL da imagem aqui" style="flex:1; font-size:11px;">
        ${imagemURL ? `<button class="btn-copiar" onclick="copiarLink('${imagemURL}')">Copiar URL</button>` : ''}
      </div>
    </div>

    <!-- Conteúdo -->
    <div class="form-section">
      <div class="section-title">Conteúdo do Card</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Duração</label>
          <input type="text" id="f-duracao" value="${d.duracao || ''}" placeholder="30 min">
        </div>
        <div class="form-group">
          <label>Pontos</label>
          <input type="number" id="f-pontos" value="${d.pontos || 0}" readonly style="opacity:0.6; cursor:not-allowed;" title="Calculado automaticamente (Quiz + Caça ao Bug)">
        </div>
        <div class="form-group">
          <label>Kit Necessário</label>
          <input type="text" id="f-kit" value="${d.kit || ''}" placeholder="BOX Maker Lab 3D">
        </div>
        <div class="form-group">
          <label>URL do Tutorial (QR Code)</label>
          <input type="url" id="f-tutorial" value="${d.tutorial_url || ''}" placeholder="https://...">
        </div>
        <div class="form-group full">
          <label>Objetivo *</label>
          <textarea id="f-objetivo" placeholder="Descreva o objetivo do desafio...">${d.objetivo || ''}</textarea>
        </div>
      </div>
    </div>

    <!-- Definição -->
    <div class="form-section">
      <div class="section-title">Definição</div>
      <div class="form-grid">
        <div class="form-group full">
          <label>Título da Definição</label>
          <input type="text" id="f-def-titulo" value="${d.definicao_titulo || ''}" placeholder="Ex: O que é o Arduino UNO?">
        </div>
        <div class="form-group full">
          <label>Texto</label>
          <textarea id="f-def-texto" placeholder="Descreva o conceito ou componente de forma clara e didática..." style="min-height:120px;">${d.definicao_texto || ''}</textarea>
        </div>
      </div>
    </div>

    <!-- Cards Vinculados -->
    <div class="form-section">
      <div class="section-title">Cards Vinculados</div>
      <div id="vinculados-loading" style="color:#aaa; font-size:12px; padding:8px 0;">Carregando cards disponíveis...</div>
      <div id="vinculados-grupos" style="display:none;">
        ${renderVinculadosGruposHTML()}
      </div>
    </div>

    <!-- Curiosidades -->
    <div class="form-section">
      <div class="section-title">Curiosidades</div>
      <div class="form-group">
        <textarea id="f-curiosidades" placeholder="Ex: Você sabia que o LED já vem embutido no Arduino no pino 13?&#10;Use * no início da linha para criar itens de lista." style="min-height:140px;">${d.curiosidades || ''}</textarea>
        <span class="helper-text">Use * no início da linha para criar itens de lista. Ex: * luzes de Natal 🎄</span>
      </div>
    </div>

    <!-- Avaliação -->
    <div class="form-section">
      <div class="section-title">Avaliação — Questões Reflexivas</div>
      <div class="form-group">
        <textarea id="f-avaliacao" placeholder="Ex: Responda no seu diário maker:&#10;1. O que significa configurar um pino como OUTPUT?&#10;2. O que acontece se você diminuir o tempo do delay?" style="min-height:140px;">${d.avaliacao || ''}</textarea>
        <span class="helper-text">Use numeração para as questões. Ex: 1. Primeira questão</span>
      </div>
    </div>

    <!-- Atividade Rápida -->
    <div class="form-section">
      <div class="section-title">Atividade Rápida</div>
      <div class="form-group">
        <label>Descrição da Atividade</label>
        <textarea id="f-ativ-descricao" placeholder="Descreva a atividade prática que o aluno irá realizar..." style="min-height:100px;">${d.atividade_descricao || ''}</textarea>
      </div>

      <div class="form-group" style="margin-top:16px;">
        <label>Imagem</label>
        <p style="font-size:11px;color:#8B9BB4;margin:2px 0 8px;">A imagem deve ser 2×1 — tamanho recomendado: <strong>800×400px</strong></p>
        <div class="upload-area upload-area-ativ ${d.atividade_imagem_url ? 'tem-imagem' : ''}" id="upload-area-ativ">
          ${d.atividade_imagem_url
            ? `<img src="${d.atividade_imagem_url}" alt="Imagem do circuito" class="upload-preview">
               <div class="upload-overlay" onclick="document.getElementById('f-ativ-imagem').click()">
                 <div class="upload-overlay-icon">📷</div>
                 <div class="upload-overlay-text">Trocar imagem</div>
               </div>`
            : `<div class="upload-placeholder" onclick="document.getElementById('f-ativ-imagem').click()">
                 <div class="upload-icon">🔌</div>
                 <div class="upload-text">Clique para fazer upload do circuito</div>
                 <div class="upload-subtext">PNG, JPG ou WebP — máx. 2MB</div>
               </div>`
          }
        </div>
        <input type="file" id="f-ativ-imagem" accept="image/*" style="display:none" onchange="handleAtivImageUpload(event)">
        <div class="upload-progress" id="upload-progress-ativ" style="display:none;">
          <div class="progress-bar"><div class="progress-fill" id="progress-fill-ativ"></div></div>
          <span class="progress-label" id="progress-label-ativ">Enviando...</span>
        </div>
        <div style="display:flex; gap:8px; margin-top:10px; align-items:center;">
          <input type="text" id="f-ativ-imagem-url" value="${d.atividade_imagem_url || ''}" placeholder="Ou cole a URL da imagem do circuito" style="flex:1; font-size:11px;">
          ${d.atividade_imagem_url ? `<button type="button" onclick="removerAtivImagem()"
            style="background:#fff0f0;color:#e74c3c;border:1.5px solid #f5c6c6;border-radius:7px;
                   padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;
                   font-family:'Inter Tight',sans-serif;">🗑 Remover</button>` : ''}
        </div>
      </div>

      <div class="form-group" style="margin-top:16px;">
        <label>Código Arduino IDE</label>
        <textarea id="f-ativ-codigo" placeholder="// Cole aqui o código Arduino&#10;void setup() {&#10;  pinMode(13, OUTPUT);&#10;}&#10;&#10;void loop() {&#10;  digitalWrite(13, HIGH);&#10;  delay(1000);&#10;  digitalWrite(13, LOW);&#10;  delay(1000);&#10;}" style="min-height:200px; font-family: 'Courier New', monospace; font-size:12px; background:#1e1e1e; color:#d4d4d4; border-radius:8px; padding:14px;">${d.atividade_codigo || ''}</textarea>
        <span class="helper-text">Cole o código completo do sketch Arduino (.ino)</span>
      </div>

      <div class="form-group" style="margin-top:20px;">
        <label>Glossário de Código</label>
        <span class="helper-text" style="display:block; margin-bottom:10px;">Explique cada linha ou função do código de forma simples.</span>
        <div class="glossario-table-wrap">
          <table class="glossario-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>O que faz?</th>
                <th style="width:40px;"></th>
              </tr>
            </thead>
            <tbody id="glossario-tbody">
              ${(d.glossario || []).map((g, i) => `
              <tr>
                <td><input type="text" class="glossario-input" value="${g.codigo || ''}" oninput="updateGlossario(${i}, 'codigo', this.value)" placeholder="ex: pinMode(13, OUTPUT)"></td>
                <td><input type="text" class="glossario-input" value="${g.descricao || ''}" oninput="updateGlossario(${i}, 'descricao', this.value)" placeholder="ex: Define o pino 13 como saída"></td>
                <td><button class="btn-remove" onclick="removeGlossario(${i})">×</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
          <button class="btn-add-glossario" onclick="addGlossario()">+ Adicionar linha</button>
        </div>
      </div>
    </div>

    <!-- Vídeo -->
    <div class="form-section">
      <div class="section-title">Assista como se faz!</div>
      <div class="form-group">
        <label>URL do Vídeo (YouTube)</label>
        <input type="url" id="f-video-url" value="${d.video_url || ''}" placeholder="https://www.youtube.com/watch?v=...">
        <span class="helper-text">Cole o link do YouTube. Funciona com links normais ou links de incorporação.</span>
      </div>
      ${d.video_url ? `
      <div class="video-preview-wrap">
        <iframe src="${converterYouTubeURL(d.video_url)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>` : ''}
    </div>

    <!-- Desafio Extra -->
    <div class="form-section">
      <div class="section-title">Desafio Extra</div>
      <div class="form-group">
        <textarea id="f-desafio-extra" placeholder="Ex: Agora é sua vez de evoluir o projeto:&#10;👉 Modifique o código para:&#10;* o LED piscar 3 vezes rápido&#10;* depois ficar apagado por 2 segundos&#10;💡 Dica: experimente usar delays menores!" style="min-height:140px;">${d.desafio_extra || ''}</textarea>
        <span class="helper-text">Use * para itens de lista e 💡 para dicas.</span>
      </div>
    </div>

    <!-- PAINEL JOGOS -->
    <div class="painel-jogos">
      <div class="painel-jogos-titulo">🎮 Jogos</div>

    <!-- Quiz -->
    <div class="form-section form-section-quiz">
      <div class="section-title-row">
        <span class="section-title">🎯 Atividade Quiz</span>
        <button class="btn-toggle-jogo" onclick="toggleQuiz()" id="btn-toggle-quiz">
          ▼ Criar Jogo
        </button>
      </div>
      <div id="quiz-body" style="display:none;">
        <span class="helper-text" style="display:block; margin-bottom:14px; margin-top:12px;">
          Cadastre perguntas com até 4 alternativas. O aluno ganha pontos ao responder corretamente.
        </span>
        <div class="form-row" style="margin-bottom:16px; align-items:flex-end;">
          <div class="form-group" style="max-width:220px;">
            <label>Tentativas permitidas</label>
            <input type="number" id="f-tentativas" min="1" max="10" value="${d.tentativas || 3}" placeholder="3">
            <span class="helper-text">Número máximo de vezes que o aluno pode jogar este quiz.</span>
          </div>
          <div style="margin-left:12px;">
            <button class="vg-btn-add" onclick="adicionarPergunta()">+ Pergunta</button>
          </div>
        </div>
        <div id="quiz-lista"></div>
      </div>
    </div>

    <!-- CAÇA AO BUG -->
    <div class="form-section form-section-bug">
      <div class="section-title-row">
        <span class="section-title">🐛 Caça ao Bug</span>
        <button class="btn-toggle-jogo" onclick="toggleBug()" id="btn-toggle-bug">
          ▼ Criar Jogo
        </button>
      </div>
      <div id="bug-body" style="display:none;">
        <span class="helper-text" style="display:block; margin-bottom:8px; margin-top:12px;">
          Cadastre códigos com erros. O aluno deve clicar nas linhas incorretas.
        </span>
        <div class="form-row" style="margin-bottom:16px; align-items:flex-end;">
          <div class="form-group" style="max-width:220px;">
            <label>Tentativas permitidas</label>
            <input type="number" id="f-bug-tentativas" min="1" max="10" value="${d.bug_tentativas || 3}">
            <span class="helper-text">Máximo de jogadas no Caça ao Bug.</span>
          </div>
          <div style="margin-left:12px;">
            <button class="vg-btn-add" onclick="adicionarBug()">+ Código</button>
          </div>
        </div>
        <div id="bug-lista"></div>
      </div>
    </div>

    <!-- QUAL COMPONENTE -->
    <div class="form-section form-section-comp">
      <div class="section-title-row">
        <span class="section-title">🔌 Qual Componente?</span>
        <button class="btn-toggle-jogo" onclick="toggleComp()" id="btn-toggle-comp">▼ Criar Jogo</button>
      </div>
      <div id="comp-body" style="display:none;">
        <span class="helper-text" style="display:block;margin-bottom:8px;margin-top:12px;">
          Crie perguntas com imagens de componentes. O aluno clica nos componentes corretos.
        </span>
        <div class="form-row" style="margin-bottom:16px;align-items:flex-end;">
          <div class="form-group" style="max-width:220px;">
            <label>Tentativas permitidas</label>
            <input type="number" id="f-comp-tentativas" min="1" max="10" value="${d.comp_tentativas || 3}">
          </div>
          <div style="margin-left:12px;">
            <button class="vg-btn-add" onclick="adicionarComp()">+ Pergunta</button>
          </div>
        </div>
        <div id="comp-lista"></div>
      </div>
    </div>

    <!-- ORDENA O CÓDIGO -->
    <div class="form-section form-section-ordena">
      <div class="section-title-row">
        <span class="section-title">🔀 Ordene o Código</span>
        <button class="btn-toggle-jogo" onclick="toggleOrdena()" id="btn-toggle-ordena">▼ Criar Jogo</button>
      </div>
      <div id="ordena-body" style="display:none;">
        <span class="helper-text" style="display:block;margin-bottom:8px;margin-top:12px;">
          Cole o código correto. Marque as linhas fixas (que não serão embaralhadas). O aluno arrasta para ordenar.
        </span>
        <div class="form-row" style="margin-bottom:16px;align-items:flex-end;">
          <div class="form-group" style="max-width:220px;">
            <label>Tentativas permitidas</label>
            <input type="number" id="f-ordena-tentativas" min="1" max="10" value="${d.ordena_tentativas || 3}">
          </div>
          <div style="margin-left:12px;">
            <button class="vg-btn-add" onclick="adicionarOrdena()">+ Desafio</button>
          </div>
        </div>
        <div id="ordena-lista"></div>
      </div>
    </div>

    <!-- COMPLETE O CÓDIGO -->
    <div class="form-section form-section-complete">
      <div class="section-title-row">
        <span class="section-title">📝 Complete o Código</span>
        <button class="btn-toggle-jogo" onclick="toggleComplete()" id="btn-toggle-complete">▼ Criar Jogo</button>
      </div>
      <div id="complete-body" style="display:none;">
        <span class="helper-text" style="display:block;margin-bottom:8px;margin-top:12px;">
          Cole o código usando <strong>___</strong> para marcar as lacunas. Defina 4 opções e qual é a correta para cada lacuna.
        </span>
        <div class="form-row" style="margin-bottom:16px;align-items:flex-end;">
          <div class="form-group" style="max-width:220px;">
            <label>Tentativas permitidas</label>
            <input type="number" id="f-complete-tentativas" min="1" max="10" value="${d.complete_tentativas || 3}">
          </div>
          <div style="margin-left:12px;">
            <button class="vg-btn-add" onclick="adicionarComplete()">+ Desafio</button>
          </div>
        </div>
        <div id="complete-lista"></div>
      </div>
    </div>

    <!-- CONECTA OS PONTOS -->
    <div class="form-section form-section-conecta">
      <div class="section-title-row">
        <span class="section-title">🔌 Conecta os Pontos</span>
        <button class="btn-toggle-jogo" onclick="toggleConecta()" id="btn-toggle-conecta">▼ Criar Jogo</button>
      </div>
      <div id="conecta-body" style="display:none;">
        <span class="helper-text" style="display:block;margin-bottom:8px;margin-top:12px;">
          Monte o circuito: adicione os componentes e defina quais devem ser conectados entre si.
        </span>
        <div class="form-row" style="margin-bottom:16px;align-items:flex-end;">
          <div class="form-group" style="max-width:220px;">
            <label>Tentativas permitidas</label>
            <input type="number" id="f-conecta-tentativas" min="1" max="10" value="${d.conecta_tentativas || 3}">
          </div>
          <div style="margin-left:12px;">
            <button class="vg-btn-add" onclick="adicionarConecta()">+ Desafio</button>
          </div>
        </div>
        <div id="conecta-lista"></div>
      </div>
    </div>

    <!-- SIMULADOR BOX -->
    <div class="form-section form-section-box">
      <div class="section-title-row">
        <span class="section-title">🔌 Simulador BOX</span>
        <button class="btn-toggle-jogo" onclick="toggleBox()" id="btn-toggle-box">▼ Criar Jogo</button>
      </div>
      <div id="box-body" style="display:none;">
        <span class="helper-text" style="display:block;margin-bottom:8px;margin-top:12px;">
          Crie desafios de montagem de circuito no BOX físico. Selecione os pinos que devem ser conectados.
        </span>

        <div class="form-row" style="margin-bottom:16px;align-items:flex-end;">
          <div class="form-group" style="max-width:220px;">
            <label>Tentativas permitidas</label>
            <input type="number" id="f-box-tentativas" min="1" max="10" value="${d.box_tentativas || 3}">
          </div>
          <div style="margin-left:12px;">
            <button class="vg-btn-add" onclick="adicionarBoxDesafio()" id="btn-add-box">+ Desafio</button>
          </div>
        </div>
        <div id="box-lista"></div>
      </div>
    </div>

    <!-- CÓDIGO BINÁRIO -->
    <div class="form-section form-section-binario">
      <div class="section-title-row">
        <span class="section-title">💜 Código Binário</span>
        <button class="btn-toggle-jogo" onclick="toggleBinario()" id="btn-toggle-binario">▼ Criar Jogo</button>
      </div>
      <div id="binario-body" style="display:none;">
        <span class="helper-text" style="display:block;margin-bottom:8px;margin-top:12px;">
          Cadastre números binários de 5 bits (ex: <strong>01101</strong>). O aluno converte para decimal com múltipla escolha.
        </span>
        <div class="form-row" style="margin-bottom:16px;align-items:flex-end;">
          <div class="form-group" style="max-width:220px;">
            <label>Tentativas permitidas</label>
            <input type="number" id="f-binario-tentativas" min="1" max="10" value="${d.binario_tentativas || 3}">
          </div>
          <div style="margin-left:12px;">
            <button class="vg-btn-add" onclick="adicionarBinario()">+ Desafio</button>
          </div>
        </div>
        <div id="binario-lista"></div>
      </div>
    </div>

    </div><!-- /painel-jogos -->

    <!-- Anexos -->
    <div class="form-section">
      <div class="section-title">Anexos</div>
      <div id="anexos-lista" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>
      <button class="vg-btn-add" onclick="adicionarAnexo()" style="margin-top:4px;">+ Adicionar Anexo</button>
      <span class="helper-text" style="display:block;margin-top:6px;">Links externos: PDF, Google Drive, sites, documentos, etc.</span>
    </div>

    ${id ? `
    <div class="form-section">
      <div class="section-title">Link do Card</div>
      <div class="card-link-box">
        <span class="card-link-url">${cardUrl}</span>
        <button class="btn-copiar" onclick="copiarLink('${cardUrl}')">Copiar</button>
      </div>
    </div>` : ''}
  `;

  carregarCardsVinculados();
  renderAnexos();
  renderQuizLista();
  recalcularPontos();
  renderBugLista();
  atualizarBtnQuiz();
  atualizarBtnBug();
  renderCompLista();
  atualizarBtnComp();
  renderOrdenaLista();
  atualizarBtnOrdena();
  renderCompleteLista();
  atualizarBtnComplete();
  renderConectaLista();
  atualizarBtnConecta();
  renderBoxLista();
  atualizarBtnBox();
  renderBinarioLista();
  atualizarBtnBinario();
  inicializarPainelJogos();
}

function inicializarPainelJogos() {
  const jogos = [
    { label: 'Quiz',              emoji: '🎯', cls: 'form-section-quiz',     bodyId: 'quiz-body',     state: window.quizState },
    { label: 'Caça ao Bug',       emoji: '🐛', cls: 'form-section-bug',      bodyId: 'bug-body',      state: window.bugState },
    { label: 'Qual Componente?',  emoji: '🔌', cls: 'form-section-comp',     bodyId: 'comp-body',     state: window.compState },
    { label: 'Ordena o Código',   emoji: '🔀', cls: 'form-section-ordena',   bodyId: 'ordena-body',   state: window.ordenaState },
    { label: 'Complete o Código', emoji: '📝', cls: 'form-section-complete', bodyId: 'complete-body', state: window.completeState },
    { label: 'Conecta os Pontos', emoji: '🔗', cls: 'form-section-conecta',  bodyId: 'conecta-body',  state: window.conectaState },
    { label: 'Simulador BOX',     emoji: '📦', cls: 'form-section-box',      bodyId: 'box-body',      state: window.boxState },
    { label: 'Código Binário',    emoji: '💻', cls: 'form-section-binario',  bodyId: 'binario-body',  state: window.binarioState },
  ];

  // Oculta todas as seções sem dados
  jogos.forEach(j => {
    const sec = document.querySelector('.' + j.cls);
    if (sec) sec.style.display = (j.state && j.state.length > 0) ? '' : 'none';
  });

  // Cria barra de botões
  const bar = document.createElement('div');
  bar.className = 'jogos-nav-bar';

  jogos.forEach(j => {
    const temDados = j.state && j.state.length > 0;
    const btn = document.createElement('button');
    btn.className = 'jogo-nav-btn' + (temDados ? ' tem-dados' : '');
    btn.innerHTML = `${j.emoji} ${j.label}${temDados ? ` <span class="jogo-nav-count">${j.state.length}</span>` : ''}`;
    btn.title = temDados ? `${j.state.length} item(s) criado(s)` : 'Clique para criar';

    btn.onclick = () => {
      const sec = document.querySelector('.' + j.cls);
      if (!sec) return;
      const visivel = sec.style.display !== 'none';
      sec.style.display = visivel ? 'none' : '';
      btn.classList.toggle('ativo', !visivel);
      // Ao abrir, expande o corpo do jogo se estiver colapsado
      if (!visivel) {
        const body = document.getElementById(j.bodyId);
        if (body && body.style.display === 'none') body.style.display = '';
        setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
      }
    };

    // Marca como ativo se a seção está visível
    if (temDados) btn.classList.add('ativo');
    bar.appendChild(btn);
  });

  // Insere a barra após o título do painel
  const titulo = document.querySelector('.painel-jogos-titulo');
  if (titulo) titulo.insertAdjacentElement('afterend', bar);
}

// ---- UPLOAD DE IMAGEM ----
window.handleImageUpload = async function (event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('⚠️ Imagem muito grande. Máximo 2MB.', 'error'); return; }

  const cardId = cardAtivo || document.getElementById('f-id')?.value?.trim().toLowerCase().replace(/\s+/g, '-');
  if (!cardId) { showToast('⚠️ Preencha o ID do card antes de fazer upload.', 'error'); return; }

  const ext        = file.name.split('.').pop();
  const storageRef = ref(storage, `cards/${cardId}/imagem.${ext}`);
  const uploadTask = uploadBytesResumable(storageRef, file);

  const progressEl = document.getElementById('upload-progress');
  const fillEl     = document.getElementById('progress-fill');
  const labelEl    = document.getElementById('progress-label');
  progressEl.style.display = 'block';

  uploadTask.on('state_changed',
    (snapshot) => {
      const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      fillEl.style.width  = pct + '%';
      labelEl.textContent = `Enviando... ${pct}%`;
    },
    (err) => { showToast(`❌ Erro no upload: ${err.message}`, 'error'); progressEl.style.display = 'none'; },
    async () => {
      const url = await getDownloadURL(uploadTask.snapshot.ref);
      imagemURL = url;
      progressEl.style.display = 'none';
      const area = document.getElementById('upload-area');
      area.classList.add('tem-imagem');
      area.innerHTML = `
        <img src="${url}" alt="Imagem do desafio" class="upload-preview">
        <div class="upload-overlay" onclick="document.getElementById('f-imagem').click()">
          <div class="upload-overlay-icon">📷</div>
          <div class="upload-overlay-text">Trocar imagem</div>
        </div>
      `;
      const fileInput = document.getElementById('f-imagem');
      if (fileInput) fileInput.value = '';
      const urlInput = document.getElementById('f-imagem-url');
      if (urlInput) urlInput.value = url;
      showToast('✅ Imagem enviada!', 'success');
    }
  );
};

// ---- UPLOAD IMAGEM ATIVIDADE ----
window.handleAtivImageUpload = async function (event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('⚠️ Imagem muito grande. Máximo 2MB.', 'error'); return; }

  const cardId = cardAtivo || document.getElementById('f-id')?.value?.trim().toLowerCase().replace(/\s+/g, '-');
  if (!cardId) { showToast('⚠️ Preencha o ID do card antes de fazer upload.', 'error'); return; }

  const ext        = file.name.split('.').pop();
  const storageRef = ref(storage, `cards/${cardId}/circuito.${ext}`);
  const uploadTask = uploadBytesResumable(storageRef, file);

  const progressEl = document.getElementById('upload-progress-ativ');
  const fillEl     = document.getElementById('progress-fill-ativ');
  const labelEl    = document.getElementById('progress-label-ativ');
  progressEl.style.display = 'block';

  uploadTask.on('state_changed',
    (snapshot) => {
      const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      fillEl.style.width  = pct + '%';
      labelEl.textContent = `Enviando... ${pct}%`;
    },
    (err) => { showToast(`❌ Erro: ${err.message}`, 'error'); progressEl.style.display = 'none'; },
    async () => {
      const url = await getDownloadURL(uploadTask.snapshot.ref);
      atividadeImagemURL = url;
      progressEl.style.display = 'none';
      const area = document.getElementById('upload-area-ativ');
      area.classList.add('tem-imagem');
      area.innerHTML = `
        <img src="${url}" alt="Imagem do circuito" class="upload-preview">
        <div class="upload-overlay" onclick="document.getElementById('f-ativ-imagem').click()">
          <div class="upload-overlay-icon">📷</div>
          <div class="upload-overlay-text">Trocar imagem</div>
        </div>
      `;
      document.getElementById('f-ativ-imagem').value = '';
      const urlInput = document.getElementById('f-ativ-imagem-url');
      if (urlInput) urlInput.value = url;
      showToast('✅ Imagem do circuito enviada!', 'success');
    }
  );
};

window.removerAtivImagem = function() {
  atividadeImagemURL = '';
  const urlInput = document.getElementById('f-ativ-imagem-url');
  if (urlInput) urlInput.value = '';
  const area = document.getElementById('upload-area-ativ');
  area.classList.remove('tem-imagem');
  area.innerHTML = `
    <div class="upload-placeholder" onclick="document.getElementById('f-ativ-imagem').click()">
      <div class="upload-icon">🔌</div>
      <div class="upload-text">Clique para fazer upload do circuito</div>
      <div class="upload-subtext">PNG, JPG ou WebP — máx. 2MB</div>
    </div>`;
  const btnRemover = document.querySelector('button[onclick="removerAtivImagem()"]');
  if (btnRemover) btnRemover.remove();
  showToast('🗑 Imagem do circuito removida', '');
};

// ---- TAGS (componentes livres) ----
function initTags(key, inputId, containerId) {
  renderTags(key, containerId);
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      tagsState[key].push(input.value.trim());
      input.value = '';
      renderTags(key, containerId);
    }
    if (e.key === 'Backspace' && input.value === '' && tagsState[key].length > 0) {
      tagsState[key].pop();
      renderTags(key, containerId);
    }
  });
}

function renderTags(key, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  tagsState[key].forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${tag}<button onclick="removeTag('${key}','${containerId}',${i})">×</button>`;
    container.appendChild(chip);
  });
}

window.removeTag = function (key, containerId, i) {
  tagsState[key].splice(i, 1);
  renderTags(key, containerId);
};

// ---- CARDS VINCULADOS ----
async function carregarCardsVinculados() {
  try {
    const snap  = await getDocs(collection(db, 'cards'));
    const vmap  = getVMAP();
    todosCards  = {};
    const porTipo = {};
    vmap.forEach(({ tipo }) => { porTipo[tipo] = []; });

    const docsV = [];
    snap.forEach(docSnap => docsV.push(docSnap));
    docsV.sort((a, b) => (a.data().numero || 0) - (b.data().numero || 0));

    const tipoDefault = vmap[0]?.tipo || 'Desafio';
    docsV.forEach(docSnap => {
      const d    = docSnap.data();
      const tipo = d.tipo || tipoDefault;
      todosCards[docSnap.id] = { nome: d.nome || docSnap.id, numero: d.numero || 0, tipo };
      if (docSnap.id === cardAtivo) return;
      if (!porTipo[tipo]) porTipo[tipo] = [];
      porTipo[tipo].push({ id: docSnap.id, data: d });
    });

    vmap.forEach(({ tipo, sel }) => {
      const el = document.getElementById(sel);
      if (!el) return;
      while (el.options.length > 1) el.remove(1);
      (porTipo[tipo] || []).forEach(({ id, data: d }) => {
        const opt = document.createElement('option');
        opt.value       = id;
        opt.textContent = `${String(d.numero || 0).padStart(2, '0')} — ${d.nome || id}`;
        el.appendChild(opt);
      });
    });

    vmap.forEach(({ key, sel, list }) => renderVinculadosList(key, list, sel));

    document.getElementById('vinculados-loading').style.display = 'none';
    document.getElementById('vinculados-grupos').style.display  = 'block';

  } catch (err) {
    const el = document.getElementById('vinculados-loading');
    if (el) el.textContent = 'Erro ao carregar: ' + err.message;
  }
}

function renderVinculadosList(key, listId, selId) {
  const container = document.getElementById(listId);
  if (!container) return;
  const ids = tagsState[key] || [];

  if (ids.length === 0) {
    container.innerHTML = '<div class="vg-empty">Nenhum card vinculado.</div>';
    return;
  }

  container.innerHTML = '';
  ids.forEach((id, i) => {
    const card  = todosCards[id];
    const label = card ? `${String(card.numero).padStart(2,'0')} — ${card.nome}` : id;
    const row   = document.createElement('div');
    row.className = 'vg-item';
    row.innerHTML = `
      <span class="vg-item-label">${label}</span>
      <button class="vg-item-del" onclick="removeVinculado('${key}','${listId}','${selId}',${i})">Excluir</button>
    `;
    container.appendChild(row);
  });
}

window.addVinculado = function (key, selId, listId) {
  const sel = document.getElementById(selId);
  if (!sel || !sel.value) { showToast('⚠️ Selecione um card.', 'error'); return; }
  const val = sel.value;
  if (!tagsState[key]) tagsState[key] = [];
  if (tagsState[key].includes(val)) { showToast('⚠️ Card já vinculado.', 'error'); sel.value = ''; return; }
  tagsState[key].push(val);
  sel.value = '';
  renderVinculadosList(key, listId, selId);
};

window.removeVinculado = function (key, listId, selId, i) {
  tagsState[key].splice(i, 1);
  renderVinculadosList(key, listId, selId);
};

// ---- DIFF DE CAMPOS ----
const CAMPOS_DIFF = [
  'nome','nivel','tipo','tema','definicao_titulo','definicao_texto','duracao','kit',
  'objetivo','tutorial_url','curiosidades','atividade_descricao','atividade_codigo',
  'avaliacao','desafio_extra','video_url','publicado',
  'imagem_url','atividade_imagem_url',
  'quiz','bug_codigos','comp_perguntas','ordena_desafios','complete_desafios',
  'conecta_desafios','box_desafios','binario_desafios','glossario','anexos'
];

const DIFF_LABELS = {
  nome:'Nome', nivel:'Nível', tipo:'Tipo', tema:'Tema',
  definicao_titulo:'Definição — Título', definicao_texto:'Definição — Texto',
  duracao:'Duração', kit:'Kit', objetivo:'Objetivo', tutorial_url:'URL Tutorial',
  curiosidades:'Curiosidades', atividade_descricao:'Atividade — Descrição',
  atividade_codigo:'Atividade — Código', avaliacao:'Avaliação',
  desafio_extra:'Desafio Extra', video_url:'URL Vídeo', publicado:'Publicado',
  imagem_url:'Imagem de Capa', atividade_imagem_url:'Imagem da Atividade',
  quiz:'Quiz', bug_codigos:'Caça ao Bug', comp_perguntas:'Qual Componente',
  ordena_desafios:'Ordena Código', complete_desafios:'Complete o Código',
  conecta_desafios:'Conecta os Pontos', box_desafios:'BOX', binario_desafios:'Binário',
  glossario:'Glossário', anexos:'Anexos',
  pergunta:'Pergunta', resposta:'Resposta', respostas:'Respostas', correta:'Correta',
  pontos:'Pontos', codigo:'Código', titulo:'Título', linhas:'Linhas',
  componente:'Componente', pares:'Pares', a:'A', b:'B', descricao:'Descrição', url:'URL',
};

function humanizarCampo(path) {
  return path
    .replace(/\[(\d+)\]/g, (_, n) => `[${+n + 1}]`)
    .split('.')
    .map(p => {
      const m = p.match(/^(.+?)(\[\d+\])$/);
      if (m) return (DIFF_LABELS[m[1]] || m[1]) + ' ' + m[2];
      return DIFF_LABELS[p] || p;
    })
    .join(' › ');
}

function gerarDiff(prev, curr, path = '') {
  if (prev === undefined) prev = null;
  if (curr === undefined) curr = null;
  if (JSON.stringify(prev) === JSON.stringify(curr)) return [];
  const diffs = [];
  if (Array.isArray(prev) || Array.isArray(curr)) {
    const a = Array.isArray(prev) ? prev : [];
    const b = Array.isArray(curr) ? curr : [];
    for (let i = 0; i < Math.max(a.length, b.length); i++)
      diffs.push(...gerarDiff(a[i] ?? null, b[i] ?? null, `${path}[${i}]`));
    return diffs;
  }
  if (prev !== null && curr !== null && typeof prev === 'object' && typeof curr === 'object') {
    for (const k of new Set([...Object.keys(prev), ...Object.keys(curr)]))
      diffs.push(...gerarDiff(prev[k] ?? null, curr[k] ?? null, path ? `${path}.${k}` : k));
    return diffs;
  }
  const antes = prev === null ? '(vazio)' : String(prev);
  const depois = curr === null ? '(vazio)' : String(curr);
  if (antes !== depois)
    diffs.push({ campo: path, label: humanizarCampo(path), antes: antes.slice(0, 300), depois: depois.slice(0, 300) });
  return diffs;
}

// ---- SALVAR ----
window.salvarCard = async function (publicar) {
  const id = cardAtivo || document.getElementById('f-id')?.value?.trim().toLowerCase().replace(/\s+/g, '-');
  if (!id) { showToast('⚠️ Informe o ID do card', 'error'); return; }
  const nome = document.getElementById('f-nome')?.value?.trim();
  if (!nome) { showToast('⚠️ Informe o nome do desafio', 'error'); return; }

  const urlCampo = document.getElementById('f-imagem-url')?.value?.trim();
  if (urlCampo) imagemURL = urlCampo;

  const data = {
    numero:           parseInt(document.getElementById('f-numero')?.value) || 0,
    nome,
    nivel:            document.getElementById('f-nivel')?.value || '',
    tipo:             document.getElementById('f-tipo')?.value || '',
    tema:             document.getElementById('f-tema')?.value || '',
    definicao_titulo: document.getElementById('f-def-titulo')?.value?.trim() || '',
    definicao_texto:  document.getElementById('f-def-texto')?.value?.trim() || '',
    duracao:          document.getElementById('f-duracao')?.value?.trim() || '',
    pontos:           parseFloat(document.getElementById('f-pontos')?.value) || 0,
    kit:              document.getElementById('f-kit')?.value?.trim() || '',
    objetivo:         document.getElementById('f-objetivo')?.value?.trim() || '',
    tutorial_url:     document.getElementById('f-tutorial')?.value?.trim() || '',
    imagem_url:       imagemURL,
    ...Object.fromEntries(Object.entries(tagsState).filter(([k]) => k.startsWith('links_'))),
    curiosidades:     document.getElementById('f-curiosidades')?.value?.trim() || '',
    atividade_descricao:  document.getElementById('f-ativ-descricao')?.value?.trim() || '',
    atividade_imagem_url: document.getElementById('f-ativ-imagem-url')?.value?.trim() || atividadeImagemURL,
    atividade_codigo:     document.getElementById('f-ativ-codigo')?.value?.trim() || '',
    glossario:            window.glossarioState.filter(g => g.codigo || g.descricao),
    avaliacao:        document.getElementById('f-avaliacao')?.value?.trim() || '',
    anexos:           window.anexosState.filter(a => a.titulo || a.url),
    desafio_extra:    document.getElementById('f-desafio-extra')?.value?.trim() || '',
    quiz:             window.quizState || [],
    bug_codigos:      window.bugState || [],
    bug_tentativas:   parseInt(document.getElementById('f-bug-tentativas')?.value) || 3,
    comp_perguntas:   window.compState || [],
    comp_tentativas:  parseInt(document.getElementById('f-comp-tentativas')?.value) || 3,
    ordena_desafios:  window.ordenaState || [],
    ordena_tentativas: parseInt(document.getElementById('f-ordena-tentativas')?.value) || 3,
    complete_desafios:  window.completeState || [],
    complete_tentativas: parseInt(document.getElementById('f-complete-tentativas')?.value) || 3,
    conecta_desafios:   window.conectaState  || [],
    conecta_tentativas: parseInt(document.getElementById('f-conecta-tentativas')?.value) || 3,
    box_desafios:       window.boxState      || [],
    box_tentativas:     parseInt(document.getElementById('f-box-tentativas')?.value) || 3,
    binario_desafios:   window.binarioState  || [],
    binario_tentativas: parseInt(document.getElementById('f-binario-tentativas')?.value) || 3,
    tentativas:       parseInt(document.getElementById('f-tentativas')?.value) || 3,
    video_url:        document.getElementById('f-video-url')?.value?.trim() || '',
    publicado:        publicar,
    atualizado_em:    new Date().toISOString()
  };

  try {
    const auth = getAuth();
    const user = auth.currentUser;
    const entrada = {
      nome:  user?.displayName || '',
      email: user?.email || '',
      acao:  cardAtivo ? 'alterado' : 'criado',
      status: publicar ? 'publicado' : 'rascunho',
      data:  new Date().toISOString()
    };

    // Busca dados anteriores para preservar campos que o form não gerencia
    let historicoAnterior = [];
    let iaConteudoAnterior = '';
    let iaDescAnterior = '';
    let iaPromptAnterior = '';
    const snapAnterior = await getDoc(doc(db, 'cards', id));
    if (snapAnterior.exists()) {
      const dadosAnt      = snapAnterior.data();
      historicoAnterior   = dadosAnt.historico   || [];
      iaConteudoAnterior  = dadosAnt.ia_conteudo             || '';
      iaDescAnterior      = dadosAnt.ia_desc_complementar   || '';
      iaPromptAnterior    = dadosAnt.ia_prompt_usado         || '';
      // Gera diff campo a campo
      const CAMPOS_JOGOS = new Set(['quiz','bug_codigos','comp_perguntas','ordena_desafios','complete_desafios','conecta_desafios','box_desafios','binario_desafios']);
      const diff = [];
      CAMPOS_DIFF.forEach(k => {
        if (CAMPOS_JOGOS.has(k)) {
          const ant = (dadosAnt[k] || []).length;
          const nov = (data[k] || []).length;
          if (ant !== nov) diff.push({ campo: k, label: DIFF_LABELS[k] || k, antes: `${ant} fase${ant !== 1 ? 's' : ''}`, depois: `${nov} fase${nov !== 1 ? 's' : ''}` });
        } else {
          diff.push(...gerarDiff(dadosAnt[k] ?? null, data[k] ?? null, k));
        }
      });
      entrada.diff = diff.slice(0, 150);
    } else {
      entrada.diff = [];
    }

    await setDoc(doc(db, 'cards', id), {
      ...data,
      historico: [...historicoAnterior, entrada],
      ...(iaConteudoAnterior ? { ia_conteudo: iaConteudoAnterior }               : {}),
      ...(iaDescAnterior     ? { ia_desc_complementar: iaDescAnterior }           : {}),
      ...(iaPromptAnterior   ? { ia_prompt_usado: iaPromptAnterior }              : {})
    });
    cardAtivo = id;
    showToast(publicar ? '🚀 Card publicado!' : '💾 Rascunho salvo!', 'success');
    await listarCards();
    document.querySelectorAll('.card-item').forEach(item => {
      if (item.dataset.id === id) item.classList.add('active');
    });
  } catch (err) {
    showToast(`❌ Erro: ${err.message}`, 'error');
  }
};

// ---- HISTÓRICO DO CARD ----
window.abrirHistoricoCard = async function(id) {
  document.getElementById('modal-historico')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-historico';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box modal-box-lg">
      <div class="modal-header">
        <div class="modal-title">📋 Histórico de Modificações</div>
        <button class="modal-close" onclick="document.getElementById('modal-historico').remove()">×</button>
      </div>
      <div class="modal-body modal-scroll" id="historico-body">
        <div style="text-align:center;padding:24px;color:#aaa;">Carregando...</div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  try {
    const snap = await getDoc(doc(db, 'cards', id));
    const historico = snap.exists() ? (snap.data().historico || []) : [];
    const body = document.getElementById('historico-body');

    if (historico.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:24px;color:#aaa;font-size:13px;">Nenhum histórico registrado ainda.</div>';
      return;
    }

    // Agrupa por usuário + data (dia)
    const grupos = {};
    historico.forEach(h => {
      const dia = new Date(h.data).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
      const chave = `${h.email || 'anon'}__${dia}`;
      if (!grupos[chave]) {
        grupos[chave] = { ...h, diaFmt: dia, entradas: [] };
      }
      grupos[chave].entradas.push(new Date(h.data));
      // Mantém o status da última entrada do grupo
      grupos[chave].status = h.status;
      grupos[chave].acao   = h.acao;
    });

    const lista = Object.values(grupos).reverse();
    body.innerHTML = lista.map((g, i) => {
      const acaoColor = g.acao === 'criado' ? '#27ae60' : '#2980b9';
      const datas = g.entradas.sort((a, b) => a - b);
      const horaInicio = datas[0].toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
      const horaFim    = datas[datas.length - 1].toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
      const qtd = datas.length;
      const statusBadge = g.status === 'publicado'
        ? '<span style="background:#e8f8f0;color:#27ae60;border:1px solid #a9e4c3;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;">PUBLICADO</span>'
        : '<span style="background:#f5f5f5;color:#888;border:1px solid #ddd;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;">RASCUNHO</span>';
      const qtdBadge = qtd > 1
        ? `<span style="background:#f0f4ff;color:#2c5fc3;border:1px solid #c2d1f5;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;">${qtd}x alterações</span>`
        : '';
      const horario = qtd > 1
        ? `${g.diaFmt} · ${horaInicio} → ${horaFim}`
        : `${g.diaFmt} às ${horaInicio}`;
      return `
        <div style="display:flex;gap:14px;align-items:flex-start;padding:14px 0;${i < lista.length-1 ? 'border-bottom:1px solid #f0f0f0;' : ''}">
          <div style="width:36px;height:36px;border-radius:50%;background:${acaoColor}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;">
            ${g.acao === 'criado' ? '✨' : '✏️'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
              <span style="font-weight:700;color:#1a2340;font-size:13px;">${g.nome || g.email || 'Usuário desconhecido'}</span>
              <span style="background:${acaoColor}20;color:${acaoColor};border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;text-transform:uppercase;">${g.acao}</span>
              ${statusBadge}
              ${qtdBadge}
            </div>
            <div style="font-size:11px;color:#999;">${g.email || ''}</div>
            <div style="font-size:11px;color:#bbb;margin-top:2px;">${horario}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch(err) {
    const body = document.getElementById('historico-body');
    if (body) body.innerHTML = `<div style="color:#e74c3c;padding:16px;font-size:13px;">Erro: ${err.message}</div>`;
  }
};

// ---- YOUTUBE URL CONVERTER ----
function converterYouTubeURL(url) {
  if (!url) return '';
  // Já é embed
  if (url.includes('youtube.com/embed/')) return url;
  // youtu.be/ID
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch) return 'https://www.youtube.com/embed/' + shortMatch[1];
  // youtube.com/watch?v=ID
  const watchMatch = url.match(/[?&]v=([^?&]+)/);
  if (watchMatch) return 'https://www.youtube.com/embed/' + watchMatch[1];
  return url;
}
window.converterYouTubeURL = converterYouTubeURL;

// ---- GLOSSÁRIO ----
window.addGlossario = function() {
  window.glossarioState.push({ codigo: '', descricao: '' });
  renderGlossarioRow();
};

window.removeGlossario = function(i) {
  window.glossarioState.splice(i, 1);
  rebuildGlossario();
};

window.updateGlossario = function(i, field, value) {
  if (window.glossarioState[i]) window.glossarioState[i][field] = value;
};

function makeGlossarioRow(i, codigo, descricao) {
  const tr = document.createElement('tr');
  const tdCodigo = document.createElement('td');
  const tdDescricao = document.createElement('td');
  const tdAcao = document.createElement('td');

  const inputCodigo = document.createElement('input');
  inputCodigo.type = 'text';
  inputCodigo.className = 'glossario-input';
  inputCodigo.value = (codigo || '').replace(/^`+|`+$/g, '').trim();
  inputCodigo.placeholder = 'ex: pinMode(13, OUTPUT)';
  inputCodigo.oninput = function() { updateGlossario(i, 'codigo', this.value); };

  const inputDescricao = document.createElement('input');
  inputDescricao.type = 'text';
  inputDescricao.className = 'glossario-input';
  inputDescricao.value = (descricao || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
  inputDescricao.placeholder = 'ex: Define o pino 13 como saída';
  inputDescricao.oninput = function() { updateGlossario(i, 'descricao', this.value); };

  const btnRemove = document.createElement('button');
  btnRemove.className = 'btn-remove';
  btnRemove.textContent = '×';
  btnRemove.onclick = function() { removeGlossario(i); };

  tdCodigo.appendChild(inputCodigo);
  tdDescricao.appendChild(inputDescricao);
  tdAcao.appendChild(btnRemove);
  tr.appendChild(tdCodigo);
  tr.appendChild(tdDescricao);
  tr.appendChild(tdAcao);
  return tr;
}

function renderGlossarioRow() {
  const tbody = document.getElementById('glossario-tbody');
  if (!tbody) return;
  const i = window.glossarioState.length - 1;
  tbody.appendChild(makeGlossarioRow(i, '', ''));
}

function rebuildGlossario() {
  const tbody = document.getElementById('glossario-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  window.glossarioState.forEach((g, i) => {
    tbody.appendChild(makeGlossarioRow(i, g.codigo, g.descricao));
  });
}

// ---- ANEXOS ----
window.anexosState = [];

window.adicionarAnexo = function() {
  window.anexosState.push({ titulo: '', url: '' });
  renderAnexos();
};

window.removerAnexo = function(i) {
  window.anexosState.splice(i, 1);
  renderAnexos();
};

window.renderAnexos = function() {
  const lista = document.getElementById('anexos-lista');
  if (!lista) return;
  lista.innerHTML = '';
  window.anexosState.forEach((a, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;';
    row.innerHTML = `
      <input type="text" placeholder="Título (ex: Guia do Projeto)" value="${a.titulo || ''}"
        oninput="window.anexosState[${i}].titulo=this.value"
        style="flex:1;padding:8px 10px;border:1px solid #ddd;border-radius:7px;font-size:13px;">
      <input type="url" placeholder="https://..." value="${a.url || ''}"
        oninput="window.anexosState[${i}].url=this.value"
        style="flex:2;padding:8px 10px;border:1px solid #ddd;border-radius:7px;font-size:13px;">
      <button onclick="removerAnexo(${i})" title="Remover"
        style="padding:6px 10px;border:none;background:#fee;color:#c0392b;border-radius:7px;cursor:pointer;font-size:14px;">✕</button>
    `;
    lista.appendChild(row);
  });
};

function initAnexos() {
  renderAnexos();
}

// ---- DELETAR ----
window.deletarCard = async function (id) {
  // Apenas gestores podem excluir
  if (window._perfilAtual !== 'gestor') {
    showToast('❌ Apenas gestores podem excluir cards.', 'error');
    return;
  }

  showToast('🔍 Verificando vínculos...', '');

  try {
    const COLECOES_RESULTADO = [
      'resultados_quiz','resultados_bug','resultados_comp',
      'resultados_ordena','resultados_complete','resultados_conecta',
      'resultados_box','resultados_binario'
    ];

    // Trilhas que contêm este card
    const trilhasVinculadas = [];
    try {
      const trilhasSnap = await getDocs(collection(db, 'trilhas'));
      trilhasSnap.forEach(d => {
        if ((d.data().cards || []).includes(id))
          trilhasVinculadas.push({ id: d.id, nome: d.data().nome || d.id });
      });
    } catch(_) {}

    // Resultados de alunos por coleção (ignora se sem permissão)
    const resultadosVinculados = [];
    for (const colecao of COLECOES_RESULTADO) {
      try {
        const snap = await getDocs(collection(db, colecao));
        let qtd = 0;
        snap.forEach(d => { if (d.id.includes(id)) qtd++; });
        if (qtd > 0) resultadosVinculados.push({ colecao, qtd });
      } catch(_) {}
    }

    // Monta modal de confirmação
    document.getElementById('modal-deletar-card')?.remove();
    const modal = document.createElement('div');
    modal.id = 'modal-deletar-card';
    modal.className = 'modal-overlay';

    const trilhasHTML = trilhasVinculadas.length > 0
      ? `<div style="margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:#e74c3c;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
            🗺️ Trilhas vinculadas (${trilhasVinculadas.length})
          </div>
          ${trilhasVinculadas.map(t =>
            `<div style="padding:5px 10px;background:#fff5f5;border-radius:6px;font-size:13px;color:#2f3447;margin-bottom:4px;">
              ${t.nome}
            </div>`
          ).join('')}
          <div style="font-size:11px;color:#e67e22;margin-top:4px;">→ O card será removido dessas trilhas.</div>
        </div>`
      : `<div style="font-size:13px;color:#27ae60;margin-bottom:8px;">✅ Nenhuma trilha vinculada.</div>`;

    const resultadosHTML = resultadosVinculados.length > 0
      ? `<div style="margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:#e74c3c;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
            📊 Resultados de alunos
          </div>
          ${resultadosVinculados.map(r =>
            `<div style="padding:5px 10px;background:#fff5f5;border-radius:6px;font-size:13px;color:#2f3447;margin-bottom:4px;">
              ${r.colecao} — <strong>${r.qtd}</strong> registro(s)
            </div>`
          ).join('')}
          <div style="font-size:11px;color:#e67e22;margin-top:4px;">→ Todos os resultados serão excluídos permanentemente.</div>
        </div>`
      : `<div style="font-size:13px;color:#27ae60;margin-bottom:8px;">✅ Nenhum resultado de aluno.</div>`;

    modal.innerHTML = `
      <div class="modal-box" style="max-width:500px;">
        <div class="modal-header" style="border-bottom:2px solid #fdd;">
          <div class="modal-title" style="color:#e74c3c;">🗑 Excluir Card: ${id}</div>
          <button class="modal-close" onclick="document.getElementById('modal-deletar-card').remove()">×</button>
        </div>
        <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:8px;">
          <div style="background:#fff8f8;border:1.5px solid #fdd;border-radius:10px;padding:14px;margin-bottom:4px;">
            ${trilhasHTML}
            ${resultadosHTML}
          </div>
          <p style="font-size:13px;color:#666;margin:0;">
            Esta ação <strong>não pode ser desfeita</strong>. Todo o conteúdo do card será removido permanentemente.
          </p>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;padding:14px 20px;border-top:1px solid #eee;">
          <button onclick="document.getElementById('modal-deletar-card').remove()"
            style="background:#fff;color:#555;border:1.5px solid #ddd;padding:9px 18px;
                   border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter Tight',sans-serif;">
            Cancelar
          </button>
          <button onclick="window._confirmarDeletarCard('${id}')"
            style="background:#e74c3c;color:#fff;border:none;padding:10px 24px;
                   border-radius:8px;font-size:13px;font-weight:800;cursor:pointer;font-family:'Inter Tight',sans-serif;">
            🗑 Confirmar Exclusão
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Guarda os vínculos para usar na confirmação
    window._deletarCardVinculos = { trilhas: trilhasVinculadas, resultados: resultadosVinculados };

  } catch (err) {
    showToast(`❌ Erro: ${err.message}`, 'error');
  }
};

window._confirmarDeletarCard = async function(id) {
  document.getElementById('modal-deletar-card')?.remove();
  const { trilhas, resultados } = window._deletarCardVinculos || { trilhas: [], resultados: [] };

  const COLECOES_RESULTADO = [
    'resultados_quiz','resultados_bug','resultados_comp',
    'resultados_ordena','resultados_complete','resultados_conecta',
    'resultados_box','resultados_binario'
  ];

  try {
    showToast('⏳ Excluindo...', '');

    // 1. Remove card das trilhas
    await Promise.all(trilhas.map(t =>
      setDoc(doc(db, 'trilhas', t.id), { cards: arrayRemove(id) }, { merge: true })
    ));

    // 2. Deleta resultados de alunos
    const deleteOps = [];
    for (const colecao of COLECOES_RESULTADO) {
      const snap = await getDocs(collection(db, colecao));
      snap.forEach(d => { if (d.id.includes(id)) deleteOps.push(deleteDoc(doc(db, colecao, d.id))); });
    }
    await Promise.all(deleteOps);

    // 3. Deleta o card
    await deleteDoc(doc(db, 'cards', id));

    showToast('🗑 Card excluído e todos os vínculos removidos.', 'success');
    cardAtivo = null;
    document.getElementById('main-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🃏</div>
        <p>Card excluído.<br>Selecione outro ou crie um novo.</p>
      </div>`;
    await listarCards();
  } catch (err) {
    showToast(`❌ Erro: ${err.message}`, 'error');
  }
};

// ---- COPIAR LINK ----
window.copiarLink = function (url) {
  navigator.clipboard.writeText(url).then(() => showToast('🔗 Link copiado!', 'success'));
};

carregarTiposCard().then(() => listarCards());

// ==============================
// ---- QUIZ ----
// ==============================

window.quizState = [];

window.toggleQuiz = function() {
  const body = document.getElementById('quiz-body');
  const btn  = document.getElementById('btn-toggle-quiz');
  if (!body) return;
  const aberto = body.style.display !== 'none';
  body.style.display = aberto ? 'none' : 'block';
  const n = window.quizState.length;
  btn.textContent = aberto
    ? (n > 0 ? '▼ Editar Perguntas (' + n + ')' : '▼ Criar Jogo')
    : (n > 0 ? '▲ Fechar (' + n + ' pergunta' + (n !== 1 ? 's' : '') + ')' : '▲ Fechar');
};

function renderQuizLista() {
  const lista = document.getElementById('quiz-lista');
  if (!lista) return;

  if (window.quizState.length === 0) {
    lista.innerHTML = '<div class="quiz-empty">Nenhuma pergunta cadastrada. Clique em + Pergunta para começar.</div>';
    return;
  }

  lista.innerHTML = '';
  window.quizState.forEach((q, qi) => {
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.innerHTML = `
      <div class="quiz-card-header">
        <span class="quiz-card-num">Pergunta ${qi + 1}</span>
        <button class="quiz-btn-rem" onclick="removerPergunta(${qi})">× Remover</button>
      </div>
      <div class="form-group">
        <label>Pergunta *</label>
        <textarea class="quiz-pergunta-input" rows="3"
          oninput="updateQuiz(${qi}, 'pergunta', this.value)"
          placeholder="Ex: Qual é a função do resistor no circuito?">${q.pergunta || ''}</textarea>
        <span class="helper-text">💡 Para incluir código, envolva com três crases antes e depois do código.</span>
      </div>
      <div class="form-group">
        <label>Pontos</label>
        <input type="number" step="0.5" min="0.5" value="${q.pontos || 1.0}"
          style="width:100px;"
          oninput="updateQuiz(${qi}, 'pontos', parseFloat(this.value))">
      </div>
      <div class="quiz-alternativas">
        <label>Alternativas</label>
        ${[0,1,2,3].map(ai => `
          <div class="quiz-alt-row ${q.correta === ai ? 'correta' : ''}">
            <input type="radio" name="quiz-correta-${qi}" value="${ai}"
              ${q.correta === ai ? 'checked' : ''}
              onchange="updateQuiz(${qi}, 'correta', ${ai}); renderQuizLista();"
              title="Marcar como correta">
            <input type="text" class="quiz-alt-input"
              value="${(q.alternativas && q.alternativas[ai]) || ''}"
              oninput="updateQuizAlt(${qi}, ${ai}, this.value)"
              placeholder="Alternativa ${String.fromCharCode(65+ai)}">
          </div>`).join('')}
      </div>
      <div class="form-group" style="margin-top:10px;">
        <label>Feedback (mostrado após responder)</label>
        <input type="text" value="${q.feedback || ''}"
          oninput="updateQuiz(${qi}, 'feedback', this.value)"
          placeholder="Ex: Correto! O resistor limita a corrente elétrica.">
      </div>
    `;
    lista.appendChild(card);
  });
}

window.adicionarPergunta = function() {
  window.quizState.push({
    pergunta:     '',
    alternativas: ['', '', '', ''],
    correta:      0,
    feedback:     '',
    pontos:       1.0
  });
  renderQuizLista();
  recalcularPontos();
  atualizarBtnQuiz();
  atualizarBtnBug();
  renderCompLista();
  atualizarBtnComp();
  renderOrdenaLista();
  atualizarBtnOrdena();
  renderCompleteLista();
  atualizarBtnComplete();
  renderConectaLista();
  atualizarBtnConecta();
  renderBoxLista();
  atualizarBtnBox();
};

window.removerPergunta = function(qi) {
  window.quizState.splice(qi, 1);
  renderQuizLista();
  recalcularPontos();
  atualizarBtnQuiz();
  atualizarBtnBug();
  renderCompLista();
  atualizarBtnComp();
  renderOrdenaLista();
  atualizarBtnOrdena();
  renderCompleteLista();
  atualizarBtnComplete();
  renderConectaLista();
  atualizarBtnConecta();
  renderBoxLista();
  atualizarBtnBox();
};

window.updateQuiz = function(qi, field, value) {
  if (window.quizState[qi]) window.quizState[qi][field] = value;
  recalcularPontos();
};

function atualizarBtnQuiz() {
  const btn  = document.getElementById('btn-toggle-quiz');
  const body = document.getElementById('quiz-body');
  if (!btn || !body) return;
  const aberto = body.style.display !== 'none';
  const n = window.quizState.length;
  btn.textContent = aberto
    ? (n > 0 ? '▲ Fechar (' + n + ' pergunta' + (n !== 1 ? 's' : '') + ')' : '▲ Fechar')
    : (n > 0 ? '▼ Editar Perguntas (' + n + ')' : '▼ Criar Jogo');
}

function recalcularPontos() {
  const totalQuiz = (window.quizState  || []).reduce((sum, q) => sum + (parseFloat(q.pontos) || 1.0), 0);
  const totalBug  = (window.bugState   || []).reduce((sum, b) => sum + (parseFloat(b.pontos) || 1.0), 0);
  const totalComp   = (window.compState   || []).reduce((sum, c) => sum + (parseFloat(c.pontos) || 1.0), 0);
  const totalOrdena   = (window.ordenaState   || []).reduce((sum, o) => sum + (parseFloat(o.pontos) || 1.0), 0);
  const totalComplete = (window.completeState || []).reduce((sum, c) => sum + (parseFloat(c.pontos) || 1.0), 0);
  const totalConecta  = (window.conectaState  || []).reduce((sum, c) => sum + (parseFloat(c.pontos) || 2.0), 0);
  const totalBox      = (window.boxState      || []).reduce((sum, b) => sum + (parseFloat(b.pontos) || 2.0), 0);
  const totalBinario  = (window.binarioState  || []).reduce((sum, b) => sum + (parseFloat(b.pontos) || 1.0), 0);
  const total         = totalQuiz + totalBug + totalComp + totalOrdena + totalComplete + totalConecta + totalBox + totalBinario;
  const el = document.getElementById('f-pontos');
  if (el) el.value = total % 1 === 0 ? total : total.toFixed(1);
}

window.updateQuizAlt = function(qi, ai, value) {
  if (!window.quizState[qi]) return;
  if (!window.quizState[qi].alternativas) window.quizState[qi].alternativas = ['','','',''];
  window.quizState[qi].alternativas[ai] = value;
};

// ==============================
// ---- CAÇA AO BUG ----
// ==============================

window.bugState = [];

window.toggleBug = function() {
  const body = document.getElementById('bug-body');
  const btn  = document.getElementById('btn-toggle-bug');
  if (!body) return;
  const aberto = body.style.display !== 'none';
  body.style.display = aberto ? 'none' : 'block';
  atualizarBtnBug();
};

function atualizarBtnBug() {
  const btn  = document.getElementById('btn-toggle-bug');
  const body = document.getElementById('bug-body');
  if (!btn || !body) return;
  const aberto = body.style.display !== 'none';
  const n = window.bugState.length;
  btn.textContent = aberto
    ? (n > 0 ? '▲ Fechar (' + n + ' código' + (n !== 1 ? 's' : '') + ')' : '▲ Fechar')
    : (n > 0 ? '▼ Editar Códigos (' + n + ')' : '▼ Criar Jogo');
}

function renderBugLista() {
  const lista = document.getElementById('bug-lista');
  if (!lista) return;

  if (window.bugState.length === 0) {
    lista.innerHTML = '<div class="quiz-empty">Nenhum código cadastrado. Clique em + Código para começar.</div>';
    return;
  }

  lista.innerHTML = '';
  window.bugState.forEach((b, bi) => {
    const linhas = (b.codigo || '').split('\n');

    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.innerHTML = `
      <div class="quiz-card-header">
        <span class="quiz-card-num">Código ${bi + 1}</span>
        <button class="quiz-btn-rem" onclick="removerBug(${bi})">× Remover</button>
      </div>
      <div class="form-group">
        <label>Pontos</label>
        <input type="number" step="0.5" min="0.5" value="${b.pontos || 1.0}"
          style="width:100px;"
          oninput="updateBug(${bi}, 'pontos', parseFloat(this.value))">
      </div>
      <div class="form-group">
        <label>Código — clique nas linhas que têm erro</label>
        <div class="bug-code-editor" id="bug-editor-${bi}">
          ${linhas.map((linha, li) => {
            const errada = (b.linhas_erradas || []).includes(li);
            return `<div class="bug-linha ${errada ? 'bug-linha-errada' : ''}"
              onclick="toggleLinhaBug(${bi}, ${li})"
              title="${errada ? 'Linha com erro (clique para desmarcar)' : 'Clique para marcar como erro'}">
              <span class="bug-linha-num">${li + 1}</span>
              <span class="bug-linha-code">${linha.replace(/</g,'&lt;')}</span>
              ${errada ? '<span class="bug-linha-tag">BUG</span>' : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="bug-code-textarea-wrap">
          <textarea class="bug-textarea" rows="8"
            placeholder="void loop() {&#10;  digitWrite(13, HIGH);  // BUG: digitWrite&#10;  delay(1000)&#10;  digitalWrite(13, LOW);&#10;  delay(1000);&#10;}"
            oninput="updateBugCodigo(${bi}, this.value)">${b.codigo || ''}</textarea>
          <span class="helper-text">Cole ou digite o código. Depois clique nas linhas com erro no preview acima.</span>
        </div>
      </div>
      <div class="form-group">
        <label>Feedback</label>
        <input type="text" value="${b.feedback || ''}"
          oninput="updateBug(${bi}, 'feedback', this.value)"
          placeholder="Ex: O erro estava na linha 2: 'digitWrite' deveria ser 'digitalWrite'">
      </div>
      <div class="form-group">
        <label>Linhas com erro</label>
        <div style="font-size:12px; color:#62708c; background:#f5f5f5; padding:8px 12px; border-radius:8px;">
          ${(b.linhas_erradas || []).length > 0
            ? 'Linhas marcadas: ' + (b.linhas_erradas || []).map(l => l + 1).join(', ')
            : 'Nenhuma linha marcada como erro ainda.'}
        </div>
      </div>
    `;
    lista.appendChild(card);
  });
}

window.adicionarBug = function() {
  window.bugState.push({
    codigo:        '',
    linhas_erradas: [],
    feedback:      '',
    pontos:        1.0
  });
  renderBugLista();
  recalcularPontos();
  atualizarBtnBug();
};

window.removerBug = function(bi) {
  window.bugState.splice(bi, 1);
  renderBugLista();
  recalcularPontos();
  atualizarBtnBug();
};

window.updateBug = function(bi, field, value) {
  if (window.bugState[bi]) window.bugState[bi][field] = value;
  if (field === 'pontos') recalcularPontos();
};

window.updateBugCodigo = function(bi, valor) {
  if (!window.bugState[bi]) return;
  window.bugState[bi].codigo = valor;
  // Limpar linhas erradas pois o código mudou
  window.bugState[bi].linhas_erradas = [];
  renderBugLista();
};

window.toggleLinhaBug = function(bi, li) {
  if (!window.bugState[bi]) return;
  const erradas = window.bugState[bi].linhas_erradas || [];
  const idx = erradas.indexOf(li);
  if (idx >= 0) {
    erradas.splice(idx, 1);
  } else {
    erradas.push(li);
    erradas.sort((a, b) => a - b);
  }
  window.bugState[bi].linhas_erradas = erradas;
  renderBugLista();
};

// ==============================
// ---- QUAL COMPONENTE ----
// ==============================

const COMPONENTES_LIST = [
  { id: 'arduino',            nome: 'Arduino',              arquivo: 'arduino.png' },
  { id: 'protoboard',         nome: 'Protoboard',           arquivo: 'protoboard.png' },
  { id: 'led',                nome: 'LED',                  arquivo: 'led.png' },
  { id: 'botao',              nome: 'Botão',                arquivo: 'botao.png' },
  { id: 'resistor',           nome: 'Resistor',             arquivo: 'resistor.png' },
  { id: 'potenciometro',      nome: 'Potenciômetro',        arquivo: 'potenciometro.png' },
  { id: 'ldr',                nome: 'LDR',                  arquivo: 'ldr.png' },
  { id: 'termistor',          nome: 'Termistor',            arquivo: 'termistor.png' },
  { id: 'matriz de led 8x8',         nome: 'Matriz de LED 8x8',   arquivo: 'matriz de led 8x8.png' },
  { id: 'sensor de som',         nome: 'Sensor de Som',        arquivo: 'sensor de som.png' },
  { id: 'sensor ultrassonico',nome: 'Sensor Ultrassônico',  arquivo: 'sensor ultrassonico.png' },
  { id: 'led rgb',            nome: 'LED RGB',              arquivo: 'led rgb.png' },
  { id: 'jumpers', nome: 'Jumpers', arquivo: 'jumpers.png' },
];

window.compState = [];

window.toggleComp = function() {
  const body = document.getElementById('comp-body');
  const btn  = document.getElementById('btn-toggle-comp');
  if (!body) return;
  body.style.display = body.style.display !== 'none' ? 'none' : 'block';
  atualizarBtnComp();
};

function atualizarBtnComp() {
  const btn  = document.getElementById('btn-toggle-comp');
  const body = document.getElementById('comp-body');
  if (!btn || !body) return;
  const aberto = body.style.display !== 'none';
  const n = window.compState.length;
  btn.textContent = aberto
    ? (n > 0 ? '▲ Fechar (' + n + ' pergunta' + (n !== 1 ? 's' : '') + ')' : '▲ Fechar')
    : (n > 0 ? '▼ Editar Perguntas (' + n + ')' : '▼ Criar Jogo');
}

function renderCompLista() {
  const lista = document.getElementById('comp-lista');
  if (!lista) return;

  if (window.compState.length === 0) {
    lista.innerHTML = '<div class="quiz-empty">Nenhuma pergunta cadastrada. Clique em + Pergunta para começar.</div>';
    return;
  }

  lista.innerHTML = '';
  window.compState.forEach((q, qi) => {
    const card = document.createElement('div');
    card.className = 'quiz-card';

    // Grid de componentes — seleção múltipla para corretos
    const gridHTML = COMPONENTES_LIST.map(c => {
      const correto = (q.corretos || []).includes(c.id);
      return `
        <div class="comp-opcao ${correto ? 'comp-correto' : ''}" onclick="toggleCompCorreto(${qi}, '${c.id}')">
          <img src="../assets/eletronicos/${c.arquivo}" alt="${c.nome}" class="comp-opcao-img"
            onerror="this.style.opacity='0.3'">
          <div class="comp-opcao-nome">${c.nome}</div>
          ${correto ? '<div class="comp-opcao-check">✓</div>' : ''}
        </div>`;
    }).join('');

    card.innerHTML = `
      <div class="quiz-card-header">
        <span class="quiz-card-num">Pergunta ${qi + 1}</span>
        <button class="quiz-btn-rem" onclick="removerComp(${qi})">× Remover</button>
      </div>
      <div class="form-group">
        <label>Pergunta *</label>
        <input type="text" value="${q.pergunta || ''}"
          oninput="updateComp(${qi}, 'pergunta', this.value)"
          placeholder="Ex: Qual componente acende luz?">
      </div>
      <div class="form-group">
        <label>Pontos</label>
        <input type="number" step="0.5" min="0.5" value="${q.pontos || 1.0}"
          style="width:100px;"
          oninput="updateComp(${qi}, 'pontos', parseFloat(this.value)); recalcularPontos();">
      </div>
      <div class="form-group">
        <label>Componentes — clique nos <strong>corretos</strong> (pode marcar mais de um)</label>
        <div class="comp-grid">${gridHTML}</div>
        <span class="helper-text">Marcados: ${(q.corretos || []).length > 0 ? (q.corretos || []).map(id => COMPONENTES_LIST.find(c => c.id === id)?.nome || id).join(', ') : 'Nenhum'}</span>
      </div>
      <div class="form-group">
        <label>Feedback</label>
        <input type="text" value="${q.feedback || ''}"
          oninput="updateComp(${qi}, 'feedback', this.value)"
          placeholder="Ex: O LED é o componente que emite luz!">
      </div>
    `;
    lista.appendChild(card);
  });
}

window.adicionarComp = function() {
  window.compState.push({ pergunta: '', corretos: [], feedback: '', pontos: 1.0 });
  renderCompLista();
  recalcularPontos();
  atualizarBtnComp();
};

window.removerComp = function(qi) {
  window.compState.splice(qi, 1);
  renderCompLista();
  recalcularPontos();
  atualizarBtnComp();
};

window.updateComp = function(qi, field, value) {
  if (window.compState[qi]) window.compState[qi][field] = value;
};

window.toggleCompCorreto = function(qi, compId) {
  if (!window.compState[qi]) return;
  const corretos = window.compState[qi].corretos || [];
  const idx = corretos.indexOf(compId);
  if (idx >= 0) corretos.splice(idx, 1);
  else corretos.push(compId);
  window.compState[qi].corretos = corretos;
  renderCompLista();
};

// ==============================
// ---- ORDENA O CÓDIGO ----
// ==============================

window.ordenaState = [];

window.toggleOrdena = function() {
  const body = document.getElementById('ordena-body');
  const btn  = document.getElementById('btn-toggle-ordena');
  if (!body) return;
  body.style.display = body.style.display !== 'none' ? 'none' : 'block';
  atualizarBtnOrdena();
};

function atualizarBtnOrdena() {
  const btn  = document.getElementById('btn-toggle-ordena');
  const body = document.getElementById('ordena-body');
  if (!btn || !body) return;
  const aberto = body.style.display !== 'none';
  const n = window.ordenaState.length;
  btn.textContent = aberto
    ? (n > 0 ? '▲ Fechar (' + n + ' desafio' + (n !== 1 ? 's' : '') + ')' : '▲ Fechar')
    : (n > 0 ? '▼ Editar Desafios (' + n + ')' : '▼ Criar Jogo');
}

function renderOrdenaLista() {
  const lista = document.getElementById('ordena-lista');
  if (!lista) return;

  if (window.ordenaState.length === 0) {
    lista.innerHTML = '<div class="quiz-empty">Nenhum desafio cadastrado. Clique em + Desafio para começar.</div>';
    return;
  }

  lista.innerHTML = '';
  window.ordenaState.forEach((d, di) => {
    const linhas = (d.codigo || '').split('\n');
    const fixas  = d.linhas_fixas || [];

    const linhasHTML = linhas.map((linha, li) => {
      const fixo = fixas.includes(li);
      return `<div class="ordena-linha ${fixo ? 'ordena-linha-fixa' : ''}" onclick="toggleLinhaFixa(${di}, ${li})">
        <span class="ordena-linha-num">${li + 1}</span>
        <span class="ordena-linha-code">${linha.replace(/</g, '&lt;')}</span>
        <span class="ordena-linha-tag">${fixo ? '🔒 Fixo' : 'Clique para fixar'}</span>
      </div>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.innerHTML = `
      <div class="quiz-card-header">
        <span class="quiz-card-num">Desafio ${di + 1}</span>
        <button class="quiz-btn-rem" onclick="removerOrdena(${di})">× Remover</button>
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <input type="text" value="${d.descricao || ''}"
          oninput="updateOrdena(${di}, 'descricao', this.value)"
          placeholder="Ex: Ordene o código para piscar o LED">
      </div>
      <div class="form-group">
        <label>Pontos</label>
        <input type="number" step="0.5" min="0.5" value="${d.pontos || 1.0}"
          style="width:100px;"
          oninput="updateOrdena(${di}, 'pontos', parseFloat(this.value)); recalcularPontos();">
      </div>
      <div class="form-group">
        <label>Código correto</label>
        <textarea class="bug-textarea" rows="8"
          placeholder="void loop() {\n  digitalWrite(13, HIGH);\n  delay(1000);\n  digitalWrite(13, LOW);\n  delay(1000);\n}"
          oninput="updateOrdenaCodigo(${di}, this.value)">${d.codigo || ''}</textarea>
        <span class="helper-text">Cole o código na ordem CORRETA. Depois clique nas linhas que devem ser <strong>fixas</strong> (não embaralhadas).</span>
      </div>
      ${d.codigo ? `
      <div class="form-group">
        <label>Preview — clique nas linhas para fixar</label>
        <div class="ordena-preview">${linhasHTML}</div>
        <span class="helper-text">Fixas (🔒): ${fixas.length > 0 ? fixas.map(i => i+1).join(', ') : 'Nenhuma'}</span>
      </div>` : ''}
      <div class="form-group">
        <label>Feedback</label>
        <input type="text" value="${d.feedback || ''}"
          oninput="updateOrdena(${di}, 'feedback', this.value)"
          placeholder="Ex: Lembre-se: primeiro liga, espera, depois desliga!">
      </div>
    `;
    lista.appendChild(card);
  });
}

window.adicionarOrdena = function() {
  window.ordenaState.push({ descricao: '', codigo: '', linhas_fixas: [], feedback: '', pontos: 1.0 });
  renderOrdenaLista();
  recalcularPontos();
  atualizarBtnOrdena();
};

window.removerOrdena = function(di) {
  window.ordenaState.splice(di, 1);
  renderOrdenaLista();
  recalcularPontos();
  atualizarBtnOrdena();
};

window.updateOrdena = function(di, field, value) {
  if (window.ordenaState[di]) window.ordenaState[di][field] = value;
};

window.updateOrdenaCodigo = function(di, valor) {
  if (!window.ordenaState[di]) return;
  window.ordenaState[di].codigo = valor;
  window.ordenaState[di].linhas_fixas = [];
  renderOrdenaLista();
};

window.toggleLinhaFixa = function(di, li) {
  if (!window.ordenaState[di]) return;
  const fixas = window.ordenaState[di].linhas_fixas || [];
  const idx = fixas.indexOf(li);
  if (idx >= 0) fixas.splice(idx, 1);
  else fixas.push(li);
  window.ordenaState[di].linhas_fixas = fixas;
  renderOrdenaLista();
};

// ==============================
// ---- COMPLETE O CÓDIGO ----
// ==============================

window.completeState = [];

window.toggleComplete = function() {
  const body = document.getElementById('complete-body');
  if (!body) return;
  body.style.display = body.style.display !== 'none' ? 'none' : 'block';
  atualizarBtnComplete();
};

function atualizarBtnComplete() {
  const btn  = document.getElementById('btn-toggle-complete');
  const body = document.getElementById('complete-body');
  if (!btn || !body) return;
  const aberto = body.style.display !== 'none';
  const n = window.completeState.length;
  btn.textContent = aberto
    ? (n > 0 ? '▲ Fechar (' + n + ' desafio' + (n!==1?'s':'') + ')' : '▲ Fechar')
    : (n > 0 ? '▼ Editar Desafios (' + n + ')' : '▼ Criar Jogo');
}

function contarLacunas(codigo) {
  return (codigo.match(/___/g) || []).length;
}

function renderCompleteLista() {
  const lista = document.getElementById('complete-lista');
  if (!lista) return;

  if (window.completeState.length === 0) {
    lista.innerHTML = '<div class="quiz-empty">Nenhum desafio cadastrado. Clique em + Desafio para começar.</div>';
    return;
  }

  lista.innerHTML = '';
  window.completeState.forEach((d, di) => {
    const nLacunas = contarLacunas(d.codigo || '');
    const lacunas  = d.lacunas || [];

    // Gerar campos para cada lacuna
    let lacunasHTML = '';
    for (let li = 0; li < nLacunas; li++) {
      const lac = lacunas[li] || { opcoes: ['','','',''], correta: '' };
      lacunasHTML += `
        <div class="complete-lacuna-card">
          <div class="complete-lacuna-titulo">Lacuna ${li+1}</div>
          <div class="form-group">
            <label>Opções (4) — marque a correta</label>
            <div class="complete-opcao-row">
              <input type="radio" name="correta-${di}-${li}" value="0" ${lac.correta === (lac.opcoes[0]||'') && lac.correta !== '' ? 'checked' : ''} onchange="setCorreta(${di},${li},0)">
              <input type="text" class="complete-opcao-input" value="${lac.opcoes[0]||''}" placeholder="Opção 1" oninput="updateOpcao(${di},${li},0,this.value)">
            </div>
            <div class="complete-opcao-row">
              <input type="radio" name="correta-${di}-${li}" value="1" ${lac.correta === (lac.opcoes[1]||'') && lac.correta !== '' ? 'checked' : ''} onchange="setCorreta(${di},${li},1)">
              <input type="text" class="complete-opcao-input" value="${lac.opcoes[1]||''}" placeholder="Opção 2" oninput="updateOpcao(${di},${li},1,this.value)">
            </div>
            <div class="complete-opcao-row">
              <input type="radio" name="correta-${di}-${li}" value="2" ${lac.correta === (lac.opcoes[2]||'') && lac.correta !== '' ? 'checked' : ''} onchange="setCorreta(${di},${li},2)">
              <input type="text" class="complete-opcao-input" value="${lac.opcoes[2]||''}" placeholder="Opção 3" oninput="updateOpcao(${di},${li},2,this.value)">
            </div>
            <div class="complete-opcao-row">
              <input type="radio" name="correta-${di}-${li}" value="3" ${lac.correta === (lac.opcoes[3]||'') && lac.correta !== '' ? 'checked' : ''} onchange="setCorreta(${di},${li},3)">
              <input type="text" class="complete-opcao-input" value="${lac.opcoes[3]||''}" placeholder="Opção 4" oninput="updateOpcao(${di},${li},3,this.value)">
            </div>
          </div>
        </div>`;
    }

    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.innerHTML = `
      <div class="quiz-card-header">
        <span class="quiz-card-num">Desafio ${di+1}</span>
        <button class="quiz-btn-rem" onclick="removerComplete(${di})">× Remover</button>
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <input type="text" value="${d.descricao||''}"
          oninput="updateComplete(${di},'descricao',this.value)"
          placeholder="Ex: Complete o código do pisca-pisca">
      </div>
      <div class="form-group">
        <label>Pontos</label>
        <input type="number" step="0.5" min="0.5" value="${d.pontos||1.0}" style="width:100px;"
          oninput="updateComplete(${di},'pontos',parseFloat(this.value));recalcularPontos();">
      </div>
      <div class="form-group">
        <label>Código — use <strong>___</strong> para cada lacuna</label>
        <textarea class="bug-textarea" rows="8"
          placeholder="void loop() {\n  ___(13, HIGH);\n  delay(___);\n  digitalWrite(13, LOW);\n  delay(1000);\n}"
          oninput="updateCompleteCodigo(${di},this.value)">${d.codigo||''}</textarea>
        <span class="helper-text">Lacunas detectadas: <strong>${nLacunas}</strong></span>
      </div>
      ${nLacunas > 0 ? `<div class="complete-lacunas-wrap">${lacunasHTML}</div>` : ''}
      <div class="form-group">
        <label>Feedback</label>
        <input type="text" value="${d.feedback||''}"
          oninput="updateComplete(${di},'feedback',this.value)"
          placeholder="Ex: Lembre-se: digitalWrite liga/desliga, delay espera em ms!">
      </div>
    `;
    lista.appendChild(card);
  });
}

window.adicionarComplete = function() {
  window.completeState.push({ descricao:'', codigo:'', lacunas:[], feedback:'', pontos:1.0 });
  renderCompleteLista();
  recalcularPontos();
  atualizarBtnComplete();
};

window.removerComplete = function(di) {
  window.completeState.splice(di, 1);
  renderCompleteLista();
  recalcularPontos();
  atualizarBtnComplete();
};

window.updateComplete = function(di, field, value) {
  if (window.completeState[di]) window.completeState[di][field] = value;
};

window.updateCompleteCodigo = function(di, valor) {
  if (!window.completeState[di]) return;
  window.completeState[di].codigo = valor;
  const n = contarLacunas(valor);
  // Ajustar array de lacunas
  const lacunas = window.completeState[di].lacunas || [];
  while (lacunas.length < n) lacunas.push({ opcoes:['','','',''], correta:'' });
  lacunas.length = n;
  window.completeState[di].lacunas = lacunas;
  renderCompleteLista();
};

window.updateOpcao = function(di, li, oi, valor) {
  if (!window.completeState[di]) return;
  const lac = window.completeState[di].lacunas[li];
  if (!lac) return;
  lac.opcoes[oi] = valor;
  // Se era a correta, atualizar
  if (lac.correta === lac.opcoes[oi]) lac.correta = valor;
};

window.setCorreta = function(di, li, oi) {
  if (!window.completeState[di]) return;
  const lac = window.completeState[di].lacunas[li];
  if (!lac) return;
  lac.correta = lac.opcoes[oi] || '';
};

// =====================================================================
// ---- CONECTA OS PONTOS ----
// =====================================================================

const TIPOS_COMP_ADM = {
  arduino:      { label: 'Arduino', cor: '#2980b9' },
  resistor:     { label: 'Resistor', cor: '#8e44ad' },
  led:          { label: 'LED', cor: '#f39c12' },
  led_rgb:      { label: 'LED RGB', cor: '#e056cd' },
  botao:        { label: 'Botão', cor: '#27ae60' },
  potenciometro:{ label: 'Potenciômetro', cor: '#16a085' },
  ldr:          { label: 'LDR', cor: '#d35400' },
  protoboard:   { label: 'Protoboard', cor: '#7f8c8d' },
  jumpers:      { label: 'Jumpers', cor: '#2c3e50' },
  sensor_som:   { label: 'Sensor Som', cor: '#c0392b' },
  sensor_ult:   { label: 'Sensor Ult.', cor: '#1abc9c' },
  termistor:    { label: 'Termistor', cor: '#e74c3c' },
  matriz_led:   { label: 'Matriz LED', cor: '#9b59b6' },
  gnd:          { label: 'GND', cor: '#2c3e50' },
  vcc:          { label: 'VCC', cor: '#c0392b' },
};

window.toggleConecta = function() {
  const body = document.getElementById('conecta-body');
  if (!body) return;
  body.style.display = body.style.display !== 'none' ? 'none' : 'block';
  atualizarBtnConecta();
};

function atualizarBtnConecta() {
  const btn  = document.getElementById('btn-toggle-conecta');
  const body = document.getElementById('conecta-body');
  if (!btn || !body) return;
  const aberto = body.style.display !== 'none';
  const n = (window.conectaState || []).length;
  btn.textContent = aberto
    ? (n > 0 ? '▲ Fechar (' + n + ' desafio' + (n !== 1 ? 's' : '') + ')' : '▲ Fechar')
    : (n > 0 ? '▼ Editar Desafios (' + n + ')' : '▼ Criar Jogo');
}

window.adicionarConecta = function() {
  if (!window.conectaState) window.conectaState = [];
  if (window.conectaState.length >= 10) return;
  window.conectaState.push({
    descricao: '',
    componentes: [],
    conexoes_corretas: [],
    feedback_erro: '',
    pontos: 2.0
  });
  renderConectaLista();
  recalcularPontos();
  atualizarBtnConecta();
};

window.removerConecta = function(di) {
  window.conectaState.splice(di, 1);
  renderConectaLista();
  recalcularPontos();
  atualizarBtnConecta();
};

window.updateConecta = function(di, field, value) {
  if (!window.conectaState[di]) return;
  window.conectaState[di][field] = value;
  if (field === 'pontos') recalcularPontos();
};

window.adicionarCompConecta = function(di) {
  if (!window.conectaState[di]) return;
  const sel   = document.getElementById(`conecta-tipo-novo-${di}`);
  const tipo  = sel ? sel.value : 'resistor';
  const label = document.getElementById(`conecta-label-novo-${di}`)?.value.trim() || TIPOS_COMP_ADM[tipo]?.label || tipo;
  const id    = 'c' + Date.now();
  window.conectaState[di].componentes.push({ id, tipo, label, pinos: [] });
  renderConectaLista();
};

window.adicionarPinoConecta = function(di, compIdx) {
  const comp = window.conectaState[di]?.componentes[compIdx];
  if (!comp) return;
  const labelEl = document.getElementById(`pino-label-${di}-${compIdx}`);
  const label   = labelEl?.value.trim();
  if (!label) { showToast('Digite o nome do pino.', 'error'); return; }
  if (!comp.pinos) comp.pinos = [];
  const id = 'p' + Date.now();
  comp.pinos.push({ id, label });
  renderConectaLista();
};

window.removerPinoConecta = function(di, compIdx, pinoId) {
  const comp = window.conectaState[di]?.componentes[compIdx];
  if (!comp) return;
  comp.pinos = (comp.pinos || []).filter(p => p.id !== pinoId);
  // Remove conexões que usavam este pino
  window.conectaState[di].conexoes_corretas = (window.conectaState[di].conexoes_corretas || []).filter(conn => {
    const sep = conn.indexOf('-');
    const a = conn.slice(0, sep), b = conn.slice(sep + 1);
    return a !== pinoId && b !== pinoId;
  });
  renderConectaLista();
};

window.removerCompConecta = function(di, compId) {
  if (!window.conectaState[di]) return;
  window.conectaState[di].componentes = window.conectaState[di].componentes.filter(c => c.id !== compId);
  // Remover conexões que usavam esse componente
  window.conectaState[di].conexoes_corretas = window.conectaState[di].conexoes_corretas.filter(conn => {
    const [a, b] = conn.split('-');
    return a !== compId && b !== compId;
  });
  renderConectaLista();
};

window.adicionarConexaoConecta = function(di) {
  if (!window.conectaState[di]) return;
  const selA = document.getElementById(`conecta-conn-a-${di}`);
  const selB = document.getElementById(`conecta-conn-b-${di}`);
  if (!selA || !selB) return;
  const a = selA.value, b = selB.value;
  if (!a || !b) { showToast('Selecione os dois pinos.', 'error'); return; }
  if (a === b) { showToast('Selecione pinos diferentes.', 'error'); return; }
  const par = [a, b].sort().join('-');
  if (!window.conectaState[di].conexoes_corretas) window.conectaState[di].conexoes_corretas = [];
  if (!window.conectaState[di].conexoes_corretas.includes(par)) {
    window.conectaState[di].conexoes_corretas.push(par);
  }
  renderConectaLista();
};

window.removerConexaoConecta = function(di, conn) {
  if (!window.conectaState[di]) return;
  window.conectaState[di].conexoes_corretas = window.conectaState[di].conexoes_corretas.filter(c => c !== conn);
  renderConectaLista();
};

function renderConectaLista() {
  const lista = document.getElementById('conecta-lista');
  if (!lista) return;
  if (!window.conectaState) window.conectaState = [];

  if (window.conectaState.length === 0) {
    lista.innerHTML = '<div class="quiz-empty">Nenhum desafio cadastrado. Clique em + Desafio para começar.</div>';
    return;
  }

  const tiposOpts = Object.entries(TIPOS_COMP_ADM).map(([k, v]) =>
    `<option value="${k}">${v.label}</option>`
  ).join('');

  lista.innerHTML = window.conectaState.map((d, di) => {
    const comps = d.componentes || [];
    const conns = d.conexoes_corretas || [];

    // Todos os pinos de todos os componentes (para os selects de conexão)
    const todosPinos = [];
    comps.forEach(c => {
      (c.pinos || []).forEach(p => {
        todosPinos.push({ pinoId: p.id, pinoLabel: p.label, compLabel: c.label, compTipo: c.tipo });
      });
    });

    const pinoOptsA = todosPinos.map(p =>
      `<option value="${p.pinoId}">${p.compLabel} — ${p.pinoLabel}</option>`
    ).join('');
    const pinoOptsB = pinoOptsA;

    // HTML de cada componente com seus pinos
    const compsHTML = comps.length === 0
      ? '<div style="color:#aaa;font-size:12px;">Nenhum componente ainda.</div>'
      : comps.map((c, ci) => {
          const cor = TIPOS_COMP_ADM[c.tipo]?.cor || '#666';
          const pinosHTML = (c.pinos || []).map(p =>
            `<span style="display:inline-flex;align-items:center;gap:4px;background:#f0f4ff;border:1px solid #c0cce0;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;color:#2d3436;">
              ⬤ ${p.label}
              <button onclick="removerPinoConecta(${di},${ci},'${p.id}')" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:12px;padding:0;line-height:1;">✕</button>
            </span>`
          ).join('') || '<span style="color:#bbb;font-size:11px;font-style:italic;">sem pinos</span>';

          return `
          <div class="conecta-comp-item" style="flex-direction:column;align-items:flex-start;gap:6px;">
            <div style="display:flex;align-items:center;gap:8px;width:100%;">
              <span style="background:${cor};color:#fff;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:700;">${c.label}</span>
              <span style="color:#888;font-size:11px;font-style:italic;">${TIPOS_COMP_ADM[c.tipo]?.label||c.tipo}</span>
              <button onclick="removerCompConecta(${di},'${c.id}')" style="margin-left:auto;background:#e74c3c;color:#fff;border:none;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:11px;">✕ Remover</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
              ${pinosHTML}
            </div>
            <div style="display:flex;gap:6px;align-items:center;margin-top:2px;">
              <input id="pino-label-${di}-${ci}" type="text" placeholder="Nome do pino (ex: Pino 13, +, entrada...)" style="flex:1;min-width:160px;font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid #ccc;">
              <button onclick="adicionarPinoConecta(${di},${ci})" style="background:#0984e3;color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px;white-space:nowrap;">+ Pino</button>
            </div>
          </div>`;
        }).join('');

    // HTML das conexões definidas
    const connsHTML = conns.length === 0
      ? '<div style="color:#aaa;font-size:12px;">Nenhuma conexão definida.</div>'
      : conns.map(conn => {
          const sep    = conn.indexOf('-');
          const aId    = conn.slice(0, sep);
          const bId    = conn.slice(sep + 1);
          const aInfo  = todosPinos.find(p => p.pinoId === aId);
          const bInfo  = todosPinos.find(p => p.pinoId === bId);
          const aLabel = aInfo ? `${aInfo.compLabel} — ${aInfo.pinoLabel}` : aId;
          const bLabel = bInfo ? `${bInfo.compLabel} — ${bInfo.pinoLabel}` : bId;
          return `<div class="conecta-conn-item">
            <span>⚡ ${aLabel} ↔ ${bLabel}</span>
            <button onclick="removerConexaoConecta(${di},'${conn}')" style="background:#e74c3c;color:#fff;border:none;border-radius:6px;padding:2px 6px;cursor:pointer;font-size:11px;">✕</button>
          </div>`;
        }).join('');

    const temPinos = todosPinos.length >= 2;

    return `
    <div class="quiz-card">
      <div class="quiz-card-header">
        <strong>Desafio ${di + 1}</strong>
        <button onclick="removerConecta(${di})" class="btn-rem-quiz">✕ Remover</button>
      </div>
      <div class="quiz-card-body">
        <label>Descrição / Instrução</label>
        <input type="text" value="${(d.descricao||'').replace(/"/g,'&quot;')}" oninput="updateConecta(${di},'descricao',this.value)" placeholder="Ex: Monte o circuito do LED piscante">

        <label>Pontos</label>
        <input type="number" min="0.5" max="10" step="0.5" value="${d.pontos||2}" oninput="updateConecta(${di},'pontos',parseFloat(this.value)||2)" style="width:90px;">

        <label>Feedback de erro</label>
        <input type="text" value="${(d.feedback_erro||'').replace(/"/g,'&quot;')}" oninput="updateConecta(${di},'feedback_erro',this.value)" placeholder="Dica quando errar...">

        <div class="conecta-section-label" style="margin-top:10px;">
          Componentes
          <span style="color:#888;font-weight:400;font-size:10px;"> — adicione cada componente e seus pinos de conexão</span>
        </div>
        <div class="conecta-comps-lista">${compsHTML}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;background:#f8f9fa;border-radius:8px;padding:8px;">
          <select id="conecta-tipo-novo-${di}" style="padding:4px 8px;border-radius:6px;border:1px solid #ccc;font-size:13px;">${tiposOpts}</select>
          <input id="conecta-label-novo-${di}" type="text" placeholder="Rótulo do componente" style="flex:1;min-width:110px;font-size:13px;">
          <button onclick="adicionarCompConecta(${di})" style="background:#0984e3;color:#fff;border:none;border-radius:6px;padding:5px 14px;cursor:pointer;white-space:nowrap;font-weight:700;">+ Componente</button>
        </div>

        <div class="conecta-section-label" style="margin-top:14px;">
          Conexões Corretas
          <span style="color:#888;font-weight:400;font-size:10px;"> — defina os pares de pinos que devem ser ligados</span>
        </div>
        <div class="conecta-conns-lista">${connsHTML}</div>
        ${temPinos ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;background:#f0fdf4;border-radius:8px;padding:8px;border:1px solid #d1fae5;">
          <select id="conecta-conn-a-${di}" style="flex:1;padding:4px 8px;border-radius:6px;border:1px solid #ccc;font-size:12px;min-width:140px;">
            <option value="">Pino A...</option>${pinoOptsA}
          </select>
          <span style="font-weight:900;color:#00b894;">↔</span>
          <select id="conecta-conn-b-${di}" style="flex:1;padding:4px 8px;border-radius:6px;border:1px solid #ccc;font-size:12px;min-width:140px;">
            <option value="">Pino B...</option>${pinoOptsB}
          </select>
          <button onclick="adicionarConexaoConecta(${di})" style="background:#00b894;color:#fff;border:none;border-radius:6px;padding:5px 14px;cursor:pointer;font-weight:700;white-space:nowrap;">+ Conexão</button>
        </div>` : `<div style="color:#aaa;font-size:12px;margin-top:6px;padding:8px;background:#f9f9f9;border-radius:6px;">Adicione componentes com pelo menos 2 pinos para definir conexões.</div>`}
      </div>
    </div>`;
  }).join('');
}

// =====================================================================
// ---- SIMULADOR BOX ----
// =====================================================================

// Todos os pinos do BOX para os selects do admin
const PINOS_BOX_ADM = {
  '1':'1 (LED −)',   '2':'2 (LED +)',   '3':'3 (LED −)',   '4':'4 (LED +)',   '5':'5 (LED −)',   '6':'6 (LED +)',
  '7':'7 RGB −',     '8':'8 RGB R',     '9':'9 RGB B',     '10':'10 RGB G',
  '11':'11 B1',      '12':'12 B2',
  '15':'15 Res.',    '16':'16 Res.',    '17':'17 Res.',    '18':'18 Res.',    '19':'19 Res.',
  '20':'20 Res.',    '21':'21 Res.',    '22':'22 Res.',    '23':'23 Res.',    '24':'24 Res.',
  '31':'31 Pot.GND', '32':'32 Pot.AN',  '33':'33 Pot.5V',
  '34':'34 Beep LOG','35':'35 Beep GND',
  '36':'36 Sensor',  '37':'37 Sensor',  '38':'38 Sensor',  '39':'39 Sensor',
  '61':'61 Proto.A', '62':'62 Proto.A', '63':'63 Proto.A', '64':'64 Proto.A', '65':'65 Proto.A',
  '66':'66 Proto.B', '67':'67 Proto.B', '68':'68 Proto.B', '69':'69 Proto.B', '70':'70 Proto.B',
  'L02':'L02','L03':'L03','L04':'L04','L05':'L05','L06':'L06','L07':'L07',
  'L08':'L08','L09':'L09','L10':'L10','L11':'L11','L12':'L12','L13':'L13',
  'T1':'T1','T2':'T2',
  'A0':'A0','A1':'A1','A2':'A2','A3':'A3','A4':'A4','A5':'A5',
  'TX':'TX','RX':'RX','L1':'L1','L0':'L0',
  '83':'83 GND','84':'84 GND','85':'85 3.3V','86':'86 5V',
};

window.toggleBox = function() {
  const body = document.getElementById('box-body');
  if (!body) return;
  body.style.display = body.style.display !== 'none' ? 'none' : 'block';
  atualizarBtnBox();
};

function atualizarBtnBox() {
  const btn  = document.getElementById('btn-toggle-box');
  const body = document.getElementById('box-body');
  if (!btn || !body) return;
  const aberto = body.style.display !== 'none';
  const n = (window.boxState || []).length;
  btn.textContent = aberto
    ? (n > 0 ? '▲ Fechar (' + n + ' desafio' + (n !== 1 ? 's' : '') + ')' : '▲ Fechar')
    : (n > 0 ? '▼ Editar Desafios (' + n + ')' : '▼ Criar Jogo');
}

window.adicionarBoxDesafio = function() {
  if (!window.boxState) window.boxState = [];
  if (window.boxState.length >= 10) return;
  window.boxState.push({ descricao: '', conexoes_corretas: [], feedback_erro: '', pontos: 2.0 });
  renderBoxLista();
  recalcularPontos();
  atualizarBtnBox();
};

window.removerBoxDesafio = function(di) {
  window.boxState.splice(di, 1);
  renderBoxLista();
  recalcularPontos();
  atualizarBtnBox();
};

window.updateBox = function(di, field, value) {
  if (!window.boxState[di]) return;
  window.boxState[di][field] = value;
  if (field === 'pontos') recalcularPontos();
};

window.adicionarConexaoBox = function(di) {
  if (!window.boxState[di]) return;
  const selA = document.getElementById('box-conn-a-' + di);
  const selB = document.getElementById('box-conn-b-' + di);
  if (!selA || !selB) return;
  const a = selA.value, b = selB.value;
  if (!a || !b) { showToast('Selecione os dois pinos.', 'error'); return; }
  if (a === b) { showToast('Selecione pinos diferentes.', 'error'); return; }
  const par = [a, b].sort().join('-');
  if (!window.boxState[di].conexoes_corretas) window.boxState[di].conexoes_corretas = [];
  if (!window.boxState[di].conexoes_corretas.includes(par)) {
    window.boxState[di].conexoes_corretas.push(par);
  }
  renderBoxLista();
};

window.removerConexaoBox = function(di, conn) {
  if (!window.boxState[di]) return;
  window.boxState[di].conexoes_corretas = window.boxState[di].conexoes_corretas.filter(c => c !== conn);
  renderBoxLista();
};

function gerarMapaBoxHTML(conns) {
  const linhas = (conns || []).map(conn => {
    const sep = conn.indexOf('-');
    const aId = conn.slice(0, sep), bId = conn.slice(sep + 1);
    const a = PINOS_BOX_COORDS[aId], b = PINOS_BOX_COORDS[bId];
    if (!a || !b) return '';
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ffd700" stroke-width="1.2" stroke-linecap="round" opacity="0.9"/>`;
  }).join('');

  const pontos = (conns || []).flatMap(conn => {
    const sep = conn.indexOf('-');
    return [conn.slice(0, sep), conn.slice(sep + 1)];
  }).filter((v, i, arr) => arr.indexOf(v) === i).map(id => {
    const p = PINOS_BOX_COORDS[id];
    if (!p) return '';
    return `<div class="mapa-pino" style="left:${p.x}%;top:${p.y}%;--pino-cor:${p.cor};">
      <div class="mapa-pino-circulo"></div>
      <div class="mapa-pino-label">${id}</div>
    </div>`;
  }).join('');

  return `<div class="mapa-box-area">
    <img src="../assets/box_cima.png" class="mapa-box-img" alt="BOX">
    <svg class="mapa-box-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${linhas}</svg>
    <div class="mapa-box-pinos">${pontos}</div>
  </div>`;
}

// Coordenadas para o mapa admin (espelha PINOS_BOX do simulador)
const PINOS_BOX_COORDS = {
  '1':   { x: 6.5,  y: 11.0, cor: '#e74c3c' }, '2':   { x: 25.4, y: 10.7, cor: '#e74c3c' },
  '3':   { x: 6.8,  y: 19.2, cor: '#e74c3c' }, '4':   { x: 25.4, y: 19.0, cor: '#e74c3c' },
  '5':   { x: 6.8,  y: 27.8, cor: '#e74c3c' }, '6':   { x: 25.2, y: 27.8, cor: '#e74c3c' },
  '7':   { x: 6.8,  y: 39.2, cor: '#9b59b6' }, '8':   { x: 25.2, y: 39.4, cor: '#9b59b6' },
  '9':   { x: 6.7,  y: 49.6, cor: '#9b59b6' }, '10':  { x: 25.3, y: 49.3, cor: '#9b59b6' },
  '11':  { x: 34.8, y: 11.5, cor: '#3498db' }, '12':  { x: 52.8, y: 11.6, cor: '#3498db' },
  '15':  { x: 32.7, y: 25.8, cor: '#f39c12' }, '17':  { x: 38.7, y: 26.1, cor: '#f39c12' },
  '19':  { x: 44.4, y: 25.8, cor: '#f39c12' }, '21':  { x: 49.8, y: 25.8, cor: '#f39c12' },
  '23':  { x: 55.5, y: 25.8, cor: '#f39c12' }, '16':  { x: 32.8, y: 49.0, cor: '#f39c12' },
  '18':  { x: 39.0, y: 48.7, cor: '#f39c12' }, '20':  { x: 44.5, y: 48.7, cor: '#f39c12' },
  '22':  { x: 50.3, y: 49.0, cor: '#f39c12' }, '24':  { x: 56.0, y: 48.7, cor: '#f39c12' },
  '31':  { x: 64.8, y: 29.1, cor: '#16a085' }, '32':  { x: 70.3, y: 29.0, cor: '#16a085' },
  '33':  { x: 76.0, y: 29.3, cor: '#16a085' }, '34':  { x: 65.1, y: 60.3, cor: '#e67e22' },
  '35':  { x: 74.6, y: 60.3, cor: '#e67e22' }, '36':  { x: 62.9, y: 77.9, cor: '#27ae60' },
  '37':  { x: 67.5, y: 78.2, cor: '#27ae60' }, '38':  { x: 72.2, y: 78.1, cor: '#27ae60' },
  '39':  { x: 76.8, y: 77.8, cor: '#27ae60' }, '61':  { x: 7.8,  y: 63.8, cor: '#27ae60' },
  '62':  { x: 12.7, y: 63.8, cor: '#27ae60' }, '63':  { x: 18.1, y: 63.9, cor: '#27ae60' },
  '64':  { x: 23.4, y: 64.1, cor: '#27ae60' }, '65':  { x: 27.8, y: 64.1, cor: '#27ae60' },
  '66':  { x: 34.5, y: 63.9, cor: '#e67e22' }, '67':  { x: 39.3, y: 64.1, cor: '#e67e22' },
  '68':  { x: 44.7, y: 64.2, cor: '#e67e22' }, '69':  { x: 50.1, y: 64.4, cor: '#e67e22' },
  '70':  { x: 54.5, y: 64.4, cor: '#e67e22' }, 'L02': { x: 8.0,  y: 84.3, cor: '#f1c40f' },
  'L03': { x: 12.1, y: 84.1, cor: '#f1c40f' }, 'L04': { x: 16.3, y: 84.3, cor: '#f1c40f' },
  'L05': { x: 20.8, y: 84.1, cor: '#f1c40f' }, 'L06': { x: 25.3, y: 84.4, cor: '#f1c40f' },
  'L07': { x: 29.6, y: 84.0, cor: '#f1c40f' }, 'L08': { x: 34.1, y: 84.1, cor: '#f1c40f' },
  'L09': { x: 38.3, y: 84.1, cor: '#f1c40f' }, 'L10': { x: 43.3, y: 84.1, cor: '#f1c40f' },
  'L11': { x: 47.4, y: 84.1, cor: '#f1c40f' }, 'L12': { x: 51.7, y: 84.1, cor: '#f1c40f' },
  'L13': { x: 56.2, y: 84.6, cor: '#f1c40f' }, 'T2':  { x: 91.4, y: 8.5,  cor: '#95a5a6' },
  'T1':  { x: 91.6, y: 18.1, cor: '#95a5a6' }, 'A2':  { x: 84.4, y: 27.0, cor: '#8e44ad' },
  'A5':  { x: 91.2, y: 27.0, cor: '#8e44ad' }, 'A1':  { x: 84.6, y: 33.9, cor: '#8e44ad' },
  'A4':  { x: 91.1, y: 33.6, cor: '#8e44ad' }, 'A0':  { x: 84.7, y: 40.8, cor: '#8e44ad' },
  'A3':  { x: 91.2, y: 40.5, cor: '#8e44ad' }, 'TX':  { x: 88.8, y: 50.2, cor: '#d35400' },
  'L1':  { x: 88.6, y: 50.4, cor: '#d35400' }, 'RX':  { x: 88.8, y: 57.2, cor: '#d35400' },
  'L0':  { x: 88.8, y: 57.1, cor: '#d35400' }, '86':  { x: 88.6, y: 67.4, cor: '#c0392b' },
  '85':  { x: 89.0, y: 74.9, cor: '#c0392b' }, '84':  { x: 88.6, y: 82.0, cor: '#c0392b' },
  '83':  { x: 88.6, y: 89.8, cor: '#c0392b' },
};

function renderBoxLista() {
  const lista = document.getElementById('box-lista');
  if (!lista) return;
  if (!window.boxState) window.boxState = [];

  if (window.boxState.length === 0) {
    lista.innerHTML = '<div class="quiz-empty">Nenhum desafio cadastrado. Clique em + Desafio para começar.</div>';
    return;
  }

  const pinoOpts = Object.entries(PINOS_BOX_ADM).map(([k, v]) =>
    `<option value="${k}">${v}</option>`
  ).join('');

  lista.innerHTML = window.boxState.map((d, di) => {
    const conns = d.conexoes_corretas || [];
    const connsHTML = conns.length === 0
      ? '<div style="color:#aaa;font-size:12px;">Nenhuma conexão definida.</div>'
      : conns.map(conn => {
          const sep = conn.indexOf('-');
          const aId = conn.slice(0, sep), bId = conn.slice(sep + 1);
          const aLabel = PINOS_BOX_ADM[aId] || aId;
          const bLabel = PINOS_BOX_ADM[bId] || bId;
          return `<div class="conecta-conn-item">
            <span>⚡ ${aLabel} ↔ ${bLabel}</span>
            <button onclick="removerConexaoBox(${di},'${conn}')" style="background:#e74c3c;color:#fff;border:none;border-radius:6px;padding:2px 6px;cursor:pointer;font-size:11px;">✕</button>
          </div>`;
        }).join('');

    return `
    <div class="quiz-card">
      <div class="quiz-card-header">
        <strong>Desafio ${di + 1}</strong>
        <button onclick="removerBoxDesafio(${di})" class="btn-rem-quiz">✕ Remover</button>
      </div>
      <div class="quiz-card-body">
        <label>Descrição / Instrução</label>
        <input type="text" value="${(d.descricao||'').replace(/"/g,'&quot;')}" oninput="updateBox(${di},'descricao',this.value)" placeholder="Ex: Conecte o LED vermelho ao resistor 220Ω">

        <div style="display:flex;gap:14px;margin-top:10px;align-items:flex-start;">

          <!-- Coluna esquerda: campos + conexões -->
          <div style="flex:1;min-width:0;">
            <div style="display:flex;gap:12px;margin-bottom:8px;">
              <div style="flex:1;">
                <label style="font-size:11px;">Pontos</label>
                <input type="number" min="0.5" max="10" step="0.5" value="${d.pontos||2}" oninput="updateBox(${di},'pontos',parseFloat(this.value)||2)" style="width:80px;display:block;">
              </div>
              <div style="flex:3;">
                <label style="font-size:11px;">Feedback de erro</label>
                <input type="text" value="${(d.feedback_erro||'').replace(/"/g,'&quot;')}" oninput="updateBox(${di},'feedback_erro',this.value)" placeholder="Dica para o aluno..." style="display:block;width:100%;">
              </div>
            </div>

            <div class="conecta-section-label">
              Conexões Corretas
              <span style="color:#888;font-weight:400;font-size:10px;"> — pares de pinos que devem ser ligados</span>
            </div>
            <div class="conecta-conns-lista">${connsHTML}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center;background:#fff8ec;border-radius:8px;padding:8px;border:1px solid #fde8c0;">
              <select id="box-conn-a-${di}" style="flex:1;padding:4px 6px;border-radius:6px;border:1px solid #ccc;font-size:11px;min-width:100px;">
                <option value="">Pino A...</option>${pinoOpts}
              </select>
              <span style="font-weight:900;color:#e67e22;">↔</span>
              <select id="box-conn-b-${di}" style="flex:1;padding:4px 6px;border-radius:6px;border:1px solid #ccc;font-size:11px;min-width:100px;">
                <option value="">Pino B...</option>${pinoOpts}
              </select>
              <button onclick="adicionarConexaoBox(${di})" style="background:#e67e22;color:#fff;border:none;border-radius:6px;padding:5px 12px;cursor:pointer;font-weight:700;white-space:nowrap;font-size:12px;">+ Conexão</button>
            </div>
          </div>

          <!-- Coluna direita: mini mapa -->
          <div style="width:320px;flex-shrink:0;">
            ${gerarMapaBoxHTML(conns)}
          </div>

        </div>
      </div>
    </div>`;
  }).join('');
}

// ==============================
// ---- CÓDIGO BINÁRIO ----
// ==============================

window.binarioState = [];

window.toggleBinario = function() {
  const body = document.getElementById('binario-body');
  if (!body) return;
  body.style.display = body.style.display !== 'none' ? 'none' : 'block';
  atualizarBtnBinario();
};

function atualizarBtnBinario() {
  const btn  = document.getElementById('btn-toggle-binario');
  const body = document.getElementById('binario-body');
  if (!btn || !body) return;
  const aberto = body.style.display !== 'none';
  const n = (window.binarioState || []).length;
  btn.textContent = aberto
    ? (n > 0 ? '▲ Fechar (' + n + ' desafio' + (n !== 1 ? 's' : '') + ')' : '▲ Fechar')
    : (n > 0 ? '▼ Editar Desafios (' + n + ')' : '▼ Criar Jogo');
}

window.adicionarBinario = function() {
  if (!window.binarioState) window.binarioState = [];
  if (window.binarioState.length >= 20) return;
  window.binarioState.push({ binario: '', pontos: 1.0 });
  renderBinarioLista();
  recalcularPontos();
  atualizarBtnBinario();
};

window.removerBinario = function(di) {
  window.binarioState.splice(di, 1);
  renderBinarioLista();
  recalcularPontos();
  atualizarBtnBinario();
};

window.updateBinario = function(di, field, value) {
  if (!window.binarioState[di]) return;
  window.binarioState[di][field] = value;
  if (field === 'pontos') recalcularPontos();
};

function renderBinarioLista() {
  const lista = document.getElementById('binario-lista');
  if (!lista) return;
  if (!window.binarioState) window.binarioState = [];

  if (window.binarioState.length === 0) {
    lista.innerHTML = '<div class="quiz-empty">Nenhum desafio cadastrado. Clique em + Desafio para começar.</div>';
    return;
  }

  lista.innerHTML = window.binarioState.map((d, di) => {
    const bin = (d.binario || '').padStart(5, '0').slice(0, 5);
    const decimal = bin ? parseInt(bin, 2) : '—';
    const preview = bin
      ? `<span style="font-family:monospace;font-size:13px;background:#f3e8ff;padding:3px 10px;border-radius:6px;border:1px solid #c39bd3;letter-spacing:3px;">${bin}</span> = <strong>${decimal}</strong>`
      : '';

    return `
    <div class="quiz-card">
      <div class="quiz-card-header">
        <strong>Desafio ${di + 1}</strong>
        ${preview ? '<span style="font-size:12px;color:#6c3483;margin-left:8px;">' + preview + '</span>' : ''}
        <button onclick="removerBinario(${di})" class="btn-rem-quiz">✕ Remover</button>
      </div>
      <div class="quiz-card-body">
        <div class="form-row" style="gap:14px;align-items:flex-end;">
          <div class="form-group" style="max-width:180px;">
            <label>Número Binário (5 bits)</label>
            <input type="text" maxlength="5" placeholder="Ex: 01101"
              value="${(d.binario||'').replace(/"/g,'&quot;')}"
              oninput="updateBinario(${di},'binario',this.value.replace(/[^01]/g,'').slice(0,5));renderBinarioLista()"
              style="font-family:monospace;letter-spacing:3px;font-size:16px;font-weight:700;">
            <span class="helper-text">Use apenas 0 e 1 (5 dígitos)</span>
          </div>
          <div class="form-group" style="max-width:100px;">
            <label>Pontos</label>
            <input type="number" min="0.5" max="10" step="0.5"
              value="${d.pontos||1}"
              oninput="updateBinario(${di},'pontos',parseFloat(this.value)||1)">
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Prompt IA ──────────────────────────────────────────────────────────
const PROMPT_IA_DEFAULT_FALLBACK = `Crie o conteúdo educacional de um card para a plataforma MakerLab 3D com base nos dados abaixo:

- ID do Card: {id_do_card}
- Número: {numero}
- Nome do Desafio: {nome_do_desafio}
- Nível: {nivel}
- Tipo do Card: {tipo_do_card}
- Tema do Card: {tema_do_card}
- Descrição Complementar: {descricao complementar}

O conteúdo deve seguir o padrão dos cards MakerLab 3D, com foco em aprendizagem prática, clareza e aplicação real.

## Estrutura obrigatória do card

1. Objetivo
Explique o que o aluno vai aprender de forma clara e direta.
Use linguagem simples, sem termos técnicos excessivos.

2. Definição
- Título da definição
- Explicação do conceito principal tecnicamente de forma didática
Use analogias quando fizer sentido (ex: "cérebro do projeto").

3. Curiosidades
Liste de 3 a 5 curiosidades interessantes sobre o tema.
Formato com lista iniciando com "*".

4. Avaliação — Questões Reflexivas (Diário Maker)
Crie de 3 a 5 perguntas que façam o aluno pensar sobre o que aprendeu.

5. Atividade Rápida
Crie uma atividade prática simples, no estilo "mão na massa".

Estrutura:
- Descrição breve da atividade
- Imagem do Circuito (descreva como será esta imagem)
- Código Arduino IDE (Se necessário)
- Tabela com o glossário de código:
     Código   |   O que faz?


6. Desafio Extra
Proponha uma pequena modificação ou evolução da atividade.

7. Prompt para Imagem de Capa
Gere um prompt em inglês para criar a imagem de capa do card usando um gerador de imagens (Midjourney, Dall-E, Stable Diffusion).
O prompt deve descrever visualmente o conceito do card de forma criativa e atraente para alunos do ensino maker.
Exemplo de formato: "Illustration of [concept], [style], [colors], educational, vibrant, digital art"


## Diretrizes de linguagem (MUITO IMPORTANTE)

- NÃO usar linguagem técnica complexa
- NÃO usar linguagem infantilizada
- Escrever como um professor explicando de forma clara e prática
- Usar frases curtas e objetivas
- Priorizar exemplos e aplicação real
- Estimular experimentação e curiosidade
- Sempre que possível, conectar com o mundo real`;

window.abrirPromptIA = async function() {
  const cardId = cardAtivo || document.getElementById('f-id')?.value?.trim().toLowerCase().replace(/\s+/g,'-') || '';
  const id     = cardId || '—';
  const numero = document.getElementById('f-numero')?.value?.trim() || '—';
  const nome   = document.getElementById('f-nome')?.value?.trim()   || '—';
  const nivel  = document.getElementById('f-nivel')?.value          || '—';
  const tipo   = document.getElementById('f-tipo')?.value           || '—';
  const tema   = document.getElementById('f-tema')?.value?.trim()   || '—';

  let template = PROMPT_IA_DEFAULT_FALLBACK;
  let desc = '';
  try {
    const [snapTpl, snapCard] = await Promise.all([
      getDoc(doc(db, 'configuracoes', 'prompt_ia')),
      cardId ? getDoc(doc(db, 'cards', cardId)) : Promise.resolve(null)
    ]);
    const tipoObj = (window._tiposCard || []).find(t => t.nome === tipo);
    if (tipoObj?.prompt_ia) {
      template = tipoObj.prompt_ia;
    } else if (snapTpl.exists() && snapTpl.data().template) {
      template = snapTpl.data().template;
    }
    if (snapCard?.exists()) desc = snapCard.data().ia_desc_complementar || '';
  } catch(_) {}

  const prompt = template
    .replace(/\{id_do_card\}/g,                  id)
    .replace(/\{numero\}/g,                      numero)
    .replace(/\{nome_do_desafio\}/g,             nome)
    .replace(/\{nivel\}/g,                       nivel)
    .replace(/\{tipo_do_card\}/g,                tipo)
    .replace(/\{tema_do_card\}/g,                tema)
    .replace(/\{descricao[_ ]complementar\}/g,   desc || '(não informado)');

  const modal = document.createElement('div');
  modal.id = 'modal-prompt-ia';
  modal.className = 'modal-overlay';
  // guarda estado para atualização ao vivo
  window._promptIATemplate = template;
  window._promptIAFields   = { id, numero, nome, nivel, tipo, tema };

  modal.innerHTML = `
    <div class="modal-box modal-box-lg" style="max-width:680px;">
      <div class="modal-header">
        <div class="modal-title">🤖 Prompt IA — ${_escHtml(nome)}</div>
        <button class="modal-close" onclick="_salvarDescComplementar();document.getElementById('modal-prompt-ia').remove()">×</button>
      </div>
      <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:14px;max-height:80vh;overflow-y:auto;">

        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:#23314d;margin-bottom:6px;">
            📝 Descrição Complementar
          </label>
          <textarea id="ia-desc-complementar" rows="3"
            style="width:100%;font-size:13px;line-height:1.6;border:1.5px solid #ddd;border-radius:10px;
                   padding:12px;resize:vertical;outline:none;box-sizing:border-box;
                   font-family:inherit;background:#fafafa;color:#2f3447;transition:border-color .2s;"
            onfocus="this.style.borderColor='#23314d'"
            onblur="this.style.borderColor='#ddd'; window._salvarDescComplementar();"
            oninput="window._atualizarPreviewPromptIA()"
            placeholder="Ex: Componentes: Arduino Uno, LED vermelho, resistor 220Ω..."></textarea>
        </div>

        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <label style="font-size:12px;font-weight:700;color:#23314d;">🔍 Prompt para o Claude</label>
            <span style="font-size:11px;color:#8B9BB4;">Copie e cole no Claude</span>
          </div>
          <pre id="prompt-ia-texto"
            style="white-space:pre-wrap;font-family:monospace;font-size:11px;line-height:1.6;
                   color:#2f3447;margin:0;background:#f8f9fa;border:1.5px solid #e8eaf0;
                   border-radius:10px;padding:14px;max-height:340px;overflow-y:auto;"></pre>
        </div>

        <div style="display:flex;justify-content:flex-end;">
          <button onclick="copiarPromptIA()" id="btn-copiar-prompt"
            style="background:#2F3447;color:#fff;border:none;border-radius:8px;
                   padding:10px 24px;font-size:13px;font-weight:800;cursor:pointer;
                   font-family:'Inter Tight',sans-serif;">
            📋 Copiar Prompt
          </button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-prompt-ia')?.remove();
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) { _salvarDescComplementar(); modal.remove(); } });

  setTimeout(() => {
    const ta = document.getElementById('ia-desc-complementar');
    if (ta) { ta.value = desc; ta.focus(); }
    window._atualizarPreviewPromptIA();
  }, 80);
};

window._atualizarPreviewPromptIA = function() {
  const pre = document.getElementById('prompt-ia-texto');
  if (!pre || !window._promptIATemplate) return;
  const desc = document.getElementById('ia-desc-complementar')?.value?.trim() || '';
  const f = window._promptIAFields || {};
  pre.textContent = window._promptIATemplate
    .replace(/\{id_do_card\}/g,                f.id     || '—')
    .replace(/\{numero\}/g,                    f.numero || '—')
    .replace(/\{nome_do_desafio\}/g,           f.nome   || '—')
    .replace(/\{nivel\}/g,                     f.nivel  || '—')
    .replace(/\{tipo_do_card\}/g,              f.tipo   || '—')
    .replace(/\{tema_do_card\}/g,              f.tema   || '—')
    .replace(/\{descricao[_ ]complementar\}/g, desc || '(não informado)');
};

window.copiarPromptIA = function() {
  const pre = document.getElementById('prompt-ia-texto');
  const texto = pre?.textContent || '';
  navigator.clipboard.writeText(texto).then(() => {
    const btn = document.getElementById('btn-copiar-prompt');
    btn.textContent = '✅ Copiado!';
    btn.style.background = '#27ae60';
    setTimeout(() => { btn.textContent = '📋 Copiar Prompt'; btn.style.background = '#2F3447'; }, 2000);
  });
};

// ── Helpers de markdown para o modal IA ────────────────────────────────
function _escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _mdToHtml(md) {
  if (!md) return '<span style="color:#bbb;font-style:italic;">Sem conteúdo</span>';

  // Preserva blocos de código antes de escapar
  const blocosCodigo = [];
  md = md.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => {
    blocosCodigo.push(_escHtml(code.trim()));
    return `%%CODIGO_${blocosCodigo.length - 1}%%`;
  });

  // Escapa HTML
  md = _escHtml(md);

  // Formatação
  md = md
    .replace(/^#{3,}\s*(.+)$/gm, '<div style="font-size:11px;font-weight:800;color:#5f6480;text-transform:uppercase;letter-spacing:1px;margin:10px 0 4px;">$1</div>')
    .replace(/^#{1,2}\s*(.+)$/gm, '<div style="font-size:13px;font-weight:800;color:#23314d;margin:8px 0 4px;">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e8eaf0;margin:6px 0;">')
    .replace(/^&gt;\s*(.+)$/gm, '<div style="border-left:3px solid #ddd;padding-left:10px;color:#777;margin:3px 0;font-style:italic;">$1</div>')
    .replace(/^\*\s+(.+)$/gm, '<li style="margin:2px 0;">$1</li>')
    .replace(/^-\s+(.+)$/gm, '<li style="margin:2px 0;">$1</li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>)(\n(<li[^>]*>[\s\S]*?<\/li>))*/g,
      m => `<ul style="padding-left:20px;margin:4px 0;">${m}</ul>`)
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');

  // Restaura blocos de código
  blocosCodigo.forEach((code, i) => {
    md = md.replace(`%%CODIGO_${i}%%`,
      `<pre style="background:#1e1e1e;color:#d4d4d4;border-radius:8px;padding:12px;
                   font-size:11px;white-space:pre;overflow-x:auto;margin:8px 0;"><code>${code}</code></pre>`);
  });

  return md;
}

function _renderPreviewIA(secId) {
  const el = document.getElementById('ia-preview-' + secId);
  if (!el) return;
  const v = id => document.getElementById('ia-' + id)?.value || '';
  let html = '';

  if (secId === 'definicao') {
    const t = v('def-titulo');
    if (t) html += `<div style="font-weight:800;font-size:14px;color:#23314d;margin-bottom:6px;">${_escHtml(t)}</div>`;
    html += _mdToHtml(v('def-texto'));
  } else if (secId === 'ativ-descricao') {
    html = _mdToHtml(v('ativ-descricao'));
  } else if (secId === 'ativ-imagem') {
    html = _mdToHtml(v('ativ-imagem'));
  } else if (secId === 'ativ-codigo') {
    const cod = v('ativ-codigo');
    html = cod
      ? `<pre style="background:#1e1e1e;color:#d4d4d4;border-radius:8px;padding:12px;font-size:11px;white-space:pre;overflow-x:auto;margin:0;"><code>${_escHtml(cod)}</code></pre>`
      : '';
  } else if (secId === 'ativ-glossario') {
    if (window._iaGlossario?.length > 0) {
      html = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr><th style="text-align:left;padding:5px 8px;background:#f5f5f5;border:1px solid #ddd;">Código</th>
            <th style="text-align:left;padding:5px 8px;background:#f5f5f5;border:1px solid #ddd;">O que faz?</th></tr>
        ${window._iaGlossario.map(g => {
          const cod = _escHtml((g.codigo || '').replace(/^`+|`+$/g, '').trim());
          const desc = _escHtml(g.descricao || '')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:11px;">$1</code>');
          return `<tr><td style="padding:5px 8px;border:1px solid #ddd;font-family:monospace;font-size:11px;">${cod}</td>
               <td style="padding:5px 8px;border:1px solid #ddd;">${desc}</td></tr>`;
        }).join('')}
      </table>`;
    } else {
      html = '<span style="color:#aaa;font-size:12px;">Nenhum glossário gerado.</span>';
    }
  } else if (secId === 'imagem-capa') {
    const txt = v('imagem-capa');
    html = txt
      ? `<div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;padding:10px 14px;font-family:monospace;font-size:12px;color:#3730a3;white-space:pre-wrap;">${_escHtml(txt)}</div>`
      : '<span style="color:#bbb;font-style:italic;">Sem conteúdo</span>';
  } else {
    const taMap = { objetivo:'objetivo', curiosidades:'curiosidades', avaliacao:'avaliacao', desafio_extra:'desafio-extra' };
    html = _mdToHtml(v(taMap[secId] || secId));
  }

  el.innerHTML = html;
}

window.toggleModoIA = function(secId) {
  const preview = document.getElementById('ia-preview-' + secId);
  const edit    = document.getElementById('ia-edit-'    + secId);
  const btn     = document.getElementById('ia-toggle-'  + secId);
  if (!preview || !edit || !btn) return;
  const mostrando = preview.style.display !== 'none';
  if (mostrando) {
    preview.style.display = 'none';
    edit.style.display    = '';
    btn.textContent = '👁️ Preview';
  } else {
    _renderPreviewIA(secId);
    preview.style.display = '';
    edit.style.display    = 'none';
    btn.textContent = '✏️ Editar';
  }
};

// ── Gerar por IA (Claude) ───────────────────────────────────────────────
function _abrirModalGerarIA(nome) {
  document.getElementById('modal-gerar-ia')?.remove();
  const modal = document.createElement('div');
  modal.id = 'modal-gerar-ia';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box modal-box-lg">
      <div class="modal-header">
        <div class="modal-title">✨ Gerar por IA — ${nome}</div>
        <button class="modal-close" onclick="document.getElementById('modal-gerar-ia').remove()">×</button>
      </div>
      <div class="modal-body" id="gerar-ia-body"
           style="padding:20px;display:flex;flex-direction:column;gap:14px;
                  align-items:center;justify-content:center;min-height:200px;">
        <div style="font-size:36px;">⏳</div>
        <div style="font-size:14px;color:#666;font-weight:600;">Gerando conteúdo com Claude...</div>
        <div style="font-size:12px;color:#aaa;">Isso pode levar alguns segundos.</div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  return modal;
}

function _renderModalIA(d, doCacheado, descComplementar) {
  window._iaGlossario = d.glossario;

  const body = document.getElementById('gerar-ia-body');
  if (!body) return;
  body.style.alignItems     = 'stretch';
  body.style.justifyContent = 'flex-start';
  body.style.padding        = '16px';
  body.style.overflowY      = 'auto';
  body.style.maxHeight      = '72vh';

  const lblStyle = 'display:block;font-size:11px;font-weight:700;color:#8B9BB4;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;';
  const taBase   = 'display:block;width:100%;font-size:12px;line-height:1.6;border:1.5px solid #ddd;border-radius:8px;padding:10px;resize:vertical;outline:none;box-sizing:border-box;';

  const secao = (secId, titulo, campos) => {
    const camposHTML = campos.map(c => {
      const bg  = c.mono ? '#1e1e1e' : '#fafafa';
      const cor = c.mono ? '#d4d4d4' : '#2f3447';
      const ff  = c.mono ? 'monospace' : 'inherit';
      const h   = (c.rows || 4) * 22 + 24;
      return (c.label ? `<label style="${lblStyle}">${c.label}</label>` : '') +
        `<textarea id="ia-${c.id}" style="${taBase}font-family:${ff};min-height:${h}px;background:${bg};color:${cor};"></textarea>`;
    }).join('');

    return `<div style="border:1.5px solid #e8eaf0;border-radius:12px;margin-bottom:10px;">
      <div style="background:#f5f7fb;border-bottom:1px solid #e8eaf0;padding:10px 16px;border-radius:11px 11px 0 0;
                  display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:13px;font-weight:800;color:#23314d;">${titulo}</span>
        <div style="display:flex;gap:8px;">
          <button id="ia-toggle-${secId}" onclick="toggleModoIA('${secId}')"
            style="background:#fff;color:#555;border:1.5px solid #ddd;padding:5px 12px;
                   border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;
                   font-family:'Inter Tight',sans-serif;">✏️ Editar</button>
          <button id="btn-sec-${secId}" onclick="carregarSecaoIA('${secId}')"
            style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;
                   padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;
                   cursor:pointer;font-family:'Inter Tight',sans-serif;">📥 Carregar</button>
        </div>
      </div>
      <div id="ia-preview-${secId}" style="padding:14px 16px;font-size:13px;line-height:1.7;color:#2f3447;min-height:60px;"></div>
      <div id="ia-edit-${secId}" style="padding:12px 16px;display:none;">${camposHTML}</div>
    </div>`;
  };

  // Sub-painel para a seção 5 (mais compacto, sem label nos campos)
  const subSecao = (secId, titulo, campos) => {
    const camposHTML = campos.map(c => {
      const bg  = c.mono ? '#1e1e1e' : '#fafafa';
      const cor = c.mono ? '#d4d4d4' : '#2f3447';
      const ff  = c.mono ? 'monospace' : 'inherit';
      const h   = (c.rows || 4) * 22 + 20;
      return `<textarea id="ia-${c.id}" style="${taBase}font-family:${ff};min-height:${h}px;background:${bg};color:${cor};"></textarea>`;
    }).join('');
    return `<div style="border:1px solid #e2e5ef;border-radius:8px;">
      <div style="background:#f9fafb;border-bottom:1px solid #e2e5ef;padding:7px 12px;border-radius:7px 7px 0 0;
                  display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:12px;font-weight:700;color:#23314d;">${titulo}</span>
        <div style="display:flex;gap:6px;">
          <button id="ia-toggle-${secId}" onclick="toggleModoIA('${secId}')"
            style="background:#fff;color:#555;border:1.5px solid #ddd;padding:3px 10px;
                   border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;
                   font-family:'Inter Tight',sans-serif;">✏️ Editar</button>
          <button id="btn-sec-${secId}" onclick="carregarSecaoIA('${secId}')"
            style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;
                   padding:4px 12px;border-radius:5px;font-size:11px;font-weight:700;
                   cursor:pointer;font-family:'Inter Tight',sans-serif;">📥 Carregar</button>
        </div>
      </div>
      <div id="ia-preview-${secId}" style="padding:10px 12px;font-size:13px;line-height:1.7;color:#2f3447;min-height:40px;"></div>
      <div id="ia-edit-${secId}" style="padding:8px 12px;display:none;">${camposHTML}</div>
    </div>`;
  };

  const subSecaoGlossario = () => `
    <div style="border:1px solid #e2e5ef;border-radius:8px;">
      <div style="background:#f9fafb;border-bottom:1px solid #e2e5ef;padding:7px 12px;border-radius:7px 7px 0 0;
                  display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:12px;font-weight:700;color:#23314d;">5.4 Glossário de Código</span>
        <button id="btn-sec-ativ-glossario" onclick="carregarSecaoIA('ativ-glossario')"
          style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;
                 padding:4px 12px;border-radius:5px;font-size:11px;font-weight:700;
                 cursor:pointer;font-family:'Inter Tight',sans-serif;">📥 Carregar</button>
      </div>
      <div id="ia-preview-ativ-glossario" style="padding:10px 12px;font-size:13px;color:#2f3447;min-height:40px;"></div>
    </div>`;

  const avisoDescComplementar = descComplementar
    ? `<div style="background:#f0f7ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:12px 16px;
                   font-size:12px;color:#1e3a5f;margin-bottom:4px;display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:15px;line-height:1;">📝</span>
        <div style="flex:1;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#3b82f6;">
              Descrição Complementar
            </span>
            <button onclick="mostrarPromptIA()"
              style="background:#fff;color:#3b82f6;border:1.5px solid #bfdbfe;padding:3px 10px;
                     border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;
                     font-family:'Inter Tight',sans-serif;">
              🔍 Mostrar Prompt
            </button>
          </div>
          <div style="line-height:1.6;white-space:pre-wrap;">${_escHtml(descComplementar)}</div>
        </div>
       </div>`
    : '';

  const avisoCache = doCacheado
    ? `<div style="background:#fff8ec;border:1px solid #f39c12;border-radius:8px;padding:10px 14px;font-size:12px;color:#7a5200;margin-bottom:4px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span>⚡ Conteúdo gerado anteriormente.</span>
        <button onclick="verTextoOriginalIA()"
          style="background:none;border:1.5px solid #c87700;color:#7a5200;font-weight:700;cursor:pointer;font-size:11px;padding:3px 10px;border-radius:6px;">
          📄 Original
        </button>
        <button onclick="gerarPorIA(true)"
          style="background:none;border:none;color:#2f3447;font-weight:700;cursor:pointer;font-size:12px;text-decoration:underline;">
          Regenerar com Claude
        </button>
       </div>` : '';

  const atividadeBloco = `
    <div style="border:1.5px solid #e8eaf0;border-radius:12px;margin-bottom:10px;">
      <div style="background:#f5f7fb;padding:10px 16px;border-radius:11px 11px 0 0;border-bottom:1px solid #e8eaf0;">
        <span style="font-size:13px;font-weight:800;color:#23314d;">5. Atividade Rápida</span>
      </div>
      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
        ${subSecao('ativ-descricao', '5.1 Descrição da Atividade',  [{id:'ativ-descricao', rows:4}])}
        <div style="border:1px solid #e2e5ef;border-radius:8px;">
          <div style="background:#f9fafb;border-bottom:1px solid #e2e5ef;padding:7px 12px;border-radius:7px 7px 0 0;
                      display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:12px;font-weight:700;color:#23314d;">5.2 Imagem do Circuito</span>
            <div style="display:flex;gap:6px;">
              <button id="ia-toggle-ativ-imagem" onclick="toggleModoIA('ativ-imagem')"
                style="background:#fff;color:#555;border:1.5px solid #ddd;padding:3px 10px;
                       border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;
                       font-family:'Inter Tight',sans-serif;">✏️ Editar</button>
              <button id="btn-sec-ativ-imagem" onclick="copiarPromptIA('ativ-imagem')"
                style="background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;
                       padding:4px 12px;border-radius:5px;font-size:11px;font-weight:700;
                       cursor:pointer;font-family:'Inter Tight',sans-serif;">📋 Copiar Prompt</button>
            </div>
          </div>
          <div id="ia-preview-ativ-imagem" style="padding:10px 12px;font-size:13px;line-height:1.7;color:#2f3447;min-height:40px;"></div>
          <div id="ia-edit-ativ-imagem" style="padding:8px 12px;display:none;">
            <textarea id="ia-ativ-imagem" style="${taBase}min-height:${3*22+20}px;background:#fafafa;color:#2f3447;"></textarea>
          </div>
        </div>
        ${subSecao('ativ-codigo',    '5.3 Código Arduino IDE',       [{id:'ativ-codigo',    rows:7, mono:true}])}
        ${subSecaoGlossario()}
      </div>
    </div>`;

  body.innerHTML =
    avisoDescComplementar +
    avisoCache +
    secao('objetivo',     '1. Objetivo',        [{id:'objetivo',     rows:5}]) +
    secao('definicao',    '2. Definição',        [{id:'def-titulo', label:'Título', rows:2},
                                                   {id:'def-texto',  label:'Texto',  rows:5}]) +
    secao('curiosidades', '3. Curiosidades',     [{id:'curiosidades', rows:6}]) +
    secao('avaliacao',    '4. Avaliação',        [{id:'avaliacao',    rows:6}]) +
    atividadeBloco +
    secao('desafio_extra','6. Desafio Extra',    [{id:'desafio-extra', rows:5}]) +
    `<div style="border:1.5px solid #e0e7ff;border-radius:12px;margin-bottom:10px;">
      <div style="background:#eef2ff;border-bottom:1px solid #e0e7ff;padding:10px 16px;border-radius:11px 11px 0 0;
                  display:flex;align-items:center;justify-content:space-between;">
        <div>
          <span style="font-size:13px;font-weight:800;color:#3730a3;">7. Prompt para Imagem de Capa</span>
          <span style="font-size:11px;color:#818cf8;margin-left:8px;">Use no Midjourney, Dall-E, Stable Diffusion</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="ia-toggle-imagem-capa" onclick="toggleModoIA('imagem-capa')"
            style="background:#fff;color:#555;border:1.5px solid #ddd;padding:5px 12px;
                   border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;
                   font-family:'Inter Tight',sans-serif;">✏️ Editar</button>
          <button id="btn-sec-imagem-capa" onclick="copiarPromptIA('imagem-capa')"
            style="background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;
                   padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;
                   cursor:pointer;font-family:'Inter Tight',sans-serif;">📋 Copiar Prompt</button>
        </div>
      </div>
      <div id="ia-preview-imagem-capa" style="padding:14px 16px;font-size:13px;line-height:1.7;color:#2f3447;min-height:60px;"></div>
      <div id="ia-edit-imagem-capa" style="padding:12px 16px;display:none;">
        <textarea id="ia-imagem-capa" style="${taBase}min-height:${4*22+24}px;background:#fafafa;color:#2f3447;"></textarea>
      </div>
    </div>` +
    `<div style="display:flex;gap:10px;justify-content:flex-end;padding-top:4px;">
      <button onclick="document.getElementById('modal-gerar-ia').remove()"
        style="background:#fff;color:#555;border:1.5px solid #ddd;padding:9px 18px;
               border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter Tight',sans-serif;">
        Fechar
      </button>
      <button onclick="carregarDadosIA()"
        style="background:#23314d;color:#fff;border:none;padding:10px 24px;
               border-radius:8px;font-size:13px;font-weight:800;cursor:pointer;font-family:'Inter Tight',sans-serif;">
        📥 Carregar Tudo
      </button>
    </div>`;

  // Preenche valores via .value — seguro para qualquer caractere incluindo backticks
  const setTA = (elId, val) => { const el = document.getElementById('ia-' + elId); if (el) el.value = val || ''; };
  setTA('objetivo',       d.objetivo);
  setTA('def-titulo',     d.definicao_titulo);
  setTA('def-texto',      d.definicao_texto);
  setTA('curiosidades',   d.curiosidades);
  setTA('avaliacao',      d.avaliacao);
  setTA('ativ-descricao', d.atividade_descricao);
  setTA('ativ-imagem',    d.atividade_imagem);
  setTA('ativ-codigo',    d.atividade_codigo);
  setTA('desafio-extra',  d.desafio_extra);
  setTA('imagem-capa',    d.imagem_capa);

  // Renderiza preview formatado para todas as seções
  ['objetivo','definicao','curiosidades','avaliacao',
   'ativ-descricao','ativ-imagem','ativ-codigo','ativ-glossario',
   'desafio_extra','imagem-capa']
    .forEach(s => _renderPreviewIA(s));
}

window.copiarPromptIA = function(secId) {
  const el = document.getElementById('ia-' + secId);
  const texto = el?.value || '';
  if (!texto) { showToast('Nenhum conteúdo para copiar', ''); return; }
  navigator.clipboard.writeText(texto).then(() => {
    showToast('✅ Prompt copiado! Cole no gerador de imagem.', 'success');
    const btn = document.getElementById('btn-sec-' + secId);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✅ Copiado!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  }).catch(() => showToast('Erro ao copiar — tente manualmente', 'error'));
};

window.mostrarPromptIA = async function() {
  const cardId = cardAtivo || document.getElementById('f-id')?.value?.trim().toLowerCase().replace(/\s+/g,'-') || '';
  const nome   = document.getElementById('f-nome')?.value?.trim()   || '—';
  const id     = cardId || '—';
  const numero = document.getElementById('f-numero')?.value?.trim() || '—';
  const nivel  = document.getElementById('f-nivel')?.value          || '—';
  const tipo   = document.getElementById('f-tipo')?.value           || '—';
  const tema   = document.getElementById('f-tema')?.value?.trim()   || '—';
  const desc   = window._iaDescComplementar || '';

  let template = PROMPT_IA_DEFAULT_FALLBACK;
  try {
    const tSnap = await getDoc(doc(db, 'configuracoes', 'prompt_ia'));
    if (tSnap.exists() && tSnap.data().template) template = tSnap.data().template;
  } catch(_) {}

  const prompt = template
    .replace(/\{id_do_card\}/g,             id)
    .replace(/\{numero\}/g,                 numero)
    .replace(/\{nome_do_desafio\}/g,        nome)
    .replace(/\{nivel\}/g,                  nivel)
    .replace(/\{tipo_do_card\}/g,           tipo)
    .replace(/\{tema_do_card\}/g,           tema)
    .replace(/\{descricao[_ ]complementar\}/g, desc || '(não informado)');

  const modal = document.createElement('div');
  modal.id = 'modal-ia-prompt';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;width:min(820px,96vw);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.22);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #eee;">
        <span style="font-weight:800;font-size:15px;color:#23314d;">🔍 Prompt para o Claude</span>
        <button onclick="document.getElementById('modal-ia-prompt').remove()"
          style="background:none;border:none;font-size:20px;cursor:pointer;color:#888;line-height:1;">×</button>
      </div>
      <div style="padding:20px;overflow-y:auto;flex:1;">
        <pre id="ia-prompt-pre" style="white-space:pre-wrap;font-family:monospace;font-size:12px;line-height:1.7;color:#2f3447;margin:0;background:#f8f9fa;border-radius:8px;padding:16px;"></pre>
      </div>
      <div style="padding:12px 20px;border-top:1px solid #eee;display:flex;justify-content:flex-end;">
        <button onclick="document.getElementById('modal-ia-prompt').remove()"
          style="background:#23314d;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter Tight',sans-serif;">
          Fechar
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('ia-prompt-pre').textContent = prompt;
};

window.verTextoOriginalIA = function() {
  const texto = window._iaTextoRaw || '';
  if (!texto) return;
  const modal = document.createElement('div');
  modal.id = 'modal-ia-original';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;width:min(820px,96vw);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.22);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #eee;">
        <span style="font-weight:800;font-size:15px;color:#23314d;">📄 Texto Original da IA</span>
        <button onclick="document.getElementById('modal-ia-original').remove()"
          style="background:none;border:none;font-size:20px;cursor:pointer;color:#888;line-height:1;">×</button>
      </div>
      <div style="padding:20px;overflow-y:auto;flex:1;">
        <pre id="ia-original-pre" style="white-space:pre-wrap;font-family:monospace;font-size:12px;line-height:1.7;color:#2f3447;margin:0;"></pre>
      </div>
      <div style="padding:12px 20px;border-top:1px solid #eee;display:flex;justify-content:flex-end;">
        <button onclick="document.getElementById('modal-ia-original').remove()"
          style="background:#23314d;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter Tight',sans-serif;">
          Fechar
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('ia-original-pre').textContent = texto;
};

// Abre o modal de descrição complementar + preview do prompt antes de gerar
window.gerarPorIA = async function(forcarRegerar = false) {
  const nome   = document.getElementById('f-nome')?.value?.trim() || '—';
  const cardId = cardAtivo || document.getElementById('f-id')?.value?.trim().toLowerCase().replace(/\s+/g,'-') || '';
  document.getElementById('modal-desc-complementar')?.remove();

  // Sempre carrega do Firestore — evita contaminação entre cards
  let descSalva = '';
  let template  = PROMPT_IA_DEFAULT_FALLBACK;
  try {
    const [snapCard, snapTpl] = await Promise.all([
      cardId ? getDoc(doc(db, 'cards', cardId)) : Promise.resolve(null),
      getDoc(doc(db, 'configuracoes', 'prompt_ia'))
    ]);
    if (snapCard?.exists()) descSalva = snapCard.data().ia_desc_complementar || '';
    // Prompt do tipo tem prioridade; fallback para o prompt global
    const tipoNome = document.getElementById('f-tipo')?.value || '';
    const tipoObj  = (window._tiposCard || []).find(t => t.nome === tipoNome);
    if (tipoObj?.prompt_ia) {
      template = tipoObj.prompt_ia;
    } else if (snapTpl.exists() && snapTpl.data().template) {
      template = snapTpl.data().template;
    }
  } catch(_) {}

  window._iaDescComplementar = descSalva;
  window._iaCardIdAtual      = cardId;
  window._iaTemplateAtual    = template;

  const modal = document.createElement('div');
  modal.id = 'modal-desc-complementar';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box modal-box-lg" style="max-width:680px;">
      <div class="modal-header">
        <div class="modal-title">✨ Gerar por IA — ${_escHtml(nome)}</div>
        <button class="modal-close" onclick="_salvarDescComplementar();document.getElementById('modal-desc-complementar').remove()">×</button>
      </div>
      <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:14px;max-height:80vh;overflow-y:auto;">

        <!-- Descrição complementar -->
        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:#23314d;margin-bottom:6px;">
            📝 Descrição Complementar
          </label>
          <textarea id="ia-desc-complementar" rows="4"
            style="width:100%;font-size:13px;line-height:1.6;border:1.5px solid #ddd;border-radius:10px;
                   padding:12px;resize:vertical;outline:none;box-sizing:border-box;
                   font-family:inherit;background:#fafafa;color:#2f3447;transition:border-color .2s;"
            onfocus="this.style.borderColor='#23314d'"
            onblur="this.style.borderColor='#ddd'; window._salvarDescComplementar();"
            oninput="window._atualizarPreviewPrompt()"
            placeholder="Ex: Componentes: Arduino Uno, LED vermelho, resistor 220Ω, protoboard, botão push..."></textarea>
        </div>

        <!-- Preview do prompt -->
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <label style="font-size:12px;font-weight:700;color:#23314d;">🔍 Prompt para o Claude</label>
            <span style="font-size:11px;color:#8B9BB4;">Verifique antes de gerar</span>
          </div>
          <pre id="ia-prompt-preview"
            style="white-space:pre-wrap;font-family:monospace;font-size:11px;line-height:1.6;
                   color:#2f3447;margin:0;background:#f8f9fa;border:1.5px solid #e8eaf0;
                   border-radius:10px;padding:14px;max-height:320px;overflow-y:auto;"></pre>
        </div>

        <!-- Botões -->
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button onclick="_salvarDescComplementar();document.getElementById('modal-desc-complementar').remove()"
            style="background:#fff;color:#555;border:1.5px solid #ddd;padding:9px 18px;
                   border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter Tight',sans-serif;">
            Cancelar
          </button>
          <button onclick="window._executarGerarIA(${forcarRegerar})"
            style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;
                   padding:10px 24px;border-radius:8px;font-size:13px;font-weight:800;
                   cursor:pointer;font-family:'Inter Tight',sans-serif;">
            ✨ Gerar com Claude
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) { _salvarDescComplementar(); modal.remove(); } });

  setTimeout(() => {
    const ta = document.getElementById('ia-desc-complementar');
    if (ta) { ta.value = descSalva; ta.focus(); }
    window._atualizarPreviewPrompt();
  }, 80);
};

window._salvarDescComplementar = function() {
  const desc   = document.getElementById('ia-desc-complementar')?.value?.trim() || '';
  const cardId = cardAtivo || document.getElementById('f-id')?.value?.trim().toLowerCase().replace(/\s+/g,'-') || '';
  window._iaDescComplementar = desc;
  if (cardId && desc) {
    setDoc(doc(db, 'cards', cardId), { ia_desc_complementar: desc }, { merge: true })
      .catch(() => {});
  }
};

window._atualizarPreviewPrompt = function() {
  const preview = document.getElementById('ia-prompt-preview');
  if (!preview || !window._iaTemplateAtual) return;
  const desc   = document.getElementById('ia-desc-complementar')?.value?.trim() || '';
  const cardId = cardAtivo || document.getElementById('f-id')?.value?.trim().toLowerCase().replace(/\s+/g,'-') || '—';
  const prompt = window._iaTemplateAtual
    .replace(/\{id_do_card\}/g,             cardId)
    .replace(/\{numero\}/g,                 document.getElementById('f-numero')?.value?.trim() || '—')
    .replace(/\{nome_do_desafio\}/g,        document.getElementById('f-nome')?.value?.trim()   || '—')
    .replace(/\{nivel\}/g,                  document.getElementById('f-nivel')?.value           || '—')
    .replace(/\{tipo_do_card\}/g,           document.getElementById('f-tipo')?.value            || '—')
    .replace(/\{tema_do_card\}/g,           document.getElementById('f-tema')?.value?.trim()    || '—')
    .replace(/\{descricao[_ ]complementar\}/g, desc || '(não informado)');
  preview.textContent = prompt;
};

window._executarGerarIA = async function(forcarRegerar = false) {
  const descComplementar = document.getElementById('ia-desc-complementar')?.value?.trim() || '';
  document.getElementById('modal-desc-complementar')?.remove();

  const cardId = cardAtivo || document.getElementById('f-id')?.value?.trim().toLowerCase().replace(/\s+/g,'-') || '';
  const nome   = document.getElementById('f-nome')?.value?.trim() || '—';

  _abrirModalGerarIA(nome);

  try {
    // Verifica cache (ia_conteudo no card) — evita chamar a API novamente
    if (!forcarRegerar && cardId) {
      const cardSnap = await getDoc(doc(db, 'cards', cardId));
      const cached      = cardSnap.exists() ? cardSnap.data().ia_conteudo             : null;
      const cachedDesc  = cardSnap.exists() ? cardSnap.data().ia_desc_complementar || '' : '';
      const cachedPrompt = cardSnap.exists() ? cardSnap.data().ia_prompt_usado      || '' : '';
      if (cached) {
        window._iaTextoRaw = cached;
        window._iaDescComplementar = cachedDesc;
        window._iaPromptUsado = cachedPrompt;
        _renderModalIA(parsearConteudoIA(cached), true, cachedDesc);
        return;
      }
    }

    const id     = cardId || '—';
    const numero = document.getElementById('f-numero')?.value?.trim() || '—';
    const nivel  = document.getElementById('f-nivel')?.value          || '—';
    const tipo   = document.getElementById('f-tipo')?.value           || '—';
    const tema   = document.getElementById('f-tema')?.value?.trim()   || '—';

    let template = PROMPT_IA_DEFAULT_FALLBACK;
    try {
      const tSnap = await getDoc(doc(db, 'configuracoes', 'prompt_ia'));
      if (tSnap.exists() && tSnap.data().template) template = tSnap.data().template;
    } catch(_) {}

    const prompt = template
      .replace(/\{id_do_card\}/g,             id)
      .replace(/\{numero\}/g,                 numero)
      .replace(/\{nome_do_desafio\}/g,        nome)
      .replace(/\{nivel\}/g,                  nivel)
      .replace(/\{tipo_do_card\}/g,           tipo)
      .replace(/\{tema_do_card\}/g,           tema)
      .replace(/\{descricao[_ ]complementar\}/g, descComplementar || '(não informado)');

    const keySnap = await getDoc(doc(db, 'configuracoes', 'api_keys'));
    const apiKey  = keySnap.data()?.anthropic;
    if (!apiKey) throw new Error('Chave da API não encontrada em configuracoes/api_keys');

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Erro HTTP ${resp.status}`);
    }

    const data        = await resp.json();
    const textoGerado = data.content?.[0]?.text || '';

    window._iaTextoRaw = textoGerado;
    window._iaDescComplementar = descComplementar;
    window._iaPromptUsado = prompt;

    // Salva ANTES de renderizar — garante o cache mesmo se _renderModalIA lançar erro
    if (cardId) {
      setDoc(doc(db, 'cards', cardId), {
        ia_conteudo: textoGerado,
        ia_desc_complementar: descComplementar,
        ia_prompt_usado: prompt
      }, { merge: true })
        .catch(e => console.warn('Não foi possível salvar ia_conteudo:', e.message));
    }

    _renderModalIA(parsearConteudoIA(textoGerado), false, descComplementar);

  } catch(err) {
    const body = document.getElementById('gerar-ia-body');
    if (body) body.innerHTML = `
      <div style="color:#e74c3c;font-weight:700;font-size:14px;margin-bottom:8px;">❌ Erro ao gerar conteúdo</div>
      <div style="color:#666;font-size:13px;">${err.message}</div>
      <button onclick="document.getElementById('modal-gerar-ia').remove()"
        style="margin-top:12px;background:#eee;color:#333;border:none;border-radius:8px;padding:8px 18px;cursor:pointer;font-size:12px;">
        Fechar
      </button>`;
  }
};

function _semAcento(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function _detectarSecao(linha) {
  // Remove markdown (##, **, *) e espaços iniciais
  const limpa = linha.replace(/^\s*#{1,6}\s*/, '').replace(/\*+/g, '').trim();
  // Só considera seções principais: linha começa com dígito 1-7 + ponto/parêntese
  const m = limpa.match(/^([1-7])\s*[.)]\s*(.+)/);
  if (!m) return null;

  // Remove emojis e outros caracteres não-latinos para não quebrar startsWith
  const tituloLimpo = m[2]
    .replace(/[^ -ɏ\s]/g, ' ')  // mantém apenas Latin Basic + Extended
    .trim();
  const titulo = _semAcento(tituloLimpo.split(/[—\-–(]/)[0].trim());

  // Detecta apenas pelos nomes esperados — sem fallback por número
  // (fallback por número causava conflito com listas numeradas dentro das seções)
  if (titulo.startsWith('objetivo'))    return 'objetivo';
  if (titulo.startsWith('defini'))      return 'definicao';
  if (titulo.startsWith('curiosidade'))return 'curiosidades';
  if (titulo.startsWith('avali'))       return 'avaliacao';
  if (titulo.startsWith('atividade'))   return 'atividade';
  if (titulo.startsWith('desafio'))     return 'desafio_extra';
  if (titulo.startsWith('prompt') || titulo.startsWith('imagem') || titulo.startsWith('capa')) return 'imagem_capa';
  return null;
}

function parsearConteudoIA(texto) {
  const r = {
    objetivo: '', definicao_titulo: '', definicao_texto: '',
    curiosidades: '', avaliacao: '',
    atividade_descricao: '', atividade_imagem: '', atividade_codigo: '', glossario: [],
    desafio_extra: '', imagem_capa: ''
  };

  // Divide linha a linha e agrupa por seção
  const secoes = {};
  let secaoAtual = null;
  let buffer = [];

  for (const linha of texto.split('\n')) {
    const secao = _detectarSecao(linha);
    if (secao) {
      if (secaoAtual) secoes[secaoAtual] = buffer.join('\n').trim();
      secaoAtual = secao;
      buffer = [];
    } else if (secaoAtual) {
      buffer.push(linha);
    }
  }
  if (secaoAtual) secoes[secaoAtual] = buffer.join('\n').trim();

  r.objetivo      = secoes.objetivo      || '';
  r.curiosidades  = secoes.curiosidades  || '';
  r.avaliacao     = secoes.avaliacao     || '';
  r.desafio_extra = secoes.desafio_extra || '';

  // Imagem de capa: extrai só o texto do prompt (remove **labels:** e code fences)
  if (secoes.imagem_capa) {
    const icCode = secoes.imagem_capa.match(/```[^\n]*\n?([\s\S]*?)```/);
    if (icCode) {
      r.imagem_capa = icCode[1].trim();
    } else {
      r.imagem_capa = secoes.imagem_capa
        .replace(/^\*\*[^*\n]+\*\*\s*[:\-]?\s*\n?/gm, '')
        .trim();
    }
  }

  // Definição: separa título do texto
  if (secoes.definicao) {
    const def = secoes.definicao;
    const tM  = def.match(/(?:t[íi]tulo[^:\n]*:\s*)(.+)/i);
    if (tM) {
      r.definicao_titulo = tM[1].replace(/\*+/g, '').trim();
      r.definicao_texto  = def.replace(/.*t[íi]tulo[^:\n]*:.*\n?/i, '').trim();
    } else {
      const linhas = def.split('\n').map(l => l.trim()).filter(Boolean);
      r.definicao_titulo = (linhas[0] || '').replace(/^[-*#\s]+/, '').replace(/\*+/g, '').trim();
      r.definicao_texto  = linhas.slice(1).join('\n').trim();
    }
  }

  // Atividade: código, glossário e descrição
  if (secoes.atividade) {
    const at = secoes.atividade;

    // Extrai bloco de código Arduino — prefere blocos com linguagem explícita (arduino/cpp)
    let codeM = at.match(/```(?:arduino|cpp|c\+\+|sketch)\n?([\s\S]*?)```/i);
    if (!codeM) {
      // Fallback: procura qualquer bloco de código somente após o sub-cabeçalho de código
      const codeHdrM = at.match(/#{2,}[^\n]*[Cc][oó]d(?:igo)?[^\n]*/);
      const atCod = codeHdrM ? at.slice(at.indexOf(codeHdrM[0]) + codeHdrM[0].length) : null;
      if (atCod) codeM = atCod.match(/```[^\n]*\n?([\s\S]*?)```/);
    }
    if (codeM) r.atividade_codigo = codeM[1].trim();

    // Extrai glossário (tabela markdown) — busca depois do sub-cabeçalho de glossário
    // para não confundir com tabelas de materiais que aparecem antes
    const glossHdrM = at.match(/#{2,}[^\n]*[Gg]loss[^\n]*/);
    const atGloss   = glossHdrM ? at.slice(at.indexOf(glossHdrM[0]) + glossHdrM[0].length) : at;
    const tabM = atGloss.match(/\|[^\n]+\|\n\s*\|[-:\s|]+\|\n((?:\|[^\n]+\|\n?)+)/);
    if (tabM) {
      r.glossario = tabM[1].trim().split('\n').map(l => {
        const cols = l.split('|').map(c => c.trim()).filter(Boolean);
        return { codigo: cols[0] || '', descricao: cols[1] || '' };
      }).filter(g => g.codigo || g.descricao);
    }

    // Parse sub-seções da atividade linha a linha
    const linhasAt = at.split('\n');
    let subSec = 'descricao';
    const subBuf = { descricao: [], imagem: [] };

    for (const l of linhasAt) {
      if (/^\s*#{2,}/.test(l)) {
        const lLimpa = _semAcento(
          l.replace(/^\s*#{2,}\s*/, '').replace(/[^ -ɏ\s]/g, ' ').toLowerCase().trim()
        );
        if (/circu|imagem|montagem|esquema/.test(lLimpa)) {
          subSec = 'imagem';
        } else if (/descri/.test(lLimpa)) {
          subSec = 'descricao';
        } else {
          subSec = null; // código e glossário tratados pelos regex acima
        }
      } else if (subSec) {
        subBuf[subSec].push(l);
      }
    }

    r.atividade_descricao = subBuf.descricao.join('\n').trim();
    r.atividade_imagem    = subBuf.imagem.join('\n').trim();
  }

  return r;
}

function _iaVal(id) { return document.getElementById('ia-' + id)?.value || ''; }

function _marcarCarregado(secaoId) {
  const btn = document.getElementById('btn-sec-' + secaoId);
  if (!btn) return;
  btn.textContent = '✅ Carregado';
  btn.style.background = '#059669';
  btn.disabled = true;
}

window.carregarSecaoIA = function(secao) {
  const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };

  if (secao === 'objetivo') {
    set('f-objetivo', _iaVal('objetivo'));

  } else if (secao === 'definicao') {
    set('f-def-titulo', _iaVal('def-titulo'));
    set('f-def-texto',  _iaVal('def-texto'));

  } else if (secao === 'curiosidades') {
    set('f-curiosidades', _iaVal('curiosidades'));

  } else if (secao === 'avaliacao') {
    set('f-avaliacao', _iaVal('avaliacao'));

  } else if (secao === 'ativ-descricao') {
    set('f-ativ-descricao', _iaVal('ativ-descricao'));

  } else if (secao === 'ativ-imagem') {
    set('f-ativ-imagem-url', _iaVal('ativ-imagem'));

  } else if (secao === 'ativ-codigo') {
    set('f-ativ-codigo', _iaVal('ativ-codigo'));

  } else if (secao === 'ativ-glossario') {
    if (window._iaGlossario?.length > 0) {
      window.glossarioState = window._iaGlossario;
      rebuildGlossario();
    }

  } else if (secao === 'desafio_extra') {
    set('f-desafio-extra', _iaVal('desafio-extra'));
  }

  _marcarCarregado(secao);
  showToast('✅ Tópico carregado!', 'success');
};

window.carregarDadosIA = function() {
  const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  set('f-objetivo',       _iaVal('objetivo'));
  set('f-def-titulo',     _iaVal('def-titulo'));
  set('f-def-texto',      _iaVal('def-texto'));
  set('f-curiosidades',   _iaVal('curiosidades'));
  set('f-avaliacao',      _iaVal('avaliacao'));
  set('f-ativ-descricao',  _iaVal('ativ-descricao'));
  set('f-ativ-codigo',     _iaVal('ativ-codigo'));
  set('f-desafio-extra',   _iaVal('desafio-extra'));

  if (window._iaGlossario?.length > 0) {
    window.glossarioState = window._iaGlossario;
    rebuildGlossario();
  }

  document.getElementById('modal-gerar-ia')?.remove();
  showToast('✅ Todos os dados carregados no card!', 'success');
};

// ── ESTATÍSTICA DE CARDS ──────────────────────────────────────────────────────
window.abrirEstatisticaCards = async function() {
  const modal = document.createElement('div');
  modal.id = 'modal-estatistica-cards';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;width:600px;max-width:96vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.2);overflow:hidden;">
      <div style="padding:18px 24px 14px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <div style="font-size:16px;font-weight:700;color:#23314d;">📊 Estatística de Cards</div>
        <button onclick="document.getElementById('modal-estatistica-cards').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999;line-height:1;">✕</button>
      </div>
      <div id="estat-body" style="overflow-y:auto;flex:1;padding:20px 24px;">
        <div style="text-align:center;color:#bbb;font-size:13px;padding:24px;">Carregando...</div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  try {
    const [cardsSnap, trilhasSnap] = await Promise.all([
      getDocs(collection(db, 'cards')),
      getDocs(collection(db, 'trilhas'))
    ]);

    // IDs de cards vinculados a trilhas
    const cardsEmTrilha = new Set();
    trilhasSnap.forEach(t => (t.data().cards || []).forEach(cid => cardsEmTrilha.add(cid)));

    const JOGOS = [
      { key: 'quiz',              label: 'Quiz'             },
      { key: 'bug_codigos',       label: 'Caça ao Bug'      },
      { key: 'comp_perguntas',    label: 'Qual Componente?' },
      { key: 'ordena_desafios',   label: 'Ordena Código'    },
      { key: 'complete_desafios', label: 'Complete o Código'},
      { key: 'conecta_desafios',  label: 'Conecta Pontos'   },
      { key: 'box_desafios',      label: 'Simulador BOX'    },
      { key: 'binario_desafios',  label: 'Código Binário'   },
    ];

    const tipos       = {};
    const jogoCount   = Object.fromEntries(JOGOS.map(j => [j.key, 0]));
    let total         = 0;
    let publicados    = 0;
    let semImagem     = 0;
    let semJogo       = 0;
    let comAnexos     = 0;
    let ptsTotalDisp  = 0;
    let comTrilha     = 0;

    cardsSnap.forEach(d => {
      const c   = d.data();
      const pub = c.publicado === true;
      const tipo = c.tipo?.trim() || 'Sem tipo';

      total++;
      if (pub) publicados++;
      if (!c.imagem_url) semImagem++;
      if (cardsEmTrilha.has(d.id)) comTrilha++;
      if (c.anexos?.length > 0) comAnexos++;
      if (pub) {
        // Campos reais salvos no Firestore
        const jogosFields = [
          { campo: 'quiz',              def: 1.0 },
          { campo: 'bug_codigos',       def: 1.0 },
          { campo: 'comp_perguntas',    def: 1.0 },
          { campo: 'ordena_desafios',   def: 1.0 },
          { campo: 'complete_desafios', def: 1.0 },
          { campo: 'conecta_desafios',  def: 2.0 },
          { campo: 'box_desafios',      def: 2.0 },
          { campo: 'binario_desafios',  def: 1.0 },
        ];
        jogosFields.forEach(({ campo, def }) => {
          (c[campo] || []).forEach(item => { ptsTotalDisp += parseFloat(item.pontos) || def; });
        });
      }

      if (!tipos[tipo]) tipos[tipo] = { total: 0, publicados: 0 };
      tipos[tipo].total++;
      if (pub) tipos[tipo].publicados++;

      let temJogo = false;
      JOGOS.forEach(j => {
        const arr = c[j.key];
        if (Array.isArray(arr) && arr.length > 0) { jogoCount[j.key]++; temJogo = true; }
      });
      if (!temJogo) semJogo++;
    });

    const semTrilha   = total - comTrilha;
    const pctPub      = total ? Math.round((publicados / total) * 100) : 0;
    const sortedTipos = Object.entries(tipos).sort((a, b) => b[1].total - a[1].total);
    const cores       = ['#3b82f6','#22c55e','#f97316','#a855f7','#14b8a6','#ef4444','#eab308','#ec4899','#6366f1','#84cc16'];

    function secTitle(t) {
      return `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#aaa;margin:20px 0 10px;">${t}</div>`;
    }
    function statCard(icon, label, val, cor = '#23314d', sub = '') {
      return `<div style="background:#f8f9fe;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px;">
        <div style="font-size:22px;line-height:1;">${icon}</div>
        <div style="flex:1;">
          <div style="font-size:11px;color:#999;font-weight:600;">${label}</div>
          ${sub ? `<div style="font-size:10px;color:#bbb;">${sub}</div>` : ''}
        </div>
        <div style="font-size:20px;font-weight:900;color:${cor};">${val}</div>
      </div>`;
    }

    const body = document.getElementById('estat-body');
    if (!body) return;
    body.innerHTML = `

      ${secTitle('Visão Geral')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${statCard('🃏', 'Total de cards', total)}
        ${statCard('🚀', 'Publicados', publicados + ' <span style="font-size:12px;font-weight:600;color:#27ae60;">(' + pctPub + '%)</span>', '#27ae60')}
        ${statCard('📝', 'Rascunhos', total - publicados, '#e67e22')}
        ${statCard('⭐', 'Pontuação total disponível', (ptsTotalDisp % 1 === 0 ? ptsTotalDisp : ptsTotalDisp.toFixed(1)).toLocaleString('pt-BR') + ' pts', '#b7950b', 'soma de todos os jogos publicados')}
      </div>

      ${secTitle('Cobertura de Publicação')}
      <div style="background:#f8f9fe;border-radius:10px;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:12px;font-weight:700;color:#27ae60;">Publicados ${publicados}</span>
          <span style="font-size:12px;font-weight:700;color:#e67e22;">Rascunhos ${total - publicados}</span>
        </div>
        <div style="height:10px;background:#f0e8d8;border-radius:5px;overflow:hidden;">
          <div style="height:100%;width:${pctPub}%;background:linear-gradient(90deg,#27ae60,#2ecc71);border-radius:5px;"></div>
        </div>
        <div style="text-align:center;font-size:11px;color:#aaa;margin-top:6px;">${pctPub}% publicado</div>
      </div>

      ${secTitle('Qualidade do Conteúdo')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${statCard('🖼️', 'Sem imagem de capa', semImagem, semImagem > 0 ? '#e74c3c' : '#27ae60')}
        ${statCard('🎮', 'Sem nenhum jogo', semJogo, semJogo > 0 ? '#e74c3c' : '#27ae60')}
        ${statCard('📎', 'Com anexos', comAnexos, '#2980b9')}
        ${statCard('🗺️', 'Sem trilha vinculada', semTrilha, semTrilha > 0 ? '#e67e22' : '#27ae60', 'não aparecem para alunos')}
      </div>

      ${secTitle('Jogos Cadastrados')}
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${JOGOS.map((j, i) => {
          const n   = jogoCount[j.key];
          const pct = total ? Math.round((n / total) * 100) : 0;
          const cor = cores[i % cores.length];
          return `<div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:12px;font-weight:600;color:#555;min-width:150px;">${j.label}</span>
            <div style="flex:1;height:8px;background:#eee;border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${cor};border-radius:4px;"></div>
            </div>
            <span style="font-size:12px;font-weight:700;color:${cor};min-width:28px;text-align:right;">${n}</span>
          </div>`;
        }).join('')}
      </div>

      ${secTitle('Cards por Tipo')}
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${sortedTipos.map(([tipo, dados], i) => {
          const cor = cores[i % cores.length];
          const pct = Math.round((dados.total / total) * 100);
          return `<div style="background:#f8f9fe;border-radius:10px;padding:11px 14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="width:9px;height:9px;border-radius:50%;background:${cor};flex-shrink:0;"></div>
                <span style="font-size:13px;font-weight:700;color:#1a1a1a;">${tipo}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:11px;color:#27ae60;background:#e8f8f0;border:1px solid #a9e4c3;border-radius:4px;padding:1px 6px;font-weight:700;">${dados.publicados} pub.</span>
                <span style="font-size:11px;color:#888;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:1px 6px;font-weight:700;">${dados.total - dados.publicados} rasc.</span>
                <span style="font-size:14px;font-weight:900;color:${cor};min-width:24px;text-align:right;">${dados.total}</span>
              </div>
            </div>
            <div style="height:5px;background:#e0e0e0;border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${cor};border-radius:3px;"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  } catch(err) {
    const body = document.getElementById('estat-body');
    if (body) body.innerHTML = `<div style="color:#e74c3c;font-size:13px;">Erro: ${err.message}</div>`;
  }
};
