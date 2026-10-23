# 17. AppSync, Amplify e padrões de arquitetura de aplicações

## Mapa da aula
Esta aula fecha o domínio de desenvolvimento com três assuntos que aparecem em alternativas e cenários:

• padrões de arquitetura do guia da prova: monolito e microsserviços, síncrono e assíncrono, acoplamento, estado, circuit breaker;
• AWS AppSync: APIs GraphQL gerenciadas, resolvers, fontes de dados, assinaturas em tempo real e modos de autorização;
• AWS Amplify: hospedagem com CI/CD para front-ends, backend definido em código e bibliotecas cliente;
• serviços de dados que aparecem como alternativas: Athena e OpenSearch.

## Monolito e microsserviços
Monolito: a aplicação inteira é implantada como uma unidade. Simples no começo, mas uma mudança pequena exige reimplantar tudo, e uma parte sobrecarregada obriga a escalar o conjunto.

Microsserviços: a aplicação é dividida em serviços pequenos, cada um com sua responsabilidade, seus dados e sua implantação independente. Eles se comunicam por APIs (síncrono) ou eventos (assíncrono).

Vantagens dos microsserviços: equipes independentes, escala por serviço e falhas isoladas. Custos: mais peças para operar, consistência entre serviços mais difícil e necessidade de observabilidade distribuída (aula 32).

Na AWS, um microsserviço típico é API Gateway + Lambda + DynamoDB, ou um serviço ECS atrás de um load balancer, cada um com seu banco.

## Síncrono ou assíncrono
Comunicação síncrona: quem chama espera a resposta (HTTP, invocação RequestResponse). Simples de entender, mas acopla os tempos: se o serviço chamado está lento ou fora, o chamador também fica.

Comunicação assíncrona: quem chama entrega a mensagem a uma fila, tópico ou barramento e segue. O consumidor processa depois.

Use assíncrono quando:
• o trabalho é demorado (gerar relatório, processar vídeo);
• o chamador não precisa do resultado na hora;
• é preciso absorver picos (a fila amortece);
• vários sistemas reagem ao mesmo fato.

Padrão comum para trabalhos longos via API: responder 202 com um id, colocar o trabalho em uma fila ou iniciar uma máquina de estados, e o cliente consulta o status ou recebe uma notificação.

## Acoplamento e estado
Fortemente acoplado: um componente depende diretamente da disponibilidade, do formato e do tempo de resposta do outro. Uma falha se propaga.

Fracamente acoplado: os componentes se comunicam por contratos estáveis e intermediários (filas, eventos), e podem mudar, escalar e falhar de forma independente. É o que a prova quase sempre quer.

Stateless: a instância não guarda estado entre requisições; qualquer instância atende qualquer requisição. Permite escalar horizontalmente e substituir instâncias sem perda.

Stateful: a instância guarda estado (sessão em memória, arquivos locais). Dificulta escalar e recuperar.

Em Lambda, contêineres e Auto Scaling, guarde o estado fora da computação: DynamoDB, ElastiCache, S3 ou RDS.

## Resiliência: circuit breaker, timeouts e degradação
Padrões para chamar dependências que podem falhar:

• Timeouts: toda chamada de rede precisa de um limite; esperar para sempre prende recursos.
• Retries com backoff exponencial e jitter, só para erros transitórios e só em operações idempotentes (aula 02).
• Circuit breaker: depois de muitas falhas seguidas, o cliente "abre o circuito" e para de chamar a dependência por um tempo, respondendo rápido com erro ou valor alternativo. Depois, testa algumas chamadas ("meio aberto") e volta ao normal se derem certo. Evita que uma dependência lenta esgote as conexões e a concorrência do chamador.
• Degradação controlada (fallback): mostrar dados do cache ou uma versão simplificada da página quando um serviço secundário falha.
• Bulkhead: separar recursos (pools de conexão, concorrência reservada da Lambda) para que um serviço com problema não consuma tudo.

Exemplo: o serviço de recomendações está lento; o circuit breaker abre e a página de produto aparece sem recomendações, em vez de ficar travada.

## AWS AppSync: GraphQL gerenciado
O AWS AppSync cria APIs GraphQL gerenciadas. Em GraphQL, o cliente pede exatamente os campos de que precisa, em uma única requisição, mesmo que os dados venham de fontes diferentes.

Peças:
• Schema: define tipos, queries (leitura), mutations (escrita) e subscriptions (tempo real).
• Resolvers: ligam cada campo a uma fonte de dados. Podem ser escritos em JavaScript (ou VTL). Resolvers pipeline encadeiam várias funções em sequência.
• Fontes de dados (data sources): DynamoDB, Lambda, endpoints HTTP, Aurora (Data API), OpenSearch, EventBridge e "none" (local).

