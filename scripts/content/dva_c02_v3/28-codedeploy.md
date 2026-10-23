# 28. CodeDeploy: EC2, Lambda e ECS, estratégias, AppSpec, hooks e rollback

## Mapa da aula
O AWS CodeDeploy automatiza implantações e é um dos temas mais detalhados da prova. Nesta aula:

• as peças do CodeDeploy: aplicação, plataforma, grupo de implantação, configuração e revisão;
• EC2 e on-premises: agente, in-place e blue/green, configurações de implantação;
• o appspec.yml para EC2 e a ordem dos hooks de ciclo de vida;
• Lambda: canary, linear e all-at-once, AppSpec e hooks de validação;
• ECS: blue/green com dois target groups e listener de teste;
• rollback automático por falha ou alarme;
• estratégias de implantação comparadas e o cuidado com o banco de dados.

## As peças do CodeDeploy
• Application: o nome lógico da aplicação, com uma plataforma: EC2/On-premises, AWS Lambda ou Amazon ECS.
• Deployment group: o alvo. Em EC2, instâncias escolhidas por tags ou um Auto Scaling group, opcionalmente atrás de um load balancer; em Lambda, a função e o alias; em ECS, o serviço, o load balancer e os target groups. Tem uma service role que permite ao CodeDeploy agir em seu nome, além das configurações de alarmes e rollback.
• Deployment configuration: como o tráfego ou as instâncias são trocados (quantas de cada vez, canary, linear).
• Revision: o que implantar. Em EC2, um pacote no S3 (zip, tar) ou no GitHub com o appspec.yml; em Lambda e ECS, um AppSpec que descreve as versões.

O CodeDeploy pode ser usado sozinho ou como ação de deploy do CodePipeline.

## EC2 e on-premises: agente e estratégias
Em EC2 e servidores on-premises, o CodeDeploy agent precisa estar instalado e em execução em cada servidor. Ele baixa a revisão do S3 e executa os passos do appspec. A instância precisa de um instance profile com permissão para ler o bucket da revisão (servidores on-premises usam um usuário IAM ou role registrados).

"A implantação fica parada e falha por tempo esgotado em todas as instâncias" → verifique se o agente está rodando e se a instância consegue ler o S3.

Tipos de implantação:
• In-place: atualiza a aplicação nas mesmas instâncias, algumas de cada vez. Se houver load balancer, as instâncias saem dele durante a atualização.
• Blue/green: cria (ou usa) um novo conjunto de instâncias com a versão nova, desvia o tráfego do load balancer para ele e, depois de um tempo de espera, encerra as instâncias antigas.

Configurações de implantação para EC2 in-place:
• CodeDeployDefault.AllAtOnce: todas ao mesmo tempo (mais rápido, com indisponibilidade);
• CodeDeployDefault.HalfAtATime: metade de cada vez;
• CodeDeployDefault.OneAtATime: uma de cada vez (mais lento e seguro);
• personalizadas, com um número ou porcentagem mínima de instâncias saudáveis.

## appspec.yml para EC2 e a ordem dos hooks
O appspec.yml fica na raiz da revisão e define arquivos, permissões e scripts por evento de ciclo de vida.

Ordem dos eventos em uma implantação in-place (sem load balancer):
1. ApplicationStop
2. DownloadBundle (do agente, sem script)
3. BeforeInstall
4. Install (do agente: copia os arquivos)
5. AfterInstall
6. ApplicationStart
7. ValidateService

Com load balancer, também há BeforeBlockTraffic, BlockTraffic e AfterBlockTraffic antes de parar, e BeforeAllowTraffic, AllowTraffic e AfterAllowTraffic no final.

Cada hook pode ter timeout e o usuário de execução (runas). Se um script devolve erro, a implantação daquela instância falha.

Detalhe que cai na prova: o script de ApplicationStop é o da revisão anterior (a que está instalada). Se ele estiver quebrado, todas as implantações novas falham nesse passo; é possível configurar a implantação para ignorar falhas de ApplicationStop.

```yaml
version: 0.0
os: linux
files:
  - source: /app
    destination: /opt/pedidos
hooks:
  ApplicationStop:
    - location: scripts/parar.sh
      timeout: 60
  BeforeInstall:
    - location: scripts/dependencias.sh
  AfterInstall:
    - location: scripts/configurar.sh
      runas: app
  ApplicationStart:
    - location: scripts/iniciar.sh
  ValidateService:
    - location: scripts/verificar_saude.sh
      timeout: 120
```

## Lambda: canary, linear e all-at-once
Para Lambda, o CodeDeploy move um alias de uma versão para outra aos poucos, usando a divisão de tráfego do alias:

