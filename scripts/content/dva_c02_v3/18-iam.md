# 18. IAM para desenvolvedores: policies, avaliação e menor privilégio

## Mapa da aula
Segurança vale 26% da prova, e IAM está em quase todas essas questões. Nesta aula:

• a anatomia de uma policy JSON;
• os tipos de policy: identidade, recurso, permissions boundary, SCP e session policy;
• como a AWS decide entre Allow e Deny, na mesma conta e entre contas;
• condições e variáveis de policy, inclusive o acesso por item no DynamoDB;
• RBAC e ABAC;
• iam:PassRole;
• como investigar um AccessDenied: Policy Simulator, decode-authorization-message, CloudTrail e Access Analyzer.

## Anatomia de uma policy
Uma policy é um documento JSON com uma lista de statements. Cada statement tem:

• Effect: Allow ou Deny.
• Action: as ações da API, no formato servico:Acao (s3:GetObject, dynamodb:Query). Aceita curingas: s3:Get*.
• Resource: os ARNs a que as ações se aplicam.
• Condition (opcional): condições que precisam ser verdadeiras.
• Principal: quem recebe a permissão. Só aparece em policies baseadas em recurso e em trust policies.
• Sid (opcional): um nome para o statement.

Version deve ser "2012-10-17", a versão atual da linguagem; sem ela, variáveis de policy não funcionam.

No exemplo abaixo, repare no segundo ARN: consultar um índice exige permissão no ARN do índice, além da tabela. Esquecer isso gera AccessDenied em Query no GSI.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "LerPedidos",
    "Effect": "Allow",
    "Action": ["dynamodb:GetItem", "dynamodb:Query"],
    "Resource": [
      "arn:aws:dynamodb:sa-east-1:111122223333:table/Pedidos",
      "arn:aws:dynamodb:sa-east-1:111122223333:table/Pedidos/index/*"
    ]
  }]
}
```

## Tipos de policy
• Identity-based: anexadas a usuários, grupos e roles. Podem ser gerenciadas pela AWS (prontas, como AmazonS3ReadOnlyAccess), gerenciadas pelo cliente (reutilizáveis, versionadas) ou inline (dentro de uma só identidade).
• Resource-based: anexadas ao recurso, com campo Principal. Exemplos: bucket policy do S3, política de fila SQS, de tópico SNS, de função Lambda, key policy do KMS, política de segredo do Secrets Manager, de repositório ECR e de API do API Gateway.
• Permissions boundary: define o máximo que uma identidade pode ter. Não concede nada sozinha.
• Service control policies (SCPs) do AWS Organizations: limite máximo para todas as identidades das contas de uma unidade organizacional. Não concedem nada.
• Session policy: passada ao assumir uma role (ou em uma federação); limita a sessão. Não concede nada além do que a role tem.

Prefira policies gerenciadas pelo cliente a inline: são reutilizáveis, versionadas e mais fáceis de auditar.

## Como a decisão é tomada
Para cada requisição, a AWS avalia todas as policies aplicáveis:

1. Por padrão, tudo é negado (deny implícito).
2. Um Deny explícito em qualquer policy aplicável vence sempre.
3. Sem Deny, é preciso um Allow em uma policy que conceda permissão (identidade ou recurso).
4. Boundaries, SCPs e session policies precisam também permitir a ação. A permissão efetiva é a interseção: o que a identidade concede E o que cada limite permite.

Na mesma conta: basta Allow na policy da identidade ou na policy do recurso (para a maioria dos serviços), desde que nenhum limite ou Deny bloqueie.

Entre contas: é preciso Allow nos dois lados. A conta de origem permite que sua identidade chame o recurso (identity policy), e a conta dona do recurso permite o principal de fora (resource policy). A alternativa é a identidade assumir uma role na conta do recurso (aula 19).

Exceção importante: em chaves KMS, a key policy precisa permitir o uso (direta ou delegando à conta). Uma policy IAM sozinha não basta se a key policy não confiar na conta.

## Condições e variáveis
Condições refinam quando um statement vale. Chaves globais muito cobradas:

• aws:SourceIp: faixa de IP de origem.
• aws:SecureTransport: requisição por HTTPS.
• aws:MultiFactorAuthPresent: a sessão usou MFA.
• aws:RequestedRegion: restringe a Regiões permitidas.
• aws:PrincipalTag, aws:ResourceTag, aws:RequestTag e aws:TagKeys: decisões por tags.
• aws:SourceArn e aws:SourceAccount: qual recurso de serviço está chamando (protege contra o "confused deputy").
• aws:PrincipalOrgID: qualquer principal da sua organização.

Operadores: StringEquals, StringLike (com curingas), ArnLike, IpAddress, Bool, NumericLessThan, DateGreaterThan, entre outros. Vários valores na mesma chave funcionam como OU; várias chaves na mesma condição funcionam como E.

Variáveis de policy inserem valores da requisição: ${aws:username} permite "cada usuário acessa só a própria pasta" no S3 com um único statement (Resource: arn:aws:s3:::docs/${aws:username}/*).

## Acesso por item no DynamoDB
A chave de condição dynamodb:LeadingKeys restringe o acesso aos itens cuja partition key é igual a um valor. Combinada com a identidade do usuário de um Cognito identity pool, cada usuário só lê e grava os próprios itens. A condição dynamodb:Attributes, por sua vez, restringe quais atributos podem ser lidos ou gravados.

Exemplo de policy para a role autenticada do identity pool:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem"],
    "Resource": "arn:aws:dynamodb:sa-east-1:111122223333:table/Notas",
    "Condition": {
      "ForAllValues:StringEquals": {
        "dynamodb:LeadingKeys": ["${cognito-identity.amazonaws.com:sub}"]
      }
    }
  }]
}
```

