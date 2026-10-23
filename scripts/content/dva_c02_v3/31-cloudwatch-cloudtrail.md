# 31. CloudWatch e CloudTrail: métricas, logs, Logs Insights, alarmes e auditoria

## Mapa da aula
O domínio 4 começa pela observabilidade. Nesta aula:

• métricas: namespace, dimensões, estatísticas, percentis, resolução e retenção;
• métricas customizadas com PutMetricData e com o Embedded Metric Format (EMF);
• CloudWatch Logs: grupos, retenção, metric filters, subscription filters e exportação;
• consultas com CloudWatch Logs Insights;
• o CloudWatch agent para memória e disco;
• alarmes: períodos, datapoints, dados ausentes, alarmes compostos e metric math;
• Synthetics, Container e Lambda Insights;
• CloudTrail: eventos de gerenciamento e de dados, trilhas e uso em investigações;
• quando usar CloudWatch, CloudTrail, X-Ray ou Config.

## Métricas
Uma métrica é uma série de valores no tempo, identificada por:
• namespace: o "pacote" (AWS/Lambda, AWS/ApiGateway ou um seu, como Loja/Pedidos);
• nome (Errors, Duration, PedidosCriados);
• dimensões: pares nome-valor que separam séries (FunctionName=pedidos, Ambiente=prod). Cada combinação de dimensões é uma métrica diferente.

Estatísticas: Average, Sum, Minimum, Maximum, SampleCount e percentis (p50, p90, p99). Para latência, percentis mostram o que a média esconde: uma média de 200 ms pode conviver com p99 de 3 segundos.

Resolução e retenção:
• padrão: 1 minuto; alta resolução: até 1 segundo (StorageResolution=1);
• dados de 1 segundo ficam 3 horas, de 1 minuto 15 dias, de 5 minutos 63 dias e de 1 hora 455 dias (agregados automaticamente).

EC2 envia métricas a cada 5 minutos por padrão (monitoramento básico) e a cada 1 minuto com monitoramento detalhado. Memória e espaço em disco não são métricas padrão do EC2: exigem o CloudWatch agent.

## Métricas customizadas: PutMetricData e EMF
PutMetricData envia métricas da aplicação para o CloudWatch por API. Cada chamada adiciona latência e pode sofrer throttling se feita a cada requisição.

Embedded Metric Format (EMF): a aplicação escreve uma linha de log em JSON com uma seção _aws que descreve as métricas. O CloudWatch Logs extrai as métricas de forma assíncrona. Vantagens:
• nenhuma chamada de API no caminho da requisição (ideal para Lambda);
• o mesmo registro guarda as métricas e o contexto detalhado (ids, cliente) para investigação.

O Powertools for AWS Lambda (Metrics) gera EMF com poucas linhas.

Na prova: "publicar métricas customizadas de uma Lambda com a menor latência e sem chamadas síncronas" → EMF.

```json
{
  "_aws": {
    "Timestamp": 1792756800000,
    "CloudWatchMetrics": [{
      "Namespace": "Loja/Pedidos",
      "Dimensions": [["Ambiente"]],
      "Metrics": [{"Name": "PedidosCriados", "Unit": "Count"},
                  {"Name": "ValorPedido", "Unit": "None"}]
    }]
  },
  "Ambiente": "prod",
  "PedidosCriados": 1,
  "ValorPedido": 189.9,
  "pedido_id": "p-91",
  "request_id": "c6af9ac6-7b61"
}
```

## CloudWatch Logs
• Log group: agrupa os logs de uma aplicação ou função (/aws/lambda/pedidos). Configurações de retenção, criptografia com KMS e proteção de dados ficam no grupo.
• Log stream: uma sequência de eventos de uma origem (um ambiente de execução da Lambda, uma tarefa ECS).
• Retenção: por padrão, os logs nunca expiram. Defina a retenção (por exemplo, 30 dias) para controlar o custo.

