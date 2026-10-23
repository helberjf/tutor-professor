# 03. Lambda: handler, ciclo de vida, configuração e limites

## Mapa da aula
Lambda é o serviço mais cobrado da prova. Esta é a primeira de quatro aulas sobre ele. Aqui você aprende:

• o que é o handler e o que chega nos parâmetros event e context;
• o ciclo de vida do ambiente de execução: Init, Invoke e Shutdown, cold start e reutilização;
• o que colocar fora do handler e o que nunca guardar lá;
• memória, CPU, timeout, armazenamento /tmp e variáveis de ambiente, com os limites numéricos;
• limites de pacote e de payload;
• logs, custo e como escolher a memória certa;
• SnapStart, para reduzir o cold start.

A aula 04 trata de invocação e concorrência; a 05, de filas e streams; a 06, de VPC, versões e aliases.

## O handler, o evento e o contexto
Uma função Lambda é um trecho de código que roda quando algo a invoca. A configuração Handler diz qual função chamar: index.handler significa "arquivo index.js (ou index.mjs), função exportada handler". Em TypeScript, você compila ou empacota o código (por exemplo, com esbuild) para JavaScript, e a Lambda executa o .js gerado no runtime Node.js (nodejs20.x, nodejs22.x).

O handler recebe dois parâmetros:

• event: os dados da invocação, em JSON convertido para dicionário. O formato depende de quem chamou: um evento do API Gateway tem httpMethod, headers e body; um do SQS tem Records com body; um do S3 tem Records com bucket e chave.
• context: informações da execução. Os mais usados em Node.js são awsRequestId (identificador da invocação, ótimo para logs), functionName, memoryLimitInMB e getRemainingTimeInMillis() (quanto tempo resta antes do timeout).

Os tipos do pacote @types/aws-lambda (Context, APIGatewayProxyEvent, SQSEvent, S3Event...) descrevem esses objetos e evitam erros de digitação nos campos do evento.

O valor retornado pelo handler vira a resposta da invocação síncrona. Uma exceção não tratada vira um erro da função. Em Node.js, escreva handlers async: a Promise resolvida é a resposta, e uma Promise rejeitada (throw) é o erro.

## O ciclo de vida do ambiente de execução
Lambda roda seu código em um ambiente de execução isolado (um micro-VM com o runtime). Ele passa por três fases:

1. Init: baixa o código, inicia as extensões e o runtime e executa o código fora do handler (imports, criação de clients, leitura de configuração). Essa fase tem limite de 10 segundos.
2. Invoke: chama o handler com o evento. Pode acontecer muitas vezes no mesmo ambiente, uma de cada vez.
3. Shutdown: quando o ambiente fica ocioso por um tempo, Lambda o encerra.

Cold start é a primeira invocação de um ambiente novo: ela paga o tempo de Init. As invocações seguintes no mesmo ambiente são warm starts e pulam o Init.

Um ambiente atende uma invocação por vez. Se chegam 10 invocações simultâneas, Lambda usa 10 ambientes.

## O que colocar fora do handler
Como o ambiente é reutilizado, o que é criado na fase de Init sobrevive entre invocações. Aproveite para:

• criar clients do SDK e conexões com banco de dados uma vez só;
• carregar configuração e modelos pesados;
• manter um cache em memória ou em /tmp, sabendo que ele pode sumir a qualquer momento.

Nunca guarde estado que precisa durar: dados do usuário, resultado de um pedido ou contadores de negócio. O próximo evento pode cair em outro ambiente, e o ambiente pode ser encerrado sem aviso. Estado durável vai para DynamoDB, S3 ou outro armazenamento.

```typescript
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

// Fase de Init: roda uma vez por ambiente.
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABELA = process.env.TABELA_PEDIDOS!;

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  // Fase de Invoke: roda a cada evento.
  const pedido = JSON.parse(event.body ?? "{}");
  if (context.getRemainingTimeInMillis() < 1_000) {
    throw new Error("tempo insuficiente para gravar com segurança");
  }
  await doc.send(new PutCommand({ TableName: TABELA, Item: { pk: pedido.id, total: pedido.total } }));
  console.log(JSON.stringify({ requestId: context.awsRequestId, pedido: pedido.id }));
  return { statusCode: 201, body: JSON.stringify({ id: pedido.id }) };
};
```

