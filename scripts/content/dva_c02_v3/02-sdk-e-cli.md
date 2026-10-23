# 02. SDK e CLI: credenciais, paginação, erros e retries

## Mapa da aula
Todo código que fala com a AWS passa pelo SDK ou pela CLI. A prova cobra:

• de onde o SDK tira credenciais e Região, e em que ordem;
• como ler resultados paginados sem perder itens;
• quais erros corrigir e quais repetir;
• retries com backoff exponencial e jitter, e os modos de retry do SDK;
• idempotência, para que repetir uma chamada não duplique o efeito;
• comandos e opções úteis da CLI: perfis, --query, --page-size, --max-items, waiters e sts get-caller-identity.

Os exemplos usam TypeScript com o AWS SDK for JavaScript v3, mas os conceitos valem para todos os SDKs.

## O que acontece em uma chamada do SDK
Quando você executa await dynamodb.send(new GetItemCommand({...})), o SDK:

1. descobre a Região e monta o endpoint (por exemplo, dynamodb.us-east-1.amazonaws.com);
2. encontra credenciais;
3. assina a requisição com Signature Version 4 (SigV4), usando as credenciais e o horário atual;
4. envia a requisição HTTPS;
5. devolve a resposta como um objeto ou, em caso de erro, rejeita a Promise com uma exceção tipada (ConditionalCheckFailedException, ThrottlingException...), que herda de ServiceException.

Como a assinatura inclui o horário, um relógio muito errado na máquina causa erros como RequestTimeTooSkewed ou "Signature expired". A correção é sincronizar o relógio, não mexer em permissões.

No SDK v3, cada serviço é um pacote separado (@aws-sdk/client-s3, @aws-sdk/client-dynamodb), o que deixa o pacote da Lambda menor. Você cria um client com a configuração (Região, credenciais, retries) e envia comandos com client.send(new XxxCommand(input)). Para o DynamoDB, o pacote @aws-sdk/lib-dynamodb oferece o DynamoDBDocumentClient, que converte objetos JavaScript comuns para o formato de atributos do DynamoDB. No SDK v3, as conexões HTTP ficam abertas entre chamadas (keep-alive) por padrão.

## A cadeia de credenciais
O SDK procura credenciais em uma ordem fixa e usa a primeira que encontrar. De forma simplificada:

1. credenciais passadas diretamente no código (opção credentials do client);
2. variáveis de ambiente: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY e AWS_SESSION_TOKEN;
3. arquivos ~/.aws/credentials e ~/.aws/config, no perfil escolhido por AWS_PROFILE (ou default), incluindo perfis de SSO, de assume role e credential_process;
4. token de web identity (AWS_WEB_IDENTITY_TOKEN_FILE, usado no EKS e em pipelines com OIDC);
5. credenciais de contêiner (task role do ECS);
6. metadados da instância EC2 (instance profile).

No SDK de JavaScript, essa cadeia é o fromNodeProviderChain, usado automaticamente quando você não informa credentials.

Na Lambda, o runtime coloca as credenciais da role de execução em variáveis de ambiente; por isso o SDK as encontra sem configuração.

Consequência importante: se alguém exportou AWS_ACCESS_KEY_ID no terminal, essas chaves vencem o perfil do arquivo. Se uma EC2 tem chaves esquecidas em ~/.aws/credentials, elas vencem o instance profile. Quando "a permissão está certa, mas dá AccessDenied", descubra primeiro qual identidade está sendo usada:

aws sts get-caller-identity

O comando devolve conta, ARN e UserId da identidade efetiva. Ele não precisa de permissão especial.

## Região: como o SDK escolhe
A Região segue uma ordem parecida: opção region do client, depois a variável AWS_REGION, depois a região do perfil no arquivo de configuração (a CLI também aceita AWS_DEFAULT_REGION). A Lambda define AWS_REGION com a Região da função.

Sem Região, o client falha com o erro "Region is missing". Com a Região errada, o erro costuma ser ResourceNotFoundException ou NoSuchBucket, porque o recurso existe em outro lugar.

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { NodeHttpHandler } from "@smithy/node-http-handler";

