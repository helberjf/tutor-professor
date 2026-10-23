# 08. API Gateway: autorização, limites, cache, CORS e erros

## Mapa da aula
Continuação da aula 07. Agora você aprende a proteger e operar uma API:

• as quatro formas de autorizar: IAM, Cognito, autorizador Lambda e JWT;
• políticas de recurso da API e AWS WAF;
• API keys e usage plans, e por que API key não é autenticação;
• throttling em camadas e o erro 429;
• cache de stage: TTL, chaves de cache e invalidação;
• CORS, o erro que só o navegador vê;
• o significado de cada erro 4xx e 5xx e os limites de tempo e tamanho;
• logs e métricas da API.

## Autorização com IAM
Com autorização AWS_IAM, o cliente assina a requisição com SigV4 usando credenciais AWS. O API Gateway verifica a assinatura e se a identidade tem permissão execute-api:Invoke no recurso da API.

O ARN do recurso tem o formato arn:aws:execute-api:regiao:conta:id-da-api/stage/metodo/caminho, o que permite liberar, por exemplo, só GET /pedidos no stage prod.

Quando usar: clientes que já têm credenciais AWS, como outra função Lambda, um serviço em ECS, um aplicativo com credenciais do Cognito identity pool ou outra conta (combinando com política de recurso da API).

## Autorizador Cognito e JWT
Autorizador Cognito user pool (REST API): o cliente faz login no user pool, recebe tokens e envia o ID token ou o access token no header Authorization. O API Gateway valida a assinatura, a expiração e o emissor, sem código. Com o access token, você pode exigir escopos OAuth por método.

Autorizador JWT (HTTP API): valida tokens JWT de qualquer provedor OIDC/OAuth 2.0, inclusive Cognito. Você configura o emissor (issuer) e o público (audience) e, opcionalmente, escopos por rota.

Nos dois casos, a API recebe as claims do token (por exemplo, sub e email) no contexto da requisição, e o backend pode usá-las para saber quem é o usuário.

## Autorizador Lambda
Quando a regra de autorização é customizada (um token de um sistema próprio, verificação em banco, regra por cabeçalho), use um autorizador Lambda:

• TOKEN: recebe um único token, normalmente do header Authorization.
• REQUEST: recebe headers, query string, stage variables e contexto; útil quando a decisão depende de vários valores.

A função devolve um principalId e uma policy IAM com Allow ou Deny para execute-api:Invoke, e pode incluir um objeto context com dados repassados ao backend.

O resultado pode ficar em cache pelo TTL configurado (padrão 300 segundos, máximo 3600), usando a fonte de identidade como chave. Isso economiza invocações, mas atenção: se a policy devolvida cobrir só o método atual e estiver em cache, outro método com o mesmo token pode ser negado. Gere policies com o escopo certo ou desative o cache.

Na prova: "autenticação com tokens de um provedor de terceiros que não é OIDC" ou "lógica de autorização customizada" → autorizador Lambda. "Usuários do Cognito, sem código" → autorizador Cognito (REST) ou JWT (HTTP API).

## Política de recurso da API e WAF
A política de recurso de uma REST API diz quem pode chamar a API, antes de qualquer autorizador:

• permitir somente uma lista de IPs ou faixas (aws:SourceIp);
• permitir chamadas apenas de uma VPC ou de um VPC endpoint (obrigatório em APIs privadas);
• permitir outra conta AWS, combinada com autorização IAM.

O AWS WAF pode ser associado a REST APIs (stage) para bloquear injeção de SQL, cross-site scripting, IPs maliciosos e aplicar regras baseadas em taxa por IP.

## API keys e usage plans
Uma API key é uma string que o cliente envia no header x-api-key. Ela identifica o cliente para fins de controle de uso. Um usage plan define para um ou mais stages:

• throttling por cliente: taxa (requisições por segundo) e burst;
• quota: número máximo de requisições por dia, semana ou mês.

Para funcionar:
1. marque o método com "API key required";
2. crie a API key e o usage plan;
3. associe a key ao plan e o plan ao stage da API.

Esquecer qualquer associação faz as requisições darem 403 Forbidden.

API key não é mecanismo de autenticação: é uma string que pode ser copiada. Use-a junto com IAM, Cognito ou um autorizador Lambda. Na prova: "cobrar ou limitar clientes de uma API por plano (básico, premium)" → usage plans com API keys.

## Throttling em camadas
O API Gateway limita o tráfego com o algoritmo de token bucket (taxa constante e burst):

• Nível de conta, por Região: padrão de 10.000 requisições por segundo, com burst de 5.000, compartilhado por todas as APIs da conta naquela Região (ajustável).
• Nível de stage e de método: limites menores que você define.
• Nível de cliente: pelo usage plan da API key.

