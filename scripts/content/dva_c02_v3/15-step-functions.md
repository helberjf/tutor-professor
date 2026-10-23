# 15. Step Functions: estados, integrações, erros e fluxo de dados

## Mapa da aula
AWS Step Functions orquestra etapas com controle de erros, esperas e paralelismo. Nesta aula:

• máquina de estados, ASL e os tipos de estado;
• workflows Standard e Express;
• os três padrões de integração: request-response, .sync e callback com task token;
• Retry e Catch, erros predefinidos e timeouts;
• fluxo de dados: InputPath, Parameters, ResultSelector, ResultPath e OutputPath;
• Map e Parallel;
• compensação (saga), limite de payload e permissões.

## Máquina de estados e tipos de estado
Uma máquina de estados (state machine) é definida em JSON na Amazon States Language (ASL). Cada execução recebe uma entrada JSON e percorre os estados.

Tipos de estado:
• Task: faz um trabalho (invoca Lambda, chama uma API da AWS, inicia um job).
• Choice: escolhe o próximo estado por condições sobre os dados.
• Wait: espera um tempo fixo ou até um horário (sem cobrar por tempo ocioso em Standard).
• Parallel: executa ramos diferentes ao mesmo tempo.
• Map: executa os mesmos passos para cada item de uma lista.
• Pass: passa ou monta dados, sem trabalho externo.
• Succeed e Fail: terminam a execução com sucesso ou falha.

A máquina tem uma role IAM, e é ela que precisa de permissão para invocar as funções e serviços usados nas Tasks.

```json
{
  "StartAt": "ValidarPedido",
  "States": {
    "ValidarPedido": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Parameters": {"FunctionName": "validar-pedido", "Payload.$": "$"},
      "ResultSelector": {"valido.$": "$.Payload.valido"},
      "ResultPath": "$.validacao",
      "Next": "PedidoValido?"
    },
    "PedidoValido?": {
      "Type": "Choice",
      "Choices": [{"Variable": "$.validacao.valido", "BooleanEquals": true, "Next": "Cobrar"}],
      "Default": "Rejeitar"
    },
    "Cobrar": {"Type": "Task", "Resource": "arn:aws:states:::lambda:invoke",
               "Parameters": {"FunctionName": "cobrar", "Payload.$": "$"}, "End": true},
    "Rejeitar": {"Type": "Fail", "Error": "PedidoInvalido", "Cause": "dados inválidos"}
  }
}
```

## Standard vs. Express
Standard:
• duração de até 1 ano;
• cada etapa executa exatamente uma vez (salvo retries que você configurar);
• histórico completo de cada execução visível no console;
• cobrança por transição de estado;
• ideal para processos de negócio longos, com esperas humanas e auditoria.

Express:
• duração de até 5 minutos;
• altíssima taxa de execuções por segundo;
• cobrança por número de execuções, duração e memória, mais barata em alto volume;
• execução assíncrona com semântica pelo menos uma vez, ou síncrona (StartSyncExecution) com no máximo uma vez;
• histórico enviado ao CloudWatch Logs, se configurado.

Na prova: "processar milhões de eventos de IoT por dia com etapas curtas" → Express. "Aprovação manual que pode levar dias" → Standard. "Não pode executar uma etapa de pagamento duas vezes" → Standard (com idempotência nas etapas).

## Padrões de integração
Request-response (padrão): a Task chama a API e segue assim que recebe a resposta. Exemplo: publicar em um tópico SNS. Atenção: iniciar um job assim não espera o job terminar.

Run a job (.sync): a Task inicia o trabalho e espera ele terminar antes de seguir. O recurso termina em .sync, como arn:aws:states:::ecs:runTask.sync, glue:startJobRun.sync ou states:startExecution.sync (outra máquina de estados). Step Functions acompanha o job por você.

Callback (.waitForTaskToken): a Task envia um token para um sistema externo (por exemplo, em uma mensagem SQS ou e-mail de aprovação) e pausa. Quando o sistema termina, ele chama SendTaskSuccess (com o resultado) ou SendTaskFailure, passando o token. O token está no objeto de contexto: "token.$": "$$.Task.Token".