export const dynamodb = new DynamoDBClient({
  region: "sa-east-1",
  maxAttempts: 4,              // tentativas no total, incluindo a primeira
  retryMode: "standard",
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 2_000,  // ms para abrir a conexão
    requestTimeout: 5_000,     // ms esperando a resposta
  }),
});
```

## CLI: perfis, saída e filtros
Comandos e opções que aparecem na prova:

• aws configure cria um perfil com chave, segredo, Região e formato de saída. aws configure sso configura login pelo IAM Identity Center.
• --profile nome e --region nome sobrescrevem o perfil e a Região de um comando.
• --output json | text | table | yaml muda o formato.
• --query usa JMESPath para selecionar campos. O filtro é aplicado no cliente, depois que os dados chegam.
• Alguns comandos têm filtros no servidor, como --filters no EC2 ou --filter-expression no DynamoDB, que reduzem o que vem pela rede.
• --dry-run, em comandos do EC2, verifica a permissão sem executar: a resposta DryRunOperation indica que você teria permissão; UnauthorizedOperation indica que não.

```bash
aws sts get-caller-identity --profile homolog
aws lambda list-functions --region us-east-1 \
    --query "Functions[?Runtime=='nodejs22.x'].FunctionName" --output text
aws ec2 run-instances --dry-run --image-id ami-123 --instance-type t3.micro
```

## Paginação no SDK
APIs que listam coisas devolvem uma página por vez. A resposta traz um marcador para a próxima página, com nomes que variam: NextToken, Marker, NextContinuationToken (S3) ou LastEvaluatedKey (DynamoDB). Se o código lê só a primeira resposta, perde itens sem nenhum erro.

A forma segura é usar as funções paginate* do SDK v3, que seguem os marcadores até o fim em um for await. No exemplo, page.Contents ?? [] protege o caso de uma página vazia, quando Contents não vem na resposta.

```typescript
import { S3Client, paginateListObjectsV2 } from "@aws-sdk/client-s3";

const s3 = new S3Client({});
let total = 0;
for await (const page of paginateListObjectsV2({ client: s3 }, { Bucket: "relatorios", Prefix: "2026/" })) {
  for (const obj of page.Contents ?? []) {
    total += obj.Size ?? 0;
  }
}
console.log("bytes:", total);
```

## Paginação na CLI: --page-size e --max-items
A CLI pagina automaticamente: por padrão, ela segue todas as páginas e mostra tudo. Duas opções mudam isso:

• --page-size N: quantos itens pedir por chamada de API. O resultado final é o mesmo, mas com mais chamadas menores. Use quando uma listagem grande dá timeout.
• --max-items N: quantos itens mostrar no total. Se houver mais, a saída inclui um NextToken.
• --starting-token TOKEN: continua de onde --max-items parou.
• --no-paginate: pede só a primeira página.

Na prova: "o comando list falha com timeout em um bucket enorme" → --page-size. "Mostrar só os 100 primeiros e continuar depois" → --max-items com --starting-token.

## Waiters: esperar um estado
Algumas operações são assíncronas: criar uma tabela DynamoDB devolve sucesso enquanto ela ainda está CREATING. Um waiter consulta o estado periodicamente até chegar ao desejado ou estourar o limite de tentativas.

Na CLI: aws dynamodb wait table-exists --table-name Pedidos. Waiter é a resposta para "esperar até o recurso ficar pronto sem escrever um laço de polling".

```typescript
import { CreateTableCommand, DynamoDBClient, waitUntilTableExists } from "@aws-sdk/client-dynamodb";

const dynamodb = new DynamoDBClient({});
await dynamodb.send(new CreateTableCommand({ /* parâmetros omitidos */ }));
await waitUntilTableExists({ client: dynamodb, maxWaitTime: 120 }, { TableName: "Pedidos" });
```

## Erros: corrigir ou repetir?
Os erros se dividem em dois grupos.

Erros do cliente (4xx): a requisição está errada e repetir não adianta.
• AccessDeniedException / AccessDenied (403): falta permissão.
• ValidationException (400): parâmetro inválido.
• ResourceNotFoundException (400/404): nome, Região ou conta errados.
• ConditionalCheckFailedException (400): a condição de escrita do DynamoDB não foi satisfeita.

Erros transitórios: vale repetir, com espera crescente.
• ThrottlingException, TooManyRequestsException (429), ProvisionedThroughputExceededException, RequestLimitExceeded, SlowDown (S3 503).
• InternalServerError (500), ServiceUnavailable (503) e timeouts de rede.

```typescript
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

