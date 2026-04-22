// admin-config.js — Configurações do painel (prompt IA)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAndgQiwxpe6wyCF8aa5NqqdMuwLJfMIMM",
  authDomain: "makerlab3d-4e455.firebaseapp.com",
  projectId: "makerlab3d-4e455",
  storageBucket: "makerlab3d-4e455.firebasestorage.app",
  messagingSenderId: "495457985822",
  appId: "1:495457985822:web:05efcebeed970ecb82150f"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

export const PROMPT_IA_DEFAULT = `Crie o conteúdo educacional de um card para a plataforma MakerLab 3D com base nos dados abaixo:

- ID do Card: {id_do_card}
- Número: {numero}
- Nome do Desafio: {nome_do_desafio}
- Nível: {nivel}
- Tipo do Card: {tipo_do_card}
- Tema do Card: {tema_do_card}

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


## Diretrizes de linguagem (MUITO IMPORTANTE)

- NÃO usar linguagem técnica complexa
- NÃO usar linguagem infantilizada
- Escrever como um professor explicando de forma clara e prática
- Usar frases curtas e objetivas
- Priorizar exemplos e aplicação real
- Estimular experimentação e curiosidade
- Sempre que possível, conectar com o mundo real`;

function showToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

window.carregarConfig = async function() {
  const ta = document.getElementById('config-prompt-template');
  if (!ta) return;
  ta.placeholder = 'Carregando...';
  try {
    const snap = await getDoc(doc(db, 'configuracoes', 'prompt_ia'));
    ta.value = snap.exists() ? (snap.data().template || PROMPT_IA_DEFAULT) : PROMPT_IA_DEFAULT;
  } catch(err) {
    ta.value = PROMPT_IA_DEFAULT;
    console.error('Erro ao carregar config:', err);
  }
};

window.salvarConfig = async function() {
  const ta = document.getElementById('config-prompt-template');
  if (!ta) return;
  try {
    await setDoc(doc(db, 'configuracoes', 'prompt_ia'), {
      template: ta.value,
      atualizado_em: new Date().toISOString()
    });
    showToast('✅ Configurações salvas!', 'success');
  } catch(err) {
    showToast('❌ Erro ao salvar: ' + err.message, 'error');
  }
};

window.restaurarPromptPadrao = function() {
  const ta = document.getElementById('config-prompt-template');
  if (ta) ta.value = PROMPT_IA_DEFAULT;
};
