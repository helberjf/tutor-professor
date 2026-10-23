# 27. CodeBuild, CodePipeline e CodeCommit: CI/CD na AWS

## Mapa da aula
Esta aula cobre a esteira de integração e entrega contínua com os serviços da AWS:

• CodeBuild: o buildspec, fases, variáveis, segredos, artefatos, cache, relatórios e logs;
• builds dentro de VPC, imagens Docker e a service role;
• CodePipeline: estágios, ações, artefatos, runOrder, aprovação manual e gatilhos;
• implantação com CloudFormation no pipeline, ações entre Regiões e contas;
• CodeCommit e conexões com GitHub e Bitbucket;
• ferramentas de qualidade: Amazon Q Developer e Amazon CodeGuru.

## CodeBuild: o que é
O AWS CodeBuild compila código, roda testes e gera artefatos em contêineres gerenciados, cobrando pelo tempo de build. Não há servidor de build para manter.

Um projeto do CodeBuild define:
• a origem (CodeCommit, GitHub, Bitbucket, S3 ou o pipeline);
• o ambiente: imagem gerenciada pela AWS (Amazon Linux, Ubuntu, Windows) ou imagem própria do ECR ou Docker Hub, tipo e tamanho de computação;
• a service role, com as permissões que o build precisa (ler o S3, enviar imagens ao ECR, ler parâmetros, gravar logs);
• o arquivo de instruções: buildspec.yml na raiz do repositório (ou outro nome/caminho, ou inline no projeto);
• timeout (padrão de 60 minutos), logs e configurações de VPC e cache.

## O buildspec
O buildspec.yml (version: 0.2) descreve o build:

• env: variables (texto simples), parameter-store (valores do Parameter Store), secrets-manager (valores do Secrets Manager) e exported-variables (para o pipeline usar depois);
• phases, executadas em ordem: install (instalar ferramentas; runtime-versions escolhe a versão da linguagem), pre_build (login no ECR, baixar dependências), build (compilar, testar) e post_build (empacotar, enviar imagem). Cada fase tem commands e pode ter finally;
• artifacts: quais arquivos vão para o S3 ou para o próximo estágio (files, base-directory, discard-paths, name e artefatos secundários);
• cache: caminhos a guardar entre builds (dependências), no S3 ou localmente;
• reports: relatórios de testes (JUnit, Cucumber, TestNG...) e de cobertura, exibidos no console.

Se um comando termina com código de erro, a fase falha, a build termina com status de falha e o pipeline para nessa ação.

```yaml
version: 0.2
env:
  variables:
    AMBIENTE: "homolog"
  parameter-store:
    URL_API: /pedidos/homolog/url-api
  secrets-manager:
    NPM_TOKEN: prod/npm:token
phases:
  install:
    runtime-versions:
      nodejs: 22
  pre_build:
    commands:
      - npm ci
  build:
    commands:
      - npm run lint
      - npx jest --ci --reporters=default --reporters=jest-junit   # gera relatorios/junit.xml
      - sam build
  post_build:
    commands:
      - sam package --s3-bucket artefatos-pedidos --output-template-file empacotado.yaml
reports:
  testes-unitarios:
    files: [junit.xml]
    base-directory: relatorios
artifacts:
  files: [empacotado.yaml]
cache:
  paths: ["/root/.npm/**/*"]
```

## Variáveis, segredos e logs
• Não coloque senhas e tokens em env.variables: elas ficam visíveis na configuração e podem aparecer em logs. Use parameter-store ou secrets-manager no buildspec, e dê à service role permissão de leitura (ssm:GetParameters, secretsmanager:GetSecretValue e kms:Decrypt, se aplicável).
• Precedência: variáveis passadas ao iniciar a build (start-build ou pipeline) sobrescrevem as do projeto, que sobrescrevem as do buildspec.
• Variáveis de ambiente prontas ajudam a identificar a build: CODEBUILD_BUILD_ID, CODEBUILD_RESOLVED_SOURCE_VERSION (o commit), CODEBUILD_SRC_DIR.
• Logs vão para o CloudWatch Logs e/ou para o S3. "A build falhou" → leia o log da fase que falhou.