Recursos para usar os logs:
• Metric filter: transforma padrões de log em métricas (contar linhas com "ERROR" ou extrair o valor de latência de um JSON). Só vale para eventos gravados depois da criação do filtro.
• Subscription filter: envia os eventos em tempo quase real para Lambda, Kinesis Data Streams, Amazon Data Firehose ou OpenSearch. Use para processar ou centralizar logs, inclusive de outras contas (com destinations).
• Exportação para o S3 (CreateExportTask): em lote, não em tempo real; para tempo real, use subscription filter com Firehose.
• Live Tail: acompanhar os logs em tempo real no console.

Logs estruturados (JSON com campos como nível, request_id, cliente e duração) tornam as consultas e os filtros muito mais simples do que texto livre.

## CloudWatch Logs Insights
Logs Insights consulta log groups com uma linguagem própria. Comandos principais:
• fields: escolhe os campos a mostrar;
• filter: filtra eventos;
• stats: agrega (count, avg, max, pct, sum) com by para agrupar, inclusive por intervalos de tempo com bin(5m);
• sort e limit: ordenam e limitam;
• parse: extrai campos de texto não estruturado.

Campos de JSON são descobertos automaticamente. A Lambda escreve no fim de cada invocação uma linha REPORT com @duration, @billedDuration, @memorySize e @maxMemoryUsed, que podem ser consultados. Para encontrar invocações lentas: filter @type = "REPORT" | stats pct(@duration, 99) as p99, max(@maxMemoryUsed) as memoria by bin(1h).

Exemplo de consulta de erros em logs JSON:

```sql
fields @timestamp, @message
| filter nivel = "ERROR" and servico = "pagamentos"
| stats count(*) as erros by bin(5m), codigo_erro
| sort erros desc
| limit 20
```

## O CloudWatch agent
O CloudWatch agent (unificado) roda em instâncias EC2 e servidores on-premises para coletar:
• métricas do sistema operacional que o EC2 não publica: memória, uso de disco, swap, processos (procstat);
• arquivos de log da aplicação (/var/log/app.log) para o CloudWatch Logs;
• métricas customizadas via StatsD e collectd.

A configuração fica em um arquivo JSON, que pode ser guardado no Parameter Store para várias instâncias. A instância precisa de uma role com permissão para publicar métricas e logs (a policy CloudWatchAgentServerPolicy).

Na prova: "monitorar uso de memória de instâncias EC2" → CloudWatch agent.

## Alarmes
Um alarme observa uma métrica (ou expressão) e muda de estado: OK, ALARM ou INSUFFICIENT_DATA.

Configuração:
• estatística e período (Sum de Errors a cada 60 segundos);
• limite (threshold) fixo ou detecção de anomalias (uma faixa esperada aprendida do histórico);
• avaliação "M de N": dispara se M dos últimos N períodos violarem o limite (datapoints to alarm), reduzindo alarmes por picos isolados;
• tratamento de dados ausentes: missing (padrão), notBreaching (ausência é bom sinal), breaching (ausência é problema) e ignore. Para uma métrica que só é publicada quando há erro, ausência significa saúde (notBreaching). Para um heartbeat que deveria chegar sempre, ausência é problema (breaching).

Ações: notificar um tópico SNS (e-mail, Slack, PagerDuty), ajustar Auto Scaling, parar/reiniciar/recuperar instâncias EC2, criar itens no Systems Manager e invocar uma Lambda.

Metric math: alarmes sobre expressões, como taxa de erro = Errors / Invocations × 100, em vez de contagens absolutas.

Alarmes compostos combinam vários alarmes com AND, OR e NOT, reduzindo ruído: notificar só se "erros altos" E "latência alta".

## Monitoramento além das métricas básicas
• CloudWatch Synthetics: canaries são scripts (Node.js ou Python) que rodam em agenda e testam endpoints, APIs e fluxos de interface, medindo disponibilidade e latência mesmo sem tráfego real. Alertam antes dos clientes.
• CloudWatch RUM: coleta desempenho e erros do navegador de usuários reais.
• Lambda Insights e Container Insights: métricas detalhadas de funções (memória, CPU, cold starts) e de contêineres (ECS, EKS).
• Application Signals: painéis de saúde de serviços com metas (SLOs), a partir de traces e métricas.
• Dashboards: painéis com métricas e consultas de várias contas e Regiões.

