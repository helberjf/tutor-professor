# 20. Cognito: user pools, identity pools, tokens e autorização de APIs

## Mapa da aula
Amazon Cognito cuida dos usuários finais das suas aplicações (não dos funcionários que acessam a conta AWS). A prova cobra principalmente a diferença entre seus dois componentes. Nesta aula:

• user pool: cadastro, login, MFA, federação, grupos e gatilhos Lambda;
• os três tokens: ID, access e refresh, e como validar um JWT;
• identity pool: trocar uma identidade por credenciais AWS temporárias;
• roles autenticada e não autenticada e variáveis de policy por usuário;
• integração com API Gateway, ALB e AppSync;
• como escolher entre user pool e identity pool.

## User pool: o diretório de usuários
Um user pool é um diretório de usuários gerenciado que faz autenticação: cadastro (sign-up), login (sign-in), verificação de e-mail ou telefone, recuperação de senha e políticas de senha.

Recursos que caem na prova:
• MFA por SMS, e-mail ou aplicativo autenticador (TOTP), opcional ou obrigatório;
• login com provedores sociais (Google, Facebook, Apple, Amazon) e corporativos (SAML e OIDC): o usuário federado também vira um usuário do pool;
• páginas de login prontas (managed login / hosted UI) com fluxos OAuth 2.0, como authorization code com PKCE;
• app clients: cada aplicação tem um client id; aplicações de servidor podem ter client secret;
• grupos: organizam usuários (admin, cliente) e aparecem no token na claim cognito:groups;
• atributos customizados (custom:plano);
• proteção contra ameaças: autenticação adaptativa e detecção de credenciais vazadas.

O resultado do login em um user pool são tokens JWT. Eles provam quem é o usuário para a sua aplicação e para as suas APIs, mas não são credenciais AWS.

## Gatilhos Lambda do user pool
O user pool pode chamar funções Lambda em momentos do fluxo:

• Pre sign-up: validar ou rejeitar um cadastro (aceitar só e-mails de um domínio) ou confirmar automaticamente.
• Post confirmation: depois da confirmação, criar o perfil do usuário no DynamoDB ou enviar boas-vindas.
• Pre authentication e Post authentication: verificações antes do login e registro depois dele.
• Pre token generation: acrescentar, alterar ou remover claims dos tokens (por exemplo, incluir o tenant do usuário).
• Custom message: personalizar e-mails e SMS de verificação.
• Define, Create e Verify auth challenge: fluxos de autenticação customizados (código por e-mail, CAPTCHA, login sem senha).
• User migration: migrar usuários de um sistema antigo no primeiro login, validando a senha antiga.

Na prova: "copiar usuários de um diretório legado sem forçar troca de senha" → gatilho User migration. "Incluir uma claim personalizada no token" → Pre token generation.

## Os três tokens
Depois do login, o user pool devolve:

• ID token: um JWT com informações de identidade do usuário (sub, email, nome, cognito:groups). A claim aud é o client id. Usado pela aplicação para saber quem está logado.
• Access token: um JWT para autorizar chamadas a APIs, com os escopos OAuth (scope) e a claim client_id. Também é usado nas APIs do próprio user pool (por exemplo, alterar atributos do usuário).
• Refresh token: usado para obter novos ID e access tokens sem pedir a senha de novo.

Validades padrão: ID e access tokens valem 1 hora (configurável de 5 minutos a 1 dia); o refresh token vale 30 dias por padrão (configurável).

Um token é um JWT: cabeçalho, conteúdo (claims) e assinatura, em base64url. Qualquer pessoa pode ler as claims; o que garante a integridade é a assinatura. Nunca coloque segredos em claims.

## Como validar um JWT do Cognito
Se o seu backend recebe o token diretamente (sem um autorizador do API Gateway que já faça isso), valide:

1. A assinatura, com as chaves públicas do pool em https://cognito-idp.REGIAO.amazonaws.com/ID_DO_POOL/.well-known/jwks.json, escolhendo a chave pelo kid do cabeçalho.
2. A expiração (exp).
3. O emissor (iss) igual à URL do seu user pool.
4. O tipo do token (token_use igual a id ou access, conforme o que você espera).
5. O público: aud (ID token) ou client_id (access token) igual ao seu app client.

Bibliotecas prontas (como aws-jwt-verify, em JavaScript) fazem essas verificações e guardam as chaves em cache.