## Builds em VPC, Docker e execução local
• Para acessar recursos privados (um RDS em subnet privada, um repositório interno), configure a VPC, as subnets e o security group no projeto. Em subnets privadas, a build só acessa a internet (baixar pacotes) por um NAT gateway, e os serviços AWS por NAT ou VPC endpoints.
• Para construir imagens Docker dentro do CodeBuild, ative o modo privilegiado (privileged mode) no ambiente. O fluxo usual: pre_build faz login no ECR, build executa docker build, post_build executa docker push.
• Builds podem rodar localmente com o agente do CodeBuild, para depurar o buildspec.
• O CodeBuild também oferece builds em lote (batch) e computação em Lambda para builds rápidas.

## CodePipeline: estágios e ações
O AWS CodePipeline orquestra a entrega: cada mudança na origem gera uma execução do pipeline, que passa por estágios.

• Estágio (stage): Source, Build, Test, Deploy, Approval...
• Ação (action): o trabalho dentro de um estágio, com um provedor:
  • Source: CodeCommit, S3, ECR, GitHub/GitLab/Bitbucket por CodeConnections;
  • Build e Test: CodeBuild (ou Jenkins e outros);
  • Deploy: CloudFormation, CodeDeploy, ECS, Elastic Beanstalk, S3, entre outros;
  • Approval: aprovação manual;
  • Invoke: Lambda ou Step Functions.
• runOrder: ações com o mesmo runOrder rodam em paralelo; números maiores rodam depois.

Se uma ação falha, o estágio falha e a execução para ali. É possível repetir só as ações que falharam (retry) depois de corrigir o problema. Pipelines do tipo V2 também podem fazer rollback automático de um estágio para a última execução bem-sucedida.

## Artefatos entre ações
As ações trocam dados por artefatos, guardados no artifact store, um bucket S3 da Região do pipeline (criptografado com KMS).

• Cada ação declara output artifacts (o que produz) e input artifacts (o que consome) por nome.
• O nome precisa bater: se o Build produz "BuildOutput", o Deploy deve consumir "BuildOutput". Um nome errado faz a ação falhar por artefato inexistente.
• O artefato aprovado em homologação deve ser o mesmo implantado em produção (o pipeline passa o mesmo objeto adiante; não reconstrua).
• Ações em outra Região precisam de um artifact store naquela Região; o CodePipeline copia os artefatos.
• Implantação em outra conta: a ação usa uma role na conta de destino, e os artefatos precisam estar criptografados com uma customer managed key que essa conta possa usar (AWS managed keys não servem entre contas).

## Aprovação manual e gatilhos
Ação de aprovação manual: a execução pausa até alguém aprovar ou rejeitar (por até 7 dias). Ela pode notificar um tópico SNS e mostrar uma URL para revisão (por exemplo, o ambiente de homologação). Quem aprova precisa da permissão codepipeline:PutApprovalResult.

Gatilhos:
• origem CodeCommit, S3 ou ECR: detecção por eventos do EventBridge (recomendado, em vez de polling);
• GitHub, GitLab e Bitbucket: pela conexão do CodeConnections;
• em pipelines V2, filtros por branch, por tag Git (v*) e por caminhos de arquivo.

Modos de execução (V2): SUPERSEDED (padrão: uma execução nova pode passar à frente de uma antiga em espera), QUEUED (uma de cada vez, na ordem) e PARALLEL.

Notificações do estado do pipeline podem ir para SNS ou Slack por regras de notificação, ou por eventos do EventBridge.

## Implantar com CloudFormation no pipeline
A ação de deploy do CloudFormation pode:
• criar ou atualizar uma stack diretamente;
• criar um change set e, em outra ação (depois de uma aprovação, por exemplo), executá-lo;
• receber parâmetros por parameter overrides ou por um arquivo de configuração de template, inclusive valores de outros artefatos.

