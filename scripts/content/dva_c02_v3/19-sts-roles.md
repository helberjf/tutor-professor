# 19. STS e roles: credenciais temporárias, trust policy e acesso entre contas

## Mapa da aula
Roles e o AWS STS são a base de "credenciais temporárias", expressão que aparece em muitas respostas corretas. Nesta aula:

• as duas policies de uma role: trust policy e permissions policy;
• as APIs do STS: AssumeRole, AssumeRoleWithWebIdentity, AssumeRoleWithSAML e GetSessionToken;
• duração da sessão e role chaining;
• acesso entre contas passo a passo;
• ExternalId para terceiros e MFA ao assumir roles;
• perfis de role na CLI e federação OIDC para pipelines;
• revogar sessões e rastrear quem assumiu a role.

## As duas partes de uma role
Uma role tem duas policies com papéis diferentes:

• Trust policy (política de confiança): diz quem pode assumir a role. É uma policy baseada em recurso, com Principal. Exemplos de principal: uma conta (arn:aws:iam::111122223333:root), uma role específica, um serviço (lambda.amazonaws.com, ecs-tasks.amazonaws.com) ou um provedor federado (Cognito, OIDC, SAML).
• Permissions policy: diz o que a role pode fazer depois de assumida.

Assumir uma role exige as duas coisas: a trust policy da role precisa confiar em quem chama, e quem chama precisa de permissão sts:AssumeRole para o ARN da role (exceto serviços AWS, que são autorizados pela trust policy).

Quando a trust policy confia em arn:aws:iam::CONTA:root, ela delega à conta: qualquer identidade daquela conta que tenha sts:AssumeRole na sua policy pode assumir. Para restringir, coloque o ARN de uma role específica.

## AssumeRole e as credenciais devolvidas
AssumeRole devolve credenciais temporárias:
• AccessKeyId, SecretAccessKey e SessionToken (os três são necessários);
• Expiration (quando deixam de valer).

Parâmetros principais:
• RoleArn: a role a assumir;
• RoleSessionName: um nome para a sessão, que aparece no CloudTrail (use o usuário ou o job);
• DurationSeconds: de 900 segundos (15 minutos) até a duração máxima da role (MaxSessionDuration, de 1 a 12 horas; padrão 1 hora);
• Policy ou PolicyArns: session policies para restringir a sessão;
• SerialNumber e TokenCode: quando a trust policy exige MFA;
• ExternalId: quando a trust policy exige.

```typescript
import { S3Client } from "@aws-sdk/client-s3";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";

// Forma manual: chamar AssumeRole e montar as credenciais (as três partes).
const { Credentials } = await new STSClient({}).send(new AssumeRoleCommand({
  RoleArn: "arn:aws:iam::444455556666:role/LeitorRelatorios",
  RoleSessionName: "job-relatorios-2026-10-23",
  DurationSeconds: 3600,
}));
const s3ContaB = new S3Client({
  credentials: {
    accessKeyId: Credentials!.AccessKeyId!,
    secretAccessKey: Credentials!.SecretAccessKey!,
    sessionToken: Credentials!.SessionToken!,
    expiration: Credentials!.Expiration,
  },
});

// Forma recomendada: o provider assume a role e renova antes de expirar.
const s3Renovavel = new S3Client({
  credentials: fromTemporaryCredentials({
    params: { RoleArn: "arn:aws:iam::444455556666:role/LeitorRelatorios", RoleSessionName: "job-relatorios" },
  }),
});
```

## Outras APIs do STS
• AssumeRoleWithWebIdentity: troca um token OIDC (de um provedor web, do GitHub Actions, de uma conta de serviço do EKS) por credenciais da role. Não exige credenciais AWS de quem chama. Para aplicativos móveis e web com login social, a recomendação é usar o Cognito identity pool, que faz essa troca por você (aula 20).
• AssumeRoleWithSAML: troca uma asserção SAML de um provedor corporativo (Active Directory, Okta) por credenciais da role.
• GetSessionToken: um usuário IAM obtém credenciais temporárias, normalmente para usar MFA em chamadas de API que exigem MFA. Duração de até 36 horas.
• GetFederationToken: forma antiga de federação para usuários sem identidade IAM.
• GetCallerIdentity e DecodeAuthorizationMessage, vistos nas aulas 02 e 18.