Para callbacks longos, use HeartbeatSeconds: o sistema externo precisa chamar SendTaskHeartbeat periodicamente; se não chamar, a Task falha com States.HeartbeatTimeout, em vez de esperar até o timeout final.

Integrações de SDK: Step Functions chama mais de 200 serviços diretamente (arn:aws:states:::aws-sdk:servico:acao), como DynamoDB PutItem, sem Lambda intermediária.

## Retry
Cada Task (e Parallel e Map) pode ter uma lista Retry. Cada item tem:

• ErrorEquals: quais erros tratar;
• IntervalSeconds: espera antes da primeira nova tentativa (padrão 1);
• MaxAttempts: quantas novas tentativas (padrão 3; 0 desliga);
• BackoffRate: multiplicador da espera (padrão 2,0);
• MaxDelaySeconds e JitterStrategy (FULL) para limitar e espalhar as esperas.

Exemplo: IntervalSeconds 2, BackoffRate 2, MaxAttempts 3 → esperas de 2, 4 e 8 segundos.

Erros predefinidos:
• States.ALL: qualquer erro (deve ser o último da lista);
• States.Timeout: a Task passou do TimeoutSeconds;
• States.TaskFailed: falha da tarefa;
• States.Permissions: falta permissão;
• States.HeartbeatTimeout: faltou heartbeat.

Para Lambda, é comum repetir Lambda.ServiceException, Lambda.TooManyRequestsException e Lambda.SdkClientException. As regras são avaliadas em ordem; a primeira que combina vale.

Defina TimeoutSeconds nas Tasks: sem ele, uma Task de callback pode esperar até o limite da execução.

## Catch
Quando os retries acabam (ou o erro não tem retry), a lista Catch decide o caminho:

• ErrorEquals: quais erros capturar;
• Next: para qual estado ir;
• ResultPath: onde colocar as informações do erro. Use ResultPath: "$.erro" para manter a entrada original e acrescentar o erro; sem isso, a saída de erro substitui a entrada e você perde os dados do pedido.

Sem um Catch que combine, o erro encerra a execução com falha.

Combinação típica: Retry para erros transitórios (throttling, timeout), Catch para todos os outros, levando a um estado de compensação ou de notificação.

```json
"Cobrar": {
  "Type": "Task",
  "Resource": "arn:aws:states:::lambda:invoke",
  "Parameters": {"FunctionName": "cobrar", "Payload.$": "$"},
  "TimeoutSeconds": 30,
  "Retry": [{"ErrorEquals": ["Lambda.TooManyRequestsException", "States.Timeout"],
             "IntervalSeconds": 2, "BackoffRate": 2.0, "MaxAttempts": 3}],
  "Catch": [{"ErrorEquals": ["States.ALL"], "ResultPath": "$.erro", "Next": "EstornarReserva"}],
  "Next": "EmitirNota"
}
```

## Fluxo de dados com JSONPath
Cada estado processa os dados nesta ordem:

1. InputPath: seleciona a parte da entrada que o estado usa (padrão $, tudo).
2. Parameters: monta o JSON enviado à tarefa. Chaves terminadas em .$ recebem valores por caminho: "pedido_id.$": "$.pedido.id". $$ acessa o objeto de contexto (id da execução, token).
3. A tarefa executa e devolve um resultado.
4. ResultSelector: escolhe e renomeia campos do resultado (útil para tirar só o Payload da resposta da Lambda).
5. ResultPath: onde colocar o resultado na entrada original:
   • $ (padrão): o resultado substitui a entrada inteira;
   • $.cobranca: o resultado é acrescentado em cobranca, mantendo o resto da entrada;
   • null: o resultado é descartado e a entrada segue intacta.
6. OutputPath: filtra o que segue para o próximo estado.

Na prova: "o estado seguinte perdeu os dados do pedido" → o ResultPath padrão substituiu a entrada; use ResultPath com um caminho próprio.

