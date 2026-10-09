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

## Análise de IA — complemento solicitado pelo usuário

O usuário acrescentou que a IA deve ler todo o estudo relevante da disciplina e matéria, estimar a porcentagem e o que falta, apontar melhorias e traçar um plano. A implementação existente já retorna estimativa, lacunas e próximos passos, mas amostra o histórico; corrigir essa cobertura.

- Considerar todo o histórico pertencente ao perfil e ao escopo escolhido, incluindo textos completos e resultados de questões e revisões. Nenhum estudo de outra disciplina, matéria ou tópico individual não selecionado entra como evidência.
- Processar históricos longos em lotes e consolidar os diagnósticos antes de gerar a avaliação final. O limite por chamada protege o provedor; não equivale a descartar registros. Se a revisão completa falhar, preservar a análise anterior e mostrar o erro.
- Notas gerais da matéria são evidência de estudo quando todos os seus tópicos estão selecionados, sem afirmar domínio de um tópico específico. Com apenas alguns tópicos, servem como contexto, conforme o comportamento existente.
- Apresentar a porcentagem como estimativa, o que já foi estudado, o que falta melhorar e um plano ordenado de ações concretas com critérios de conclusão. Na ausência de evidência, explicar que ainda não é possível estimar uma porcentagem.
- Preservar a cobrança e os controles de concorrência da operação de análise. Verificar cobertura com um registro antigo e um trecho após o corte anterior, além de isolamento, falhas do provedor e persistência.

## Ajuste solicitado depois da publicação

O usuário ampliou o máximo para 60 tópicos e pediu a retirada do bloco de tarefas manuais porque o diagnóstico deve usar os estudos já registrados. Este ajuste substitui o limite de 30 e o formulário manual descritos acima.

- Aceitar até 60 vínculos no seletor, validação do cliente, schema da API e resolução do escopo; o 61º continua bloqueado, sem alterar os vínculos salvos. Atualizar avisos e traduções.
- Remover os campos de tarefas da criação e de adição nos cartões. Novos objetivos enviam apenas o objetivo e seus vínculos, sem itens manuais. Cartões sem itens exibem a análise de estudo diretamente, sem uma barra vazia pedindo tarefas.
- Itens existentes e prioridades dos planos continuam legíveis; nenhum registro é apagado. A análise continua usando as evidências de estudo do escopo, sem ler checklists como prova de aprendizagem.
- A média geral de tarefas considera somente objetivos ativos com itens; objetivos acompanhados pelo histórico de estudos não reduzem essa média nem exibem uma barra de checklist vazia.
- Verificar os limites 31/60/61 na seleção e no salvamento por HTTP, a ausência dos campos removidos e o fluxo com agent-browser antes de publicar frontend e API na main.
