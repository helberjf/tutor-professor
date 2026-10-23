# 25. AWS SAM e AWS CDK: templates serverless, CLI e constructs

## Mapa da aula
SAM e CDK geram CloudFormation por baixo, mas cada um com uma proposta. Nesta aula:

• o template SAM: transform, tipos de recurso, Globals e Events;
• permissões no SAM: policy templates e connectors;
• AutoPublishAlias e DeploymentPreference para implantações graduais;
• a CLI do SAM: build, local invoke, start-api, generate-event, deploy --guided e sync;
• o AWS CDK: apps, stacks e constructs L1, L2 e L3;
• bootstrap, synth, diff e deploy, e os métodos grant;
• testes de infraestrutura com o módulo assertions;
• quando escolher SAM, CDK ou CloudFormation puro.

## O template SAM
O AWS Serverless Application Model é uma extensão do CloudFormation para aplicações serverless. Um template SAM é um template CloudFormation com a linha:

Transform: AWS::Serverless-2016-10-31

Essa transform expande recursos curtos em vários recursos do CloudFormation. Tipos principais:
• AWS::Serverless::Function: função Lambda com role, permissões e gatilhos;
• AWS::Serverless::Api e AWS::Serverless::HttpApi: APIs do API Gateway;
• AWS::Serverless::SimpleTable: tabela DynamoDB com chave simples;
• AWS::Serverless::LayerVersion: layer;
• AWS::Serverless::StateMachine: máquina do Step Functions;
• AWS::Serverless::Application: aplicação do Serverless Application Repository ou template aninhado;
• AWS::Serverless::Connector: permissões entre recursos.

A seção Globals define propriedades comuns a todas as funções (runtime, timeout, memória, variáveis de ambiente, tracing), evitando repetição.

Como o SAM usa transform e cria roles, a implantação exige CAPABILITY_IAM e CAPABILITY_AUTO_EXPAND.

## Eventos e permissões
A propriedade Events de uma função cria o gatilho e a permissão de invocação de uma vez. Tipos comuns: Api, HttpApi, S3, SQS, SNS, Kinesis, DynamoDB, EventBridgeRule, Schedule/ScheduleV2 e CloudWatchLogs.

Permissões da função:
• Policies com policy templates do SAM, que geram policies de menor privilégio a partir de um parâmetro: DynamoDBCrudPolicy (TableName), DynamoDBReadPolicy, S3ReadPolicy e S3CrudPolicy (BucketName), SQSPollerPolicy e SQSSendMessagePolicy (QueueName), SNSPublishMessagePolicy (TopicName), LambdaInvokePolicy, KMSDecryptPolicy, entre outros;
• nomes de policies gerenciadas ou statements IAM completos;
• Connectors: você declara "esta função lê e escreve nesta tabela" e o SAM gera as permissões corretas.

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Globals:
  Function:
    Runtime: nodejs22.x
    Architectures: [arm64]
    Timeout: 10
    Tracing: Active
Resources:
  Pedidos:
    Type: AWS::Serverless::SimpleTable
  CriarPedido:
    Type: AWS::Serverless::Function
    Metadata:
      BuildMethod: esbuild          # sam build transpila e empacota o TypeScript
      BuildProperties:
        EntryPoints: [src/criar-pedido.ts]
        Target: es2022
        Minify: true
        Sourcemap: true
    Properties:
      CodeUri: ./
      Handler: criar-pedido.handler
      Environment:
        Variables:
          TABELA: !Ref Pedidos
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref Pedidos
      Events:
        Criar:
          Type: Api
          Properties: {Path: /pedidos, Method: post}
      AutoPublishAlias: live
      DeploymentPreference:
        Type: Canary10Percent5Minutes
        Alarms: [!Ref AlarmeErros]
        Hooks:
          PreTraffic: !Ref TestePreTrafego
