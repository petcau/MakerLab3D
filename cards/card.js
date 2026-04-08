// card.js — MakerLab 3D

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAndgQiwxpe6wyCF8aa5NqqdMuwLJfMIMM",
  authDomain: "makerlab3d-4e455.firebaseapp.com",
  projectId: "makerlab3d-4e455",
  storageBucket: "makerlab3d-4e455.firebasestorage.app",
  messagingSenderId: "495457985822",
  appId: "1:495457985822:web:05efcebeed970ecb82150f"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const params = new URLSearchParams(window.location.search);
const cardId = params.get('id') || 'pisca-pisca';

// Mostra um elemento
function show(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = '';
}

// Chip simples
function makeChip(text, cls) {
  const chip = document.createElement('span');
  chip.className = cls;
  chip.textContent = text;
  return chip;
}

// Converte texto com * em lista e preserva quebras de linha
function renderTextoLivre(texto, containerId) {
  const container = document.getElementById(containerId);
  if (!container || !texto) return;

  const linhas = texto.split('\n');
  let html = '';
  let emLista = false;

  linhas.forEach(linha => {
    const trimmed = linha.trim();
    if (trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      if (!emLista) { html += '<ul class="texto-lista">'; emLista = true; }
      html += `<li>${trimmed.slice(2)}</li>`;
    } else {
      if (emLista) { html += '</ul>'; emLista = false; }
      if (trimmed) html += `<p>${trimmed}</p>`;
    }
  });

  if (emLista) html += '</ul>';
  container.innerHTML = html;
}

