# Rolagem até o conteúdo de estudo

Comportamento confirmado pelo usuário: ao escolher disciplina, matéria e aula, rolar até o conteúdo aberto em cada etapa, deixando o botão “Iniciar estudo” visível na aula.

As telas de Programação e Outras Disciplinas compartilham o currículo. Um hook com referência ao conteúdo posicionará cada destino após sua renderização, com margem para o menu fixo. Carregamentos assíncronos devem terminar antes da rolagem; atualizações comuns da tela não devem reposicionar o aluno.

O mesmo posicionamento cobre os modos leitura, flashcards, questões e simulado, além do retorno à lista. A aula carrega dinamicamente e posiciona seu próprio cabeçalho, substituindo a rolagem atual para o topo geral da página. O modal de leitura continua dependendo do clique em “Iniciar estudo”.

Validar a espera pelo carregamento, a troca de destino e o cancelamento de rolagens pendentes. Conferir o fluxo em computador e celular, os testes existentes de navegação e retomada, TypeScript e lint.