Para SAM: o CodeBuild executa sam build e sam package (template empacotado como artefato), e o estágio de deploy usa a ação do CloudFormation com as capabilities CAPABILITY_IAM e CAPABILITY_AUTO_EXPAND. A ação usa uma role para o CloudFormation, que precisa de iam:PassRole.

Esse é o desenho típico de "pipeline serverless": Source → Build (testes e sam package) → Deploy homolog (change set) → Approval → Deploy prod (change set com DeploymentPreference gradual).

## CodeCommit e controle de versão
O AWS CodeCommit é um serviço gerenciado de repositórios Git privados. Depois de ser fechado a novos clientes em 2024, voltou à disponibilidade geral em novembro de 2025.

• Autenticação: credenciais Git de HTTPS geradas para um usuário IAM, chaves SSH, ou o helper git-remote-codecommit com credenciais IAM temporárias (recomendado com SSO e roles).
• Permissões por IAM (codecommit:GitPull, GitPush), inclusive com condições por branch para proteger main.
• Pull requests com approval rule templates (exigir N aprovações).
• Gatilhos e notificações para SNS ou Lambda; eventos no EventBridge para iniciar pipelines.

Repositórios no GitHub, GitLab ou Bitbucket se conectam por AWS CodeConnections (antes CodeStar Connections). Branches e tags definem o que é implantado: por exemplo, merge na main dispara homologação, e uma tag v* dispara produção.

## Qualidade de código: Amazon Q Developer e CodeGuru
• Amazon Q Developer: assistente de IA para desenvolvimento na IDE e na linha de comando. Sugere código, explica trechos, gera testes unitários e documentação, faz revisão de código e varredura de segurança (incluindo segredos expostos e vulnerabilidades), e ajuda em migrações (por exemplo, atualizar versões do Java).
• Amazon CodeGuru Reviewer: revisão automática de código que aponta defeitos, problemas de segurança e uso incorreto de APIs da AWS em pull requests.
• Amazon CodeGuru Profiler: analisa a aplicação em execução e mostra as linhas de código que mais consomem CPU e tempo, ajudando a reduzir latência e custo.

Na prova: "encontrar as linhas mais caras de uma aplicação em produção" → CodeGuru Profiler. "Gerar testes unitários e sugestões de código com IA" → Amazon Q Developer.

## Pegadinhas frequentes
• buildspec.yml fica na raiz do repositório, a menos que outro caminho seja configurado.
• Segredos no buildspec: parameter-store ou secrets-manager, nunca variables em texto.
• Build em subnet privada sem NAT não baixa pacotes da internet.
• docker build no CodeBuild exige modo privilegiado.
• Nome de artefato de entrada precisa bater com o de saída da ação anterior.
• Ações com o mesmo runOrder rodam em paralelo.
• Deploy em outra conta: role na conta de destino + customer managed key nos artefatos.
• Aprovação manual exige codepipeline:PutApprovalResult; expira em 7 dias.

## Resumo para revisão
• CodeBuild: contêineres gerenciados; buildspec 0.2 com env (variables, parameter-store, secrets-manager, exported-variables), phases (install, pre_build, build, post_build), artifacts, cache e reports; logs no CloudWatch/S3; VPC; modo privilegiado; agente local.
• CodePipeline: estágios e ações; artefatos no S3 por nome; runOrder; retry de ações; rollback em V2; aprovação manual com SNS; gatilhos por EventBridge/CodeConnections; filtros de branch e tag.
• CloudFormation no pipeline: criar e executar change sets; capabilities; iam:PassRole.
• Entre Regiões: artifact store por Região. Entre contas: role + customer managed key.
• CodeCommit: Git gerenciado, de volta à GA em 11/2025; HTTPS Git credentials, SSH, git-remote-codecommit.
• Amazon Q Developer (IA, testes, segurança); CodeGuru Reviewer (revisão) e Profiler (desempenho em execução).

