# 34. Revisão final: números, palavras-chave e pegadinhas da DVA-C02

## Mapa da aula
Esta é a aula para a última semana antes da prova. Ela não traz conteúdo novo: reúne os números, as associações entre palavras-chave e serviços e os pares de conceitos que a prova costuma confundir.

Como usar:
• leia uma vez por dia na semana da prova;
• para cada item que você não lembrar, volte à aula indicada entre parênteses;
• faça os simulados completos (65 questões, 130 minutos) e revise todas as questões que errou e as que acertou com dúvida;
• na véspera, só esta aula e os flashcards. Durma bem.

## Números da Lambda (aulas 03 a 06)
• Memória: 128 MB a 10.240 MB; CPU proporcional (≈1 vCPU em 1.769 MB; até 6 vCPUs).
• Timeout: padrão 3 s; máximo 900 s (15 min).
• /tmp: 512 MB a 10.240 MB.
• Variáveis de ambiente: 4 KB no total.
• Pacote: 50 MB ZIP direto; 250 MB descompactado com layers; imagem de 10 GB; 5 layers.
• Payload: 6 MB síncrono; 1 MB assíncrono (antes 256 KB).
• Init: até 10 s.
• Assíncrono: 2 retries por padrão (0 a 2); idade do evento de 60 s a 6 h.
• Concorrência padrão: 1.000 por Região; cada função escala 1.000 ambientes a cada 10 s; reserva mínima de 100 sem reserva na conta.
• Event source mapping: SQS até 10.000 por lote (FIFO 10); janela até 300 s; visibility timeout da fila ≥ 6 × timeout; ParallelizationFactor até 10.

## Números de API Gateway, S3 e DynamoDB (aulas 07 a 11)
API Gateway:
• Timeout de integração: 29 s por padrão (aumentável em REST regional/privada); payload 10 MB.
• Throttling da conta: 10.000 rps com burst de 5.000 por Região.
• Cache: TTL padrão 300 s, máximo 3.600 s; 0,5 a 237 GB.
• Autorizador Lambda: cache padrão 300 s.

S3:
• Objeto até 5 TB; PUT único até 5 GB; multipart recomendado acima de 100 MB, obrigatório acima de 5 GB; partes de 5 MB, até 10.000.
• 3.500 escritas e 5.500 leituras por segundo por prefixo.
• URL pré-assinada até 7 dias (usuário IAM); limitada pela credencial temporária.

DynamoDB:
• Item até 400 KB.
• RCU: 1 leitura forte/s de 4 KB = 2 eventuais; transacional = 2 RCU. WCU: 1 escrita/s de 1 KB; transacional = 2 WCU.
• Query/Scan: 1 MB por página. BatchWriteItem: 25 itens; BatchGetItem: 100 itens; 16 MB. Transações: 100 ações.
• GSI: 20 por tabela, só leitura eventual. LSI: 5 por tabela, só na criação, 10 GB por partition key.
• Streams: 24 h. PITR: 35 dias. DAX: TTL padrão 5 min.

## Números de mensageria e orquestração (aulas 12 a 15)
SQS:
• Mensagem até 1 MiB (antes 256 KB); maiores via S3 (Extended Client, até 2 GB).
• Retenção: padrão 4 dias, de 1 min a 14 dias.
• Visibility timeout: padrão 30 s, de 0 s a 12 h.
• Long polling: até 20 s. Delay: até 15 min. Lotes de até 10 mensagens.
• FIFO: 300 msg/s (3.000 com lotes); deduplicação por 5 minutos.

Kinesis Data Streams:
• Por shard: escrita 1 MB/s ou 1.000 registros/s; leitura 2 MB/s (5 GetRecords/s).
• Retenção: 24 h por padrão, até 365 dias. PutRecords: 500 registros.
• Enhanced fan-out: 2 MB/s por consumidor por shard.

EventBridge: até 5 alvos por regra; retry até 24 h e 185 tentativas; PutEvents com 10 entradas.

