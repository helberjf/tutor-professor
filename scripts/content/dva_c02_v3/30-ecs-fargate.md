# 30. Contêineres com ECS e Fargate: task definitions, roles e implantações

## Mapa da aula
Contêineres aparecem na prova em cenários de implantação e permissão. Nesta aula:

• cluster, task definition, task e service;
• EC2 launch type vs. Fargate;
• a task definition: imagem, CPU e memória, portas, variáveis, segredos, logs e health check;
• modos de rede: awsvpc e bridge com portas dinâmicas;
• as três roles: task role, task execution role e role da instância;
• rolling update com minimumHealthyPercent e maximumPercent, circuit breaker e blue/green;
• escalabilidade do serviço, estratégias de posicionamento, ECS Exec e tarefas agendadas.

## Peças do ECS
O Amazon Elastic Container Service (ECS) executa contêineres Docker:

• Cluster: agrupamento lógico onde tarefas e serviços rodam.
• Task definition: a receita, em JSON, de um ou mais contêineres que rodam juntos. Cada alteração cria uma nova revisão (familia:3, familia:4); revisões são imutáveis.
• Task: uma execução de uma task definition (um ou mais contêineres em execução).
• Service: mantém um número desejado de tarefas rodando, substitui as que falham, se integra a um load balancer e faz implantações e escalabilidade.

Use RunTask para tarefas pontuais (um job, uma migração), sozinhas ou agendadas pelo EventBridge Scheduler. Use um service para aplicações que precisam ficar no ar (APIs, consumidores de fila).

O Amazon EKS é a alternativa com Kubernetes, para equipes que já usam esse ecossistema.

## EC2 launch type vs. Fargate
EC2 launch type: as tarefas rodam em instâncias EC2 do cluster, que você gerencia (AMI otimizada para ECS, ECS agent, patches, escala das instâncias com capacity providers e Auto Scaling). Bom quando você precisa de tipos de instância específicos (GPU), de controle do host ou de custo otimizado com instâncias reservadas.

Fargate: serverless para contêineres. Você declara CPU e memória da tarefa (combinações válidas, como 0,5 vCPU com 1 GB) e paga por segundo pelo que a tarefa usa, sem gerenciar servidores. Exige o modo de rede awsvpc.

Na prova: "rodar contêineres com o menor esforço operacional, sem gerenciar servidores" → Fargate.

## A task definition
Principais campos de cada contêiner:
• image: a URI da imagem (por exemplo, no ECR);
• cpu e memory: memory é o limite rígido (o contêiner é encerrado se passar); memoryReservation é o limite flexível reservado;
• portMappings: porta do contêiner (e do host, no modo bridge);
• environment: variáveis de configuração em texto;
• secrets: variáveis cujo valor vem do Secrets Manager ou do Parameter Store (valueFrom com o ARN), injetadas na inicialização;
• logConfiguration: o driver awslogs envia stdout e stderr ao CloudWatch Logs (FireLens permite rotear para outros destinos);
• healthCheck: comando que diz se o contêiner está saudável;
• essential: se um contêiner essencial para, a tarefa inteira para.

No nível da tarefa: networkMode, as roles (taskRoleArn e executionRoleArn) e, no Fargate, CPU e memória totais.

```json
{
  "family": "api-pedidos",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "taskRoleArn": "arn:aws:iam::111122223333:role/api-pedidos-task",
  "executionRoleArn": "arn:aws:iam::111122223333:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "api",
    "image": "111122223333.dkr.ecr.sa-east-1.amazonaws.com/api-pedidos:1.8.0",
    "essential": true,
    "portMappings": [{"containerPort": 8080}],
    "environment": [{"name": "AMBIENTE", "value": "prod"}],
    "secrets": [{"name": "DB_PASSWORD",
                 "valueFrom": "arn:aws:secretsmanager:sa-east-1:111122223333:secret:prod/banco"}],
    "logConfiguration": {"logDriver": "awslogs",
      "options": {"awslogs-group": "/ecs/api-pedidos", "awslogs-region": "sa-east-1",
                  "awslogs-stream-prefix": "api"}}
  }]
}
```

## Modos de rede
• awsvpc: cada tarefa recebe sua própria interface de rede (ENI) e IP da VPC, com security groups por tarefa. Obrigatório no Fargate e recomendado em geral. No load balancer, o target group usa o tipo ip.
• bridge (EC2): os contêineres usam a rede Docker da instância. Com mapeamento de porta dinâmico (hostPort 0), o ECS escolhe uma porta livre do host para cada tarefa, e o ALB registra instância e porta automaticamente. Isso permite várias tarefas iguais na mesma instância. O security group da instância precisa permitir a faixa de portas dinâmicas vinda do load balancer.
• host: o contêiner usa diretamente a rede da instância (uma tarefa por porta por host).

