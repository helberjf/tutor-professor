# 33. Diagnóstico e otimização: erros comuns, causa raiz e desempenho

## Mapa da aula
Esta aula junta as tarefas de análise de causa raiz e otimização (tarefas 4.1 e 4.3 da prova). Você vai aprender:

• um método para investigar incidentes sem mudar tudo ao mesmo tempo;
• o que significa cada código HTTP e cada exceção comum do SDK;
• mensagens típicas da Lambda e o que cada uma indica;
• diagnóstico de API Gateway, DynamoDB, filas e streams;
• onde olhar quando uma implantação falha;
• otimização: memória e CPU, concorrência, lotes, processamento assíncrono, filtros e cache;
• ferramentas de recomendação: Lambda Power Tuning, Compute Optimizer e CodeGuru Profiler.

## Um método de investigação
1. Delimite o problema: desde quando, quais rotas, quais clientes, que porcentagem das requisições. Um alarme ou um gráfico de métricas mostra o início.
2. Verifique mudanças recentes: implantações (CodeDeploy, CodePipeline), alterações de configuração e de permissões (CloudTrail).
3. Vá das métricas para os logs e dos logs para os traces: métricas dizem "quanto", logs dizem "o quê", traces dizem "onde".
4. Formule uma hipótese testável ("o timeout começou quando a função entrou na VPC") e confirme com dados.
5. Mude uma coisa por vez e verifique o efeito. Aumentar memória, timeout e concorrência ao mesmo tempo esconde a causa.
6. Depois de corrigir, crie um alarme ou teste que pegue o problema da próxima vez.

## Códigos HTTP
• 400 Bad Request: requisição malformada ou inválida (parâmetros, JSON, validação de model).
• 401 Unauthorized: credencial ou token ausente, inválido ou expirado.
• 403 Forbidden: autenticado, mas sem permissão (ou bloqueado por WAF, policy de recurso, API key não associada). No API Gateway, "Missing Authentication Token" costuma ser rota ou stage inexistente.
• 404 Not Found: recurso não existe.
• 409 Conflict: conflito de estado (por exemplo, recurso já existe ou está sendo modificado).
• 413 Payload Too Large: corpo acima do limite (6 MB na Lambda síncrona, 10 MB no API Gateway).
• 429 Too Many Requests: throttling ou quota.
• 500 Internal Server Error: erro não tratado no servidor.
• 502 Bad Gateway: o intermediário recebeu resposta inválida do backend (formato de Lambda proxy errado, função com erro).
• 503 Service Unavailable: backend sobrecarregado ou indisponível (no S3, SlowDown).
• 504 Gateway Timeout: o backend não respondeu dentro do tempo do intermediário (29 segundos no API Gateway por padrão).

Regra geral: 4xx é problema na requisição (corrigir), 5xx e 429 podem ser transitórios (repetir com backoff, investigar capacidade).

## Exceções comuns do SDK
• AccessDeniedException / AccessDenied: falta permissão (ou Deny explícito). Veja a identidade com sts get-caller-identity e a mensagem completa.
• UnrecognizedClientException, InvalidSignatureException, ExpiredTokenException: credenciais erradas, assinatura inválida (relógio errado, segredo errado) ou token temporário expirado.
• ValidationException: parâmetro inválido (nome reservado, tipo errado, chave incompleta).
• ResourceNotFoundException: nome, Região ou conta errados, ou recurso ainda não está ativo.
• ThrottlingException, TooManyRequestsException, ProvisionedThroughputExceededException, RequestLimitExceeded: limite de taxa ou capacidade; backoff e revisão de capacidade.
• ConditionalCheckFailedException: a condição de escrita do DynamoDB não foi satisfeita (comportamento esperado em escritas idempotentes ou optimistic locking).
• KMS AccessDeniedException ao ler um objeto do S3 ou um segredo: a permissão do serviço está certa, mas falta kms:Decrypt na chave.

## Mensagens da Lambda e o que indicam
• "Task timed out after X seconds": a execução passou do timeout. Causas: timeout baixo (padrão de 3 s), dependência lenta, função em VPC sem rota para a internet ou para o serviço (sem NAT ou endpoint), espera por uma conexão esgotada.
• "Runtime exited with error: signal: killed" ou erros de falta de memória: a função passou da memória configurada; veja Max Memory Used na linha REPORT.
• "Unable to import module": empacotamento errado (arquivo fora da raiz do ZIP, dependência faltando ou compilada para outra plataforma).
• Throttles na métrica e 429 para quem chama: falta concorrência (limite da conta ou concorrência reservada).
• Init Duration alto na linha REPORT: cold start caro (pacote grande, inicialização pesada).
• IteratorAge crescendo: a função está atrasada em um stream, muitas vezes travada em um registro com erro.
• Mensagens acumulando na DLQ: falhas repetidas no processamento.

