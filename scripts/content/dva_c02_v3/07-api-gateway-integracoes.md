# 07. API Gateway: tipos de API, integrações, stages e implantação

## Mapa da aula
O API Gateway é a porta HTTP das aplicações serverless. Nesta primeira aula sobre ele:

• REST API, HTTP API e WebSocket API: o que cada uma oferece;
• tipos de endpoint: edge-optimized, regional e privado;
• integrações: Lambda proxy, Lambda não proxy, HTTP, serviço AWS, mock e VPC link;
• o formato de resposta que a Lambda precisa devolver no modo proxy;
• mapping templates e validação de requisições;
• stages, deployments, stage variables e canary.

A aula 08 trata de segurança, limites, cache, CORS e erros.

## Três tipos de API
REST API (a "v1"): a mais completa. Tem API keys e usage plans, cache, validação de requisições, mapping templates, integração com AWS WAF, políticas de recurso, endpoints privados e canary por stage.

HTTP API (a "v2"): mais simples, mais barata e com menor latência. Tem autorizadores JWT nativos (por exemplo, Cognito ou qualquer provedor OIDC), autorizadores Lambda e IAM, CORS simples e implantação automática. Não tem cache, usage plans/API keys nem validação de requisições como a REST API.

WebSocket API: conexão persistente e bidirecional, para chat, painéis em tempo real e jogos. As rotas são escolhidas por uma expressão sobre a mensagem; existem as rotas especiais $connect, $disconnect e $default. Para enviar dados ao cliente, o backend chama a API @connections com o connectionId.

Na prova: "menor custo e latência, só proxy para Lambda e JWT" → HTTP API. "API keys, usage plans, cache ou transformação de requisições" → REST API. "Comunicação em tempo real nos dois sentidos" → WebSocket API.

## Tipos de endpoint
Para REST APIs, você escolhe:

• Edge-optimized (padrão): as requisições entram pela rede de borda do CloudFront e seguem para a Região da API. Bom para clientes espalhados geograficamente.
• Regional: o endpoint fica na Região. Bom quando os clientes estão na mesma Região ou quando você quer colocar seu próprio CloudFront na frente.
• Private: acessível somente de dentro de uma VPC, por um interface endpoint (execute-api). O acesso é controlado por política de recurso da API.

Um domínio próprio (api.empresa.com) é configurado como custom domain name, com certificado do ACM. Para endpoint edge-optimized, o certificado precisa estar em us-east-1.

## Integrações
A integração diz o que o API Gateway faz com a requisição:

• Lambda proxy (AWS_PROXY): a requisição inteira (método, caminho, headers, query, body) vira o evento da função, e a função devolve a resposta HTTP inteira. É o modo mais comum.
• Lambda não proxy (AWS): você define com mapping templates o que entra na função e como a saída vira resposta HTTP.
• HTTP proxy e HTTP: encaminham para um endpoint HTTP, com ou sem transformação.
• Serviço AWS: chama uma API da AWS diretamente, sem Lambda. Exemplos: SendMessage no SQS, PutItem no DynamoDB, StartExecution no Step Functions. O API Gateway usa uma role IAM para isso.
• Mock: o próprio API Gateway devolve a resposta, sem backend. Útil para testes e para o preflight de CORS.
• VPC link: integração privada com um Network Load Balancer (REST) ou com ALB, NLB e Cloud Map (HTTP API) dentro da VPC.

Na prova: "receber requisições e colocá-las em uma fila sem código" → integração de serviço AWS com SQS. "Testar o front-end antes do backend existir" → mock.

## Lambda proxy: o formato da resposta
No modo proxy, a função precisa devolver um objeto com este formato:

• statusCode: número (200, 404...);
• headers: dicionário opcional;
• body: string (se for JSON, use JSON.stringify);
• isBase64Encoded: true para conteúdo binário.

Se a função devolver um dicionário com outro formato, um body que não é string ou lançar exceção não tratada, o cliente recebe 502 Bad Gateway, e o log de execução mostra "Malformed Lambda proxy response".

```typescript
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const pedidoId = event.pathParameters?.id;
  const pedido = pedidoId ? await buscarPedido(pedidoId) : undefined; // sua lógica
  if (!pedido) {
    return { statusCode: 404, body: JSON.stringify({ erro: "pedido não encontrado" }) };
  }
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pedido),
  };
};
```