Na prova: "rodar várias cópias da mesma tarefa na mesma instância EC2 atrás de um ALB" → bridge com mapeamento de porta dinâmico.

## As três roles
• Task role: as permissões do código da aplicação dentro do contêiner (ler o S3, gravar no DynamoDB, publicar no SQS). O SDK obtém as credenciais pelo endpoint de credenciais do contêiner. É a resposta para "como dar permissão à aplicação no contêiner".
• Task execution role: as permissões do agente do ECS para preparar a tarefa: baixar a imagem do ECR, enviar logs ao CloudWatch e buscar os segredos referenciados em secrets (Secrets Manager, Parameter Store e kms:Decrypt). A policy gerenciada AmazonECSTaskExecutionRolePolicy cobre ECR e logs; segredos exigem permissões adicionais.
• Role da instância (só EC2 launch type): permite que o agente do ECS na instância se registre no cluster e funcione (ecsInstanceRole).

Erros típicos:
• "CannotPullContainerError" ou falha ao buscar segredos na inicialização → problema na task execution role (ou na rede até o ECR).
• A aplicação recebe AccessDenied ao acessar o DynamoDB → falta permissão na task role.
• Nunca use a role da instância para dar permissões às aplicações: todas as tarefas da instância herdariam essas permissões.

## Implantação rolling e circuit breaker
Ao atualizar um service com uma nova revisão da task definition, o padrão é o rolling update, controlado por:

• minimumHealthyPercent: quantas tarefas (em % do desejado) precisam continuar saudáveis durante a implantação;
• maximumPercent: quantas tarefas podem existir ao mesmo tempo (em % do desejado), contando antigas e novas.

Exemplo com 4 tarefas desejadas:
• mínimo 100% e máximo 200%: o ECS sobe até 4 novas antes de parar as antigas (capacidade total, precisa de espaço para até 8 tarefas);
• mínimo 50% e máximo 100%: o ECS para 2 antigas, sobe 2 novas, e repete (sem capacidade extra, mas com metade da capacidade durante a troca).

Se o cluster EC2 não tem espaço para as tarefas extras do maximumPercent, a implantação fica parada.

Deployment circuit breaker: detecta quando as tarefas novas não ficam saudáveis (não iniciam ou falham no health check) e marca a implantação como falha; com rollback ativado, volta automaticamente para a última implantação que funcionava. Sem ele, o ECS pode ficar tentando iniciar tarefas defeituosas indefinidamente.

Para blue/green com listener de teste e hooks, use o CodeDeploy (aula 28). O ECS também oferece estratégias blue/green, linear e canary nativas no próprio service.

## Escalabilidade e posicionamento
Service Auto Scaling ajusta o número de tarefas:
• target tracking: manter a CPU média em 60%, a memória ou as requisições por alvo do ALB (ALBRequestCountPerTarget);
• step scaling: passos por faixas de alarme;
• scheduled scaling: horários previstos.

Para consumidores de fila, escale pelo backlog por tarefa (aula 12).

No EC2 launch type, a escala das instâncias é feita por capacity providers ligados a Auto Scaling groups, que adicionam instâncias quando faltam recursos para as tarefas.

Estratégias de posicionamento (EC2 launch type):
• binpack: concentra tarefas nas instâncias para usar menos instâncias (menor custo);
• spread: espalha por AZs ou instâncias (maior disponibilidade);
• random.
Restrições: distinctInstance (uma tarefa por instância) e memberOf (expressão sobre atributos, como tipo de instância).

## Operação: logs, debug e descoberta
• Logs: driver awslogs para o CloudWatch Logs; o log group precisa existir ou a execution role precisa poder criá-lo.
• ECS Exec: abre um shell ou executa um comando dentro de um contêiner em execução (inclusive no Fargate), usando o Systems Manager, sem SSH. A task role precisa das permissões do SSM Messages e o service precisa ter execute command habilitado.
• Rastreamento: um contêiner sidecar com o ADOT Collector (ou o daemon do X-Ray) recebe os traces das aplicações da tarefa (aula 32).
• Descoberta de serviços: ECS Service Connect e AWS Cloud Map dão nomes estáveis para um serviço chamar o outro.
• Container Insights, do CloudWatch, mostra métricas de CPU, memória e rede por cluster, serviço e tarefa.