Step Functions:
• Standard até 1 ano; Express até 5 min.
• Payload de 256 KB por estado.
• Retry padrão: IntervalSeconds 1, MaxAttempts 3, BackoffRate 2,0.
• Map inline até 40 em paralelo; distributed até 10.000.

## Números de segurança (aulas 18 a 22)
• STS AssumeRole: 15 min a 12 h (padrão 1 h); role chaining no máximo 1 h; GetSessionToken até 36 h.
• Cognito: ID e access tokens de 1 h por padrão; refresh token de 30 dias por padrão.
• KMS: Encrypt direto até 4 KB; rotação automática de 90 a 2.560 dias (padrão 365); AWS managed keys giram anualmente; exclusão com espera de 7 a 30 dias.
• Parameter Store: Standard até 4 KB e 10.000 parâmetros, gratuito; Advanced até 8 KB, com policies.
• IAM: até 2 chaves de acesso por usuário; Version "2012-10-17".
• RDS IAM auth: token de 15 min.
• Certificado ACM para CloudFront e API edge-optimized: us-east-1.

## Palavras-chave de desenvolvimento
• Desacoplar, absorver picos → SQS. Ordem e sem duplicatas → SQS FIFO (MessageGroupId).
• Um evento para vários consumidores → SNS + SQS (fan-out) ou EventBridge.
• Eventos de serviços AWS, SaaS, archive e replay → EventBridge.
• Agendamentos únicos em larga escala → EventBridge Scheduler.
• Streaming em tempo real, vários leitores, replay → Kinesis Data Streams. Entregar no S3/Redshift/OpenSearch sem código → Data Firehose.
• Orquestrar etapas com retries, espera humana e compensação → Step Functions (Standard). Alto volume e curto → Express.
• Esperar um sistema externo → .waitForTaskToken. Esperar um job → .sync.
• Muitas conexões da Lambda ao RDS → RDS Proxy.
• Arquivos compartilhados entre funções → EFS.
• Latência de microssegundos no DynamoDB sem mudar código → DAX. Cache genérico, sessões, ranking → ElastiCache (Redis/Valkey).
• Busca de texto → OpenSearch. SQL sobre arquivos no S3 → Athena.
• GraphQL, várias fontes, tempo real → AppSync. Front-end com CI/CD por branch → Amplify Hosting.
• Upload grande pelo navegador → URL pré-assinada do S3 (+ CORS no bucket).
• Item novo sem sobrescrever → ConditionExpression attribute_not_exists. Conflito de edição → optimistic locking (versão).

## Palavras-chave de segurança e implantação
Segurança:
• Credenciais temporárias, outra conta → AssumeRole (trust policy + sts:AssumeRole). Fornecedor com muitas contas → ExternalId.
• Usuários do app fazem login → Cognito user pool. App acessa S3/DynamoDB direto → identity pool.
• Pipeline externo sem chaves → OIDC + AssumeRoleWithWebIdentity.
• Rotação automática de senha → Secrets Manager. Configuração barata e hierárquica → Parameter Store.
• Feature flag com rollback por alarme → AppConfig.
• Arquivo grande criptografado com KMS → envelope encryption (GenerateDataKey).
• Throttling do KMS com SSE-KMS → S3 Bucket Keys; com muitos dados pequenos → cache de data keys.
• Criar recurso com uma role → iam:PassRole. Mensagem codificada → sts decode-authorization-message.

Implantação:
• Beanstalk: rápido com indisponibilidade → All at once; sem custo extra → Rolling; capacidade total barata → Rolling with additional batch; rollback mais seguro → Immutable; canary → Traffic splitting; ambiente novo → Swap URLs.
• Lambda gradual com rollback → CodeDeploy canary/linear + alarmes (SAM: AutoPublishAlias + DeploymentPreference).
• ECS blue/green com tráfego de teste → CodeDeploy com dois target groups.
• Permissão da aplicação no contêiner → task role. Puxar imagem e segredos → task execution role.
• Template com IAM nomeado → CAPABILITY_NAMED_IAM; SAM → CAPABILITY_AUTO_EXPAND. Proteger dados ao apagar a stack → DeletionPolicy Snapshot/Retain.

