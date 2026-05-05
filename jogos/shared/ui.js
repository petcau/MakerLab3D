/**
 * Exibe mensagem de erro na tela de loading.
 * @param {string} msg - Texto (aceita HTML simples)
 */
export function erroLoad(msg) {
  const el = document.getElementById('loading');
  if (!el) return;
  el.innerHTML = `
    <div style="text-align:center;padding:20px;">
      <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
      <p style="max-width:360px;text-align:center;line-height:1.6;color:#5F6480;font-family:'Nunito Sans',sans-serif;">${msg}</p>
      <button onclick="voltarCard()"
        style="margin-top:16px;background:#2F3447;color:#fff;border:none;border-radius:10px;
               padding:10px 22px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;">
        ← Voltar
      </button>
    </div>`;
}

/**
 * Exibe tela de bloqueio (tentativas esgotadas) via erroLoad.
 *
 * @param {object} opcoes
 * @param {number}  opcoes.tentativasPermitidas
 * @param {object}  [opcoes.dados]       - Documento do resultado (melhor_acertos, melhor_pontos, etc.)
 * @param {string}  [opcoes.labelItem]   - Ex: 'perguntas' | 'desafios'
 */
export function mostrarBloqueado({ tentativasPermitidas, dados = null, labelItem = 'desafios' }) {
  const melhor = dados
    ? `${dados.melhor_acertos || 0}/${dados.total_desafios || dados.total_perguntas || '?'} ${labelItem}`
    : '—';
  const pts = dados ? ` · ${dados.melhor_pontos || 0} pts` : '';

  erroLoad(
    `Você já usou todas as <strong>${tentativasPermitidas}</strong> tentativas permitidas.<br>
     Melhor resultado: <strong>${melhor}${pts}</strong>
     ${dados?.concluido ? '<br><span style="color:#15803d;font-weight:700;">✅ Desafio concluído!</span>' : ''}`
  );
}

/**
 * Navega de volta ao card.
 * @param {string} cardId
 */
export function voltarCard(cardId) {
  if (window.opener) { window.close(); return; }
  if (window.history.length > 1) { history.back(); return; }
  window.location.href = '../cards/card.html?id=' + cardId;
}

/**
 * Preenche e exibe a tela final padronizada.
 *
 * @param {object} opcoes
 * @param {number}  opcoes.acertos
 * @param {number}  opcoes.total
 * @param {number}  opcoes.pontos
 * @param {number}  opcoes.tentativasPermitidas
 * @param {number}  opcoes.tentativasUsadas
 * @param {string}  opcoes.avatarSrc
 * @param {number}  [opcoes.concluirCom=70]      - % para badge de concluído
 * @param {object}  [opcoes.mensagens]            - Textos customizados por jogo
 *   mensagens = { perfeito, bom, esforco, fraco } — cada um: { emoji, titulo, msg }
 */
export function mostrarTelaFinal({
  acertos, total, pontos, tentativasPermitidas, tentativasUsadas,
  avatarSrc, concluirCom = 70, mensagens = {},
}) {
  const pct = Math.round((acertos / total) * 100);
  const ptsStr = Number.isInteger(pontos) ? pontos : pontos.toFixed(1);

  // Textos padrão (sobrescritos por mensagens se fornecidos)
  const textos = {
    perfeito: { emoji: '👑', titulo: 'Perfeito!',        msg: `Você acertou todos os ${total} itens!` },
    bom:      { emoji: '🎖️', titulo: 'Muito bem!',       msg: `Você acertou ${acertos} de ${total}.` },
    esforco:  { emoji: '💡', titulo: 'Bom esforço!',     msg: `Você acertou ${acertos} de ${total}. Revise e tente novamente!` },
    fraco:    { emoji: '🔄', titulo: 'Não desista!',     msg: `Você acertou ${acertos} de ${total}. Releia o conteúdo!` },
    ...mensagens,
  };

  const t = pct === 100 ? textos.perfeito
          : pct >= 70   ? textos.bom
          : pct >= 40   ? textos.esforco
          :               textos.fraco;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('tf-emoji',  t.emoji);
  set('tf-titulo', t.titulo);
  set('tf-sub',    pct + '% de aproveitamento');
  set('res-msg',   t.msg);
  set('res-ac',    acertos);
  set('res-er',    total - acertos);
  set('res-pt',    ptsStr);

  const av = document.getElementById('tf-avatar');
  if (av) av.src = avatarSrc;

  // Badge concluído
  const badge = document.getElementById('tf-badge-concluido');
  if (badge) badge.style.display = pct >= concluirCom ? '' : 'none';

  // Tentativas restantes
  const restantes = tentativasPermitidas - tentativasUsadas;
  const tentEl = document.getElementById('tf-tentativas-restantes');
  if (tentEl) {
    tentEl.textContent = restantes > 0
      ? `${restantes} tentativa${restantes !== 1 ? 's' : ''} restante${restantes !== 1 ? 's' : ''}`
      : 'Nenhuma tentativa restante';
    tentEl.style.color = restantes > 0 ? '' : 'var(--vermelho, #e74c3c)';
  }

  const btnTentar = document.querySelector('.btn-tentar');
  if (btnTentar) btnTentar.style.display = restantes > 0 ? '' : 'none';

  const tela = document.getElementById('tela-final');
  if (tela) tela.style.display = 'flex';
}
