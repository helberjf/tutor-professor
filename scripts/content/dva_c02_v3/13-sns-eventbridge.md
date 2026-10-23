# 13. SNS e EventBridge: fan-out, filtros e arquitetura orientada a eventos

## Mapa da aula
Nesta aula você aprende a distribuir eventos para vários consumidores:

• SNS: tópicos, assinaturas, fan-out com SQS e tópicos FIFO;
• filtros de assinatura do SNS, por atributo ou por corpo;
• retries e DLQ de assinaturas;
• EventBridge: barramentos, formato do evento, regras e padrões;
• alvos, transformação de entrada, retries e DLQ;
• archive e replay, schema registry, Scheduler e Pipes;
• quando usar SNS, EventBridge ou SQS, e coreografia vs. orquestração.

## SNS: publicar uma vez, entregar a muitos
O Amazon SNS funciona com tópicos. Um publicador chama Publish no tópico, e o SNS entrega uma cópia da mensagem a cada assinatura.

Tipos de assinantes: filas SQS, funções Lambda, endpoints HTTP/HTTPS, e-mail, SMS, notificações push para celular e Amazon Data Firehose.

Características:
• Push: o SNS empurra a mensagem para os assinantes; ele não guarda mensagens para serem lidas depois. Se você precisa de armazenamento e processamento no ritmo do consumidor, coloque uma fila SQS como assinante.
• A Lambda é invocada pelo SNS de forma assíncrona (com os retries da aula 04).
• Atributos de mensagem carregam metadados (tipo do evento, país), usados por filtros.
• Raw message delivery: para assinantes SQS e HTTP, entrega só o corpo, sem o envelope JSON do SNS.

## Fan-out com SNS e SQS
O padrão fan-out é: um tópico SNS com várias filas SQS assinantes, uma por sistema consumidor.

• Cada sistema recebe sua cópia e processa no próprio ritmo.
• Se um sistema fica fora do ar, as mensagens esperam na fila dele.
• Adicionar um consumidor novo é só criar outra fila e assinar o tópico, sem mudar o publicador.

Para funcionar, a política de cada fila precisa permitir sqs:SendMessage ao principal sns.amazonaws.com, com a condição aws:SourceArn igual ao ARN do tópico. Se a fila usar SSE-KMS com chave do cliente, a key policy precisa permitir ao SNS usar a chave.

Exemplo clássico: um upload no S3 notifica um tópico SNS, que entrega a uma fila de miniaturas, a uma fila de análise e a uma fila de auditoria.

Tópicos FIFO: garantem ordem por MessageGroupId e deduplicação, como filas FIFO, e entregam para filas SQS. Use quando a ordem precisa ser preservada no fan-out.

## Filtros de assinatura
Sem filtro, cada assinante recebe todas as mensagens do tópico. Uma filter policy na assinatura faz o SNS entregar apenas o que interessa àquele assinante.

• Escopo MessageAttributes (padrão): o filtro olha os atributos de mensagem.
• Escopo MessageBody: o filtro olha campos do corpo JSON.

Operadores: valor exato, lista de valores, anything-but (qualquer valor exceto), prefix, intervalos numéricos e exists.

Filtrar no SNS é melhor do que entregar tudo e descartar no consumidor: menos invocações, menos custo e menos código.

Com a policy abaixo, a fila só recebe pedidos criados ou pagos, de valor maior ou igual a 1.000, de fora do Brasil. As mensagens que não passam no filtro não são entregues àquela assinatura, mas continuam indo para as outras.

```json
{
  "tipo_evento": ["PEDIDO_CRIADO", "PEDIDO_PAGO"],
  "valor": [{"numeric": [">=", 1000]}],
  "pais": [{"anything-but": "BR"}]
}
```

## Entrega, retries e DLQ no SNS
O SNS tenta entregar várias vezes, conforme uma política de retry que depende do tipo de assinante (endpoints HTTP podem ter política customizada).

