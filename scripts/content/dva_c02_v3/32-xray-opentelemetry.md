# 32. X-Ray e OpenTelemetry: rastreamento distribuído e instrumentação do código

## Mapa da aula
Em uma aplicação com vários serviços, logs e métricas mostram que algo está lento, mas não onde. O rastreamento distribuído responde a isso. Nesta aula:

• logging, monitoramento e observabilidade: as diferenças;
• trace, segment, subsegment e o header de rastreamento;
• annotations vs. metadata e filter expressions;
• amostragem (sampling): a regra padrão e regras customizadas;
• o daemon do X-Ray, a ativação em Lambda, API Gateway, ECS e Beanstalk, e as permissões;
• instrumentar o código com o SDK e com o Powertools;
• OpenTelemetry e o AWS Distro for OpenTelemetry (ADOT), e a migração recomendada;
• como correlacionar logs, métricas e traces.

## Logging, monitoramento e observabilidade
• Logging: registrar eventos (o que aconteceu, com contexto).
• Monitoramento: acompanhar indicadores conhecidos e alertar (taxa de erro, latência, fila crescendo).
• Observabilidade: a capacidade de entender o estado interno do sistema a partir dos dados que ele emite, inclusive para perguntas que você não previu. Ela combina três sinais: logs, métricas e traces, ligados por identificadores em comum.

Uma estratégia de logging eficaz para a prova:
• logs estruturados em JSON, com nível (DEBUG, INFO, ERROR), serviço, request_id e trace_id;
• nunca registrar segredos ou dados pessoais (aula 22);
• nível de log configurável por ambiente (DEBUG em dev, INFO em prod), sem mudar código;
• métricas de negócio e de desempenho, além dos logs.

## Trace, segment e subsegment
• Trace: o caminho completo de uma requisição por todos os serviços, identificado por um trace ID.
• Segment: o trabalho feito por um serviço dentro do trace (por exemplo, a função Lambda ou a API). Contém o nome do serviço, horários, status e dados da requisição.
• Subsegment: um pedaço mais detalhado dentro de um segment: a chamada ao DynamoDB, a requisição HTTP para um parceiro, uma consulta SQL ou um bloco de código que você mediu.

O service map é o grafo dos serviços e de suas conexões, com latência, taxa de erros e volume. Ele mostra rapidamente qual dependência está lenta ou falhando.

O X-Ray classifica os problemas em errors (respostas 4xx), faults (respostas 5xx) e throttles (429).

O contexto do trace viaja entre serviços pelo header X-Amzn-Trace-Id (com Root, Parent e Sampled). Serviços integrados e os SDKs propagam esse header automaticamente; em mensagens SQS, ele vai no atributo de sistema AWSTraceHeader. Se um serviço intermediário não propagar o header, o trace se divide em pedaços desconectados.

## Annotations e metadata
• Annotations: pares chave-valor simples (string, número, booleano), indexados. Podem ser usados em filter expressions para buscar traces. Limite de 50 por trace. Exemplo: cliente_id, plano, tipo_pedido.
• Metadata: qualquer objeto, inclusive estruturas grandes, não indexado. Serve para guardar detalhes que você quer ver ao abrir o trace, mas não usar como filtro.

Filter expressions no console ou na API:
• service("api-pedidos") { fault = true }
• responsetime > 2
• annotation.cliente_id = "c-42"
• http.status = 500 AND annotation.plano = "premium"

Na prova: "buscar traces por id do cliente" → annotation. "Guardar o payload da resposta no trace para depuração, sem filtrar" → metadata.

## Amostragem
Rastrear todas as requisições custa caro e gera volume desnecessário. O X-Ray usa amostragem.

Regra padrão: a primeira requisição de cada segundo (reservatório de 1 por segundo) e 5% das requisições adicionais.

