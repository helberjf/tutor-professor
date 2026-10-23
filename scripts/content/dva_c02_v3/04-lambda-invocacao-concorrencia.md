# 04. Lambda: invocação, falhas, destinos e concorrência

## Mapa da aula
Nesta aula você aprende como a Lambda é chamada e o que acontece quando algo dá errado:

• os três modelos de invocação: síncrona, assíncrona e por event source mapping;
• o que cada serviço usa (API Gateway, S3, SNS, EventBridge, SQS...);
• retries automáticos, idade máxima do evento, destinos e DLQ na invocação assíncrona;
• quem pode invocar a função: a política baseada em recurso;
• concorrência: como calcular, limite da conta, concorrência reservada e provisionada;
• throttling e como cada modelo de invocação reage a ele.

## Três formas de invocar
1. Síncrona (InvocationType RequestResponse): o chamador espera o resultado. Usada por API Gateway, Application Load Balancer, Function URLs, Cognito triggers e chamadas diretas do SDK/CLI. Se a função falhar, quem chamou decide se repete.
2. Assíncrona (InvocationType Event): Lambda coloca o evento em uma fila interna, responde 202 na hora e executa depois. Usada por S3, SNS, EventBridge, CloudWatch Logs e chamadas do SDK com Event. Lambda faz os retries.
3. Event source mapping (polling): Lambda busca registros em uma fila ou stream e invoca a função com lotes. Usada por SQS, Kinesis, DynamoDB Streams, Amazon MQ e Kafka (MSK). Assunto da aula 05.

Existe também DryRun, que só verifica se a chamada seria autorizada, sem executar o código.

Na prova, identificar o modelo de invocação é metade da resposta: retries, destinos e tratamento de throttling dependem dele.

## Invocação síncrona e seus erros
Na chamada síncrona, a resposta da API Invoke tem StatusCode 200 quando a função foi executada, mesmo que o seu código tenha lançado exceção. Nesse caso, a resposta inclui FunctionError (por exemplo, Unhandled) e o payload traz errorMessage e errorType.

Dois tipos de erro, com tratamentos diferentes:

• Erro de invocação: a chamada nem chegou ao código. Exemplos: AccessDeniedException (falta lambda:InvokeFunction), TooManyRequestsException (429, throttling), RequestEntityTooLargeException (413, payload acima de 6 MB), ResourceNotFoundException (nome ou Região errados).
• Erro de função: o código rodou e falhou. Exemplos: exceção não tratada, timeout, falta de memória.

Lambda não repete automaticamente uma invocação síncrona. O SDK do chamador pode repetir erros transitórios, como o 429.

```typescript
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

const lambda = new LambdaClient({});
const resposta = await lambda.send(new InvokeCommand({
  FunctionName: "calcular-frete:prod",        // função:alias
  InvocationType: "RequestResponse",
  Payload: JSON.stringify({ cep: "01001-000" }),
}));
const corpo = JSON.parse(new TextDecoder().decode(resposta.Payload));
if (resposta.FunctionError) {
  throw new Error(`a função falhou: ${corpo.errorMessage}`);
}
console.log(corpo);
```

## Invocação assíncrona: fila interna e retries
Na invocação assíncrona, a resposta 202 significa apenas "evento aceito". O resultado não volta para quem chamou.

Se a execução falhar (exceção ou timeout), Lambda tenta de novo automaticamente:
• por padrão, mais 2 tentativas (3 execuções no total), com espera entre elas (cerca de 1 minuto antes da segunda e 2 minutos antes da terceira);
• você pode configurar de 0 a 2 retries (MaximumRetryAttempts);
• a idade máxima do evento (MaximumEventAgeInSeconds) vai de 60 segundos a 6 horas; por padrão, 6 horas.

Se a função sofre throttling ou o serviço tem erro interno, o evento volta para a fila interna e Lambda continua tentando até a idade máxima do evento.

