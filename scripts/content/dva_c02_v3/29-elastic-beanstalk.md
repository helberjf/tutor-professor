# 29. Elastic Beanstalk: ambientes, políticas de implantação e configuração

## Mapa da aula
O AWS Elastic Beanstalk aparece na prova principalmente pelas políticas de implantação. Nesta aula:

• aplicação, versão e ambiente;
• ambientes web e worker, instância única e com load balancer;
• as cinco políticas de implantação e a troca de URLs (blue/green);
• .ebextensions, platform hooks e a precedência das configurações;
• banco de dados dentro ou fora do ambiente;
• lifecycle de versões, EB CLI, saúde e logs;
• Docker no Beanstalk.

## Aplicação, versão e ambiente
O Elastic Beanstalk implanta e gerencia aplicações web sem que você configure cada peça: ele cria instâncias EC2, Auto Scaling, load balancer, monitoramento e segurança a partir de uma plataforma (Node.js, Python, Java, .NET, PHP, Ruby, Go ou Docker). Por baixo, usa CloudFormation. Você continua tendo acesso aos recursos criados.

• Application: o contêiner lógico.
• Application version: uma versão do código, guardada como source bundle (zip) no S3.
• Environment: um conjunto de recursos executando uma versão (por exemplo, pedidos-prod e pedidos-homolog).

A mesma versão pode ser implantada em vários ambientes, e um ambiente pode voltar para uma versão anterior.

## Tiers e tipos de ambiente
Web server tier: atende requisições HTTP. Em modo load balanced, tem load balancer e Auto Scaling; em single instance, uma instância com IP elástico (bom para desenvolvimento, sem alta disponibilidade).

Worker tier: processa tarefas em segundo plano. O Beanstalk cria (ou usa) uma fila SQS e roda em cada instância um daemon que lê as mensagens e as entrega à aplicação por HTTP POST em localhost. Se a aplicação responde 200, a mensagem é apagada; senão, volta à fila (e pode ir para uma DLQ). O arquivo cron.yaml agenda tarefas periódicas no worker.

Padrão comum: o ambiente web recebe a requisição, coloca o trabalho pesado na fila e responde rápido; o ambiente worker processa. Assim, um pico de tarefas não deixa o site lento.

## As políticas de implantação
• All at once: implanta em todas as instâncias ao mesmo tempo. É o mais rápido, mas a aplicação fica indisponível durante a troca, e uma falha atinge tudo. Bom para desenvolvimento.
• Rolling: implanta em lotes (por exemplo, 2 de 6 instâncias). Sem custo extra, mas a capacidade cai durante cada lote, e as versões antiga e nova convivem.
• Rolling with additional batch: cria um lote extra de instâncias antes de começar, mantendo a capacidade total durante a implantação. Pequeno custo extra temporário. Bom para produção que não pode perder capacidade.
• Immutable: cria um novo Auto Scaling group temporário com instâncias novas, implanta nelas e, quando estão saudáveis, as move para o grupo original e encerra as antigas. Capacidade total, rollback rápido (basta encerrar as novas) e nenhuma instância antiga é alterada. O custo temporário é o dobro de instâncias.
• Traffic splitting: uma variação canary do immutable. Uma porcentagem do tráfego vai para as instâncias novas durante um tempo de avaliação; se a saúde se mantiver, todo o tráfego vai para elas. Se não, o Beanstalk volta automaticamente.

Na prova:
• "mais rápido, desenvolvimento, indisponibilidade aceitável" → All at once;
• "sem custo extra, capacidade reduzida aceitável" → Rolling;
• "manter capacidade total com custo mínimo" → Rolling with additional batch;
• "rollback mais rápido e seguro, sem alterar instâncias existentes" → Immutable;
• "testar com uma porcentagem do tráfego real antes de liberar" → Traffic splitting.

## Blue/green com troca de URLs
O Beanstalk não tem uma política "blue/green" dentro de um ambiente. A técnica é:

1. Crie um ambiente novo (verde) com a versão nova, ao lado do atual (azul).
2. Teste o verde pela URL dele.
3. Use Swap environment URLs (eb swap): o Beanstalk troca os CNAMEs dos dois ambientes, e o domínio de produção passa a apontar para o verde.
4. Se der problema, troque de novo. Depois de estável, encerre o ambiente azul.

