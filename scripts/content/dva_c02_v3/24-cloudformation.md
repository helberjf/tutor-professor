# 24. CloudFormation: templates, funções intrínsecas, change sets e proteção de recursos

## Mapa da aula
Infraestrutura como código é cobrada em detalhes na prova. Nesta aula:

• as seções de um template e qual é obrigatória;
• parâmetros, pseudo parâmetros, mappings e conditions;
• Ref, GetAtt, Sub, Join, FindInMap, ImportValue e as funções de condição;
• outputs, exports, cross-stack references e nested stacks;
• change sets, tipos de atualização e substituição de recursos;
• DeletionPolicy, UpdateReplacePolicy, stack policy e termination protection;
• rollback, drift detection, StackSets, custom resources e helper scripts;
• capabilities e dynamic references para segredos.

## Seções de um template
Um template (YAML ou JSON) pode ter:

• AWSTemplateFormatVersion: a versão do formato ("2010-09-09").
• Description: texto livre.
• Metadata: dados adicionais (inclusive AWS::CloudFormation::Init para EC2).
• Parameters: valores informados na criação ou atualização da stack.
• Rules: validações entre parâmetros.
• Mappings: tabelas fixas de chave → valor (por exemplo, por Região ou ambiente).
• Conditions: expressões que decidem se um recurso ou propriedade é criado.
• Transform: macros, como AWS::Serverless-2016-10-31 (SAM) e AWS::Include.
• Resources: os recursos. É a única seção obrigatória.
• Outputs: valores exibidos e, opcionalmente, exportados para outras stacks.

Limites: até 51.200 bytes enviando o template diretamente; até 1 MB enviando pelo S3.

## Parâmetros e pseudo parâmetros
Parâmetros tornam o template reutilizável. Recursos úteis:
• Type: String, Number, CommaDelimitedList, List<Number>, tipos específicos da AWS (AWS::EC2::VPC::Id, AWS::EC2::KeyPair::KeyName), que validam e mostram listas no console, e tipos de SSM (AWS::SSM::Parameter::Value<String>), que leem o valor de um parâmetro do Parameter Store;
• Default, AllowedValues, AllowedPattern, MinLength, MaxValue;
• NoEcho: true esconde o valor no console e nas descrições. Não transforma o parâmetro em cofre de segredos; prefira dynamic references.

Pseudo parâmetros são valores fornecidos pelo CloudFormation, sem declarar: AWS::AccountId, AWS::Region, AWS::StackName, AWS::StackId, AWS::Partition, AWS::URLSuffix e AWS::NoValue (remove uma propriedade quando usado em um Fn::If).

Use pseudo parâmetros para não fixar conta e Região no template: !Sub "arn:aws:s3:::logs-${AWS::AccountId}-${AWS::Region}".

## Funções intrínsecas
• Ref: devolve o valor de um parâmetro ou o identificador físico de um recurso. O que "identificador físico" significa depende do recurso: o nome do bucket, o nome da função Lambda, a URL da fila SQS, o id da instância.
• Fn::GetAtt (!GetAtt Recurso.Atributo): devolve um atributo específico, como o Arn de uma função ou fila, o DomainName de um bucket ou o StreamArn de uma tabela.
• Fn::Sub: substitui variáveis em uma string: !Sub "https://${MinhaApi}.execute-api.${AWS::Region}.amazonaws.com/prod".
• Fn::Join: junta valores com um separador.
• Fn::Split e Fn::Select: dividem uma string e escolhem um item da lista.
• Fn::FindInMap: busca um valor em Mappings (!FindInMap [AmiPorRegiao, !Ref "AWS::Region", Id]).
• Fn::ImportValue: importa um valor exportado por outra stack.
• Fn::If, Fn::Equals, Fn::And, Fn::Or, Fn::Not: lógica de conditions.
• Fn::Base64: codifica o UserData de uma instância.
• Fn::GetAZs e Fn::Cidr: listam AZs e calculam blocos de rede.

Pegadinha comum: Ref em uma função Lambda devolve o nome, não o ARN. Para o ARN, use !GetAtt Funcao.Arn.

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Parameters:
  Ambiente:
    Type: String
    AllowedValues: [dev, prod]