Regras customizadas (criadas no console ou na API, sem reimplantar a aplicação):
• filtros por nome do serviço, host, método HTTP, caminho e atributos;
• reservoir: quantas requisições por segundo sempre rastrear;
• rate: a porcentagem das demais;
• prioridade entre regras.

Exemplo: rastrear 100% de POST /pagamentos (rota crítica e de baixo volume) e 1% de GET /produtos (alto volume).

A amostragem decide quais requisições são registradas; requisições não amostradas não aparecem no X-Ray, mesmo que tenham dado erro. Erros devem ser também monitorados por métricas e logs.

## Onde o X-Ray é ativado
• Lambda: ative o active tracing (Tracing: Active no SAM). A Lambda cria o segment da função e envia os dados; a role de execução precisa de xray:PutTraceSegments e xray:PutTelemetryRecords (policy AWSXRayDaemonWriteAccess). Para subsegments das chamadas feitas pelo código, instrumente o código.
• API Gateway: ative o tracing no stage; a API cria seu segment e propaga o header.
• EC2 e on-premises: rode o daemon do X-Ray na instância.
• ECS: rode o daemon (ou o ADOT Collector) como contêiner sidecar na tarefa, com a porta UDP 2000 acessível ao contêiner da aplicação; a task role precisa das permissões de escrita no X-Ray.
• Elastic Beanstalk: ative a opção do daemon do X-Ray na configuração do ambiente.
• SQS, SNS, Step Functions e EventBridge propagam ou geram dados de trace.

O daemon escuta na porta UDP 2000, junta os segments enviados pelo SDK e os envia em lote para a API do X-Ray. O SDK descobre o endereço pela variável AWS_XRAY_DAEMON_ADDRESS.

## Instrumentar o código
Com o Tracer do Powertools for AWS Lambda (TypeScript) ou com o SDK do X-Ray para Node.js (aws-xray-sdk-core), você:
• instrumenta os clients do SDK v3 automaticamente (tracer.captureAWSv3Client ou AWSXRay.captureAWSv3Client), criando subsegments para cada chamada, e também chamadas HTTPS;
• cria subsegments para trechos do seu código;
• adiciona annotations e metadata.

A variável AWS_XRAY_CONTEXT_MISSING define o que acontece se o código tentar registrar dados sem um segment ativo (por exemplo, em testes): LOG_ERROR registra um erro e segue; RUNTIME_ERROR lança exceção.

```typescript
import { Tracer } from "@aws-lambda-powertools/tracer";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEvent } from "aws-lambda";

const tracer = new Tracer({ serviceName: "pedidos" });
// Cria subsegments automaticamente para cada chamada ao DynamoDB.
const doc = DynamoDBDocumentClient.from(tracer.captureAWSv3Client(new DynamoDBClient({})));

export const handler = async (event: APIGatewayProxyEvent) => {
  const pedido = JSON.parse(event.body ?? "{}");
  tracer.putAnnotation("cliente_id", pedido.clienteId);           // pesquisável
  const sub = tracer.getSegment()?.addNewSubsegment("calcular_frete");
  const frete = await calcularFrete(pedido);
  sub?.addMetadata("detalhes_frete", frete);                       // só para leitura
  sub?.close();
  await doc.send(new PutCommand({ TableName: process.env.TABELA!, Item: { ...pedido, frete: frete.valor } }));
  return { statusCode: 201, body: JSON.stringify({ frete: frete.valor }) };
};
```

## OpenTelemetry e ADOT
OpenTelemetry (OTel) é um padrão aberto, independente de fornecedor, para gerar e enviar traces, métricas e logs (API, SDKs e o protocolo OTLP).

O AWS Distro for OpenTelemetry (ADOT) é a distribuição suportada pela AWS:
• SDKs e auto-instrumentação para várias linguagens;
• o ADOT Collector, com receivers (recebem dados), processors (agrupam, filtram, amostram) e exporters (enviam ao X-Ray, CloudWatch, Prometheus ou outros);
• layer para Lambda e imagem de contêiner para sidecars em ECS e EKS.