Depois de validado, use a claim sub como identificador do usuário. Decisões de autorização (o usuário é dono deste pedido?) continuam sendo do backend.

## Identity pool: credenciais AWS para o usuário
Um identity pool (federated identities) troca uma identidade por credenciais AWS temporárias, usando o STS. Assim, o aplicativo móvel ou web chama serviços AWS diretamente: envia fotos ao S3, grava no DynamoDB, publica no IoT.

Identidades aceitas:
• tokens de um user pool do Cognito;
• provedores sociais (Google, Facebook, Apple, Amazon);
• provedores SAML e OIDC;
• identidades desenvolvidas pela sua própria autenticação (developer authenticated identities);
• visitantes não autenticados (guest), se você permitir.

Cada identidade recebe um identity id único (no formato regiao:uuid), usado nas policies como ${cognito-identity.amazonaws.com:sub}.

## Roles autenticada e não autenticada
O identity pool tem duas roles principais:

• Role autenticada: para usuários que fizeram login. Permissões do que um usuário comum pode fazer.
• Role não autenticada: para visitantes (se habilitado). Deve ter permissões mínimas, como ler um catálogo público.

Para dar permissões diferentes conforme o usuário:
• role mapping por regras: escolhe a role conforme claims do token (por exemplo, custom:plano = premium);
• role baseada no token: usa os grupos do user pool (cada grupo pode ter uma role IAM, e o token indica a role preferida).