## Mapping templates
Em integrações não proxy, mapping templates transformam a requisição e a resposta. Eles são escritos em VTL (Velocity Template Language) e escolhidos pelo Content-Type.

Usos típicos:
• adaptar uma API pública a um backend legado com outro formato (por exemplo, JSON para XML);
• montar o corpo de uma integração de serviço AWS (o formato de SendMessage do SQS);
• renomear ou remover campos da resposta;
• definir o status HTTP a partir de um padrão no erro da Lambda (integration responses).

Variáveis úteis: $input.json('$') (corpo inteiro), $input.params('nome') (parâmetro de caminho, query ou header), $context.requestId e $stageVariables.

```json
{
  "pedidoId": "$input.params('id')",
  "cliente": $input.json('$.cliente'),
  "origem": "$context.identity.sourceIp",
  "ambiente": "$stageVariables.ambiente"
}
```

## Validação de requisições
Em REST APIs, você pode rejeitar requisições inválidas antes de chegar ao backend:

• Model: um JSON Schema que descreve o corpo esperado.
• Request validator: diz o que validar no método: o corpo, os parâmetros e headers obrigatórios, ou ambos.

Se a requisição não passa, o API Gateway responde 400 Bad Request sem invocar a integração. Isso economiza invocações e simplifica o código.

A validação de schema verifica formato (tipos, campos obrigatórios, tamanhos). Regras de negócio, como "o cliente existe", continuam no backend.

## Stages e deployments
Em uma REST API, editar recursos e métodos muda apenas a definição de trabalho. Para que a mudança chegue aos clientes, é preciso criar um deployment (uma fotografia da API) e associá-lo a um stage (dev, homolog, prod).

• Cada stage tem sua URL: https://id.execute-api.regiao.amazonaws.com/prod.
• Cada stage tem configurações próprias: throttling, cache, logs, tracing com X-Ray e stage variables.
• Esquecer o deploy é um erro clássico: "alterei a API e nada mudou".

HTTP APIs podem usar implantação automática (auto-deploy) em um stage, que publica cada alteração.

```bash
aws apigateway create-deployment --rest-api-id a1b2c3 --stage-name prod --description "nova rota /pedidos"
```

## Stage variables
Stage variables são pares nome-valor definidos por stage, como variáveis de ambiente da API. Podem ser usadas em:

• ARN da função de integração: arn:aws:lambda:...:function:pedidos:${stageVariables.alias}. O stage dev chama o alias dev, o prod chama o alias prod;
• URL de uma integração HTTP: https://${stageVariables.backend}/v1;
• mapping templates ($stageVariables.nome).

Quando a integração usa uma stage variable para escolher o alias, o API Gateway precisa de permissão para invocar cada alias (uma permissão lambda:InvokeFunction por alias na política de recurso da função).

Stage variables são configuração, não segredo, e não concedem permissão por si mesmas.

## Canary em um stage
REST APIs permitem canary release em um stage: uma porcentagem do tráfego vai para um deployment novo, e o resto continua no deployment atual.

• Você define a porcentagem (por exemplo, 10%) e pode sobrescrever stage variables só para o canary.
• Métricas e logs do canary são separados, para comparar.
• Se der certo, você promove o canary; se não, remove.

Isso testa mudanças na própria API (rotas, mapping templates). Para testar uma versão nova da função Lambda, a alternativa é a divisão de tráfego por alias (aula 06) ou o CodeDeploy (aula 28).

## Pegadinhas frequentes
• Alteração em REST API sem novo deployment não chega ao stage.
• 502 com Lambda proxy é quase sempre formato de resposta errado (body não string, faltou statusCode) ou exceção não tratada.
• HTTP API não tem cache, usage plans nem API keys.
• Para colocar mensagens no SQS sem Lambda, use integração de serviço AWS.
• Certificado de domínio próprio para API edge-optimized fica em us-east-1.
• Stage variable apontando para alias exige permissão de invocação para cada alias.