## CloudTrail: quem fez o quê
O AWS CloudTrail registra as chamadas de API feitas na conta: quem chamou (identidade, role, sessão), qual ação, em qual recurso, quando, de qual IP e com que resultado (incluindo errorCode, como AccessDenied).

Tipos de eventos:
• management events: operações de controle (criar função, alterar policy, apagar bucket). Registrados por padrão;
• data events: operações em dados (s3:GetObject e PutObject, lambda:Invoke, operações em itens do DynamoDB). Desligados por padrão, com custo, por serem de alto volume;
• Insights events: detectam atividade incomum (pico de chamadas de uma API).

Event history: os últimos 90 dias de management events, de graça, no console. Para guardar mais tempo, consultar com SQL ou incluir data events, crie uma trail (para o S3 e, opcionalmente, para o CloudWatch Logs), de preferência multi-Região e para a organização, com validação de integridade dos arquivos. O CloudTrail Lake permite consultas SQL sobre os eventos.

Integração: regras do EventBridge podem reagir a chamadas de API registradas pelo CloudTrail (por exemplo, alertar quando alguém desativa o bloqueio de acesso público de um bucket).

CloudTrail não é tempo real para métricas de desempenho: os eventos chegam com alguns minutos de atraso.

## Qual ferramenta responde a qual pergunta
• "A função está lenta? Quantos erros por minuto? Quanta memória?" → CloudWatch (métricas, logs, alarmes).
• "Quem apagou o bucket ou mudou a security group, e quando?" → CloudTrail.
• "Em qual serviço da cadeia a requisição perdeu tempo?" → X-Ray ou OpenTelemetry (aula 32).
• "Como era a configuração deste recurso ontem e ele está em conformidade?" → AWS Config.

## Pegadinhas frequentes
• Memória e disco do EC2 exigem o CloudWatch agent.
• Cada combinação de dimensões é uma métrica separada.
• Média esconde caudas; use percentis para latência.
• EMF publica métricas a partir de logs, sem chamadas de API.
• Metric filter não é retroativo.
• Logs nunca expiram por padrão; configure retenção.
• Exportar para S3 é em lote; tempo real é subscription filter.
• Métrica publicada só em erro: dados ausentes = notBreaching.
• Data events do CloudTrail estão desligados por padrão; event history guarda 90 dias de management events.

## Resumo para revisão
• Métricas: namespace, nome, dimensões; estatísticas e percentis; 1 min padrão, 1 s alta resolução; retenção de 3 h a 455 dias conforme a resolução.
• Customizadas: PutMetricData ou EMF (logs JSON com _aws), Powertools Metrics.
• Logs: grupos e streams, retenção, KMS, metric filters, subscription filters (Lambda, Kinesis, Firehose, OpenSearch), exportação para S3, Live Tail.
• Logs Insights: fields, filter, stats ... by bin(), sort, limit, parse; linha REPORT da Lambda.
• Agent: memória, disco, logs de arquivos, StatsD/collectd.
• Alarmes: OK/ALARM/INSUFFICIENT_DATA; M de N; dados ausentes (missing, notBreaching, breaching, ignore); anomalias; metric math; compostos; ações SNS, Auto Scaling, EC2, Lambda.
• Synthetics, RUM, Lambda/Container Insights, Application Signals.
• CloudTrail: management (padrão), data (opcional), Insights; 90 dias de histórico; trails para S3/CloudWatch Logs; CloudTrail Lake.

## Questões