Se a entrega falhar de vez (por exemplo, a fila foi apagada ou a política da fila nega o envio), a mensagem é descartada, a menos que a assinatura tenha uma redrive policy com uma DLQ SQS. A DLQ é configurada por assinatura.

Delivery status logging grava no CloudWatch Logs o resultado das entregas para alguns tipos de assinante, útil para investigar falhas.

Diferença importante: a DLQ do SNS guarda mensagens que não puderam ser entregues ao assinante. Se a mensagem chegou à fila e o consumidor falhou, quem trata é a DLQ da própria fila.

## EventBridge: barramento e formato do evento
O Amazon EventBridge é um barramento de eventos com roteamento por conteúdo.

Barramentos:
• default: recebe eventos de serviços AWS (EC2 mudou de estado, CodePipeline falhou, objeto criado no S3 quando ligado).
• custom: para eventos da sua aplicação, enviados com PutEvents.
• partner: eventos de parceiros SaaS (Zendesk, Datadog, Shopify...).

Todo evento tem o mesmo envelope:

```json
{
  "version": "0",
  "id": "4f6b...",
  "detail-type": "PedidoCriado",
  "source": "loja.pedidos",
  "account": "111122223333",
  "time": "2026-10-23T12:00:00Z",
  "region": "sa-east-1",
  "resources": [],
  "detail": {"pedido_id": "p-91", "valor": 1500, "pais": "BR"}
}
```

## Regras e padrões de evento
Uma regra liga eventos a alvos. Ela pode ter:

• um event pattern: o evento só dispara a regra se combinar com o padrão. Exemplo: {"source": ["loja.pedidos"], "detail-type": ["PedidoCriado"], "detail": {"valor": [{"numeric": [">", 1000]}]}};
• ou um agendamento (cron ou rate), embora para agendamentos o recomendado hoje seja o EventBridge Scheduler.

Os padrões aceitam valor exato, prefix, suffix, anything-but, numeric, exists, wildcard e combinações com $or. Campos ausentes no padrão são ignorados.

Cada regra pode ter até 5 alvos. Alvos comuns: Lambda, SQS, SNS, Step Functions, Kinesis, Data Firehose, tarefas ECS, outro barramento (inclusive de outra conta ou Região) e API destinations (endpoints HTTP de terceiros, com autenticação e limite de taxa).

Input transformer: muda o formato do evento antes de entregar ao alvo, extraindo campos e montando um novo JSON.

## Retries, DLQ, archive e replay
• Cada alvo tem uma retry policy: idade máxima do evento (até 24 horas) e número de tentativas (até 185). Depois disso, o evento pode ir para uma DLQ SQS do alvo.
• O EventBridge precisa de permissão para chamar o alvo: política de recurso na Lambda, política na fila ou no tópico, ou uma role IAM para alvos como Step Functions e Kinesis.
• Archive: guarda os eventos de um barramento (todos ou filtrados por padrão) por um período.
• Replay: reenvia eventos do archive para o barramento, por exemplo depois de corrigir um bug no consumidor ou para testar um consumidor novo.

Envio de eventos próprios: PutEvents aceita até 10 eventos por chamada. A resposta tem FailedEntryCount; entradas com falha precisam ser reenviadas pelo código, como em BatchWriteItem.

## Schema registry, Scheduler e Pipes
• Schema registry e discovery: o EventBridge pode descobrir o formato dos eventos de um barramento e guardar o schema. A partir dele, você baixa code bindings (classes em Java, Python, TypeScript) para trabalhar com eventos tipados.
• EventBridge Scheduler: agenda invocações únicas ("enviar lembrete em 10/11 às 9h") ou recorrentes (cron e rate), com fuso horário, janela flexível e milhões de agendamentos. Substitui regras agendadas e cron em servidor.
• EventBridge Pipes: liga uma origem (SQS, Kinesis, DynamoDB Streams, MQ, Kafka) a um alvo, com filtro e enriquecimento opcionais no meio (por exemplo, uma Lambda ou chamada de API que completa os dados). É integração ponto a ponto sem código de cola.