```sql
filter @type = "REPORT"
| stats count(*) as invocacoes,
        count(@initDuration) as cold_starts,
        pct(@duration, 99) as p99_ms,
        max(@maxMemoryUsed / 1000 / 1000) as memoria_max_mb,
        max(@memorySize / 1000 / 1000) as memoria_config_mb
  by bin(1h)
```

## API Gateway, DynamoDB, filas e streams
API Gateway:
• 502 com Lambda proxy: veja o log de execução ("Malformed Lambda proxy response") e o retorno da função.
• 504: compare Latency e IntegrationLatency; se a integração consome os 29 segundos, o backend é lento.
• Erro de CORS só no navegador: headers Access-Control-Allow-* faltando, inclusive nas respostas de erro do gateway.

DynamoDB:
• Throttling com capacidade sobrando: partição quente; o CloudWatch Contributor Insights para DynamoDB mostra as chaves mais acessadas e mais limitadas.
• Escritas limitadas por causa de um GSI com pouca capacidade.
• Consultas caras: Scan e filtros onde deveria haver Query com chave ou índice.

Filas e streams:
• SQS com ApproximateAgeOfOldestMessage subindo: consumidores insuficientes ou lentos.
• Mensagens duplicadas: visibility timeout menor que o processamento.
• Kinesis com ProvisionedThroughputExceededException: shard quente ou poucos shards.

## Quando a implantação falha
• CloudFormation: os eventos da stack mostram o primeiro recurso que falhou e o motivo (permissão, nome duplicado, limite). Os erros seguintes costumam ser consequência.
• CodeBuild: logs da fase que falhou no CloudWatch Logs.
• CodeDeploy em EC2: logs do agente na instância (em /var/log/aws/codedeploy-agent/) e dos scripts de cada hook (scripts.log no diretório da implantação). Falha em todas as instâncias sem logs de script → agente parado ou sem acesso ao S3.
• CodeDeploy em Lambda/ECS: resultado dos hooks e alarmes que causaram rollback.
• ECS: o motivo da parada das tarefas (stopped reason), como CannotPullContainerError, falta de memória ou falha no health check.
• Elastic Beanstalk: eventos do ambiente e logs das instâncias (eb logs).

## Otimizar a computação
• Memória da Lambda: para código limitado por CPU, mais memória dá mais CPU e pode reduzir custo e tempo. Use o AWS Lambda Power Tuning para achar a configuração mínima que atende ao tempo desejado. Para código que só espera rede, mais memória não ajuda.
• Arquitetura arm64 (Graviton): melhor preço/desempenho quando as dependências suportam.
• Cold start: reduzir pacote e inicialização, SnapStart, concorrência provisionada nos horários críticos.
• Reutilizar clients e conexões fora do handler; RDS Proxy para bancos relacionais.
• Concorrência: limite com concorrência reservada ou MaximumConcurrency no event source mapping para proteger dependências.
• AWS Compute Optimizer: recomenda memória para Lambda e tamanhos para EC2, ECS e outros, com base no uso real.
• Amazon CodeGuru Profiler: mostra as linhas de código que mais consomem CPU e tempo em execução.

## Otimizar com mensageria, lotes e filtros
• Processamento assíncrono: tirar trabalho pesado do caminho da requisição com SQS, SNS, EventBridge ou Step Functions reduz a latência percebida e absorve picos.
• Lotes: BatchSize e janela no event source mapping, SendMessageBatch, BatchGetItem e PutRecords reduzem chamadas e custo.
• Filtros na origem: filter policies nas assinaturas do SNS e filtros de evento no event source mapping evitam invocar funções para mensagens que seriam descartadas. Isso economiza invocações e concorrência.
• Escolha de capacidade: DynamoDB sob demanda para carga imprevisível, provisionado com auto scaling para carga estável.
• Transferências no S3: multipart, leituras por intervalo de bytes e Transfer Acceleration para longa distância.

## Otimizar com cache
Cache no lugar certo, do mais perto do usuário para o mais perto do dado:
• CloudFront: conteúdo estático e respostas de API cacheáveis na borda. Inclua na chave de cache apenas os headers, cookies e query strings que mudam a resposta (por exemplo, Accept-Language); valores demais reduzem a taxa de acerto.
• Cache do stage do API Gateway (REST): respostas por parâmetro, com TTL e invalidação controlada.
• ElastiCache: resultados calculados, sessões e dados de várias fontes, com lazy loading, write-through e TTL.
• DAX: leituras repetidas do DynamoDB em microssegundos.
• Cache em memória da Lambda (variável global): dados de configuração e referências, com prazo de validade.

Antes de aumentar o TTL, confirme que a chave de cache identifica corretamente a resposta; senão, você só serve a resposta errada por mais tempo.