## Pegadinhas frequentes
• Permissões da aplicação: task role. Puxar imagem, logs e segredos: task execution role.
• Fargate exige awsvpc e CPU/memória no nível da tarefa.
• Várias tarefas na mesma instância EC2 com ALB: bridge + porta dinâmica (hostPort 0).
• maximumPercent alto exige capacidade livre no cluster EC2.
• Circuit breaker com rollback evita implantações presas em tarefas defeituosas.
• memory é o limite rígido; passar dele encerra o contêiner (OutOfMemory).
• Segredos na task definition: secrets com valueFrom, não environment em texto.

## Resumo para revisão
• Cluster, task definition (revisões imutáveis), task, service.
• EC2 launch type (você gerencia instâncias, capacity providers) vs. Fargate (serverless, awsvpc, por segundo).
• Task definition: image, cpu, memory/memoryReservation, portMappings, environment, secrets (valueFrom), awslogs, healthCheck, essential.
• Rede: awsvpc (ENI por tarefa, target type ip), bridge com porta dinâmica, host.
• Roles: task role (aplicação), task execution role (ECR, logs, segredos), instance role (agente no EC2).
• Rolling: minimumHealthyPercent e maximumPercent; circuit breaker com rollback; blue/green via CodeDeploy ou nativo.
• Auto Scaling: target tracking (CPU, memória, ALBRequestCountPerTarget), step, scheduled. Placement: binpack, spread, random; distinctInstance, memberOf.
• ECS Exec, Container Insights, Service Connect, sidecar ADOT/X-Ray.

## Questões

Q: Uma aplicação em contêiner no Fargate precisa gravar objetos em um bucket S3. Onde configurar a permissão?
+ Na task role da task definition.
- Na role da instância EC2 do cluster.
- Na task execution role.
- Em variáveis de ambiente com chaves de acesso.
E: A task role fornece as credenciais usadas pelo código dentro do contêiner. A execution role é do agente do ECS (imagem, logs e segredos), no Fargate não há instâncias suas, e chaves em variáveis são inseguras.

Q: Uma tarefa no Fargate não inicia e mostra CannotPullContainerError ao baixar a imagem de um repositório ECR privado. A rede está correta. O que verificar?
- O service precisa de minimumHealthyPercent de 100%.
+ A task execution role precisa de permissões do ECR (como as da AmazonECSTaskExecutionRolePolicy).
- A task role precisa de s3:GetObject.
- O contêiner precisa de memoryReservation.
E: Quem baixa a imagem é o agente do ECS, com a task execution role. A task role é para a aplicação, e os parâmetros de implantação e memória não afetam a autenticação no ECR.

Q: A senha do banco deve chegar ao contêiner como variável de ambiente sem aparecer em texto na task definition. Como configurar?
- Colocar a senha no Dockerfile.
+ Usar secrets com valueFrom apontando para o segredo no Secrets Manager, com acesso na task execution role.
- Passar a senha como tag da imagem.
- Colocar a senha em environment.
E: Em secrets, o ECS busca o valor no momento da inicialização com a execution role e injeta a variável. environment, Dockerfile e tags expõem o valor.

Q: Um serviço com 6 tarefas desejadas precisa manter 100% da capacidade durante implantações. O cluster usa Fargate. Quais parâmetros usar?
+ minimumHealthyPercent 100 e maximumPercent 200.
- minimumHealthyPercent 50 e maximumPercent 100.
- minimumHealthyPercent 0 e maximumPercent 100.
- minimumHealthyPercent 100 e maximumPercent 100.
E: Com mínimo de 100%, nenhuma tarefa antiga para antes de as novas estarem saudáveis, e o máximo de 200% permite subir as novas ao lado. Mínimo 50% ou 0% reduz a capacidade, e 100/100 não deixa espaço para tarefas novas, travando a implantação.

Q: Uma implantação de ECS fica horas tentando iniciar tarefas novas que falham no health check, sem terminar. O que evita esse problema e volta para a versão anterior automaticamente?
- Usar a estratégia de posicionamento binpack, concentrando as tarefas novas nas instâncias mais saudáveis.
+ Ativar o deployment circuit breaker com rollback no service.
- Aumentar o maximumPercent.
- Trocar o modo de rede para host, para que o health check acesse as tarefas pela porta da instância.
E: O circuit breaker detecta que as novas tarefas não estabilizam e, com rollback, retorna à última implantação estável. Os outros ajustes não detectam falhas de implantação.