## Memória e CPU
Você configura apenas a memória, de 128 MB a 10.240 MB, em incrementos de 1 MB. A CPU é proporcional à memória: perto de 1.769 MB a função tem o equivalente a uma vCPU inteira, e no máximo chega a 6 vCPUs.

Consequências:

• Uma função lenta por CPU (compressão, criptografia, processamento de imagem) pode ficar mais rápida e até mais barata com mais memória, porque o custo é memória × tempo.
• Uma função que passa o tempo esperando rede (chamando outra API) quase não melhora com mais memória.
• Não existe configuração separada de CPU.

Você também escolhe a arquitetura: x86_64 ou arm64 (Graviton). arm64 costuma ter melhor relação preço/desempenho, desde que suas dependências nativas tenham versão para ARM.

## Timeout
O timeout vai de 1 segundo a 900 segundos (15 minutos). O padrão é 3 segundos, o que pega muita gente de surpresa: uma função que chama um banco lento falha com "Task timed out after 3.00 seconds".

Quando o timeout estoura, a execução é interrompida no ponto em que estava. Se o trabalho passa de 15 minutos, Lambda não é a ferramenta certa sozinha: divida o trabalho em partes (Step Functions, filas) ou use ECS/Fargate ou AWS Batch.

Use context.getRemainingTimeInMillis() para parar de forma controlada antes do limite, gravar o progresso e devolver um erro claro.

## Armazenamento temporário /tmp
Cada ambiente tem um diretório /tmp gravável, de 512 MB (padrão) até 10.240 MB. O resto do sistema de arquivos é somente leitura.

• /tmp sobrevive entre invocações do mesmo ambiente: bom para cache de arquivos baixados.
• /tmp não é compartilhado entre ambientes e some quando o ambiente é encerrado.
• Para arquivos que precisam ser compartilhados ou durar, use S3 ou EFS (aula 06).

Cuidado com memória: ler um arquivo inteiro de 2 GB com fs.readFile ocupa 2 GB de RAM, mesmo que o /tmp seja grande. Processe em partes, com streams do Node.js.

## Variáveis de ambiente
Variáveis de ambiente guardam configuração que muda por ambiente: nome da tabela, URL de uma API, nível de log. O tamanho total é de até 4 KB por função.

• São criptografadas em repouso com KMS. Por padrão, com uma chave gerenciada pela AWS; você pode escolher uma chave sua (customer managed key).
• Os helpers de criptografia do console criptografam o valor no lado do cliente; o código precisa chamar kms:Decrypt para ler. Isso protege o valor de quem só vê a configuração.
• Lambda define variáveis reservadas, como AWS_REGION, AWS_LAMBDA_FUNCTION_NAME e as credenciais da role.

Para segredos de verdade, com rotação, prefira Secrets Manager ou Parameter Store (aula 22). Variáveis de ambiente são lidas na fase de Init; mudar uma variável cria uma nova configuração e os próximos ambientes já nascem com o valor novo.

## Limites de pacote e de payload
Pacote de implantação:
• ZIP enviado diretamente: até 50 MB compactado.
• Tamanho descompactado (função mais layers): até 250 MB. Enviar o ZIP pelo S3 permite arquivos maiores que 50 MB compactados, mas o limite de 250 MB descompactado continua.
• Imagem de contêiner: até 10 GB.
• Até 5 layers por função.

Payload da invocação:
• Síncrona: até 6 MB de requisição e 6 MB de resposta.
• Assíncrona: até 1 MB desde outubro de 2025 (antes, 256 KB; questões antigas usam esse valor).

Quando o dado é maior, envie uma referência: grave o arquivo no S3 e passe bucket e chave no evento.

## Logs e permissões básicas
Tudo que a função escreve em stdout ou stderr vai para o CloudWatch Logs, no log group /aws/lambda/nome-da-função. Para isso, a role de execução precisa de logs:CreateLogGroup, logs:CreateLogStream e logs:PutLogEvents. A policy gerenciada AWSLambdaBasicExecutionRole tem exatamente isso.