## RBAC e ABAC
RBAC (controle baseado em funções): você cria roles ou grupos por função de trabalho (desenvolvedor, analista) e anexa policies com recursos listados. Fácil de entender, mas cresce: um novo projeto exige atualizar policies.

ABAC (controle baseado em atributos): as permissões comparam tags do principal com tags do recurso. Exemplo: permitir ações quando aws:ResourceTag/projeto for igual a aws:PrincipalTag/projeto. Um projeto novo só exige marcar as identidades e os recursos com a tag certa, sem mudar a policy.

Para que o ABAC funcione, controle quem pode alterar tags (aws:RequestTag, aws:TagKeys), senão alguém se dá acesso trocando a tag.

## iam:PassRole
Quando você cria uma função Lambda, uma tarefa ECS, um perfil de instância EC2 ou uma stack do CloudFormation que vai usar uma role, você está "passando" a role para o serviço. Isso exige a permissão iam:PassRole sobre o ARN daquela role.

Por que existe: sem esse controle, um desenvolvedor com permissão para criar funções poderia passar uma role administrativa para a função e, pelo código, fazer qualquer coisa.

Boas práticas:
• limite o Resource de iam:PassRole às roles que o desenvolvedor pode usar;
• use a condição iam:PassedToService (por exemplo, lambda.amazonaws.com).

Erro típico na prova: "o desenvolvedor tem lambda:CreateFunction, mas recebe AccessDenied ao criar a função com a role X" → falta iam:PassRole para a role X.

## Investigando um AccessDenied
Ordem prática:

1. Descubra quem está chamando: aws sts get-caller-identity (aula 02).
2. Leia a mensagem: muitas mensagens dizem qual ação e recurso foram negados e se houve Deny explícito em uma policy de identidade, de recurso, SCP ou boundary.
3. Mensagens codificadas: alguns serviços (como EC2) devolvem um "encoded authorization message". Decodifique com aws sts decode-authorization-message --encoded-message ..., que exige a permissão sts:DecodeAuthorizationMessage.
4. Teste com o IAM Policy Simulator: simula se uma identidade pode executar uma ação em um recurso, considerando as policies anexadas.
5. Consulte o CloudTrail: eventos com errorCode AccessDenied mostram a identidade, a ação, o recurso e a hora.

IAM Access Analyzer ajuda a chegar ao menor privilégio: gera policies a partir da atividade registrada no CloudTrail, aponta recursos compartilhados com entidades externas, valida policies e mostra permissões não usadas. O "último acesso" (last accessed) mostra quais serviços uma identidade realmente usou.

## Boas práticas para desenvolvedores
• Pessoas acessam a AWS pelo IAM Identity Center (SSO) com credenciais temporárias; evite usuários IAM com chaves de longo prazo.
• Aplicações na AWS usam roles; nunca grave chaves no código, em variáveis de ambiente ou em repositórios.
• Se precisar de chaves (uma aplicação fora da AWS), rotacione-as e monitore o uso; cada usuário pode ter até duas chaves ativas, o que permite a rotação sem parada.
• Comece com permissões mínimas e amplie com base nos erros e no Access Analyzer.
• Exija MFA para ações sensíveis.

