// admin.js — MakerLab 3D — Painel CRUD

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
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
let tagsState  = { links_desafios: [], links_componentes: [], links_conexoes: [] };
let todosCards = {};
// Mapa dos 3 grupos de cards vinculados
const VMAP = [
  { tipo: 'Desafio',             key: 'links_desafios',    sel: 'sel-desafios',      list: 'list-desafios' },
  { tipo: 'Componente',          key: 'links_componentes', sel: 'sel-componentes-v', list: 'list-componentes-v' },
  { tipo: 'Conexão com o Mundo', key: 'links_conexoes',    sel: 'sel-conexoes-v',    list: 'list-conexoes-v' },
];

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

    // Agrupa por tipo
    const grupos = { 'Desafio': [], 'Componente': [], 'Conexão com o Mundo': [] };
    docs.forEach(docSnap => {
      const d    = docSnap.data();
      const tipo = d.tipo || 'Desafio';
      if (!grupos[tipo]) grupos[tipo] = [];
      grupos[tipo].push({ id: docSnap.id, data: d });
    });

    const ordem = ['Desafio', 'Componente', 'Conexão com o Mundo'];
    let temConteudo = false;

    ordem.forEach(grupo => {
      const cards = grupos[grupo];
      if (!cards || cards.length === 0) return;
      temConteudo = true;

      const sep = document.createElement('div');
      sep.className   = 'list-group-label';
      sep.textContent = grupo === 'Conexão com o Mundo' ? 'Conexões com o Mundo' : grupo + 's';
      listEl.appendChild(sep);

      cards.forEach(({ id, data: d }) => {
        const item     = document.createElement('div');
        item.className  = 'card-item';
        item.dataset.id = id;
        const tipoLabel = (d.tipo || 'Desafio').toUpperCase();
        const numPad    = String(d.numero || 0).padStart(2, '0');
        item.innerHTML  = `
          <div class="card-item-num">${tipoLabel} ${numPad}</div>
          <div class="card-item-nome">${d.nome || 'Sem nome'}</div>
          <div class="card-item-nivel">${d.nivel || '—'}</div>
          <span class="card-item-status ${d.publicado ? 'status-publicado' : 'status-rascunho'}">
            ${d.publicado ? 'Publicado' : 'Rascunho'}
          </span>
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
  window.compState = d.comp_perguntas ? JSON.parse(JSON.stringify(d.comp_perguntas)) : [];
  window.glossarioState = d.glossario ? JSON.parse(JSON.stringify(d.glossario)) : [];
  tagsState.links_desafios   = d.links_desafios   ? [...d.links_desafios]   : [];
  tagsState.links_componentes = d.links_componentes ? [...d.links_componentes] : [];
  tagsState.links_conexoes   = d.links_conexoes   ? [...d.links_conexoes]   : [];
  const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', 'card.html');
  const cardUrl = id ? `${baseUrl}?id=${id}` : '—';

  document.getElementById('main-content').innerHTML = `
    <div class="form-header">
      <div class="form-title">${id ? 'Editar Card' : 'Novo Card'}</div>
      <div class="form-actions">
        ${id ? `<button class="btn-deletar" onclick="deletarCard('${id}')">🗑 Deletar</button>` : ''}
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
            <option value=""                     ${!d.tipo                              ? 'selected':''}>Selecione...</option>
            <option value="Desafio"              ${(d.tipo||'') === 'Desafio'           ? 'selected':''}>Desafio</option>
            <option value="Componente"           ${(d.tipo||'') === 'Componente'        ? 'selected':''}>Componente</option>
            <option value="Conexão com o Mundo"  ${(d.tipo||'') === 'Conexão com o Mundo' ? 'selected':''}>Conexão com o Mundo</option>
          </select>
        </div>
        <div class="form-group">
          <label>Tema do Card</label>
          <input type="text" id="f-tema" value="${d.tema || ''}" placeholder="Ex: Eletrônica, História, Programação...">
        </div>

      </div>
    </div>

    <!-- Imagem -->
    <div class="form-section">
      <div class="section-title">Imagem do Desafio</div>
      <div class="upload-area ${imagemURL ? 'tem-imagem' : ''}" id="upload-area">
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

        <div class="vg">
          <div class="vg-header">
            <span class="vg-title">🎯 Desafios</span>
            <div class="vg-add-row">
              <select class="vg-select" id="sel-desafios"><option value="">Selecione um desafio...</option></select>
              <button class="vg-btn-add" onclick="addVinculado('links_desafios','sel-desafios','list-desafios')">Adicionar</button>
            </div>
          </div>
          <div class="vg-list" id="list-desafios"></div>
        </div>

        <div class="vg">
          <div class="vg-header">
            <span class="vg-title">🔩 Componentes</span>
            <div class="vg-add-row">
              <select class="vg-select" id="sel-componentes-v"><option value="">Selecione um componente...</option></select>
              <button class="vg-btn-add" onclick="addVinculado('links_componentes','sel-componentes-v','list-componentes-v')">Adicionar</button>
            </div>
          </div>
          <div class="vg-list" id="list-componentes-v"></div>
        </div>

        <div class="vg">
          <div class="vg-header">
            <span class="vg-title">🌐 Conexões com o Mundo</span>
            <div class="vg-add-row">
              <select class="vg-select" id="sel-conexoes-v"><option value="">Selecione uma conexão...</option></select>
              <button class="vg-btn-add" onclick="addVinculado('links_conexoes','sel-conexoes-v','list-conexoes-v')">Adicionar</button>
            </div>
          </div>
          <div class="vg-list" id="list-conexoes-v"></div>
        </div>

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
        <label>Imagem do Circuito</label>
        <div class="upload-area ${d.atividade_imagem_url ? 'tem-imagem' : ''}" id="upload-area-ativ">
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
  renderQuizLista();
  recalcularPontos();
  renderBugLista();
  atualizarBtnQuiz();
  atualizarBtnBug();
  renderCompLista();
  atualizarBtnComp();
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
    const snap = await getDocs(collection(db, 'cards'));
    todosCards = {};
    const porTipo = { 'Desafio': [], 'Componente': [], 'Conexão com o Mundo': [] };

    const docsV = [];
    snap.forEach(docSnap => docsV.push(docSnap));
    docsV.sort((a, b) => (a.data().numero || 0) - (b.data().numero || 0));

    docsV.forEach(docSnap => {
      const d = docSnap.data();
      todosCards[docSnap.id] = { nome: d.nome || docSnap.id, numero: d.numero || 0, tipo: d.tipo || 'Desafio' };
      if (docSnap.id === cardAtivo) return;
      const tipo = d.tipo || 'Desafio';
      if (porTipo[tipo]) porTipo[tipo].push({ id: docSnap.id, data: d });
    });

    VMAP.forEach(({ tipo, sel }) => {
      const el = document.getElementById(sel);
      if (!el) return;
      while (el.options.length > 1) el.remove(1);
      (porTipo[tipo] || []).forEach(({ id, data: d }) => {
        const opt = document.createElement('option');
        opt.value       = id;
        opt.textContent = `${String(d.numero||0).padStart(2,'0')} — ${d.nome || id}`;
        el.appendChild(opt);
      });
    });

    VMAP.forEach(({ key, sel, list }) => renderVinculadosList(key, list, sel));

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
    pontos:           (window.quizState || []).reduce((sum, q) => sum + (parseFloat(q.pontos) || 1.0), 0),
    kit:              document.getElementById('f-kit')?.value?.trim() || '',
    objetivo:         document.getElementById('f-objetivo')?.value?.trim() || '',
    tutorial_url:     document.getElementById('f-tutorial')?.value?.trim() || '',
    imagem_url:       imagemURL,
    links_desafios:   tagsState.links_desafios,
    links_componentes: tagsState.links_componentes,
    links_conexoes:   tagsState.links_conexoes,
    curiosidades:     document.getElementById('f-curiosidades')?.value?.trim() || '',
    atividade_descricao:  document.getElementById('f-ativ-descricao')?.value?.trim() || '',
    atividade_imagem_url: document.getElementById('f-ativ-imagem-url')?.value?.trim() || atividadeImagemURL,
    atividade_codigo:     document.getElementById('f-ativ-codigo')?.value?.trim() || '',
    glossario:            window.glossarioState.filter(g => g.codigo || g.descricao),
    avaliacao:        document.getElementById('f-avaliacao')?.value?.trim() || '',
    desafio_extra:    document.getElementById('f-desafio-extra')?.value?.trim() || '',
    quiz:             window.quizState || [],
    bug_codigos:      window.bugState || [],
    bug_tentativas:   parseInt(document.getElementById('f-bug-tentativas')?.value) || 3,
    comp_perguntas:   window.compState || [],
    comp_tentativas:  parseInt(document.getElementById('f-comp-tentativas')?.value) || 3,
    tentativas:       parseInt(document.getElementById('f-tentativas')?.value) || 3,
    video_url:        document.getElementById('f-video-url')?.value?.trim() || '',
    publicado:        publicar,
    atualizado_em:    new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'cards', id), data);
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
  inputCodigo.value = codigo || '';
  inputCodigo.placeholder = 'ex: pinMode(13, OUTPUT)';
  inputCodigo.oninput = function() { updateGlossario(i, 'codigo', this.value); };

  const inputDescricao = document.createElement('input');
  inputDescricao.type = 'text';
  inputDescricao.className = 'glossario-input';
  inputDescricao.value = descricao || '';
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

// ---- DELETAR ----
window.deletarCard = async function (id) {
  if (!confirm(`Deletar o card "${id}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await deleteDoc(doc(db, 'cards', id));
    showToast('🗑 Card deletado', '');
    cardAtivo = null;
    document.getElementById('main-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🃏</div>
        <p>Card deletado.<br>Selecione outro ou crie um novo.</p>
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

listarCards();

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
};

window.removerPergunta = function(qi) {
  window.quizState.splice(qi, 1);
  renderQuizLista();
  recalcularPontos();
  atualizarBtnQuiz();
  atualizarBtnBug();
  renderCompLista();
  atualizarBtnComp();
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
  const totalComp = (window.compState  || []).reduce((sum, c) => sum + (parseFloat(c.pontos) || 1.0), 0);
  const total     = totalQuiz + totalBug + totalComp;
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
  { id: 'matriz-led',         nome: 'Matriz de LED 8x8',   arquivo: 'matriz-led.png' },
  { id: 'sensor-som',         nome: 'Sensor de Som',        arquivo: 'sensor-som.png' },
  { id: 'sensor-ultrassonico',nome: 'Sensor Ultrassônico',  arquivo: 'sensor-ultrassonico.png' },
  { id: 'led-rgb',            nome: 'LED RGB',              arquivo: 'led-rgb.png' },
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