Situação atual: os SDKs e o daemon do X-Ray entraram em modo de manutenção em 25/02/2026 (só correções críticas) e têm fim de suporte em 25/02/2027. A recomendação da AWS é instrumentar novas aplicações com OpenTelemetry (ADOT), mantendo o X-Ray como destino dos traces. Na prova, os conceitos de segment, annotation, sampling e daemon continuam valendo.

Vantagem do OTel: a mesma instrumentação pode mandar dados para mais de uma ferramenta, sem reescrever o código.

## Correlacionar logs, métricas e traces
Os três sinais só ajudam juntos se compartilharem identificadores:
• inclua o trace_id e o request_id em cada linha de log (o Logger do Powertools faz isso);
• use as mesmas dimensões (serviço, ambiente, operação) em métricas e logs;
• propague o contexto de trace por todas as fronteiras: HTTP, filas, eventos;
• em bibliotecas novas ou integrações sem suporte automático, propague o contexto manualmente; uma biblioteca HTTP sem instrumentação faz a chamada funcionar, mas a dependência some do trace.

CloudWatch Application Signals e o console do CloudWatch reúnem traces, métricas e logs relacionados de um serviço, para ir do alarme ao trace e aos logs do mesmo instante.

## Pegadinhas frequentes
• Annotation é indexada e pesquisável; metadata, não.
• Amostragem padrão: 1 requisição por segundo + 5% das demais.
• Regras de amostragem mudam no console, sem reimplantar.
• Daemon do X-Ray: UDP 2000; em ECS, sidecar.
• Lambda: active tracing + xray:PutTraceSegments e PutTelemetryRecords na role.
• Sem propagação do header, o trace fica quebrado.
• Errors = 4xx, faults = 5xx, throttles = 429.
• SDK/daemon do X-Ray em manutenção desde 02/2026: novas instrumentações com OpenTelemetry (ADOT).

## Resumo para revisão
• Observabilidade = logs + métricas + traces correlacionados; logs estruturados com request_id e trace_id.
• Trace (requisição inteira), segment (um serviço), subsegment (chamada ou bloco); service map.
• Header X-Amzn-Trace-Id; AWSTraceHeader no SQS.
• Annotations (indexadas, até 50, filter expressions) vs. metadata (não indexada).
• Sampling padrão: 1/s + 5%; regras customizadas com reservoir e rate.
• Daemon: UDP 2000, envia em lote; Lambda active tracing; API Gateway por stage; ECS sidecar; Beanstalk por opção.
• Permissões: xray:PutTraceSegments, xray:PutTelemetryRecords (AWSXRayDaemonWriteAccess).
• Código: captureAWSv3Client, addNewSubsegment, putAnnotation, addMetadata (Powertools Tracer ou aws-xray-sdk-core); AWS_XRAY_DAEMON_ADDRESS e AWS_XRAY_CONTEXT_MISSING.
• OpenTelemetry/ADOT: SDK + Collector (receivers, processors, exporters) para X-Ray e CloudWatch.

## Questões

Q: Uma requisição passa por API Gateway, três funções Lambda e uma tabela DynamoDB, e às vezes leva 8 segundos. A equipe precisa descobrir em qual etapa o tempo é gasto. Qual ferramenta usar?
- AWS Config.
- CloudTrail.
- Um metric filter de erros em cada log group, somando a duração das chamadas em uma métrica.
+ AWS X-Ray (ou OpenTelemetry com exportação para o X-Ray), com tracing ativo em cada serviço.
E: O rastreamento distribuído mostra a linha do tempo da requisição por serviço e por chamada. CloudTrail registra chamadas de API de gerenciamento, Config registra configurações e um metric filter de erros não mostra onde está a latência.

