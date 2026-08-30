"""Curated DVA-C02 exam-style question bank.

Pure data: no database and no AI. The questions follow the AWS Certified
Developer - Associate (DVA-C02) style — a short scenario, four complete
options, one correct answer, and an explanation that says why the right option
wins and why the tempting one loses.

The official exam also uses multiple-response items (pick 2 of 5). The stored
question model holds exactly four options and one correct answer, so this bank
is single-response only.

Domain weights on the real exam:
    Development with AWS Services      32%
    Security                           26%
    Deployment                         24%
    Troubleshooting and Optimization   18%
"""
from __future__ import annotations

from dataclasses import dataclass

DEVELOPMENT = "Development with AWS Services"
SECURITY = "Security"
DEPLOYMENT = "Deployment"
TROUBLESHOOTING = "Troubleshooting and Optimization"

DOMAIN_WEIGHTS = {
    DEVELOPMENT: 0.32,
    SECURITY: 0.26,
    DEPLOYMENT: 0.24,
    TROUBLESHOOTING: 0.18,
}


@dataclass(frozen=True)
class Question:
    domain: str
    question: str
    options: tuple[str, str, str, str]
    correct: int
    explanation: str

    @property
    def correct_option(self) -> str:
        return self.options[self.correct]


@dataclass(frozen=True)
class Exam:
    title: str
    objective: str
    questions: tuple[Question, ...]


def q(
    domain: str,
    question: str,
    options: tuple[str, str, str, str],
    correct: int,
    explanation: str,
) -> Question:
    return Question(
        domain=domain,
        question=question,
        options=options,
        correct=correct,
        explanation=explanation,
    )


