# 12. Amazon SQS: filas Standard e FIFO, visibilidade, DLQ e escala

## Mapa da aula
SQS é a resposta para desacoplar produtores e consumidores. Nesta aula:

• como uma mensagem vai do produtor ao consumidor e é apagada;
• Standard vs. FIFO: ordem, duplicatas e vazão;
• visibility timeout e como estendê-lo;
• long polling;
• atrasos: delay queues e timers de mensagem;
• dead-letter queues e redrive;
• tamanho de mensagem e mensagens grandes;
• como escalar consumidores pela fila.

## O ciclo de uma mensagem
1. O produtor chama SendMessage. A mensagem fica guardada de forma redundante.
2. Um consumidor chama ReceiveMessage e recebe até 10 mensagens. Cada uma vem com MessageId (identidade da mensagem) e ReceiptHandle (identidade daquele recebimento).
3. Enquanto o consumidor trabalha, a mensagem fica invisível para os outros pelo visibility timeout.
4. Ao terminar, o consumidor chama DeleteMessage com o ReceiptHandle. Só então a mensagem sai da fila.
5. Se o consumidor não apagar a tempo (falhou, travou ou demorou demais), a mensagem volta a ficar visível e outro consumidor pode recebê-la.

O SQS não apaga a mensagem porque ela foi entregue: apagar é responsabilidade do consumidor. E o ReceiptHandle muda a cada recebimento; para apagar, use o mais recente.

Retenção: as mensagens não apagadas ficam na fila por 4 dias por padrão, configurável de 1 minuto a 14 dias. Depois disso, são removidas.

## Standard vs. FIFO
Fila Standard:
• vazão praticamente ilimitada;
• entrega pelo menos uma vez: às vezes a mesma mensagem chega duas vezes;
• ordem de melhor esforço: as mensagens podem chegar fora de ordem.

Fila FIFO (o nome termina em .fifo):
• ordem garantida dentro de cada MessageGroupId;
• processamento exatamente uma vez: duplicatas enviadas dentro de 5 minutos são descartadas;
• vazão de 300 mensagens por segundo por ação de API, ou 3.000 com lotes de 10. O modo de alta vazão aumenta bastante esse limite, distribuindo por grupos.

Escolha: precisa de ordem ou não pode ter duplicatas no envio → FIFO. Precisa de vazão máxima e o consumidor é idempotente → Standard.

## Visibility timeout
O visibility timeout padrão é de 30 segundos e pode ir de 0 segundo a 12 horas. Ele deve ser maior que o tempo de processamento de uma mensagem.

• Curto demais: a mensagem reaparece enquanto ainda está sendo processada e outro consumidor a processa de novo (duplicata).
• Longo demais: se o consumidor falhar, a mensagem demora a ser tentada de novo.

Quando o tempo de processamento varia, o consumidor pode estender a invisibilidade de uma mensagem específica com ChangeMessageVisibility (um "heartbeat"). Por exemplo, a cada 30 segundos de trabalho, estender por mais 60. Também é possível definir o timeout no próprio ReceiveMessage.

Com Lambda (aula 05), a recomendação é visibility timeout de pelo menos 6 vezes o timeout da função.

## Long polling
Por padrão, ReceiveMessage usa short polling: responde na hora, mesmo que a fila esteja vazia, e consulta só parte dos servidores. Resultado: muitas respostas vazias e custo por requisição sem mensagens.

Com long polling, a chamada espera até chegar alguma mensagem ou até o tempo de espera acabar, de 1 a 20 segundos:
• por chamada, com WaitTimeSeconds;
• para a fila toda, com o atributo ReceiveMessageWaitTimeSeconds.

Long polling reduz respostas vazias, custo e latência de entrega. É quase sempre a escolha certa.

```typescript
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});
const URL = "https://sqs.sa-east-1.amazonaws.com/111122223333/pedidos";

while (true) {
  const { Messages = [] } = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: URL, MaxNumberOfMessages: 10, WaitTimeSeconds: 20,
  }));
  for (const msg of Messages) {
    await processar(msg.Body!); // idempotente
    await sqs.send(new DeleteMessageCommand({ QueueUrl: URL, ReceiptHandle: msg.ReceiptHandle! }));
  }
}
```

## Atrasos: delay queue e timer de mensagem
• Delay queue: o atributo DelaySeconds da fila (0 a 15 minutos) deixa toda mensagem nova invisível por esse tempo depois do envio.
• Timer de mensagem: DelaySeconds no SendMessage, só para aquela mensagem. Disponível em filas Standard; em FIFO, o atraso é só no nível da fila.

Diferença em relação ao visibility timeout: o atraso acontece antes do primeiro recebimento; o visibility timeout, depois de cada recebimento.