Como a mesma mensagem pode ser executada mais de uma vez (retries ou entrega duplicada), o código assíncrono precisa ser idempotente.

## Destinos e DLQ
Quando um evento assíncrono esgota as tentativas ou expira, ele é descartado, a menos que você configure para onde mandá-lo.

Destinos (destinations) recebem um registro da invocação com o evento original, o contexto e a resposta ou o erro:
• On success: depois de uma execução bem-sucedida.
• On failure: depois que as tentativas acabam ou o evento expira.
• Tipos de destino: fila SQS, tópico SNS, barramento EventBridge, outra função Lambda e, para falhas, bucket S3.

Dead-letter queue (DLQ) é o mecanismo mais antigo: uma fila SQS ou tópico SNS recebe só o evento original que falhou, sem detalhes do erro e só para falhas.

Na prova: "enviar o resultado de execuções assíncronas bem-sucedidas para outro serviço" → destino on-success. "Guardar eventos que falharam com detalhes do erro" → destino on-failure (preferido em relação à DLQ). Destinos e retries assíncronos valem para invocações assíncronas; para SQS e streams há configurações próprias (aula 05).

A role de execução precisa de permissão para enviar ao destino (sqs:SendMessage, sns:Publish, events:PutEvents ou lambda:InvokeFunction).

## Quem pode invocar a função
A política baseada em recurso da função (resource-based policy) diz quais principais podem chamá-la. Quando você configura um gatilho no console, ele cria essa permissão. Por linha de comando:

aws lambda add-permission --function-name processar-upload --statement-id s3-invoke --action lambda:InvokeFunction --principal s3.amazonaws.com --source-arn arn:aws:s3:::uploads-clientes --source-account 111122223333

Use SourceArn (e SourceAccount, para S3) para que apenas aquele bucket, tópico ou API possa invocar. Sem isso, outro recurso do mesmo serviço em outra conta poderia chamar sua função.

A política de recurso também permite que outra conta invoque a função, sem precisar assumir uma role.

Erro clássico: "o bucket está configurado para notificar a Lambda, mas a função nunca é chamada" → falta a permissão lambda:InvokeFunction para s3.amazonaws.com na política de recurso.

## Concorrência: quantas execuções ao mesmo tempo
Concorrência é o número de invocações em andamento no mesmo instante. Cada uma ocupa um ambiente de execução. A estimativa é:

concorrência ≈ requisições por segundo × duração média em segundos

Exemplos:
• 100 requisições/s × 0,5 s = 50 execuções simultâneas.
• 100 requisições/s × 3 s = 300 execuções simultâneas.

Ou seja, uma dependência lenta aumenta a concorrência mesmo sem aumentar o tráfego.

Limites:
• Por padrão, cada conta tem 1.000 execuções simultâneas por Região, compartilhadas por todas as funções. É um limite ajustável (pedido em Service Quotas).
• Cada função pode escalar até 1.000 novos ambientes a cada 10 segundos.

Quando não há concorrência disponível, a invocação sofre throttling.

## Throttling em cada modelo
• Síncrona: o chamador recebe TooManyRequestsException (HTTP 429). Pelo API Gateway, o cliente vê 429 ou 5xx, dependendo da configuração. Quem chamou precisa repetir com backoff.
• Assíncrona: Lambda devolve o evento à fila interna e tenta de novo por até 6 horas (ou a idade máxima configurada). Depois disso, vai para o destino on-failure ou DLQ.
• Event source mapping: o poller espera e tenta de novo; as mensagens ficam na fila ou no stream.

A métrica Throttles no CloudWatch mostra quantas invocações foram rejeitadas. Throttle não é uma exceção dentro do seu código: o handler nem chega a rodar.

## Concorrência reservada
Concorrência reservada faz duas coisas para uma função:
• garante: separa aquela quantidade do total da conta, para que outras funções não a consumam;
• limita: a função nunca passa daquele número de execuções simultâneas.