async function carregarCard() {
  try {
    const docSnap = await getDoc(doc(db, "cards", cardId));

    if (!docSnap.exists()) {
      document.getElementById('loading').style.display = 'none';
      const err = document.getElementById('error');
      err.style.display = 'flex';
      err.innerHTML = `<p>❌ Card não encontrado.<br><small>ID: ${cardId}</small></p>`;
      return;
    }

    const d      = docSnap.data();
    const numStr = 'DESAFIO ' + String(d.numero || 1).padStart(2, '0');

    // ---- HERO ----
    document.getElementById('nivel-badge').textContent  = d.nivel   || '—';
    document.getElementById('desafio-num').textContent  = numStr;
    document.getElementById('nome-desafio').textContent = d.nome    || '—';
    document.getElementById('objetivo').textContent     = d.objetivo || '—';
    document.title = 'MakerLab 3D — ' + (d.nome || 'Desafio');

    // Tema
    if (d.tema) {
      document.getElementById('hero-tema').textContent = d.tema;
      show('hero-tema-wrap');
    }

    // Imagem
    if (d.imagem_url) {
      const wrap = document.getElementById('hero-imagem-wrap');
      wrap.classList.add('tem-imagem');
      wrap.innerHTML = `<img src="${d.imagem_url}" alt="${d.nome || 'Desafio'}" class="hero-imagem">`;
    }

    // Stats — só aparecem se tiverem valor
    if (d.duracao) { document.getElementById('duracao').textContent = d.duracao; show('stat-duracao'); }
    if (d.pontos)  { document.getElementById('pontos').textContent  = d.pontos + ' pts'; show('stat-pontos'); }
    if (d.kit)     { document.getElementById('kit').textContent     = d.kit; show('stat-kit'); }

    // ---- DEFINIÇÃO ----
    if (d.definicao_titulo || d.definicao_texto) {
      if (d.definicao_titulo) document.getElementById('def-titulo').textContent = d.definicao_titulo;
      if (d.definicao_texto)  renderTextoLivre(d.definicao_texto, 'def-texto');
      show('sec-definicao');
    }

    // ---- CARDS VINCULADOS ----
    const grupos = [
      { key: 'links_desafios',    label: '🎯 Desafios',             cor: 'vinc-azul' },
      { key: 'links_componentes', label: '🔩 Componentes',          cor: 'vinc-amarelo' },
      { key: 'links_conexoes',    label: '🌐 Conexões com o Mundo', cor: 'vinc-verde' },
    ];

    const grid = document.getElementById('linked-grid');
    let temVinculados = false;

    // Coleta todos os IDs para buscar no Firebase
    const todosIds = [];
    grupos.forEach(({ key }) => (d[key] || []).forEach(id => { if (!todosIds.includes(id)) todosIds.push(id); }));

    // Busca dados de cada card vinculado
    const dadosVinculados = {};
    await Promise.all(todosIds.map(async id => {
      try {
        const snap = await getDoc(doc(db, 'cards', id));
        if (snap.exists()) dadosVinculados[id] = snap.data();
      } catch(e) { /* ignora erro individual */ }
    }));

    grupos.forEach(({ key, label, cor }) => {
      const ids = d[key] || [];
      if (ids.length === 0) return;
      temVinculados = true;

      const col = document.createElement('div');
      col.className = 'linked-col';
      col.innerHTML = `<div class="linked-col-title">${label}</div>`;

      const cardsWrap = document.createElement('div');
      cardsWrap.className = 'mini-cards-grid';

      ids.forEach(id => {
        const info  = dadosVinculados[id];
        const nome  = info ? (info.nome || id) : id;
        const tipo  = info ? (info.tipo || '') : '';
        const num   = info ? String(info.numero || '').padStart(2, '0') : '';
        const tema  = info ? (info.tema || '') : '';

        const duracao = info && info.duracao ? String(info.duracao) : '';
        const pontos  = info && info.pontos != null && info.pontos !== '' ? String(info.pontos) : '';
        const nivel   = info && info.nivel ? info.nivel.replace('Nível 1 — ', '').replace('Nível 2 — ', '').replace('Nível 3 — ', '') : '';
        const card    = document.createElement('a');
        card.className = `mini-card ${cor}`;
        card.href      = `card.html?id=${id}`;
        card.target    = '_blank';
        card.innerHTML = `
          <div class="mini-card-top">
            <span class="mini-card-num">${num || '—'}</span>
            ${nivel ? `<span class="mini-card-nivel">${nivel}</span>` : ''}
          </div>
          <div class="mini-card-nome">${nome}</div>
          ${tema ? `<div class="mini-card-tema">${tema}</div>` : ''}
          <div class="mini-card-footer">
            ${duracao ? `<span class="mini-stat">⏱ ${duracao}</span>` : ''}
            ${pontos  ? `<span class="mini-stat">⭐ ${pontos} pts</span>` : ''}
            <span class="mini-card-arrow">→</span>
          </div>
        `;
        cardsWrap.appendChild(card);
      });

      col.appendChild(cardsWrap);
      grid.appendChild(col);
    });

    if (temVinculados) show('sec-vinculados');

    // ---- CURIOSIDADES ----
    if (d.curiosidades) {
      renderTextoLivre(d.curiosidades, 'curiosidades');
      show('sec-curiosidades');
    }

    // ---- ATIVIDADE RÁPIDA ----
    if (d.atividade_descricao || d.atividade_imagem_url || d.atividade_codigo) {
      if (d.atividade_descricao) renderTextoLivre(d.atividade_descricao, 'ativ-descricao');
      if (d.atividade_imagem_url) {
        document.getElementById('ativ-imagem').src = d.atividade_imagem_url;
        show('ativ-imagem-wrap');
      }
      if (d.atividade_codigo) {
        document.getElementById('ativ-codigo').textContent = d.atividade_codigo;
        show('ativ-codigo-wrap');
      }
      if ((d.glossario || []).length > 0) {
        const tbody = document.getElementById('ativ-glossario-tbody');
        d.glossario.forEach(g => {
          if (!g.codigo && !g.descricao) return;
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${g.codigo || ''}</td><td>${g.descricao || ''}</td>`;
          tbody.appendChild(tr);
        });
        show('ativ-glossario-wrap');
      }
      show('sec-atividade');
    }

    // ---- VÍDEO ----
    if (d.video_url) {
      const videoId = d.video_url.match(/youtu\.be\/([^?&]+)/)?.[1]
                   || d.video_url.match(/[?&]v=([^?&]+)/)?.[1]
                   || (d.video_url.includes('/embed/') ? d.video_url.split('/embed/')[1].split('?')[0] : null);
      if (videoId) {
        document.getElementById('video-iframe').src = 'https://www.youtube.com/embed/' + videoId;
        show('sec-video');
      }
    }

    // ---- AVALIAÇÃO ----
    if (d.avaliacao) {
      renderTextoLivre(d.avaliacao, 'avaliacao');
      show('sec-avaliacao');
    }

    // ---- DESAFIO EXTRA ----
    if (d.desafio_extra) {
      renderTextoLivre(d.desafio_extra, 'desafio-extra');
      show('sec-desafio-extra');
    }

    // ---- CTA TUTORIAL ----
    if (d.tutorial_url) {
      document.getElementById('qr-link').href = d.tutorial_url;
      show('sec-cta');
    }

    // Exibe a página
    document.getElementById('loading').style.display   = 'none';
    document.getElementById('card-page').style.display = 'block';

  } catch (err) {
    console.error(err);
    document.getElementById('loading').style.display = 'none';
    const errEl = document.getElementById('error');
    errEl.style.display = 'flex';
    errEl.innerHTML = `<p>❌ Erro ao carregar.<br><small>${err.message}</small></p>`;
  }
}

carregarCard();