Também é possível usar pesos no Route 53 para mover o tráfego aos poucos. Como a troca é por DNS, alguns clientes podem continuar no ambiente antigo até o cache de DNS expirar.

Use blue/green quando a mudança é grande (versão de plataforma, configuração de rede) ou quando precisa de um ambiente completamente separado para validar.

## .ebextensions e platform hooks
A configuração do ambiente pode ir junto com o código:

.ebextensions/: arquivos com extensão .config (YAML ou JSON) na raiz do source bundle. Podem conter:
• option_settings: configurações do ambiente (variáveis de ambiente, tamanho do Auto Scaling, tipo de instância, health check);
• resources: recursos extras em sintaxe de CloudFormation (uma tabela DynamoDB, uma fila);
• packages, files, commands e container_commands. Os container_commands rodam depois que o código é extraído e antes de ele entrar no ar; leader_only: true executa em uma única instância (bom para migração de banco).

.platform/: nas plataformas Amazon Linux 2 e 2023, platform hooks são scripts executados em momentos da implantação (.platform/hooks/prebuild, predeploy e postdeploy) e arquivos de configuração do proxy (.platform/nginx/conf.d/).

Procfile define os processos da aplicação em algumas plataformas.

```yaml
# .ebextensions/01-config.config
option_settings:
  aws:elasticbeanstalk:application:environment:
    NODE_ENV: production
    TABELA_PEDIDOS: pedidos-prod
  aws:autoscaling:asg:
    MinSize: 2
    MaxSize: 8
container_commands:
  01_migrar:
    command: "npm run migrate"
    leader_only: true
```

## Precedência das configurações
Quando a mesma opção é definida em vários lugares, vale a de maior precedência:

1. Configurações aplicadas diretamente no ambiente (console, EB CLI, API, SDK);
2. Saved configurations (configurações salvas e reutilizáveis);
3. Arquivos de .ebextensions;
4. Valores padrão.

Erro clássico: "mudei o valor no .ebextensions e o ambiente não mudou" → a opção foi definida antes pelo console, que tem precedência maior. Remova a configuração direta para que o arquivo valha.

Variáveis de ambiente (environment properties) aparecem para a aplicação como variáveis do sistema operacional. Não coloque segredos em texto nelas; leia do Secrets Manager ou do Parameter Store usando a role da instância (instance profile).

## Banco de dados dentro ou fora do ambiente
O Beanstalk pode criar um RDS junto com o ambiente. Isso é prático para testes, mas o banco fica preso ao ciclo de vida do ambiente: encerrar ou recriar o ambiente apaga o banco (salvo configuração de retenção).

Para produção, crie o RDS separado e passe o endpoint e as credenciais para a aplicação (Secrets Manager e variáveis de ambiente). Assim, você pode fazer blue/green, recriar ambientes e mudar de plataforma sem perder dados.

Para desacoplar um banco que já está no ambiente: crie um snapshot, proteja o RDS contra exclusão, crie um novo ambiente apontando para o banco (ou restaure o snapshot em um RDS independente) e encerre o ambiente antigo.

## Versões, EB CLI, saúde e logs
Lifecycle de versões: há uma cota de versões de aplicação por Região (1.000 por padrão). Ao atingir a cota, novas implantações falham. Configure uma lifecycle policy que apaga versões antigas por quantidade ou idade, escolhendo se o source bundle no S3 deve ser mantido.

EB CLI: eb init (configura o projeto), eb create (cria um ambiente), eb deploy (envia a versão atual), eb status, eb health, eb logs, eb ssh, eb config, eb swap e eb terminate.

Saúde e observabilidade:
• Enhanced health reporting mostra o estado de cada instância e causas de problemas (latência, erros 5xx, CPU);
• logs das instâncias podem ser enviados ao CloudWatch Logs;
• o daemon do X-Ray pode ser ativado por opção de configuração;
• managed platform updates aplicam atualizações de plataforma em janelas definidas.

HTTPS: configure o certificado do ACM no listener do load balancer do ambiente e redirecione HTTP para HTTPS.

## Docker no Elastic Beanstalk
A plataforma Docker roda contêineres a partir de:
• um Dockerfile (o Beanstalk constrói a imagem);
• um docker-compose.yml (vários contêineres na mesma instância, nas plataformas Amazon Linux 2 e 2023);
• um Dockerrun.aws.json, que aponta para uma imagem pronta (por exemplo, no ECR).