Q: Em um cluster com EC2 launch type, a equipe quer rodar várias tarefas iguais na mesma instância, atrás de um ALB, todas com o contêiner escutando na porta 8080. Como configurar?
+ Modo bridge com mapeamento de porta dinâmico (hostPort 0) e o ALB registrando instância e porta.
- Modo awsvpc com a mesma ENI para todas as tarefas da instância, cada uma escutando na porta 8080 dela.
- Uma instância por tarefa com a restrição distinctInstance, e o ALB registrando cada instância na porta 8080.
- Modo host com hostPort 8080.
E: No bridge com porta dinâmica, cada tarefa recebe uma porta diferente do host, e o ALB envia para cada uma. No modo host, só uma tarefa pode usar a porta 8080 por instância; distinctInstance obriga uma tarefa por instância; e no awsvpc cada tarefa tem sua própria ENI.

Q: Uma empresa quer rodar contêineres para uma API sem gerenciar servidores, sistema operacional ou capacidade do cluster. Qual opção escolher?
+ ECS com Fargate.
- Instâncias EC2 com Docker instalado.
- ECS com EC2 launch type e capacity providers.
- EKS com nós gerenciados por você.
E: Fargate executa as tarefas sem servidores para gerenciar, cobrando por recursos da tarefa. As outras opções exigem administrar instâncias.

Q: Um desenvolvedor precisa executar um comando de diagnóstico dentro de um contêiner em execução no Fargate, sem abrir SSH. O que usar?
- Uma nova revisão da task definition com um shell interativo exposto na porta 22 do contêiner.
- CloudWatch Logs Insights.
+ ECS Exec, com execute command habilitado no service e permissões do SSM na task role.
- Uma porta SSH no security group.
E: O ECS Exec usa o Systems Manager para abrir um shell ou executar comandos no contêiner, sem SSH. Logs Insights consulta logs e uma nova revisão não dá acesso interativo a uma tarefa existente.

Q: Um cluster EC2 deve usar o menor número possível de instâncias para reduzir o custo, concentrando as tarefas. Qual estratégia de posicionamento usar?
- random
- spread
+ binpack
- distinctInstance
E: binpack preenche as instâncias antes de usar outras, reduzindo a quantidade de instâncias. spread espalha para disponibilidade, random não otimiza e distinctInstance é uma restrição que obriga uma tarefa por instância.

Q: Um service ECS consome uma API externa e a CPU fica alta nos horários de pico. A equipe quer que o número de tarefas aumente e diminua automaticamente para manter a CPU em torno de 60%. O que configurar?
- maximumPercent de 300%.
- Uma estratégia de posicionamento spread.
- Scheduled scaling às 9h e às 18h, aumentando e diminuindo o desired count nos horários de pico conhecidos.
+ Service Auto Scaling com target tracking na métrica de CPU média do serviço em 60%.
E: Target tracking ajusta o desired count para manter a métrica no alvo. Agendamento não acompanha a variação real, posicionamento não muda a quantidade e maximumPercent só vale durante implantações.

## Flashcards

F: Peças do Amazon ECS
V: Cluster, task definition (receita versionada, revisões imutáveis), task (execução) e service (mantém tarefas, integra ao load balancer, implanta e escala).

F: EC2 launch type vs. Fargate
V: EC2: você gerencia instâncias (agente, AMI, capacity providers). Fargate: serverless, CPU/memória por tarefa, cobrança por segundo, exige awsvpc.

F: Task role vs. task execution role
V: Task role: permissões do código da aplicação. Execution role: agente do ECS baixar imagem do ECR, enviar logs e buscar segredos.

F: Como passar segredos a um contêiner ECS?
V: Campo secrets com valueFrom (ARN do Secrets Manager ou Parameter Store); a execution role precisa ler o segredo (e kms:Decrypt).

F: Modos de rede do ECS
V: awsvpc (ENI e security group por tarefa; obrigatório no Fargate), bridge (rede Docker; porta dinâmica com hostPort 0) e host.

F: minimumHealthyPercent e maximumPercent
V: Mínimo de tarefas saudáveis e máximo de tarefas simultâneas (% do desejado) durante um rolling update. 100/200 mantém capacidade total.

F: O que é o deployment circuit breaker do ECS?
V: Detecta implantações cujas tarefas não estabilizam e as marca como falha; com rollback, volta para a última implantação estável.

F: Estratégias de posicionamento do ECS
V: binpack (menos instâncias), spread (espalhar por AZ/instância), random. Restrições: distinctInstance e memberOf.

F: Métricas de target tracking para serviços ECS
V: CPU média, memória média e ALBRequestCountPerTarget.

F: O que é ECS Exec?
V: Execução de comandos ou shell em contêineres em execução via Systems Manager, sem SSH; exige execute command habilitado e permissões do SSM na task role.
