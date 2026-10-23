# 06. Lambda: VPC, RDS Proxy, EFS, versões, aliases e Function URLs

## Mapa da aula
Esta aula fecha o bloco de Lambda com o que a prova cobra em cenários reais:

• quando colocar a função em uma VPC e o que muda no acesso à internet;
• NAT gateway e VPC endpoints;
• RDS Proxy para não esgotar conexões do banco;
• EFS para arquivos compartilhados e persistentes;
• versões imutáveis, $LATEST e aliases, inclusive com divisão de tráfego;
• Function URLs: um endpoint HTTPS direto para a função.

## Por padrão, a função não está na sua VPC
Sem configuração de VPC, a função roda em uma rede gerenciada pela AWS. Ela acessa a internet e as APIs públicas da AWS (S3, DynamoDB, SQS), mas não alcança recursos privados da sua VPC, como um RDS ou ElastiCache em subnet privada.

Para acessar recursos privados, configure a função com:
• subnets privadas (de preferência em mais de uma AZ);
• um ou mais security groups.

A Lambda cria interfaces de rede (ENIs Hyperplane) nas subnets, compartilhadas entre ambientes que usam a mesma combinação de subnet e security group. Para isso, a role de execução precisa de ec2:CreateNetworkInterface, ec2:DescribeNetworkInterfaces e ec2:DeleteNetworkInterface. A policy gerenciada AWSLambdaVPCAccessExecutionRole contém essas permissões e as de logs.

O security group do banco precisa aceitar conexões vindas do security group da função, na porta do banco.

## Função em VPC e acesso à internet
Depois de ligada a uma VPC, a função passa a usar a rede da VPC e perde o acesso direto à internet. Colocá-la em uma subnet pública não resolve: a função não recebe IP público.

Duas saídas, conforme o destino:
• Internet ou APIs de terceiros: subnet privada com rota para um NAT gateway que está em uma subnet pública com internet gateway.
• Serviços AWS sem passar pela internet: VPC endpoints. Gateway endpoints para S3 e DynamoDB (sem custo por hora); interface endpoints (PrivateLink) para os demais, como SQS, Secrets Manager e KMS.

Sintoma clássico na prova: "depois de colocar a função na VPC para acessar o RDS, as chamadas ao S3 (ou a uma API externa) começaram a dar timeout". A resposta é NAT gateway (internet) ou VPC endpoint (serviço AWS).

## RDS Proxy: conexões sob controle
Cada ambiente de execução abre suas próprias conexões. Com 500 execuções simultâneas, um banco relacional pode receber 500 conexões ou mais e recusar novas (too many connections), além de gastar CPU abrindo e fechando conexões.

O Amazon RDS Proxy fica entre a função e o banco (RDS MySQL, PostgreSQL, MariaDB, SQL Server ou Aurora):
• mantém um pool de conexões e reaproveita conexões entre invocações e ambientes;
• reduz o tempo de failover do banco;
• pode exigir autenticação IAM dos clientes e guardar as credenciais do banco no Secrets Manager.

O proxy fica na VPC, então a função também precisa estar. O código só troca o endpoint do banco pelo endpoint do proxy.

Na prova: "função Lambda esgota conexões do RDS em picos" → RDS Proxy (e, se necessário, limitar a concorrência). Abrir a conexão fora do handler ajuda a reutilizar, mas não resolve sozinho a soma de muitos ambientes.

## EFS: arquivos compartilhados e persistentes
O /tmp é local a cada ambiente e temporário. Quando várias execuções ou funções precisam do mesmo conjunto de arquivos, ou quando os arquivos precisam persistir, use Amazon EFS:

• a função monta o sistema de arquivos em um caminho começando por /mnt (por exemplo, /mnt/modelos);
• a conexão é feita por um access point do EFS;
• a função precisa estar na VPC onde estão os mount targets do EFS;
• os dados são compartilhados por todos os ambientes e persistem.

Casos típicos: modelos de machine learning grandes demais para o pacote, bibliotecas pesadas e arquivos que várias funções leem.

Comparação rápida:
• /tmp: até 10 GB, por ambiente, temporário, sem VPC.
• Layer: até o limite de 250 MB descompactado, somente leitura, parte do pacote.
• EFS: grande, compartilhado e persistente, exige VPC.
• S3: objetos duráveis, acessados por API.