try {
  await doc.send(new PutCommand({
    TableName: "Pedidos",
    Item: pedido,
    ConditionExpression: "attribute_not_exists(pk)",
  }));
} catch (erro) {
  if (erro instanceof ConditionalCheckFailedException) {
    console.log("já existe; nada a fazer");
  } else {
    throw erro; // o status HTTP fica em erro.$metadata.httpStatusCode
  }
}
```

## Backoff exponencial com jitter
Repetir imediatamente uma chamada que sofreu throttling só piora a fila. O padrão recomendado é backoff exponencial com jitter: esperar um tempo aleatório entre zero e um teto que dobra a cada tentativa.

espera = aleatório(0, min(teto, base × 2^tentativa))

Com base 100 ms e teto 5 s: até 100 ms, até 200 ms, até 400 ms, até 800 ms... O aleatório (jitter) evita que mil clientes que falharam juntos tentem de novo no mesmo instante.

Os SDKs já fazem isso. Os modos de retry são:

• legacy: comportamento antigo, varia por SDK.
• standard: backoff exponencial com jitter, 3 tentativas no total por padrão, e uma cota de retries que evita tempestades de repetição.
• adaptive: tudo do standard mais limitação de taxa no lado do cliente, que reduz a velocidade quando há throttling. Útil quando um único cliente sofre throttling constante.

Configure por código (opções maxAttempts e retryMode do client) ou pelas variáveis AWS_RETRY_MODE e AWS_MAX_ATTEMPTS. No SDK de JavaScript v3, o modo padrão é standard.

Na prova: "a aplicação recebe ThrottlingException em picos" → retries com backoff exponencial e jitter (e, se for limite de capacidade, aumentar a capacidade ou espalhar a carga).

## Timeouts e orçamento de tempo
Retries custam tempo. Se o usuário espera no máximo 3 segundos, quatro tentativas com requestTimeout de 5 segundos estouram o prazo. Ajuste connectionTimeout, requestTimeout e maxAttempts para caber no tempo disponível.

Dentro de uma Lambda, o tempo total das tentativas precisa caber no timeout da função. Se cada camada repete por conta própria (o SDK, o seu código e o chamador), as tentativas se multiplicam. Escolha uma camada para repetir.

Circuit breaker é um padrão complementar: depois de muitas falhas seguidas, o cliente para de chamar a dependência por um tempo e responde rápido com erro ou valor alternativo, em vez de acumular chamadas lentas.

## Idempotência
Um timeout não prova que a operação falhou: o servidor pode ter executado e a resposta se perdeu. Se você repetir uma operação não idempotente, como "cobrar R$ 50", pode cobrar duas vezes.

Formas de tornar a repetição segura:

• Token de idempotência da própria API. Várias APIs aceitam um ClientToken (EC2 RunInstances, Step Functions StartExecution com name, entre outras): a mesma requisição com o mesmo token não cria um segundo recurso.
• Chave de negócio com escrita condicional: gravar o pedido com ConditionExpression attribute_not_exists(pedido_id). A segunda gravação falha com ConditionalCheckFailedException, e o código trata como "já processado".
• Utilitário de idempotência do Powertools for AWS Lambda, que guarda o resultado de cada chave em uma tabela DynamoDB e devolve o mesmo resultado em uma repetição.

Use sempre a mesma chave para a mesma intenção. Gerar um token novo a cada tentativa anula a proteção.

## Pegadinhas frequentes
• Retry não corrige AccessDenied nem ValidationException. Repetir erro 4xx só gasta tempo.
• --query filtra no cliente; não reduz o tempo da chamada nem o volume transferido.
• --page-size não limita o resultado total; --max-items limita.
• Ler só a primeira resposta de uma listagem perde itens sem lançar erro.
• Variáveis de ambiente com chaves vencem o perfil e o instance profile. Use sts get-caller-identity para descobrir quem está chamando.
• Erro de assinatura por horário se corrige sincronizando o relógio.

## Resumo para revisão
• Ordem das credenciais: código → variáveis de ambiente → arquivos de perfil → contêiner (ECS) → metadados da EC2. A primeira encontrada vence.
• Região: opção region → AWS_REGION → perfil.
• Paginação: use as funções paginate* (for await); marcadores NextToken, Marker, LastEvaluatedKey.
• CLI: --page-size (chamadas menores), --max-items + --starting-token (limitar e continuar), --query (JMESPath no cliente), --dry-run (EC2).
• Waiters esperam um estado sem laço manual.
• Repita só erros transitórios (throttling, 5xx, timeout) com backoff exponencial e jitter. Modos: legacy, standard, adaptive.
• Idempotência: mesmo token ou chave de negócio para a mesma intenção.

## Questões

Q: Um desenvolvedor roda um script em uma instância EC2 que tem um instance profile com permissão para ler um bucket. O script recebe AccessDenied. Ao investigar, ele descobre um arquivo ~/.aws/credentials esquecido na instância. O que está acontecendo?
- O instance profile só funciona com a CLI, não com o SDK.
- O bucket exige que as chaves do arquivo e o instance profile sejam combinados.
- O SDK usa a identidade com mais permissões entre as disponíveis.
+ As chaves do arquivo de credenciais vêm antes do instance profile na cadeia e pertencem a outra identidade.
E: A cadeia de credenciais para na primeira fonte encontrada, e o arquivo de perfil vem antes dos metadados da instância. O SDK não combina identidades nem escolhe a mais poderosa, e o instance profile funciona igualmente no SDK e na CLI. Remover o arquivo (e confirmar com sts get-caller-identity) resolve.

Q: Qual comando mostra a conta e o ARN da identidade que a CLI está usando no momento?
- aws iam get-user
- aws iam list-roles
- aws configure list-profiles
+ aws sts get-caller-identity
E: sts get-caller-identity devolve conta, ARN e UserId da identidade efetiva e não exige permissão. iam get-user falha quando a identidade é uma role; list-profiles só lista nomes de perfis do arquivo; list-roles lista roles da conta, não quem está chamando.

Q: Um script lista os objetos de um bucket com ListObjectsV2Command e soma os tamanhos. O bucket tem 5.000 objetos, mas o script conta apenas 1.000, sem erro. Qual é a correção?
+ Usar paginateListObjectsV2 para seguir todas as páginas com for await.
- Trocar para a versão 1 da API, ListObjectsCommand.
- Ativar o modo de retry adaptive.
- Aumentar o requestTimeout do client.
E: Cada chamada devolve no máximo 1.000 chaves e um marcador de continuação; paginateListObjectsV2 segue esses marcadores até o fim. Timeout e retries não mudam o tamanho da página, e ListObjects tem o mesmo limite por página.

Q: Um comando aws s3api list-objects-v2 em um bucket com milhões de objetos falha por timeout. O desenvolvedor quer o resultado completo. O que fazer?
- Usar --no-paginate.
+ Usar --page-size com um valor menor, para fazer mais chamadas pequenas.
- Usar --max-items 1000, que divide a listagem em partes menores e ainda devolve o resultado completo.
- Usar --query para trazer só os campos Key e Size, reduzindo o volume que a chamada precisa transferir.
E: --page-size reduz o tamanho de cada chamada sem limitar o total, evitando o timeout. --max-items corta o resultado; --query filtra no cliente depois que os dados chegam; --no-paginate traz só a primeira página.

Q: Uma aplicação recebe ProvisionedThroughputExceededException em picos curtos de tráfego. Qual ação de código é a recomendada?
+ Repetir com backoff exponencial e jitter, como os SDKs já fazem.
- Tratar como erro permanente, registrar no log e descartar a requisição para não sobrecarregar a tabela.
- Trocar as credenciais por outras com mais permissão, já que o erro indica falta de autorização na tabela.
- Repetir imediatamente em um laço até funcionar.
E: Throttling é transitório: esperas crescentes e aleatórias deixam a capacidade se recuperar sem sincronizar os clientes. Repetir imediatamente agrava o pico; descartar perde dados; e permissão não tem relação com capacidade.

Q: Um cliente sofre throttling constante e quer que o próprio SDK reduza a taxa de envio quando isso acontece. Qual configuração atende?
- Modo de retry legacy.
+ Modo de retry adaptive.
- Aumentar o connectionTimeout.
- Modo de retry standard com maxAttempts = 1.
E: O modo adaptive acrescenta limitação de taxa no lado do cliente ao comportamento do standard. Legacy é o comportamento antigo, maxAttempts = 1 desliga os retries e connectionTimeout não muda a taxa de envio.

Q: Uma função de pagamento chama uma API externa. A chamada deu timeout, mas o pagamento pode ter sido feito. A equipe quer repetir sem risco de cobrar duas vezes. O que fazer?
+ Reenviar com a mesma chave de idempotência da intenção original.
- Aumentar o timeout para nunca mais perder a resposta.
- Gerar um novo identificador de requisição a cada tentativa, para que o serviço não rejeite a repetição como duplicada.
- Não repetir; considerar a cobrança como falha.
E: Com a mesma chave, o serviço reconhece a repetição e não cria outra cobrança. Um identificador novo transforma a repetição em uma nova cobrança; timeout maior reduz o problema, mas não elimina perda de resposta; e assumir falha pode deixar um pagamento feito sem registro.

Q: Logo após enviar CreateTableCommand, o código tenta gravar na tabela e recebe ResourceNotFoundException, porque a tabela ainda está CREATING. Qual é a forma mais simples de esperar a tabela ficar pronta?
- Repetir o PutItem até funcionar, sem espera.
+ Usar waitUntilTableExists do SDK.
- Esperar 60 segundos com setTimeout depois de criar a tabela, tempo suficiente para qualquer tabela ficar ativa.
- Criar a tabela em outra Região.
E: O waiter consulta o estado até ACTIVE e para quando chega lá, com limite de tentativas. Um sleep fixo pode ser curto ou longo demais, repetir sem espera gera chamadas inúteis e mudar de Região não muda o tempo de criação.

Q: Qual destes erros NÃO deve ser repetido automaticamente?
- ThrottlingException
- ServiceUnavailable (503)
- Timeout de leitura de rede
+ ValidationException
E: ValidationException indica parâmetro inválido: a mesma requisição falhará sempre, então o certo é corrigi-la. Throttling, 503 e timeouts são transitórios e podem ter sucesso em nova tentativa.

Q: Um desenvolvedor quer verificar se tem permissão para iniciar instâncias EC2 sem criar nenhuma instância. O que ele deve usar?
- O modo de retry standard.
- --query na chamada run-instances.
- O comando aws sts get-caller-identity.
+ A opção --dry-run em run-instances.
E: Com --dry-run, o EC2 verifica a autorização e responde DryRunOperation (teria permissão) ou UnauthorizedOperation (não teria). --query só formata a saída, get-caller-identity mostra quem é você, não o que pode fazer, e retry não tem relação com permissão.

## Flashcards

F: Ordem da cadeia de credenciais do SDK (simplificada)
V: 1) credenciais no código; 2) variáveis de ambiente; 3) arquivos ~/.aws/credentials e config (perfil); 4) contêiner (task role ECS); 5) metadados da EC2 (instance profile). A primeira encontrada vence.

F: Como descobrir qual identidade o SDK/CLI está usando?
V: aws sts get-caller-identity. Devolve conta, ARN e UserId e não exige permissão.

F: Diferença entre --page-size e --max-items na CLI
V: --page-size muda o tamanho de cada chamada (mesmo resultado total, evita timeout). --max-items limita o total mostrado e devolve NextToken para continuar com --starting-token.

F: O que --query faz na CLI?
V: Filtra e formata a saída com JMESPath no lado do cliente, depois que os dados chegam. Não reduz o tempo da chamada.

F: Quais erros devem ser repetidos com backoff?
V: Transitórios: throttling (ThrottlingException, 429, ProvisionedThroughputExceededException, SlowDown), 500, 503 e timeouts. Erros 4xx de permissão ou validação devem ser corrigidos, não repetidos.

F: O que é backoff exponencial com jitter?
V: Esperar um tempo aleatório entre 0 e um teto que dobra a cada tentativa (base × 2^n, limitado). O jitter evita que muitos clientes repitam ao mesmo tempo.

F: Modos de retry do SDK
V: legacy (antigo), standard (backoff com jitter, 3 tentativas por padrão) e adaptive (standard + limitação de taxa no cliente).

F: Para que serve um waiter?
V: Para esperar um recurso chegar a um estado (ex.: waitUntilTableExists, waitUntilBucketExists) consultando periodicamente, sem escrever laço manual.

F: Como tornar segura a repetição de uma operação com efeito?
V: Usar a mesma chave de idempotência para a mesma intenção (ClientToken da API, escrita condicional com chave de negócio ou o utilitário de idempotência do Powertools).

F: Erro RequestTimeTooSkewed ou "Signature expired"
V: O relógio da máquina está errado e a assinatura SigV4 fica fora da janela aceita. Sincronize o relógio.