Usos típicos:
• proteger um banco que aguenta no máximo 50 conexões: reserve 50 (se cada execução usa uma conexão);
• impedir que uma função consuma toda a concorrência da conta;
• desligar uma função em emergência: reserva 0 faz todas as invocações sofrerem throttling.

A conta precisa manter pelo menos 100 execuções sem reserva para as demais funções. Reservar concorrência não tem custo extra e não deixa ambientes prontos.

## Concorrência provisionada
Concorrência provisionada mantém um número de ambientes já inicializados, prontos para responder sem cold start.

• É configurada em uma versão publicada ou em um alias, nunca em $LATEST.
• Tem custo enquanto estiver ativa, mesmo sem tráfego.
• Se o tráfego passar do valor provisionado, as invocações extras usam ambientes sob demanda (com cold start), dentro dos limites.
• Pode ser ajustada com Application Auto Scaling, por agendamento (subir às 8h, descer às 20h) ou por uso.

Comparação para a prova:
• "Latência baixa e previsível, sem cold start, em uma API crítica" → concorrência provisionada no alias usado pela API.
• "Garantir capacidade e impor um teto para proteger o banco" → concorrência reservada.
• As duas podem ser usadas juntas.

## Laços recursivos
Uma função que grava no mesmo bucket S3 que a dispara cria um laço: cada arquivo novo gera outro evento. Lambda detecta laços recursivos envolvendo SQS, SNS e S3 e interrompe a cadeia depois de cerca de 16 invocações, mas o certo é evitar o laço no desenho:

• grave a saída em outro bucket ou em outro prefixo, e filtre a notificação pelo prefixo de entrada;
• ou verifique metadados para ignorar arquivos que a própria função criou.

## Pegadinhas frequentes
• Resposta 202 significa "evento aceito", não "processado".
• StatusCode 200 com FunctionError é falha da função.
• Retries e destinos assíncronos não se aplicam a SQS e streams.
• DLQ guarda só o evento; destino on-failure guarda evento, contexto e erro.
• Reservada limita e garante; provisionada deixa ambientes prontos. Reservada não reduz cold start.
• Concorrência provisionada não funciona em $LATEST.
• Reserva 0 desliga a função.

## Resumo para revisão
• Síncrona: API Gateway, ALB, Function URL, SDK. Sem retry automático da Lambda.
• Assíncrona: S3, SNS, EventBridge. 202 imediato; 2 retries por padrão (0–2); idade máxima 60 s–6 h.
• Destinos (SQS, SNS, EventBridge, Lambda, S3 para falha) para sucesso ou falha; DLQ (SQS/SNS) só para falha.
• Política de recurso da função (lambda add-permission) define quem invoca; use SourceArn.
• Concorrência ≈ taxa × duração. Limite padrão: 1.000 por Região por conta.
• Throttling: síncrona → 429; assíncrona → reprocessa até 6 h; polling → espera na fila.
• Reservada: garante e limita (0 desliga). Provisionada: ambientes prontos em versão/alias, com custo.

## Questões

Q: Uma função é disparada por notificações de um bucket S3. Às vezes a função falha por um erro temporário em uma API externa. O que acontece com o evento, por padrão?
- Ele é perdido imediatamente, porque o S3 não faz retries.
- O evento volta para o bucket como um novo objeto.
- O S3 reenvia o evento até a função ter sucesso, por até 14 dias.
+ Lambda tenta executar o evento mais duas vezes, com intervalo entre as tentativas.
E: O S3 invoca a Lambda de forma assíncrona, e a invocação assíncrona tem duas novas tentativas por padrão. O S3 não faz retries por conta própria e não há reenvio por 14 dias; esgotadas as tentativas, o evento é descartado ou vai para o destino de falha, se houver.