## Questões

Q: Um build no CodeBuild precisa de um token de acesso a um registro privado de pacotes, guardado no Secrets Manager. Como usá-lo com segurança no buildspec?
- Gravar o token em um arquivo no repositório.
- Colocar o token em env.variables.
+ Declarar o token em env.secrets-manager e dar à service role permissão para ler o segredo.
- Passar o token como parâmetro na URL do repositório.
E: A seção secrets-manager busca o valor no início da build, com a service role, sem expô-lo no código nem na configuração. Variáveis em texto, arquivos no repositório e URLs expõem o token.

Q: Uma build do CodeBuild configurada em subnets privadas de uma VPC falha ao executar npm ci. A build precisa acessar um RDS privado e baixar pacotes do registro público do npm. Qual é a correção?
- Aumentar o timeout da build.
+ Garantir rota das subnets privadas para um NAT gateway (e security groups que permitam a saída).
- Ativar o modo privilegiado.
- Remover a configuração de VPC.
E: Builds em subnets privadas só alcançam a internet por um NAT gateway. Remover a VPC impediria o acesso ao RDS, o modo privilegiado é para Docker e o timeout não cria rota.

Q: O CodeBuild falha ao executar docker build com erro de conexão ao daemon do Docker. O que ajustar?
+ Ativar o modo privilegiado no ambiente do projeto.
- Adicionar o comando à seção cache, para que o daemon do Docker seja reaproveitado entre builds.
- Mover o comando para a fase install, que roda com permissões de administrador no contêiner.
- Usar uma imagem Windows.
E: Construir imagens Docker dentro do contêiner da build exige o modo privilegiado. A fase, o cache ou o sistema operacional não habilitam o daemon do Docker.

Q: Em um pipeline, a ação de deploy falha dizendo que o artefato de entrada não existe. A ação de build declara o output artifact "PacoteApp" e a de deploy consome "BuildArtifact". O que está errado?
- A ação de build precisa de runOrder 2.
- O artifact store precisa ficar em outra Região, porque o estágio de deploy não lê o bucket do estágio de build.
+ Os nomes não correspondem; a ação de deploy deve consumir "PacoteApp".
- O CodePipeline não passa artefatos entre estágios diferentes; só entre ações do mesmo estágio.
E: O vínculo entre ações é pelo nome do artefato; o consumidor precisa usar o nome produzido. Região, runOrder e transporte de artefatos não são o problema.

Q: Um estágio de testes tem duas ações: testes de API e testes de segurança, que não dependem uma da outra. A equipe quer que rodem ao mesmo tempo. O que configurar?
- Dois pipelines separados.
+ O mesmo runOrder para as duas ações no estágio.
- runOrder 1 e 2.
- Uma aprovação manual entre elas, liberando a segunda ação assim que a primeira começar.
E: Ações do mesmo estágio com o mesmo runOrder executam em paralelo. runOrder diferentes forçam sequência, e pipelines separados ou aprovação manual não resolvem o paralelismo.

Q: Antes de implantar em produção, um gerente precisa revisar o ambiente de homologação e aprovar a liberação, recebendo um aviso por e-mail. Como implementar no CodePipeline?
- Desativar a transição para o estágio de produção e reativá-la manualmente depois que o gerente revisar por e-mail.
- Uma regra de lifecycle no bucket de artefatos.
+ Uma ação de aprovação manual com notificação SNS para o gerente e uma URL de revisão.
- Uma ação Lambda que espera 1 dia.
E: A aprovação manual pausa a execução, notifica via SNS e registra quem aprovou (com codepipeline:PutApprovalResult). As outras opções não registram a aprovação ou são frágeis.

