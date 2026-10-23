# 14. Kinesis Data Streams e Data Firehose: streaming de dados

## Mapa da aula
Quando a questão fala em "tempo real", "telemetria", "cliques", "logs em streaming" ou "reprocessar", pense em Kinesis. Nesta aula:

• como um stream é organizado: shards, partition keys e números de sequência;
• limites de escrita e leitura por shard e os modos provisionado e sob demanda;
• ProvisionedThroughputExceededException e o shard quente;
• consumidores: modo compartilhado e enhanced fan-out;
• KCL e KPL;
• resharding;
• Amazon Data Firehose para entregar dados em S3, Redshift e OpenSearch;
• Kinesis ou SQS?

## Stream, shard e registro
Um Kinesis Data Stream é uma sequência ordenada de registros, dividida em shards.

Cada registro tem:
• partition key: uma string escolhida pelo produtor. O Kinesis calcula um hash dela para decidir em qual shard o registro vai. Mesma partition key → mesmo shard → ordem preservada;
• sequence number: atribuído pelo Kinesis, crescente dentro do shard;
• data: o conteúdo (blob), tradicionalmente de até 1 MB.

Diferente de uma fila, ler um registro não o remove. Os registros ficam no stream durante o período de retenção: 24 horas por padrão, ampliável até 365 dias. Vários consumidores podem ler os mesmos dados, cada um na sua posição, e é possível voltar e reler (replay).

## Capacidade: shards e modos
Modo provisionado: você define o número de shards. Cada shard suporta:
• escrita: 1 MB por segundo ou 1.000 registros por segundo;
• leitura: 2 MB por segundo, compartilhados entre os consumidores no modo padrão, com até 5 chamadas GetRecords por segundo.

Exemplo: um produtor envia 5.000 registros por segundo de 0,5 KB (2,5 MB/s). Pela contagem de registros, precisa de 5 shards; pelo volume, de 3. Vale o maior: 5 shards.

Modo sob demanda (on-demand): o stream ajusta a capacidade automaticamente conforme o tráfego, e você paga pelo volume. Bom quando o tráfego é imprevisível ou quando não se quer gerenciar shards.

## Shard quente e ProvisionedThroughputExceededException
O produtor recebe ProvisionedThroughputExceededException quando escreve em um shard além do limite dele. Duas causas:

1. O stream inteiro tem poucos shards para o volume.
2. O stream tem shards suficientes, mas a partition key é ruim e concentra o tráfego em um shard (shard quente). Exemplo: usar a data do dia ou o tipo do evento como chave.

Correções:
• repetir com backoff exponencial (os SDKs fazem isso);
• escolher uma partition key de alta cardinalidade (id do dispositivo, id do usuário);
• aumentar o número de shards (resharding) ou usar o modo sob demanda;
• agregar registros pequenos com a KPL para enviar menos registros.

PutRecords envia até 500 registros por chamada, mas pode ter falhas parciais: a resposta traz FailedRecordCount e um código de erro por registro. Reenvie só os que falharam.

```typescript
import { KinesisClient, PutRecordsCommand } from "@aws-sdk/client-kinesis";

const kinesis = new KinesisClient({});
const registros = leituras.map((leitura) => ({
  Data: new TextEncoder().encode(JSON.stringify(leitura)),
  PartitionKey: leitura.sensorId,
}));
const resp = await kinesis.send(new PutRecordsCommand({ StreamName: "telemetria", Records: registros }));
if (resp.FailedRecordCount) {
  const falhas = registros.filter((_, i) => resp.Records?.[i]?.ErrorCode);
  await reenviarComBackoff(falhas);
}
```

## Consumidores: compartilhado e enhanced fan-out
Modo compartilhado (padrão): os consumidores chamam GetRecords e dividem os 2 MB/s de leitura de cada shard. Com cinco consumidores, cada um recebe em média 400 KB/s por shard. A latência típica é de cerca de 200 ms.

Enhanced fan-out: cada consumidor registrado recebe seus próprios 2 MB/s por shard, entregues por push (SubscribeToShard, sobre HTTP/2), com latência típica de cerca de 70 ms. Tem custo adicional.

Use enhanced fan-out quando há vários consumidores lendo o mesmo stream e eles disputam a leitura, ou quando a latência precisa ser baixa.

A Lambda pode consumir um stream nos dois modos, com event source mapping (aula 05).