• Canary: uma porcentagem primeiro e o resto depois de um intervalo. Exemplos: LambdaCanary10Percent5Minutes, 10Minutes, 15Minutes, 30Minutes.
• Linear: aumenta em partes iguais a cada intervalo. Exemplos: LambdaLinear10PercentEvery1Minute, 2Minutes, 3Minutes, 10Minutes.
• AllAtOnce: todo o tráfego de uma vez.

O AppSpec da Lambda indica a função, o alias, a versão atual (CurrentVersion) e a versão alvo (TargetVersion), além dos hooks.

Hooks da Lambda:
• BeforeAllowTraffic: roda antes de qualquer tráfego ir para a versão nova (testes da versão nova);
• AfterAllowTraffic: roda depois que todo o tráfego foi para a versão nova (testes finais).

Cada hook é uma função Lambda que testa o que precisar e chama a API PutLifecycleEventHookExecutionStatus com Succeeded ou Failed, informando o deploymentId e o lifecycleEventHookExecutionId recebidos no evento. Se a função não chamar essa API, a implantação espera até o timeout e falha.

No SAM, AutoPublishAlias + DeploymentPreference gera tudo isso (aula 25).

## ECS: blue/green com target groups
Para serviços ECS atrás de um Application ou Network Load Balancer, o CodeDeploy faz blue/green:

• o deployment group tem dois target groups (azul e verde) e um listener de produção; opcionalmente, um listener de teste em outra porta;
• o CodeDeploy cria um novo conjunto de tarefas (replacement task set) com a nova task definition no target group verde;
• o listener de teste permite validar a versão nova antes de receber tráfego de produção;
• o tráfego de produção muda para o verde de uma vez, em canary ou em linear (ECSAllAtOnce, ECSCanary10Percent5Minutes, ECSLinear10PercentEvery1Minutes...);
• depois de um tempo de espera, as tarefas antigas são encerradas.

O AppSpec do ECS indica a TaskDefinition, o nome e a porta do contêiner (ContainerName e ContainerPort) e os hooks: BeforeInstall, AfterInstall, AfterAllowTestTraffic, BeforeAllowTraffic e AfterAllowTraffic, executados por funções Lambda.

O ECS também tem implantações rolling próprias e, mais recentemente, blue/green nativo sem o CodeDeploy (aula 30). Na prova, "blue/green de ECS com tráfego de teste e hooks Lambda" aponta para o CodeDeploy.

## Rollback automático
No deployment group, ative:
• rollback quando a implantação falha (um hook ou script falhou, instâncias não ficaram saudáveis);
• rollback quando um alarme do CloudWatch dispara durante a implantação (por exemplo, taxa de erros 5xx ou Errors da função acima do limite).

Como o rollback funciona: o CodeDeploy implanta de novo a última revisão que deu certo, como uma nova implantação (com outro id). Em Lambda, move o alias de volta para a versão anterior; em ECS blue/green, volta o tráfego para o conjunto azul.

Você também pode parar uma implantação em andamento manualmente e escolher se quer reverter.

Sem alarmes configurados, uma versão que responde com erros, mas não falha nos hooks, segue até 100%. Alarmes são o que torna canary e linear seguros.

## Estratégias de implantação comparadas
• All at once: mais rápido; todos os usuários são afetados se houver erro; rollback é reimplantar.
• Rolling (in-place em lotes): sem custo extra de capacidade; durante a implantação, versões antigas e novas convivem; capacidade reduzida enquanto o lote atualiza.
• Blue/green: um ambiente novo completo; troca rápida e rollback rápido (voltar o tráfego); custo de dois ambientes durante a troca.
• Canary: uma fração pequena dos usuários testa a versão nova; o resto vem depois do intervalo; rollback automático com alarmes.
• Linear: aumenta em passos iguais; mais tempo de observação em cada nível.

Banco de dados não volta quando a aplicação volta. Migrações de esquema devem ser compatíveis com a versão anterior (expandir antes, contrair depois): por exemplo, adicionar uma coluna nova opcional na primeira versão e só remover a antiga quando nenhuma versão em produção a usar mais.

## Pegadinhas frequentes
• EC2/on-premises precisa do agente do CodeDeploy e de acesso ao S3 da revisão.
• Ordem dos hooks EC2: ApplicationStop → DownloadBundle → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService.
• ApplicationStop roda o script da revisão anterior.
• Hooks Lambda precisam chamar PutLifecycleEventHookExecutionStatus.
• Hooks de Lambda: BeforeAllowTraffic e AfterAllowTraffic. Hooks de ECS: BeforeInstall, AfterInstall, AfterAllowTestTraffic, BeforeAllowTraffic, AfterAllowTraffic.
• Rollback é uma nova implantação da última revisão boa.
• Sem alarme, canary com erros (mas sem falha de hook) vai até 100%.

