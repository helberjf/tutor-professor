# Objetivos ligados a disciplinas e tópicos

Status: aprovada pelo usuário em 2026-10-09; implementada e verificada por testes automatizados e revisão independente.

## Intenção

Permitir que a pessoa descreva um objetivo, escolha uma disciplina e um ou mais tópicos e receba uma análise da IA sobre quanto falta para alcançá-lo, considerando os estudos já registrados nesse escopo. A expressão “quanto feita” do pedido foi interpretada como “quanto falta”.

Exemplo: objetivo “Resolver exercícios de derivadas”, disciplina Matemática, tópicos Limites e Derivadas. A análise identifica o que já foi estudado, as dificuldades demonstradas nas respostas e quais conhecimentos e práticas ainda são necessários.

## Alternativas

1. **Análise dentro do objetivo — recomendada.** Vincula o objetivo ao conteúdo escolhido, salva a última avaliação e permite atualizar a análise após novos estudos. Atende diretamente ao pedido e reaproveita o provedor de IA existente.
2. **Ampliar somente o Criar plano.** Reaproveita o assistente de planos, mas exige criar um plano para acompanhar um único objetivo e não resolve o vínculo dos objetivos existentes.
3. **Medir apenas tópicos concluídos.** Produz uma porcentagem determinística, mas não avalia se o estudo registrado prepara a pessoa para o resultado descrito no objetivo.

## Experiência proposta

- O formulário de objetivo recebe uma seleção de disciplina e uma seleção múltipla de tópicos. Quando necessário, a matéria serve de filtro para encontrar os tópicos dentro da disciplina.
- As opções reúnem o currículo e o Controle de estudos do perfil atual. Tópicos do currículo mantêm seus identificadores; assuntos disponíveis somente no histórico aparecem identificados como assuntos do Controle de estudos.
- O vínculo é opcional, preservando a criação de objetivos livres. Um objetivo com escopo de estudo precisa de pelo menos um tópico ou assunto selecionado para solicitar a análise.
- No momento da criação, “Analisar com IA após criar” fica selecionado quando existe escopo válido e a IA está disponível. O objetivo é salvo antes da análise: uma falha do provedor não elimina o objetivo e não exige criá-lo novamente.
- O cartão mostra a disciplina, os tópicos ou assuntos selecionados e permite editar esse vínculo nos objetivos existentes.
- “Analisar objetivo” ou “Atualizar análise” consulta os dados atuais e mostra a última avaliação salva. Abrir a página ou registrar um estudo não inicia chamadas de IA por si só.
- A avaliação contém alcance estimado, o que já foi estudado, lacunas, próximos passos em ordem de prioridade, confiança da avaliação e data da análise.
- A estimativa aparece com o rótulo “Estimativa da IA”, separada do progresso da lista de tarefas existente. A explicação da IA deve relacionar a estimativa às evidências disponíveis.
- Quando faltam evidências, mostrar “Dados insuficientes para estimar” e quais registros ou exercícios ajudariam a avaliar o objetivo. Não apresentar um 0% inventado, nem prometer uma quantidade exata de horas ou uma data de conclusão.
- Alterar o objetivo ou seu vínculo torna a avaliação anterior desatualizada. Uma nova análise substitui a avaliação corrente somente depois de uma resposta válida.

## Evidências e regras da análise

O backend seleciona apenas dados do perfil atual e relacionados à disciplina e aos tópicos escolhidos. O contexto combina, quando disponíveis:

- Estados dos tópicos, anotações e resumos do currículo.
- Entradas do Controle de estudos, incluindo conteúdo, resumos e resultados de revisão.
- Tentativas e acertos de questões e revisões de flashcards vinculados aos tópicos.

Conteúdo gerado ou cadastrado sem atividade de estudo é descrito como material disponível, não como conhecimento adquirido. Um tópico marcado como estudado é evidência de contato com o conteúdo, não prova automática de domínio. Horas registradas ajudam a contextualizar a prática e não comprovam aprendizagem.

O prompt contém o texto do objetivo e o escopo escolhido. A IA identifica conhecimentos necessários, compara esses requisitos às evidências recebidas e indica as lacunas. Estudos de outra disciplina ou de tópicos fora da seleção não contribuem para o diagnóstico.

