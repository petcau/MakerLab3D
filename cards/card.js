// card.js — MakerLab 3D

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

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

    // Busca resultados do aluno logado para cards vinculados
    const resultadosAluno = {};
    try {
      const userAtual = await new Promise(resolve => {
        const unsub = onAuthStateChanged(getAuth(), user => { unsub(); resolve(user); });
      });
      if (userAtual) {
        await Promise.all(todosIds.map(async id => {
          try {
            const rSnap = await getDoc(doc(db, 'resultados_quiz', userAtual.uid + '_' + id));
            if (rSnap.exists()) resultadosAluno[id] = rSnap.data();
          } catch(e) {}
        }));
      }
    } catch(e) { console.warn('resultados vinculados:', e); }

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
        const resultado = resultadosAluno[id];
        const concluido = resultado && resultado.concluido;
        const ptsGanhos = resultado ? resultado.melhor_pontos : null;

        if (concluido) card.classList.add('mini-card-concluido');

        card.innerHTML = `
          <div class="mini-card-top">
            <span class="mini-card-num">${num || '—'}</span>
            ${nivel ? `<span class="mini-card-nivel">${nivel}</span>` : ''}
          </div>
          <div class="mini-card-nome">${nome}</div>
          ${tema ? `<div class="mini-card-tema">${tema}</div>` : ''}
          ${concluido ? `<div class="mini-card-badge-concluido">✅ Concluído<span class="badge-pts">${ptsGanhos !== null ? (ptsGanhos % 1 === 0 ? ptsGanhos : ptsGanhos.toFixed(1)) + ' pts' : ''}</span></div>` : ''}
          <div class="mini-card-spacer"></div>
          <div class="mini-card-footer">
            ${duracao ? `<span class="mini-stat">⏱ ${duracao}</span>` : ''}
            ${!concluido && pontos ? `<span class="mini-stat">⭐ ${pontos} pts</span>` : ''}
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

    // ---- QUIZ JOGO ----
    const temQuiz = (d.quiz || []).length > 0;
    const temBug  = (d.bug_codigos || []).length > 0;

    if (temQuiz) {
      const totalPerguntas = d.quiz.length;
      const totalPontos    = d.quiz.reduce((sum, q) => sum + (parseFloat(q.pontos) || 1.0), 0);
      document.getElementById('quiz-total-perguntas').textContent = totalPerguntas;
      document.getElementById('quiz-total-pontos').textContent    = totalPontos % 1 === 0 ? totalPontos : totalPontos.toFixed(1);
      document.getElementById('quiz-tentativas').textContent      = d.tentativas || 3;
      show('sec-quiz');
      const btnJogar = document.getElementById('quiz-jogar-btn');
      if (btnJogar) btnJogar.onclick = () => window.open('../jogos/quiz.html?card=' + cardId, '_blank');
    }

    // ---- CAÇA AO BUG JOGO ----
    if (temBug) {
      const totalCodigos = d.bug_codigos.length;
      const totalPontos  = d.bug_codigos.reduce((sum, b) => sum + (parseFloat(b.pontos) || 1.0), 0);
      document.getElementById('bug-total-codigos').textContent   = totalCodigos;
      document.getElementById('bug-total-pontos').textContent    = totalPontos % 1 === 0 ? totalPontos : totalPontos.toFixed(1);
      document.getElementById('bug-tentativas-stat').textContent = d.bug_tentativas || 3;
      show('sec-bug');
      const btnBug = document.getElementById('bug-jogar-btn');
      if (btnBug) btnBug.onclick = () => window.open('../jogos/caca-ao-bug.html?card=' + cardId, '_blank');
    }

    // ---- AUTH — atualiza quiz e bug juntos ----
    if (temQuiz || temBug) {
      const NIVEL_NOMES  = ['Explorador Iniciante','Curioso Digital','Aprendiz Maker','Construtor Criativo','Inventor em Ação','Programador Maker','Engenheiro Criativo','Inovador Maker','Mentor Maker','Mestre Maker'];
      const NIVEL_PONTOS = [0,100,250,500,900,1400,2000,2700,3500,4500];
      let alunoLogado = null;

      async function atualizarDadosAluno() {
        if (!alunoLogado) return;
        try {
          const snap = await getDoc(doc(db, 'usuarios', alunoLogado.uid));
          if (!snap.exists()) return;
          const dados  = snap.data();
          const pts    = dados.pontos_total || 0;
          let nivelIdx = 0;
          for (let i = NIVEL_PONTOS.length - 1; i >= 0; i--) {
            if (pts >= NIVEL_PONTOS[i]) { nivelIdx = i; break; }
          }
          const nivelNum   = nivelIdx + 1;
          const nivelNome  = 'Nível ' + nivelNum + ' — ' + NIVEL_NOMES[nivelIdx];
          const nomeAluno  = dados.nome || alunoLogado.displayName || alunoLogado.email.split('@')[0];
          const avatarSrc  = '../assets/robo ' + nivelNum + '_transparente.png';

          // Função auxiliar para preencher um bloco de jogo
          async function preencherBloco(prefixo, cardCollecao, tentPermitidas) {
            const roboImg = document.getElementById(prefixo + '-robo-img');
            const nivelEl = document.getElementById(prefixo + '-nivel-nome');
            const nomeEl  = document.getElementById(prefixo + '-aluno-nome');
            const ptsEl   = document.getElementById(prefixo + '-pontos-aluno');
            const ptsVal  = document.getElementById(prefixo + '-pts-val');

            if (roboImg) roboImg.src = avatarSrc;
            if (nivelEl) nivelEl.textContent = nivelNome;
            if (nomeEl)  nomeEl.textContent  = 'Olá, ' + nomeAluno + '!';
            if (ptsEl && ptsVal) { ptsVal.textContent = pts; ptsEl.style.display = ''; }

            // Tentativas
            const docId      = alunoLogado.uid + (prefixo === 'bug' ? '_bug_' : '_') + cardId;
            const resultSnap = await getDoc(doc(db, cardCollecao, docId));
            const usadas     = resultSnap.exists() ? (resultSnap.data().tentativas_usadas || 0) : 0;

            const tentEl    = document.getElementById(prefixo + '-jogo-tentativas');
            const tentUsEl  = document.getElementById(prefixo + '-tent-usadas');
            const tentTotEl = document.getElementById(prefixo + '-tent-total');
            if (tentEl && tentUsEl && tentTotEl) {
              tentUsEl.textContent  = usadas;
              tentTotEl.textContent = tentPermitidas;
              tentEl.style.display  = '';
            }

            // Mostrar pontos da última tentativa (se já jogou)
            if (resultSnap.exists() && usadas > 0) {
              const r = resultSnap.data();
              const ultPts = (r.melhor_pontos || 0) % 1 === 0 ? (r.melhor_pontos || 0) : (r.melhor_pontos || 0).toFixed(1);
              const tentEl2 = document.getElementById(prefixo + '-jogo-tentativas');
              if (tentEl2) {
                tentEl2.innerHTML =
                  'Tentativas <strong>' + usadas + '</strong> de <strong>' + tentPermitidas + '</strong>' +
                  ' &nbsp;·&nbsp; Última: <strong style="color:var(--ouro-esc);">' + ultPts + ' pts</strong>';
              }
            }

            // Se esgotou tentativas
            const btnWrap = document.getElementById(prefixo + '-jogar-btn-wrap');
            if (btnWrap && usadas >= tentPermitidas && resultSnap.exists()) {
              const r = resultSnap.data();
              const melhorPts = (r.melhor_pontos || 0) % 1 === 0 ? (r.melhor_pontos || 0) : (r.melhor_pontos || 0).toFixed(1);
              const totalItens = prefixo === 'bug' ? r.total_codigos : r.total_perguntas;
              const labelItens = prefixo === 'bug' ? 'bugs encontrados' : 'perguntas';
              btnWrap.innerHTML =
                '<div class="quiz-encerrado-box">' +
                  '<div class="quiz-encerrado-titulo">🔒 ' + (prefixo === 'bug' ? 'Caça encerrada' : 'Quiz encerrado') + '</div>' +
                  '<div class="quiz-encerrado-sub">Você já usou todas as ' + tentPermitidas + ' tentativa' + (tentPermitidas !== 1 ? 's' : '') + '.</div>' +
                  '<div class="quiz-encerrado-resultado">' +
                    '<div class="quiz-encerrado-label">Seu resultado</div>' +
                    '<div class="quiz-encerrado-perguntas">' + (r.melhor_acertos || 0) + '/' + (totalItens || '?') + ' ' + labelItens + '</div>' +
                    '<div class="quiz-encerrado-pontos">' + melhorPts + ' pontos</div>' +
                    (r.concluido ? '<div class="quiz-encerrado-concluido">✅ Desafio concluído!</div>' : '') +
                  '</div>' +
                '</div>';
            }
          }

          if (temQuiz) await preencherBloco('quiz', 'resultados_quiz', d.tentativas || 3);
          if (temBug)  await preencherBloco('bug',  'resultados_bug',  d.bug_tentativas || 3);

        } catch(e) { console.warn('Auth jogos:', e); }
      }

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') atualizarDadosAluno();
      });

      const auth = getAuth();
      onAuthStateChanged(auth, async aluno => {
        if (aluno) {
          alunoLogado = aluno;
          await atualizarDadosAluno();
        } else {
          ['quiz', 'bug'].forEach(p => {
            const btn   = document.getElementById(p + '-jogar-btn');
            const aviso = document.getElementById(p + '-login-aviso');
            if (btn)   { btn.textContent = '🔒 Fazer Login'; btn.onclick = () => window.location.href = '../login.html'; }
            if (aviso) aviso.style.display = '';
          });
        }
      });
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