O STS tem endpoints regionais (sts.sa-east-1.amazonaws.com), recomendados em vez do endpoint global, por latência e disponibilidade.

## Duração da sessão e role chaining
• A sessão termina em Expiration. Os SDKs renovam automaticamente credenciais de roles que eles mesmos assumem (perfis com role_arn, roles de Lambda, EC2 e ECS). Se o seu código chamou AssumeRole manualmente, ele precisa chamar de novo antes de expirar.
• Role chaining: usar credenciais de uma role para assumir outra role. Nesse caso, a sessão da segunda role dura no máximo 1 hora, independentemente da duração máxima configurada.

Na prova: "o job assume a role A e, com ela, a role B; mesmo com MaxSessionDuration de 12 horas, as credenciais expiram em 1 hora" → limite de role chaining.

## Acesso entre contas, passo a passo
Cenário: uma aplicação na conta A (111122223333) precisa ler uma tabela DynamoDB na conta B (444455556666).

Na conta B:
1. Crie a role LeitorPedidos.
2. Trust policy: Principal com o ARN da role da aplicação na conta A (ou a conta A).
3. Permissions policy: dynamodb:GetItem e dynamodb:Query na tabela.

Na conta A:
4. A role da aplicação recebe sts:AssumeRole com Resource arn:aws:iam::444455556666:role/LeitorPedidos.

Na aplicação:
5. Chama AssumeRole, recebe credenciais temporárias e cria o client do DynamoDB com elas.

Vantagens sobre liberar o acesso direto por resource policy: funciona com qualquer serviço (nem todos têm resource policy), centraliza as permissões na conta dona dos dados e cada acesso aparece no CloudTrail da conta B com o nome da sessão.

## ExternalId: proteção contra o confused deputy
Quando um fornecedor (uma ferramenta de monitoramento, por exemplo) acessa as contas de muitos clientes assumindo roles, existe um risco: um cliente malicioso poderia informar ao fornecedor o ARN da role de outro cliente. O fornecedor, que tem permissão para assumir roles em muitas contas, seria enganado a acessar a conta errada (confused deputy).

Solução: cada cliente recebe do fornecedor um ExternalId único, e a trust policy da role exige esse valor:
"Condition": {"StringEquals": {"sts:ExternalId": "cliente-8842"}}

O fornecedor sempre envia o ExternalId do cliente que está atendendo no AssumeRole. Um ARN de outro cliente não funciona com o ExternalId errado.

O ExternalId não é uma senha: ele identifica o cliente na relação com o fornecedor.

Para serviços AWS que agem em seu nome (S3 chamando Lambda, SNS publicando em SQS), a proteção equivalente é usar aws:SourceArn e aws:SourceAccount nas policies.

## MFA ao assumir uma role
Para roles sensíveis (administração de produção), exija MFA na trust policy:
"Condition": {"Bool": {"aws:MultiFactorAuthPresent": "true"}}

Quem assume precisa enviar SerialNumber (o ARN do dispositivo MFA) e TokenCode (o código atual) no AssumeRole. A CLI faz isso com mfa_serial no perfil e pede o código.

Pode-se também limitar a idade da autenticação MFA com aws:MultiFactorAuthAge.

## Perfis de role na CLI e no SDK
No arquivo ~/.aws/config, um perfil pode assumir uma role automaticamente a partir de outro perfil:

```ini
[profile dev]
sso_session = empresa
sso_account_id = 111122223333
sso_role_name = Desenvolvedor
region = sa-east-1

[profile prod-leitura]
role_arn = arn:aws:iam::444455556666:role/LeituraProducao
source_profile = dev
mfa_serial = arn:aws:iam::111122223333:mfa/maria
duration_seconds = 3600
```