## SNS, EventBridge ou SQS?
• SQS: fila para um consumidor (ou um grupo de consumidores competindo) processar no seu ritmo. Guarda mensagens.
• SNS: fan-out de alta vazão para muitos assinantes, inclusive e-mail, SMS e push, com filtros por atributo ou corpo.
• EventBridge: roteamento por conteúdo com regras ricas, eventos de serviços AWS e SaaS, schema registry, archive/replay, muitos tipos de alvo e envio entre contas.

Na prova:
• "Reagir a um evento de um serviço AWS" (instância parou, pipeline falhou) → EventBridge.
• "Integrar com um SaaS parceiro" → EventBridge partner bus.
• "Reprocessar eventos do passado" → archive e replay do EventBridge.
• "Enviar SMS ou e-mail para usuários" → SNS.
• "Vários consumidores com filas próprias" → SNS + SQS (ou EventBridge com alvos SQS).

## Coreografia e orquestração
Duas formas de coordenar microsserviços:

• Coreografia: cada serviço publica eventos e reage aos eventos dos outros, sem um coordenador central (SNS, EventBridge). Baixo acoplamento e fácil de estender, mas o fluxo completo fica espalhado e mais difícil de acompanhar.
• Orquestração: um coordenador central chama cada etapa, controla a ordem, os retries e as compensações (AWS Step Functions, aula 15). Fluxo explícito e visível, com mais acoplamento ao orquestrador.

Regra prática: eventos de domínio que vários sistemas podem querer saber ("pedido criado") → coreografia. Processo com etapas que dependem umas das outras e precisam de tratamento de erro ("cobrar, reservar estoque, emitir nota, compensar em caso de falha") → orquestração.

## Pegadinhas frequentes
• SNS não guarda mensagens; coloque SQS como assinante para durabilidade.
• Fan-out exige política na fila permitindo o tópico (e permissão na chave KMS, se houver).
• Filter policy fica na assinatura, não no tópico.
• DLQ do SNS é por assinatura e cobre falha de entrega, não falha de processamento.
• EventBridge precisa de permissão para invocar o alvo.
• PutEvents pode ter falhas parciais (FailedEntryCount).
• Agendamentos novos: EventBridge Scheduler.

## Resumo para revisão
• SNS: tópico → assinaturas (SQS, Lambda, HTTP, e-mail, SMS, push, Firehose). Push, sem armazenamento.
• Fan-out SNS + SQS; tópicos FIFO para ordem.
• Filter policy por assinatura: MessageAttributes ou MessageBody; exato, anything-but, prefix, numeric, exists.
• DLQ SQS por assinatura; raw message delivery.
• EventBridge: barramentos default, custom e partner; envelope com source, detail-type e detail.
• Regras com padrões; até 5 alvos; input transformer; retry até 24 h/185 tentativas; DLQ.
• Archive e replay; schema registry; Scheduler; Pipes.
• Coreografia (eventos) vs. orquestração (Step Functions).

## Questões

Q: Quando um pedido é criado, o sistema de estoque, o de faturamento e o de análise precisam receber o evento. Cada um processa no seu ritmo, e um sistema fora do ar não pode perder eventos. Qual desenho atende?
+ Um tópico SNS com uma fila SQS assinante para cada sistema.
- Uma função Lambda que chama os três sistemas em sequência.
- Uma fila SQS lida pelos três sistemas.
- Um tópico SNS com os três sistemas assinando por HTTP.
E: O fan-out SNS + SQS entrega uma cópia a cada fila, e cada fila guarda as mensagens até o sistema processar. Em uma fila única, cada mensagem vai para um só consumidor; assinaturas HTTP não guardam mensagens se o sistema estiver fora; e a Lambda em sequência acopla os sistemas.

