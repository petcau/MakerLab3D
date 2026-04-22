// card.js — MakerLab 3D

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
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

window.copiarCodigo = function() {
  const pre = document.getElementById('ativ-codigo');
  const btn = document.getElementById('btn-copiar-codigo');
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => {
    btn.textContent = '✅';
    setTimeout(() => { btn.textContent = '📋'; }, 2000);
  });
};

// Escapa HTML para uso seguro em innerHTML
function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Aplica formatação inline: **bold** e `code`
function aplicarInline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
}

// Converte markdown para HTML e injeta no container
function renderTextoLivre(texto, containerId) {
  const container = document.getElementById(containerId);
  if (!container || !texto) return;

  // Substitui blocos ```...``` por <pre><code> antes de processar linha a linha
  texto = texto.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) =>
    `\x00PRE\x00${escHtml(code.trim())}\x00/PRE\x00`
  );

  // Agrupa blocos de tabela em tokens \x00TABLE\x00...\x00/TABLE\x00
  const linhasRaw = texto.split('\n');
  const linhas = [];
  let i = 0;
  while (i < linhasRaw.length) {
    const t = linhasRaw[i].trim();
    if (t.startsWith('|') && t.endsWith('|')) {
      const bloco = [];
      while (i < linhasRaw.length && linhasRaw[i].trim().startsWith('|')) {
        bloco.push(linhasRaw[i].trim());
        i++;
      }
      linhas.push('\x00TABLE\x00' + bloco.join('\n') + '\x00/TABLE\x00');
    } else {
      linhas.push(linhasRaw[i]);
      i++;
    }
  }

  let html     = '';
  let emLista  = false;

  const fecharLista = () => { if (emLista) { html += '</ul>'; emLista = false; } };

  linhas.forEach(linha => {
    const t = linha.trim();

    // Tabela markdown
    if (t.startsWith('\x00TABLE\x00')) {
      fecharLista();
      const blocoLinhas = t.replace('\x00TABLE\x00','').replace('\x00/TABLE\x00','').split('\n');
      const separador   = /^\|[\s\-:|]+\|/;
      const linhasTab   = blocoLinhas.filter(l => !separador.test(l.trim()));
      const cabecalho   = linhasTab[0];
      const corpo       = linhasTab.slice(1);
      const parseCells  = l => l.replace(/^\||\|$/g,'').split('|').map(c => aplicarInline(escHtml(c.trim())));
      const thCells     = parseCells(cabecalho).map(c => `<th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:700;color:#5f6480;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap;">${c}</th>`).join('');
      const trRows      = corpo.map((l, idx) => {
        const cells = parseCells(l).map(c => `<td style="padding:8px 12px;font-size:13px;color:#2f3447;border-top:1px solid #f0f0f0;">${c}</td>`).join('');
        return `<tr style="background:${idx%2===0?'#fff':'#f9f9fb'};">${cells}</tr>`;
      }).join('');
      html += `<div style="overflow-x:auto;margin:10px 0;">
        <table style="width:100%;border-collapse:collapse;border:1.5px solid #e8eaf0;border-radius:10px;overflow:hidden;">
          <thead><tr style="background:#f5f7fb;">${thCells}</tr></thead>
          <tbody>${trRows}</tbody>
        </table></div>`;
      return;
    }

    // Separador horizontal
    if (/^---+$/.test(t)) {
      fecharLista();
      html += '<hr style="border:none;border-top:1px solid #e8eaf0;margin:10px 0;">';
      return;
    }

    // Cabeçalhos ### / ##
    const hMatch = t.match(/^#{2,}\s+(.+)/);
    if (hMatch) {
      fecharLista();
      html += `<p class="texto-subtitulo">${aplicarInline(escHtml(hMatch[1]))}</p>`;
      return;
    }

    // Blockquote > texto
    if (t.startsWith('> ')) {
      fecharLista();
      html += `<blockquote class="texto-blockquote">${aplicarInline(escHtml(t.slice(2)))}</blockquote>`;
      return;
    }

    // Item de lista * ou •
    if (t.startsWith('* ') || t.startsWith('• ') || t.startsWith('- ')) {
      if (!emLista) { html += '<ul class="texto-lista">'; emLista = true; }
      html += `<li>${aplicarInline(escHtml(t.slice(2)))}</li>`;
      return;
    }

    // Bloco de código (placeholder gerado acima)
    if (t.startsWith('\x00PRE\x00')) {
      fecharLista();
      const code = t.replace('\x00PRE\x00', '').replace('\x00/PRE\x00', '');
      html += `<pre style="background:#1e1e1e;color:#d4d4d4;border-radius:8px;padding:14px 18px;font-size:12px;line-height:1.7;overflow-x:auto;white-space:pre;margin:8px 0;">${code}</pre>`;
      return;
    }

    // Parágrafo normal
    fecharLista();
    if (t) html += `<p>${aplicarInline(escHtml(t))}</p>`;
  });

  fecharLista();
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
    renderTextoLivre(d.objetivo || '—', 'objetivo');
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
    // Mapeamento legado: mantém compatibilidade com campos já salvos
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
    const CORES_VINC = ['vinc-azul', 'vinc-amarelo', 'vinc-verde'];

    // Carrega tipos do Firestore; fallback nos 3 padrões se coleção vazia
    let tiposVinc = [];
    try {
      const tiposSnap = await getDocs(collection(db, 'tipos_card'));
      tiposSnap.forEach(t => { if (t.data().ativo !== false) tiposVinc.push({ id: t.id, ...t.data() }); });
      tiposVinc.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    } catch(e) { /* usa fallback */ }

    if (tiposVinc.length === 0) {
      tiposVinc = [
        { nome: 'Desafio',             icone: '🎯' },
        { nome: 'Componente',          icone: '🔩' },
        { nome: 'Conexão com o Mundo', icone: '🌐' },
      ];
    }

    const grupos = tiposVinc.map((t, i) => ({
      key:   tipoKey(t.nome),
      label: `${t.icone || '📌'} ${t.nome}`,
      cor:   CORES_VINC[i % CORES_VINC.length],
    }));

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

    // Busca resultados do aluno logado para cards vinculados (todas as coleções)
    const resultadosAluno = {};
    try {
      const userAtual = await new Promise(resolve => {
        const unsub = onAuthStateChanged(getAuth(), user => { unsub(); resolve(user); });
      });
      if (userAtual) {
        const colsJogos = [
          { col: 'resultados_quiz',     sufixo: '_'          },
          { col: 'resultados_bug',      sufixo: '_bug_'      },
          { col: 'resultados_comp',     sufixo: '_comp_'     },
          { col: 'resultados_ordena',   sufixo: '_ordena_'   },
          { col: 'resultados_complete', sufixo: '_complete_' },
          { col: 'resultados_conecta',  sufixo: '_conecta_'  },
          { col: 'resultados_box',      sufixo: '_box_'      },
          { col: 'resultados_binario',  sufixo: '_binario_'  },
        ];
        await Promise.all(todosIds.flatMap(id =>
          colsJogos.map(async ({ col, sufixo }) => {
            try {
              const rSnap = await getDoc(doc(db, col, userAtual.uid + sufixo + id));
              if (rSnap.exists()) {
                const r = rSnap.data();
                if (!resultadosAluno[id]) resultadosAluno[id] = { pts: 0, concluido: false, played: new Set() };
                resultadosAluno[id].pts += parseFloat(r.melhor_pontos) || 0;
                if (r.concluido) resultadosAluno[id].concluido = true;
                resultadosAluno[id].played.add(sufixo);
              }
            } catch(e) {}
          })
        ));
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
        const resultado  = resultadosAluno[id];
        const concluido  = resultado && resultado.concluido;
        const ptsGanhos  = resultado ? Math.round(resultado.pts * 10) / 10 : null;
        const ptsStr     = ptsGanhos !== null && ptsGanhos > 0
          ? (ptsGanhos % 1 === 0 ? ptsGanhos : ptsGanhos.toFixed(1)) + ' pts'
          : null;

        if (concluido) card.classList.add('mini-card-concluido');

        card.innerHTML = `
          <div class="mini-card-top">
            <span class="mini-card-num">${num || '—'}</span>
            ${nivel ? `<span class="mini-card-nivel">${nivel}</span>` : ''}
          </div>
          <div class="mini-card-nome">${nome}</div>
          ${tema ? `<div class="mini-card-tema">${tema}</div>` : ''}
          ${concluido ? `<div class="mini-card-badge-concluido">✅ Concluído</div>` : ''}
          <div class="mini-card-spacer"></div>
          <div class="mini-card-footer">
            ${duracao ? `<span class="mini-stat">⏱ ${duracao}</span>` : ''}
            <span class="mini-stat mini-stat-conquistado">⭐ ${ptsStr || '0 pts'}</span>
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
        const elCodigo = document.getElementById('ativ-codigo');
        elCodigo.innerHTML = d.atividade_codigo.split('\n').map(linha => {
          const esc = escHtml(linha);
          if (/^\s*\/\//.test(linha)) return `<span style="color:#7ab3e0;">${esc}</span>`;
          return esc.replace(/\bvoid\b/g, '<span style="color:#c9956a;">void</span>');
        }).join('\n');
        show('ativ-codigo-wrap');
      }
      if ((d.glossario || []).length > 0) {
        const tbody = document.getElementById('ativ-glossario-tbody');
        d.glossario.forEach(g => {
          if (!g.codigo && !g.descricao) return;
          const cod  = escHtml((g.codigo  || '').replace(/^`+|`+$/g, '').trim());
          const desc = escHtml(g.descricao || '')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:0.9em;">$1</code>');
          const tr = document.createElement('tr');
          tr.innerHTML = `<td><code style="font-size:0.88em;">${cod}</code></td><td>${desc}</td>`;
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
    const temComp   = (d.comp_perguntas || []).length > 0;
    const temOrdena   = (d.ordena_desafios   || []).length > 0;
    const temComplete = (d.complete_desafios || []).length > 0;
    const temConecta  = (d.conecta_desafios  || []).length > 0;
    const temBox      = (d.box_desafios      || []).length > 0;
    const temBinario  = (d.binario_desafios  || []).length > 0;

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
    if (temComplete) {
      const totalDesafios = d.complete_desafios.length;
      const totalPontos   = d.complete_desafios.reduce((sum,c) => sum + (parseFloat(c.pontos)||1.0), 0);
      document.getElementById('complete-total-desafios').textContent  = totalDesafios;
      document.getElementById('complete-total-pontos').textContent    = totalPontos%1===0?totalPontos:totalPontos.toFixed(1);
      document.getElementById('complete-tentativas-stat').textContent = d.complete_tentativas || 3;
      show('sec-complete');
      const btnComplete = document.getElementById('complete-jogar-btn');
      if (btnComplete) btnComplete.onclick = () => window.open('../jogos/complete-codigo.html?card=' + cardId, '_blank');
    }

    if (temOrdena) {
      const totalDesafios = d.ordena_desafios.length;
      const totalPontos   = d.ordena_desafios.reduce((sum, o) => sum + (parseFloat(o.pontos) || 1.0), 0);
      document.getElementById('ordena-total-desafios').textContent = totalDesafios;
      document.getElementById('ordena-total-pontos').textContent   = totalPontos % 1 === 0 ? totalPontos : totalPontos.toFixed(1);
      document.getElementById('ordena-tentativas-stat').textContent = d.ordena_tentativas || 3;
      show('sec-ordena');
      const btnOrdena = document.getElementById('ordena-jogar-btn');
      if (btnOrdena) btnOrdena.onclick = () => window.open('../jogos/ordena-codigo.html?card=' + cardId, '_blank');
    }

    if (temComp) {
      const totalPerguntas = d.comp_perguntas.length;
      const totalPontos    = d.comp_perguntas.reduce((sum, c) => sum + (parseFloat(c.pontos) || 1.0), 0);
      document.getElementById('comp-total-perguntas').textContent = totalPerguntas;
      document.getElementById('comp-total-pontos').textContent    = totalPontos % 1 === 0 ? totalPontos : totalPontos.toFixed(1);
      document.getElementById('comp-tentativas-stat').textContent = d.comp_tentativas || 3;
      show('sec-comp');
      const btnComp = document.getElementById('comp-jogar-btn');
      if (btnComp) btnComp.onclick = () => window.open('../jogos/qual-componente.html?card=' + cardId, '_blank');
    }

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

    if (temConecta) {
      const totalDesafios = d.conecta_desafios.length;
      const totalPontos   = d.conecta_desafios.reduce((sum, c) => sum + (parseFloat(c.pontos) || 2.0), 0);
      document.getElementById('conecta-total-desafios').textContent  = totalDesafios;
      document.getElementById('conecta-total-pontos').textContent    = totalPontos % 1 === 0 ? totalPontos : totalPontos.toFixed(1);
      document.getElementById('conecta-tentativas-stat').textContent = d.conecta_tentativas || 3;
      show('sec-conecta');
      const btnConecta = document.getElementById('conecta-jogar-btn');
      if (btnConecta) btnConecta.onclick = () => window.open('../jogos/conecta-pontos.html?card=' + cardId, '_blank');
    }

    if (temBox) {
      const totalDesafios = d.box_desafios.length;
      const totalPontos   = d.box_desafios.reduce((sum, b) => sum + (parseFloat(b.pontos) || 2.0), 0);
      document.getElementById('box-total-desafios').textContent  = totalDesafios;
      document.getElementById('box-total-pontos').textContent    = totalPontos % 1 === 0 ? totalPontos : totalPontos.toFixed(1);
      document.getElementById('box-tentativas-stat').textContent = d.box_tentativas || 3;
      show('sec-box');
      const btnBox = document.getElementById('box-jogar-btn');
      if (btnBox) btnBox.onclick = () => window.open('../jogos/simulador-box.html?card=' + cardId, '_blank');
    }

    if (temBinario) {
      const totalDesafios = d.binario_desafios.length;
      const totalPontos   = d.binario_desafios.reduce((sum, b) => sum + (parseFloat(b.pontos) || 1.0), 0);
      document.getElementById('binario-total-desafios').textContent  = totalDesafios;
      document.getElementById('binario-total-pontos').textContent    = totalPontos % 1 === 0 ? totalPontos : totalPontos.toFixed(1);
      document.getElementById('binario-tentativas-stat').textContent = d.binario_tentativas || 3;
      show('sec-binario');
      const btnBinario = document.getElementById('binario-jogar-btn');
      if (btnBinario) btnBinario.onclick = () => window.open('../jogos/binario.html?card=' + cardId, '_blank');
    }

    // Retorna lista de sufixos dos jogos presentes em um card
    function jogosDoCardData(data) {
      const jogos = [];
      if ((data.quiz             || []).length > 0) jogos.push('_');
      if ((data.bug_codigos      || []).length > 0) jogos.push('_bug_');
      if ((data.comp_perguntas   || []).length > 0) jogos.push('_comp_');
      if ((data.ordena_desafios  || []).length > 0) jogos.push('_ordena_');
      if ((data.complete_desafios|| []).length > 0) jogos.push('_complete_');
      if ((data.conecta_desafios || []).length > 0) jogos.push('_conecta_');
      if ((data.box_desafios     || []).length > 0) jogos.push('_box_');
      if ((data.binario_desafios || []).length > 0) jogos.push('_binario_');
      return jogos;
    }

    // ---- AUTH — atualiza quiz e bug juntos ----
    if (temQuiz || temBug || temComp || temOrdena || temComplete || temConecta || temBox || temBinario || todosIds.length > 0) {
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
            if (ptsVal) ptsVal.textContent = pts;

            // Tentativas
            const docId      = alunoLogado.uid + (prefixo === 'bug' ? '_bug_' : prefixo === 'comp' ? '_comp_' : prefixo === 'ordena' ? '_ordena_' : prefixo === 'complete' ? '_complete_' : prefixo === 'conecta' ? '_conecta_' : prefixo === 'box' ? '_box_' : prefixo === 'binario' ? '_binario_' : '_') + cardId;
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
                  '<div class="pts-conq-badge">⭐ <strong>' + ultPts + ' pts</strong> — Pontos Conquistados</div>' +
                  'Tentativas <strong>' + usadas + '</strong> de <strong>' + tentPermitidas + '</strong>';
              }
            }

            // Se esgotou tentativas
            const btnWrap = document.getElementById(prefixo + '-jogar-btn-wrap');
            if (btnWrap && usadas >= tentPermitidas && resultSnap.exists()) {
              const r = resultSnap.data();
              const melhorPts = (r.melhor_pontos || 0) % 1 === 0 ? (r.melhor_pontos || 0) : (r.melhor_pontos || 0).toFixed(1);
              const totalItens = prefixo === 'bug' ? r.total_codigos : (prefixo === 'ordena' || prefixo === 'complete' || prefixo === 'conecta' || prefixo === 'box' || prefixo === 'binario') ? r.total_desafios : r.total_perguntas;
              const labelItens = prefixo === 'bug' ? 'bugs encontrados' : (prefixo === 'ordena' || prefixo === 'complete' || prefixo === 'conecta' || prefixo === 'box' || prefixo === 'binario') ? 'desafios' : 'perguntas corretas';
              btnWrap.innerHTML =
                '<div class="quiz-encerrado-box">' +
                  '<div class="quiz-encerrado-titulo">🔒 ' + (prefixo === 'bug' ? 'Caça encerrada' : prefixo === 'comp' ? 'Jogo encerrado' : prefixo === 'ordena' ? 'Jogo encerrado' : prefixo === 'conecta' ? 'Jogo encerrado' : 'Quiz encerrado') + '</div>' +
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
          if (temComp)   await preencherBloco('comp',   'resultados_comp',   d.comp_tentativas || 3);
          if (temOrdena)   await preencherBloco('ordena',   'resultados_ordena',   d.ordena_tentativas   || 3);
          if (temComplete) await preencherBloco('complete', 'resultados_complete', d.complete_tentativas || 3);
          if (temConecta)  await preencherBloco('conecta',  'resultados_conecta',  d.conecta_tentativas  || 3);
          if (temBox)      await preencherBloco('box',      'resultados_box',      d.box_tentativas      || 3);
          if (temBinario)  await preencherBloco('binario',  'resultados_binario',  d.binario_tentativas  || 3);

          // ---- PONTOS CONQUISTADOS (soma de todos os jogos deste card) ----
          const uid = alunoLogado.uid;
          const resultDocs = await Promise.all([
            getDoc(doc(db, 'resultados_quiz',     uid + '_' + cardId)),
            getDoc(doc(db, 'resultados_bug',      uid + '_bug_' + cardId)),
            getDoc(doc(db, 'resultados_comp',     uid + '_comp_' + cardId)),
            getDoc(doc(db, 'resultados_ordena',   uid + '_ordena_' + cardId)),
            getDoc(doc(db, 'resultados_complete', uid + '_complete_' + cardId)),
            getDoc(doc(db, 'resultados_conecta',  uid + '_conecta_' + cardId)),
            getDoc(doc(db, 'resultados_box',      uid + '_box_' + cardId)),
            getDoc(doc(db, 'resultados_binario',  uid + '_binario_' + cardId)),
          ]);
          const totalConquistado = resultDocs.reduce((sum, s) => sum + (s.exists() ? (parseFloat(s.data().melhor_pontos) || 0) : 0), 0);
          if (totalConquistado > 0) {
            const val = totalConquistado % 1 === 0 ? totalConquistado : totalConquistado.toFixed(1);
            document.getElementById('pontos-conquistados').textContent = val + ' pts';
            document.getElementById('stat-pontos-conquistados').style.display = '';
          }

          // ---- CARD CONCLUÍDO ----
          const idxAtual = [
            temQuiz ? 0 : -1, temBug ? 1 : -1, temComp ? 2 : -1, temOrdena ? 3 : -1,
            temComplete ? 4 : -1, temConecta ? 5 : -1, temBox ? 6 : -1, temBinario ? 7 : -1,
          ].filter(i => i >= 0);

          // Card sem jogos próprios → auto-aprovado; com jogos → todos devem ter sido jogados
          let cardConcluido = idxAtual.length === 0 || idxAtual.every(i => resultDocs[i].exists());

          // Verifica cards vinculados — ignora os sem jogos; usa concluido (igual ao mini-card)
          if (cardConcluido) {
            for (const linkedId of todosIds) {
              const dados = dadosVinculados[linkedId];
              if (!dados) continue;
              const jogosLinked = jogosDoCardData(dados);
              if (jogosLinked.length === 0) continue; // sem jogos → não computa
              const resultado = resultadosAluno[linkedId];
              if (!resultado || !resultado.concluido) { cardConcluido = false; break; }
            }
          }

          // Só exibe o badge se há ao menos um jogo (no card ou nos vinculados)
          const temJogosEmAlgumLugar = idxAtual.length > 0 ||
            todosIds.some(id => dadosVinculados[id] && jogosDoCardData(dadosVinculados[id]).length > 0);

          if (cardConcluido && temJogosEmAlgumLugar) {
            document.getElementById('stat-pontos-conquistados').style.display = '';
            document.getElementById('stat-pontos-conquistados').classList.add('conquistado-box--concluido');
            document.getElementById('conquistado-icon').textContent = '🏆';
            document.getElementById('conquistado-concluido-badge').style.display = '';
          } else {
            document.getElementById('stat-pontos-conquistados').classList.remove('conquistado-box--concluido');
            document.getElementById('conquistado-icon').textContent = '🏅';
            document.getElementById('conquistado-concluido-badge').style.display = 'none';
          }

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
          ['quiz', 'bug', 'comp', 'ordena', 'complete', 'conecta', 'box', 'binario'].forEach(p => {
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