Quando o limite é ultrapassado, o cliente recebe 429 Too Many Requests. O cliente deve repetir com backoff exponencial.

Throttling no API Gateway também protege o backend: limitar o stage a 100 requisições por segundo evita que um pico chegue à Lambda ou ao banco.

## Cache do stage
REST APIs podem ter cache por stage:

• capacidade de 0,5 GB a 237 GB, cobrado por hora enquanto ligado;
• TTL padrão de 300 segundos, máximo de 3600; TTL 0 desliga o cache;
• configurações por método podem sobrescrever o stage (por exemplo, desligar o cache em POST);
• chaves de cache: por padrão, o caminho e o método. Para que respostas diferentes por parâmetro não se misturem, inclua os parâmetros de query string e headers relevantes como cache key parameters;
• o cache pode ser criptografado.

Invalidação:
• Pelo console ou API: flush de todo o cache do stage.
• Pelo cliente: header Cache-Control: max-age=0 em uma requisição. Por segurança, exija autorização para isso (permissão execute-api:InvalidateCache), senão qualquer cliente pode forçar idas ao backend.

Métricas CacheHitCount e CacheMissCount mostram a eficiência.

## CORS
CORS (Cross-Origin Resource Sharing) é uma regra do navegador: um site em https://app.empresa.com só pode ler a resposta de https://api.empresa.com se a resposta tiver headers permitindo essa origem.

Para requisições com métodos ou headers não simples (PUT, DELETE, Authorization, Content-Type: application/json), o navegador primeiro envia uma requisição OPTIONS (preflight). A API precisa responder ao OPTIONS com:
• Access-Control-Allow-Origin (a origem permitida);
• Access-Control-Allow-Methods;
• Access-Control-Allow-Headers.

Detalhes que caem na prova:
• Em REST APIs, ativar CORS no console cria o método OPTIONS (mock) e configura os headers. Com Lambda proxy, a própria função precisa devolver Access-Control-Allow-Origin nas respostas de GET, POST etc.
• HTTP APIs têm configuração de CORS própria que responde ao preflight automaticamente.
• Respostas de erro geradas pelo próprio API Gateway (4xx e 5xx de autorização ou throttling) precisam dos headers de CORS nas Gateway Responses; senão o navegador mostra erro de CORS escondendo o erro real.
• curl e Postman não aplicam CORS. "Funciona no Postman, mas falha no navegador" aponta para CORS.

## Erros e limites
Erros que a prova cobra:

• 400 Bad Request: requisição inválida, validação de model.
• 403 Forbidden: autorização negada, API key ausente ou não associada ao usage plan, bloqueio do WAF ou da política de recurso. "Missing Authentication Token" costuma significar caminho ou método inexistente, ou stage errado na URL.
• 429 Too Many Requests: throttling ou quota do usage plan.
• 502 Bad Gateway: resposta inválida do backend, como formato de Lambda proxy errado ou erro da função.
• 503 Service Unavailable: backend indisponível.
• 504 Gateway Timeout: a integração passou do tempo limite.

Limites:
• Tempo de integração: de 50 ms até 29 segundos por padrão. Para APIs REST regionais e privadas, é possível pedir aumento, com possível redução da cota de throttling. HTTP APIs ficam em 30 segundos.
• Payload: até 10 MB.

Trabalho que passa de 29 segundos: responda 202 com um id, processe de forma assíncrona (SQS, Step Functions) e deixe o cliente consultar o status ou ser notificado.

## Logs e métricas
• Execution logs (REST): detalham cada etapa da requisição, úteis para depurar mapping templates e autorizadores. Exigem que a conta tenha configurada uma role IAM que permita ao API Gateway gravar no CloudWatch Logs.
• Access logs: uma linha por requisição, no formato que você define com variáveis $context (requestId, status, latência, IP).
• Métricas: Count, 4XXError, 5XXError, Latency (tempo total no API Gateway) e IntegrationLatency (tempo do backend). Latency muito maior que IntegrationLatency indica tempo gasto no próprio API Gateway, por exemplo em autorizadores.
• Tracing com X-Ray pode ser ligado por stage.

## Pegadinhas frequentes
• API key sozinha não autentica.
• Usage plan sem associação ao stage ou à key gera 403.
• Cache de stage só existe em REST API.
• Invalidação por Cache-Control: max-age=0 deve exigir autorização.
• Com Lambda proxy, os headers de CORS saem da função, não da configuração do método.
• 504 é timeout da integração; 502 é resposta inválida do backend.
• "Missing Authentication Token" geralmente é URL errada.