EXAM_1 = Exam(
    title="DVA-C02 - Simulado 1",
    objective="Simulado no estilo da prova, cobrindo os quatro dominios no peso oficial.",
    questions=(
        # ── Development with AWS Services ─────────────────────────────────────
        q(
            DEVELOPMENT,
            "Uma funcao Lambda e invocada de forma assincrona por um evento do S3. Quando o processamento falha depois de todas as tentativas, a equipe precisa guardar o evento original para reprocessar depois. Qual e a forma recomendada?",
            (
                "Configurar um destino on-failure do Lambda apontando para uma fila SQS",
                "Aumentar o timeout da funcao para que ela nao falhe",
                "Habilitar versionamento no bucket S3 de origem",
                "Trocar a invocacao para sincrona e tratar o erro no cliente",
            ),
            0,
            "Lambda destinations com on-failure entregam o evento e o contexto do erro para SQS, SNS, EventBridge ou outra Lambda, o que permite reprocessar. Aumentar timeout so ajuda se a causa for tempo; versionamento no S3 guarda objetos, nao eventos falhados.",
        ),
        q(
            DEVELOPMENT,
            "Uma tabela DynamoDB usa userId como chave de particao e orderDate como chave de ordenacao. O time precisa consultar pedidos por status, sem varrer a tabela inteira. Qual solucao atende com o menor custo de leitura?",
            (
                "Executar Scan com FilterExpression sobre status",
                "Criar um Global Secondary Index com status como chave de particao",
                "Criar um Local Secondary Index com status como chave de particao",
                "Adicionar status a chave de ordenacao existente",
            ),
            1,
            "Um GSI permite uma nova chave de particao e responde a consulta com Query. Scan com filtro le a tabela toda e so descarta depois, pagando por tudo. Um LSI compartilha obrigatoriamente a chave de particao da tabela, entao nao serve para particionar por status.",
        ),
        q(
            DEVELOPMENT,
            "Uma funcao Lambda em Java atende uma API com trafego previsivel em horario comercial. Os usuarios reclamam de lentidao nas primeiras chamadas de cada manha. O que resolve o problema diretamente?",
            (
                "Aumentar o timeout da funcao",
                "Migrar a funcao para uma imagem de container",
                "Configurar provisioned concurrency para o alias usado pela API",
                "Reduzir a memoria alocada para a funcao iniciar mais rapido",
            ),
            2,
            "A lentidao inicial e cold start, e provisioned concurrency mantem ambientes de execucao inicializados e prontos. Timeout nao afeta inicializacao; reduzir memoria diminui tambem a CPU proporcional e tende a piorar.",
        ),
        q(
            DEVELOPMENT,
            "Um item do DynamoDB so deve ser gravado se ainda nao existir um item com a mesma chave, sem risco de sobrescrever em concorrencia. Qual abordagem garante isso em uma unica chamada?",
            (
                "Fazer GetItem e, se retornar vazio, chamar PutItem",
                "Chamar PutItem com ConditionExpression attribute_not_exists na chave de particao",
                "Chamar UpdateItem com ReturnValues ALL_OLD",
                "Habilitar leituras fortemente consistentes na tabela",
            ),
            1,
            "A escrita condicional e avaliada atomicamente pelo servico: se a condicao falhar, a gravacao e rejeitada com ConditionalCheckFailedException. Ler e depois gravar abre uma janela de corrida entre as duas chamadas.",
        ),
        q(
            DEVELOPMENT,
            "Um aplicativo web precisa permitir que o navegador do usuario envie um arquivo direto para o S3, sem que o backend receba o arquivo e sem expor credenciais. Qual e a solucao adequada?",
            (
                "Gerar uma presigned URL no backend e devolver ao navegador",
                "Embutir chaves de acesso IAM no JavaScript da pagina",
                "Tornar o bucket publico para escrita",
                "Enviar o arquivo por API Gateway com integracao proxy para o S3 e limite de 10 MB",
            ),
            0,
            "A presigned URL carrega uma autorizacao temporaria e limitada aquela operacao e objeto. Chaves no front-end vazam; bucket publico para escrita e falha grave de seguranca; passar pelo API Gateway reintroduz o backend no caminho e esbarra no limite de payload.",
        ),
        q(
            DEVELOPMENT,
            "Um sistema de pagamentos exige que as mensagens de um mesmo cliente sejam processadas na ordem em que foram enviadas, e que uma mensagem duplicada enviada duas vezes em cinco minutos seja processada uma unica vez. Qual configuracao atende?",
            (
                "Fila SQS Standard com visibility timeout alto",
                "Fila SQS FIFO usando MessageGroupId por cliente e deduplicacao habilitada",
                "Topico SNS Standard com assinatura por cliente",
                "Fila SQS Standard com long polling",
            ),
            1,
            "Filas FIFO garantem ordem dentro de um MessageGroupId e deduplicacao em uma janela de cinco minutos. Filas Standard entregam pelo menos uma vez e sem garantia de ordem, entao nao atendem nenhum dos dois requisitos.",
        ),
        q(
            DEVELOPMENT,
            "Um fluxo de negocio tem varias etapas, com espera por aprovacao humana, tentativas em caso de falha e caminhos diferentes conforme o resultado de cada etapa. Qual servico expressa esse fluxo com menos codigo de controle?",
            (
                "AWS Step Functions com uma state machine",
                "Amazon SQS com uma fila por etapa",
                "Amazon SNS com fanout para cada etapa",
                "Amazon EventBridge Scheduler",
            ),
            0,
            "Step Functions modela estados, escolhas, retries e esperas de forma declarativa, incluindo o padrao de callback para aprovacao humana. Filas e topicos transportam mensagens, mas a orquestracao e as tentativas ficariam por conta do codigo.",
        ),
        # ── Security ──────────────────────────────────────────────────────────
        q(
            SECURITY,
            "Uma funcao Lambda precisa ler objetos de um bucket S3 especifico. Qual e a forma correta de conceder esse acesso?",
            (
                "Guardar as chaves de acesso de um usuario IAM em variaveis de ambiente da funcao",
                "Conceder a permissao s3:GetObject naquele bucket a role de execucao da funcao",
                "Tornar o bucket publico apenas para leitura",
                "Guardar as chaves de acesso no Secrets Manager e ler no inicio da funcao",
            ),
            1,
            "A role de execucao entrega credenciais temporarias e rotacionadas automaticamente, sem segredo algum no codigo. Guardar chaves de longa duracao, mesmo no Secrets Manager, e desnecessario quando existe role, e mantem uma credencial permanente que pode vazar.",
        ),
        q(
            SECURITY,
            "Um aplicativo movel precisa autenticar usuarios com email e senha e, depois, permitir que eles enviem arquivos direto para o S3 com credenciais AWS temporarias. Qual combinacao do Amazon Cognito atende?",
            (
                "User pool para autenticar e identity pool para obter credenciais AWS",
                "Identity pool para autenticar e user pool para obter credenciais AWS",
                "Apenas um user pool, que ja emite credenciais AWS",
                "Apenas um identity pool, que ja armazena usuarios e senhas",
            ),
            0,
            "O user pool e o diretorio de usuarios e cuida do login, devolvendo tokens. O identity pool troca esses tokens por credenciais AWS temporarias via STS. Sao papeis distintos e complementares.",
        ),
        q(
            SECURITY,
            "Uma politica de compliance exige que nenhum objeto seja lido do bucket por conexao nao criptografada. Como impor isso no proprio bucket?",
            (
                "Habilitar SSE-S3 no bucket",
                "Adicionar uma bucket policy que nega acoes quando aws:SecureTransport for false",
                "Habilitar o versionamento do bucket",
                "Habilitar Block Public Access no bucket",
            ),
            1,
            "A condicao aws:SecureTransport avalia se a requisicao chegou por HTTPS, e um Deny explicito bloqueia o resto. SSE-S3 cuida de criptografia em repouso, nao em transito; Block Public Access e versionamento tratam de outros riscos.",
        ),
        q(
            SECURITY,
            "Uma aplicacao precisa criptografar arquivos grandes no cliente usando o AWS KMS, sem enviar o conteudo para o servico do KMS. Qual operacao suporta esse padrao?",
            (
                "Encrypt, enviando o arquivo inteiro para o KMS",
                "GenerateDataKey, que devolve a chave em texto claro e cifrada",
                "Sign, para assinar o arquivo antes do envio",
                "ReEncrypt, para trocar a chave do arquivo",
            ),
            1,
            "Esse e o envelope encryption: o GenerateDataKey devolve a data key em claro para cifrar localmente e a versao cifrada para guardar junto do arquivo. A operacao Encrypt do KMS tem limite de poucos KB e nao serve para arquivos grandes.",
        ),
        q(
            SECURITY,
            "Uma aplicacao precisa de uma senha de banco de dados que seja trocada automaticamente a cada 30 dias, sem alteracao de codigo. Qual servico atende diretamente?",
            (
                "AWS Secrets Manager com rotacao automatica habilitada",
                "SSM Parameter Store com parametro do tipo String",
                "Variavel de ambiente criptografada da funcao Lambda",
                "AWS KMS com rotacao anual de chave habilitada",
            ),
            0,
            "O Secrets Manager tem rotacao gerenciada nativa, inclusive integrada a bancos suportados. O Parameter Store guarda segredos com SecureString, mas nao rotaciona sozinho; a rotacao do KMS troca material de chave, nao a senha.",
        ),
        # ── Deployment ────────────────────────────────────────────────────────
        q(
            DEPLOYMENT,
            "Uma equipe quer publicar uma nova versao de uma funcao Lambda enviando primeiro 10% do trafego para ela e o resto para a versao anterior, com rollback rapido. Como fazer?",
            (
                "Publicar sobre o $LATEST e monitorar os logs",
                "Criar duas funcoes e alternar o endpoint no API Gateway manualmente",
                "Usar um alias com weighted routing entre as duas versoes publicadas",
                "Usar uma layer para trocar o codigo da versao antiga",
            ),
            2,
            "Aliases suportam roteamento ponderado entre duas versoes publicadas, e o rollback e apenas mudar o peso de volta. Versoes publicadas sao imutaveis, enquanto o $LATEST muda a cada deploy e nao permite dividir trafego.",
        ),
        q(
            DEPLOYMENT,
            "No CodeDeploy, qual configuracao de implantacao envia todo o trafego para a nova versao de uma vez, apos o teste de saude inicial?",
            (
                "CodeDeployDefault.AllAtOnce",
                "CodeDeployDefault.Canary10Percent5Minutes",
                "CodeDeployDefault.LinearEvery10PercentEvery1Minute",
                "CodeDeployDefault.HalfAtATime",
            ),
            0,
            "AllAtOnce faz a virada completa de uma so vez, o que e mais rapido e mais arriscado. Canary envia uma fatia e espera; Linear vai somando fatias em intervalos; HalfAtATime aplica a metade das instancias por vez.",
        ),
        q(
            DEPLOYMENT,
            "Qual arquivo define os comandos executados em cada fase de uma build do AWS CodeBuild?",
            (
                "appspec.yml",
                "buildspec.yml",
                "template.yaml",
                "Dockerrun.aws.json",
            ),
            1,
            "O buildspec.yml descreve as fases install, pre_build, build e post_build, alem dos artifacts. O appspec.yml e do CodeDeploy, template.yaml e do SAM/CloudFormation e Dockerrun.aws.json e do Elastic Beanstalk.",
        ),
        q(
            DEPLOYMENT,
            "Um time quer ver exatamente quais recursos serao criados, alterados ou removidos antes de aplicar uma atualizacao de stack do CloudFormation. Qual recurso oferece isso?",
            (
                "Drift detection",
                "Change set",
                "Stack policy",
                "Nested stack",
            ),
            1,
            "O change set mostra o diff proposto e so executa quando aprovado. Drift detection compara o estado real com o template ja aplicado; stack policy protege recursos contra atualizacao; nested stacks organizam templates.",
        ),
        q(
            DEPLOYMENT,
            "Em um template do AWS SAM, qual linha identifica o arquivo como um template SAM e habilita os tipos simplificados como AWS::Serverless::Function?",
            (
                "Type: AWS::Serverless::Application",
                "Transform: AWS::Serverless-2016-10-31",
                "Format: SAM",
                "Runtime: sam",
            ),
            1,
            "A declaracao Transform aponta a macro que o CloudFormation usa para expandir os tipos AWS::Serverless::* em recursos nativos. Sem ela o template nao e reconhecido como SAM.",
        ),
        # ── Troubleshooting and Optimization ──────────────────────────────────
        q(
            TROUBLESHOOTING,
            "Uma requisicao passa por API Gateway, Lambda e DynamoDB e esta lenta, mas nao esta claro qual etapa consome o tempo. Qual servico mostra a latencia por segmento da chamada?",
            (
                "AWS X-Ray com tracing ativo habilitado",
                "AWS CloudTrail",
                "Amazon Inspector",
                "AWS Config",
            ),
            0,
            "O X-Ray produz o service map e traces com subsegmentos por chamada, que e exatamente onde o gargalo aparece. CloudTrail registra quem chamou qual API, sem medir latencia interna; Inspector e Config tratam de vulnerabilidade e conformidade.",
        ),
        q(
            TROUBLESHOOTING,
            "Uma aplicacao comeca a receber ProvisionedThroughputExceededException do DynamoDB, mesmo com o consumo medio da tabela bem abaixo da capacidade provisionada. Qual e a causa mais provavel?",
            (
                "A tabela esta sem indices secundarios",
                "As leituras estao usando consistencia eventual",
                "Uma particao concentra as requisicoes por causa de uma chave de particao pouco distribuida",
                "O tamanho dos itens ultrapassa 400 KB",
            ),
            2,
            "Quando a chave de particao concentra o trafego, uma particao satura enquanto a media da tabela parece folgada: e o hot partition. Consistencia eventual consome menos capacidade, e itens acima de 400 KB dariam erro de validacao, nao de throughput.",
        ),
        q(
            TROUBLESHOOTING,
            "Uma funcao Lambda passou a retornar erro 429 com TooManyRequestsException em picos de trafego, enquanto outras funcoes da conta seguem normais. O que explica e resolve o caso?",
            (
                "A funcao atingiu sua reserved concurrency; aumentar ou remover o limite reservado",
                "A funcao excedeu o timeout; aumentar o timeout",
                "A funcao ficou sem memoria; aumentar a memoria",
                "O pacote de deploy passou do limite; reduzir o tamanho do pacote",
            ),
            0,
            "O 429 com TooManyRequestsException indica limite de concorrencia atingido, e quando so uma funcao e afetada o teto costuma ser a reserved concurrency dela. Timeout produz erro de tempo, falta de memoria encerra a execucao e tamanho de pacote falha no deploy, nao em pico.",
        ),
        q(
            SECURITY,
            "Um desenvolvedor precisa conceder a uma aplicacao acesso de leitura a um unico segredo do Secrets Manager, e a nada mais. Qual elemento da politica IAM expressa essa restricao?",
            (
                "A acao secretsmanager:GetSecretValue com Resource igual ao ARN daquele segredo",
                "A acao secretsmanager:* com Resource igual a *",
                "Uma condicao de origem por endereco IP",
                "O uso de uma role em vez de um usuario",
            ),
            0,
            "O menor privilegio nasce do par acao mais recurso: uma unica acao de leitura restrita ao ARN do segredo. Usar role em vez de usuario e boa pratica de credencial, mas nao limita o que a politica permite.",
        ),
    ),
)

