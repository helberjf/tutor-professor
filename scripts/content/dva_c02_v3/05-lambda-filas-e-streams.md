# 05. Lambda com SQS, Kinesis e DynamoDB Streams

## Mapa da aula
Quando a origem é uma fila ou um stream, quem chama a função é o event source mapping. Nesta aula:

• como o event source mapping funciona e que permissões exige;
• lote, janela de espera e limites;
• SQS: o que acontece quando o lote falha, visibility timeout, DLQ e resposta parcial;
• SQS FIFO e ordem;
• Kinesis e DynamoDB Streams: shards, ordem, checkpoint e o shard travado por um registro ruim;
• as configurações de erro dos streams: retries, idade máxima, bisect e destino de falha;
• filtros de eventos e a métrica IteratorAge.

## O que é um event source mapping
Event source mapping (ESM) é um recurso da Lambda que lê uma origem e invoca a função com lotes. Quem faz o polling é a própria Lambda, não o seu código. Origens: SQS, Kinesis Data Streams, DynamoDB Streams, Amazon MQ, Amazon MSK e Kafka próprio.

Como é a Lambda que lê a origem, a permissão de leitura fica na role de execução da função:
• SQS: sqs:ReceiveMessage, sqs:DeleteMessage e sqs:GetQueueAttributes (policy gerenciada AWSLambdaSQSQueueExecutionRole).
• Kinesis: kinesis:GetRecords, GetShardIterator, DescribeStream e ListShards (AWSLambdaKinesisExecutionRole).
• DynamoDB Streams: dynamodb:GetRecords, GetShardIterator, DescribeStream e ListStreams (AWSLambdaDynamoDBExecutionRole).

Diferente do S3 ou SNS, aqui não é preciso política de recurso na função: a origem não chama a Lambda; a Lambda vai buscar.

O evento chega com uma lista Records. Em SQS, cada item tem messageId, receiptHandle e body. Em Kinesis, o dado vem em kinesis.data, codificado em base64.

## Lote e janela de espera
Duas configurações controlam o tamanho dos lotes:

• BatchSize: máximo de registros por invocação. SQS Standard: 1 a 10.000 (padrão 10). SQS FIFO: até 10. Kinesis e DynamoDB Streams: até 10.000 (padrão 100).
• MaximumBatchingWindowInSeconds: quanto tempo esperar juntando registros antes de invocar, de 0 a 300 segundos. Em SQS, um BatchSize acima de 10 exige janela de pelo menos 1 segundo.

A Lambda invoca quando acontece o primeiro destes: o lote enche, a janela termina ou o payload chega a 6 MB.

Lotes maiores reduzem o número de invocações e o custo, mas aumentam o trabalho perdido quando uma execução falha e a latência do primeiro registro.

## SQS: como o lote é confirmado
Fluxo com uma fila SQS Standard:

1. A Lambda recebe um lote; as mensagens ficam invisíveis para outros consumidores pelo visibility timeout da fila.
2. Se a função termina com sucesso, a Lambda apaga todas as mensagens do lote.
3. Se a função lança exceção ou estoura o timeout, nenhuma mensagem é apagada. Quando o visibility timeout acaba, todo o lote volta a ficar visível e será processado de novo, inclusive as mensagens que deram certo.

Duas regras práticas:
• Configure o visibility timeout da fila em pelo menos 6 vezes o timeout da função. Assim, uma mensagem não reaparece enquanto ainda está sendo processada.
• Configure a DLQ na própria fila SQS (redrive policy com maxReceiveCount). Depois de N recebimentos sem sucesso, a mensagem vai para a DLQ. Destinos e DLQ da função valem para invocação assíncrona, não para ESM de SQS.

## Resposta parcial de lote
Se uma mensagem em dez falha, reprocessar as dez é desperdício e pode duplicar efeitos. A resposta parcial resolve:

1. Ative ReportBatchItemFailures em FunctionResponseTypes no event source mapping.
2. No código, trate cada mensagem separadamente e devolva os messageIds que falharam em batchItemFailures, sem lançar exceção para o lote inteiro.