Q: Um pipeline na conta de ferramentas precisa implantar uma stack CloudFormation na conta de produção. A ação falha ao ler os artefatos. O bucket de artefatos usa a chave aws/s3. O que é necessário?
- Usar a chave aws/s3 da conta de produção, que lê artefatos de qualquer conta da mesma organização automaticamente.
+ Usar nos artefatos uma customer managed key que a conta de produção possa usar e, na ação, uma role nessa conta.
- Copiar o template manualmente para a conta de produção.
- Tornar o bucket de artefatos público.
E: AWS managed keys não podem ser usadas entre contas; a conta de destino precisa de acesso à chave e ao bucket, e a ação assume uma role nela. Bucket público e cópia manual violam segurança e automação.

Q: Uma equipe quer encontrar quais métodos de uma aplicação Java em produção consomem mais CPU, para reduzir o custo de computação. Qual serviço usar?
- Amazon CodeGuru Reviewer.
- AWS CodeBuild reports.
+ Amazon CodeGuru Profiler.
- Amazon Inspector.
E: O CodeGuru Profiler analisa a aplicação em execução e mostra o código mais caro em CPU e latência. O Reviewer analisa código-fonte em revisões, os reports do CodeBuild mostram testes e cobertura, e o Inspector procura vulnerabilidades.

Q: Uma build precisa publicar relatórios de testes JUnit para que a equipe veja, no console do CodeBuild, quais testes falharam. O que configurar?
- Uma ação de aprovação manual.
- Um alarme do CloudWatch.
- Uma seção artifacts com o arquivo XML, que o console do CodeBuild abre como relatório de testes.
+ Uma seção reports no buildspec apontando para os arquivos JUnit.
E: A seção reports cria grupos de relatórios de testes e cobertura visíveis no console. Artifacts só guardam arquivos no S3, alarmes monitoram métricas e aprovação manual não exibe testes.

Q: Um desenvolvedor quer que o pipeline de produção comece apenas quando uma tag Git no formato v1.2.3 for criada no GitHub. Qual configuração atende?
- Uma ação de aprovação manual no início do pipeline, aprovada só quando o commit tiver uma tag de versão.
- Polling do repositório a cada minuto.
- Um cron no CodeBuild.
+ Pipeline V2 com origem GitHub via CodeConnections e gatilho filtrado por tags (por exemplo, v*).
E: Pipelines V2 aceitam gatilhos com filtros de branch, tag e caminho na origem conectada. Polling dispararia em qualquer mudança, aprovação manual não detecta tags e cron não reage a eventos do repositório.

## Flashcards

F: Fases do buildspec do CodeBuild
V: install (runtime-versions, ferramentas), pre_build (login, dependências), build (compilar, testar) e post_build (empacotar, publicar). Cada uma com commands e finally.

F: Como usar segredos no buildspec?
V: env.parameter-store e env.secrets-manager, com permissão de leitura (e kms:Decrypt) na service role. Nunca em env.variables.

F: Seções principais do buildspec
V: version 0.2, env, phases, artifacts, cache e reports.

F: Requisitos para docker build no CodeBuild
V: Modo privilegiado no ambiente; login no ECR em pre_build, docker build em build e docker push em post_build.

F: Build do CodeBuild em VPC
V: Configure VPC, subnets e security group. Em subnets privadas, internet só via NAT gateway; serviços AWS via NAT ou VPC endpoints.

F: Como as ações do CodePipeline trocam dados?
V: Por artefatos no artifact store (S3 por Região, com KMS), ligados por nome entre output e input artifacts.

F: O que runOrder controla?
V: A ordem das ações em um estágio. Mesmo runOrder = paralelo; maior = depois.

F: Aprovação manual no CodePipeline
V: Pausa a execução até aprovar/rejeitar (até 7 dias), pode notificar SNS com URL de revisão; exige codepipeline:PutApprovalResult.

F: Deploy entre contas no CodePipeline
V: A ação assume uma role na conta de destino, e os artefatos usam uma customer managed key compartilhada com essa conta.

F: CodeGuru Reviewer vs. Profiler vs. Amazon Q Developer
V: Reviewer: revisão automática de código. Profiler: desempenho em execução (linhas mais caras). Q Developer: assistente de IA (código, testes, revisão e segurança).