EXAM_2 = Exam(
    title="DVA-C02 - Simulado 2",
    objective="Segundo simulado no estilo da prova, sem repetir enunciados do primeiro.",
    questions=(
        # ── Development with AWS Services ─────────────────────────────────────
        q(
            DEVELOPMENT,
            "Varias funcoes Lambda compartilham a mesma biblioteca interna de 8 MB. A equipe quer parar de duplicar essa biblioteca em cada pacote de deploy. Qual recurso resolve?",
            (
                "Uma Lambda layer referenciada pelas funcoes",
                "Uma variavel de ambiente com o caminho da biblioteca",
                "Um bucket S3 lido no handler a cada invocacao",
                "Um alias compartilhado entre as funcoes",
            ),
            0,
            "Layers empacotam dependencias uma vez e sao montadas em /opt nas funcoes que as referenciam. Baixar do S3 a cada invocacao adiciona latencia e custo, e alias apenas aponta para versoes.",
        ),
        q(
            DEVELOPMENT,
            "Uma tabela DynamoDB guarda sessoes que devem sumir automaticamente 24 horas apos a criacao, sem job de limpeza. O que usar?",
            (
                "Habilitar TTL em um atributo com o timestamp de expiracao em epoch seconds",
                "Criar um GSI ordenado por data de criacao e apagar em lote",
                "Habilitar DynamoDB Streams e apagar pelo consumidor",
                "Configurar uma lifecycle policy na tabela",
            ),
            0,
            "O TTL do DynamoDB remove itens expirados automaticamente e sem consumir capacidade de escrita, lendo um atributo em epoch seconds. Lifecycle policy existe no S3, nao no DynamoDB.",
        ),
        q(
            DEVELOPMENT,
            "Um consumidor le de uma fila SQS Standard. Como a fila entrega pelo menos uma vez, a mesma mensagem pode chegar duas vezes. Qual estrategia evita efeito duplicado no banco?",
            (
                "Aumentar o visibility timeout para o dobro do tempo de processamento",
                "Tornar a operacao idempotente, usando um identificador unico da mensagem como chave",
                "Habilitar long polling na fila",
                "Reduzir o batch size para uma mensagem por vez",
            ),
            1,
            "Idempotencia e a unica garantia real com entrega pelo menos uma vez: gravar com a mesma chave duas vezes produz o mesmo resultado. Visibility timeout, long polling e batch size reduzem a chance, mas nao eliminam a duplicata.",
        ),
        q(
            DEVELOPMENT,
            "Uma API precisa notificar quatro sistemas diferentes sempre que um pedido e criado, e cada sistema processa no seu ritmo, sem perder mensagens se estiver fora do ar. Qual arquitetura atende?",
            (
                "Um topico SNS com quatro filas SQS assinantes, uma por sistema",
                "Uma fila SQS lida pelos quatro sistemas",
                "Quatro chamadas HTTP sincronas a partir da API",
                "Um stream do Kinesis com quatro shards",
            ),
            0,
            "O padrao fanout do SNS com filas SQS entrega uma copia para cada assinante e a fila retem a mensagem enquanto o consumidor esta indisponivel. Uma fila unica faria os quatro competirem pela mesma mensagem, e chamadas sincronas acoplam a API a disponibilidade dos quatro.",
        ),
        q(
            DEVELOPMENT,
            "Uma funcao Lambda com 128 MB de memoria demora demais em uma tarefa que usa muita CPU. Aumentar a memoria para 1024 MB reduziu o tempo em quatro vezes. Por que?",
            (
                "Porque a memoria extra permite carregar o pacote de deploy mais rapido",
                "Porque a CPU alocada ao ambiente cresce proporcionalmente a memoria configurada",
                "Porque acima de 512 MB o Lambda passa a usar provisioned concurrency",
                "Porque o limite de /tmp aumenta junto com a memoria",
            ),
            1,
            "No Lambda, memoria e a unica alavanca de recursos: CPU e banda de rede escalam junto com ela. Por isso funcoes CPU-bound costumam ficar mais baratas com mais memoria, ja que o tempo cai mais do que o preco por ms sobe.",
        ),
        q(
            DEVELOPMENT,
            "Uma API REST no API Gateway retorna dados de catalogo que mudam uma vez por dia, mas recebe milhares de requisicoes iguais por minuto. Qual ajuste reduz a carga no backend com menos alteracao de codigo?",
            (
                "Habilitar cache no stage do API Gateway com TTL adequado",
                "Aumentar a memoria da funcao Lambda de backend",
                "Habilitar throttling por chave de API",
                "Trocar a integracao para HTTP_PROXY",
            ),
            0,
            "O cache do stage responde direto no API Gateway sem acionar a integracao, o que corta a carga do backend sem tocar no codigo. Throttling limita requisicoes, mas rejeitando trafego legitimo em vez de servi-lo.",
        ),
        q(
            DEVELOPMENT,
            "Uma aplicacao precisa reagir a alteracoes de itens de uma tabela DynamoDB, na ordem em que ocorreram por chave de particao. Qual integracao atende?",
            (
                "DynamoDB Streams como fonte de evento para uma funcao Lambda",
                "Um agendamento do EventBridge que consulta a tabela a cada minuto",
                "Um trigger SQL na tabela",
                "Um topico SNS publicado pela aplicacao apos cada escrita",
            ),
            0,
            "DynamoDB Streams registra as alteracoes em ordem por chave de particao e integra nativamente com Lambda. Polling agendado perde alteracoes intermediarias, e publicar no SNS pela aplicacao falha quando a escrita vem de outro caminho.",
        ),
        # ── Security ──────────────────────────────────────────────────────────
        q(
            SECURITY,
            "Uma API REST no API Gateway precisa validar tokens JWT emitidos por um user pool do Cognito, sem codigo proprio de validacao. Qual configuracao usar?",
            (
                "Um authorizer do tipo Cognito user pool no metodo",
                "Um Lambda authorizer que decodifica o token manualmente",
                "Autorizacao IAM com Signature Version 4",
                "Uma chave de API exigida no header x-api-key",
            ),
            0,
            "O authorizer de user pool valida assinatura, expiracao e claims do token nativamente. Um Lambda authorizer resolveria, mas com codigo a manter; chave de API identifica o chamador para plano de uso e nao autentica usuario.",
        ),
        q(
            SECURITY,
            "Uma aplicacao na conta A precisa ler um bucket S3 da conta B. Qual e a abordagem recomendada?",
            (
                "Criar um usuario IAM na conta B e compartilhar as chaves com a conta A",
                "Assumir, via STS, uma role da conta B que confia na conta A",
                "Tornar o bucket publico e filtrar por IP",
                "Copiar o bucket para a conta A periodicamente",
            ),
            1,
            "O acesso entre contas se faz com AssumeRole: a role na conta B declara a conta A como principal confiavel e o STS emite credenciais temporarias. Compartilhar chaves de longa duracao entre contas e o oposto do menor privilegio.",
        ),
        q(
            SECURITY,
            "Um objeto no S3 deve ser criptografado em repouso com uma chave gerenciada pelo cliente, com registro de cada uso da chave no CloudTrail. Qual opcao atende?",
            (
                "SSE-S3 com chaves gerenciadas pelo S3",
                "SSE-KMS com uma customer managed key",
                "Criptografia do lado do cliente com uma chave em arquivo local",
                "Habilitar apenas HTTPS no acesso ao bucket",
            ),
            1,
            "SSE-KMS com customer managed key da controle de politica sobre a chave e registra cada chamada de Decrypt e GenerateDataKey no CloudTrail. SSE-S3 nao expoe a chave nem gera esse rastro por uso.",
        ),
        q(
            SECURITY,
            "Uma politica IAM concede s3:GetObject em todos os recursos, e uma bucket policy nega explicitamente a leitura para o mesmo principal em um bucket. Qual e o resultado do acesso a esse bucket?",
            (
                "O acesso e permitido, porque a politica de identidade tem precedencia",
                "O acesso e negado, porque um Deny explicito prevalece sobre qualquer Allow",
                "O acesso e permitido apenas para leituras consistentes",
                "O comportamento depende da ordem em que as politicas foram criadas",
            ),
            1,
            "Na avaliacao de politicas da AWS, um Deny explicito sempre vence, venha ele da politica de identidade ou da politica de recurso. A ordem de criacao nao influencia a decisao.",
        ),
        q(
            SECURITY,
            "Uma distribuicao do CloudFront serve videos que so podem ser acessados por assinantes autenticados, por um periodo limitado. Qual mecanismo entrega esse controle?",
            (
                "Signed URLs ou signed cookies do CloudFront",
                "Bucket policy do S3 restrita por IP",
                "AWS WAF com regra de rate limit",
                "Um authorizer do API Gateway na frente do CloudFront",
            ),
            0,
            "Signed URLs e signed cookies do CloudFront carregam uma politica com validade e condicoes, e um Origin Access Control impede o acesso direto ao bucket. Regras de WAF e restricao por IP nao expressam quem assinou nem por quanto tempo.",
        ),
        # ── Deployment ────────────────────────────────────────────────────────
        q(
            DEPLOYMENT,
            "Um ambiente do Elastic Beanstalk precisa ser atualizado sem reduzir a capacidade disponivel e sem misturar versoes nas mesmas instancias. Qual politica de implantacao atende?",
            (
                "All at once",
                "Rolling",
                "Immutable",
                "Rolling with additional batch limitado a uma instancia",
            ),
            2,
            "A politica immutable cria um novo conjunto de instancias com a nova versao em um novo Auto Scaling group e so entao troca, mantendo a capacidade e isolando as versoes. Rolling atualiza instancias existentes em lotes, reduzindo capacidade temporariamente.",
        ),
        q(
            DEPLOYMENT,
            "Qual arquivo o CodeDeploy usa para saber quais arquivos copiar e quais hooks de ciclo de vida executar em uma implantacao?",
            (
                "buildspec.yml",
                "appspec.yml",
                "samconfig.toml",
                "pipeline.json",
            ),
            1,
            "O appspec.yml define a secao files e os hooks como BeforeInstall e AfterAllowTraffic. O buildspec.yml pertence ao CodeBuild e descreve a build, nao a implantacao.",
        ),
        q(
            DEPLOYMENT,
            "Um pipeline do CodePipeline tem os estagios Source, Build e Deploy. Como os arquivos gerados no Build chegam ao estagio Deploy?",
            (
                "Pelo artifact store do pipeline, um bucket S3, via output e input artifacts",
                "Por uma copia direta entre as instancias de build e deploy",
                "Por uma fila SQS criada automaticamente pelo pipeline",
                "Por um volume EFS compartilhado entre os estagios",
            ),
            0,
            "O CodePipeline grava os output artifacts de um estagio no bucket de artefatos e os entrega como input artifacts do proximo. Nao ha comunicacao direta entre os ambientes de execucao dos estagios.",
        ),
        q(
            DEPLOYMENT,
            "Uma equipe precisa reutilizar o mesmo trecho de infraestrutura em varios templates do CloudFormation e referenciar valores publicados por outra stack. Quais recursos usar?",
            (
                "Nested stacks para reutilizar e Outputs com Export mais Fn::ImportValue para referenciar",
                "Mappings para reutilizar e Parameters para referenciar",
                "Conditions para reutilizar e Metadata para referenciar",
                "Change sets para reutilizar e drift detection para referenciar",
            ),
            0,
            "Nested stacks encapsulam um template reutilizavel, e Outputs exportados sao lidos por outra stack com Fn::ImportValue. Mappings e Conditions atuam dentro de um unico template.",
        ),
        q(
            DEPLOYMENT,
            "Qual comando do AWS SAM CLI permite invocar uma funcao localmente com um evento de teste antes de publicar?",
            (
                "sam deploy --guided",
                "sam local invoke",
                "sam package",
                "sam validate",
            ),
            1,
            "O sam local invoke executa a funcao em um container local com o evento informado. O sam validate so confere a sintaxe do template, e package e deploy publicam artefatos.",
        ),
        # ── Troubleshooting and Optimization ──────────────────────────────────
        q(
            TROUBLESHOOTING,
            "Uma equipe precisa contar quantas vezes uma mensagem de erro especifica apareceu nos logs de uma funcao Lambda na ultima hora, agrupada por codigo de erro. Qual ferramenta responde com uma consulta?",
            (
                "CloudWatch Logs Insights",
                "CloudTrail Event history",
                "AWS Config rules",
                "X-Ray service map",
            ),
            0,
            "O Logs Insights consulta grupos de log com filtros, stats e agrupamentos. O service map do X-Ray mostra latencia e falhas entre servicos, mas nao agrega texto de log.",
        ),
        q(
            TROUBLESHOOTING,
            "Uma API REST com integracao Lambda comeca a retornar 504 Gateway Timeout sob carga, enquanto os logs da funcao mostram execucoes que passam de 30 segundos. Qual e a causa?",
            (
                "O limite de integracao do API Gateway, de 29 segundos, foi excedido",
                "A funcao ficou sem memoria",
                "O payload de resposta passou de 6 MB",
                "A conta atingiu o limite de funcoes Lambda",
            ),
            0,
            "O API Gateway tem um timeout maximo de integracao de 29 segundos e devolve 504 quando a resposta demora mais, mesmo que a funcao continue rodando. Estouro de memoria apareceria como erro da propria funcao, e limite de payload retornaria 502.",
        ),
        q(
            TROUBLESHOOTING,
            "Uma aplicacao grava metricas de negocio a cada invocacao chamando a API PutMetricData de forma sincrona, e isso passou a dominar a latencia. Qual alternativa reduz a latencia mantendo as metricas?",
            (
                "Escrever as metricas em formato Embedded Metric Format nos logs, deixando o CloudWatch extrai-las",
                "Reduzir a frequencia para uma metrica a cada dez invocacoes",
                "Trocar as metricas por prints no log sem estrutura",
                "Aumentar o timeout da funcao",
            ),
            0,
            "O Embedded Metric Format grava um JSON estruturado no log e o CloudWatch extrai as metricas de forma assincrona, sem chamada sincrona a API. Amostrar reduz custo, mas perde fidelidade, e log sem estrutura nao vira metrica.",
        ),
        q(
            TROUBLESHOOTING,
            "Uma funcao Lambda que grava no DynamoDB passou a falhar com AccessDeniedException depois de um deploy que nao mudou o codigo de acesso ao banco. Onde investigar primeiro?",
            (
                "No tamanho do pacote de deploy da funcao",
                "Nas permissoes da role de execucao da funcao, que podem ter sido alteradas no deploy",
                "No timeout configurado para a funcao",
                "Na regiao configurada no console",
            ),
            1,
            "AccessDeniedException e resposta de autorizacao: a chamada chegou ao servico e foi recusada pela politica. Como o codigo nao mudou, o suspeito e a role de execucao que o deploy reescreveu. Timeout e tamanho de pacote produzem erros de outra natureza.",
        ),
    ),
)

