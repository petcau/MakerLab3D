import { auth, db }    from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { doc, getDoc }        from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { NIVEL_NOMES, NIVEL_PONTOS, getNivelIdx } from './nivel.js';

/**
 * Aguarda autenticação, preenche o player-card no DOM e retorna dados do aluno.
 *
 * @param {object} opcoes
 * @param {string} opcoes.jogoNome    - Nome exibido no badge do jogo (ex: 'Quiz')
 * @param {string} opcoes.cardId      - ID do card atual
 * @param {string} [opcoes.secaoParam] - ID da seção (para níveis customizados)
 *
 * @returns {Promise<{ uid, escolaId, nivelNum, avatarSrc, nivelNomes, nivelPontos }>}
 */
export function carregarPlayerCard({ jogoNome, cardId, secaoParam = null }) {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async user => {
      if (!user) { window.location.href = '../login.html'; return; }

      try {
        const userSnap = await getDoc(doc(db, 'usuarios', user.uid));
        if (!userSnap.exists()) { reject(new Error('Usuário não encontrado')); return; }

        const u   = userSnap.data();
        const pts = u.pontos_total || 0;

        // Níveis: tenta carregar da seção, senão usa padrão
        let nivelNomes  = [...NIVEL_NOMES];
        let nivelPontos = [...NIVEL_PONTOS];
        if (secaoParam) {
          try {
            const sSnap = await getDoc(doc(db, 'secoes', secaoParam));
            if (sSnap.exists()) {
              const niveis = sSnap.data().niveis;
              if (Array.isArray(niveis) && niveis.length === 10) {
                nivelNomes  = niveis.map(n => n.nome   || '');
                nivelPontos = niveis.map(n => n.pontos ?? 0);
              }
            }
          } catch(_) {}
        }

        const idx      = getNivelIdx(pts, nivelPontos);
        const nivelNum = idx + 1;
        const avatarSrc = '../assets/robo ' + nivelNum + '_transparente.png';

        // Preenche DOM
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('player-nome',  u.nome || user.displayName || user.email.split('@')[0]);
        set('player-nivel', 'Nível ' + nivelNum + ' — ' + nivelNomes[idx]);
        set('player-pts',   pts);
        set('player-jogo',  jogoNome);
        const av = document.getElementById('player-avatar');
        if (av) av.src = avatarSrc;
        const pc = document.getElementById('player-card');
        if (pc) pc.style.display = '';

        // Nome da escola
        const escolaId = u.escola_id || '';
        if (escolaId) {
          try {
            const eSnap = await getDoc(doc(db, 'escolas', escolaId));
            const el = document.getElementById('player-escola');
            if (el && eSnap.exists()) el.textContent = eSnap.data().nome || '';
          } catch(_) {}
        }

        resolve({ uid: user.uid, escolaId, nivelNum, avatarSrc, nivelNomes, nivelPontos });
      } catch(e) { reject(e); }
    });
  });
}