## KCL: a biblioteca de consumidores
A Kinesis Client Library (KCL) resolve o trabalho pesado de consumir um stream em aplicações próprias (EC2, ECS):

• distribui os shards entre os workers, com um processador por shard;
• guarda o checkpoint (até onde cada shard foi processado) em uma tabela DynamoDB, chamada de lease table, com o nome da aplicação;
• quando um worker cai, outro assume os shards dele;
• trata resharding, lendo os shards pais antes dos filhos para manter a ordem.

Regras que caem na prova:
• O número máximo de workers ativos é o número de shards: com 4 shards, um 5º worker fica ocioso.
• A aplicação precisa de permissões para Kinesis, DynamoDB (lease table) e CloudWatch (métricas).
• Se a tabela de leases sofre throttling, o consumo atrasa; dê capacidade suficiente a ela.

## KPL: a biblioteca de produtores
A Kinesis Producer Library (KPL) ajuda produtores de alto volume:

• agrega vários registros pequenos em um registro do Kinesis, aproveitando melhor o limite de 1.000 registros por segundo por shard;
• junta registros em lotes (PutRecords) e faz retries automáticos;
• funciona de forma assíncrona.

O custo é latência: a KPL espera um pouco (RecordMaxBufferedTime) para juntar registros. Se cada registro precisa chegar imediatamente, use o SDK com PutRecord/PutRecords. Registros agregados pela KPL precisam ser desagregados pelo consumidor (a KCL faz isso automaticamente).

## Resharding
Para mudar a capacidade de um stream provisionado:

• Split: divide um shard em dois, aumentando a capacidade (útil para um shard quente).
• Merge: junta dois shards adjacentes, reduzindo custo quando o tráfego cai.
• UpdateShardCount: ajusta o número total de shards de forma uniforme.

Depois de um resharding, o shard pai fica fechado para escrita, mas seus registros continuam legíveis até a retenção acabar. Para manter a ordem, o consumidor deve terminar o pai antes de ler os filhos; a KCL e a Lambda fazem isso.

## Amazon Data Firehose
O Amazon Data Firehose (antes Kinesis Data Firehose) entrega dados de streaming para um destino, sem código de consumo:

• destinos: Amazon S3, Amazon Redshift (via S3), Amazon OpenSearch Service, Splunk, tabelas Apache Iceberg, endpoints HTTP e parceiros;
• origens: envio direto (PutRecord) ou um Kinesis Data Stream;
• armazena em buffer por tamanho ou tempo antes de gravar. Por isso é quase em tempo real (segundos a minutos), não em tempo real;
• pode transformar registros com uma função Lambda e converter para Parquet ou ORC;
• escala sozinho; você não gerencia shards.

O Firehose não guarda dados para replay e não permite consumidores próprios lendo o fluxo. Para processamento customizado em tempo real, use Data Streams.

Para análises em streaming com SQL ou Java (janelas, agregações), existe o Amazon Managed Service for Apache Flink.

## Kinesis ou SQS?
Kinesis Data Streams:
• vários consumidores leem os mesmos dados;
• ordem por partition key (shard);
• replay dentro da retenção;
• alto volume de eventos pequenos, análise em tempo real.

SQS:
• cada mensagem é processada por um consumidor e apagada;
• consumidores escalam livremente, sem relação com shards;
• visibility timeout, DLQ e atraso por mensagem;
• sem replay.

Data Firehose:
• só entregar dados em um destino de armazenamento ou análise, com o mínimo de operação.

Na prova: "carregar logs em streaming no S3 com transformação e mínimo esforço" → Firehose. "Vários aplicativos processam o mesmo fluxo de cliques em tempo real" → Data Streams (com enhanced fan-out se disputarem leitura). "Desacoplar tarefas de processamento de pedidos" → SQS.

## Pegadinhas frequentes
• Ler do Kinesis não apaga o registro.
• Mais workers KCL que shards não aumenta a vazão.
• ProvisionedThroughputExceededException com shards suficientes → partition key ruim.
• PutRecords tem falhas parciais (FailedRecordCount).
• Firehose é quase em tempo real (buffer) e não faz replay.
• Enhanced fan-out dá 2 MB/s por consumidor por shard; o modo padrão divide os 2 MB/s.