Variáveis de policy restringem cada usuário aos próprios recursos:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": "arn:aws:s3:::fotos-app/usuarios/${cognito-identity.amazonaws.com:sub}/*"
  }]
}
```

## User pool ou identity pool?
A pergunta da prova quase sempre se resolve assim:

• "Usuários precisam se cadastrar e fazer login no aplicativo" → user pool.
• "A API precisa saber quem é o usuário e validar o token" → user pool (com autorizador Cognito ou JWT no API Gateway).
• "O aplicativo precisa acessar serviços AWS diretamente (S3, DynamoDB) com credenciais temporárias" → identity pool.
• "Visitantes sem login podem ver parte do conteúdo vindo direto do S3" → identity pool com acesso não autenticado.
• "Login social e depois upload direto para o S3" → user pool (ou provedor social) para autenticar + identity pool para obter credenciais AWS.

Nunca embuta chaves de acesso de um usuário IAM em um aplicativo móvel ou web. O identity pool existe exatamente para isso.

## Integração com API Gateway, ALB e AppSync
• API Gateway REST: autorizador Cognito user pool, que valida o token no header Authorization; com o access token, pode exigir escopos por método.
• API Gateway HTTP API: autorizador JWT configurado com o emissor do user pool e o client id como audience.
• Application Load Balancer: a regra do listener HTTPS pode ter a ação authenticate-cognito (ou authenticate-oidc). O ALB redireciona para o login, valida a sessão e repassa a requisição ao alvo com headers contendo as claims do usuário (x-amzn-oidc-data). Ótimo para proteger uma aplicação web em EC2 ou ECS sem mudar o código de login.
• AppSync: modo de autorização Cognito user pools, com regras por grupo no schema.
• Chamadas com IAM: usuários do identity pool podem chamar APIs com autorização IAM (SigV4) usando as credenciais temporárias.

O Cognito Sync, antigo recurso de sincronização de dados, foi substituído pelo AppSync.

## Pegadinhas frequentes
• Token do user pool não é credencial AWS; para chamar S3 ou DynamoDB diretamente, use identity pool.
• ID token para identidade; access token para autorizar APIs e escopos.
• Claims de JWT são legíveis por qualquer um; segurança está na assinatura.
• Valide iss, exp, token_use e aud/client_id além da assinatura.
• Role não autenticada deve ter permissões mínimas.
• User migration: migrar usuários no primeiro login. Pre token generation: alterar claims.
• ALB pode autenticar com Cognito sem código na aplicação.

## Resumo para revisão
• User pool: autenticação de usuários finais, MFA, social/SAML/OIDC, managed login, app clients, grupos, gatilhos Lambda.
• Tokens: ID (identidade, aud = client id), access (escopos, client_id), refresh (renovação; padrão 30 dias). ID e access: 1 h por padrão.
• Validar JWT: assinatura (JWKS), exp, iss, token_use, aud/client_id.
• Identity pool: troca identidade por credenciais AWS temporárias (STS); roles autenticada e não autenticada; role mapping.
• Variável ${cognito-identity.amazonaws.com:sub} para recursos por usuário.
• API Gateway (autorizador Cognito/JWT), ALB (authenticate-cognito), AppSync.

## Questões

Q: Um aplicativo móvel precisa que os usuários façam login com e-mail e senha e, depois, enviem fotos diretamente para um bucket S3, cada um na sua pasta. Qual combinação atende?
- Apenas um user pool, usando o ID token para assinar as requisições ao S3.
- Um usuário IAM por cliente, com as chaves salvas no aplicativo.
+ User pool para o login e identity pool para obter credenciais temporárias, com policy por ${cognito-identity.amazonaws.com:sub}.
- Uma API key do API Gateway para cada usuário.
E: O user pool autentica e o identity pool entrega credenciais temporárias limitadas à pasta do usuário. O ID token não assina requisições AWS; chaves IAM em aplicativos são inseguras; e API keys não autenticam nem acessam o S3.

Q: Uma API REST no API Gateway deve aceitar apenas usuários logados em um user pool e, no método POST /admin, apenas tokens com o escopo "admin/escrita". O que configurar?
+ Um autorizador Cognito user pool, exigindo o escopo no método e usando o access token.
- Autorização IAM com o identity pool.
- Uma API key com usage plan.
- Um autorizador Lambda que lê o ID token.
E: O autorizador Cognito valida o token e, com access tokens, permite exigir escopos OAuth por método. O ID token não carrega escopos, IAM exige credenciais AWS e API key não identifica o usuário.

Q: Um backend recebe um JWT do Cognito e apenas decodifica o conteúdo em base64 para ler o email. Qual é o problema?
+ Sem validar assinatura, iss, exp, token_use e aud/client_id, qualquer um pode forjar um token com outro email.
- O email não existe no ID token.
- Nenhum; o base64 garante que o token não foi alterado, porque qualquer mudança torna a decodificação do conteúdo inválida.
- JWTs do Cognito são criptografados com a chave do pool e não podem ser lidos sem antes descriptografar com o KMS.
E: As claims de um JWT são legíveis e alteráveis; o que garante a autenticidade é a assinatura, verificada com as chaves públicas (JWKS) do pool, junto com as claims de emissor, validade, tipo e público. Base64 é só codificação.

Q: Uma empresa vai migrar 200 mil usuários de um sistema legado para um user pool e não quer obrigá-los a redefinir a senha. Qual recurso usar?
- Importar um CSV com os usuários e as senhas em texto puro, que o Cognito converte para hash na importação.
+ Gatilho User migration: valida a senha no sistema antigo no primeiro login e cria o usuário no pool.
- Gatilho Pre token generation.
- Um identity pool com acesso não autenticado, que aceita os usuários antigos até eles criarem uma senha nova.
E: O gatilho User migration autentica o usuário no sistema antigo e o cria no pool de forma transparente. Importação em lote não traz senhas, Pre token generation altera claims e identity pools não armazenam usuários.

Q: O backend precisa receber o identificador do cliente (tenant) do usuário em cada token, a partir de uma tabela interna, sem chamadas extras da aplicação. Qual gatilho usar?
- Pre sign-up.
+ Pre token generation.
- Post confirmation, que roda a cada login.
- Custom message.
E: Pre token generation roda antes da emissão dos tokens e pode acrescentar claims. Post confirmation roda uma vez após a confirmação, Custom message personaliza mensagens e Pre sign-up roda no cadastro.

Q: Um site de receitas quer que visitantes sem login vejam fotos públicas guardadas no S3 pelo aplicativo, usando credenciais AWS de permissões mínimas. O que configurar?
- Deixar o bucket inteiro público com leitura e escrita liberadas, para que o aplicativo não precise de credenciais.
- Um usuário IAM compartilhado embutido no aplicativo.
- Um user pool com MFA obrigatório.
+ Identity pool com acesso não autenticado e role não autenticada só com s3:GetObject no prefixo público.
E: O identity pool emite credenciais temporárias para visitantes com a role não autenticada, limitada ao necessário. Bucket público com escrita é perigoso, user pool exige login e um usuário IAM embutido expõe chaves de longo prazo.

Q: Uma aplicação web em ECS atrás de um ALB precisa exigir login de usuários do Cognito sem alterar o código da aplicação. Qual é a solução?
- Um autorizador Lambda no ALB.
- Um identity pool com role não autenticada.
+ A ação authenticate-cognito na regra do listener HTTPS do ALB.
- Um security group no ALB que libera apenas as conexões de usuários logados no user pool.
E: O ALB autentica com Cognito antes de encaminhar a requisição e passa as claims em headers para a aplicação. ALB não tem autorizador Lambda; identity pool entrega credenciais AWS, não protege a aplicação web; e security groups filtram rede, não usuários.

Q: Usuários do grupo "premium" de um user pool devem receber, via identity pool, credenciais com permissões maiores que os demais usuários autenticados. Como configurar?
- Criar um identity pool separado para cada usuário premium.
- Colocar as permissões extras na role não autenticada.
- Usar a mesma role para todos e deixar que uma bucket policy do S3 valide o plano de cada usuário pela claim.
+ Associar uma role IAM ao grupo premium e escolher a role pelo token (ou por regra de role mapping).
E: O identity pool pode escolher a role pela informação de grupo no token ou por regras sobre claims. Um pool por usuário não escala, a role não autenticada é para visitantes e o S3 não valida o plano do usuário.

Q: Qual afirmação sobre os tokens do user pool está correta?
+ O access token carrega escopos para autorizar APIs; o ID token traz dados de identidade do usuário.
- O refresh token é usado para chamar APIs protegidas.
- O ID token contém credenciais AWS temporárias.
- ID, access e refresh tokens são válidos por 30 dias por padrão, renovados automaticamente pelo aplicativo.
E: Access tokens autorizam chamadas a APIs (com escopos) e ID tokens descrevem o usuário. O refresh token só obtém novos tokens; credenciais AWS vêm do identity pool; e ID e access tokens valem 1 hora por padrão (30 dias é o padrão do refresh token).

Q: Um aplicativo exige login social com Google e precisa saber quem é o usuário nas APIs da empresa, sem acessar serviços AWS diretamente. Qual é o componente essencial?
- Um identity pool com o Google como provedor.
- Uma role IAM com trust para accounts.google.com, assumida diretamente pelo aplicativo com o token do Google.
- Um usuário IAM para cada usuário do Google.
+ Um user pool com o Google como provedor de identidade federado, emitindo tokens para a aplicação.
E: O user pool federa o login social e emite tokens JWT que as APIs validam. O identity pool seria necessário só para obter credenciais AWS; roles e usuários IAM não gerenciam login de usuários finais.

## Flashcards

F: User pool vs. identity pool
V: User pool: autenticação de usuários finais (cadastro, login, MFA, federação) e emissão de JWTs. Identity pool: troca identidades por credenciais AWS temporárias para acessar serviços diretamente.

F: Os três tokens do user pool
V: ID token (identidade, claims como email e cognito:groups), access token (escopos, autorizar APIs) e refresh token (obter novos tokens).

F: Validades padrão dos tokens do Cognito
V: ID e access: 1 hora (5 min a 1 dia). Refresh: 30 dias por padrão (configurável).

F: Como validar um JWT do Cognito?
V: Assinatura com o JWKS do pool (kid), exp, iss (URL do pool), token_use e aud (ID) ou client_id (access).

F: Gatilhos Lambda importantes do user pool
V: Pre sign-up, Post confirmation, Pre/Post authentication, Pre token generation (claims), Custom message, auth challenges e User migration.

F: Roles do identity pool
V: Role autenticada (usuários logados) e role não autenticada (visitantes, permissões mínimas). Role mapping por regras ou por grupos no token.

F: Variável de policy do identity pool
V: ${cognito-identity.amazonaws.com:sub}: o identity id do usuário, usado para limitar prefixos no S3 ou itens no DynamoDB.

F: Como o ALB usa o Cognito?
V: Ação authenticate-cognito no listener HTTPS: autentica antes de encaminhar e repassa as claims em headers (x-amzn-oidc-data).

F: Autorizadores do API Gateway para Cognito
V: REST: autorizador Cognito user pool (escopos com access token). HTTP API: autorizador JWT com issuer e audience do pool.

F: Pode-se embutir chaves IAM em um app móvel?
V: Não. Use Cognito identity pool para obter credenciais temporárias por usuário.