Step Functions também aceita JSONata como linguagem de consulta, com campos Arguments e Output e variáveis (Assign), simplificando esse fluxo em máquinas novas.

## Map e Parallel
Parallel: executa ramos diferentes ao mesmo tempo (por exemplo, emitir nota e enviar e-mail). Ele espera todos os ramos e devolve uma lista com as saídas. Se um ramo falha sem tratamento, o Parallel inteiro falha.

Map: aplica os mesmos passos a cada item de uma lista.
• Modo inline: os itens vêm da entrada do estado; até 40 iterações em paralelo. MaxConcurrency limita (1 = sequencial).
• Modo distributed: processa grandes volumes (milhões de objetos), lendo itens de um arquivo ou prefixo do S3 e criando até 10.000 execuções filhas em paralelo. ToleratedFailurePercentage define quanto de falha é aceitável.

Use MaxConcurrency para não sobrecarregar uma dependência.

## Saga, payload e como iniciar
Saga: em processos com várias etapas que já tiveram efeito (cobrou, reservou), uma falha posterior não desfaz o que passou. Cada etapa precisa de uma ação de compensação (estornar, liberar estoque), chamada pelos Catch na ordem inversa. As compensações também devem ser idempotentes.

Limite de payload: a entrada e a saída de cada estado têm até 256 KB. Para documentos grandes, grave no S3 e passe só bucket e chave entre os estados.

Como iniciar uma execução:
• StartExecution pela API ou SDK (assíncrono). Em workflows Standard, um nome de execução repetido com a mesma entrada não cria outra execução, o que dá idempotência.
• StartSyncExecution para Express síncrono.
• Alvo de uma regra do EventBridge, integração de serviço no API Gateway ou outra máquina de estados.

Para testar, a API TestState executa um estado isolado com uma entrada de exemplo, sem criar a máquina inteira.

## Pegadinhas frequentes
• Request-response não espera o job terminar; use .sync.
• Callback exige o token ($$.Task.Token) e SendTaskSuccess/SendTaskFailure.
• States.ALL deve ser o último em ErrorEquals.
• ResultPath padrão ($) substitui a entrada; use um caminho ou null.
• No Catch, sem ResultPath, você perde a entrada original.
• Express dura no máximo 5 minutos; Standard até 1 ano.
• Payload de 256 KB por estado: passe referências do S3.

## Resumo para revisão
• Estados: Task, Choice, Wait, Parallel, Map, Pass, Succeed, Fail. Definição em ASL.
• Standard: 1 ano, exatamente uma vez, histórico, por transição. Express: 5 min, alto volume, pelo menos uma vez (assíncrono).
• Integrações: request-response, .sync (espera o job), .waitForTaskToken (callback, heartbeat).
• Retry: ErrorEquals, IntervalSeconds (1), MaxAttempts (3), BackoffRate (2,0). Erros States.ALL, Timeout, TaskFailed, Permissions, HeartbeatTimeout.
• Catch: Next e ResultPath para manter a entrada.
• InputPath → Parameters → ResultSelector → ResultPath → OutputPath.
• Map inline (40) e distributed (10.000, S3); Parallel com ramos fixos.
• Saga com compensações; 256 KB por estado.

## Questões

Q: Um processo de aprovação de crédito precisa esperar a análise de um gerente, que pode levar até 5 dias. O fluxo deve ter histórico auditável de cada passo. Qual configuração atende?
- Workflow Express com uma Task que faz polling a cada minuto.
+ Workflow Standard com uma Task .waitForTaskToken; o sistema do gerente devolve o token com SendTaskSuccess.
- Workflow Express com estado Wait de 5 dias.
- Uma função Lambda que espera 5 dias.
E: O workflow Standard dura até 1 ano e guarda o histórico; o callback pausa sem consumir execução até o token voltar. Express dura no máximo 5 minutos, a Lambda tem limite de 15 minutos e polling desperdiça recursos.