## Versões: fotografias imutáveis
Enquanto você desenvolve, edita $LATEST, a versão mutável da função. Publicar uma versão cria uma fotografia imutável do código e da configuração (runtime, memória, variáveis de ambiente, timeout) com número sequencial: 1, 2, 3...

• ARN qualificado: arn:aws:lambda:us-east-1:111122223333:function:pedidos:3 aponta para a versão 3.
• ARN não qualificado (sem sufixo) aponta para $LATEST.
• Uma versão publicada não pode ser alterada. Para mudar uma variável de ambiente, edite $LATEST e publique outra versão.

Versões permitem voltar exatamente para um código que funcionava.

```bash
aws lambda publish-version --function-name pedidos --description "v2026.10.23"
aws lambda create-alias --function-name pedidos --name prod --function-version 3
aws lambda update-alias --function-name pedidos --name prod --function-version 4 \
    --routing-config 'AdditionalVersionWeights={"3"=0.9}'
```

## Aliases: nomes estáveis para versões
Um alias é um ponteiro com nome (prod, homolog, dev) para uma versão. Ele tem ARN próprio: ...:function:pedidos:prod.

Por que usar:
• API Gateway, regras do EventBridge e event source mappings apontam para o alias. Para promover uma versão, você só move o alias; os gatilhos não mudam.
• Rollback é mover o alias de volta.
• A concorrência provisionada e as permissões de invocação podem ser configuradas por alias.

Divisão de tráfego: um alias pode apontar para duas versões com pesos. No exemplo acima, o alias prod manda 10% para a versão 4 e 90% para a versão 3. É o mecanismo que o CodeDeploy usa para implantações canary e linear (aula 28).

Regras: um alias aponta para versões, não para outro alias, e a divisão de tráfego não pode envolver $LATEST.

## Ambientes com aliases
Um padrão comum para dev, homologação e produção em uma mesma conta:

• dev → $LATEST (ou a versão mais nova);
• homolog → versão candidata;
• prod → versão aprovada.

Cada estágio do API Gateway pode chamar um alias diferente, usando stage variables (aula 07): a integração aponta para pedidos:${stageVariables.alias}. Lembre-se de dar ao API Gateway permissão de invocar cada alias.

Ainda assim, para isolamento forte entre ambientes, a recomendação da AWS é usar contas separadas.

## Function URLs
Uma Function URL é um endpoint HTTPS dedicado para a função, no formato https://id-da-url.lambda-url.regiao.on.aws. Ela pode ser associada a $LATEST ou a um alias.

• AuthType AWS_IAM: o chamador assina a requisição com SigV4 e precisa de lambda:InvokeFunctionUrl.
• AuthType NONE: acesso público; a função recebe qualquer requisição. Você ainda pode limitar por código.
• Tem configuração de CORS própria e suporta streaming de resposta.
• O evento tem o mesmo formato do payload 2.0 das HTTP APIs do API Gateway.

Function URL é a forma mais simples de expor uma função por HTTP (webhooks, um endpoint interno). Se você precisa de autorizadores Cognito, usage plans com API keys, cache, transformação de requisições ou WAF, use o API Gateway.

## Pegadinhas frequentes
• Função em VPC não tem internet, nem em subnet pública. Use NAT gateway ou VPC endpoints.
• A role precisa das permissões de ENI (AWSLambdaVPCAccessExecutionRole) para entrar na VPC.
• RDS Proxy é a resposta para "muitas conexões ao RDS vindas da Lambda".
• EFS exige VPC; /tmp não é compartilhado.
• Versão publicada é imutável, incluindo variáveis de ambiente.
• Gatilhos devem apontar para alias, não para número de versão nem $LATEST em produção.
• Divisão de tráfego por alias não aceita $LATEST.

## Resumo para revisão
• VPC: subnets privadas + security group; permissões de ENI; sem internet.
• Saída: NAT gateway (internet) ou VPC endpoints (gateway para S3/DynamoDB; interface para os demais).
• RDS Proxy: pool de conexões, failover mais rápido, IAM auth, credenciais no Secrets Manager.
• EFS: montado em /mnt por access point, compartilhado e persistente, exige VPC.
• $LATEST é mutável; versões publicadas são imutáveis e numeradas.
• Alias aponta para versão (ou duas, com pesos); gatilhos apontam para o alias.
• Function URL: HTTPS direto, AuthType AWS_IAM ou NONE, CORS, streaming.

## Questões