"A função roda, mas não aparece nenhum log" quase sempre é falta dessas permissões na role.

Lambda também publica métricas automáticas no CloudWatch: Invocations, Errors, Duration, Throttles, ConcurrentExecutions e, para filas e streams, IteratorAge. Você pode escolher o formato de log JSON e o nível mínimo de log na configuração da função.

Duas permissões diferentes, que a prova adora misturar:
• Role de execução: o que a função pode fazer (ler a tabela, gravar no bucket).
• Política baseada em recurso da função: quem pode invocar a função (S3, SNS, API Gateway, outra conta).

## Custo e escolha da memória
Você paga pelo número de requisições e pela duração em GB-segundo (memória configurada × tempo de execução, cobrado por milissegundo). Arm64 tem preço por GB-segundo menor.

Para escolher a memória com dados, use o AWS Lambda Power Tuning, uma ferramenta de código aberto que roda a função com várias configurações de memória (usando Step Functions) e mostra custo e tempo de cada uma. O AWS Compute Optimizer também recomenda memória com base no uso real.

Na prova: "reduzir custo e tempo de uma função limitada por CPU" → testar mais memória; "descobrir a melhor memória" → Lambda Power Tuning.

## Reduzir o cold start
O cold start fica maior com pacotes grandes, muitas dependências e inicialização pesada. Formas de reduzir:

• Diminua o pacote: empacote com esbuild (tree shaking e minificação), importe só os clients do SDK v3 que usa (@aws-sdk/client-dynamodb, não o SDK inteiro) e tire dependências desnecessárias.
• Faça o trabalho pesado uma vez, fora do handler.
• SnapStart: Lambda executa o Init ao publicar uma versão, tira um snapshot do ambiente inicializado e retoma a partir dele. Disponível para Java, Python e .NET, em versões publicadas; não existe para Node.js, então em funções TypeScript as alavancas são o pacote pequeno e a concorrência provisionada. Cuidado com dados que precisam ser únicos (sementes aleatórias, conexões abertas): use os hooks de runtime para recriá-los depois da restauração.
• Concorrência provisionada (aula 04): mantém ambientes já inicializados, com custo fixo.

## Pegadinhas frequentes
• O timeout padrão é 3 segundos, não 15 minutos.
• CPU não se configura: aumenta junto com a memória.
• Variáveis globais e /tmp podem sobreviver entre invocações, mas nunca são garantidos. Não guarde estado de negócio neles.
• Sem logs no CloudWatch → falta AWSLambdaBasicExecutionRole na role de execução.
• Payload grande vai pelo S3; passe só a referência no evento.
• Mais memória não acelera uma função que só espera rede.

## Resumo para revisão
• Handler async (event, context) exportado (index.handler); context.getRemainingTimeInMillis() mostra o tempo restante.
• Fases: Init (até 10 s, roda o código fora do handler), Invoke, Shutdown. Cold start paga o Init.
• Memória 128 MB–10.240 MB; CPU proporcional (≈1 vCPU em 1.769 MB, até 6 vCPUs).
• Timeout 1–900 s, padrão 3 s.
• /tmp 512 MB–10.240 MB, por ambiente, não durável.
• Variáveis de ambiente: até 4 KB, criptografadas com KMS.
• Pacote: 50 MB ZIP direto, 250 MB descompactado, imagem 10 GB, 5 layers.
• Payload: 6 MB síncrono, 1 MB assíncrono (antes 256 KB).
• Logs exigem logs:CreateLogGroup/CreateLogStream/PutLogEvents.
• SnapStart (Java, Python, .NET) e concorrência provisionada reduzem cold start.

## Questões

Q: Uma função Lambda cria um client do DynamoDB dentro do handler a cada invocação. A latência média é alta, e a maior parte do tempo vem dessa criação. Qual mudança melhora o desempenho com o menor esforço?
- Criar o client em uma layer.
+ Criar o client fora do handler, para que seja reutilizado em invocações no mesmo ambiente.
- Aumentar o timeout da função.
- Guardar o client em uma variável de ambiente.
E: O código fora do handler roda uma vez por ambiente, na fase de Init, e o client fica disponível para as invocações seguintes. Timeout não muda a latência; variável de ambiente guarda texto, não objetos; e layer distribui código, mas o client ainda seria criado a cada invocação se a criação estiver no handler.

