// admin-auth.js — Autenticação e gestão de usuários do admin

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup,
  sendPasswordResetEmail
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

    // Gestor: vê Usuários + Escolas | Conteudista: vê apenas Escolas
    if (perfilAtual === 'gestor' || perfilAtual === 'conteudista') {
      const tabEscolas = document.getElementById('tab-escolas');
      if (tabEscolas) tabEscolas.style.display = '';
    }
    if (perfilAtual === 'gestor') {
      const tabUsers = document.getElementById('tab-usuarios');
      if (tabUsers) tabUsers.style.display = '';
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
let todosUsuarios = [];
let perfilFiltroAtivo = 'gestor';

window.carregarUsuarios = async function() {
  const listEl = document.getElementById('usuarios-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="list-loading">Carregando usuários...</div>';

  try {
    const snap = await getDocs(collection(db, 'usuarios'));
    todosUsuarios = [];
    snap.forEach(d => todosUsuarios.push({ id: d.id, ...d.data() }));
    todosUsuarios.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    renderUsuariosFiltrados(perfilFiltroAtivo);
  } catch(err) {
    listEl.innerHTML = `<div class="list-loading" style="color:#e74c3c;">Erro: ${err.message}</div>`;
  }
};

window.filtrarUsuarios = function(perfil) {
  perfilFiltroAtivo = perfil;
  // Atualiza botões de filtro
  document.querySelectorAll('.ufiltro').forEach(b => {
    b.classList.toggle('ativo', b.dataset.perfil === perfil);
  });
  // Mostra "+ Novo" apenas para perfis admin
  const btnNovo = document.getElementById('usuarios-btn-novo');
  if (btnNovo) btnNovo.style.display = (perfil === 'gestor' || perfil === 'conteudista') ? '' : 'none';
  // Limpa seleção e conteúdo
  document.querySelectorAll('#usuarios-list .card-item').forEach(i => i.classList.remove('active'));
  document.getElementById('usuarios-content').innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">👤</div>
      <p>Selecione um usuário<br>ou cadastre um novo.</p>
    </div>`;
  renderUsuariosFiltrados(perfil);
};

function renderUsuariosFiltrados(perfil) {
  const listEl = document.getElementById('usuarios-list');
  if (!listEl) return;
  const lista = todosUsuarios.filter(u => u.perfil === perfil);
  listEl.innerHTML = '';

  if (lista.length === 0) {
    const perfilLabels = { gestor: 'gestor', conteudista: 'conteudista', professor: 'professor', aluno: 'aluno' };
    listEl.innerHTML = `<div class="list-loading">Nenhum ${perfilLabels[perfil] || perfil} cadastrado.</div>`;
    return;
  }

  lista.forEach(u => {
    const item = document.createElement('div');
    item.className  = 'card-item';
    item.dataset.id = u.id;
    const sub = u.perfil === 'aluno'
      ? (u.serie ? u.serie + (u.turma ? ' — ' + u.turma : '') : (u.email || ''))
      : (u.email || '');
    item.innerHTML = `
      <div class="card-item-num">${u.perfil?.toUpperCase() || '—'}</div>
      <div class="card-item-nome">${u.nome || 'Sem nome'}</div>
      <div class="card-item-nivel">${sub}</div>
      <span class="card-item-status status-publicado">Ativo</span>
    `;
    item.onclick = () => abrirUsuario(u);
    listEl.appendChild(item);
  });
}

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

  const isAdmin = !u || u.perfil === 'gestor' || u.perfil === 'conteudista';
  const perfilLabels = { gestor: 'Gestor', conteudista: 'Conteudista', professor: 'Professor', aluno: 'Aluno' };

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
          <label>E-mail</label>
          <input type="email" id="u-email" value="${u?.email || ''}" placeholder="email@exemplo.com"
            ${u ? 'readonly style="opacity:0.5"' : ''}>
        </div>
        ${!u ? `
        <div class="form-group">
          <label>Senha *</label>
          <input type="password" id="u-senha" placeholder="Mínimo 6 caracteres">
        </div>` : ''}
        <div class="form-group">
          <label>Perfil</label>
          ${isAdmin ? `
          <select id="u-perfil">
            <option value="gestor"      ${u?.perfil === 'gestor'      ? 'selected' : ''}>Gestor</option>
            <option value="conteudista" ${u?.perfil === 'conteudista' ? 'selected' : ''}>Conteudista</option>
          </select>` : `
          <input type="text" value="${perfilLabels[u?.perfil] || u?.perfil || ''}" readonly style="opacity:0.5;">
          <input type="hidden" id="u-perfil" value="${u?.perfil || ''}">
          `}
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
      // Para professor/aluno só atualiza nome; para gestor/conteudista atualiza nome + perfil
      const adminPerfis = ['gestor', 'conteudista'];
      const dados = adminPerfis.includes(perfil) ? { nome, perfil } : { nome };
      await setDoc(doc(db, 'usuarios', uid), dados, { merge: true });
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
    if (err.code === 'auth/email-already-in-use') {
      // Conta existe no Auth mas não no Firestore — mostrar opção de restaurar
      mostrarRestaurarUsuario(email, nome, perfil);
    } else {
      const msgs = { 'auth/weak-password': 'Senha muito fraca.' };
      showToast('❌ ' + (msgs[err.code] || err.message), 'error');
    }
  }
};

function mostrarRestaurarUsuario(email, nome, perfil) {
  const content = document.getElementById('usuarios-content');
  if (!content) return;

  // Mantém o form e adiciona aviso de restauração
  const avisoExistente = document.getElementById('restaurar-aviso');
  if (avisoExistente) avisoExistente.remove();

  const aviso = document.createElement('div');
  aviso.id = 'restaurar-aviso';
  aviso.style.cssText = 'background:#fff8ec;border:2px solid #f39c12;border-radius:10px;padding:16px;margin-top:16px;';
  aviso.innerHTML = `
    <div style="font-weight:800;color:#7a5200;margin-bottom:8px;">⚠️ E-mail já existe no Firebase Auth</div>
    <p style="font-size:13px;color:#555;margin-bottom:12px;">
      A conta <strong>${email}</strong> existe mas foi removida do sistema admin.<br>
      Para restaurar, informe a senha atual desta conta:
    </p>
    <input type="password" id="restaurar-senha" placeholder="Senha atual da conta"
      style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid #ccc;font-size:13px;margin-bottom:10px;">
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button onclick="restaurarUsuario('${email}','${nome}','${perfil}')"
        style="background:#e67e22;color:#fff;border:none;border-radius:6px;padding:8px 18px;cursor:pointer;font-weight:700;font-size:13px;">
        🔄 Restaurar Acesso
      </button>
      <button onclick="enviarRedefinicaoSenha('${email}')"
        style="background:#3498db;color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-size:13px;">
        📧 Enviar redefinição de senha
      </button>
      <button onclick="document.getElementById('restaurar-aviso').remove()"
        style="background:#eee;color:#333;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-size:13px;">
        Cancelar
      </button>
    </div>
    <p id="restaurar-reset-msg" style="font-size:12px;color:#555;margin-top:10px;display:none;"></p>
  `;
  content.appendChild(aviso);
  document.getElementById('restaurar-senha')?.focus();
}

window.enviarRedefinicaoSenha = async function(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    const msg = document.getElementById('restaurar-reset-msg');
    if (msg) {
      msg.style.display = '';
      msg.innerHTML = `✅ E-mail de redefinição enviado para <strong>${email}</strong>.<br>
        Após o usuário redefinir a senha, informe a nova senha no campo acima e clique em Restaurar Acesso.`;
    }
  } catch(err) {
    showToast('❌ Erro ao enviar e-mail: ' + err.message, 'error');
  }
};

window.restaurarUsuario = async function(email, nome, perfil) {
  const senha = document.getElementById('restaurar-senha')?.value;
  if (!senha) { showToast('⚠️ Informe a senha.', 'error'); return; }

  try {
    // Usa segunda instância do Firebase para não afetar a sessão do admin
    const { initializeApp: initApp2, getApps: getApps2 } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js");
    const { getAuth: getAuth2, signInWithEmailAndPassword: signIn2, signOut: signOut2 } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js");

    const cfg2  = { apiKey:"AIzaSyAndgQiwxpe6wyCF8aa5NqqdMuwLJfMIMM", authDomain:"makerlab3d-4e455.firebaseapp.com", projectId:"makerlab3d-4e455" };
    const app2  = getApps2().find(a => a.name === 'restaurar-temp') || initApp2(cfg2, 'restaurar-temp');
    const auth2 = getAuth2(app2);
    const cred  = await signIn2(auth2, email, senha);
    const uid   = cred.user.uid;
    await signOut2(auth2);

    // Recria o documento no Firestore
    await setDoc(doc(db, 'usuarios', uid), {
      nome, email, perfil,
      criado_em: new Date().toISOString()
    });

    document.getElementById('restaurar-aviso')?.remove();
    showToast('✅ Usuário restaurado com sucesso!', 'success');
    await carregarUsuarios();
  } catch(err) {
    const msgs = {
      'auth/wrong-password':  'Senha incorreta.',
      'auth/invalid-credential': 'Senha incorreta.',
      'auth/too-many-requests': 'Muitas tentativas. Tente mais tarde.',
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