Q: Uma Task inicia uma tarefa ECS com a integração padrão e segue imediatamente para o próximo estado, que lê o resultado antes de a tarefa terminar. Como corrigir?
- Adicionar um Retry com MaxAttempts 10.
+ Usar a integração .sync (ecs:runTask.sync) para a Task esperar a tarefa terminar.
- Mudar para workflow Express.
- Adicionar um estado Wait de 10 minutos.
E: O padrão request-response só inicia o job; o .sync faz o Step Functions esperar a conclusão. Um Wait fixo é frágil, Express não muda o padrão de integração e Retry trata erros, não espera.

Q: Uma Task que chama uma função Lambda falha às vezes com Lambda.TooManyRequestsException. A equipe quer tentar de novo até 3 vezes, com espera crescente. O que configurar?
- Um Map com MaxConcurrency 3.
- Um estado Wait de 10 segundos antes da Task, para dar tempo de a concorrência da função ser liberada.
+ Um Retry com ErrorEquals ["Lambda.TooManyRequestsException"], MaxAttempts 3 e BackoffRate 2.
- Um Catch com ErrorEquals States.ALL apontando de volta para a mesma Task, com um contador no estado.
E: Retry repete a Task para os erros listados, com esperas multiplicadas pelo BackoffRate. Catch muda de caminho sem repetir, Wait sempre espera mesmo sem erro e Map é para listas.

Q: Depois de adicionar um Catch que leva a um estado de notificação, a equipe percebe que esse estado não recebe mais os dados do pedido, só o erro. Qual é a correção?
- Trocar States.ALL por States.TaskFailed no Catch, que preserva automaticamente a entrada original do estado.
- Usar OutputPath "$" no estado de notificação, para que ele recupere a entrada original da execução.
- Mover o Catch para depois do Retry.
+ Definir ResultPath no Catch, por exemplo "$.erro", para acrescentar o erro à entrada original.
E: Sem ResultPath, a saída do erro substitui a entrada; com "$.erro", o erro é acrescentado e os dados do pedido seguem junto. A ordem Retry/Catch, o OutputPath do estado seguinte e o tipo de erro capturado não recuperam os dados perdidos.

Q: Uma Task chama uma função de cobrança, e o próximo estado precisa tanto dos dados originais do pedido quanto do id da cobrança. A saída atual tem só o resultado da função. O que mudar?
- Definir OutputPath "$.Payload".
- Definir InputPath "$.cobranca" na Task de cobrança.
+ Definir ResultPath "$.cobranca" na Task.
- Definir ResultPath null.
E: Com ResultPath em um caminho, o resultado é acrescentado à entrada. O ResultPath padrão substitui tudo, null descarta o resultado e InputPath/OutputPath só selecionam partes, sem juntar entrada e resultado.

Q: Uma empresa processa milhões de leituras de sensores por dia, cada uma com três etapas rápidas que terminam em segundos. Ela quer o menor custo. Qual tipo de workflow escolher?
- Standard com Map distributed.
+ Express, por ser feito para alto volume e execuções curtas, cobrado por execução e duração.
- Activities com workers em EC2.
- Standard, porque é cobrado por execução e não por transição, ficando mais barato em grandes volumes.
E: Express é mais barato e suporta alta taxa de execuções curtas (até 5 minutos). Standard é cobrado por transição de estado, o que encarece volumes altos; Map distributed é para processar grandes conjuntos dentro de uma execução; e workers em EC2 aumentam a operação.

Q: Uma etapa precisa processar 2 milhões de arquivos de um prefixo do S3, com até 1.000 em paralelo, tolerando 1% de falhas. Qual recurso usar?
+ Estado Map no modo distributed, lendo os itens do S3, com MaxConcurrency e ToleratedFailurePercentage.
- Estado Map inline com os 2 milhões de itens na entrada e MaxConcurrency de 1.000 para processar em paralelo.
- Estado Parallel com 1.000 ramos.
- Um Wait seguido de uma Lambda.
E: O Map distributed lê itens do S3, cria execuções filhas em larga escala e permite tolerar uma porcentagem de falhas. Parallel tem ramos fixos, o Map inline recebe a lista na entrada (limitada a 256 KB) e não escala a milhões, e uma Lambda única teria limite de 15 minutos.