EXAM_3 = Exam(
    title="DVA-C02 - Simulado 3",
    objective="Terceiro simulado no estilo da prova, com foco em cenarios de decisao entre servicos.",
    questions=(
        # ── Development with AWS Services ─────────────────────────────────────
        q(
            DEVELOPMENT,
            "Uma aplicacao usa o SDK da AWS e passa a receber erros de throttling em picos. Qual comportamento o SDK ja implementa e deve ser mantido em vez de substituido por um retry fixo?",
            (
                "Retry com backoff exponencial e jitter",
                "Retry imediato e ilimitado",
                "Failover automatico para outra regiao",
                "Cache local das respostas com erro",
            ),
            0,
            "Os SDKs aplicam backoff exponencial com jitter, que espalha as tentativas e evita que todos os clientes voltem juntos. Retry imediato agrava o throttling, criando o efeito manada.",
        ),
        q(
            DEVELOPMENT,
            "Um cache ElastiCache e populado somente quando um dado e pedido e nao esta no cache. Qual e a caracteristica desse padrao?",
            (
                "Write-through: o cache fica sempre atualizado, ao custo de escrever duas vezes",
                "Lazy loading: so entra no cache o que foi pedido, mas o primeiro acesso paga a falha",
                "Write-behind: a escrita vai ao cache e depois ao banco de forma assincrona",
                "Read-replica: o cache replica o banco integralmente",
            ),
            1,
            "Lazy loading, ou cache-aside, carrega sob demanda: economiza memoria com dados nunca pedidos, mas todo primeiro acesso e um cache miss e pode servir dado velho ate expirar. Write-through mantem o cache atualizado a cada escrita.",
        ),
        q(
            DEVELOPMENT,
            "Uma operacao precisa debitar de uma conta e creditar em outra na mesma tabela DynamoDB, de forma que as duas escritas aconteçam juntas ou nenhuma aconteca. Qual API usar?",
            (
                "BatchWriteItem",
                "TransactWriteItems",
                "UpdateItem chamado duas vezes em sequencia",
                "PutItem com ReturnConsumedCapacity",
            ),
            1,
            "TransactWriteItems oferece atomicidade entre varias operacoes: ou todas confirmam ou todas sao desfeitas. BatchWriteItem agrupa por eficiencia, mas cada item pode falhar de forma independente.",
        ),
        q(
            DEVELOPMENT,
            "Um bucket S3 deve acionar um processamento sempre que um novo objeto com sufixo .csv for criado em um prefixo especifico. Qual configuracao e a mais direta?",
            (
                "Event notification do S3 filtrada por prefixo e sufixo, com destino Lambda",
                "Um job agendado que lista o bucket a cada cinco minutos",
                "Uma regra do EventBridge com agendamento cron",
                "Um stream do Kinesis alimentado pelo cliente que faz upload",
            ),
            0,
            "As event notifications do S3 aceitam filtro por prefixo e sufixo e invocam a Lambda no momento do upload. Listagem agendada e cron atrasam o processamento e custam listagens repetidas.",
        ),
        q(
            DEVELOPMENT,
            "Uma equipe quer rotear eventos de varios sistemas para destinos diferentes conforme o conteudo do evento, sem escrever codigo de roteamento. Qual servico atende?",
            (
                "Amazon EventBridge com regras e event patterns",
                "Amazon SQS com uma fila por destino",
                "AWS Lambda com um switch no handler",
                "Amazon Kinesis Data Firehose",
            ),
            0,
            "O EventBridge casa eventos com event patterns e entrega a diferentes targets, sem codigo. SQS transporta mensagens sem inspecionar conteudo, e um switch na Lambda e exatamente o codigo que se quer evitar.",
        ),
        q(
            DEVELOPMENT,
            "Uma funcao Lambda precisa acessar um banco RDS em subnets privadas de uma VPC. O que e necessario?",
            (
                "Configurar a funcao na VPC, com subnets e security group que alcancem o banco",
                "Tornar o banco publico e restringir por security group",
                "Criar um VPC endpoint para o servico Lambda",
                "Usar uma Lambda layer com o driver do banco",
            ),
            0,
            "Anexar a funcao as subnets da VPC cria interfaces de rede que alcancam recursos privados, desde que os security groups permitam. A layer resolve dependencia de codigo, nao conectividade de rede.",
        ),
        q(
            DEVELOPMENT,
            "Qual limite deve ser considerado ao projetar itens de uma tabela DynamoDB?",
            (
                "Cada item pode ter no maximo 400 KB, incluindo nomes de atributos",
                "Cada item pode ter no maximo 1 MB, sem contar os nomes",
                "Cada item pode ter no maximo 64 KB",
                "Nao ha limite de tamanho por item, apenas por particao",
            ),
            0,
            "O limite e de 400 KB por item, contando nomes e valores dos atributos. Objetos maiores devem ir para o S3 com o item guardando o ponteiro. O limite de 1 MB existe, mas e o da resposta de uma Query ou Scan.",
        ),
        # ── Security ──────────────────────────────────────────────────────────
        q(
            SECURITY,
            "Uma aplicacao em EC2 precisa chamar APIs da AWS. Qual e a forma recomendada de fornecer credenciais?",
            (
                "Anexar um instance profile com a role apropriada a instancia",
                "Gravar as chaves em ~/.aws/credentials na instancia",
                "Passar as chaves por user data na inicializacao",
                "Guardar as chaves em uma variavel de ambiente do sistema",
            ),
            0,
            "O instance profile entrega credenciais temporarias pelo Instance Metadata Service, rotacionadas automaticamente. Qualquer alternativa que grave chaves de longa duracao na instancia deixa um segredo permanente exposto em disco ou no user data.",
        ),
        q(
            SECURITY,
            "Uma chave do KMS deve ser usada por uma conta parceira. Onde se declara qual principal externo pode usar a chave?",
            (
                "Na key policy da chave, alem da politica IAM do principal",
                "Apenas na politica IAM do principal externo",
                "No alias da chave",
                "Na configuracao de rotacao automatica da chave",
            ),
            0,
            "Chaves do KMS sao recursos com key policy propria, e o acesso entre contas exige permissao na key policy e tambem na politica IAM do principal. Alias e rotacao nao expressam autorizacao.",
        ),
        q(
            SECURITY,
            "Uma politica IAM concede acoes s3:* em Resource *. Qual e o principal problema dessa politica em uma aplicacao de producao?",
            (
                "Ela viola o principio do menor privilegio, permitindo acoes muito alem do necessario",
                "Ela impede o uso de credenciais temporarias",
                "Ela desabilita a criptografia dos objetos",
                "Ela so funciona na regiao us-east-1",
            ),
            0,
            "Curinga em acao e recurso da a aplicacao poder de apagar ou reconfigurar qualquer bucket da conta, ampliando muito o estrago de um comprometimento. A politica nao afeta criptografia, regiao nem o tipo de credencial.",
        ),
        q(
            SECURITY,
            "Um parametro sensivel guardado no SSM Parameter Store precisa ficar criptografado com o KMS. Qual tipo de parametro usar?",
            (
                "SecureString",
                "String",
                "StringList",
                "EncryptedText",
            ),
            0,
            "SecureString e o tipo que cifra o valor com uma chave do KMS e exige permissao de decrypt na leitura. String e StringList guardam texto claro, e EncryptedText nao existe.",
        ),
        q(
            SECURITY,
            "Um token de acesso do Cognito expirou durante o uso do aplicativo. Qual credencial permite obter um novo token sem pedir login de novo?",
            (
                "O refresh token",
                "O ID token expirado",
                "A chave de API do API Gateway",
                "A access key da conta AWS",
            ),
            0,
            "O refresh token, com validade maior, e trocado por novos access e ID tokens. Tokens expirados nao se renovam sozinhos, e chave de API nao tem relacao com a sessao do usuario.",
        ),
        # ── Deployment ────────────────────────────────────────────────────────
        q(
            DEPLOYMENT,
            "Uma versao publicada de funcao Lambda precisa ser corrigida com urgencia. O que e possivel fazer?",
            (
                "Publicar uma nova versao e apontar o alias para ela",
                "Editar o codigo da versao publicada diretamente",
                "Renomear a versao com defeito",
                "Alterar as variaveis de ambiente da versao publicada",
            ),
            0,
            "Versoes publicadas do Lambda sao imutaveis, codigo e configuracao incluidos. O caminho e publicar uma nova versao a partir do $LATEST corrigido e mover o alias, o que tambem preserva o rollback.",
        ),
        q(
            DEPLOYMENT,
            "Um pipeline precisa construir uma imagem de container e publica-la para que o ECS a utilize. Qual servico armazena a imagem?",
            (
                "Amazon ECR",
                "Amazon S3",
                "AWS CodeArtifact",
                "AWS Systems Manager Parameter Store",
            ),
            0,
            "O ECR e o registro de imagens de container e integra com ECS, EKS e permissao via IAM. O CodeArtifact guarda pacotes de linguagens como npm e Maven, nao imagens.",
        ),
        q(
            DEPLOYMENT,
            "Uma implantacao blue/green de um servico ECS precisa mandar 10% do trafego para a nova versao por cinco minutos antes de completar. Qual componente controla esse desvio?",
            (
                "CodeDeploy com o load balancer alternando entre target groups",
                "O Auto Scaling group do cluster",
                "O Route 53 com politica de failover",
                "O ECS Service Connect",
            ),
            0,
            "Na implantacao blue/green de ECS, o CodeDeploy comanda o load balancer para deslocar trafego entre o target group azul e o verde conforme a configuracao canary. Failover no Route 53 troca destino em caso de falha, nao faz canary controlado.",
        ),
        q(
            DEPLOYMENT,
            "Uma stack do CloudFormation falhou no meio de uma atualizacao. Qual e o comportamento padrao?",
            (
                "A stack faz rollback automatico para o ultimo estado estavel",
                "A stack permanece no estado parcial ate intervencao manual",
                "A stack e apagada junto com todos os recursos",
                "A stack continua a atualizacao ignorando o recurso com falha",
            ),
            0,
            "Por padrao o CloudFormation reverte a atualizacao ao ultimo estado consistente, deixando a stack em UPDATE_ROLLBACK_COMPLETE. Nada e apagado nem ignorado silenciosamente.",
        ),
        q(
            DEPLOYMENT,
            "Uma equipe quer que cada commit na branch principal dispare build e implantacao automaticamente. Qual servico orquestra essa sequencia de estagios?",
            (
                "AWS CodePipeline",
                "AWS CodeBuild",
                "AWS CodeDeploy",
                "AWS CloudFormation",
            ),
            0,
            "O CodePipeline e o orquestrador que encadeia Source, Build e Deploy e reage ao commit. CodeBuild e CodeDeploy sao os estagios que ele aciona, cada um com uma responsabilidade.",
        ),
        # ── Troubleshooting and Optimization ──────────────────────────────────
        q(
            TROUBLESHOOTING,
            "Uma aplicacao que le muitos objetos pequenos do S3 comeca a receber respostas 503 com o codigo SlowDown em horarios de pico. Qual acao ajuda?",
            (
                "Distribuir as chaves entre mais prefixos e aplicar retry com backoff",
                "Aumentar o tamanho de cada objeto",
                "Habilitar versionamento no bucket",
                "Trocar a classe de armazenamento para Glacier",
            ),
            0,
            "O limite de requisicoes do S3 escala por prefixo, entao espalhar as chaves aumenta a vazao total, e o backoff absorve o pico. Glacier so aumentaria a latencia, e versionamento nao muda o limite de requisicoes.",
        ),
        q(
            TROUBLESHOOTING,
            "Um desenvolvedor precisa saber qual usuario apagou uma tabela DynamoDB de producao e quando. Onde essa informacao esta?",
            (
                "Nos eventos do AWS CloudTrail",
                "Nas metricas do CloudWatch da tabela",
                "Nos traces do X-Ray",
                "No DynamoDB Streams da tabela",
            ),
            0,
            "O CloudTrail registra chamadas de API com identidade, horario e origem, incluindo DeleteTable. Metricas mostram comportamento agregado, e o stream da tabela deixa de existir junto com ela.",
        ),
        q(
            TROUBLESHOOTING,
            "Uma funcao Lambda processa mensagens de uma fila SQS e algumas mensagens ficam voltando para a fila indefinidamente. Qual configuracao evita o reprocessamento infinito e preserva a mensagem para analise?",
            (
                "Configurar uma dead-letter queue com maxReceiveCount na fila de origem",
                "Aumentar o visibility timeout da fila",
                "Reduzir o batch size do event source mapping",
                "Habilitar long polling na fila",
            ),
            0,
            "A redrive policy move a mensagem para a dead-letter queue depois de maxReceiveCount recebimentos, interrompendo o ciclo e guardando o payload para investigacao. As demais opcoes ajustam o ritmo do consumo, mas nao encerram o loop.",
        ),
        q(
            TROUBLESHOOTING,
            "Uma funcao Lambda com 30 segundos de timeout encerra com a mensagem Task timed out ao chamar um servico externo lento. Qual mudanca ataca a causa sem apenas adiar o problema?",
            (
                "Aumentar o timeout para o maximo de 15 minutos",
                "Aumentar a memoria da funcao para 10240 MB",
                "Reduzir o batch size do gatilho",
                "Definir um timeout de cliente menor no SDK e tratar a falha, tornando a chamada assincrona",
            ),
            3,
            "Esperar mais tempo por um servico lento apenas paga mais por invocacao e mantem o usuario travado. Definir um timeout de cliente explicito, tratar a falha e mover a chamada para um fluxo assincrono devolve controle a aplicacao. Memoria ajuda tarefas CPU-bound, nao espera de rede.",
        ),
    ),
)

EXAMS: tuple[Exam, ...] = (EXAM_1, EXAM_2, EXAM_3)


def all_questions() -> tuple[Question, ...]:
    return tuple(question for exam in EXAMS for question in exam.questions)


def domain_counts() -> dict[str, int]:
    counts: dict[str, int] = {domain: 0 for domain in DOMAIN_WEIGHTS}
    for question in all_questions():
        counts[question.domain] = counts.get(question.domain, 0) + 1
    return counts