## Palavras-chave de diagnóstico
• Quem fez a chamada de API → CloudTrail. Onde a requisição gastou tempo → X-Ray/OpenTelemetry. Quanto, com que frequência → CloudWatch métricas. Configuração ao longo do tempo → Config.
• Memória do EC2 → CloudWatch agent.
• Métricas de Lambda sem latência → EMF.
• Consultar logs históricos → Logs Insights. Contar padrões daqui para frente → metric filter. Enviar logs em tempo real → subscription filter.
• Testar endpoint sem tráfego real → Synthetics canary.
• Buscar traces por cliente → annotation.
• Throttling em tabela com capacidade sobrando → partição quente (Contributor Insights).
• Memória ideal da Lambda → Power Tuning. Linhas de código caras em produção → CodeGuru Profiler.
• 502 no API Gateway com proxy → formato da resposta. 504 → timeout da integração. 429 → throttling.

## Pares que a prova confunde
• Concorrência reservada (garante e limita) × provisionada (ambientes prontos, custo).
• Destino on-failure (evento + erro, assíncrono) × DLQ da função (só o evento) × DLQ da fila SQS (para event source mapping).
• GSI (outra chave, qualquer momento, eventual) × LSI (mesma partition key, na criação, forte).
• FilterExpression (depois da leitura) × KeyConditionExpression (decide o que é lido).
• Visibility timeout (depois do recebimento) × delay (antes do primeiro recebimento).
• User pool (autenticação, JWT) × identity pool (credenciais AWS).
• Key policy × policy IAM no KMS (a key policy precisa habilitar a conta).
• Task role × task execution role.
• Annotation (indexada) × metadata (não indexada).
• Ref (nome/id) × GetAtt (atributos como Arn) no CloudFormation.
• Rolling with additional batch × Immutable no Beanstalk.
• Canary (uma fração e depois tudo) × linear (passos iguais).
• CloudFront Functions (leves, viewer) × Lambda@Edge (rede, eventos de origem).
• --page-size (chamadas menores) × --max-items (limita o total) na CLI.

## Estratégia no dia da prova
• Leia a última frase primeiro e marque o critério: menor esforço operacional, menor custo, sem mudar código, mais seguro.
• Elimine alternativas que violam uma restrição explícita ("sem gerenciar servidores", "credenciais temporárias", "em ordem").
• Desconfie de alternativas com código customizado quando existe recurso nativo, e de chaves de acesso fixas.
• Em múltipla resposta, marque exatamente a quantidade pedida.
• Não deixe nada em branco; marque para revisão e siga em frente. Com 130 minutos para 65 questões, você tem 2 minutos por questão.
• Na revisão final, só troque uma resposta se encontrar um motivo concreto no enunciado.

## Questões

Q: Uma função Lambda consome uma fila SQS Standard e grava em uma API externa que aguenta no máximo 50 chamadas simultâneas. Às vezes uma mensagem falha e o lote inteiro é reprocessado. Quais configurações resolvem os dois problemas?
+ MaximumConcurrency de 50 no event source mapping e ReportBatchItemFailures com batchItemFailures no retorno.
- Concorrência provisionada de 50 e um destino on-failure na função.
- Uma fila FIFO com um único MessageGroupId.
- BatchSize de 50 e visibility timeout de 1 segundo.
E: A concorrência máxima do ESM limita as chamadas simultâneas, e a resposta parcial reprocessa só as mensagens que falharam. A concorrência provisionada não impõe teto e destinos não se aplicam ao ESM de SQS; reduzir o visibility timeout causa duplicatas; e FIFO com um grupo serializa tudo.