Q: Uma equipe quer monitorar o uso de memória de instâncias EC2 e receber um alarme acima de 85%. A métrica não aparece no CloudWatch. O que fazer?
- Criar um metric filter no log group do sistema.
- Ativar o monitoramento detalhado do EC2.
+ Instalar e configurar o CloudWatch agent nas instâncias, com permissão para publicar métricas.
- Usar o CloudTrail.
E: Memória é uma métrica do sistema operacional e só chega ao CloudWatch pelo agent. O monitoramento detalhado aumenta a frequência das métricas padrão, que não incluem memória; metric filter depende de logs com o valor; e o CloudTrail registra chamadas de API.

Q: Uma função Lambda precisa publicar métricas de negócio (pedidos criados, valor) a cada invocação, sem adicionar latência com chamadas de API. Qual abordagem usar?
+ Escrever logs no Embedded Metric Format (EMF), por exemplo com o Powertools Metrics.
- Chamar PutMetricData no fim de cada invocação.
- Gravar as métricas em uma tabela DynamoDB.
- Criar uma métrica no CloudTrail.
E: O EMF transforma logs estruturados em métricas de forma assíncrona, sem chamadas no caminho da requisição. PutMetricData adiciona latência e pode sofrer throttling, o CloudTrail não gera métricas de negócio e uma tabela não aparece como métrica no CloudWatch.

Q: Um desenvolvedor quer descobrir, nos logs JSON da última semana, quais códigos de erro mais aconteceram no serviço de pagamentos, agrupados por hora. Qual ferramenta usar?
+ CloudWatch Logs Insights com filter e stats count(*) by bin(1h), codigo_erro.
- AWS Config.
- Um metric filter criado agora, que reprocessa os logs da semana e gera a contagem por código de erro.
- CloudTrail event history, filtrando pelos códigos de erro registrados nas chamadas da última semana.
E: Logs Insights consulta os logs existentes e agrega por tempo e campo. Um metric filter só conta eventos novos, Config registra configurações e CloudTrail registra chamadas de API, não os logs da aplicação.

Q: A equipe criou um metric filter para contar erros, mas a métrica não mostra os erros de ontem. Por quê?
+ Metric filters só processam eventos gravados depois que o filtro foi criado.
- O log group precisa ter retenção de 1 dia para que o metric filter consiga processar os eventos antigos.
- A métrica só aparece depois de 24 horas.
- Metric filters só funcionam com logs criptografados por KMS, e o log group usa a criptografia padrão.
E: Metric filters não são retroativos. Para analisar o passado, use Logs Insights. Criptografia e retenção não têm relação, e a métrica aparece em minutos para eventos novos.

Q: Uma empresa precisa enviar todos os logs de várias funções Lambda para um cluster OpenSearch em tempo quase real. Qual recurso usar?
- Metric filters.
+ Subscription filters nos log groups, enviando ao OpenSearch (direto ou via Firehose).
- Exportação do log group para o S3 a cada hora, com uma Lambda que carrega os arquivos no OpenSearch.
- CloudTrail data events.
E: Subscription filters entregam os eventos de log continuamente para destinos como OpenSearch, Kinesis, Firehose e Lambda. Exportação para o S3 é em lote, metric filters geram métricas e data events do CloudTrail registram chamadas de API.

Q: Uma métrica customizada de "pagamentos com falha" só é publicada quando acontece uma falha. O alarme fica em INSUFFICIENT_DATA na maior parte do tempo e gera confusão. Como configurar o tratamento de dados ausentes?
+ notBreaching
- breaching
- ignore com 1 de 1 datapoint
- Remover o alarme.
E: Para uma métrica que só existe quando há problema, ausência de dados significa que está tudo bem; notBreaching trata a ausência como dentro do limite. breaching dispararia alarmes falsos, e ignore mantém o estado anterior sem resolver a confusão.

Q: A equipe quer um alarme sobre a taxa de erro de uma função (erros divididos por invocações), e não sobre o número absoluto de erros. O que usar?
- Um metric filter.
+ Um alarme com metric math, calculando Errors / Invocations × 100.
- Um alarme composto que combina o alarme de Errors com o alarme de Invocations.
- Um canary do Synthetics.
E: Metric math permite criar o alarme sobre uma expressão. Alarmes compostos combinam estados de alarmes, metric filters criam métricas a partir de logs e canaries testam endpoints.