Subscriptions: clientes conectados por WebSocket recebem automaticamente os dados quando uma mutation acontece. É a resposta para "atualizar painéis ou chats em tempo real com GraphQL".

AppSync também tem cache no lado do servidor, merged APIs (juntar várias APIs em um endpoint) e o AppSync Events, para pub/sub em tempo real por WebSocket sem GraphQL.

## AppSync: autorização e quando escolher
Modos de autorização, que podem ser combinados na mesma API:
• API key: para desenvolvimento ou dados públicos; tem validade.
• IAM: chamadas assinadas com SigV4 (por exemplo, com credenciais de um Cognito identity pool).
• Cognito user pools: usuários autenticados com JWT; pode restringir por grupo com diretivas no schema.
• OpenID Connect: provedores OIDC externos.
• Lambda: lógica customizada.

AppSync ou API Gateway?
• AppSync: front-ends web e mobile que precisam combinar dados de várias fontes em uma consulta, buscar só os campos necessários, receber atualizações em tempo real ou trabalhar offline com sincronização (com Amplify).
• API Gateway: APIs REST/HTTP tradicionais, integrações com serviços AWS, usage plans e API keys por cliente.

## AWS Amplify
O AWS Amplify é um conjunto de ferramentas para desenvolvedores front-end e mobile:

• Amplify Hosting: hospeda aplicações web (SPA e SSR, como React, Next.js, Angular) com CI/CD integrado ao Git. Cada push em uma branch gera build e implantação; pode criar ambientes de pré-visualização para pull requests, usar domínio próprio com HTTPS e proteger ambientes com senha.
• Backend definido em código (Amplify Gen 2): você descreve em TypeScript autenticação (Cognito), dados (AppSync + DynamoDB), armazenamento (S3) e funções (Lambda). A ferramenta usa o AWS CDK para criar os recursos. Cada desenvolvedor pode ter um sandbox próprio na nuvem.
• Bibliotecas cliente (JavaScript, iOS, Android, Flutter, React Native): login com Cognito, upload no S3 e chamadas ao AppSync ou ao API Gateway com poucas linhas.

Na prova: "hospedar um front-end React com implantação a cada commit e ambientes por branch, com o menor esforço" → Amplify Hosting. "Aplicação mobile com login, armazenamento de fotos e dados sincronizados" → Amplify com Cognito, S3 e AppSync.

## Athena e OpenSearch nas alternativas
Dois serviços de dados aparecem com frequência como alternativas:

• Amazon Athena: consultas SQL serverless direto sobre arquivos no S3 (CSV, JSON, Parquet), pagando pelos dados lidos. Usos: analisar logs do ALB, do CloudTrail ou do CloudFront guardados no S3, sem carregar em banco. Particionar e usar Parquet reduz custo e tempo.
• Amazon OpenSearch Service: busca de texto completo, com relevância, filtros e agregações, e análise de logs com painéis. Usos: busca de produtos por palavras, autocompletar, pesquisar logs. DynamoDB pode alimentar o OpenSearch por integração zero-ETL ou por Streams.

Regra prática: "consultar logs no S3 com SQL, sem servidor" → Athena. "Busca por palavras ou texto livre" → OpenSearch. Consultas por chave em alta escala → DynamoDB.

## Pegadinhas frequentes
• Microsserviços não significam "uma Lambda por função do código": significam fronteiras de responsabilidade e dados.
• Assíncrono não elimina erros: ainda é preciso DLQ, retries e idempotência.
• Circuit breaker evita chamar uma dependência que está falhando; retry insiste nela. Use os dois com critério.
• AppSync subscriptions usam WebSocket; para REST em tempo real, a alternativa é a WebSocket API do API Gateway.
• Amplify Hosting é para front-ends; backends de contêiner pesados vão para ECS ou App Runner.
• Athena lê dados no S3; não é banco transacional.

## Resumo para revisão
• Monolito vs. microsserviços: implantação única vs. serviços independentes com dados próprios.
• Assíncrono para trabalho longo, picos e vários consumidores; padrão 202 + status.
• Prefira fracamente acoplado e stateless; estado em DynamoDB, ElastiCache, S3 ou RDS.
• Resiliência: timeouts, retries com backoff, circuit breaker, fallback e bulkhead.
• AppSync: GraphQL gerenciado, resolvers JS/VTL, fontes DynamoDB/Lambda/HTTP/Aurora/OpenSearch, subscriptions em tempo real, autorização por API key, IAM, Cognito, OIDC e Lambda.
• Amplify: Hosting com CI/CD por branch, backend em código (Gen 2, sobre CDK) e bibliotecas cliente.
• Athena: SQL sobre o S3. OpenSearch: busca de texto e análise de logs.