Q: Uma função que gera miniaturas de imagens leva 8 segundos com 512 MB. O uso de CPU fica em 100% durante toda a execução. A equipe quer reduzir o tempo de execução. O que fazer?
- Aumentar o armazenamento /tmp.
- Configurar mais vCPUs na seção de CPU da função.
+ Aumentar a memória da função, o que também aumenta a CPU disponível.
- Aumentar o timeout para 15 minutos.
E: Em Lambda, a CPU é alocada proporcionalmente à memória; não existe configuração separada de CPU. /tmp muda o espaço em disco, e timeout só deixa a função rodar mais tempo, sem acelerá-la. Como o custo é memória × tempo, a função pode até ficar mais barata.

Q: Uma função recém-criada consulta um banco que às vezes leva 5 segundos para responder. A função falha com "Task timed out after 3.00 seconds". Qual é a causa?
- O limite máximo de duração de uma função Lambda é 3 segundos, e não pode ser alterado na configuração.
- A função precisa de mais memória para esperar o banco.
- O banco está encerrando a conexão após 3 segundos por causa do limite de conexões ociosas configurado nele.
+ O timeout padrão de uma função é 3 segundos e não foi alterado.
E: O timeout padrão é 3 segundos; o máximo configurável é 900 segundos. A mensagem do Lambda indica que o limite da função foi atingido. Memória não muda o tempo de espera de rede, e a mensagem não vem do banco.

Q: Um processamento de vídeos leva cerca de 40 minutos por arquivo. A equipe quer usar Lambda. Qual afirmação está correta?
- É possível pedir ao suporte, pelo Service Quotas, o aumento do timeout máximo da função para 60 minutos.
- Com 10.240 MB de memória, o limite de duração dobra.
- Basta usar invocação assíncrona, que não tem limite de duração porque a execução acontece fora do ciclo da requisição.
+ A duração máxima é de 15 minutos; o trabalho precisa ser dividido ou ir para ECS/Fargate.
E: O timeout máximo é 900 segundos (15 minutos) para qualquer tipo de invocação, e não é um limite ajustável. A memória não muda esse teto. Trabalhos longos devem ser divididos (Step Functions, filas) ou executados em contêineres.

Q: Uma função baixa um modelo de 300 MB do S3 a cada invocação e depois o usa. Como reduzir o tempo sem mudar de serviço?
- Gravar o modelo em uma variável de ambiente.
- Configurar o /tmp como compartilhado entre todos os ambientes, para que o modelo seja baixado uma única vez por função.
- Guardar o modelo no pacote ZIP de 50 MB.
+ Baixar o modelo para /tmp (ou memória) na inicialização e reutilizá-lo quando já existir no ambiente.
E: /tmp e as variáveis globais sobrevivem entre invocações no mesmo ambiente, então o download acontece uma vez por ambiente; o código deve funcionar também quando o arquivo ainda não existe. Variáveis de ambiente têm limite de 4 KB, /tmp nunca é compartilhado entre ambientes e 300 MB não cabem no pacote ZIP.

Q: Uma função foi implantada, executa sem erros, mas nenhum log aparece no CloudWatch Logs. Qual é a causa mais provável?
- É preciso instalar o agente do CloudWatch na função.
+ A role de execução não tem as permissões de CloudWatch Logs da policy AWSLambdaBasicExecutionRole.
- Os logs só aparecem após 24 horas.
- A função usa console.log, mas a Lambda só envia ao CloudWatch mensagens escritas com console.error ou por uma biblioteca de log.
E: Lambda envia stdout e stderr ao CloudWatch Logs usando a role de execução, que precisa de logs:CreateLogGroup, logs:CreateLogStream e logs:PutLogEvents. console.log funciona, os logs aparecem em segundos e não há agente para instalar em Lambda.