## Resumo para revisão
• Plataformas: EC2/On-premises, Lambda, ECS. Deployment group, configuration, revision, service role.
• EC2: agente + instance profile; in-place (AllAtOnce, HalfAtATime, OneAtATime, personalizada) ou blue/green.
• appspec.yml EC2: version 0.0, os, files, permissions, hooks na ordem do ciclo de vida.
• Lambda: Canary/Linear/AllAtOnce no alias; hooks BeforeAllowTraffic/AfterAllowTraffic com PutLifecycleEventHookExecutionStatus.
• ECS: blue/green com dois target groups, listener de produção e de teste, hooks com AfterAllowTestTraffic.
• Rollback automático por falha ou alarme; reimplanta a última revisão boa.
• Estratégias: all at once, rolling, blue/green, canary, linear; migrações compatíveis com a versão anterior.

## Questões

Q: Uma implantação do CodeDeploy em instâncias EC2 falha em todas as instâncias por tempo esgotado, sem executar nenhum script. O que verificar primeiro?
+ Se o CodeDeploy agent está instalado e rodando e se o instance profile permite ler a revisão no S3.
- Se a função Lambda de hook chamou PutLifecycleEventHookExecutionStatus.
- Se o listener de teste do load balancer existe.
- A configuração de canary do deployment group.
E: Em EC2, é o agente que baixa e executa a revisão; sem ele, ou sem acesso ao S3, nada acontece e a implantação expira. Canary, hooks Lambda e listener de teste são de outras plataformas.

Q: Em qual ordem os eventos de ciclo de vida acontecem em uma implantação in-place em EC2 sem load balancer?
- BeforeInstall → ApplicationStop → Install → ApplicationStart → AfterInstall → ValidateService.
- ValidateService → ApplicationStop → Install → ApplicationStart.
+ ApplicationStop → DownloadBundle → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService.
- DownloadBundle → ApplicationStop → BeforeInstall → Install → ApplicationStart → AfterInstall → ValidateService.
E: Primeiro a aplicação atual é parada, a revisão é baixada, os passos de instalação acontecem, a aplicação é iniciada e por fim validada. As outras sequências invertem etapas.

Q: Todas as novas implantações falham no evento ApplicationStop, embora o script novo esteja correto. Qual é a causa?
- O agente do CodeDeploy está desatualizado.
+ O ApplicationStop executa o script da revisão anterior, que está com erro.
- O deployment group usa OneAtATime.
- O appspec.yml está no diretório errado.
E: ApplicationStop usa o script da revisão já instalada; se ele falha, a implantação nova não passa desse ponto. A solução é corrigir o script na instância ou configurar a implantação para ignorar falhas de ApplicationStop.

Q: Uma equipe quer liberar uma nova versão de função Lambda para 10% do tráfego por 10 minutos e, se tudo der certo, para 100%. Qual configuração do CodeDeploy usar?
- LambdaLinear10PercentEvery10Minutes.
- CodeDeployDefault.HalfAtATime.
+ LambdaCanary10Percent10Minutes.
- LambdaAllAtOnce.
E: Canary manda 10% e, após o intervalo, o restante. Linear aumentaria 10% a cada 10 minutos (100 minutos até o fim), AllAtOnce troca tudo de uma vez e HalfAtATime é configuração de EC2.

Q: Durante uma implantação canary de Lambda, a função de hook BeforeAllowTraffic executa os testes com sucesso, mas a implantação fica parada até falhar por timeout. O que está faltando?
- Uma DLQ na função de hook.
- Aumentar o timeout da função testada, porque o CodeDeploy espera ela terminar todas as invocações de teste.
- Um listener de teste no load balancer, que o CodeDeploy usa para saber que os testes do hook terminaram.
+ A função de hook chamar PutLifecycleEventHookExecutionStatus com Succeeded e os ids do evento.
E: O CodeDeploy só segue quando o hook informa o resultado por essa API. Timeout da função testada, listener de teste (que é de ECS) e DLQ não informam o resultado.

Q: Uma nova versão de API em Lambda responde com erros 5xx para parte dos usuários, mas os hooks passaram. A implantação linear chegou a 100%. Como evitar isso nas próximas implantações?
- Remover os hooks.
+ Configurar alarmes do CloudWatch (como Errors ou 5XXError) no deployment group com rollback automático.
- Usar concorrência reservada na versão nova, limitando quantos usuários podem ser afetados pelos erros.
- Trocar para AllAtOnce.
E: Com alarmes no deployment group, o CodeDeploy reverte quando os erros sobem durante o canary ou o linear. AllAtOnce aumenta o impacto, remover hooks reduz a validação e concorrência não detecta erros.