É uma forma simples de rodar contêineres sem configurar ECS diretamente. Para controle fino de tarefas, escalabilidade por serviço e integração com CodeDeploy blue/green, use ECS (aula 30).

## Pegadinhas frequentes
• All at once causa indisponibilidade.
• Rolling reduz capacidade; Rolling with additional batch não.
• Immutable cria instâncias novas em um grupo temporário; rollback é encerrar as novas.
• Blue/green no Beanstalk é ambiente novo + Swap environment URLs.
• Configuração direta no console vence .ebextensions.
• container_commands com leader_only roda em uma instância só.
• RDS criado no ambiente morre com o ambiente; em produção, desacople.
• Cota de versões atingida → lifecycle policy.

## Resumo para revisão
• Application → application versions (source bundle no S3) → environments.
• Web tier (load balanced ou single instance) e worker tier (fila SQS + daemon que faz POST em localhost; cron.yaml).
• Políticas: All at once, Rolling, Rolling with additional batch, Immutable, Traffic splitting.
• Blue/green: segundo ambiente + Swap environment URLs (CNAME) ou Route 53 ponderado.
• .ebextensions/*.config: option_settings, resources, packages, files, commands, container_commands (leader_only). .platform/hooks e nginx.
• Precedência: direta > saved configuration > .ebextensions > padrão.
• RDS separado em produção; lifecycle policy de versões; EB CLI; enhanced health; logs e X-Ray.

## Questões

Q: Uma aplicação no Elastic Beanstalk não pode perder capacidade durante as implantações, e a equipe quer o menor custo adicional possível. Qual política escolher?
+ Rolling with additional batch.
- Immutable.
- Rolling.
- All at once.
E: O lote adicional mantém a capacidade total, com custo extra só de um lote durante a implantação. All at once causa indisponibilidade, Rolling reduz a capacidade, e Immutable também mantém capacidade, mas duplica as instâncias temporariamente.

Q: A empresa quer que uma implantação com problema seja revertida o mais rápido possível, sem que nenhuma instância em produção seja alterada durante o processo. Qual política atende?
+ Immutable.
- Rolling.
- Rolling with additional batch.
- All at once.
E: Immutable implanta em instâncias novas de um grupo temporário; se houver falha, basta encerrá-las, e as antigas nunca foram alteradas. As políticas rolling e all at once atualizam instâncias existentes.

Q: Uma equipe quer enviar 10% do tráfego real para a nova versão durante 15 minutos e voltar automaticamente se a saúde piorar, sem criar outro ambiente. Qual política usar?
- Immutable.
- Rolling.
+ Traffic splitting.
- Swap environment URLs.
E: Traffic splitting faz canary dentro do ambiente, com tempo de avaliação e volta automática. Immutable troca tudo após as novas instâncias ficarem saudáveis, Rolling não controla porcentagem de tráfego e a troca de URLs exige outro ambiente.

Q: Uma mudança de versão de plataforma deve ser testada em um ambiente completamente separado e, depois, liberada sem tempo de indisponibilidade, com possibilidade de voltar rapidamente. Qual é a abordagem?
+ Criar um novo ambiente com a nova plataforma, testar e usar Swap environment URLs.
- Implantar com All at once e testar em produção.
- Editar a AMI das instâncias manualmente.
- Alterar a plataforma no ambiente atual com Rolling.
E: Blue/green com troca de CNAME permite validar em separado e voltar trocando de novo. As outras opções alteram o ambiente de produção diretamente ou fazem mudanças manuais frágeis.

Q: Um desenvolvedor alterou MaxSize do Auto Scaling em .ebextensions, mas o ambiente continua com o valor antigo após o deploy. O valor tinha sido ajustado antes pelo console. Por quê?
- O Auto Scaling não pode ser configurado pelo Beanstalk.
- Arquivos .ebextensions só são lidos na criação do ambiente.
+ Configurações aplicadas diretamente no ambiente têm precedência sobre .ebextensions.
- O arquivo precisa ter extensão .yaml.
E: A ordem de precedência coloca configurações diretas (console, CLI, API) acima de saved configurations e de .ebextensions. Os arquivos são aplicados em cada implantação, a extensão correta é .config e o Auto Scaling é configurável.

Q: Uma API em Node.js (TypeScript) precisa executar a migração do banco (npm run migrate) uma única vez a cada implantação, mesmo com várias instâncias. Como configurar?
- Uma variável de ambiente MIGRAR=true lida pela aplicação na inicialização de cada instância.
- Um comando em commands, que roda em todas as instâncias e o Beanstalk ignora depois da primeira execução.
+ Um container_commands com leader_only: true em .ebextensions.
- Um cron.yaml no ambiente web.
E: container_commands rodam após a extração do código, e leader_only limita a execução a uma instância. commands roda em todas, cron.yaml é do worker tier para tarefas periódicas e uma variável não executa nada.

Q: Um site recebe pedidos que exigem gerar PDFs pesados, deixando as páginas lentas. Como reorganizar com Elastic Beanstalk?
- Usar All at once nas implantações para que as instâncias novas fiquem livres para gerar os PDFs.
- Criar o RDS dentro do ambiente.
- Aumentar o tamanho das instâncias do ambiente web para que os PDFs sejam gerados mais rápido dentro da requisição.
+ Colocar as tarefas em uma fila SQS e processá-las em um ambiente worker.
E: O worker tier consome a fila e entrega as mensagens à aplicação por POST local, tirando o trabalho pesado do ambiente web. Instâncias maiores só adiam o problema, e política de implantação ou RDS não tratam da carga.

Q: Uma equipe criou o banco RDS junto com o ambiente do Beanstalk de produção e agora quer fazer implantações blue/green com ambientes novos. Qual é o risco e a recomendação?
- Não há risco; o RDS criado no ambiente é compartilhado automaticamente com os ambientes criados depois.
+ O RDS segue o ciclo de vida do ambiente; deve ser desacoplado (snapshot e RDS independente).
- O Beanstalk não permite usar RDS.
- O RDS precisa ser recriado a cada implantação.
E: Um banco criado no ambiente pode ser apagado com ele, e não é compartilhado com o ambiente verde. Em produção, o banco deve ser independente. As outras afirmações são falsas.

Q: As implantações começaram a falhar com erro de cota de versões de aplicação. Qual é a solução duradoura?
- Usar sempre o mesmo rótulo de versão, para que cada deploy substitua a versão anterior em vez de criar outra.
- Trocar para a política All at once.
+ Configurar uma lifecycle policy de versões que apaga as antigas por quantidade ou idade.
- Criar uma nova conta.
E: A lifecycle policy remove versões antigas automaticamente, mantendo a cota sob controle (opcionalmente preservando o source bundle no S3). Nova conta é desproporcional, reutilizar rótulo não é permitido e a política de implantação não afeta a cota.

Q: Qual comando da EB CLI troca os CNAMEs entre dois ambientes para concluir um blue/green?
+ eb swap
- eb config
- eb deploy
- eb create
E: eb swap executa a troca de URLs entre ambientes. deploy envia uma versão, create cria ambientes e config edita configurações.

## Flashcards

F: Componentes do Elastic Beanstalk
V: Application (contêiner lógico), application version (source bundle no S3) e environment (recursos executando uma versão).

F: Web tier vs. worker tier
V: Web: requisições HTTP (load balanced ou single instance). Worker: daemon lê uma fila SQS e faz POST em localhost; cron.yaml para tarefas periódicas.

F: All at once vs. Rolling
V: All at once: todas as instâncias juntas, rápido, com indisponibilidade. Rolling: em lotes, sem custo extra, capacidade reduzida.

F: Rolling with additional batch
V: Cria um lote extra antes de começar, mantendo a capacidade total com pequeno custo temporário.

F: Immutable no Beanstalk
V: Novo Auto Scaling group temporário com instâncias novas; depois de saudáveis, substituem as antigas. Capacidade total e rollback rápido; custo temporário dobrado.

F: Traffic splitting no Beanstalk
V: Canary: porcentagem do tráfego para instâncias novas durante a avaliação, com volta automática se a saúde piorar.

F: Blue/green no Elastic Beanstalk
V: Criar outro ambiente, testar e usar Swap environment URLs (eb swap) ou Route 53 ponderado.

F: Precedência de configurações no Beanstalk
V: Direta (console/CLI/API) > saved configurations > .ebextensions > padrões.

F: container_commands e leader_only
V: Comandos em .ebextensions executados após extrair o código e antes de ir ao ar; leader_only: true roda em uma só instância.

F: RDS no Beanstalk em produção
V: Crie o RDS fora do ambiente; um RDS criado dentro do ambiente segue o ciclo de vida dele e pode ser apagado junto.