## Questões

Q: Uma API recebe pedidos de geração de relatórios que levam de 5 a 20 minutos. Os clientes recebem timeouts. Qual desenho resolve?
- Aumentar o timeout da integração do API Gateway para 20 minutos.
- Usar uma Lambda com 10.240 MB de memória para terminar em menos de 29 segundos.
+ Responder logo com um id, enviar o trabalho a uma fila ou máquina de estados e oferecer consulta de status.
- Trocar a REST API por uma HTTP API.
E: O padrão assíncrono desacopla a resposta HTTP do trabalho longo. O API Gateway não aceita esperar 20 minutos, mais memória não garante a redução de tempo necessária, e a HTTP API também tem limite de 30 segundos.

Q: Um serviço de recomendações fica lento em alguns horários, e as páginas de produto, que o chamam de forma síncrona, ficam travadas até dar timeout. A equipe quer que as páginas continuem rápidas mesmo sem recomendações. Qual padrão aplicar?
- Transformar o serviço de recomendações em um monolito junto com o de produtos.
- Remover o timeout das chamadas.
+ Circuit breaker com fallback: após falhas seguidas, deixar de chamar o serviço por um tempo e mostrar a página sem ele.
- Aumentar os retries para 10 tentativas.
E: O circuit breaker evita insistir em uma dependência que está falhando, e o fallback mantém a página útil. Mais retries aumentam a espera e a carga, remover timeouts prende recursos e juntar os serviços não resolve a lentidão.

Q: Uma aplicação mobile precisa exibir, em uma tela, dados de perfil do DynamoDB, pedidos de uma API HTTP e recomendações de uma função Lambda, buscando só os campos usados e recebendo atualizações de pedidos em tempo real. Qual serviço atende?
+ AWS AppSync com resolvers para cada fonte de dados e subscriptions.
- Uma REST API do API Gateway com três recursos, um para cada fonte de dados, chamados em paralelo pela tela.
- Um tópico SNS com assinatura push para o aplicativo, recebendo perfil, pedidos e recomendações juntos.
- Amazon Athena.
E: O AppSync combina várias fontes em uma consulta GraphQL que traz apenas os campos pedidos, e as subscriptions entregam atualizações por WebSocket. A REST API exigiria várias chamadas e não teria tempo real por padrão; Athena consulta arquivos no S3; e SNS não monta respostas de consulta.

Q: Uma API GraphQL no AppSync deve permitir leitura pública de um catálogo e escrita apenas para usuários autenticados no Cognito. O que configurar?
+ Vários modos de autorização: API key (ou IAM) para leitura pública e Cognito user pools para as mutations.
- Uma API key diferente para cada usuário, criada no cadastro e enviada pelo aplicativo nas queries e mutations.
- Um autorizador Lambda em um API Gateway colocado na frente do AppSync, liberando GET para todos e POST só com login.
- Somente o modo API key.
E: O AppSync aceita mais de um modo de autorização na mesma API, aplicados por tipo ou campo no schema. API key não identifica usuários, e colocar o API Gateway na frente acrescenta peças sem necessidade.

Q: Uma equipe front-end quer hospedar uma aplicação Next.js com build e implantação automáticos a cada push e um ambiente de pré-visualização para cada pull request, com o menor esforço operacional. Qual serviço usar?
+ AWS Amplify Hosting conectado ao repositório Git.
- Um bucket S3 com hospedagem de site estático e um script manual.
- Uma instância EC2 com Nginx e cron de deploy.
- AWS CodeDeploy em uma frota EC2.
E: O Amplify Hosting oferece CI/CD integrado, suporte a SSR e ambientes por branch e pull request. As demais exigem montar o pipeline e a infraestrutura manualmente.

Q: Uma aplicação guarda arquivos enviados pelos usuários no disco local de cada instância EC2, e os arquivos somem quando o Auto Scaling substitui instâncias. Qual princípio está sendo violado e qual a correção?
- Microsserviços; juntar tudo em um monolito.
- Comunicação assíncrona; enviar os arquivos em mensagens SQS para que qualquer instância possa processá-los depois.
+ A aplicação é stateful; guardar os arquivos no S3 (ou EFS) para tornar as instâncias stateless.
- Acoplamento fraco; usar uma instância maior.
E: Guardar estado local impede substituir e escalar instâncias sem perda. Com os arquivos no S3 ou EFS, qualquer instância atende e nada se perde. Instâncias maiores, filas ou monolito não resolvem o estado local.

