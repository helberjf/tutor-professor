# Seleção de tópicos e formulário dos objetivos

## Pedido

Ao escolher uma matéria no filtro, selecionar automaticamente seus tópicos. Oferecer seleção em lote, corrigir o contraste e a distribuição dos campos mostrados nas capturas, remover o campo de peso e verificar com agent-browser. Estes comportamentos foram solicitados diretamente pelo usuário.

## Comportamento

- Escolher uma matéria substitui a seleção pelos tópicos disponíveis daquela matéria e limpa a busca. Escolher todas as matérias seleciona os tópicos disponíveis da disciplina. Trocar de disciplina inicia uma seleção vazia.
- Buscar tópicos apenas filtra a lista. Selecionar todos adiciona os resultados disponíveis da busca à seleção; limpar seleção desmarca os vínculos. Cada tópico continua podendo ser desmarcado individualmente.
- Respeitar os 30 vínculos aceitos pela API. Caso uma seleção em lote ultrapasse esse limite, mostrar explicitamente quantos foram selecionados e o limite; nenhum vínculo indisponível entra na seleção.
- Usar as cores semânticas já existentes para fundo, texto, bordas, seleção e hover nos temas claro e escuro. O modal usa uma superfície opaca, controles com altura adequada e lista de tópicos rolável.
- O texto da tarefa ocupa uma linha inteira; a área e o botão adicionar ocupam a linha seguinte. O peso deixa de ser um campo e novos itens manuais usam o padrão da API (1). Remover sua exibição nos cartões e na revisão do plano. Os registros existentes continuam sendo lidos pela API atual.

## Validação

Testar seleção por matéria, seleção em lote com busca, deduplicação, indisponíveis e limite. Executar testes existentes, TypeScript, lint e build. Com agent-browser em dados locais isolados, verificar criação, inclusão de tarefas, edição de vínculos, contraste de hover e ausência de overflow em desktop e celular, nos temas claro e escuro. Publicar na main conforme autorização persistente desta conversa.