A Lambda apaga as mensagens bem-sucedidas e devolve à fila apenas as que você listou. As duas partes são necessárias: sem a configuração no ESM, o retorno é ignorado e o lote inteiro é tratado como sucesso.

```typescript
import type { SQSBatchResponse, SQSEvent } from "aws-lambda";

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];
  for (const registro of event.Records) {
    try {
      const pedido = JSON.parse(registro.body);
      await processar(pedido); // sua lógica, idempotente
    } catch {
      batchItemFailures.push({ itemIdentifier: registro.messageId });
    }
  }
  return { batchItemFailures };
};
```

## Escala com SQS e o limite de concorrência do ESM
Com SQS Standard, a Lambda aumenta o número de pollers conforme a fila cresce e pode chegar a cerca de 1.250 execuções simultâneas por fila, limitada pela concorrência da conta.

Para proteger uma dependência, configure a concorrência máxima do event source mapping (MaximumConcurrency, de 2 a 1.000). Ela limita quantas invocações aquela fila dispara ao mesmo tempo, sem fazer a Lambda receber mensagens que não consegue processar.

Usar só a concorrência reservada da função para isso pode gerar throttling: a Lambda já leu as mensagens, a invocação é rejeitada e as mensagens voltam para a fila, consumindo tentativas do maxReceiveCount.

## SQS FIFO e ordem
Em uma fila FIFO, a ordem é garantida dentro de cada message group (MessageGroupId). A Lambda processa um lote por grupo de cada vez, na ordem.

• Se um lote falha, as mensagens daquele grupo ficam bloqueadas até o reprocessamento terminar; outros grupos continuam.
• A escala é limitada pelo número de grupos ativos: com um único MessageGroupId, o processamento é totalmente sequencial.
• BatchSize máximo de 10.

Para paralelizar sem perder a ordem que importa, use como grupo a entidade que precisa de ordem (por exemplo, o id do cliente).

## Kinesis e DynamoDB Streams: shards e ordem
Streams são divididos em shards. Os registros com a mesma chave de partição (em Kinesis) ou do mesmo item (em DynamoDB Streams) vão para o mesmo shard, em ordem.

Por padrão, a Lambda processa um lote por shard de cada vez, em ordem. A concorrência é igual ao número de shards. Para ganhar paralelismo, use ParallelizationFactor (1 a 10): até 10 lotes simultâneos por shard, mantendo a ordem por chave de partição.

StartingPosition define onde começar a ler: TRIM_HORIZON (o registro mais antigo disponível), LATEST (só os novos) ou AT_TIMESTAMP.

Retenção: DynamoDB Streams guarda registros por 24 horas; Kinesis, 24 horas por padrão, ampliável até 365 dias.

## O shard travado e como destravar
Em streams, a Lambda avança o checkpoint do shard só depois que o lote dá certo. Se um registro sempre faz a função falhar, por padrão a Lambda repete o mesmo lote até ter sucesso ou o registro expirar. Enquanto isso, o shard para: os registros novos se acumulam atrás do ruim.

O sinal disso é a métrica IteratorAge crescendo: ela mede a idade do último registro lido. IteratorAge alto significa que a função está atrasada em relação ao stream.

Configurações para lidar com o registro ruim:
• MaximumRetryAttempts: limita as novas tentativas (padrão -1, infinito; até 10.000).
• MaximumRecordAgeInSeconds: descarta registros mais velhos que o limite (padrão -1, infinito; de 60 segundos a 7 dias).
• BisectBatchOnFunctionError: divide o lote com erro em duas metades e tenta cada uma, isolando o registro problemático.
• Destino on-failure (SQS, SNS ou S3): recebe as informações do lote descartado (shard, números de sequência), para análise posterior.
• ReportBatchItemFailures: o código devolve o número de sequência do primeiro registro que falhou; a Lambda avança o checkpoint até antes dele.

## Filtros de eventos
O event source mapping aceita FilterCriteria: padrões que selecionam quais registros invocam a função. O padrão é aplicado ao body da mensagem SQS ou ao data do registro Kinesis/DynamoDB, com a mesma sintaxe de padrões do EventBridge.