Use para "processar este pedido só daqui a 5 minutos". Para atrasos maiores que 15 minutos, use EventBridge Scheduler ou Step Functions com estado Wait.

## Dead-letter queue e redrive
Uma mensagem que falha sempre ("poison message") voltaria para a fila sem parar. A dead-letter queue resolve:

• Na fila de origem, configure a redrive policy com o ARN da DLQ e o maxReceiveCount (por exemplo, 5).
• Quando uma mensagem é recebida mais vezes do que o maxReceiveCount sem ser apagada, o SQS a move para a DLQ.
• A DLQ é uma fila comum, do mesmo tipo (FIFO para FIFO), na mesma conta e Região.
• Dê à DLQ uma retenção maior que a da fila de origem, para ter tempo de investigar.
• Depois de corrigir o problema, use o redrive da DLQ (pelo console ou StartMessageMoveTask) para devolver as mensagens à fila de origem.

Configure um alarme do CloudWatch em ApproximateNumberOfMessagesVisible da DLQ maior que 0 para saber quando algo começou a falhar.

maxReceiveCount muito baixo (1) manda para a DLQ mensagens que falharam por um problema passageiro.

## FIFO: grupo e deduplicação
Em filas FIFO, cada SendMessage precisa de:

• MessageGroupId: define o grupo de ordem. Mensagens do mesmo grupo são entregues em ordem, uma "vez" por grupo; grupos diferentes são processados em paralelo. Use a entidade que precisa de ordem (pedido, conta, cliente).
• MessageDeduplicationId: identifica a mensagem para descartar reenvios dentro de 5 minutos. Ou ative content-based deduplication, que usa um hash SHA-256 do corpo como id.

A deduplicação protege contra o produtor reenviar a mesma mensagem (por exemplo, após um timeout). Ela não impede que o consumidor processe duas vezes se ele falhar antes de apagar; o consumidor ainda deve ser idempotente quando o efeito é crítico.

```typescript
import { SendMessageCommand } from "@aws-sdk/client-sqs";

await sqs.send(new SendMessageCommand({
  QueueUrl: "https://sqs.sa-east-1.amazonaws.com/111122223333/pagamentos.fifo",
  MessageBody: JSON.stringify({ pedido: "p-91", valor: 50 }),
  MessageGroupId: "cliente-42",               // ordem por cliente
  MessageDeduplicationId: "pagamento-p-91",   // reenvio dentro de 5 min é descartado
}));
```

## Tamanho de mensagem e mensagens grandes
O tamanho máximo de uma mensagem é 1 MiB desde agosto de 2025 (antes era 256 KB; questões antigas usam esse número).

Para mensagens maiores, o padrão é guardar o conteúdo no S3 e enviar na fila só a referência. A Amazon SQS Extended Client Library (oficial para Java e Python) faz isso automaticamente, com conteúdo de até 2 GB; em TypeScript, o mesmo padrão é implementado gravando no S3 e enviando a referência na mensagem.

Atributos de mensagem (até 10 por mensagem) carregam metadados como tipo e versão, sem precisar abrir o corpo.

Operações em lote (SendMessageBatch, DeleteMessageBatch, ChangeMessageVisibilityBatch) agrupam até 10 mensagens por chamada e reduzem custo e latência.

## Escalar consumidores pela fila
Para consumidores em EC2 ou ECS, a fila é o sinal de escala:

• ApproximateNumberOfMessagesVisible: quantas mensagens esperando (backlog).
• ApproximateAgeOfOldestMessage: há quanto tempo a mensagem mais antiga espera. Bom para alarmes de atraso.
• ApproximateNumberOfMessagesNotVisible: mensagens em processamento.

Um padrão recomendado é escalar pela métrica "backlog por instância" (mensagens visíveis ÷ número de consumidores) com target tracking. Com Lambda, a escala é automática pelo event source mapping.

Segurança da fila:
• Política da fila (resource policy) define quem pode enviar ou receber. SNS, S3 e EventBridge precisam dessa permissão para publicar na fila.
• Criptografia em repouso com SSE-SQS (chaves gerenciadas pelo SQS) ou SSE-KMS.

## Pegadinhas frequentes
• Apagar usa o ReceiptHandle, não o MessageId.
• Mensagem recebida e não apagada volta depois do visibility timeout.
• Delay (antes do primeiro recebimento) ≠ visibility timeout (depois de cada recebimento).
• Atraso máximo de 15 minutos.
• DLQ fica na mesma conta e Região e é do mesmo tipo da fila de origem.
• Deduplicação FIFO vale por 5 minutos e protege o envio, não o processamento.
• Muitas respostas vazias e custo alto → long polling.