## Resumo para revisão
• Shard: escrita 1 MB/s ou 1.000 registros/s; leitura 2 MB/s (5 GetRecords/s) compartilhados.
• Partition key define o shard e a ordem; alta cardinalidade evita shard quente.
• Retenção padrão de 24 h, até 365 dias; replay possível.
• Modo provisionado (shards) ou sob demanda (automático).
• Enhanced fan-out: 2 MB/s por consumidor por shard, push, cerca de 70 ms.
• KCL: lease table no DynamoDB, um worker ativo por shard. KPL: agregação e lotes, com latência.
• Split aumenta e merge reduz shards.
• Firehose: entrega gerenciada (S3, Redshift, OpenSearch, Splunk, HTTP), buffer, Lambda de transformação, sem replay.

## Questões

Q: Um aplicativo de jogos envia eventos de cliques que três equipes diferentes precisam processar em tempo real, cada uma no seu próprio ritmo. Também precisam poder reprocessar os dados das últimas 24 horas. Qual serviço usar?
- Amazon Data Firehose.
- Um tópico SNS.
- Uma fila SQS Standard.
+ Kinesis Data Streams.
E: Data Streams permite vários consumidores nos mesmos dados, cada um na sua posição, e replay dentro da retenção. Na fila SQS, cada mensagem é consumida e apagada; o Firehose entrega a um destino sem replay; e o SNS não guarda mensagens.

Q: Um stream tem 10 shards, mas o produtor recebe ProvisionedThroughputExceededException enquanto a maioria dos shards fica ociosa. A partition key é o código do país, e 90% do tráfego vem do Brasil. Qual é a melhor correção?
- Adicionar consumidores com enhanced fan-out.
- Aumentar a retenção para 7 dias.
+ Usar uma partition key de alta cardinalidade, como o id do dispositivo.
- Mudar para o modo de leitura compartilhado.
E: Com a chave concentrada, quase tudo vai para um shard, que estoura seu limite de escrita. Uma chave de alta cardinalidade distribui os registros. Retenção e consumidores tratam de leitura, não do limite de escrita do produtor.

Q: Um produtor envia 3.000 registros por segundo, cada um com 2 KB. Quantos shards provisionados são necessários, no mínimo?
- 3
- 1
- 2
+ 6
E: Em volume, 3.000 × 2 KB = 6 MB/s, e cada shard aceita 1 MB/s: 6 shards. Pela contagem, 3.000 registros/s precisam de 3 shards. Vale o maior, 6.

Q: Uma aplicação KCL roda em 8 instâncias EC2 lendo um stream de 4 shards. A equipe nota que 4 instâncias ficam ociosas. Por quê?
- A lease table do DynamoDB está com capacidade alta demais.
+ A KCL atribui no máximo um worker ativo por shard; com 4 shards, só 4 workers processam.
- O stream precisa de enhanced fan-out para usar 8 instâncias.
- As instâncias estão em AZs diferentes.
E: Cada shard é processado por um worker de cada vez; workers além do número de shards ficam em espera. Para paralelizar mais, aumente os shards. Enhanced fan-out muda a vazão de leitura, não a regra de um processador por shard.

Q: Cinco aplicações consomem o mesmo stream com GetRecords e reclamam de atraso e de throttling na leitura. O que melhora a vazão de leitura de cada uma?
+ Registrar as aplicações como consumidores com enhanced fan-out.
- Aumentar a retenção do stream para que os consumidores atrasados tenham mais tempo para ler.
- Usar a KPL nos produtores.
- Reduzir o tamanho dos registros para 1 KB, aumentando quantos registros cada consumidor lê por segundo.
E: No modo compartilhado, os 2 MB/s por shard são divididos entre os consumidores; com enhanced fan-out, cada um tem seus próprios 2 MB/s por shard, entregues por push. Retenção e KPL não mudam a leitura, e reduzir o tamanho dos registros não aumenta o limite.

Q: Uma empresa quer gravar logs de aplicação em streaming no S3, convertidos para Parquet, com o menor esforço operacional. Atrasos de até alguns minutos são aceitáveis. Qual serviço usar?
- Kinesis Data Streams com uma aplicação KCL que grava no S3.
- SNS com assinatura de e-mail.
+ Amazon Data Firehose com destino S3 e conversão de formato.
- SQS com uma função Lambda que grava no S3.
E: O Firehose entrega no S3 com buffer, transformação e conversão para Parquet, sem servidores nem código de consumo. A solução com KCL exige operar uma aplicação, e SQS com Lambda exige código para agrupar e converter.

