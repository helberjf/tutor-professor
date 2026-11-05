# Tutor and Professor — análise do produto e competitividade

Data: 5 de novembro de 2026. Repositório: `helberjf/tutor-professor`.

O produto já reúne uma base relevante: lições, questões, revisão, retomada entre dispositivos, disciplinas, simulados e planejamento por objetivos. O principal ganho agora é transformar esses recursos em uma jornada clara, com evidências de aprendizagem. Acrescentar mais telas ou mais questões geradas, isoladamente, tende a aumentar a complexidade.

Este arquivo contém dois estudos: qualidade e experiência do webapp; posicionamento e competitividade. As recomendações dos estudos **não foram implementadas**. As correções expressamente solicitadas para gramática, seletor, início, objetivos e simulados estão relacionadas ao final.

A avaliação considera o código, a navegação autenticada e as telas indicadas pelo usuário. Os testes usam contas sintéticas em ambiente local. Não há dados de retenção, receita, entrevistas ou comparação experimental de aprendizagem que permitam afirmar demanda comprovada ou superioridade pedagógica.

## Estudo 1 — qualidade e experiência do webapp

### O que já funciona como base de produto

Há persistência de estudo, retomada, banco de questões com histórico de tentativas, revisão agendada e uma sessão que reúne atividades. Objetivos têm etapas ponderadas e podem receber análises baseadas nos estudos registrados. As outras disciplinas reutilizam a estrutura de matérias e tópicos; isso permite ampliar o catálogo sem reconstruir cada jornada.

Também existem controles de conta, autorização de IA, créditos, planos e uso. Eles são fundações de operação, mas o próprio [README](../README.md) informa que o checkout pago ainda não está integrado a um provedor de pagamento. A instalação como PWA não equivale a ter todos os recursos disponíveis sem internet.

Fontes de implementação: [fila de estudo](../apps/api/services/study_queue_service.py), [priorização de questões](../apps/web/src/lib/question-queue.ts), [objetivos](../apps/web/src/components/objectives/ObjectiveCard.tsx) e [arquitetura e limites](../README.md).

### Diagnóstico da jornada

| Área | Evidência e impacto | Próxima melhoria proposta |
| --- | --- | --- |
| Início e navegação | Há início, dashboard, área de estudos, sessão, lição, quiz e revisão. As entradas são úteis, mas a diferença entre elas exige interpretação. | Uma ação principal por contexto: continuar a sessão ou executar a próxima etapa do objetivo. Manter ferramentas adicionais acessíveis em segundo plano. |
| Continuidade | O retorno de idiomas para Outras Disciplinas perdia a seleção de Programação no fluxo observado. | A correção solicitada mantém a seleção e consulta o histórico existente. Evoluir depois para retomada explícita de tópico, atividade e ponto de leitura em toda a jornada. |
| Responsividade | Nas capturas de 782 px, o conteúdo principal ocupava uma coluna estreita com grande área vazia ao lado. | A correção reorganiza o bloco inicial. Adotar verificação contínua de telas com títulos longos, tradução e zoom, incluindo menus e diálogos. |
| Hierarquia visual | Botões grandes, várias cores fortes e rótulos em caixa alta competiam entre si. O criador de simulado destoava do tema escuro. | As superfícies solicitadas foram simplificadas. Consolidar depois padrões de botão, campo, cartão e mensagem para as demais telas. |
| Objetivos | Um percentual isolado não informa o que estudar em seguida. Cumprir etapas também não prova domínio. | O dashboard solicitado passa a listar pendências e lacunas salvas. Como evolução, relacionar cada lacuna a uma atividade executável e a uma evidência de resultado. |
| Idiomas | A interface admite idioma de estudo configurável, mas ainda há contratos e instruções de geração associados a inglês. | Auditar interface, banco, voz e geração por idioma. Distinguir idioma da interface, idioma estudado e idioma das explicações. |
| Estados vazios | Gramática já tinha geração e prática, mas não era uma rota própria. Sem questões salvas, a geração depende de IA. | O acesso agora é direto e há recuperação de erro. Futuramente, oferecer uma primeira atividade curada por nível/idioma e informar requisitos da geração antes do clique. |

O seletor deve servir para mudar o contexto do estudo, com nome da disciplina legível e estado atual inequívoco. Uma lista com busca passa a fazer sentido se o uso real mostrar muitas disciplinas; trocar o controle nativo por um componente complexo antes disso acrescentaria manutenção e exigências de acessibilidade sem benefício demonstrado.