Q: Uma fila SQS assina um tópico SNS e só deve receber eventos em que o atributo "regiao" seja "sul". Qual é a forma com menos código?
- Uma regra de lifecycle na fila.
- O consumidor lê todas as mensagens e descarta, no próprio código, as que não forem do sul.
- Um tópico separado para cada região, com o publicador escolhendo o tópico.
+ Uma filter policy na assinatura com {"regiao": ["sul"]}.
E: A filter policy da assinatura faz o SNS entregar só o que combina, sem código no consumidor. Descartar no consumidor gasta processamento; um tópico por região obriga a mudar o publicador; e filas SQS não têm lifecycle.

Q: Uma equipe precisa disparar uma função sempre que uma instância EC2 de produção mudar para o estado "stopped". Qual serviço usar com menos esforço?
- Um tópico SNS assinado pela instância.
- Um script no cron da instância.
+ Uma regra do EventBridge no barramento default para o evento de mudança de estado do EC2.
- Uma fila SQS consultada pela função a cada minuto.
E: Serviços AWS publicam eventos no barramento default do EventBridge, e uma regra com padrão filtra o evento desejado. A instância não publica no SNS por conta própria, polling de fila não recebe esse evento e um script na instância parada não roda.

Q: Um bug no consumidor de eventos fez com que eventos de ontem fossem processados errado. A equipe corrigiu o código e quer processar de novo os eventos das últimas 24 horas. Qual recurso permite isso, se configurado antes?
+ Archive e replay do EventBridge.
- O long polling do SQS.
- A raw message delivery do SNS.
- A DLQ do SNS, que guarda todas as mensagens entregues nas últimas 24 horas.
E: O archive guarda eventos do barramento, e o replay os reenvia para reprocessamento. A DLQ do SNS só tem mensagens que falharam na entrega, long polling é forma de consulta e raw delivery só muda o formato.

Q: Uma regra do EventBridge aponta para uma função Lambda, mas a função nunca é invocada, embora os eventos combinem com o padrão. Qual é a causa mais provável?
- A regra precisa de um input transformer, porque a Lambda não aceita o formato original do evento do EventBridge.
+ A política baseada em recurso da função não permite events.amazonaws.com invocá-la.
- A função não tem concorrência provisionada, exigida para alvos do EventBridge que recebem eventos de regras.
- O barramento precisa de long polling.
E: O EventBridge precisa de permissão lambda:InvokeFunction na política de recurso da função (o console cria automaticamente, mas por IaC é fácil esquecer). Concorrência provisionada, polling e input transformer não são requisitos para invocar.

Q: Uma aplicação precisa enviar lembretes por e-mail exatamente às 9h de cada cliente, em fusos horários diferentes, com milhões de agendamentos únicos. Qual serviço atende melhor?
+ EventBridge Scheduler com agendamentos únicos e fuso horário.
- Um cron em uma instância EC2.
- Timers de mensagem SQS de 15 minutos encadeados, reenviando a mensagem até chegar o horário de cada cliente.
- Uma regra agendada do EventBridge para cada cliente.
E: O Scheduler foi feito para milhões de agendamentos, únicos ou recorrentes, com suporte a fuso horário. Regras agendadas têm cotas baixas por conta, encadear timers de 15 minutos é frágil e um cron em servidor exige operação.

Q: Uma integração deve ler mensagens de uma fila SQS, enriquecer cada uma com dados de uma API e enviar o resultado para uma máquina de estados do Step Functions, sem escrever código de integração. Qual recurso atende?
+ Um EventBridge Pipe com origem SQS, etapa de enriquecimento e alvo Step Functions.
- Uma regra do EventBridge com alvo SQS.
- Um event source mapping da fila com BisectBatchOnFunctionError, que enriquece e encaminha cada lote para o Step Functions.
- Um tópico SNS com filtro por corpo.
E: Pipes conecta uma origem a um alvo com filtro e enriquecimento opcionais, sem código de cola. Regras recebem eventos de barramentos, não fazem polling de filas; SNS não lê de SQS; e bisect é configuração de erro de streams.