Q: Uma função precisa consultar um banco RDS em uma subnet privada. O desenvolvedor configurou a função na VPC, mas a implantação falha com erro de permissão ao criar interfaces de rede. O que falta?
- Uma política de recurso na função permitindo ec2.amazonaws.com.
- Um NAT gateway na subnet privada.
- Um VPC endpoint para o RDS.
+ Permissões ec2:CreateNetworkInterface, DescribeNetworkInterfaces e DeleteNetworkInterface na role.
E: A Lambda cria ENIs nas subnets usando a role de execução; a policy AWSLambdaVPCAccessExecutionRole traz essas permissões. NAT gateway e endpoints tratam de saída de rede, não da criação das interfaces, e o EC2 não invoca a função.

Q: Depois de ligar uma função à VPC para acessar um RDS, as chamadas da função a uma API pública de pagamentos passaram a dar timeout. Qual é a correção?
- Mover a função para uma subnet pública.
+ Usar subnets privadas com rota para um NAT gateway em uma subnet pública.
- Aumentar o timeout da função para 15 minutos.
- Criar um gateway endpoint do S3.
E: Funções em VPC não recebem IP público, então mesmo em subnet pública não saem para a internet. O NAT gateway dá saída à internet para as subnets privadas. Gateway endpoint do S3 só alcança o S3, e aumentar o timeout não cria rota.

Q: Uma função em VPC precisa gravar no DynamoDB sem que o tráfego passe pela internet e sem custo por hora de NAT. Qual é a solução?
- Uma interface endpoint (PrivateLink) para o DynamoDB, que é a única opção disponível para manter o tráfego fora da internet.
- Retirar a função da VPC.
+ Um gateway endpoint do DynamoDB associado às tabelas de rotas das subnets da função.
- Um internet gateway associado à subnet privada, para que a função alcance o endpoint público do DynamoDB.
E: S3 e DynamoDB têm gateway endpoints, que não cobram por hora e mantêm o tráfego na rede da AWS. Internet gateway em subnet privada a tornaria pública e não dá IP público à função; retirar a função da VPC impediria o acesso ao recurso privado que motivou a VPC.

Q: Em picos de tráfego, uma função Lambda faz o banco Aurora PostgreSQL recusar conexões por excesso de conexões abertas. A equipe quer resolver com mudanças mínimas no código. Qual é a melhor solução?
+ Colocar um RDS Proxy entre a função e o banco e apontar o código para o endpoint do proxy.
- Aumentar a memória da função.
- Migrar o banco para DynamoDB, que não tem limite de conexões, reescrevendo as consultas da aplicação.
- Abrir e fechar a conexão dentro do handler a cada invocação, para que nenhuma conexão fique aberta entre as execuções.
E: O RDS Proxy mantém um pool e reaproveita conexões entre ambientes, protegendo o banco de picos. Abrir e fechar a cada invocação aumenta a carga de conexão; memória não reduz o número de conexões; e migrar de banco é uma mudança enorme.

Q: Várias funções Lambda precisam ler o mesmo conjunto de 20 GB de arquivos de modelo, que são atualizados semanalmente. Qual armazenamento atende?
- Variáveis de ambiente com os caminhos dos arquivos.
- O diretório /tmp de cada função, configurado com 20 GB e preenchido na primeira invocação de cada ambiente.
+ Um sistema de arquivos EFS montado nas funções por um access point.
- Uma layer Lambda com os arquivos.
E: EFS é compartilhado entre ambientes e funções, persistente e comporta grandes volumes. O /tmp vai até 10 GB e é por ambiente; layers somam no limite de 250 MB descompactado; variáveis de ambiente só guardam texto pequeno.

Q: Uma equipe publicou a versão 7 de uma função e depois percebeu que uma variável de ambiente estava errada. Como corrigir?
- Editar a variável diretamente na versão 7.
- Editar a variável no alias prod.
- Apagar a versão 7 e publicá-la de novo com o mesmo número, para que o alias prod continue apontando para ela.
+ Corrigir a variável em $LATEST, publicar a versão 8 e mover o alias para ela.
E: Versões publicadas são imutáveis, incluindo a configuração; o número também não é reutilizado. O alias não guarda variáveis de ambiente, apenas aponta para versões. O caminho é corrigir $LATEST, publicar outra versão e atualizar o alias.