## Resumo para revisão
• Standard: vazão ilimitada, pelo menos uma vez, sem ordem garantida. FIFO: ordem por grupo, sem duplicatas no envio (5 min), 300/s ou 3.000/s com lotes.
• Retenção padrão 4 dias (1 min a 14 dias). Mensagem até 1 MiB (antes 256 KB); maiores pelo S3 (Extended Client).
• Visibility timeout padrão 30 s (0 a 12 h); estender com ChangeMessageVisibility.
• Long polling: WaitTimeSeconds 1 a 20 s.
• Delay: 0 a 15 min (fila ou mensagem, esta só em Standard).
• DLQ: redrive policy com maxReceiveCount; redrive de volta depois de corrigir.
• Até 10 mensagens por ReceiveMessage e por lote.

## Questões

Q: Um consumidor processa mensagens de uma fila SQS em cerca de 2 minutos cada. O visibility timeout é o padrão. A equipe vê a mesma mensagem processada por dois consumidores. Qual é a correção?
- Ativar a deduplicação baseada em conteúdo.
- Ativar long polling.
+ Aumentar o visibility timeout acima do tempo de processamento (ou estendê-lo durante o trabalho).
- Reduzir o período de retenção.
E: O visibility timeout padrão é 30 segundos; como o processamento leva 2 minutos, a mensagem reaparece e é entregue a outro consumidor. Long polling reduz respostas vazias, retenção controla por quanto tempo a mensagem existe e a deduplicação FIFO trata do envio.

Q: Uma aplicação faz ReceiveMessage em um laço e a conta mostra milhões de requisições que voltam vazias, aumentando o custo. Qual mudança resolve?
- Mudar a fila para FIFO.
+ Usar long polling com WaitTimeSeconds de até 20 segundos.
- Criar uma DLQ.
- Diminuir o visibility timeout.
E: Long polling espera mensagens chegarem antes de responder, reduzindo respostas vazias e custo. Visibility timeout, DLQ e o tipo da fila não mudam o comportamento de polling.

Q: Um sistema financeiro precisa processar as operações de cada conta na ordem em que ocorreram, sem duplicatas causadas por reenvios do produtor. Contas diferentes podem ser processadas em paralelo. Qual configuração atende?
- Duas filas Standard, uma de entrada e outra de saída, com o consumidor reordenando as operações pelo horário.
- Fila FIFO com o mesmo MessageGroupId para todas as mensagens, para garantir a ordem global das operações.
- Fila Standard com timers de mensagem.
+ Fila FIFO com MessageGroupId igual ao id da conta e deduplicação.
E: Na FIFO, a ordem vale dentro de cada grupo, e grupos diferentes são processados em paralelo; a deduplicação descarta reenvios dentro de 5 minutos. Um grupo único serializa tudo, e filas Standard não garantem ordem nem eliminam duplicatas.

Q: Algumas mensagens têm um formato inválido e fazem o consumidor falhar sempre. Elas ficam voltando para a fila e atrasam as demais. O que fazer?
- Usar short polling.
- Aumentar o visibility timeout para 12 horas, para que as mensagens inválidas demorem a voltar e não atrasem as demais.
+ Configurar uma DLQ com redrive policy e um maxReceiveCount adequado.
- Reduzir a retenção da fila para 1 minuto, para que as mensagens inválidas sejam apagadas antes de voltar.
E: Depois de maxReceiveCount recebimentos sem sucesso, a mensagem vai para a DLQ, onde pode ser analisada e reprocessada depois. Reduzir a retenção apagaria também mensagens boas; visibility timeout de 12 horas só atrasa a próxima tentativa; e short polling não resolve.

Q: Uma loja quer que cada mensagem de "lembrete de carrinho" só fique disponível para processamento 10 minutos depois de enviada. As outras mensagens da mesma fila Standard devem ser processadas imediatamente. Qual recurso usar?
- Delay queue de 10 minutos configurada na fila, que vale para os lembretes enviados nela.
- Retenção de 10 minutos.
- Visibility timeout de 10 minutos.
+ Timer de mensagem, com DelaySeconds de 600 no SendMessage dos lembretes.
E: O timer vale só para a mensagem enviada com DelaySeconds, em filas Standard. A delay queue atrasaria todas as mensagens; o visibility timeout só começa depois do recebimento; e retenção apaga mensagens antigas.

Q: Um produtor precisa enviar documentos de 5 MB pela fila. Qual é a abordagem recomendada?
- Comprimir os documentos para 1 MiB, que é o limite.
+ Guardar o documento no S3 e enviar só a referência, por exemplo com a SQS Extended Client Library.
- Dividir cada documento em atributos de mensagem.
- Aumentar o atributo MaximumMessageSize da fila para 10 MiB, já que o padrão de 1 MiB é só um valor inicial.
E: O limite de uma mensagem é 1 MiB e não é configurável acima disso. A Extended Client Library guarda o conteúdo no S3 e envia só a referência, com suporte a até 2 GB. Compressão pode não ser suficiente, e atributos de mensagem são poucos e entram no mesmo limite.