Exemplo de critério: invocar apenas para pedidos com status "PAGO":
{"body": {"status": ["PAGO"]}}

Vantagem: menos invocações e menos custo, porque registros irrelevantes nem chegam ao código.

Atenção: em SQS, mensagens que não passam no filtro são apagadas da fila. Se outro consumidor precisa delas, use outra fila (fan-out com SNS) em vez de filtrar.

## Duplicatas e idempotência
Todos esses caminhos entregam pelo menos uma vez: retries de lote, visibility timeout e reprocessamento de streams podem fazer a mesma mensagem chegar duas vezes. O processamento precisa ser idempotente:

• use uma chave natural (id do pedido, messageId) e uma escrita condicional no DynamoDB para registrar o que já foi feito;
• ou use o utilitário de idempotência do Powertools for AWS Lambda.

Na prova, "exatamente uma vez" com Lambda e SQS significa "pelo menos uma vez + idempotência", ou SQS FIFO com deduplicação no envio.

## Pegadinhas frequentes
• Exceção no lote SQS devolve todas as mensagens, não só a que falhou.
• Resposta parcial exige ReportBatchItemFailures no ESM e batchItemFailures no retorno.
• A DLQ de uma fila consumida por Lambda é configurada na fila, não na função.
• Visibility timeout menor que o tempo de processamento gera duplicatas.
• Um registro ruim trava o shard do stream; IteratorAge sobe.
• Filtro de ESM em SQS apaga as mensagens descartadas.
• Para ESM, a permissão de leitura está na role de execução; não há política de recurso da função.

## Resumo para revisão
• ESM: a Lambda faz polling de SQS, Kinesis, DynamoDB Streams, MQ, MSK e Kafka.
• BatchSize: SQS 1–10.000 (FIFO até 10); streams até 10.000. Janela de 0 a 300 s.
• SQS: sucesso apaga o lote; erro devolve o lote. Visibility timeout ≥ 6 × timeout da função. DLQ na fila (maxReceiveCount).
• Resposta parcial: ReportBatchItemFailures + batchItemFailures com messageId (SQS) ou número de sequência (streams).
• Escala SQS limitada com MaximumConcurrency no ESM.
• FIFO: ordem por MessageGroupId; escala pelo número de grupos.
• Streams: um lote por shard em ordem; ParallelizationFactor até 10; IteratorAge mostra atraso.
• Erros em streams: MaximumRetryAttempts, MaximumRecordAgeInSeconds, BisectBatchOnFunctionError, destino on-failure.

## Questões

Q: Uma função consome uma fila SQS Standard com lotes de 10 mensagens. Quando uma mensagem falha, a função lança uma exceção e as 10 mensagens são reprocessadas. A equipe quer reprocessar só a que falhou. Quais ações são necessárias?
- Configurar um destino on-failure na função.
+ Ativar ReportBatchItemFailures no mapeamento e devolver só os messageIds com falha em batchItemFailures.
- Reduzir o visibility timeout da fila para 1 segundo.
- Configurar BisectBatchOnFunctionError no event source mapping da fila.
E: A resposta parcial depende da configuração no ESM e do retorno com os ids que falharam. Destinos da função valem para invocação assíncrona; reduzir o visibility timeout causa mais duplicatas; e BisectBatchOnFunctionError é uma configuração de streams, não de SQS.

Q: Uma função com timeout de 60 segundos consome uma fila SQS cujo visibility timeout é 30 segundos. A equipe percebe mensagens processadas duas vezes ao mesmo tempo. Qual é a correção?
- Reduzir o timeout da função para 30 segundos.
- Ativar long polling com WaitTimeSeconds de 20.
- Mudar a fila para FIFO.
+ Aumentar o visibility timeout da fila para pelo menos 6 vezes o timeout da função.
E: Com o visibility timeout menor que o tempo de processamento, a mensagem volta a ficar visível e outro poller a pega enquanto a primeira execução continua. A recomendação é um visibility timeout de pelo menos 6 vezes o timeout da função. Long polling reduz recebimentos vazios, e FIFO não resolve o tempo de invisibilidade.