### Lição e Quiz estão repetitivos?

**Sim, há sobreposição relevante de conteúdo e formato. Não são telas idênticas, mas a distinção pedagógica é pequena em parte do fluxo.**

| Fluxo | Comportamento no código | Efeito provável |
| --- | --- | --- |
| Lição | Apresenta a frase, oferece áudio e trabalha com escolha de tradução. Mostra significado, exemplo e explicações; também pode exibir questões associadas à lição. | É adequado para apresentação guiada, mas já ocupa parte do papel de avaliação. |
| Quiz | Carrega o quiz da lição selecionada/atual, apresenta alternativas e acumula respostas para o resultado final. | A mudança mais clara é a organização da tentativa e da pontuação, não necessariamente uma habilidade diferente. |
| Quiz criado com uma lição gerada | `build_generated_quiz_questions` produz perguntas como “Como se diz ...?”, usando os mesmos itens da lição em sentido inverso. | Reconhecer novamente as mesmas frases pode medir familiaridade imediata mais do que aplicação em um contexto novo. |
| Revisão e sessão | Existem agendamento, priorização e histórico separados. A fila de questões considera tentativas e domínio. | O produto já possui mecanismos para repetição útil; falta deixar essa função mais clara e conectada ao restante. |

Fontes: [Lição](../apps/web/src/app/lesson/page.tsx), [Quiz](../apps/web/src/app/quiz/page.tsx), funções `build_generated_quiz_questions`, `build_quiz_from_lesson_content` e `get_today_quiz` em [main.py](../apps/api/main.py), além do [serviço de conteúdo](../apps/api/services/content_service.py).

O endpoint do quiz prioriza `quiz_questions` armazenadas no conteúdo da lição e depois usa o banco estático. Reabrir a mesma lição tende a recuperar esse mesmo banco. Embaralhar alternativas muda sua posição, mas não muda a tarefa cognitiva. Isso sustenta o diagnóstico de repetição; não permite concluir que todas as lições ou todos os quizzes sejam duplicados.

Repetir pode ser produtivo quando existe intervalo, recuperação ativa, dificuldade adequada ou aplicação em outro contexto. Repetir imediatamente a mesma tradução com alternativas semelhantes oferece menos informação sobre aprendizado duradouro. A hipótese de fadiga deve ser confirmada com comportamento e entrevistas, sem tratar uma impressão de interface como resultado medido.

### Proposta para diferenciar as atividades

| Atividade | Papel principal | Exemplo proposto |
| --- | --- | --- |
| Lição | Entender um conceito com ajuda e exemplos. | Apresentar o presente simples, comparar dois exemplos e resolver uma etapa guiada. |
| Prática, evolução do Quiz | Recuperar e aplicar com menos ajuda. | Completar uma frase inédita, corrigir um erro ou produzir uma resposta curta. |
| Gramática | Trabalhar uma estrutura e os erros associados. | Escolher a forma correta e explicar a regra usando uma situação diferente da lição. |
| Revisão | Recuperar o que está vencendo ou foi esquecido. | Trazer um conceito anterior conforme histórico e desempenho. |
| Simulado | Medir desempenho sob condições declaradas. | Tempo, distribuição por competência e relatório de lacunas; explicações após a tentativa. |

Exemplo: depois de estudar “She works remotely”, a prática pode pedir a correção de “He work on Mondays”. Uma revisão posterior pode perguntar sobre uma pessoa diferente sem mostrar alternativas. O simulado pode incluir uma conversa curta em que a estrutura seja necessária. É a transferência do conceito que muda, não apenas a ordem dos botões.

Antes de gerar muito mais conteúdo, catalogar cada exercício por competência, dificuldade, origem e formato. Medir repetição pelo conceito e pelo enunciado, distinguindo revisão programada de duplicação acidental. Oferecer uma explicação curta sobre por que uma questão voltou. Não eliminar a revisão só para aumentar a sensação de novidade.

### Qualidade, confiança e operação