Conditions:
  EhProducao: !Equals [!Ref Ambiente, prod]
Mappings:
  Capacidade:
    dev:  {Leitura: 5}
    prod: {Leitura: 100}
Resources:
  Fila:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub "pedidos-${Ambiente}"
  Alarme:
    Type: AWS::CloudWatch::Alarm
    Condition: EhProducao            # só existe em prod
    Properties:
      Namespace: AWS/SQS
      MetricName: ApproximateAgeOfOldestMessage
      Dimensions: [{Name: QueueName, Value: !GetAtt Fila.QueueName}]
      Statistic: Maximum
      Period: 60
      EvaluationPeriods: 5
      Threshold: 300
      ComparisonOperator: GreaterThanThreshold
Outputs:
  FilaUrl:
    Value: !Ref Fila                 # Ref de uma fila devolve a URL
    Export:
      Name: !Sub "${AWS::StackName}-FilaUrl"
  FilaArn:
    Value: !GetAtt Fila.Arn
```

## Outputs, exports e nested stacks
Outputs mostram valores da stack (URL da API, ARN da fila). Com Export, o valor fica disponível para outras stacks da mesma conta e Região, que o leem com Fn::ImportValue.

Regras de cross-stack references:
• o nome do export precisa ser único na Região;
• você não consegue apagar a stack exportadora nem alterar o valor exportado enquanto outra stack o importa;
• use para recursos compartilhados com ciclo de vida próprio (por exemplo, uma stack de rede usada por várias aplicações).

Nested stacks (AWS::CloudFormation::Stack) incluem um template dentro de outro, como um componente reutilizável (um padrão de load balancer, um módulo de alarmes). A stack pai cria e atualiza as filhas junto. Use quando o componente pertence à aplicação e deve ser implantado com ela.

Resumo: recurso compartilhado entre aplicações → export/import. Componente reutilizado dentro de uma aplicação → nested stack.

## Change sets e substituição de recursos
Um change set mostra o que uma atualização vai fazer antes de executá-la: quais recursos serão adicionados, modificados ou removidos e, para os modificados, se haverá substituição (Replacement: True, False ou Conditional).

Tipos de atualização de propriedade:
• No interruption: altera sem impacto;
• Some interruption: reinicia ou interrompe brevemente;
• Replacement: cria um recurso novo, aponta as referências para ele e apaga o antigo. Exemplos: mudar o nome de uma tabela DynamoDB, o key schema ou o nome de um bucket.

Substituir um banco ou tabela significa perder os dados do recurso antigo, a menos que você os proteja. Por isso, revise change sets antes de atualizar produção.

Recursos com nome fixo (BucketName, TableName) não podem ser substituídos sem conflito de nome; deixar o CloudFormation gerar o nome evita esse problema.

## Proteger recursos e dados
• DeletionPolicy: o que fazer com o recurso quando ele sai do template ou a stack é apagada. Delete (padrão da maioria dos recursos), Retain (mantém o recurso fora da stack) ou Snapshot (cria um snapshot antes de apagar, para RDS, EBS, ElastiCache, Redshift e outros). RetainExceptOnCreate mantém o recurso, exceto se a criação falhar.
• UpdateReplacePolicy: o mesmo, mas para o recurso antigo quando uma atualização causa substituição.
• Stack policy: um documento JSON que impede atualizações em recursos específicos (por exemplo, proibir Update:Replace no banco de produção). Para mudar o recurso protegido, é preciso sobrescrever a policy de forma explícita na atualização.
• Termination protection: impede apagar a stack por engano.

Na prova: "não perder os dados do RDS se a stack for apagada" → DeletionPolicy: Snapshot (ou Retain). "Impedir que uma atualização substitua a tabela de produção" → stack policy.

## Rollback, drift e StackSets
Rollback: se a criação ou atualização falha, o CloudFormation desfaz as mudanças e volta ao estado anterior. Para investigar a falha, você pode preservar os recursos criados com sucesso (opção de desativar rollback ou "preserve successfully provisioned resources"). Rollback triggers revertem a atualização se um alarme do CloudWatch disparar durante um período de monitoramento.

Se a volta falhar (UPDATE_ROLLBACK_FAILED), por exemplo porque alguém apagou um recurso manualmente, use "continue update rollback", podendo pular os recursos problemáticos.

Os eventos da stack (aba Events ou describe-stack-events) mostram o primeiro recurso que falhou e o motivo: é por onde começar a investigação.

Drift detection compara o estado real dos recursos com o template e aponta alterações manuais.

StackSets implantam o mesmo template em várias contas e Regiões a partir de uma conta administradora, integrados ao AWS Organizations.

## Custom resources e helper scripts
Custom resources executam lógica durante criação, atualização e exclusão da stack. O tipo é Custom::Nome (ou AWS::CloudFormation::CustomResource) e o ServiceToken aponta para uma função Lambda (ou um tópico SNS). Usos: configurar algo que o CloudFormation não suporta, buscar um valor externo ou esvaziar um bucket antes de apagá-lo.

A função precisa enviar a resposta (SUCCESS ou FAILED) para a URL pré-assinada do S3 que vem no evento (o módulo cfn-response ajuda). Se não responder, a stack fica parada até o timeout (até 1 hora). Trate também o evento Delete, senão a exclusão da stack trava.

Helper scripts para EC2:
• cfn-init: lê AWS::CloudFormation::Init nos metadados e instala pacotes, cria arquivos e inicia serviços;
• cfn-signal: avisa o CloudFormation que a instância terminou a configuração, usado com CreationPolicy (ResourceSignal com Count e Timeout) ou WaitCondition;
• cfn-hup: detecta mudanças nos metadados e reaplica a configuração.

Sem cfn-signal, o CloudFormation marca a instância como criada assim que ela inicia, mesmo que a aplicação ainda não esteja pronta.

## Capabilities, dynamic references e linha de comando
Capabilities são confirmações exigidas em certos templates:
• CAPABILITY_IAM: o template cria recursos IAM;
• CAPABILITY_NAMED_IAM: cria recursos IAM com nomes definidos por você;
• CAPABILITY_AUTO_EXPAND: o template usa macros ou transforms (como SAM) ou nested stacks com macros.
Sem a capability, a operação falha com InsufficientCapabilitiesException.

Dynamic references leem valores no momento da implantação, sem colocá-los no template:
• {{resolve:ssm:/app/prod/tabela}} (Parameter Store);
• {{resolve:ssm-secure:/app/prod/senha}} (SecureString, em propriedades que suportam);
• {{resolve:secretsmanager:prod/banco:SecretString:password}} (Secrets Manager).

Comandos:
• aws cloudformation validate-template: valida só a sintaxe;
• cfn-lint: valida regras e propriedades com mais profundidade;
• aws cloudformation package: envia artefatos locais (código Lambda, templates aninhados) para o S3 e gera um template com as referências;
• aws cloudformation deploy: cria ou atualiza a stack usando change sets.

Uma service role pode ser informada à stack para que o CloudFormation crie os recursos com ela, em vez das permissões de quem executa; quem cria a stack precisa de iam:PassRole para essa role.

## Pegadinhas frequentes
• Resources é a única seção obrigatória.
• Ref de função Lambda devolve o nome; ARN é !GetAtt Funcao.Arn. Ref de fila SQS devolve a URL.
• Export não pode ser removido ou alterado enquanto importado.
• Mudar nome ou chave de uma tabela causa Replacement.
• DeletionPolicy padrão é Delete; Snapshot só para recursos que suportam.
• Template com IAM exige CAPABILITY_IAM (ou NAMED_IAM); com SAM, CAPABILITY_AUTO_EXPAND.
• Custom resource que não responde trava a stack.
• NoEcho esconde, mas não é cofre; use dynamic references.

## Resumo para revisão
• Seções: Version, Description, Metadata, Parameters, Rules, Mappings, Conditions, Transform, Resources (obrigatória), Outputs.
• Pseudo parâmetros: AccountId, Region, StackName, StackId, Partition, URLSuffix, NoValue.
• Funções: Ref, GetAtt, Sub, Join, Split, Select, FindInMap, ImportValue, If/Equals/And/Or/Not, Base64, GetAZs, Cidr.
• Export/ImportValue para recursos compartilhados; nested stacks para componentes.
• Change sets mostram Replacement antes de executar.
• DeletionPolicy (Delete, Retain, Snapshot), UpdateReplacePolicy, stack policy, termination protection.
• Rollback, rollback triggers, continue update rollback, drift detection, StackSets.
• Custom resources (Lambda, responder à URL), cfn-init, cfn-signal, cfn-hup.
• Capabilities IAM, NAMED_IAM, AUTO_EXPAND; dynamic references ssm, ssm-secure, secretsmanager.

## Questões

Q: Um template precisa passar o ARN de uma função Lambda para a propriedade de destino de uma regra do EventBridge. O desenvolvedor usou !Ref MinhaFuncao e a implantação falhou. Qual é a correção?
+ Usar !GetAtt MinhaFuncao.Arn.
- Usar !FindInMap MinhaFuncao.
- Usar !Sub MinhaFuncao.
- Usar !ImportValue MinhaFuncao.
E: Ref em uma função Lambda devolve o nome; o ARN é o atributo Arn obtido com GetAtt. Sub sem variável devolve o texto, ImportValue busca exports de outra stack e FindInMap consulta Mappings.

Q: Uma stack de rede cria uma VPC e subnets usadas por cinco aplicações, cada uma com sua stack e seu ciclo de implantação. Como as stacks das aplicações devem obter os ids das subnets?
- Usar Mappings com os ids.
+ Exportar os ids nos Outputs da stack de rede e importá-los com Fn::ImportValue nas stacks das aplicações.
- Incluir a stack de rede como nested stack em cada aplicação.
- Copiar os ids manualmente para cada template.
E: Cross-stack references compartilham recursos com ciclo de vida próprio. Nested stacks criariam uma rede por aplicação; copiar ids ou fixá-los em Mappings quebra quando a rede muda.

Q: Antes de atualizar uma stack de produção, a equipe quer saber se a mudança vai substituir a tabela DynamoDB. O que usar?
+ Um change set, que mostra as ações e a coluna Replacement de cada recurso.
- Uma stack policy.
- Drift detection.
- validate-template.
E: O change set mostra o plano da atualização, inclusive substituições. validate-template só checa sintaxe, drift detection compara com mudanças manuais e a stack policy protege, mas não mostra o plano.

Q: Um banco RDS é criado pela stack. A empresa exige que, se a stack for apagada, os dados não sejam perdidos. O que configurar no recurso?
- DependsOn.
- Condition.
- CreationPolicy com um tempo de espera antes da exclusão.
+ DeletionPolicy: Snapshot (ou Retain).
E: DeletionPolicy Snapshot cria um snapshot antes de apagar o banco, e Retain mantém o banco fora da stack. DependsOn define ordem, CreationPolicy espera sinais na criação e Condition decide se o recurso existe.

Q: A equipe quer impedir que qualquer atualização de stack substitua ou apague a tabela de pedidos de produção, mesmo por engano no template. O que aplicar?
+ Uma stack policy que nega Update:Replace e Update:Delete para a tabela.
- Um export da tabela nos Outputs, que impede qualquer alteração enquanto outra stack a importar.
- Termination protection na stack, que bloqueia substituições e exclusões de recursos.
- NoEcho na tabela.
E: Stack policies bloqueiam tipos de atualização em recursos específicos. Termination protection só impede apagar a stack inteira, NoEcho é para parâmetros, e exports não protegem contra substituição.

Q: Uma implantação falha com InsufficientCapabilitiesException. O template cria uma role IAM com o nome fixo "app-pedidos-role". O que fazer?
- Remover a role do template.
- Adicionar DeletionPolicy: Retain à role, para que ela não seja recriada.
- Executar com CAPABILITY_AUTO_EXPAND, que libera a criação de qualquer recurso IAM.
+ Executar a operação com CAPABILITY_NAMED_IAM.
E: Recursos IAM com nome definido exigem CAPABILITY_NAMED_IAM (sem nome, CAPABILITY_IAM). AUTO_EXPAND é para macros e transforms, e DeletionPolicy não tem relação com capabilities.

Q: Uma stack com um custom resource baseado em Lambda fica em CREATE_IN_PROGRESS por quase uma hora e depois falha. Os logs mostram que a função terminou sem erro. Qual é a causa provável?
- O template excedeu 51.200 bytes.
+ A função não enviou a resposta SUCCESS ou FAILED para a URL pré-assinada recebida no evento.
- A função precisa de concorrência provisionada para responder ao CloudFormation antes do limite de tempo da stack.
- O custom resource precisa de DependsOn.
E: O CloudFormation espera a resposta do custom resource na URL do evento; sem ela, aguarda até o timeout. DependsOn só define ordem, o tamanho do template seria rejeitado no início e concorrência não afeta a resposta.

Q: Um template cria instâncias EC2 que instalam a aplicação na inicialização. O CloudFormation marca a stack como concluída antes de a aplicação estar pronta, e as verificações seguintes falham. O que usar?
- Uma condition.
+ cfn-init para configurar e cfn-signal com CreationPolicy para avisar quando estiver pronto.
- DeletionPolicy.
- Drift detection.
E: Com CreationPolicy, o CloudFormation espera o sinal (cfn-signal) enviado depois que cfn-init conclui a configuração, ou falha no timeout. As outras opções não controlam a espera pela configuração.

Q: Um template precisa usar a senha do banco guardada no Secrets Manager, sem que ela apareça no template nem nos parâmetros. Qual é a forma recomendada?
+ Dynamic reference {{resolve:secretsmanager:prod/banco:SecretString:password}}.
- Parâmetro String com NoEcho e a senha digitada no console, que a protege como um segredo do Secrets Manager.
- Fn::Base64 aplicado à senha.
- Mappings com a senha.
E: A dynamic reference busca o valor no momento da implantação sem gravá-lo no template. NoEcho esconde na exibição, mas a senha ainda passa como parâmetro; Mappings expõem o valor; e base64 é só codificação.

Q: O mesmo template de alarmes e roles de auditoria precisa ser implantado em 40 contas e 3 Regiões da organização. Qual recurso usar?
- Change sets.
- Cross-stack references.
- Nested stacks.
+ CloudFormation StackSets.
E: StackSets implantam um template em várias contas e Regiões a partir de uma conta administradora. Nested stacks e exports funcionam dentro de uma conta e Região, e change sets mostram mudanças de uma stack.

## Flashcards

F: Seções de um template CloudFormation
V: AWSTemplateFormatVersion, Description, Metadata, Parameters, Rules, Mappings, Conditions, Transform, Resources (única obrigatória) e Outputs.

F: Ref vs. Fn::GetAtt
V: Ref devolve o valor do parâmetro ou o id físico do recurso (nome da função, nome do bucket, URL da fila). GetAtt devolve atributos como Arn.

F: Pseudo parâmetros do CloudFormation
V: AWS::AccountId, AWS::Region, AWS::StackName, AWS::StackId, AWS::Partition, AWS::URLSuffix e AWS::NoValue.

F: Export/ImportValue vs. nested stack
V: Export/ImportValue: compartilhar recursos entre stacks independentes. Nested stack: componente reutilizável implantado junto com a stack pai.

F: O que um change set mostra?
V: Ações planejadas (Add, Modify, Remove) e se cada modificação causa substituição (Replacement True/False/Conditional).

F: Valores de DeletionPolicy
V: Delete (padrão), Retain, Snapshot (RDS, EBS, ElastiCache, Redshift...) e RetainExceptOnCreate. UpdateReplacePolicy vale para substituições.

F: Stack policy vs. termination protection
V: Stack policy impede tipos de atualização em recursos específicos. Termination protection impede apagar a stack.

F: Capabilities do CloudFormation
V: CAPABILITY_IAM (cria IAM), CAPABILITY_NAMED_IAM (IAM com nomes) e CAPABILITY_AUTO_EXPAND (macros/transforms como SAM).

F: Custom resource baseado em Lambda
V: Tipo Custom::Nome com ServiceToken da função; a função deve responder SUCCESS/FAILED à URL pré-assinada do evento, inclusive no Delete.

F: Helper scripts de EC2 no CloudFormation
V: cfn-init (aplica AWS::CloudFormation::Init), cfn-signal (sinaliza CreationPolicy/WaitCondition) e cfn-hup (reaplica mudanças de metadados).