Q: Mensagens que sempre falham ficam voltando para a fila SQS indefinidamente e consumindo processamento. Onde a equipe deve configurar o envio dessas mensagens para uma DLQ?
- Em uma DLQ configurada na função Lambda.
- Em um destino on-failure da função Lambda, que recebe as mensagens depois das tentativas do mapeamento.
- No parâmetro MaximumRetryAttempts do event source mapping, que envia a mensagem para a DLQ após o limite de tentativas.
+ Na redrive policy da fila SQS de origem, com um maxReceiveCount.
E: Para ESM de SQS, quem controla as repetições é a própria fila: depois de maxReceiveCount recebimentos, a mensagem vai para a DLQ da fila. DLQ e destinos da função são para invocações assíncronas, e MaximumRetryAttempts é configuração de streams.

Q: Uma função processa um Kinesis Data Stream com 4 shards. Um registro malformado faz a função falhar sempre. A métrica IteratorAge do shard não para de crescer. O que está acontecendo?
+ A Lambda está repetindo o mesmo lote e o shard fica bloqueado até o registro ter sucesso ou expirar.
- A função está sofrendo throttling por falta de memória, e a Lambda reduz o ritmo de leitura do shard para compensar.
- O ParallelizationFactor está alto demais.
- O stream descartou o registro malformado por ser inválido e a função está parada esperando novos dados chegarem ao shard.
E: Em streams, o checkpoint só avança quando o lote dá certo; por padrão, retries e idade máxima são infinitos, então o registro ruim trava o shard e a idade do iterador sobe. Paralelização não causa isso, e falta de memória seria um erro de função, não throttling.

Q: Para o cenário do registro malformado em Kinesis, quais configurações isolam o registro ruim e deixam o shard continuar? Escolha a melhor combinação.
- Aumentar o BatchSize e o timeout da função.
- Mudar StartingPosition para LATEST.
- Configurar uma redrive policy no stream com maxReceiveCount, para mover o registro ruim para uma DLQ depois de algumas tentativas.
+ BisectBatchOnFunctionError, um limite em MaximumRetryAttempts e um destino on-failure.
E: Bisect divide o lote para isolar o registro, o limite de retries impede repetição infinita e o destino on-failure guarda as informações do lote descartado. Streams não têm redrive policy, e LATEST só define onde começar a ler em um mapeamento novo, sem resolver o registro ruim.

Q: Uma função lê um DynamoDB Stream e precisa processar mais rápido, mantendo a ordem das alterações de cada item. O que fazer?
- Aumentar o número de shards do DynamoDB Stream manualmente.
+ Aumentar o ParallelizationFactor do event source mapping.
- Mudar para uma fila SQS Standard.
- Ativar BisectBatchOnFunctionError.
E: ParallelizationFactor permite até 10 lotes simultâneos por shard, preservando a ordem por chave. Os shards do DynamoDB Streams são gerenciados pelo serviço; bisect é para erros; e SQS Standard não garante ordem.

Q: Uma função consome uma fila SQS e grava em uma API de terceiros que aceita no máximo 20 chamadas simultâneas. Qual configuração limita as invocações dessa fila evitando throttling e retorno de mensagens?
+ Concorrência máxima (MaximumConcurrency) de 20 no event source mapping.
- BatchSize de 20.
- Visibility timeout de 20 segundos.
- Concorrência reservada de 20 na função, que também impede a Lambda de ler mais mensagens do que consegue processar.
E: A concorrência máxima do ESM limita quantas invocações a fila dispara, e a Lambda não lê mensagens que não pode processar. Só a reserva da função pode causar throttling depois da leitura, devolvendo mensagens à fila. BatchSize define o tamanho do lote, não a simultaneidade.