1. **Pontuação verificável no servidor.** `submit_quiz`, em [main.py](../apps/api/main.py), recebe `score` e `total_questions` do cliente e os registra. Para que notas sustentem relatórios confiáveis, o servidor deve conferir as respostas contra o banco autorizado. Esta constatação é de leitura de código; não foi feito teste de exploração em produção.
2. **Escopo dos distratores.** `build_generated_quiz_questions` consulta `LessonItem` sem filtro de idioma ou propriedade nessa consulta. Revisar quais itens podem entrar como alternativas e testar isolamento e adequação linguística. A leitura aponta um ponto de auditoria, não comprova exposição de conteúdo privado.
3. **Gramática no idioma correto.** O [serviço de questões](../apps/api/services/study_question_service.py) mantém instruções de aluno de inglês para a área `english`. Isso merece correção específica antes de prometer gramática consistente em todos os idiomas. A chave estável do banco pode continuar antiga; a instrução enviada ao gerador deve refletir o idioma real.
4. **Primeiro uso sem geração.** `_offline_bank_applies`, em `main.py`, exclui explicitamente `grammar:` do banco determinístico. A gramática existente depende de questões já salvas ou de geração por IA. Um banco inicial revisado reduziria abandono e custo, sem apresentar perguntas de tradução como se fossem gramática.
5. **Progresso com significado.** Exibir separadamente cumprimento do plano, estimativa da análise e desempenho observado. Uma lista concluída não deve se transformar automaticamente em promessa de fluência ou aprovação.
6. **Manutenção e observabilidade.** Extrair gradualmente responsabilidades do arquivo central da API; medir tempo até a primeira atividade, falhas de geração e custo por sessão. Preservar os testes de isolamento e não registrar respostas privadas ou credenciais nos eventos analíticos.
7. **Consistência e acessibilidade.** Revisar foco por teclado, nomes acessíveis, contraste nos dois temas, textos longos e navegação com zoom. Padronizar tradução de mensagens de erro e estados de carregamento.

### Prioridades propostas

| Prioridade | Trabalho futuro | Critério de aceite sugerido |
| --- | --- | --- |
| P1 | Separar Lição, Prática e Revisão na experiência. | Usuários explicam a função de cada uma e iniciam a próxima tarefa sem ajuda. |
| P1 | Auditar correção de notas, idioma da geração e escopo de distratores. | Testes rejeitam nota adulterada, conteúdo fora do escopo e geração no idioma incorreto. |
| P1 | Vincular lacunas dos objetivos a atividades e evidências. | Cada recomendação tem uma ação disponível e um critério de conclusão verificável. |
| P2 | Criar um banco inicial curado no segmento escolhido. | Uma pessoa nova conclui a primeira experiência útil sem depender de geração externa. |
| P2 | Medir repetição e aprendizagem posterior. | Relatório distingue repetição intencional, item duplicado e aplicação em questão inédita. |
| P2 | Consolidar componentes visuais e linguagem. | Os fluxos principais usam os mesmos padrões de interação e recuperação de erro. |
| P3 | Ampliar integrações e distribuição. | A ampliação responde a demanda observada e tem custo operacional conhecido. |

## Estudo 2 — posicionamento e competitividade

### O mercado já oferece as peças isoladas

A comparação abaixo usa páginas oficiais consultadas em 5 de novembro de 2026. Elas comprovam recursos anunciados, não eficácia comparativa. Disponibilidade pode variar por plano, país e implantação; não foi feita compra ou avaliação completa dos concorrentes.

