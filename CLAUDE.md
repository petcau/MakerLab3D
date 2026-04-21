# MakerLab3D — Contexto do Projeto

## Visão Geral
Plataforma educacional gamificada para ensino maker (eletrônica, robótica, programação) em escolas.
Stack: HTML/CSS/JS puro + Firebase (Firestore + Auth + Storage).

## Firebase
- Project ID: `makerlab3d-4e455`
- SDK versão: `12.11.0`
- Config completa em cada arquivo JS (sem .env)

## Estrutura de Arquivos

```
MakerLab3D/
├── portal_educacional.html   # Portal principal (aluno/professor/gestor)
├── portal.js                 # Lógica do portal (auth, trilhas, turmas, ranking)
├── portal.css                # Estilos do portal
├── login.html / login.js     # Autenticação
├── cards/
│   ├── admin.html            # Painel admin (abas: Cards, Trilhas, Seções, Usuários, Escolas)
│   ├── admin.js              # Gestão de cards
│   ├── admin-trilhas.js      # Gestão de trilhas + switchTab()
│   ├── admin-secoes.js       # Gestão de seções (agrupam trilhas)
│   ├── admin-escolas.js      # Gestão de escolas, professores, alunos, turmas
│   ├── card.html             # Página do card individual
│   ├── card.js               # Lógica do card (jogos, progresso)
│   ├── card.css              # Estilos dos cards
│   └── trilha.html           # Página de trilha
├── jogos/
│   ├── quiz.js / quiz.html   # Jogo Quiz
│   ├── bug.js / bug.html     # Caça ao Bug
│   ├── comp.js / comp.html   # Qual Componente?
│   ├── ordena.js             # Ordena Código
│   ├── complete.js           # Complete o Código
│   ├── conecta.js            # Conecta os Pontos
│   ├── box.js / box.html     # Simulador BOX
│   └── binario.js / binario.html  # Código Binário (5 bits, 0-31)
└── assets/
    └── robo 1_transparente.png ... robo 10_transparente.png
```

## Coleções Firestore

| Coleção | Descrição |
|---------|-----------|
| `cards` | Cards de conteúdo com jogos embutidos |
| `trilhas` | Trilhas de aprendizagem (lista ordenada de card IDs) |
| `secoes` | Seções que agrupam trilhas (vinculadas a escolas) |
| `escolas` | Escolas com `secao_id`, `codigo_acesso` |
| `usuarios` | Alunos, professores, gestores, conteudistas |
| `turmas` | Turmas por escola com `professor_id` e `alunos[]` |
| `resultados_quiz` | Resultados por jogo (padrão: `uid_tipojogo_cardId`) |
| `resultados_bug` | |
| `resultados_comp` | |
| `resultados_ordena` | |
| `resultados_complete` | |
| `resultados_conecta` | |
| `resultados_box` | |
| `resultados_binario` | |

## Modelo de Dados

### Card
```js
{ nome, tipo, numero, tema, descricao, imagem_url, publicado,
  quiz_perguntas, quiz_tentativas,
  bug_desafios, bug_tentativas,
  comp_desafios, comp_tentativas,
  ordena_desafios, ordena_tentativas,
  complete_desafios, complete_tentativas,
  conecta_pares, conecta_tentativas,
  box_desafios, box_tentativas,
  binario_desafios, binario_tentativas,
  pontos_total }
```

### Trilha
```js
{ nome, descricao, objetivo, video_url, cards: [cardId,...], publicado }
```

### Seção
```js
{ nome, descricao, ordem, trilhas: [trilhaId,...], publicado }
```

### Escola
```js
{ id_escola, nome, codigo_acesso, ativo, secao_id,
  endereco, cidade, uf, contato, email, ... }
```

### Usuário
```js
{ perfil: 'aluno'|'professor'|'gestor'|'conteudista',
  nome, email, escola_id, pontos_total,
  // aluno: matricula, ano_letivo, turno, nivel_maker
  // professor: tipo_vinculo, area_atuacao, formacao }
```

### Turma
```js
{ codigo, nome, inicio, ativa, professor_id, professor_nome,
  escola_id, alunos: [uid,...], criado_em, atualizado_em }
```

## Perfis de Usuário

- **gestor**: Acesso total. Vê todos os painéis. Pode filtrar trilhas por seção via combobox.
- **conteudista**: Igual ao gestor, exceto gestão de usuários admin.
- **professor**: Vê trilhas da seção da sua escola + painel Turmas + Alunos da escola.
- **aluno**: Vê trilhas da seção da sua escola + ranking + gamificação.

## Funcionalidades Implementadas

### Portal Educacional (`portal_educacional.html`)
- Auth Firebase com perfis
- Painel Aluno: ranking, trilhas com progresso, gamificação top 10
- Painel Professor: trilhas desbloqueadas + **Turmas** (CRUD + gerenciar alunos) + Todos os alunos da escola
- Painel Gestor: admin links + combobox filtro por seção
- Filtro de trilhas por seção (respeita ordem definida no cadastro)
- Seletor "Visualizar como" para gestores

### Admin (`cards/admin.html`)
- Abas: Cards | Trilhas | Seções | Usuários | Escolas
- `switchTab()` definido em `admin-trilhas.js`

### Escolas (`admin-escolas.js`)
- CRUD completo de escolas
- Campo Seção (vincula escola a uma seção de trilhas)
- Professores: modal completo com dados pedagógicos
- Alunos: modal com dados escolares e maker
- **Turmas**: CRUD + modal gerenciar alunos (split-panel: na turma / disponíveis)
- Convites por WhatsApp para professores e alunos

### Jogo Binário (`jogos/binario.js`)
- Sistema 5 bits (16, 8, 4, 2, 1)
- Perguntas: decimal → binário e binário → decimal
- Distratores gerados dinamicamente
- Coleção: `resultados_binario`, docId: `uid + '_binario_' + cardId`

## Regras Firestore Necessárias
```
match /resultados_binario/{docId} { allow read, write: if request.auth != null; }
match /secoes/{secaoId} { allow read: if true; allow write: if request.auth != null; }
match /turmas/{turmaId} { allow read, write: if request.auth != null; }
```

## Regras Storage
```
match /cards/{cardId}/{allPaths=**} {
  allow read: if true;
  allow write: if request.auth != null;
}
```

## Padrões de Código

- Firebase importado via CDN (`https://www.gstatic.com/firebasejs/12.11.0/...`)
- Módulos ES6 (`type="module"`)
- Funções expostas via `window.nomeDaFuncao` para usar em `onclick` no HTML
- Sem frameworks — JS puro com manipulação DOM direta
- Toast de feedback: `showToast(msg, tipo)` onde tipo = `'success'` | `'error'` | `''`
- Modais criados dinamicamente e appendados ao `document.body`

## Níveis de Gamificação (pontos)
1. Explorador Iniciante — 0 pts
2. Curioso Digital — 100 pts
3. Aprendiz Maker — 250 pts
4. Construtor Criativo — 500 pts
5. Inventor em Ação — 900 pts
6. Programador Maker — 1.400 pts
7. Engenheiro Criativo — 2.000 pts
8. Inovador Maker — 2.700 pts
9. Mentor Maker — 3.500 pts
10. Mestre Maker — 4.500 pts
