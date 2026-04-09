// admin-auth.js — Autenticação e gestão de usuários do admin

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore, collection, doc,
  getDocs, setDoc, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAndgQiwxpe6wyCF8aa5NqqdMuwLJfMIMM",
  authDomain: "makerlab3d-4e455.firebaseapp.com",
  projectId: "makerlab3d-4e455",
  storageBucket: "makerlab3d-4e455.firebasestorage.app",
  messagingSenderId: "495457985822",
  appId: "1:495457985822:web:05efcebeed970ecb82150f"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let perfilAtual = null;

// ---- VERIFICAÇÃO DE ACESSO ----
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'usuarios', user.uid));
    if (!snap.exists()) {
      await signOut(auth);
      window.location.href = 'login.html';
      return;
    }

    perfilAtual = snap.data().perfil;

    // Mostra nome do usuário no header
    const nomeEl = document.getElementById('header-user');
    if (nomeEl) {
      nomeEl.textContent = snap.data().nome || user.email;
    }

    // Gestor vê abas Usuários e Escolas, conteudista não
    if (perfilAtual === 'gestor') {
      const tabUsers   = document.getElementById('tab-usuarios');
      const tabEscolas = document.getElementById('tab-escolas');
      if (tabUsers)   tabUsers.style.display   = '';
      if (tabEscolas) tabEscolas.style.display = '';
    }

  } catch(err) {
    console.error(err);
  }
});

// ---- LOGOUT ----
window.fazerLogout = async function() {
  await signOut(auth);
  window.location.href = 'login.html';
};

// ---- TAB USUÁRIOS ----
window.carregarUsuarios = async function() {
  const listEl = document.getElementById('usuarios-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="list-loading">Carregando usuários...</div>';

  try {
    const snap = await getDocs(collection(db, 'usuarios'));
    listEl.innerHTML = '';

    if (snap.empty) {
      listEl.innerHTML = '<div class="list-loading">Nenhum usuário cadastrado.</div>';
      return;
    }

    const docs = [];
    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    const grupos = { gestor: [], conteudista: [] };
    docs.forEach(u => {
      if (grupos[u.perfil]) grupos[u.perfil].push(u);
      else grupos['conteudista'].push(u);
    });

    const labels = { gestor: 'Gestores', conteudista: 'Conteudistas' };

    Object.entries(grupos).forEach(([perfil, users]) => {
      if (users.length === 0) return;
      const sep = document.createElement('div');
      sep.className   = 'list-group-label';
      sep.textContent = labels[perfil] || perfil;
      listEl.appendChild(sep);

      users.forEach(u => {
        const item = document.createElement('div');
        item.className  = 'card-item';
        item.dataset.id = u.id;
        item.innerHTML  = `
          <div class="card-item-num">${u.perfil?.toUpperCase() || '—'}</div>
          <div class="card-item-nome">${u.nome || 'Sem nome'}</div>
          <div class="card-item-nivel">${u.email || ''}</div>
          <span class="card-item-status status-publicado">Ativo</span>
        `;
        item.onclick = () => abrirUsuario(u);
        listEl.appendChild(item);
      });
    });

  } catch(err) {
    listEl.innerHTML = `<div class="list-loading" style="color:#e74c3c;">Erro: ${err.message}</div>`;
  }
};

function abrirUsuario(u) {
  document.querySelectorAll('#usuarios-list .card-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`#usuarios-list [data-id="${u.id}"]`)?.classList.add('active');
  renderUsuarioForm(u);
}

window.novoUsuario = function() {
  document.querySelectorAll('#usuarios-list .card-item').forEach(i => i.classList.remove('active'));
  renderUsuarioForm(null);
};

function renderUsuarioForm(u) {
  const content = document.getElementById('usuarios-content');
  if (!content) return;

  content.innerHTML = `
    <div class="form-header">
      <div class="form-title">${u ? 'Editar Usuário' : 'Novo Usuário Admin'}</div>
      <div class="form-actions">
        ${u ? `<button class="btn-deletar" onclick="deletarUsuario('${u.id}')">🗑 Remover</button>` : ''}
        <button class="btn-publicar" onclick="salvarUsuario(${u ? `'${u.id}'` : 'null'})">💾 Salvar</button>
      </div>
    </div>

    <div class="form-section">
      <div class="section-title">Dados do Usuário</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Nome *</label>
          <input type="text" id="u-nome" value="${u?.nome || ''}" placeholder="Nome completo">
        </div>
        <div class="form-group">
          <label>E-mail *</label>
          <input type="email" id="u-email" value="${u?.email || ''}" placeholder="email@exemplo.com"
            ${u ? 'readonly style="opacity:0.5"' : ''}>
        </div>
        ${!u ? `
        <div class="form-group">
          <label>Senha *</label>
          <input type="password" id="u-senha" placeholder="Mínimo 6 caracteres">
        </div>` : ''}
        <div class="form-group">
          <label>Perfil *</label>
          <select id="u-perfil">
            <option value="gestor"      ${u?.perfil === 'gestor'      ? 'selected' : ''}>Gestor</option>
            <option value="conteudista" ${u?.perfil === 'conteudista' ? 'selected' : ''}>Conteudista</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

window.salvarUsuario = async function(uid) {
  const nome   = document.getElementById('u-nome')?.value?.trim();
  const email  = document.getElementById('u-email')?.value?.trim();
  const perfil = document.getElementById('u-perfil')?.value;
  const senha  = document.getElementById('u-senha')?.value;

  if (!nome || !email) { showToast('⚠️ Preencha nome e e-mail.', 'error'); return; }

  try {
    if (uid) {
      // Atualiza dados existentes
      await setDoc(doc(db, 'usuarios', uid), { nome, perfil }, { merge: true });
      showToast('✅ Usuário atualizado!', 'success');
    } else {
      // Cria novo usuário no Firebase Auth
      if (!senha || senha.length < 6) { showToast('⚠️ Senha com mínimo 6 caracteres.', 'error'); return; }
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      await setDoc(doc(db, 'usuarios', cred.user.uid), {
        nome, email, perfil,
        criado_em: new Date().toISOString()
      });
      showToast('✅ Usuário criado!', 'success');
    }
    await carregarUsuarios();
  } catch(err) {
    const msgs = {
      'auth/email-already-in-use': 'E-mail já cadastrado.',
      'auth/weak-password': 'Senha muito fraca.',
    };
    showToast('❌ ' + (msgs[err.code] || err.message), 'error');
  }
};

window.deletarUsuario = async function(uid) {
  if (!confirm('Remover este usuário do sistema?')) return;
  try {
    await deleteDoc(doc(db, 'usuarios', uid));
    showToast('🗑 Usuário removido.', '');
    document.getElementById('usuarios-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👤</div>
        <p>Usuário removido.</p>
      </div>`;
    await carregarUsuarios();
  } catch(err) {
    showToast('❌ Erro: ' + err.message, 'error');
  }
};

function showToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}