Q: Um produtor usa a KPL e a equipe percebe que os registros levam mais tempo para chegar ao stream do que com o SDK. Qual é a explicação?
- A KPL não suporta retries.
- A KPL exige enhanced fan-out nos consumidores, e a entrega por push adiciona um atraso a cada registro.
+ A KPL guarda registros em buffer para agregá-los e enviá-los em lotes, o que adiciona latência.
- A KPL usa o modo de leitura compartilhado, que divide a vazão do shard entre o produtor e os consumidores.
E: A agregação e o envio em lotes melhoram a vazão, mas a KPL espera um pouco (RecordMaxBufferedTime) para juntar registros. Ela faz retries, e os modos de leitura são assunto dos consumidores.

Q: Um processo envia 500 registros com PutRecords e recebe a resposta sem exceção, mas alguns registros não aparecem no stream. O que o código deveria fazer?
- Usar ConsistentRead na chamada.
+ Verificar FailedRecordCount e reenviar os registros que vieram com ErrorCode.
- Chamar PutRecords com 1.000 registros por vez, para que o stream confirme todos em uma única resposta.
- Aumentar a retenção para 365 dias.
E: PutRecords pode ter sucesso parcial; os registros com erro (como throttling) precisam ser reenviados. O limite é 500 registros por chamada, e retenção não tem relação com a escrita.

Q: O tráfego de um stream provisionado caiu pela metade de forma permanente. A equipe quer reduzir o custo mantendo o stream. O que fazer?
- Fazer split dos shards.
+ Fazer merge de shards adjacentes (ou reduzir com UpdateShardCount).
- Reduzir a retenção para 1 hora, já que o custo de um stream provisionado depende do volume guardado.
- Ativar enhanced fan-out.
E: Merge reduz o número de shards e o custo. Split aumenta a capacidade, enhanced fan-out acrescenta custo e a retenção mínima é de 24 horas.

Q: Qual afirmação diferencia corretamente Kinesis Data Streams de SQS?
+ No Kinesis, vários consumidores leem os mesmos registros e podem reler; no SQS, a mensagem é apagada.
- Em Kinesis, ler um registro o remove do stream.
- SQS garante ordem por partition key.
- Kinesis tem visibility timeout por registro, que esconde o registro dos outros consumidores durante o processamento.
E: Registros do Kinesis permanecem até a retenção expirar, permitindo vários leitores e replay. No SQS, cada mensagem é processada e apagada. Partition key é conceito do Kinesis, e visibility timeout é do SQS.

## Flashcards

F: Limites de um shard do Kinesis Data Streams
V: Escrita: 1 MB/s ou 1.000 registros/s. Leitura: 2 MB/s e 5 GetRecords/s, compartilhados no modo padrão.

F: Para que serve a partition key no Kinesis?
V: Define o shard do registro (por hash). Mesma chave = mesmo shard = ordem garantida. Chave de alta cardinalidade evita shard quente.

F: Retenção do Kinesis Data Streams
V: 24 horas por padrão, ampliável até 365 dias. Ler não apaga registros; replay é possível.

F: Modo compartilhado vs. enhanced fan-out
V: Compartilhado: 2 MB/s por shard divididos entre consumidores, cerca de 200 ms. Enhanced fan-out: 2 MB/s por consumidor por shard, push via SubscribeToShard, cerca de 70 ms.

F: O que a KCL usa para guardar checkpoints?
V: Uma tabela DynamoDB (lease table) com o nome da aplicação. No máximo um worker ativo por shard.

F: O que a KPL faz?
V: Agrega registros pequenos, envia em lotes e repete falhas automaticamente. Aumenta a vazão com algum atraso de buffer.

F: Causa de ProvisionedThroughputExceededException no Kinesis
V: Escrita acima do limite de um shard: poucos shards ou partition key concentrada (shard quente).

F: Split vs. merge de shards
V: Split divide um shard em dois (mais capacidade). Merge junta dois adjacentes (menos custo).

F: O que é o Amazon Data Firehose?
V: Entrega gerenciada de streaming para S3, Redshift, OpenSearch, Splunk, Iceberg e HTTP, com buffer, transformação por Lambda e conversão para Parquet/ORC. Sem replay.

F: PutRecords: limite e falhas parciais
V: Até 500 registros por chamada. Verifique FailedRecordCount e reenvie os registros com ErrorCode.