O contexto usa identificadores para vínculos com o currículo e rótulos normalizados para assuntos somente do histórico. Não atribuir automaticamente uma anotação geral de uma matéria a um tópico específico: quando o vínculo é incerto, identificá-la como contexto geral, sem usá-la como prova de domínio daquele tópico. Evitar duplicar como dois estudos o registro automático e o tópico de origem.

O contexto tem limites de tamanho e informa quando usa uma amostra. A confiança e a explicação consideram essas limitações. A análise retorna uma porcentagem de 0 a 100 ou null quando não há base suficiente para estimar; uma estimativa de 100% não conclui tarefas nem concede o selo de objetivo conquistado.

## Organização técnica

- Estender os contratos de criação, edição e leitura de objetivos com um escopo de estudo opcional e a última análise.
- Persistir o escopo com identificadores e rótulos necessários para leitura. Preservar a última análise com o texto do objetivo e o escopo utilizados, resultados estruturados, referências às evidências e data.
- Disponibilizar opções de disciplina e tópicos pelo backend, usando os mesmos critérios de propriedade e módulos ativos do Controle de estudos e do currículo.
- Criar um serviço específico de análise de objetivos: seleção das evidências, montagem do contexto e validação do resultado. Reaproveitar a camada de provedor de IA e as regras de acesso, créditos, idioma e faixa etária existentes.
- Acrescentar um endpoint autenticado para analisar um objetivo salvo. Encerrar a transação de leitura antes de chamar o provedor e verificar novamente a propriedade e o escopo antes de persistir o resultado. Recusar uma resposta referente a um objetivo alterado durante a chamada.
- Adicionar a migração pelo fluxo Alembic e bootstrap existente. Objetivos antigos recebem escopo e análise vazios.
- Separar os componentes de seleção do escopo e apresentação da análise para não concentrar toda a lógica no formulário e no cartão existentes.

## Falhas e compatibilidade

- Sem IA disponível, a pessoa continua podendo salvar e editar o objetivo; a interface informa o motivo da indisponibilidade da análise usando o fluxo existente.
- Resposta inválida, falha do provedor ou conflito com edição concorrente não substituem a última análise válida.
- Vínculos com conteúdo excluído devem continuar legíveis pelos rótulos salvos, indicar a indisponibilidade e exigir revisão da seleção antes de nova análise.
- Renomear uma disciplina, matéria ou tópico não deve perder um vínculo identificado por ID. Rótulos somente do histórico precisam acompanhar o fluxo existente de renomeação para manter a seleção válida.
- As tarefas, os planos e a conclusão automática por área continuam com seu cálculo atual. A IA não marca tarefas como concluídas.

## Verificação prevista

- Filtragem por perfil, disciplina e múltiplos tópicos; rejeição de identificadores de outro perfil e incompatíveis com a disciplina.
- Distinção entre material disponível, conteúdo estudado e desempenho demonstrado; eliminação de evidências duplicadas.
- Objetivo sem histórico, histórico parcial, ausência de IA, resposta inválida e contexto limitado.
- Criação com análise opcional, edição do vínculo, atualização da análise, persistência e indicação de avaliação desatualizada.
- Edição ou exclusão concorrente durante a chamada do provedor não persiste uma avaliação incompatível.
- Migração de banco existente e regressão dos objetivos e planos atuais.
- Verificação de tipos do frontend e conferência do fluxo no celular e no desktop.

## Limite desta entrega

Esta evolução cria o vínculo e o diagnóstico do objetivo. Não cria automaticamente cursos, novas questões ou tarefas a partir da análise; os próximos passos são recomendações apresentadas no próprio objetivo.

## Resultado da verificação

Os testes de API, evidências, créditos, concorrência, migração, regressão dos objetivos e planos, renderização dos componentes, TypeScript e lint passaram. O navegador integrado não conseguiu anexar a visualização; a conferência visual em desktop e celular ficou pendente. Foram usados SQLite e provedor determinístico, sem chamada a um provedor real ou banco PostgreSQL.