Q: Um processo de pedido precisa cobrar o cliente, reservar estoque e emitir a nota, nessa ordem. Se a reserva falhar, a cobrança deve ser estornada. A equipe quer ver o estado de cada pedido em um só lugar. Qual abordagem é a mais adequada?
- Fan-out com SNS para os três serviços ao mesmo tempo.
+ Orquestração com AWS Step Functions, incluindo etapas de compensação.
- Uma fila SQS FIFO por etapa, sem coordenador.
- Coreografia com eventos no EventBridge, cada serviço reagindo ao anterior.
E: Etapas dependentes com compensação e visão central do fluxo pedem orquestração, e o Step Functions mostra o histórico de cada execução. Coreografia espalha o fluxo entre serviços, o fan-out executaria as etapas em paralelo e filas sem coordenador não tratam compensação.

Q: Mensagens publicadas em um tópico SNS não chegam a uma das assinaturas HTTP porque o endpoint ficou fora do ar por horas. A equipe quer guardar essas mensagens para reenviar depois. O que configurar?
- Archive no tópico SNS.
+ Uma redrive policy com uma DLQ SQS na assinatura HTTP.
- Long polling no endpoint HTTP.
- Uma DLQ na fila SQS de outra assinatura do mesmo tópico, que também recebe as falhas da assinatura HTTP.
E: A DLQ do SNS é configurada por assinatura e recebe as mensagens que não puderam ser entregues depois dos retries. Uma DLQ de outra assinatura não recebe as falhas desta, o SNS não tem archive como o EventBridge e long polling é recurso do SQS.

Q: Um produtor envia 10 eventos por chamada com PutEvents. Às vezes, alguns eventos não chegam, mas nenhuma exceção é lançada. O que o código deve verificar?
- O tamanho do barramento.
+ O campo FailedEntryCount e as entradas com erro na resposta, reenviando essas entradas.
- O código HTTP da resposta, que vem 202 quando todas as entradas foram aceitas e 207 quando alguma falhou.
- O ReceiptHandle de cada evento.
E: PutEvents pode aceitar parte das entradas; a resposta indica quantas falharam e quais, e o código precisa reenviá-las. ReceiptHandle é do SQS, o código HTTP da chamada não indica falhas parciais e barramentos não têm tamanho a verificar.

## Flashcards

F: O que é o padrão fan-out?
V: Publicar uma vez em um tópico SNS (ou EventBridge) e entregar cópias a vários assinantes, normalmente uma fila SQS por consumidor.

F: Assinantes possíveis de um tópico SNS
V: SQS, Lambda, HTTP/HTTPS, e-mail, SMS, push mobile e Amazon Data Firehose.

F: Onde fica a filter policy do SNS e o que ela filtra?
V: Na assinatura. Filtra por atributos de mensagem (padrão) ou pelo corpo (MessageBody), com exato, anything-but, prefix, numeric e exists.

F: Permissão para o SNS entregar a uma fila SQS
V: Política da fila permitindo sqs:SendMessage a sns.amazonaws.com com aws:SourceArn do tópico (e permissão na chave KMS, se a fila usar chave própria).

F: Tipos de barramento do EventBridge
V: default (eventos de serviços AWS), custom (eventos da aplicação via PutEvents) e partner (SaaS).

F: Campos principais de um evento do EventBridge
V: source, detail-type, detail, account, region, time, id e resources.

F: Quantos alvos uma regra do EventBridge pode ter?
V: Até 5. Cada alvo tem retry policy (até 24 h e 185 tentativas) e DLQ SQS opcional.

F: Para que servem archive e replay?
V: Archive guarda eventos de um barramento; replay os reenvia para reprocessar ou testar consumidores.

F: EventBridge Scheduler vs. EventBridge Pipes
V: Scheduler: agendamentos únicos ou recorrentes, com fuso, em larga escala. Pipes: origem (SQS, Kinesis, Streams) → filtro → enriquecimento → alvo.

F: Coreografia vs. orquestração
V: Coreografia: serviços reagem a eventos sem coordenador (SNS/EventBridge). Orquestração: coordenador central controla etapas, erros e compensações (Step Functions).