Q: Um aplicativo móvel precisa que usuários façam login com Google e enviem fotos para o S3, cada um no seu prefixo, sem chaves de acesso no app. Qual combinação atende com menos esforço?
- API Gateway com API key por usuário e uma Lambda que grava no S3.
- Uma bucket policy pública com prefixo aleatório.
- Usuários IAM criados no primeiro login.
+ Cognito user pool com federação Google e identity pool com policy usando ${cognito-identity.amazonaws.com:sub}.
E: O user pool autentica com o Google e o identity pool entrega credenciais temporárias restritas ao prefixo do usuário. Usuários IAM não servem para usuários finais, API keys não autenticam e um bucket público é inseguro.

Q: Uma tabela DynamoDB recebe 40 leituras eventualmente consistentes por segundo de itens de 9 KB. Quantas RCUs são necessárias?
- 120
+ 60
- 40
- 90
E: 9 KB arredonda para 12 KB, ou 3 unidades por leitura forte; leituras eventuais custam metade: 40 × 3 ÷ 2 = 60 RCU. 120 seria leitura forte, e os demais valores não arredondam corretamente.

Q: Uma equipe quer implantar uma nova versão de uma função Lambda enviando 10% do tráfego por 10 minutos, com rollback automático se a taxa de erros subir, usando SAM. O que configurar?
- Concorrência reservada equivalente a 10% para a versão nova, com um alarme que remove a reserva em caso de erro.
+ AutoPublishAlias com DeploymentPreference do tipo Canary10Percent10Minutes e Alarms.
- Duas stacks iguais, uma por versão, e um registro ponderado do Route 53 enviando 10% para a nova.
- sam sync --watch em produção.
E: O SAM publica a versão, move o alias e delega ao CodeDeploy o canary com rollback por alarme. sam sync é para desenvolvimento, concorrência não divide tráfego e duas stacks com DNS ponderado não trocam versões de uma mesma função.

Q: Uma aplicação em ECS no Fargate recebe AccessDenied ao gravar no DynamoDB. A imagem é baixada normalmente e os logs aparecem. O que corrigir?
+ A task role da task definition, adicionando a permissão de escrita na tabela.
- A task execution role.
- A role da instância EC2 que hospeda a tarefa no Fargate, adicionando a permissão de escrita.
- O security group da tarefa, que precisa liberar a saída HTTPS para o endpoint regional do DynamoDB.
E: As chamadas do código usam a task role. A execution role (que funciona, já que imagem e logs estão ok) é do agente; no Fargate não há instâncias suas; e security group não gera AccessDenied do IAM.

Q: Um desenvolvedor precisa criptografar arquivos de 200 MB com uma chave do KMS antes de gravá-los no S3, sem enviar os arquivos ao KMS. Qual abordagem usar?
+ Envelope encryption: GenerateDataKey, criptografar localmente e guardar a data key criptografada com o arquivo.
- SSE-C com a chave do KMS.
- kms.encrypt em pedaços de 4 KB.
- Uma chave assimétrica do KMS com Encrypt, que aceita arquivos grandes por usar a chave pública fora do serviço.
E: A envelope encryption criptografa os dados localmente e usa o KMS só para proteger a data key. Chamar Encrypt em pedaços é caro e lento, SSE-C usa uma chave sua enviada ao S3 (não do KMS) e chaves assimétricas também têm limite pequeno no Encrypt.

Q: Uma aplicação no Elastic Beanstalk deve ser atualizada sem perder capacidade e com o menor custo adicional. Qual política escolher?
- Rolling.
- Immutable.
- All at once.
+ Rolling with additional batch.
E: O lote adicional mantém a capacidade total com custo extra pequeno e temporário. Immutable também mantém capacidade, mas duplica as instâncias; All at once causa indisponibilidade; e Rolling reduz a capacidade.

Q: Depois de uma implantação, a latência p99 de uma API subiu, mas a média continua igual. A equipe quer saber qual dependência causa a lentidão nas requisições mais lentas. Qual combinação usar?
- Metric filter criado agora sobre logs antigos.
- AWS Config e Trusted Advisor.
+ Percentis no CloudWatch para confirmar a cauda e traces do X-Ray filtrando por responsetime alto.
- Métrica de média de Duration por função e o CloudTrail, para ver qual função foi alterada na implantação.
E: Percentis mostram a cauda que a média esconde, e os traces mostram em qual chamada o tempo foi gasto nas requisições lentas. CloudTrail e Config não medem latência, e metric filters não são retroativos.