Q: A equipe quer filtrar no X-Ray todos os traces de um cliente específico. Como registrar o id do cliente?
+ Como annotation, que é indexada e pode ser usada em filter expressions.
- No nome do segment.
- Como metadata.
- Como uma métrica customizada.
E: Annotations são indexadas e pesquisáveis (annotation.cliente_id = "c-42"). Metadata não é indexada, métricas não filtram traces e colocar o id no nome do segment fragmenta o service map.

Q: Uma função Lambda teve o active tracing ativado, mas nenhum trace aparece no X-Ray e os logs mostram erro de acesso negado ao enviar segments. O que falta?
- Rodar o daemon do X-Ray em uma instância EC2.
- Aumentar a memória da função.
+ Permissões xray:PutTraceSegments e xray:PutTelemetryRecords na role de execução.
- Ativar o CloudTrail.
E: Com active tracing, a Lambda envia os dados usando a role de execução, que precisa das permissões de escrita do X-Ray. Na Lambda não é preciso rodar um daemon próprio, e CloudTrail e memória não têm relação.

Q: Uma aplicação em ECS foi instrumentada com o SDK do X-Ray, mas os traces não chegam. O que é necessário na task?
- O CloudWatch agent instalado na instância, com a role da instância enviando os traces de todas as tarefas.
- Uma Function URL.
+ Um sidecar com o daemon do X-Ray (ou ADOT Collector) na porta UDP 2000 e escrita no X-Ray na task role.
- Um log group com retenção de 1 dia, para onde o SDK do X-Ray grava os segments que o serviço do X-Ray lê depois.
E: Em ECS, o SDK envia segments para o daemon, que roda como sidecar e encaminha ao X-Ray com as permissões da task role. Function URL, CloudWatch agent e retenção de logs não enviam traces.

Q: Uma API de alto volume gera custos altos de rastreamento. A equipe quer rastrear 100% das requisições de POST /pagamentos e apenas 1% das demais, sem reimplantar a aplicação. O que fazer?
+ Criar regras de amostragem customizadas no X-Ray com prioridade, reservoir e rate por rota.
- Mudar a taxa de amostragem no código de cada rota e reimplantar a aplicação sempre que precisar ajustar.
- Remover a instrumentação das rotas de alto volume e manter o tracing apenas em POST /pagamentos.
- Desativar o active tracing.
E: Regras de amostragem são configuradas no serviço e aplicadas pelo SDK sem novo deploy. Remover a instrumentação ou desativar o tracing perde a visibilidade, e mudar o código exige reimplantação.

Q: Qual é o comportamento da regra de amostragem padrão do X-Ray?
- Rastrear apenas requisições que terminam com erro ou falha, descartando as bem-sucedidas.
- Rastrear 1% das requisições.
+ Rastrear a primeira requisição de cada segundo e 5% das requisições adicionais.
- Rastrear 100% das requisições.
E: A regra padrão tem reservatório de uma requisição por segundo e taxa de 5% para as demais. Ela não seleciona por erro nem rastreia tudo.

Q: Um trace mostra o API Gateway e a primeira função, mas a função que consome a fila SQS seguinte aparece em um trace separado. Qual é a causa provável?
+ O contexto de trace não foi propagado (por exemplo, pelo atributo AWSTraceHeader da mensagem).
- O sampling está em 100%.
- A fila é FIFO.
- A função consumidora tem memória baixa, e o X-Ray descarta segmentos de funções sem memória livre.
E: Quando o header de trace não é propagado, o próximo serviço inicia um trace novo. Tipo da fila, memória e taxa de amostragem não quebram a ligação entre os segmentos.