Q: Uma equipe quer que, depois que cada evento assíncrono for processado com sucesso, um registro com o resultado da função seja enviado para uma fila SQS, sem escrever esse envio no código. Qual recurso usar?
- Um event source mapping da fila SQS.
- A política baseada em recurso da função.
+ Um destino on-success apontando para a fila SQS.
- Uma dead-letter queue SQS na função.
E: Destinos on-success recebem o registro da invocação, com a resposta da função, após execuções assíncronas bem-sucedidas. A DLQ recebe só falhas; o event source mapping lê de uma fila, não escreve nela; e a política de recurso controla quem pode invocar a função.

Q: Uma função processa eventos assíncronos. A equipe quer guardar os eventos que falharem depois de todas as tentativas, junto com a mensagem de erro, para investigar. Qual é a melhor opção?
+ Configurar um destino on-failure (por exemplo, uma fila SQS).
- Configurar uma DLQ SNS na função, que inclui no aviso o stack trace completo da exceção.
- Aumentar MaximumRetryAttempts para 10.
- Gravar os eventos em /tmp quando ocorrer uma exceção e consultá-los depois pelo console da função.
E: O destino on-failure recebe o evento, o contexto e os detalhes do erro. A DLQ guarda só o evento original, sem detalhes da falha; o máximo de retries assíncronos é 2; e /tmp é local ao ambiente e se perde.

Q: Um bucket S3 foi configurado para enviar eventos a uma função, mas ela nunca é executada. Os logs da função estão vazios e a role de execução está correta. Qual é a causa mais provável?
- A role de execução não tem s3:GetObject.
- O S3 só invoca funções na Região us-east-1, e o bucket e a função precisam ser criados lá para funcionar.
- A função precisa de concorrência provisionada, porque o S3 só entrega eventos para ambientes de execução já inicializados.
+ A política baseada em recurso da função não permite lambda:InvokeFunction para s3.amazonaws.com.
E: Para o S3 invocar a função, a política de recurso da função deve permitir lambda:InvokeFunction ao principal s3.amazonaws.com, de preferência com SourceArn do bucket. A role de execução controla o que a função faz depois de rodar; concorrência provisionada não é exigida; e notificações funcionam em qualquer Região, desde que bucket e função estejam na mesma.

Q: Uma API recebe em média 200 requisições por segundo, e cada execução da função leva 2 segundos. Qual é a concorrência média aproximada?
- 100
- 2.000
- 200
+ 400
E: Concorrência ≈ taxa × duração = 200 × 2 = 400 execuções simultâneas. 100 seria dividir em vez de multiplicar, 200 ignora a duração e 2.000 erra a ordem de grandeza.

Q: Uma função escreve em um banco relacional que suporta no máximo 50 conexões. Em picos, a função escala e o banco recusa conexões. Cada execução usa uma conexão. Qual configuração limita a função com o menor esforço?
- Memória de 50 MB.
- Timeout de 50 segundos.
- Concorrência provisionada de 50.
+ Concorrência reservada de 50.
E: A concorrência reservada impõe um teto de execuções simultâneas, logo de conexões. A provisionada mantém ambientes prontos, mas não impede que o tráfego extra use ambientes sob demanda; timeout e memória não limitam simultaneidade (e 50 MB está abaixo do mínimo de 128 MB). Um RDS Proxy também ajudaria (aula 06).

Q: Uma API crítica precisa de latência baixa e previsível, sem cold starts, no horário comercial. Qual solução atende?
- Concorrência provisionada configurada em $LATEST, para que cada nova edição do código já receba ambientes prontos.
- Concorrência reservada na função.
- Aumentar a memória para 10.240 MB.
+ Concorrência provisionada no alias usado pela API, agendada com Application Auto Scaling.
E: Concorrência provisionada mantém ambientes inicializados e pode ser agendada para o horário de uso. Ela só pode ser configurada em versão publicada ou alias, não em $LATEST. Concorrência reservada não deixa ambientes prontos, e mais memória reduz o tempo de processamento, mas não elimina o cold start.