```

## AutoPublishAlias e DeploymentPreference
• AutoPublishAlias: live faz o SAM publicar uma nova versão sempre que o código ou a configuração da função mudam e apontar o alias live para ela. Os gatilhos usam o alias.
• DeploymentPreference faz a troca de versão passar pelo AWS CodeDeploy, de forma gradual:
  • Canary10Percent5Minutes (e 10, 15 ou 30 minutos): 10% do tráfego vai para a versão nova; depois do tempo, 100%;
  • Linear10PercentEvery1Minute (e 2, 3 ou 10 minutos): mais 10% a cada intervalo;
  • AllAtOnce: tudo de uma vez.
• Alarms: se um alarme do CloudWatch disparar durante a implantação, o CodeDeploy faz rollback automático para a versão anterior.
• Hooks PreTraffic e PostTraffic: funções Lambda que testam a versão nova antes de receber tráfego e depois de receber todo o tráfego. Elas precisam informar o resultado ao CodeDeploy (aula 28).

Na prova: "implantar uma nova versão de Lambda gradualmente e voltar automaticamente em caso de erros, usando SAM" → AutoPublishAlias + DeploymentPreference com Alarms.

## A CLI do SAM
• sam init: cria um projeto a partir de modelos.
• sam build: instala dependências e prepara os artefatos em .aws-sam/. Para funções TypeScript com Metadata BuildMethod: esbuild, o sam build transpila e empacota o código; com --use-container, constrói dentro de um contêiner compatível com a Lambda (bibliotecas nativas).
• sam validate: valida o template.
• sam local invoke Funcao -e evento.json: executa a função localmente em um contêiner Docker com um evento de teste.
• sam local start-api: sobe uma API local que roteia requisições HTTP para as funções.
• sam local start-lambda: emula o endpoint da Lambda para testes automatizados com o SDK.
• sam local generate-event s3 put (ou sqs, apigateway, dynamodb...): gera eventos de exemplo.
• sam deploy --guided: faz perguntas (nome da stack, Região, confirmação de mudanças) e salva as respostas em samconfig.toml; os próximos deploys usam esse arquivo.
• sam package: envia artefatos ao S3 e gera o template final (o deploy já faz isso).
• sam sync --watch: sincroniza mudanças com a nuvem rapidamente durante o desenvolvimento, atualizando o código das funções sem passar por um deploy completo. Não use em produção.
• sam logs: mostra os logs de uma função; sam delete: apaga a stack.
• sam pipeline init: gera configuração de pipeline de CI/CD.

A execução local exige Docker instalado.

## AWS CDK: infraestrutura em linguagem de programação
O AWS Cloud Development Kit permite definir infraestrutura em TypeScript, JavaScript, Python, Java, C# ou Go. O código gera templates CloudFormation (synthesize) que são implantados como stacks.

Estrutura:
• App: o programa CDK, raiz de tudo.
• Stack: uma unidade de implantação, que vira uma stack do CloudFormation, ligada a uma conta e Região (environment).
• Construct: um componente, do nível mais baixo ao mais alto:
  • L1 (CfnBucket, CfnFunction): mapeamento 1 para 1 com os recursos do CloudFormation, sem padrões;
  • L2 (s3.Bucket, lambda.Function): APIs de alto nível com padrões seguros e métodos auxiliares;
  • L3 ou patterns (LambdaRestApi, ApplicationLoadBalancedFargateService): arquiteturas completas com vários recursos.

Vantagens: laços, condições, funções e classes da linguagem, autocompletar, reuso por bibliotecas e testes unitários.

## Comandos do CDK e grants
• cdk init app --language typescript: cria o projeto.
• cdk bootstrap: prepara uma conta e Região para o CDK, criando a stack CDKToolkit com um bucket S3 para assets (código Lambda, arquivos), um repositório ECR para imagens e roles de implantação. É necessário uma vez por conta/Região antes de implantar stacks com assets. O erro "This stack uses assets, so the toolkit stack must be deployed" pede exatamente esse comando.
• cdk synth: gera os templates CloudFormation na pasta cdk.out.
• cdk diff: compara o código com o que está implantado.
• cdk deploy: implanta (via CloudFormation).
• cdk destroy: apaga a stack.
• cdk watch e deploy --hotswap: atualizações rápidas em desenvolvimento.

Métodos grant de constructs L2 geram policies de menor privilégio. O construct NodejsFunction empacota o código TypeScript com esbuild durante o synth, sem etapa de build separada:

```typescript
import { Stack, StackProps } from "aws-cdk-lib";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export class PedidosStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const tabela = new Table(this, "Pedidos", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
    });
    const funcao = new NodejsFunction(this, "CriarPedido", {
      entry: "src/criar-pedido.ts",   // empacotado com esbuild no synth
      runtime: Runtime.NODEJS_22_X,
      environment: { TABELA: tabela.tableName },
    });
    tabela.grantReadWriteData(funcao); // policy mínima na role da função
  }
}
```

## Testes de infraestrutura no CDK
O módulo assertions testa o template gerado, sem implantar nada:

• Template.fromStack(stack) gera o template para teste (em Jest, junto com os testes da aplicação);
• hasResourceProperties("AWS::DynamoDB::Table", {...}) verifica se existe um recurso com certas propriedades (por exemplo, criptografia ou PITR ligados);
• resourceCountIs("AWS::Lambda::Function", 2) verifica quantidades;
• testes de snapshot comparam o template inteiro com uma versão aprovada.

Esses testes pegam regressões de segurança (um bucket que perdeu a criptografia) antes do deploy. O CDK também oferece CDK Pipelines, um construct que monta um pipeline de CI/CD que atualiza a si mesmo.

## SAM, CDK ou CloudFormation?
• SAM: aplicações serverless (Lambda, API Gateway, DynamoDB, Step Functions) em YAML, com atalhos, testes locais com Docker e implantação gradual simples.
• CDK: infraestrutura maior ou variada, equipe que prefere uma linguagem de programação, reuso por bibliotecas de constructs e testes unitários da infraestrutura.
• CloudFormation puro: controle total de cada propriedade em YAML/JSON, sem camada de abstração.

Os três terminam em stacks do CloudFormation, com os mesmos conceitos de change set, rollback e DeletionPolicy. É possível usar o SAM CLI para testar localmente funções definidas em CDK, a partir do template gerado por cdk synth.

## Pegadinhas frequentes
• Template SAM precisa de Transform: AWS::Serverless-2016-10-31 e implantação com CAPABILITY_AUTO_EXPAND.
• DeploymentPreference exige AutoPublishAlias.
• sam local exige Docker.
• sam deploy --guided grava samconfig.toml.
• sam sync é para desenvolvimento, não para produção.
• CDK precisa de cdk bootstrap antes de implantar assets.
• cdk synth gera o template; cdk diff mostra diferenças; cdk deploy implanta.
• grant* (grantReadWriteData, grantRead...) gera permissões mínimas; prefira a escrever policies à mão.

## Resumo para revisão
• SAM: Transform AWS::Serverless-2016-10-31; Function, Api, HttpApi, SimpleTable, LayerVersion, StateMachine, Application, Connector; Globals; Events.
• Policy templates: DynamoDBCrudPolicy, S3ReadPolicy, SQSPollerPolicy, SNSPublishMessagePolicy etc.
• AutoPublishAlias + DeploymentPreference (Canary, Linear, AllAtOnce; Alarms; Hooks PreTraffic/PostTraffic) via CodeDeploy.
• CLI: build (--use-container), local invoke/start-api/start-lambda, generate-event, validate, deploy --guided (samconfig.toml), sync --watch, logs, delete.
• CDK: App → Stack → Constructs L1/L2/L3; bootstrap (CDKToolkit), synth, diff, deploy, destroy; grants; assertions.

## Questões

Q: Um template SAM falha ao implantar com o CloudFormation pedindo CAPABILITY_AUTO_EXPAND. Por quê?
- O template usa recursos de mais de uma Região.
- O template usa Globals.
- O template tem mais de 200 recursos.
+ O template usa a transform do SAM, que é uma macro e exige essa capability.
E: Transforms e macros, como AWS::Serverless-2016-10-31, exigem CAPABILITY_AUTO_EXPAND (e, como o SAM cria roles, também CAPABILITY_IAM). Região, número de recursos e Globals não exigem essa capability.

Q: Uma função SAM precisa de acesso de leitura e escrita a uma tabela DynamoDB criada no mesmo template, com o menor privilégio e o menor esforço. O que usar?
- Uma permissão na política de recurso da tabela.
- A policy gerenciada AmazonDynamoDBFullAccess.
+ O policy template DynamoDBCrudPolicy com TableName referenciando a tabela.
- Uma chave de acesso em variável de ambiente.
E: O policy template gera uma policy limitada às ações CRUD naquela tabela. FullAccess concede tudo em todas as tabelas, chaves de acesso são inseguras e DynamoDB não usa política de recurso para esse caso.

Q: Uma equipe quer que cada novo deploy da função envie 10% do tráfego para a versão nova por 5 minutos e depois 100%, com rollback automático se um alarme de erros disparar. A aplicação usa SAM. O que configurar?
- Concorrência reservada de 10% na versão nova, com a versão antiga recebendo o restante das invocações.
+ AutoPublishAlias e DeploymentPreference com Type Canary10Percent5Minutes e Alarms.
- sam sync --watch.
- Duas funções separadas, uma por versão, e um registro ponderado do Route 53 dividindo o tráfego entre elas.
E: O SAM publica a versão, move o alias e usa o CodeDeploy para a troca gradual com rollback por alarme. sam sync é para desenvolvimento, Route 53 não divide tráfego entre versões de uma função e concorrência não divide tráfego.

Q: Um desenvolvedor quer executar uma função localmente com um evento de upload no S3 de exemplo, sem criar recursos na AWS. Quais comandos atendem?
- aws lambda invoke com --dry-run, que executa o código localmente sem chamar a função na nuvem.
+ sam local generate-event s3 put > evento.json e sam local invoke Funcao -e evento.json.
- sam deploy --guided em uma stack temporária e sam logs para ver o resultado da execução com o evento.
- cdk synth e cdk deploy.
E: generate-event cria o evento de exemplo e local invoke executa a função em um contêiner local. deploy e logs trabalham na nuvem, cdk deploy implanta e o invoke da AWS chama a função na nuvem.

Q: Ao rodar sam deploy pela primeira vez, a equipe quer responder às perguntas de configuração uma vez e reutilizar as respostas nos próximos deploys. O que usar?
- Um arquivo .env na raiz do projeto, que o sam deploy lê automaticamente a cada execução.
- sam init --guided.
+ sam deploy --guided, que grava as respostas em samconfig.toml.
- sam validate --save.
E: O modo guiado salva nome da stack, Região e outras opções em samconfig.toml, usado automaticamente depois. sam init cria o projeto e validate só valida o template.

Q: Um desenvolvedor executa cdk deploy em uma conta nova e recebe a mensagem "This stack uses assets, so the toolkit stack must be deployed to the environment". O que fazer?
- Executar cdk synth com --force.
- Apagar a pasta cdk.out.
- Converter a stack para L1 constructs, que não dependem de assets nem do toolkit.
+ Executar cdk bootstrap na conta e Região.
E: O bootstrap cria a stack CDKToolkit com o bucket e o repositório para assets e as roles de implantação. synth só gera templates, apagar cdk.out não cria os recursos e o tipo de construct não muda a necessidade de assets.

Q: Uma equipe usa CDK e quer conceder a uma função apenas as permissões necessárias para ler e gravar em uma tabela criada na mesma stack. Qual é a forma recomendada?
- Usar um construct L1 CfnPolicy com Resource "*".
- Passar as credenciais da tabela por variável de ambiente.
+ Chamar tabela.grantReadWriteData(funcao).
- Escrever uma policy JSON com dynamodb:* para a função.
E: Os métodos grant de constructs L2 geram a policy mínima para aquela tabela na role da função. As outras opções concedem permissões amplas ou inseguras.

Q: Um time quer garantir, em testes automatizados, que todo bucket S3 criado por sua aplicação CDK tenha criptografia e bloqueio de acesso público, sem implantar nada. O que usar?
- sam local start-api.
- AWS Config na conta de desenvolvimento, com regras que avaliam os buckets antes de cada implantação.
- cdk diff em produção.
+ O módulo assertions, com Template.fromStack e hasResourceProperties.
E: O módulo assertions verifica o template gerado em testes unitários, sem deploy. cdk diff compara com o implantado, Config avalia recursos já existentes e start-api executa funções localmente.

Q: Qual afirmação sobre constructs do CDK está correta?
- Constructs L3 só existem em TypeScript.
- Constructs não geram templates CloudFormation.
+ L2 oferece APIs de alto nível com padrões e métodos auxiliares; L1 mapeia direto o CloudFormation.
- Constructs L1 têm padrões de segurança prontos e métodos grant, por isso são os recomendados para produção.
E: L1 (Cfn*) é o mapeamento direto; L2 acrescenta padrões e métodos como grant; L3 são padrões com vários recursos, disponíveis em todas as linguagens. Tudo vira CloudFormation no synth.

Q: Durante o desenvolvimento, um programador quer que cada alteração no código de uma função SAM chegue à nuvem em segundos, sem esperar um deploy completo. O que usar?
- sam package a cada mudança, que envia o código para o S3 e atualiza a função na hora.
- sam deploy --no-confirm-changeset em produção.
- DeploymentPreference AllAtOnce.
+ sam sync --watch em uma stack de desenvolvimento.
E: sam sync --watch atualiza o código rapidamente, ignorando o ciclo completo do CloudFormation quando possível, e é indicado só para desenvolvimento. As demais opções continuam passando por um deploy completo.

## Flashcards

F: O que identifica um template SAM?
V: Transform: AWS::Serverless-2016-10-31. Exige CAPABILITY_IAM e CAPABILITY_AUTO_EXPAND na implantação.

F: Tipos de recurso do SAM
V: AWS::Serverless::Function, Api, HttpApi, SimpleTable, LayerVersion, StateMachine, Application, Connector (e GraphQLApi).

F: Policy templates do SAM mais comuns
V: DynamoDBCrudPolicy/DynamoDBReadPolicy (TableName), S3ReadPolicy/S3CrudPolicy (BucketName), SQSPollerPolicy/SQSSendMessagePolicy (QueueName), SNSPublishMessagePolicy, LambdaInvokePolicy, KMSDecryptPolicy.

F: AutoPublishAlias e DeploymentPreference
V: AutoPublishAlias publica versão e move o alias a cada mudança. DeploymentPreference usa CodeDeploy: Canary, Linear ou AllAtOnce, com Alarms (rollback) e Hooks PreTraffic/PostTraffic.

F: Comandos de teste local do SAM
V: sam local invoke -e evento.json, sam local start-api, sam local start-lambda e sam local generate-event. Exigem Docker.

F: O que sam deploy --guided faz?
V: Pergunta as opções de implantação e as salva em samconfig.toml para os próximos deploys.

F: Níveis de constructs do CDK
V: L1 (Cfn*, 1:1 com CloudFormation), L2 (alto nível, padrões e grants) e L3/patterns (arquiteturas completas).

F: Para que serve cdk bootstrap?
V: Cria a stack CDKToolkit (bucket S3 de assets, repositório ECR e roles) em uma conta e Região, necessária antes de implantar stacks com assets.

F: cdk synth, cdk diff e cdk deploy
V: synth gera os templates em cdk.out; diff compara com o implantado; deploy implanta via CloudFormation.

F: Como testar infraestrutura CDK sem implantar?
V: Módulo assertions: Template.fromStack(stack), hasResourceProperties, resourceCountIs e testes de snapshot.