## Resumo para revisão
• REST API: completa (keys, usage plans, cache, validação, VTL, WAF, privada, canary). HTTP API: barata e rápida, JWT nativo. WebSocket: bidirecional, @connections.
• Endpoints REST: edge-optimized (padrão), regional, private.
• Integrações: Lambda proxy, Lambda não proxy, HTTP, serviço AWS, mock, VPC link.
• Resposta proxy: statusCode, headers, body string, isBase64Encoded; erro → 502.
• Mapping templates em VTL; validação com models e request validators → 400.
• Mudança em REST API exige deployment em um stage. Stage variables configuram cada stage.
• Canary de stage: porcentagem do tráfego para um deployment novo.

## Questões

Q: Uma equipe precisa expor funções Lambda por HTTP com o menor custo e a menor latência. A autenticação é feita com tokens JWT emitidos por um user pool do Cognito. Não há necessidade de cache nem de API keys. Qual opção atende?
- REST API privada com VPC endpoint.
- WebSocket API com rota $connect.
- REST API com autorizador Lambda.
+ HTTP API com autorizador JWT.
E: HTTP APIs são mais baratas e têm menor latência, com autorizador JWT nativo que valida tokens do Cognito. REST API funcionaria, mas custa mais e o requisito não pede seus recursos extras; WebSocket é para comunicação bidirecional; API privada só é acessível dentro de uma VPC.

Q: Uma função Lambda integrada como proxy retorna {"status": 200, "dados": {...}}. Os clientes recebem 502 Bad Gateway. Qual é a correção?
- Mudar a integração para mock.
- Ativar o cache do stage.
- Aumentar o timeout da integração.
+ Devolver um objeto com statusCode e body (string), como JSON.stringify dos dados.
E: Na integração Lambda proxy, o API Gateway espera statusCode, headers opcionais e body como string; outro formato gera "Malformed Lambda proxy response" e 502. Timeout gera 504, cache não corrige formato e mock removeria o backend.

Q: Uma empresa quer receber pedidos por HTTP e colocá-los diretamente em uma fila SQS, sem manter código. Qual integração do API Gateway usar?
- Integração mock.
- Lambda proxy com uma função que chama SendMessage.
- Integração HTTP proxy para a URL da fila.
+ Integração de serviço AWS com a ação SendMessage do SQS e um mapping template.
E: A integração de serviço AWS chama a API do SQS diretamente, usando uma role IAM, e o mapping template monta os parâmetros. Lambda funcionaria, mas adiciona código; mock não envia nada; e HTTP proxy não assinaria a requisição com SigV4.

Q: Um desenvolvedor alterou o mapping template de um método de uma REST API e salvou. Os clientes continuam recebendo a resposta antiga. O que falta?
+ Criar um novo deployment e associá-lo ao stage usado pelos clientes.
- Esperar até 24 horas pela propagação da mudança para os pontos de presença do CloudFront usados pela API.
- Limpar o cache do navegador dos clientes, que guarda a resposta antiga do API Gateway por até um dia.
- Reiniciar a função Lambda.
E: Em REST APIs, as mudanças só chegam aos clientes depois de um deployment no stage. Não há propagação de 24 horas; o problema não está no navegador nem na função, que nem foi alterada.

Q: Uma API precisa rejeitar requisições sem o campo obrigatório "email" no corpo, sem invocar a função Lambda. Qual recurso da REST API atende com menor esforço?
- Um autorizador Lambda do tipo REQUEST que verifica o corpo e nega a requisição quando o campo falta.
- Um mapping template de requisição que verifica o campo e devolve 400 quando ele não vem no corpo.
- Uma regra no AWS WAF para cada campo.
+ Um model (JSON Schema) com um request validator para o corpo do método.
E: O request validator compara o corpo com o model e responde 400 antes da integração. Autorizadores tratam de identidade e não recebem o corpo; WAF não valida schema de JSON de forma simples; e um mapping template transforma, não valida.

Q: Uma mesma REST API tem os stages dev e prod. A integração deve chamar o alias dev da função no stage dev e o alias prod no stage prod. Qual é a abordagem recomendada?
- Usar uma variável de ambiente da função para descobrir de qual stage veio a chamada e encaminhar para o alias certo.
- Criar uma API diferente para cada ambiente, com ARNs fixos.
+ Usar uma stage variable no ARN da integração e conceder permissão de invocação para cada alias.
- Usar $LATEST nos dois stages.
E: A integração com ${stageVariables.alias} escolhe o alias por stage, e cada alias precisa permitir a invocação pelo API Gateway. APIs duplicadas aumentam o trabalho; $LATEST não separa ambientes; e a função não escolhe por qual alias foi chamada.