Q: Uma aplicação precisa enviar 3 MB de dados para uma função Lambda por invocação assíncrona. O que a equipe deve fazer?
- Mudar para invocação síncrona, mesmo que o chamador não precise esperar o resultado.
+ Gravar os dados no S3 e enviar no evento apenas o bucket e a chave.
- Compactar os dados e enviar no payload, que aceita até 6 MB.
- Dividir os dados em várias variáveis de ambiente.
E: O payload assíncrono tem limite de 1 MB (6 MB é o limite síncrono). Passar uma referência ao S3 é o padrão para dados grandes. Variáveis de ambiente são configuração da função, não dados da invocação, e trocar para síncrono muda o contrato só para contornar o limite.

Q: Um desenvolvedor quer descobrir qual configuração de memória dá o menor custo para uma função, com base em execuções reais. Qual ferramenta é indicada?
- Amazon Inspector.
- AWS X-Ray com amostragem de 100%.
+ AWS Lambda Power Tuning.
- AWS Trusted Advisor.
E: O Lambda Power Tuning executa a função com várias configurações de memória e compara custo e duração. X-Ray mostra onde o tempo é gasto em uma requisição, Inspector procura vulnerabilidades e Trusted Advisor dá recomendações gerais de conta, sem testar memórias.

Q: Uma função Java tem cold starts de vários segundos por causa da inicialização do framework. A equipe quer reduzir esse tempo sem pagar por ambientes ociosos. Qual recurso atende?
- Aumentar o timeout.
+ Lambda SnapStart em uma versão publicada.
- Mover a inicialização para dentro do handler.
- Concorrência reservada.
E: SnapStart retoma o ambiente a partir de um snapshot já inicializado e não cobra ambientes ociosos como a concorrência provisionada. Concorrência reservada só limita e separa capacidade, timeout não reduz inicialização e inicializar dentro do handler pioraria todas as invocações.

Q: Qual afirmação sobre variáveis de ambiente da Lambda está correta?
- Cada invocação pode mudar o valor delas com process.env, e o novo valor passa a valer para todas as próximas invocações.
- Elas aceitam até 50 MB de dados.
- Elas são guardadas em texto puro e nunca criptografadas.
+ Elas são criptografadas em repouso com KMS e podem usar uma chave gerenciada pelo cliente.
E: As variáveis são criptografadas em repouso com KMS, por padrão com chave gerenciada pela AWS e opcionalmente com uma chave sua. O limite total é 4 KB. Elas são configuração da função: mudar o valor exige atualizar a configuração, não acontece a partir de uma invocação.

## Flashcards

F: Faixa de memória e relação com CPU na Lambda
V: 128 MB a 10.240 MB. A CPU é proporcional à memória: cerca de 1 vCPU em 1.769 MB, até 6 vCPUs no máximo.

F: Timeout da Lambda: padrão e máximo
V: Padrão 3 segundos; máximo 900 segundos (15 minutos).

F: Tamanho do /tmp na Lambda
V: De 512 MB (padrão) a 10.240 MB. É por ambiente de execução, sobrevive entre invocações do mesmo ambiente e não é durável.

F: Limites de pacote de uma função Lambda
V: ZIP direto 50 MB compactado; 250 MB descompactado (com layers); imagem de contêiner 10 GB; até 5 layers.

F: Limites de payload da Lambda
V: Síncrona: 6 MB de requisição e de resposta. Assíncrona: 1 MB (era 256 KB até outubro de 2025).

F: Fases do ambiente de execução da Lambda
V: Init (extensões, runtime e código fora do handler; até 10 s), Invoke (handler, uma invocação por vez) e Shutdown.

F: O que colocar fora do handler?
V: Clients do SDK, conexões, configuração e caches reconstruíveis. Nunca estado de negócio que precise durar.

F: Qual policy gerenciada dá à Lambda permissão de gravar logs?
V: AWSLambdaBasicExecutionRole: logs:CreateLogGroup, logs:CreateLogStream e logs:PutLogEvents.

F: Role de execução vs. política baseada em recurso da Lambda
V: Role de execução: o que a função pode fazer. Política de recurso: quem pode invocar a função.

F: O que é Lambda SnapStart?
V: Snapshot do ambiente já inicializado de uma versão publicada, que reduz o cold start. Disponível para Java, Python e .NET.