Q: Durante um incidente, a equipe precisa impedir imediatamente que uma função seja executada, sem apagá-la. O que fazer?
- Apagar os logs da função.
+ Definir a concorrência reservada da função como 0.
- Definir o timeout como 0.
- Remover a role de execução da função, o que bloqueia novas invocações até a role ser associada de novo.
E: Reserva 0 faz todas as invocações sofrerem throttling, e basta remover a reserva para voltar. Remover a role faz a função falhar ao acessar recursos, mas ela continua sendo invocada; timeout mínimo é 1 segundo; e apagar logs não afeta a execução.

Q: Uma aplicação chama uma função de forma síncrona e às vezes recebe TooManyRequestsException. O que isso indica e o que o chamador deve fazer?
- Payload grande demais; dividir o evento.
- Erro no código da função; corrigir o handler.
- Falta de permissão; adicionar lambda:InvokeFunction à identidade que chama, porque o erro vem antes da execução.
+ Throttling por falta de concorrência; repetir com backoff e rever os limites.
E: TooManyRequestsException (429) é throttling: a função não tinha concorrência disponível e o código nem rodou. Payload grande gera 413 e falta de permissão gera AccessDeniedException. O chamador síncrono é responsável por repetir.

Q: Uma função grava a versão redimensionada de uma imagem no mesmo bucket que dispara a função, e a conta começou a ter milhares de invocações. Qual é a correção recomendada?
+ Gravar as imagens geradas em outro bucket ou prefixo e filtrar a notificação pelo prefixo de entrada.
- Aumentar o timeout para a função terminar de gravar antes que o próximo evento do bucket seja gerado e entregue.
- Configurar concorrência provisionada para absorver as invocações.
- Desativar a detecção de laços recursivos.
E: O laço acontece porque cada imagem gerada dispara um novo evento. Separar entrada e saída (bucket ou prefixo diferente, com filtro na notificação) elimina o laço. Desativar a proteção piora, e capacidade ou timeout não mudam a origem dos eventos.

## Flashcards

F: Quais serviços invocam a Lambda de forma síncrona?
V: API Gateway, Application Load Balancer, Function URLs, Cognito triggers e chamadas diretas do SDK/CLI com RequestResponse.

F: Quais serviços invocam a Lambda de forma assíncrona?
V: S3, SNS, EventBridge, CloudWatch Logs e chamadas do SDK com InvocationType Event.

F: Retries na invocação assíncrona
V: 2 novas tentativas por padrão (configurável de 0 a 2). Idade máxima do evento de 60 s a 6 h (padrão 6 h).

F: Destinos vs. DLQ na Lambda
V: Destinos: on-success e on-failure, com evento, contexto e resposta/erro (SQS, SNS, EventBridge, Lambda, S3 para falha). DLQ: só falhas, só o evento original (SQS ou SNS).

F: Resposta da API Invoke com StatusCode 200 e FunctionError
V: A função foi executada, mas o código falhou (exceção ou timeout). O payload traz errorMessage e errorType.

F: Fórmula de concorrência da Lambda
V: Concorrência ≈ requisições por segundo × duração média em segundos.

F: Limite padrão de concorrência da Lambda
V: 1.000 execuções simultâneas por Região por conta (ajustável). Cada função escala até 1.000 ambientes a cada 10 s.

F: Concorrência reservada
V: Garante e limita a concorrência de uma função. Sem custo extra. Reserva 0 desliga a função. Não reduz cold start.

F: Concorrência provisionada
V: Mantém ambientes inicializados em uma versão ou alias (não em $LATEST). Elimina cold start até o valor provisionado. Tem custo. Pode usar Application Auto Scaling.

F: Como o S3 ganha permissão para invocar uma função?
V: Pela política baseada em recurso da função: lambda add-permission com principal s3.amazonaws.com, SourceArn do bucket e SourceAccount.