Q: Uma fila SQS FIFO recebe pedidos de todos os clientes com o mesmo MessageGroupId. O processamento pela Lambda está lento e sequencial. A ordem só importa para os pedidos de um mesmo cliente. Qual mudança aumenta a vazão?
- Aumentar o BatchSize para 1.000 para processar mais pedidos por invocação.
+ Usar o id do cliente como MessageGroupId.
- Trocar a fila para Standard.
- Aumentar a memória da função.
E: Em FIFO, a Lambda processa um lote por grupo de cada vez; com um grupo só, tudo é sequencial. Um grupo por cliente permite paralelismo mantendo a ordem por cliente. FIFO aceita no máximo 10 por lote, Standard perde a garantia de ordem, e memória não remove a serialização.

Q: Uma equipe adicionou FilterCriteria a um event source mapping de SQS para processar apenas mensagens com tipo "PAGAMENTO". Depois, outra equipe reclamou que mensagens de tipo "REEMBOLSO" sumiram da fila. Por quê?
- O filtro altera o MessageGroupId das mensagens.
- O filtro move as mensagens não correspondentes para a DLQ configurada na redrive policy da fila.
- As mensagens expiraram pelo período de retenção.
+ Em SQS, mensagens que não passam no filtro são apagadas pela Lambda.
E: Mensagens SQS descartadas pelo filtro do ESM são removidas da fila. Se outros consumidores precisam delas, cada um deve ter sua fila, com fan-out por SNS ou EventBridge. O filtro não envia para DLQ nem altera mensagens.

Q: Que permissão é necessária para uma função Lambda consumir uma fila SQS por event source mapping?
- Uma política de recurso na função permitindo que sqs.amazonaws.com a invoque sempre que chegar uma mensagem na fila.
- Nenhuma, porque a Lambda e o SQS estão na mesma conta.
+ Permissões sqs:ReceiveMessage, sqs:DeleteMessage e sqs:GetQueueAttributes na role de execução.
- Uma política na fila permitindo lambda:InvokeFunction.
E: No ESM, a Lambda faz o polling usando a role de execução, que precisa ler e apagar mensagens (policy AWSLambdaSQSQueueExecutionRole). O SQS não invoca a função, então não há política de recurso para isso, e permissões são sempre necessárias.

## Flashcards

F: O que é um event source mapping?
V: Recurso da Lambda que faz polling de uma origem (SQS, Kinesis, DynamoDB Streams, MQ, MSK, Kafka) e invoca a função com lotes. A leitura usa a role de execução.

F: O que acontece com um lote SQS quando a função lança exceção?
V: Nenhuma mensagem é apagada; o lote inteiro volta a ficar visível depois do visibility timeout e é reprocessado.

F: Como fazer resposta parcial de lote?
V: Ativar ReportBatchItemFailures no ESM e retornar {"batchItemFailures": [{"itemIdentifier": id}]} com os messageIds (SQS) ou números de sequência (streams) que falharam.

F: Visibility timeout recomendado para fila consumida por Lambda
V: Pelo menos 6 vezes o timeout da função.

F: Onde configurar a DLQ de uma fila SQS consumida por Lambda?
V: Na própria fila, com redrive policy e maxReceiveCount. DLQ e destinos da função são para invocação assíncrona.

F: Limites de BatchSize por origem
V: SQS Standard 1–10.000 (acima de 10 exige janela); SQS FIFO até 10; Kinesis e DynamoDB Streams até 10.000 (padrão 100). Janela de 0 a 300 s.

F: O que indica IteratorAge alto?
V: A função está atrasada em relação ao stream (Kinesis/DynamoDB Streams), muitas vezes por um registro que falha sempre e trava o shard.

F: Configurações de erro para streams no ESM
V: MaximumRetryAttempts, MaximumRecordAgeInSeconds, BisectBatchOnFunctionError, destino on-failure (SQS, SNS, S3) e ReportBatchItemFailures.

F: O que é ParallelizationFactor?
V: Número de lotes simultâneos por shard (1 a 10) em Kinesis/DynamoDB Streams, mantendo a ordem por chave de partição.

F: Como limitar a concorrência de uma fila SQS consumida pela Lambda?
V: Com MaximumConcurrency no event source mapping (2 a 1.000), que evita ler mensagens que a função não consegue processar.