## Pegadinhas frequentes
• Deny explícito sempre vence, inclusive sobre um Allow de administrador.
• Boundary, SCP e session policy não concedem; só limitam.
• Entre contas, Allow nos dois lados (identidade e recurso).
• Query em índice exige o ARN table/Nome/index/*.
• Criar recurso com role exige iam:PassRole.
• Mensagem codificada → sts decode-authorization-message.
• Grupo não é principal; não aparece em resource policies.

## Resumo para revisão
• Policy: Version, Statement (Sid, Effect, Action, Resource, Condition; Principal só em policies de recurso e trust).
• Tipos: identidade (gerenciada AWS, gerenciada pelo cliente, inline), recurso, boundary, SCP, session policy.
• Avaliação: deny implícito → Deny explícito vence → precisa de Allow → limites cortam (interseção).
• Entre contas: identidade + recurso, ou assumir role.
• Condições: SourceIp, SecureTransport, MultiFactorAuthPresent, RequestedRegion, tags, SourceArn/SourceAccount, PrincipalOrgID. Variáveis como ${aws:username}.
• dynamodb:LeadingKeys para acesso por item.
• ABAC por tags; RBAC por função.
• iam:PassRole com iam:PassedToService.
• Diagnóstico: get-caller-identity, decode-authorization-message, Policy Simulator, CloudTrail, Access Analyzer.

## Questões

Q: Um usuário tem a policy AdministratorAccess e também uma policy que nega s3:DeleteObject no bucket "contratos". Ele tenta apagar um objeto desse bucket. Qual é o resultado?
- Depende da ordem em que as policies foram anexadas.
- Permitido apenas se o bucket tiver versionamento.
- Permitido, porque AdministratorAccess concede tudo.
+ Negado, porque um Deny explícito sempre prevalece sobre qualquer Allow.
E: Na avaliação do IAM, um Deny explícito em qualquer policy aplicável vence qualquer Allow. A ordem das policies não importa, e o versionamento não muda a decisão de permissão.

Q: Uma função na conta A precisa ler objetos de um bucket na conta B, sem assumir role. Quais permissões são necessárias?
+ Allow na policy da role (conta A) e na bucket policy (conta B) para essa role.
- Apenas a policy da role da função na conta A permitindo s3:GetObject.
- Uma SCP na conta B permitindo a conta A.
- Apenas a bucket policy na conta B permitindo a role da função.
E: Em acesso entre contas sem assumir role, a identidade precisa de Allow na própria conta e o recurso precisa permitir o principal de fora. SCPs só limitam, não concedem.

Q: Um desenvolvedor tem a permissão lambda:CreateFunction, mas recebe AccessDenied ao criar uma função usando a role "app-pedidos-role". O que falta?
- sts:AssumeRole para app-pedidos-role.
+ iam:PassRole para o ARN de app-pedidos-role.
- lambda:InvokeFunction.
- iam:CreateRole.
E: Associar uma role a um serviço exige iam:PassRole sobre aquela role. InvokeFunction é para chamar a função, AssumeRole é para o próprio desenvolvedor assumir a role e CreateRole não é necessário, porque a role já existe.

Q: Um desenvolvedor recebeu, ao executar uma ação no EC2, um erro com uma mensagem de autorização codificada. Como descobrir o motivo detalhado?
+ Executar aws sts decode-authorization-message com a mensagem (exige sts:DecodeAuthorizationMessage).
- Repetir a mesma chamada com a opção --debug, que exibe a mensagem decodificada e a policy que negou o acesso.
- Executar aws iam get-account-authorization-details, que devolve o motivo de cada negação recente na conta.
- Abrir um chamado no suporte.
E: A mensagem codificada só é lida com sts decode-authorization-message, que exige a permissão correspondente. Os outros caminhos não decodificam a mensagem.

Q: Um aplicativo usa um Cognito identity pool e grava notas em uma tabela DynamoDB cuja partition key é o id do usuário. Cada usuário só deve acessar os próprios itens. Qual condição usar na policy da role autenticada?
+ dynamodb:LeadingKeys igual a ${cognito-identity.amazonaws.com:sub}.
- aws:SourceIp com o IP do usuário.
- dynamodb:Attributes com a lista de colunas que pertencem a cada usuário do identity pool.
- aws:ResourceTag/usuario igual ao nome do usuário, marcando cada item da tabela com a tag do dono.
E: LeadingKeys restringe o acesso aos itens cuja partition key é igual ao identificador do usuário do identity pool. IP não identifica o usuário, itens não têm tags de recurso e Attributes limita colunas, não itens.

Q: Uma função tem permissão dynamodb:Query na tabela Pedidos, mas recebe AccessDenied ao consultar o GSI "por-cliente". Por quê?
+ A policy não inclui o ARN do índice (table/Pedidos/index/por-cliente ou table/Pedidos/index/*).
- GSIs só podem ser consultados pela conta raiz.
- GSIs só aceitam Scan.
- É preciso permissão dynamodb:DescribeTable, porque a Query consulta o esquema do índice antes de ler os itens.
E: Consultar um índice exige permissão no ARN do índice, separado do ARN da tabela. As demais afirmações são falsas.

Q: Uma empresa quer que desenvolvedores de cada projeto acessem só os recursos do próprio projeto, e que novos projetos não exijam alterar policies. Qual abordagem atende?
- Um usuário IAM por desenvolvedor com policies inline.
+ ABAC: comparar aws:PrincipalTag/projeto com aws:ResourceTag/projeto e controlar quem pode alterar tags.
- Uma role por projeto, com os ARNs de cada recurso listados na policy e atualizados a cada novo recurso criado.
- Uma SCP por projeto.
E: Com ABAC, a mesma policy vale para qualquer projeto que use as tags certas. RBAC com ARNs exige atualizar policies a cada projeto, policies inline não escalam e SCPs só limitam contas inteiras.

Q: Uma conta de desenvolvimento precisa garantir que ninguém, nem administradores, crie recursos fora de sa-east-1 e us-east-1. As contas estão no AWS Organizations. Qual é a forma mais adequada?
+ Uma SCP que nega ações quando aws:RequestedRegion não estiver na lista permitida.
- Remover as permissões de cada usuário individualmente.
- Uma bucket policy em todos os buckets.
- Uma permissions boundary em cada role e usuário com Allow apenas para as duas Regiões permitidas.
E: A SCP impõe um limite a todas as identidades da conta, inclusive administradores. Remover permissões uma a uma é frágil, boundaries teriam de ser aplicadas a cada identidade e não atingem as que não as têm, e bucket policies só valem para o S3.

Q: Uma equipe quer reduzir as permissões de uma role que tem s3:* e dynamodb:* para apenas o que a aplicação realmente usa nos últimos 90 dias. Qual recurso ajuda diretamente?
- AWS Trusted Advisor.
- AWS Config com uma regra de conformidade que remove automaticamente as permissões que a role não usou.
- Amazon Inspector.
+ IAM Access Analyzer, gerando uma policy a partir da atividade registrada no CloudTrail.
E: O Access Analyzer gera uma policy com base nas ações efetivamente registradas no CloudTrail, aproximando a role do menor privilégio. Trusted Advisor dá recomendações gerais, Config avalia configurações e Inspector procura vulnerabilidades.

Q: Uma permissions boundary de uma role permite apenas s3:* e dynamodb:*. A policy da role concede s3:GetObject e sqs:SendMessage. Quais ações a role pode executar?
- Nenhuma, porque a boundary substitui a policy.
- s3:GetObject e sqs:SendMessage.
+ Apenas s3:GetObject.
- s3:*, dynamodb:* e sqs:SendMessage.
E: A permissão efetiva é a interseção entre o que a policy concede e o que a boundary permite: s3:GetObject está nas duas; sqs:SendMessage fica fora da boundary; e dynamodb:* não foi concedido pela policy.

## Flashcards

F: Elementos de um statement de policy IAM
V: Sid, Effect (Allow/Deny), Action, Resource, Condition. Principal só em policies baseadas em recurso e trust policies. Version "2012-10-17".

F: Ordem de avaliação de permissões no IAM
V: Deny implícito por padrão → Deny explícito vence → precisa de um Allow → boundaries, SCPs e session policies limitam (interseção).

F: Acesso entre contas sem assumir role
V: Allow na identity policy da conta de origem e Allow na resource policy da conta dona do recurso.

F: Permissions boundary, SCP e session policy concedem permissões?
V: Não. Só definem o máximo permitido. A permissão efetiva é a interseção com as policies que concedem.

F: Para que serve iam:PassRole?
V: Permite associar uma role a um serviço (Lambda, ECS, EC2, CloudFormation). Restrinja o Resource e use iam:PassedToService.

F: Como restringir cada usuário aos próprios itens no DynamoDB?
V: Condição dynamodb:LeadingKeys igual ao id do usuário (ex.: ${cognito-identity.amazonaws.com:sub}).

F: RBAC vs. ABAC
V: RBAC: permissões por função de trabalho, recursos listados. ABAC: permissões comparando tags do principal e do recurso; escala sem mudar policies.

F: Como decodificar uma mensagem de autorização do EC2?
V: aws sts decode-authorization-message --encoded-message ..., com permissão sts:DecodeAuthorizationMessage.

F: Ferramentas para investigar e reduzir permissões
V: Policy Simulator (testar), CloudTrail (ver negações), Access Analyzer (gerar policy pela atividade, acesso externo, permissões não usadas) e last accessed.

F: Chaves de condição úteis
V: aws:SourceIp, aws:SecureTransport, aws:MultiFactorAuthPresent, aws:RequestedRegion, aws:PrincipalTag/ResourceTag/RequestTag, aws:SourceArn, aws:SourceAccount, aws:PrincipalOrgID.