## Pegadinhas frequentes
• Mude uma coisa por vez e meça.
• 401 é credencial; 403 é permissão.
• 502 é resposta inválida; 504 é tempo esgotado.
• ExpiredTokenException: renove as credenciais temporárias.
• KMS AccessDenied ao ler S3 ou segredo: falta kms:Decrypt.
• Timeout em Lambda dentro da VPC ao chamar a internet: falta NAT ou endpoint.
• DynamoDB: Contributor Insights mostra chaves quentes.
• Filtros na origem economizam invocações; filtrar dentro do código não.

## Resumo para revisão
• Método: delimitar, ver mudanças recentes, métricas → logs → traces, hipótese, uma mudança por vez, prevenir.
• HTTP: 400, 401, 403, 404, 409, 413, 429, 500, 502, 503, 504.
• SDK: AccessDenied, credenciais inválidas/expiradas, ValidationException, ResourceNotFound, throttling, ConditionalCheckFailed, KMS AccessDenied.
• Lambda: timeout, falta de memória, import, throttles, Init Duration, IteratorAge, DLQ.
• Deploy: eventos do CloudFormation, logs do CodeBuild, logs do agente CodeDeploy, stopped reason do ECS, eventos do Beanstalk.
• Otimização: Power Tuning, arm64, SnapStart/provisionada, reutilizar conexões, RDS Proxy, Compute Optimizer, CodeGuru Profiler.
• Assíncrono, lotes e filtros na origem; cache em CloudFront, API Gateway, ElastiCache, DAX, memória.

## Questões

Q: Depois de mover uma função para uma VPC para acessar o RDS, as chamadas à API de um parceiro na internet passaram a falhar com "Task timed out". Qual é a causa mais provável?
- A role de execução não tem permissão de rede.
- A memória da função é baixa.
- O parceiro bloqueou a Região.
+ A função em VPC não tem rota para a internet; falta um NAT gateway para as subnets privadas.
E: Funções em VPC perdem a saída direta para a internet e precisam de NAT gateway. Memória não cria rota, a role não controla rotas e o problema começou exatamente com a mudança para a VPC.

Q: Uma função recebe AccessDeniedException ao ler um objeto do S3, embora a role tenha s3:GetObject no bucket. O objeto está criptografado com SSE-KMS usando uma customer managed key. O que falta?
- Usar SSE-S3 na leitura.
+ Permissão kms:Decrypt para a role na chave (key policy e policy IAM).
- s3:ListBucket.
- Ativar o versionamento do bucket.
E: Ler um objeto SSE-KMS exige descriptografar com a chave; sem kms:Decrypt, o acesso é negado. ListBucket é para listar, versionamento não interfere e o tipo de criptografia é definido na gravação.

Q: Uma aplicação começou a receber ExpiredTokenException horas depois de iniciar. Ela chama AssumeRole uma vez na inicialização e guarda as credenciais. Qual é a correção?
- Trocar para uma chave de acesso de usuário IAM.
- Aumentar a memória.
- Repetir a chamada com backoff indefinidamente, até o STS emitir automaticamente um token novo.
+ Renovar as credenciais antes de expirarem (por exemplo, com um perfil role_arn que o SDK renova).
E: Credenciais temporárias expiram; o código precisa assumir a role de novo ou deixar o SDK gerenciar a renovação. Chaves de longo prazo pioram a segurança, e repetir com o mesmo token expirado não resolve.

Q: Uma tabela DynamoDB sofre throttling em alguns horários, embora a capacidade total esteja longe do limite. A equipe quer descobrir quais chaves causam o problema. Qual ferramenta ajuda diretamente?
- AWS Config.
- AWS X-Ray.
+ CloudWatch Contributor Insights para DynamoDB.
- CloudTrail data events.
E: Contributor Insights mostra as chaves mais acessadas e mais limitadas, revelando partições quentes. X-Ray mostra latência por chamada, CloudTrail registra quem chamou e Config registra configurações.

Q: A métrica Errors de uma função está em zero, mas os clientes da API recebem 502. A integração é Lambda proxy. Onde está o problema mais provável?
- O throttling da conta.
- O CloudFront na frente da API, que transforma em 502 as respostas sem cabeçalho de cache vindas do API Gateway.
+ A resposta não segue o formato do proxy (por exemplo, body não string); veja os logs de execução.
- O timeout de 29 segundos da integração, que o API Gateway informa como 502 quando a função demora.
E: Uma resposta com formato inválido não conta como erro da função, mas o API Gateway responde 502 e registra "Malformed Lambda proxy response". Throttling geraria 429 e timeout geraria 504.