Q: Um template CloudFormation cria um bucket e uma função, e a função precisa receber o ARN do bucket em uma variável de ambiente. Qual expressão usar?
- !FindInMap [Bucket, Arn]
+ !GetAtt Bucket.Arn
- !ImportValue Bucket
- !Ref Bucket
E: Ref de um bucket devolve o nome; o ARN vem de GetAtt Bucket.Arn. ImportValue busca exports de outra stack e FindInMap consulta Mappings.

Q: Uma API no API Gateway retorna 504 para relatórios que levam 45 segundos para serem gerados. A equipe quer resolver sem depender de aumento de cota. Qual desenho usar?
+ Responder 202 com um id, gerar o relatório de forma assíncrona (SQS ou Step Functions) e oferecer consulta de status.
- Aumentar o timeout da Lambda para 15 minutos, o que também amplia o tempo de espera da integração do API Gateway.
- Ligar o cache do stage.
- Trocar para uma HTTP API.
E: O padrão assíncrono evita segurar a requisição além do limite da integração. O timeout da Lambda não muda o do API Gateway, o cache não ajuda na primeira geração e a HTTP API também tem limite de 30 segundos.

## Flashcards

F: Os 10 números de Lambda mais cobrados
V: Memória 128–10.240 MB; timeout 3 s padrão e 900 s máx.; /tmp até 10 GB; env vars 4 KB; ZIP 50 MB/250 MB; imagem 10 GB; 5 layers; payload 6 MB síncrono e 1 MB assíncrono; 1.000 de concorrência.

F: Números do SQS
V: Mensagem até 1 MiB; retenção 4 dias (1 min–14 dias); visibility 30 s (até 12 h); long polling até 20 s; delay até 15 min; lotes de 10; FIFO 300/s (3.000 com lotes), dedup 5 min.

F: Números do DynamoDB
V: Item 400 KB; RCU 4 KB (eventual = metade); WCU 1 KB; transação 2×; página 1 MB; BatchWrite 25; BatchGet 100; transação 100 ações; GSI 20; LSI 5 (10 GB por chave).

F: Números do API Gateway
V: Timeout de integração 29 s; payload 10 MB; throttling 10.000 rps + burst 5.000; cache TTL 300 s padrão, 3.600 s máx.

F: Números do Kinesis Data Streams
V: Shard: 1 MB/s ou 1.000 registros/s de escrita; 2 MB/s de leitura; retenção 24 h a 365 dias; PutRecords 500; enhanced fan-out 2 MB/s por consumidor.

F: Números de segurança
V: AssumeRole 15 min–12 h (padrão 1 h), chaining 1 h; KMS Encrypt 4 KB; rotação 90–2.560 dias; Cognito ID/access 1 h, refresh 30 dias; Parameter Store 4 KB/8 KB.

F: Políticas de implantação do Beanstalk em uma frase
V: All at once (rápido, indisponível), Rolling (sem custo, menos capacidade), Additional batch (capacidade total barata), Immutable (instâncias novas, rollback seguro), Traffic splitting (canary).

F: Qual serviço responde a qual pergunta de diagnóstico?
V: CloudWatch: quanto e com que frequência. CloudTrail: quem chamou qual API. X-Ray/OTel: onde a requisição gastou tempo. Config: como era a configuração.

F: Critérios de desempate nas questões
V: Menor esforço operacional → serviço mais gerenciado. Mais seguro → credenciais temporárias e menor privilégio. Menor custo → sob demanda/serverless conforme o padrão de uso. Sem mudar código → configuração nativa.

F: Estratégia de tempo na prova
V: 65 questões em 130 min: cerca de 2 min por questão. Marque as difíceis para revisão, nunca deixe em branco e só troque resposta com motivo concreto.