## Federação OIDC para pipelines
Pipelines de CI/CD fora da AWS (como o GitHub Actions) não devem guardar chaves de acesso como segredo do repositório. O padrão recomendado:

1. Na conta AWS, crie um provedor de identidade OIDC para o emissor do pipeline (token.actions.githubusercontent.com).
2. Crie uma role cuja trust policy confia nesse provedor federado e tem condições sobre o token, como o repositório e a branch (claim sub), e o público (aud).
3. O job do pipeline obtém um token OIDC e chama AssumeRoleWithWebIdentity, recebendo credenciais temporárias.

Assim, não existe chave de longo prazo para vazar, e cada execução tem credenciais curtas e restritas.

No EKS, o mesmo mecanismo dá roles a pods (IRSA ou EKS Pod Identity).

## Revogar sessões e rastrear acessos
Mudanças na permissions policy de uma role valem já nas próximas requisições, inclusive das sessões abertas. Mas a sessão em si continua válida até expirar. Se as credenciais vazaram, use "Revoke active sessions" na role: o IAM adiciona uma policy que nega tudo para sessões emitidas antes daquele instante (condição aws:TokenIssueTime).

Rastreamento no CloudTrail:
• o evento AssumeRole registra quem assumiu, qual role e o RoleSessionName;
• as ações seguintes aparecem com o ARN da sessão (assumed-role/NomeDaRole/NomeDaSessao);
• session tags e source identity propagam atributos de quem originou o acesso, úteis em auditoria e ABAC.

## Pegadinhas frequentes
• Assumir role exige trust policy confiando em quem chama e sts:AssumeRole em quem chama.
• Credenciais temporárias têm três partes; esquecer o SessionToken gera erro de token inválido.
• Role chaining limita a sessão a 1 hora.
• DurationSeconds mínimo de 15 minutos; máximo de 12 horas (se a role permitir).
• ExternalId é para terceiros que acessam muitas contas.
• GetSessionToken é para usuário IAM com MFA, não para trocar de conta.
• Pipelines externos: OIDC + AssumeRoleWithWebIdentity, sem chaves guardadas.

## Resumo para revisão
• Role = trust policy (quem assume) + permissions policy (o que faz).
• AssumeRole: credenciais com AccessKeyId, SecretAccessKey, SessionToken e Expiration; 15 min a 12 h (padrão 1 h).
• AssumeRoleWithWebIdentity (OIDC), AssumeRoleWithSAML (SAML), GetSessionToken (MFA de usuário IAM, até 36 h).
• Role chaining: no máximo 1 h.
• Entre contas: role na conta do recurso confiando na origem + sts:AssumeRole na origem.
• ExternalId (sts:ExternalId) contra confused deputy; aws:SourceArn/SourceAccount para serviços.
• MFA: aws:MultiFactorAuthPresent; SerialNumber e TokenCode.
• Revoke active sessions usa aws:TokenIssueTime. CloudTrail mostra RoleSessionName.

## Questões

Q: Uma aplicação na conta A precisa gravar mensagens em várias filas SQS e tabelas DynamoDB na conta B. A equipe quer centralizar as permissões na conta B e auditar cada acesso. Qual é a abordagem recomendada?
- Adicionar a conta A a uma SCP da conta B.
- Compartilhar a senha do usuário raiz da conta B.
- Criar um usuário IAM na conta B e guardar as chaves na aplicação.
+ Uma role na conta B com trust para a role da aplicação na conta A, que recebe sts:AssumeRole nessa role.
E: A aplicação assume a role da conta B e recebe credenciais temporárias, e o CloudTrail da conta B registra cada sessão. Chaves de longo prazo são um risco, SCPs não concedem permissões e compartilhar o usuário raiz é inaceitável.