Q: Uma API Gateway chama a função pelo ARN da versão 12. A cada nova versão, a equipe precisa alterar a integração e reimplantar a API. Como simplificar?
+ Apontar a integração para um alias (prod) e mover o alias a cada nova versão.
- Criar uma nova API a cada versão.
- Apontar a integração para $LATEST em produção, já que ele sempre contém o código mais recente publicado.
- Usar o ARN não qualificado da função.
E: Com o alias, a integração fica estável e a promoção é só mover o alias; o rollback também. $LATEST e o ARN não qualificado mudam a cada edição e não dão controle de versão em produção, e criar uma API por versão não faz sentido.

Q: Uma equipe quer mandar 10% do tráfego para a versão nova de uma função e 90% para a atual, sem mudar o cliente. Qual recurso permite isso?
- Duas Function URLs com AuthType NONE.
- Um alias apontando para outro alias.
+ Um alias com configuração de roteamento ponderado entre as duas versões.
- Concorrência reservada equivalente a 10% da concorrência total na versão nova e o restante na versão atual.
E: Aliases aceitam pesos entre duas versões publicadas (routing-config), base das implantações canary. Function URLs separadas exigiriam mudar o cliente, concorrência não divide tráfego, e um alias não pode apontar para outro alias.

Q: Uma equipe precisa expor uma função como webhook HTTPS, com a menor configuração possível, e quer exigir requisições assinadas com credenciais IAM. Qual é a solução?
- Um API Gateway REST com autorizador Lambda.
+ Uma Function URL com AuthType AWS_IAM.
- Uma Function URL com AuthType NONE e verificação de senha no código.
- Um Application Load Balancer com a função como alvo.
E: A Function URL dá um endpoint HTTPS direto, e AWS_IAM exige assinatura SigV4 e permissão lambda:InvokeFunctionUrl. API Gateway e ALB funcionam, mas têm mais peças; AuthType NONE deixa o endpoint público, e senha no código não é autenticação IAM.

Q: Qual afirmação sobre $LATEST está correta?
- Pode participar de divisão de tráfego em um alias.
- É uma versão imutável criada automaticamente a cada implantação, com número próprio e ARN qualificado.
+ É a versão mutável da função, para onde aponta o ARN não qualificado.
- Pode receber concorrência provisionada.
E: $LATEST é a versão editável, usada pelo ARN sem sufixo. Concorrência provisionada e roteamento ponderado exigem versões publicadas (ou alias que aponte para elas).

## Flashcards

F: O que a role precisa para uma Lambda entrar em uma VPC?
V: ec2:CreateNetworkInterface, ec2:DescribeNetworkInterfaces e ec2:DeleteNetworkInterface (policy AWSLambdaVPCAccessExecutionRole).

F: Lambda em VPC acessa a internet?
V: Não. Nem em subnet pública. Precisa de subnet privada com rota para NAT gateway, ou VPC endpoints para serviços AWS.

F: Quais serviços têm gateway endpoint na VPC?
V: S3 e DynamoDB (sem custo por hora). Os demais usam interface endpoints (PrivateLink).

F: Para que serve o RDS Proxy com Lambda?
V: Pool de conexões compartilhado, evitando esgotar conexões do banco; failover mais rápido; IAM auth; credenciais no Secrets Manager. Exige VPC.

F: Quando usar EFS com Lambda?
V: Quando várias execuções ou funções precisam dos mesmos arquivos, grandes e persistentes. Montado em /mnt por access point; exige VPC.

F: Diferença entre $LATEST e uma versão publicada
V: $LATEST é mutável e é o alvo do ARN não qualificado. Versão publicada é imutável (código e configuração) e tem número próprio.

F: O que é um alias Lambda?
V: Nome estável (ex.: prod) que aponta para uma versão, ou para duas com pesos. Tem ARN próprio. Não aponta para outro alias nem divide tráfego com $LATEST.

F: Como fazer canary com aliases manualmente?
V: update-alias com --routing-config AdditionalVersionWeights, por exemplo 10% para a versão nova e 90% para a atual.

F: O que é uma Function URL?
V: Endpoint HTTPS dedicado da função (lambda-url.regiao.on.aws), com AuthType AWS_IAM ou NONE, CORS e streaming. Pode apontar para alias.

F: Quando preferir API Gateway a Function URL?
V: Quando precisar de autorizadores Cognito/Lambda, usage plans e API keys, cache, transformação de requisições, validação ou WAF.