Q: Um serviço ECS atrás de um ALB precisa de implantação blue/green em que a versão nova possa ser testada por uma porta separada antes de receber tráfego de produção. O que configurar no CodeDeploy?
- Um único target group com stickiness, para que os testadores fiquem presos às tarefas novas durante a validação.
+ Dois target groups, listener de produção e listener de teste, com hook AfterAllowTestTraffic.
- Uma configuração CodeDeployDefault.OneAtATime, que atualiza uma tarefa por vez e as expõe em uma porta de teste.
- Um alias Lambda com pesos.
E: O blue/green de ECS do CodeDeploy usa target groups azul e verde; o listener de teste expõe o conjunto verde e o hook AfterAllowTestTraffic valida antes da troca de produção. As outras opções não oferecem esse fluxo.

Q: O que acontece quando o CodeDeploy faz um rollback automático?
- Ele apaga o deployment group.
+ Ele implanta novamente a última revisão bem-sucedida, como uma nova implantação.
- Ele restaura o snapshot das instâncias criado automaticamente antes de cada implantação.
- Ele desfaz as migrações do banco de dados.
E: O rollback é uma nova implantação da revisão anterior (ou, em Lambda e ECS, a volta do tráfego para a versão anterior). Não há snapshot de instâncias, o banco de dados não é desfeito e o deployment group é mantido.

Q: Uma equipe quer implantar em EC2 sem reduzir a capacidade durante a atualização e com rollback quase imediato, aceitando o custo de um segundo ambiente temporário. Qual tipo de implantação escolher?
+ Blue/green.
- In-place com HalfAtATime.
- In-place com OneAtATime.
- In-place com AllAtOnce.
E: Blue/green sobe um ambiente novo completo e desvia o tráfego; voltar é só desviar de novo. As opções in-place atualizam as mesmas instâncias, reduzindo capacidade ou causando indisponibilidade.

Q: A versão nova de uma aplicação remove uma coluna do banco usada pela versão anterior. Depois de um rollback, a versão anterior passa a falhar. Qual prática evita isso?
- Usar AllAtOnce.
- Desativar os rollbacks automáticos.
- Usar blue/green, que cria uma cópia do banco para o ambiente verde e volta para a cópia azul em caso de rollback.
+ Fazer migrações compatíveis com a versão anterior: adicionar antes e remover a coluna só quando ninguém a usar.
E: O rollback volta o código, não o esquema do banco. Mudanças de esquema em etapas (expandir e depois contrair) mantêm as duas versões funcionando. Nenhuma estratégia de implantação desfaz o banco automaticamente.

## Flashcards

F: Plataformas do CodeDeploy
V: EC2/On-premises (com agente), AWS Lambda (troca de alias) e Amazon ECS (blue/green com target groups).

F: Requisitos do CodeDeploy em EC2
V: CodeDeploy agent instalado e rodando; instance profile com acesso ao S3 da revisão; appspec.yml na raiz da revisão.

F: Configurações de implantação in-place em EC2
V: CodeDeployDefault.AllAtOnce, HalfAtATime, OneAtATime ou personalizada (mínimo de instâncias saudáveis).

F: Ordem dos hooks do appspec em EC2
V: ApplicationStop → DownloadBundle → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService (com LB, também Block/Allow Traffic).

F: Particularidade do hook ApplicationStop
V: Executa o script da revisão anterior (instalada). Se estiver quebrado, novas implantações falham nesse passo.

F: Configurações de implantação de Lambda
V: Canary (LambdaCanary10Percent5/10/15/30Minutes), Linear (LambdaLinear10PercentEvery1/2/3/10Minutes) e AllAtOnce.

F: Hooks da Lambda no CodeDeploy
V: BeforeAllowTraffic e AfterAllowTraffic, funções que chamam PutLifecycleEventHookExecutionStatus (Succeeded/Failed).

F: Hooks do ECS no CodeDeploy
V: BeforeInstall, AfterInstall, AfterAllowTestTraffic, BeforeAllowTraffic e AfterAllowTraffic.

F: Como funciona o rollback do CodeDeploy?
V: Automático por falha ou alarme do CloudWatch: implanta de novo a última revisão boa como nova implantação (Lambda/ECS: volta o tráfego).

F: Rolling vs. blue/green vs. canary
V: Rolling: lotes nas mesmas instâncias, sem custo extra. Blue/green: ambiente novo e troca rápida. Canary: fração pequena primeiro, depois o resto.