Q: Uma aplicação tenta assumir uma role em outra conta e recebe AccessDenied. A role da aplicação tem sts:AssumeRole para o ARN correto. O que mais pode estar faltando?
- A permissions policy da role de destino precisa ter sts:AssumeRole.
- A aplicação precisa estar na mesma Região da role.
- A role de destino precisa ter MaxSessionDuration de 12 horas.
+ A trust policy da role de destino precisa ter como Principal a role (ou a conta) da aplicação.
E: Assumir uma role exige que quem chama tenha permissão e que a trust policy da role confie em quem chama. A permissions policy define o que a role faz depois de assumida; IAM é global; e a duração não afeta a autorização.

Q: Um job assume a role A e, com essas credenciais, assume a role B, que tem MaxSessionDuration de 8 horas. As credenciais da role B expiram em 1 hora. Por quê?
- O DurationSeconds máximo do STS é 1 hora para qualquer AssumeRole, mesmo sem encadeamento.
- A duração de qualquer role é sempre 1 hora, independentemente do MaxSessionDuration configurado.
- A role A precisa de MFA.
+ Em role chaining, a sessão da segunda role é limitada a 1 hora.
E: Quando uma role é assumida com credenciais de outra role, a sessão fica limitada a 1 hora. Fora disso, a duração pode ir até o máximo configurado na role (até 12 horas), e MFA não muda a duração.

Q: Uma empresa SaaS de monitoramento acessa contas de centenas de clientes assumindo uma role em cada uma. Qual configuração protege cada cliente de ter sua role usada indevidamente a pedido de outro cliente?
- Usar uma role com o mesmo nome em todas as contas, para que o fornecedor só consiga assumir roles com esse nome.
+ Exigir na trust policy de cada cliente sts:ExternalId com um valor único daquele cliente.
- Pedir que cada cliente compartilhe as chaves de acesso de um usuário IAM com permissões só de leitura.
- Exigir aws:SourceIp do fornecedor.
E: O ExternalId único impede o confused deputy: um ARN de outro cliente não funciona sem o ExternalId certo. Chaves compartilhadas são um risco, nomes iguais não protegem nada e o IP do fornecedor é o mesmo para todos os clientes.

Q: Um pipeline no GitHub Actions faz deploy na AWS usando uma chave de acesso guardada como segredo do repositório. A equipe de segurança quer eliminar chaves de longo prazo. Qual é a solução?
- Usar GetSessionToken no pipeline.
- Guardar a chave no Secrets Manager com rotação automática e lê-la no início de cada execução do pipeline de deploy.
+ Provedor OIDC do GitHub na conta, role com trust para o repositório e AssumeRoleWithWebIdentity no job.
- Rotacionar a chave semanalmente.
E: Com OIDC, o job troca um token de curta duração por credenciais temporárias da role, com condições sobre repositório e branch, sem chave guardada. Rotação e Secrets Manager mantêm uma chave de longo prazo; GetSessionToken exige credenciais de um usuário IAM.

Q: Uma role administrativa de produção só deve ser assumida por quem se autenticou com MFA. Qual condição colocar na trust policy?
- aws:SecureTransport igual a true.
- aws:RequestedRegion igual à Região de produção.
+ aws:MultiFactorAuthPresent igual a true.
- sts:ExternalId com o número do dispositivo.
E: A condição aws:MultiFactorAuthPresent exige uma sessão autenticada com MFA, e quem assume envia SerialNumber e TokenCode. HTTPS, ExternalId e Região não verificam MFA.

Q: Um código assume uma role e cria o client do S3 passando apenas AccessKeyId e SecretAccessKey das credenciais devolvidas. As chamadas falham com "The security token included in the request is invalid". O que corrigir?
- Esperar alguns minutos pela propagação das credenciais novas para todas as Regiões.
- Usar o endpoint global do STS.
- Pedir DurationSeconds maior.
+ Passar também o SessionToken ao criar o client.
E: Credenciais temporárias são formadas por chave, segredo e token de sessão; sem o token, a assinatura é rejeitada. Duração e endpoint do STS não resolvem a falta do token.