Q: Uma equipe vai instrumentar uma nova aplicação em 2026 e quer evitar ficar presa a uma ferramenta, mantendo os traces no X-Ray. Qual é a recomendação atual da AWS?
- Usar apenas métricas do CloudWatch.
+ Instrumentar com OpenTelemetry (AWS Distro for OpenTelemetry) e exportar os traces para o X-Ray.
- Escrever os traces manualmente no CloudWatch Logs.
- Usar o SDK do X-Ray, que está em desenvolvimento ativo e é a única forma de enviar traces ao X-Ray.
E: Os SDKs e o daemon do X-Ray estão em modo de manutenção desde fevereiro de 2026, e a AWS recomenda OpenTelemetry (ADOT), que pode exportar para o X-Ray e outras ferramentas. Logs manuais e métricas não substituem traces.

Q: Os desenvolvedores querem ir de uma linha de log com erro direto para o trace da mesma requisição. O que precisam fazer?
- Criar um alarme composto.
- Usar metadata em vez de annotations, copiando a linha de log inteira para dentro do trace.
+ Incluir o trace_id (e o request_id) em cada linha de log estruturado.
- Aumentar a retenção dos logs.
E: Com o trace_id no log, é possível buscar o trace correspondente e vice-versa (o Logger do Powertools faz isso). Retenção, alarmes e o tipo de dado no trace não criam essa ligação.

Q: Ao rodar testes unitários de uma função instrumentada com o SDK do X-Ray, os testes falham com exceção porque não há segment ativo. Como evitar isso sem remover a instrumentação?
+ Definir AWS_XRAY_CONTEXT_MISSING como LOG_ERROR (ou desativar o SDK nos testes).
- Usar annotations no lugar de subsegments.
- Aumentar o sampling para 100%.
- Iniciar o daemon do X-Ray na máquina de testes, que cria automaticamente o segment ausente.
E: AWS_XRAY_CONTEXT_MISSING controla o que ocorre sem segment ativo: LOG_ERROR registra e continua, RUNTIME_ERROR lança exceção. Um daemon local não cria o segment da função, e sampling ou annotations não resolvem a falta de contexto.

## Flashcards

F: Trace, segment e subsegment
V: Trace: requisição inteira (trace ID). Segment: trabalho de um serviço. Subsegment: chamada a dependência ou bloco de código dentro de um segment.

F: Annotations vs. metadata no X-Ray
V: Annotations: chave-valor simples, indexadas, pesquisáveis em filter expressions (até 50 por trace). Metadata: qualquer objeto, não indexado.

F: Regra de amostragem padrão do X-Ray
V: Primeira requisição de cada segundo (reservoir 1/s) + 5% das requisições adicionais. Regras customizadas mudam sem reimplantar.

F: Daemon do X-Ray
V: Escuta na porta UDP 2000, junta segments e envia em lote à API. Em ECS, roda como sidecar; em EC2, na instância. Endereço: AWS_XRAY_DAEMON_ADDRESS.

F: Como ativar X-Ray na Lambda?
V: Active tracing (Tracing: Active) + xray:PutTraceSegments e xray:PutTelemetryRecords na role (AWSXRayDaemonWriteAccess). Instrumente o código para subsegments.

F: Header de propagação do X-Ray
V: X-Amzn-Trace-Id (Root, Parent, Sampled). No SQS, vai no atributo de sistema AWSTraceHeader.

F: Errors, faults e throttles no X-Ray
V: Errors: respostas 4xx. Faults: 5xx. Throttles: 429.

F: AWS_XRAY_CONTEXT_MISSING
V: Define o comportamento sem segment ativo: LOG_ERROR (registra e segue) ou RUNTIME_ERROR (lança exceção).

F: O que é o ADOT?
V: AWS Distro for OpenTelemetry: SDKs, auto-instrumentação e Collector (receivers, processors, exporters) que enviam traces ao X-Ray e métricas ao CloudWatch e a outras ferramentas.

F: Situação do SDK e do daemon do X-Ray em 2026
V: Em modo de manutenção desde 25/02/2026 e fim de suporte em 25/02/2027. Novas instrumentações devem usar OpenTelemetry (ADOT).