Q: Em um fluxo de pedido, as etapas cobrar, reservar estoque e emitir nota já foram concluídas quando o envio da transportadora falha definitivamente. O que o fluxo deve fazer?
- Usar Retry infinito até a transportadora responder.
- Encerrar com Fail, porque o Step Functions desfaz automaticamente, na ordem inversa, as etapas já concluídas da execução.
+ Executar compensações das etapas já confirmadas (cancelar nota, liberar estoque, estornar), a partir de um Catch.
- Reiniciar a execução do começo.
E: No padrão saga, cada etapa com efeito tem uma compensação, disparada por Catch. O Step Functions não desfaz efeitos externos; repetir para sempre não resolve uma falha definitiva; e reiniciar repetiria cobranças.

Q: A saída de uma Task é um relatório de 2 MB, e a execução falha com erro de tamanho de dados. Qual é a solução recomendada?
+ Gravar o relatório no S3 e passar apenas bucket e chave entre os estados.
- Usar workflow Express, que aceita payloads maiores entre os estados por não guardar histórico de execução.
- Dividir o relatório em vários estados Pass.
- Aumentar o TimeoutSeconds da Task.
E: Entrada e saída de cada estado têm limite de 256 KB nos dois tipos de workflow; o padrão é passar uma referência ao S3. Dividir em estados Pass não reduz o tamanho, e timeout não tem relação com tamanho.

Q: Uma Task envia um token para um sistema externo e espera o callback. Às vezes o sistema externo trava e a execução fica parada por horas até estourar o timeout. Como detectar a falha mais cedo?
- Trocar para request-response.
+ Configurar HeartbeatSeconds e fazer o sistema externo chamar SendTaskHeartbeat periodicamente.
- Remover o TimeoutSeconds.
- Aumentar o MaxAttempts do Retry da Task, para que o callback seja reenviado ao sistema externo até ele responder.
E: Com heartbeat, se o sistema parar de enviar sinais, a Task falha com States.HeartbeatTimeout logo após o intervalo configurado. Remover o timeout piora, request-response não espera callback e retries só agem depois da falha.

## Flashcards

F: Tipos de estado do Step Functions
V: Task, Choice, Wait, Parallel, Map, Pass, Succeed e Fail.

F: Standard vs. Express no Step Functions
V: Standard: até 1 ano, exatamente uma vez, histórico completo, cobrança por transição. Express: até 5 min, alto volume, pelo menos uma vez (assíncrono), cobrança por execução e duração.

F: Os três padrões de integração do Step Functions
V: Request-response (chama e segue), .sync (espera o job terminar) e .waitForTaskToken (pausa até SendTaskSuccess/SendTaskFailure com o token).

F: Campos e padrões de um Retry
V: ErrorEquals, IntervalSeconds (padrão 1), MaxAttempts (padrão 3), BackoffRate (padrão 2,0), MaxDelaySeconds e JitterStrategy.

F: Erros predefinidos do Step Functions
V: States.ALL, States.Timeout, States.TaskFailed, States.Permissions e States.HeartbeatTimeout (entre outros). States.ALL vai por último.

F: Para que serve ResultPath?
V: Onde colocar o resultado na entrada: $ substitui tudo (padrão), $.campo acrescenta e null descarta o resultado.

F: Ordem do processamento de dados em um estado
V: InputPath → Parameters → tarefa → ResultSelector → ResultPath → OutputPath.

F: Map inline vs. distributed
V: Inline: itens da entrada, até 40 em paralelo. Distributed: itens do S3, até 10.000 execuções filhas, ToleratedFailurePercentage.

F: Limite de payload entre estados
V: 256 KB por entrada/saída. Para dados maiores, use S3 e passe a referência.

F: Como evitar que um callback fique preso por horas?
V: HeartbeatSeconds na Task, com SendTaskHeartbeat periódico do sistema externo; sem heartbeat, falha com States.HeartbeatTimeout.