## Resumo para revisão
• IAM (SigV4, execute-api:Invoke), Cognito user pool (REST), JWT (HTTP API), Lambda TOKEN/REQUEST (policy + context, cache 300 s padrão, máx. 3600 s).
• Política de recurso: IP, VPC/VPC endpoint, outras contas. WAF em REST APIs.
• Usage plans: throttling e quota por API key; key não é autenticação.
• Throttling: conta 10.000 rps e burst 5.000 por Região; stage, método e cliente; erro 429.
• Cache REST: 0,5–237 GB, TTL padrão 300 s, máx. 3600 s; chaves por parâmetro; invalidação com Cache-Control: max-age=0.
• CORS: preflight OPTIONS e Access-Control-Allow-*; com proxy, a função devolve os headers.
• 400, 403, 429, 502, 503, 504; integração até 29 s; payload 10 MB.

## Questões

Q: Uma API REST é chamada por um aplicativo móvel cujos usuários fazem login em um user pool do Cognito. A equipe quer validar os tokens sem escrever código. Qual autorizador usar?
- API key obrigatória no método.
+ Autorizador Cognito user pool no método.
- Autorização IAM com SigV4.
- Autorizador Lambda do tipo TOKEN.
E: O autorizador Cognito valida assinatura, emissor e expiração dos tokens do user pool sem código. O autorizador Lambda exigiria implementar a validação; IAM exigiria credenciais AWS no cliente; e API key não autentica o usuário.

Q: Uma API recebe tokens de um provedor de identidade legado que não segue OIDC, e a validação exige consultar um serviço interno. Qual solução atende?
- Autorizador Cognito.
- Política de recurso permitindo o IP do provedor.
- Autorizador JWT da HTTP API.
+ Autorizador Lambda que valida o token e devolve uma policy IAM.
E: O autorizador Lambda executa lógica customizada e devolve principalId e uma policy Allow/Deny. Os autorizadores JWT e Cognito só validam tokens JWT de emissores OIDC/Cognito, e uma política por IP não valida o usuário.

Q: Uma empresa vende acesso à sua API em dois planos: o básico permite 1.000 requisições por dia e o premium, 100.000. Cada cliente deve ser limitado conforme o plano. Qual é a solução?
- Concorrência reservada na função de backend.
- Throttling de stage com dois stages diferentes, um para cada plano, e cada cliente chamando a URL do seu stage.
+ Usage plans com quotas diferentes e uma API key por cliente associada ao plano correspondente.
- Um autorizador Lambda que conta as requisições de cada cliente em uma tabela DynamoDB e nega quando o plano é excedido.
E: Usage plans aplicam throttling e quotas por API key, exatamente para planos por cliente. Throttling de stage vale para todos os clientes juntos; contar requisições em uma tabela é reinventar o recurso; e concorrência da função não separa clientes.

Q: Depois de configurar um usage plan com throttling, todas as requisições com o header x-api-key recebem 403. O método está marcado com "API key required". Qual é a causa mais provável?
- O throttling do plano está configurado como 0, o que bloqueia todas as requisições com a key.
- A API key precisa ser enviada no corpo da requisição, e não no header, quando o método é POST.
- Usage plans só funcionam com HTTP APIs.
+ A API key ou o stage não foram associados ao usage plan.
E: A key precisa estar associada ao usage plan, e o plan, ao stage da API; sem isso, a key não é aceita e a resposta é 403. A key vai no header x-api-key, usage plans são recurso de REST API, e throttling resultaria em 429, não 403.

Q: Uma REST API expõe GET /produtos?categoria=X. Depois de ligar o cache do stage, usuários que pedem categorias diferentes recebem a mesma lista. Qual é a correção?
- Reduzir o TTL para 1 segundo.
+ Incluir o parâmetro de query string categoria nas chaves de cache do método.
- Ligar a criptografia do cache.
- Aumentar a capacidade do cache para que cada categoria tenha espaço para sua própria entrada.
E: Se o parâmetro não faz parte da chave de cache, respostas de categorias diferentes compartilham a mesma entrada. TTL menor só reduz o tempo do erro, e criptografia ou capacidade não mudam a chave.

Q: Um aplicativo web em https://app.exemplo.com chama uma API com integração Lambda proxy. As chamadas funcionam no Postman, mas o navegador bloqueia a resposta com erro de CORS. O CORS foi ativado no console para o recurso. O que ainda falta?
- Ativar o cache do stage.
- Trocar a integração por HTTP proxy, que adiciona os headers de CORS automaticamente às respostas da função.
- Pedir aumento do limite de throttling.
+ A função Lambda devolver o header Access-Control-Allow-Origin nas respostas.
E: Com Lambda proxy, o API Gateway repassa a resposta da função, então os headers de CORS das respostas normais precisam vir da função. Ativar CORS no console cuida do preflight OPTIONS. Postman não aplica CORS, por isso funciona lá. Cache, tipo de integração e throttling não resolvem.