Q: Um consumidor guarda o MessageId de cada mensagem e, ao terminar, chama DeleteMessage usando esse valor. A chamada falha. Por quê?
+ DeleteMessage exige o ReceiptHandle do recebimento, não o MessageId.
- O consumidor precisa de long polling ativo na fila para conseguir apagar mensagens pelo identificador.
- A mensagem já expirou.
- A fila precisa ser FIFO para apagar mensagens.
E: O ReceiptHandle identifica aquele recebimento e é o parâmetro de DeleteMessage; o MessageId é só a identidade da mensagem. Apagar funciona em qualquer tipo de fila e não depende do modo de polling.

Q: Um tópico SNS foi assinado por uma fila SQS, mas nenhuma mensagem chega à fila. A assinatura está confirmada. Qual é a causa mais provável?
- A fila não usa long polling.
- A fila é Standard e o tópico é Standard, e o SNS só entrega para filas SQS do tipo FIFO.
+ A política de acesso da fila não permite sqs:SendMessage para o tópico SNS.
- O visibility timeout está alto.
E: O SNS publica na fila usando a política da fila, que precisa permitir sqs:SendMessage ao principal sns.amazonaws.com com a condição do ARN do tópico. Polling e visibility timeout afetam o consumo, não a chegada, e tópico Standard com fila Standard é uma combinação válida.

Q: Uma frota de consumidores em ECS deve aumentar quando a fila acumula mensagens e diminuir quando ela esvazia. Qual métrica é a base recomendada para a escala?
- O tamanho médio das mensagens.
- A CPUUtilization média das tarefas, que sobe automaticamente sempre que a fila acumula mensagens.
- NumberOfMessagesDeleted.
+ O backlog por tarefa: ApproximateNumberOfMessagesVisible dividido pelo número de tarefas.
E: Escalar pelo backlog por consumidor mede diretamente o trabalho pendente em relação à capacidade. CPU pode ficar baixa com a fila crescendo (tarefas esperando I/O), NumberOfMessagesDeleted mostra o que já foi feito e o tamanho das mensagens não mede atraso.

Q: Um produtor reenviou a mesma mensagem para uma fila FIFO três vezes em um minuto, após timeouts, usando o mesmo MessageDeduplicationId. O que acontece?
- As duas últimas chamadas recebem um erro de duplicata, e o produtor precisa tratar a exceção.
- A fila apaga a mensagem original e guarda a última.
- A fila entrega as três cópias, em ordem.
+ A fila aceita as três chamadas, mas entrega a mensagem só uma vez.
E: Dentro do intervalo de 5 minutos, mensagens com o mesmo id de deduplicação são aceitas, mas só a primeira é entregue. Não há erro para o produtor, e a mensagem original não é substituída.

## Flashcards

F: Standard vs. FIFO no SQS
V: Standard: vazão ilimitada, pelo menos uma vez, ordem de melhor esforço. FIFO: ordem por MessageGroupId, exatamente uma vez (dedup 5 min), 300 msg/s ou 3.000 com lotes.

F: Visibility timeout do SQS
V: Padrão 30 s, de 0 a 12 h. Tempo em que a mensagem recebida fica invisível. Estenda com ChangeMessageVisibility.

F: Retenção de mensagens no SQS
V: Padrão 4 dias, de 1 minuto a 14 dias.

F: Tamanho máximo de mensagem no SQS
V: 1 MiB (desde agosto de 2025; antes 256 KB). Maiores: S3 + referência (Extended Client Library, até 2 GB).

F: O que é long polling no SQS?
V: ReceiveMessage espera até 20 s (WaitTimeSeconds) por mensagens. Reduz respostas vazias e custo.

F: Delay queue vs. timer de mensagem
V: Delay queue atrasa todas as mensagens da fila (0–15 min). Timer atrasa só uma mensagem (DelaySeconds no envio), só em Standard.

F: Como configurar uma DLQ no SQS?
V: Redrive policy na fila de origem com o ARN da DLQ e maxReceiveCount. DLQ do mesmo tipo, conta e Região. Depois, redrive de volta.

F: MessageGroupId e MessageDeduplicationId
V: Grupo define a ordem (paralelismo entre grupos). Dedup id (ou content-based dedup) descarta reenvios iguais dentro de 5 minutos.

F: Qual valor se usa para apagar uma mensagem do SQS?
V: O ReceiptHandle do recebimento mais recente, não o MessageId.

F: Métricas do SQS para escalar e alertar
V: ApproximateNumberOfMessagesVisible (backlog), ApproximateAgeOfOldestMessage (atraso) e ApproximateNumberOfMessagesNotVisible (em processamento).
