import { db } from './firebase.js';
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  arrayUnion, collection, getDocs, query, where,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getSemanaLetiva } from './nivel.js';

const TODAS_COLECOES = [
  'resultados_quiz', 'resultados_bug',      'resultados_comp',
  'resultados_ordena', 'resultados_complete', 'resultados_conecta',
  'resultados_box',  'resultados_binario',  'resultados_logica',
  'resultados_palavra', 'resultados_bomba',  'resultados_pixel', 'resultados_pixel_img',
  'resultados_pixel_art',
];

/**
 * Registra o uso de uma tentativa (chamado ao iniciar o jogo).
 * Cria o documento se for a primeira vez.
 */
export async function registrarTentativa({ colecao, docId, uid, escolaId, cardId, tentativasPermitidas, totalItens }) {
  const ref  = doc(db, colecao, docId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      aluno_id:              uid,
      card_id:               cardId,
      escola_id:             escolaId,
      tentativas_permitidas: tentativasPermitidas,
      tentativas_usadas:     1,
      concluido:             false,
      melhor_pontos:         0,
      melhor_acertos:        0,
      total_desafios:        totalItens,
      primeira_vez:          serverTimestamp(),
      ultima_vez:            serverTimestamp(),
      historico:             [],
      semana_letiva:         getSemanaLetiva(),
      dispositivo:           window.innerWidth < 768 ? 'mobile' : 'desktop',
    });
  } else {
    await updateDoc(ref, {
      tentativas_usadas: (snap.data().tentativas_usadas || 0) + 1,
      ultima_vez:        serverTimestamp(),
    });
  }
}

/**
 * Salva o resultado final e recalcula pontos_total do aluno.
 *
 * @param {object} opcoes
 * @param {string}  opcoes.colecao          - Ex: 'resultados_quiz'
 * @param {string}  opcoes.docId            - ID do documento de resultado
 * @param {string}  opcoes.uid              - UID do aluno
 * @param {number}  opcoes.acertos
 * @param {number}  opcoes.pontos
 * @param {number}  opcoes.total            - Total de itens do jogo
 * @param {number}  [opcoes.concluirCom=70] - % mínimo para marcar como concluído
 */
export async function salvarResultado({ colecao, docId, uid, acertos, pontos, total, concluirCom = 70 }) {
  const pct      = Math.round((acertos / total) * 100);
  const concluiu = pct >= concluirCom;
  const ref      = doc(db, colecao, docId);
  const snap     = await getDoc(ref);
  const anterior = snap.exists() ? snap.data() : {};

  await updateDoc(ref, {
    concluido:      concluiu || (anterior.concluido || false),
    melhor_pontos:  Math.max(anterior.melhor_pontos  || 0, pontos),
    melhor_acertos: Math.max(anterior.melhor_acertos || 0, acertos),
    ultima_vez:     serverTimestamp(),
    historico:      arrayUnion({ data: new Date().toISOString(), pontos, acertos, pct }),
  });

  await recalcularPontosAluno(uid);
}

/**
 * Recalcula pontos_total somando melhor_pontos de todas as coleções de resultado.
 * Atualiza Firestore e o elemento #player-pts no DOM.
 */
export async function recalcularPontosAluno(uid) {
  const snaps = await Promise.all(
    TODAS_COLECOES.map(c => getDocs(query(collection(db, c), where('aluno_id', '==', uid))))
  );

  let total = 0;
  snaps.forEach(s => s.forEach(d => { total += parseFloat(d.data().melhor_pontos) || 0; }));
  const totalArred = Math.round(total * 10) / 10;

  await updateDoc(doc(db, 'usuarios', uid), { pontos_total: totalArred });

  const el = document.getElementById('player-pts');
  if (el) el.textContent = totalArred;
}