| Referência | Recurso documentado | Implicação para Tutor and Professor |
| --- | --- | --- |
| [Duolingo](https://blog.duolingo.com/covering-all-the-bases-duolingos-approach-to-speaking-skills/) | Exercícios de fala, tradução oral, diálogos e conversação. | Múltipla escolha e variedade superficial de conteúdo são diferenciais fracos. A prática precisa demonstrar uso do conhecimento. |
| [Quizlet](https://help.quizlet.com/hc/en-ca/articles/48324742264077-Studying-with-Spaced-Repetition) | Revisão de flashcards com agendamento baseado na recordação, documentada para a web. | Ter flashcards e repetição espaçada já é uma expectativa competitiva. O valor pode estar em ligar cada revisão a um objetivo real. |
| [Anki](https://apps.ankiweb.net/) | Revisão agendada, sincronização, suporte a mídia e personalização. | O produto precisa oferecer conveniência e orientação suficientes para justificar a troca de um sistema já flexível. |
| [Khanmigo](https://www.khanmigo.ai/) | Tutoria que orienta o raciocínio e integração com conteúdo da Khan Academy. A página limita a oferta individual para alunos/responsáveis aos EUA. | Um tutor genérico de IA é fácil de comparar. Conteúdo confiável, recorte de público e acompanhamento são mais defensáveis; a disponibilidade regional não é equivalente. |
| [ELSA Speak](https://blog.elsaspeak.com/en/discover-the-new-elsa-speak-experience/) | Plano por nível e objetivo, situações de conversação e retorno sobre a prática. | “Personalizado por IA” já é uma promessa comum. É preciso mostrar o que mudou para o aluno depois da atividade. |

### Público inicial recomendado

Como hipótese de posicionamento, priorizar **adultos brasileiros que estudam tecnologia com um objetivo profissional definido**, começando por uma única trilha, por exemplo preparação para uma certificação. O produto já combina matérias técnicas, simulados, objetivos e idiomas, o que permite testar essa proposta sem iniciar uma plataforma inteiramente nova.

Inglês para entrevista técnica pode ser uma expansão adjacente depois que a trilha inicial apresentar resultados. Atender desde o início crianças, estudantes escolares, todas as certificações e todos os idiomas exige catálogos, supervisão e distribuição muito diferentes.

A promessa a validar seria: **“Saiba o que falta para seu objetivo e faça a próxima prática com base no que você já demonstrou.”** Ela aproveita o diferencial potencial de continuidade e planejamento, mas exige avaliações confiáveis e indicações acionáveis. O produto ainda não deve prometer probabilidade de aprovação sem dados de calibração.

### Diferenciais que poderiam sustentar uma escolha

- **Plano ligado a evidências:** cada competência relaciona diagnóstico, prática, revisão e avaliação posterior. O usuário entende por que determinada atividade foi recomendada.
- **Material próprio com referência:** transformar um material autorizado em estudo, preservando a ligação entre explicação e fonte. A IA deve admitir quando a fonte não sustenta uma resposta.
- **Transferência e correção útil:** situações novas, justificativa dos erros e intervenção na dificuldade observada, em vez de apenas gerar mais perguntas.
- **Continuidade simples:** retomar a mesma tarefa em outro dispositivo, com progresso compreensível e pouca configuração inicial. Parte dessa infraestrutura já existe.
- **Experiência em português bem resolvida:** instruções, exemplos, cobrança e suporte adequados ao público escolhido. A tradução da interface é apenas uma parte dessa experiência.

O que pode se tornar difícil de copiar é um conjunto de competências bem organizado, conteúdo revisado, avaliações consistentes e resultados observados ao longo do tempo. O número de telas e o acesso ao mesmo modelo de IA usado por outros produtos oferecem pouca proteção competitiva.

### Modelo comercial a testar

Propor uma experiência inicial que permita concluir um pequeno ciclo de aprendizagem, incluindo diagnóstico e resultado. Um plano pago pode ampliar trilhas, acompanhamento e geração, com limites de uso compreensíveis. Evitar vender uma quantidade abstrata de créditos como benefício principal.

Preço ainda precisa de validação. Não há base nesta análise para recomendar um valor específico ou prever faturamento. Estimar a margem por aluno considerando receita líquida, inferência, áudio, armazenamento, meios de pagamento e suporte; observar uso mediano e uso intenso, não somente a média.

Para aquisição, testar uma trilha demonstrável com comunidades técnicas, criadores ou instrutores do segmento, sempre com autorização para materiais e comunicação. Vendas para empresas e escolas podem vir depois, pois exigem implantação, suporte e relatórios próprios. O cadastro com aprovação manual atual pode servir a um piloto assistido; seria uma fricção a avaliar antes de aquisição aberta em escala.

### Plano de validação proposto

Os números abaixo são sugestões de desenho de pesquisa, não usuários existentes nem metas já comprovadas.

| Etapa | Experimento | Decisão que deve permitir |
| --- | --- | --- |
| Descoberta | Entrevistar 8–12 pessoas do segmento sobre estudo atual, dificuldade, alternativa usada e gasto real. | Identificar um problema recorrente e escolher uma única trilha inicial. |
| Usabilidade | Observar 5–8 pessoas fazendo primeiro acesso, retomada, uma prática e leitura do progresso. | Remover ambiguidades antes de avaliar retenção. |
| Piloto | Acompanhar 20–30 participantes por quatro semanas, com diagnóstico e avaliação posterior de dificuldade comparável. | Verificar uso recorrente e sinais de aprendizagem, reconhecendo viés de seleção e tamanho limitado. |
| Pagamento | Apresentar uma oferta concreta aos participantes, com preço e limites claros. | Medir escolha real e objeções; intenção declarada não equivale a compra. |

Definir critérios de continuidade antes do piloto. Comparar questões inéditas de competências equivalentes, controlando exposição e dificuldade. Um grupo pequeno fornece sinais para decidir o próximo teste; não sustenta alegações amplas de eficácia.

### Métricas para acompanhar

| Métrica | Definição proposta | Uso |
| --- | --- | --- |
| Ativação | Proporção de novos usuários que escolhe um objetivo, termina a primeira prática e entende o próximo passo. | Avaliar valor inicial, não apenas cadastro. |
| Tempo até valor | Tempo do primeiro acesso até a primeira atividade concluída com retorno útil. | Identificar configuração e espera excessivas. |
| Retenção de estudo | Retorno com atividade concluída em D7 e D28, por coorte de entrada. | Distinguir acesso casual de uso recorrente. |
| Aprendizagem posterior | Desempenho em itens inéditos equivalentes após um intervalo definido. | Separar memorização imediata de retenção e aplicação. |
| Repetição não intencional | Sessões com item repetido sem justificativa de revisão ou erro. | Investigar a sensação de Quiz repetitivo. |
| Confiança | Questões contestadas, erros confirmados e tempo de correção. | Medir qualidade editorial. |
| Economia por aluno | Receita líquida e custos variáveis por usuário ativo, inclusive uso intenso. | Sustentar preço e limites de geração. |

### Sequência sugerida para os próximos 90 dias

**Dias 1–30:** escolher o segmento, entrevistar pessoas, resolver os riscos de avaliação e idioma, definir eventos de produto e prototipar a separação entre Lição e Prática.

**Dias 31–60:** oferecer uma trilha curada pequena, ligar lacunas a atividades e conduzir o piloto com observação de uso. Aproveitar fila, objetivos e revisão existentes.

**Dias 61–90:** avaliar aprendizagem posterior, retenção e custo, testar uma oferta paga e decidir se vale aprofundar a trilha, ajustar o público ou interromper a expansão. Não abrir muitos segmentos antes dessa decisão.

## Correções solicitadas nesta entrega

Estas mudanças atendem aos pedidos anteriores e são separadas das recomendações futuras dos dois estudos:

- Rota autenticada `/grammar`, reutilizando a funcionalidade existente; atalho direto, tratamento de erro e orientação quando ainda não há lições. Links antigos preservam a seção depois do login.
- Sessão de questões mantém a questão atual e sua explicação enquanto a resposta é salva. A atualização da fila deixa de trocar a pergunta antes do clique em Próxima questão.
- Outras Disciplinas mantém a seleção ao alternar abas e consulta o histórico de matérias quando precisa restaurar o contexto.
- Seletor de disciplinas com hierarquia visual, ícone, indicação de carregamento e ação de criação mais clara.
- Bloco inicial e acessos a idiomas/estudos reorganizados para usar a largura disponível.
- Dashboard mostra etapas pendentes e lacunas/próximos passos de análises já salvas em Objetivos, com indicação de análise desatualizada ou evidência insuficiente. Abrir o dashboard não dispara uma nova análise por IA.
- Criador de simulado usa superfície compatível com o tema e campos adaptáveis à largura.

Cobertura de regressão: [gramática](../apps/web/e2e/learning/grammar.spec.ts), [seleção de disciplina](../apps/web/e2e/subjects/discipline-selection.spec.ts), [objetivos no dashboard](../apps/web/e2e/objectives/dashboard.spec.ts) e [layouts](../apps/web/e2e/navigation/requested-layout.spec.ts). Os testes usam API local e dados sintéticos; a qualidade da geração ao vivo por provedores de IA não é avaliada por esses testes.

Validação local desta entrega: 13 cenários de navegador aprovados; 56 scripts de frontend aprovados, com os dois scripts ajustados reexecutados após a correção; lint, TypeScript e compilação de produção aprovados; testes de API para questões, última disciplina e objetivos aprovados. Foram inspecionadas capturas em 390, 782 e 1440 px, com o criador de simulado preenchido e os temas claro e escuro. Isso cobre os fluxos alterados, sem representar uma auditoria completa de acessibilidade, segurança ou de todos os navegadores.