Q: As credenciais temporárias de uma role vazaram em um log. A equipe precisa invalidá-las imediatamente sem apagar a role. O que fazer?
- Apagar o log.
+ Usar "Revoke active sessions" na role, que nega as sessões emitidas antes daquele momento.
- Rotacionar as chaves do usuário raiz.
- Reduzir o MaxSessionDuration para 1 hora, o que encerra na hora as sessões abertas com duração maior.
E: A revogação adiciona uma policy com Deny para tokens emitidos antes do instante da revogação (aws:TokenIssueTime). Apagar o log não invalida credenciais, reduzir a duração vale só para novas sessões e o usuário raiz não tem relação com a sessão da role.

Q: Um usuário IAM precisa chamar APIs protegidas por uma policy que exige aws:MultiFactorAuthPresent, usando a CLI com sua chave de acesso. Qual API do STS ele usa para obter credenciais com MFA?
- AssumeRoleWithSAML.
- GetCallerIdentity.
+ GetSessionToken, informando SerialNumber e TokenCode.
- AssumeRoleWithWebIdentity, passando o código MFA como token de identidade.
E: GetSessionToken devolve credenciais temporárias associadas à autenticação MFA do próprio usuário IAM. As APIs de federação SAML e OIDC são para provedores externos, e GetCallerIdentity só informa quem está chamando.

Q: Na auditoria, a equipe quer saber qual job assumiu uma role compartilhada por vários processos. O que facilita essa identificação no CloudTrail?
- Aumentar a duração da sessão.
+ Definir um RoleSessionName específico de cada job ao chamar AssumeRole.
- Usar a mesma RoleSessionName em todos os jobs e filtrar o CloudTrail pelo horário de cada execução.
- Desativar o endpoint regional do STS.
E: O RoleSessionName aparece no evento AssumeRole e no ARN da sessão nas ações seguintes, identificando o job. Um nome igual para todos esconde a origem, e duração e endpoint não ajudam na auditoria.

## Flashcards

F: Trust policy vs. permissions policy de uma role
V: Trust policy: quem pode assumir (Principal). Permissions policy: o que a role pode fazer depois de assumida.

F: O que AssumeRole devolve?
V: AccessKeyId, SecretAccessKey, SessionToken e Expiration. Os três primeiros são necessários para assinar.

F: Duração de sessão do AssumeRole
V: De 900 s (15 min) até o MaxSessionDuration da role (1 a 12 h; padrão 1 h). Em role chaining, no máximo 1 h.

F: APIs de federação do STS
V: AssumeRoleWithWebIdentity (tokens OIDC: GitHub Actions, EKS, provedores web) e AssumeRoleWithSAML (IdP corporativo).

F: Para que serve GetSessionToken?
V: Para um usuário IAM obter credenciais temporárias com MFA (SerialNumber + TokenCode), válidas até 36 h.

F: Passos de acesso entre contas com role
V: Conta B: role com trust para a conta/role de A e permissões no recurso. Conta A: sts:AssumeRole no ARN da role. Aplicação: AssumeRole e usa as credenciais.

F: O que é ExternalId?
V: Valor exigido na trust policy (sts:ExternalId) para terceiros que assumem roles em muitas contas; evita o confused deputy.

F: Como exigir MFA para assumir uma role?
V: Trust policy com aws:MultiFactorAuthPresent = true; quem assume envia SerialNumber e TokenCode.

F: Como pipelines externos devem acessar a AWS?
V: Federação OIDC: provedor OIDC na conta, role com trust para o repositório/branch e AssumeRoleWithWebIdentity no job, sem chaves guardadas.

F: Como invalidar sessões de uma role que vazaram?
V: Revoke active sessions: policy de Deny para tokens emitidos antes do momento (aws:TokenIssueTime).