Q: A equipe de segurança quer consultar com SQL os logs de acesso do ALB guardados no S3, sem provisionar servidores nem carregar os dados em um banco. Qual serviço usar?
- Amazon OpenSearch Service.
- Amazon ElastiCache.
+ Amazon Athena.
- Amazon DynamoDB com PartiQL.
E: O Athena executa SQL diretamente sobre arquivos no S3, sem servidor, cobrando pelos dados lidos. OpenSearch exigiria indexar os logs, PartiQL consulta tabelas do DynamoDB e ElastiCache é cache em memória.

Q: Um e-commerce precisa de busca de produtos por palavras do nome e da descrição, com relevância e filtros. Os produtos estão no DynamoDB. Qual solução é recomendada?
- Scan com FilterExpression contains em cada busca, com ProjectionExpression para trazer só o nome e a descrição.
- Usar o Athena sobre a tabela.
- Criar um GSI para cada palavra.
+ Indexar os produtos no Amazon OpenSearch Service, alimentado a partir do DynamoDB.
E: OpenSearch é feito para busca de texto com relevância, e pode ser alimentado pela integração zero-ETL ou por DynamoDB Streams. Scan é caro e lento, GSI por palavra é inviável e o Athena não é feito para buscas interativas de texto.

Q: Qual afirmação descreve uma arquitetura fracamente acoplada?
+ O serviço de pedidos publica o evento "pedido criado" e o de estoque reage, sem depender da disponibilidade do outro.
- O serviço de pedidos espera a resposta síncrona de cinco serviços antes de responder ao cliente, garantindo consistência imediata.
- O serviço de pedidos chama diretamente o banco do serviço de estoque.
- Todos os serviços compartilham a mesma tabela e o mesmo deploy.
E: Com eventos e intermediários, cada serviço pode mudar, escalar e falhar sem derrubar o outro. Acesso direto ao banco de outro serviço, tabelas e deploys compartilhados e cadeias síncronas longas são acoplamento forte.

Q: Uma aplicação mobile precisa de login de usuários, upload de fotos e dados sincronizados entre dispositivos, com o mínimo de código de integração. Qual combinação atende?
- EC2, RDS e um servidor de arquivos próprio.
- API Gateway com uma API key para cada usuário, usada para identificar quem envia cada foto e cada registro.
- Kinesis Data Streams para enviar as fotos.
+ Amplify com Cognito (login), S3 (fotos) e AppSync (dados), usando as bibliotecas cliente do Amplify.
E: As bibliotecas do Amplify integram Cognito, S3 e AppSync com pouco código. Servidores próprios aumentam a operação, API keys não autenticam usuários e Kinesis não é feito para upload de arquivos.

## Flashcards

F: Monolito vs. microsserviços
V: Monolito: uma unidade de implantação. Microsserviços: serviços pequenos, com dados e implantação independentes, comunicando por APIs ou eventos.

F: Quando preferir comunicação assíncrona?
V: Trabalho demorado, resultado não necessário na hora, absorver picos ou vários consumidores do mesmo fato. Padrão: 202 + id + consulta de status.

F: Stateless vs. stateful
V: Stateless: a instância não guarda estado entre requisições e qualquer uma atende. Stateful: guarda estado local, o que dificulta escalar. Estado vai para DynamoDB, ElastiCache, S3 ou RDS.

F: O que é circuit breaker?
V: Padrão em que, após falhas seguidas, o cliente para de chamar a dependência por um tempo e responde rápido (erro ou fallback), testando depois se ela voltou.

F: O que é o AWS AppSync?
V: Serviço gerenciado de APIs GraphQL: schema, resolvers (JS/VTL), fontes de dados (DynamoDB, Lambda, HTTP, Aurora, OpenSearch) e subscriptions em tempo real por WebSocket.

F: Modos de autorização do AppSync
V: API key, IAM, Cognito user pools, OpenID Connect e Lambda. Podem ser combinados na mesma API.

F: O que o Amplify Hosting oferece?
V: Hospedagem de front-ends (SPA/SSR) com CI/CD ligado ao Git, ambientes por branch e pré-visualização de pull requests, domínio próprio e HTTPS.

F: O que é o backend Amplify Gen 2?
V: Definição em TypeScript de auth (Cognito), dados (AppSync + DynamoDB), storage (S3) e funções (Lambda), implantada com o AWS CDK, com sandbox por desenvolvedor.

F: Para que serve o Amazon Athena?
V: SQL serverless sobre arquivos no S3 (logs, CSV, JSON, Parquet), pagando pelos dados lidos.

F: Quando usar o Amazon OpenSearch Service?
V: Busca de texto com relevância, autocompletar, filtros e análise de logs com painéis.