Q: Uma implantação do CloudFormation falhou e mostra dezenas de eventos de erro. Por onde começar?
+ Pelo primeiro recurso que falhou, cujo motivo costuma explicar os erros seguintes.
- Pelo último evento da lista.
- Apagando a stack e recriando do zero, para que os eventos novos mostrem só o erro que realmente importa.
- Pelo CloudTrail da conta inteira, filtrando todas as chamadas feitas durante a implantação.
E: Depois da primeira falha, o rollback gera vários eventos de cancelamento e exclusão; a causa está no primeiro erro. Apagar a stack perde a evidência, e o CloudTrail é útil depois, não como ponto de partida.

Q: Uma função que redimensiona imagens leva 6 segundos com 512 MB e usa 100% de CPU. A equipe quer o menor custo com tempo de até 2 segundos. Como decidir a memória?
+ Executar o AWS Lambda Power Tuning e escolher a menor memória que atinge os 2 segundos.
- Configurar sempre a memória máxima, já que mais memória é sempre mais barata em funções de CPU.
- Manter 512 MB e aumentar o timeout.
- Usar concorrência provisionada.
E: O Power Tuning compara custo e duração em várias configurações, mostrando a mínima que atende ao requisito. Timeout não acelera, a memória máxima pode custar mais do que o necessário e concorrência provisionada trata de cold start.

Q: Uma função assina um tópico SNS que recebe todos os eventos de pedidos, mas só processa pedidos internacionais, descartando 95% das mensagens no código. Como reduzir custo e invocações?
+ Adicionar uma filter policy na assinatura para entregar só os pedidos internacionais.
- Usar concorrência reservada equivalente a 5% do tráfego, para processar só os pedidos internacionais.
- Criar uma DLQ.
- Aumentar o BatchSize.
E: A filter policy faz o SNS não entregar as mensagens irrelevantes, evitando invocações. BatchSize não se aplica a SNS, concorrência reservada causaria throttling e DLQ guarda falhas.

Q: A linha REPORT de uma função mostra Max Memory Used igual à memória configurada, e algumas invocações terminam com "Runtime exited with error: signal: killed". O que fazer?
- Aumentar o timeout.
+ Aumentar a memória da função (e verificar se o código carrega dados demais em memória).
- Ativar o X-Ray.
- Diminuir a memória para reduzir custo, já que o encerramento indica excesso de memória configurada.
E: A função está atingindo o limite de memória e é encerrada; mais memória ou processamento em partes resolvem. Timeout não muda memória, reduzir memória piora e X-Ray não corrige o consumo.

Q: Uma API devolve conteúdo diferente conforme o idioma do navegador e foi colocada atrás do CloudFront para reduzir latência. A taxa de acerto do cache ficou muito baixa porque todos os headers foram incluídos na chave de cache. O que fazer?
+ Incluir na chave de cache apenas os valores que mudam a resposta, como Accept-Language.
- Desligar o cache.
- Aumentar o TTL para 1 ano.
- Invalidar o cache a cada minuto, para que cada idioma seja recarregado da origem com frequência.
E: Cada header incluído fragmenta o cache; a chave deve ter apenas o que diferencia as respostas. Desligar o cache perde o benefício, TTL longo não resolve a fragmentação e invalidações frequentes reduzem ainda mais o acerto.

## Flashcards

F: Método para investigar um incidente
V: Delimitar (quando, quanto, onde), verificar mudanças recentes, ir de métricas para logs e traces, testar uma hipótese e mudar uma coisa por vez.

F: 401 vs. 403
V: 401: credencial ou token ausente/inválido/expirado. 403: autenticado, mas sem permissão (ou bloqueado por WAF/policy).

F: 502 vs. 503 vs. 504
V: 502: resposta inválida do backend. 503: backend indisponível ou sobrecarregado. 504: backend não respondeu a tempo.

F: Erros de credenciais no SDK
V: UnrecognizedClientException, InvalidSignatureException (relógio ou segredo errado) e ExpiredTokenException (credenciais temporárias expiradas).

F: "Task timed out" em Lambda: causas comuns
V: Timeout baixo (padrão 3 s), dependência lenta, função em VPC sem NAT ou endpoint, conexões esgotadas.

F: Como descobrir chaves quentes no DynamoDB?
V: CloudWatch Contributor Insights para DynamoDB, que mostra as chaves mais acessadas e limitadas.

F: Onde investigar falha de CodeDeploy em EC2?
V: Logs do agente em /var/log/aws/codedeploy-agent/ e scripts.log da implantação; se não há logs, verificar se o agente roda e acessa o S3.

F: Ferramentas de recomendação de desempenho e custo
V: Lambda Power Tuning (memória da Lambda), Compute Optimizer (Lambda, EC2, ECS) e CodeGuru Profiler (linhas de código caras).

F: Como reduzir invocações desnecessárias de Lambda?
V: Filter policies no SNS, filtros de evento no event source mapping e lotes maiores.

F: Regra para a chave de cache
V: Inclua apenas headers, cookies e query strings que mudam a resposta; o resto reduz a taxa de acerto.