Q: Uma equipe quer liberar uma alteração de mapping templates para 10% das requisições do stage prod e comparar as métricas antes de liberar para todos. Qual recurso usar?
- Weighted routing em um alias Lambda, com 10% para a versão nova da função.
- Cache do stage com TTL de 10%.
- Dois stages com o mesmo nome.
+ Canary release no stage prod da REST API.
E: O canary do stage envia uma porcentagem do tráfego para um deployment novo da API e separa as métricas. Alias com pesos dividiria o tráfego entre versões da função, mas a mudança está na API; stages não podem ter o mesmo nome; e cache não divide tráfego.

Q: Uma aplicação de chat precisa que o servidor envie mensagens aos navegadores conectados assim que elas chegam. Qual tipo de API do API Gateway usar?
- REST API com polling a cada segundo.
- REST API privada.
+ WebSocket API, enviando mensagens pela API @connections com o connectionId.
- HTTP API com respostas em streaming mantidas abertas, enviando cada mensagem nova pela mesma resposta.
E: A WebSocket API mantém conexões persistentes, e o backend envia dados ao cliente usando o connectionId pela API @connections. Polling gera latência e custo; streaming de resposta não mantém um canal bidirecional; e API privada trata de acesso por VPC.

Q: Um time quer desenvolver o front-end enquanto o backend ainda não existe. A API deve devolver respostas fixas de exemplo. Qual integração usar?
- VPC link.
+ Mock.
- Lambda proxy.
- HTTP proxy.
E: A integração mock devolve uma resposta definida no próprio API Gateway, sem backend. As outras exigem um destino real.

Q: Uma REST API edge-optimized vai usar o domínio api.empresa.com.br com um certificado do ACM. Onde o certificado deve estar?
+ Em us-east-1.
- Em qualquer Região, desde que seja um certificado importado.
- Não é possível usar certificado do ACM em domínio próprio.
- Na mesma Região da API.
E: Endpoints edge-optimized usam a borda do CloudFront, que só aceita certificados do ACM em us-east-1. Para endpoints regionais, o certificado fica na Região da API.

## Flashcards

F: REST API vs. HTTP API
V: REST: API keys, usage plans, cache, validação, mapping templates, WAF, endpoint privado, canary. HTTP: mais barata e rápida, JWT nativo, auto-deploy, sem cache e sem usage plans.

F: Tipos de endpoint de uma REST API
V: Edge-optimized (padrão, via CloudFront), Regional e Private (só de dentro da VPC por interface endpoint).

F: Formato de resposta da Lambda em integração proxy
V: {"statusCode": 200, "headers": {...}, "body": "string", "isBase64Encoded": false}. Formato errado gera 502.

F: Tipos de integração do API Gateway
V: Lambda proxy, Lambda não proxy, HTTP proxy, HTTP, serviço AWS (ex.: SQS, DynamoDB, Step Functions), mock e VPC link.

F: Para que servem mapping templates?
V: Transformar requisições e respostas em integrações não proxy, com VTL ($input.json, $input.params, $context, $stageVariables).

F: Como validar o corpo da requisição em uma REST API?
V: Model (JSON Schema) + request validator no método. Requisição inválida recebe 400 sem chamar o backend.

F: Por que uma alteração na REST API não aparece para os clientes?
V: Falta criar um deployment e associá-lo ao stage.

F: O que são stage variables?
V: Pares nome-valor por stage, usados em ARNs de integração (alias por stage), URLs de backend e mapping templates. Não são segredo nem concedem permissão.

F: O que é canary release no API Gateway?
V: Recurso de stage da REST API que envia uma porcentagem do tráfego a um deployment novo, com métricas separadas, até promover ou remover.

F: Onde fica o certificado ACM de um domínio próprio em API edge-optimized?
V: Em us-east-1. Para API regional, na mesma Região da API.