Q: Uma integração demora 40 segundos para gerar um relatório, e os clientes recebem 504. A API é edge-optimized. Qual é o desenho recomendado?
- Trocar para HTTP API, que não tem limite de tempo de integração e mantém a conexão aberta até a função responder.
- Ligar o cache do stage.
+ Responder logo com um id, processar de forma assíncrona (SQS ou Step Functions) e oferecer consulta de status.
- Aumentar o timeout da função Lambda para 15 minutos.
E: O 504 vem do limite de tempo da integração do API Gateway (29 segundos por padrão; endpoints edge-optimized não podem aumentar). O padrão assíncrono resolve sem segurar a conexão. O timeout da função não muda o da integração, cache não ajuda na primeira geração e HTTP APIs também têm limite de 30 segundos.

Q: Uma API pública começou a receber picos que derrubam o backend. A equipe quer que o API Gateway rejeite o excesso antes de chegar à Lambda. O que configurar?
- Um mapping template que descarta requisições.
- Uma Function URL para a função.
+ Limites de throttling no stage ou no método.
- Um TTL maior no cache do stage.
E: Throttling de stage ou de método devolve 429 para o excesso, protegendo o backend. Cache ajuda só em leituras repetidas, Function URL não tem throttling por stage, e mapping templates não limitam taxa.

Q: Um cliente chama https://id.execute-api.sa-east-1.amazonaws.com/pedidos e recebe 403 com a mensagem "Missing Authentication Token". A API não usa autorização. Qual é a causa mais provável?
+ A URL não inclui o stage (por exemplo, /prod/pedidos) ou o recurso/método não existe.
- O cliente não enviou a assinatura SigV4, que o API Gateway exige por padrão em todas as rotas REST.
- O token do Cognito expirou.
- O throttling da conta foi atingido.
E: Essa mensagem aparece quando o caminho ou método não existe na API; esquecer o stage na URL é o caso clássico. Sem autorização configurada, não há assinatura ou token a verificar, e throttling gera 429.

Q: Um autorizador Lambda com cache de 300 segundos devolve uma policy que permite apenas o método GET /pedidos. Usuários relatam que, logo depois de um GET, um POST /pedidos com o mesmo token é negado. Por quê?
- O cache de autorizadores não funciona com POST, então o autorizador nega todas as escritas enquanto o cache estiver ativo.
- O POST precisa de uma API key.
+ A policy em cache para aquele token só permite GET /pedidos e é reaproveitada no POST.
- O TTL do cache precisa ser maior.
E: Com cache, a policy devolvida para o token é reutilizada em outras chamadas com o mesmo token. Se ela cobre só um método, os demais são negados. A correção é devolver uma policy que cubra os recursos permitidos ou desligar o cache.

## Flashcards

F: Formas de autorizar no API Gateway
V: IAM (SigV4 + execute-api:Invoke), autorizador Cognito user pool (REST), autorizador JWT (HTTP API) e autorizador Lambda (TOKEN ou REQUEST).

F: O que um autorizador Lambda devolve?
V: Um principalId, uma policy IAM (Allow/Deny para execute-api:Invoke) e, opcionalmente, um context repassado ao backend. Cache padrão de 300 s, máximo 3600 s.

F: API key é autenticação?
V: Não. Identifica o cliente para usage plans (throttling e quota). Combine com IAM, Cognito ou autorizador Lambda.

F: Passos para usar usage plans
V: Marcar o método como "API key required", criar a key e o plan, associar a key ao plan e o plan ao stage.

F: Throttling padrão do API Gateway
V: 10.000 requisições por segundo com burst de 5.000 por conta e Região, compartilhado entre APIs. Excesso retorna 429.

F: Cache do API Gateway: TTL e capacidade
V: Só REST API. TTL padrão 300 s, máximo 3600 s (0 desliga). Capacidade de 0,5 GB a 237 GB.

F: Como um cliente invalida uma entrada do cache do API Gateway?
V: Enviando Cache-Control: max-age=0. Deve exigir autorização (execute-api:InvalidateCache).

F: CORS com Lambda proxy
V: O preflight OPTIONS é tratado pela API, mas as respostas normais precisam trazer Access-Control-Allow-Origin vindo da própria função.

F: Diferença entre 502 e 504 no API Gateway
V: 502: resposta inválida do backend (formato proxy errado ou erro da função). 504: a integração passou do tempo limite (29 s por padrão).

F: Latency vs. IntegrationLatency
V: Latency é o tempo total no API Gateway; IntegrationLatency é o tempo do backend. A diferença é tempo gasto no próprio API Gateway (ex.: autorizador).