Q: Uma API pública tem pouco tráfego de madrugada, e a equipe quer detectar quando ela fica fora do ar mesmo sem usuários, testando o login e a busca a cada 5 minutos. Qual recurso usar?
- CloudTrail Insights.
- Container Insights.
+ CloudWatch Synthetics canaries.
- CloudWatch RUM.
E: Canaries executam scripts em agenda contra endpoints e fluxos, detectando falhas sem tráfego real. RUM depende de usuários reais, CloudTrail Insights detecta padrões incomuns de chamadas de API e Container Insights mostra métricas de contêineres.

Q: Um bucket de produção foi apagado durante a noite. A equipe precisa saber qual identidade executou a ação e de qual IP. Onde procurar?
+ No CloudTrail, procurando o evento DeleteBucket.
- CloudWatch Logs Insights sobre os logs de acesso do API Gateway da aplicação.
- No AWS X-Ray.
- Nas métricas do S3 no CloudWatch.
E: O CloudTrail registra chamadas de API de gerenciamento, como DeleteBucket, com identidade, horário e IP. Métricas e traces não registram quem executou ações administrativas.

Q: A equipe de segurança precisa registrar cada leitura de objeto (GetObject) em um bucket com dados sensíveis. O event history do CloudTrail não mostra essas leituras. Por quê?
- O event history só mostra eventos da conta raiz; ações de roles e usuários IAM ficam em uma trail separada.
+ GetObject é um data event, desligado por padrão; é preciso uma trail com data events para o bucket.
- É preciso ativar o versionamento do bucket.
- O CloudTrail não registra operações do S3.
E: Operações em objetos do S3 são data events, que exigem configuração em uma trail (com custo). O CloudTrail registra o S3, versionamento não tem relação com auditoria e o histórico mostra eventos de todas as identidades.

## Flashcards

F: O que identifica uma métrica no CloudWatch?
V: Namespace, nome e dimensões. Cada combinação de dimensões é uma métrica separada.

F: Resolução e retenção de métricas do CloudWatch
V: Padrão 1 min; alta resolução 1 s. Retenção: 1 s por 3 h, 1 min por 15 dias, 5 min por 63 dias, 1 h por 455 dias.

F: O que é o Embedded Metric Format (EMF)?
V: Logs JSON com a seção _aws descrevendo métricas; o CloudWatch extrai as métricas de forma assíncrona, sem chamadas de API (ideal para Lambda).

F: Metric filter vs. subscription filter
V: Metric filter cria métricas a partir de padrões de log (não retroativo). Subscription filter envia eventos em tempo quase real para Lambda, Kinesis, Firehose ou OpenSearch.

F: Comandos do CloudWatch Logs Insights
V: fields, filter, stats (count, avg, pct, max... by bin(5m)), sort, limit e parse.

F: Quando usar o CloudWatch agent?
V: Para memória, disco, swap e processos do sistema operacional e para enviar arquivos de log de EC2 ou on-premises.

F: Tratamento de dados ausentes em alarmes
V: missing (padrão), notBreaching (ausência = bom), breaching (ausência = problema) e ignore (mantém o estado).

F: Alarme composto vs. metric math
V: Composto combina estados de alarmes com AND/OR/NOT. Metric math cria alarmes sobre expressões, como taxa de erro.

F: Management events vs. data events no CloudTrail
V: Management: operações de controle, registradas por padrão (90 dias no event history). Data: operações em dados (S3 objetos, Lambda Invoke, itens DynamoDB), opcionais e com custo.

F: CloudWatch vs. CloudTrail vs. X-Ray vs. Config
V: CloudWatch: métricas, logs e alarmes. CloudTrail: quem chamou qual API. X-Ray: caminho e tempo de cada requisição. Config: histórico e conformidade de configurações.
