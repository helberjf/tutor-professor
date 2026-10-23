# 01. A prova DVA-C02 e os fundamentos da AWS

## Mapa da aula
Esta aula prepara o terreno para as outras 33. Ao terminar, você saberá:

• como a prova é montada, quanto tempo dura e como a nota funciona;
• o peso de cada domínio e como este curso cobre cada um;
• os conceitos básicos que aparecem em quase toda questão: Região, zona de disponibilidade, ARN, conta, usuário, grupo e role;
• uma técnica para ler os enunciados longos e eliminar alternativas.

Se você já trabalha com AWS, leia rápido as partes de fundamentos e concentre-se na estratégia de prova.

## Formato da prova
A DVA-C02 (AWS Certified Developer – Associate) tem 65 questões em 130 minutos.

• 50 questões valem nota e 15 são experimentais. Você não sabe quais são as experimentais, então trate todas como valendo.
• Tipos: múltipla escolha (uma correta entre quatro) e múltipla resposta (duas ou mais corretas entre cinco ou mais; o enunciado diz quantas marcar).
• Não há penalidade por erro. Nunca deixe questão em branco.
• A nota é escalonada de 100 a 1000. A aprovação exige 720.
• A pontuação é compensatória: você não precisa passar em cada domínio, só no total.

Se o inglês não é sua língua nativa e você fizer a prova em inglês, pode pedir a acomodação ESL, que dá 30 minutos extras. O pedido é feito na sua conta de certificação antes de agendar.

A AWS anunciou a substituição pela DVA-C03 a partir de dezembro de 2026; as fontes indicam 30/11/2026 como último dia da C02. Confira a data no site oficial ao agendar.

## Os quatro domínios e onde estão neste curso
• Domínio 1 – Desenvolvimento com serviços AWS (32%): SDK, Lambda, API Gateway, DynamoDB, S3, SQS, SNS, EventBridge, Kinesis, Step Functions, cache e AppSync. Aulas 02 a 17.
• Domínio 2 – Segurança (26%): IAM, STS, Cognito, KMS, criptografia, segredos e dados sensíveis. Aulas 18 a 22.
• Domínio 3 – Implantação (24%): pacotes, CloudFormation, SAM, CDK, testes, CodeBuild, CodePipeline, CodeDeploy, Elastic Beanstalk e contêineres. Aulas 23 a 30.
• Domínio 4 – Solução de problemas e otimização (18%): CloudWatch, CloudTrail, X-Ray, OpenTelemetry, códigos de erro e desempenho. Aulas 31 a 33.

A aula 34 é uma revisão final com números, palavras-chave e pegadinhas.

Somados, desenvolvimento e segurança são quase 60% da prova. Lambda, DynamoDB, API Gateway, IAM e KMS aparecem em muitas questões, mesmo quando o tema principal é outro.

## Região, zona de disponibilidade e serviços globais
Uma Região é uma área geográfica com vários data centers, como us-east-1 (Norte da Virgínia) ou sa-east-1 (São Paulo). Cada Região tem duas ou mais zonas de disponibilidade (AZs): grupos de data centers isolados entre si, com energia e rede próprias, ligados por rede de baixa latência.

O que importa para um desenvolvedor:

• A maioria dos recursos é regional. Uma função Lambda criada em us-east-1 não existe em sa-east-1.
• Seu código precisa saber em que Região chamar a API. Região errada é causa clássica de "recurso não encontrado".
• Alguns serviços são globais: IAM, Route 53 e CloudFront.
• No S3, o nome do bucket é único no mundo todo, mas o bucket vive em uma Região.
• Pontos de presença (edge locations) são usados por CloudFront e Lambda@Edge para servir conteúdo perto do usuário.

Na prova: "alta disponibilidade" costuma significar distribuir em várias AZs; "recuperação de desastre" ou "latência para usuários em outro continente" costuma envolver outra Região.

## Conta, usuário raiz, usuários, grupos e roles
Uma conta AWS é a fronteira de cobrança e de isolamento de recursos. Dentro dela:

• Usuário raiz (root): o e-mail que criou a conta. Tem acesso total. Proteja com MFA e não use no dia a dia nem crie chaves de acesso para ele.
• Usuário IAM: uma identidade com credenciais de longo prazo (senha e/ou chaves de acesso).
• Grupo IAM: um conjunto de usuários que recebem as mesmas políticas. Grupo não é identidade: não faz login e não pode ser principal em uma policy.
• Role IAM: uma identidade sem credencial fixa. Quem assume a role recebe credenciais temporárias. Serviços (Lambda, EC2, ECS), aplicações e pessoas de outras contas usam roles.

Regra de ouro da prova: código rodando na AWS usa role, nunca chave de acesso gravada no código ou em variável de ambiente. Lambda usa a role de execução, EC2 usa o instance profile e ECS usa a task role.

## ARN: o endereço de um recurso
ARN (Amazon Resource Name) identifica qualquer recurso de forma única. Formato:

arn:partição:serviço:região:conta:recurso

Exemplos:
• arn:aws:lambda:us-east-1:111122223333:function:processar-pedido
• arn:aws:dynamodb:us-east-1:111122223333:table/Pedidos
• arn:aws:s3:::meu-bucket/fotos/gato.png (S3 não tem Região nem conta no ARN)
• arn:aws:iam::111122223333:role/MinhaRole (IAM é global, então a Região fica vazia)

ARNs aparecem em policies (campo Resource), em destinos de eventos e em mensagens de erro. Saber ler um ARN ajuda a descobrir se o problema é de conta, de Região ou de nome do recurso.

## Modelo de responsabilidade compartilhada
A AWS cuida da segurança da nuvem: hardware, data centers, rede física e o software dos serviços gerenciados. Você cuida da segurança na nuvem: seu código, quem tem permissão, configuração dos recursos e criptografia dos seus dados.

Quanto mais gerenciado o serviço, menos você cuida. Em EC2, você aplica patches no sistema operacional. Em Lambda, a AWS cuida do sistema operacional e do runtime gerenciado; você cuida do código, das dependências e das permissões.

Na prova, isso aparece como "qual solução tem MENOR esforço operacional": a resposta quase sempre é o serviço mais gerenciado que atende ao requisito.

## Como ler uma questão da prova
As questões são cenários de três a seis linhas. Use sempre a mesma ordem:

1. Leia a última frase primeiro. Ela diz o que se pede: "qual solução", "quais DUAS ações", "qual é a causa".
2. Marque o critério de desempate: MENOR esforço operacional, MAIS econômica, MENOR latência, SEM alterar o código, MAIS segura.
3. Marque as restrições: "em tempo real", "na ordem", "exatamente uma vez", "sem gerenciar servidores", "credenciais temporárias".
4. Elimine o que não atende a uma restrição. Normalmente sobram duas alternativas.
5. Entre as duas, escolha a que atende ao critério de desempate com menos peças.

Alternativas com serviços demais, código customizado onde existe recurso nativo ou chaves de acesso fixas costumam estar erradas.

## Palavras-chave que apontam para uma resposta
• "Desacoplar", "absorver picos", "processar depois" → SQS.
• "Vários consumidores recebem a mesma mensagem" (fan-out) → SNS com várias filas SQS, ou EventBridge.
• "Ordem garantida" → SQS FIFO, ou Kinesis por partition key.
• "Streaming em tempo real", "replay de registros" → Kinesis Data Streams.
• "Orquestrar etapas com retries e espera" → Step Functions.
• "Credenciais temporárias" → STS e roles.
• "Usuários do aplicativo fazem login" → Cognito user pool. "Usuários acessam S3/DynamoDB direto do app" → Cognito identity pool.
• "Rotação automática de senha do banco" → Secrets Manager.
• "Configuração sem segredo, hierárquica, barata" → Parameter Store.
• "Rastrear latência entre serviços" → X-Ray.
• "Implantar aos poucos e voltar automaticamente" → CodeDeploy com canary/linear e alarmes.

## Como estudar com este aplicativo
Cada aula tem leitura, 10 questões de estudo e 10 flashcards. Um ciclo que funciona:

1. Leia a aula inteira uma vez, sem anotar.
2. Responda às questões. Errou? Volte à seção correspondente.
3. Revise os flashcards todos os dias. A repetição espaçada é o que fixa números e nomes de API.
4. A cada bloco de domínio, faça um simulado. Meta: 80% ou mais nos simulados antes de agendar.

Na semana da prova, releia as seções "Resumo para revisão" de todas as aulas e a aula 34.

## TypeScript neste curso
Todos os exemplos de código usam TypeScript em Node.js. As ferramentas que aparecem ao longo das aulas:

• AWS SDK for JavaScript v3: um pacote por serviço (@aws-sdk/client-s3, @aws-sdk/client-dynamodb), clients com client.send(new XxxCommand(...)), funções paginate* e waitUntil*; @aws-sdk/lib-dynamodb para trabalhar com objetos comuns no DynamoDB (aula 02).
• Handlers async com os tipos de @types/aws-lambda (APIGatewayProxyEvent, SQSEvent, Context) e o handler configurado como index.handler (aula 03).
• esbuild para transpilar e empacotar: no SAM com Metadata BuildMethod: esbuild e no CDK com o construct NodejsFunction (aulas 23 e 25).
• Powertools for AWS Lambda (TypeScript): Logger, Metrics (EMF), Tracer (X-Ray), Parameters e Idempotency (aulas 02, 22, 31 e 32).
• Jest com aws-sdk-client-mock para testes unitários, e o AWS CDK em TypeScript para infraestrutura (aulas 25 e 26).

A prova em si não depende de linguagem: as questões falam de serviços, configurações e APIs. Algumas citam recursos de outras linguagens (por exemplo, o SnapStart, que existe para Java, Python e .NET, mas não para Node.js); a aula avisa quando isso acontece.

## Pegadinhas frequentes
• Grupo IAM não é principal: não aparece em trust policy nem em resource policy.
• Chave de acesso em variável de ambiente da Lambda não é "mais segura" que no código. A resposta certa é a role de execução.
• "Global" vs. "regional": um recurso criado em uma Região não aparece em outra. Antes de suspeitar de permissão, confira a Região.
• Questão de múltipla resposta pede um número exato de alternativas. Marcar a mais ou a menos zera a questão.

## Resumo para revisão
• 65 questões, 130 minutos, nota 100–1000, aprovação com 720, 15 questões não pontuadas.
• Domínios: desenvolvimento 32%, segurança 26%, implantação 24%, solução de problemas e otimização 18%.
• Região tem várias AZs; IAM, Route 53 e CloudFront são globais.
• ARN: arn:partição:serviço:região:conta:recurso.
• Código na AWS usa role com credenciais temporárias, nunca chave fixa.
• Leia a última frase, marque o critério de desempate e elimine pelas restrições.

## Questões

Q: Uma desenvolvedora está agendando a DVA-C02 em inglês, que não é sua língua nativa. Ela quer mais tempo para ler os cenários longos. O que ela deve fazer?
- Pedir ao fiscal, no início da prova, os 30 minutos extras previstos para candidatos estrangeiros.
- Escolher a prova em outro idioma, que tem automaticamente 30 minutos extras.
- Nada, porque a prova não tem limite de tempo.
+ Solicitar a acomodação ESL na conta de certificação antes de agendar.
E: A acomodação ESL dá 30 minutos extras e precisa ser pedida antes do agendamento. O fiscal não pode conceder tempo extra durante a prova, a troca de idioma não acrescenta tempo por si só e a prova tem limite de 130 minutos.

Q: Um candidato acertou bem as questões de desenvolvimento, mas foi mal em implantação. Como isso afeta a aprovação?
- Os domínios com nota baixa são descartados do cálculo.
+ Conta a nota total escalonada, que precisa chegar a 720.
- Ele é reprovado, porque precisa de 720 em cada domínio.
- Ele é reprovado, porque precisa de 70% em cada domínio.
E: A prova usa pontuação compensatória. O desempenho por domínio aparece no relatório, mas a aprovação depende só da nota total escalonada de 720 ou mais. Não há nota mínima por domínio nem descarte de domínios.

Q: Uma função Lambda precisa ler uma tabela DynamoDB. Um colega sugere gravar uma chave de acesso de um usuário IAM nas variáveis de ambiente da função. Qual é a forma recomendada?
- Criar um usuário IAM exclusivo para a função e rotacionar a chave por mês.
- Gravar a chave em variáveis de ambiente criptografadas com KMS.
+ Conceder a permissão de leitura na role de execução da função.
- Gravar a chave no código, em um arquivo separado de configuração.
E: Lambda recebe credenciais temporárias da role de execução, que o SDK encontra automaticamente. Chaves de longo prazo, mesmo criptografadas ou rotacionadas, continuam sendo segredos que podem vazar e precisam ser gerenciados; é exatamente o que a role elimina.

Q: Um aplicativo funciona em us-east-1. Ao apontar o mesmo código para uma tabela criada em sa-east-1, ele recebe ResourceNotFoundException, embora a permissão IAM esteja correta. Qual é a causa mais provável?
- Tabelas DynamoDB só podem ser lidas na Região us-east-1.
+ O cliente do SDK está configurado para outra Região, onde a tabela não existe.
- O IAM é regional e a permissão não vale em sa-east-1.
- O nome da tabela precisa ser único no mundo todo.
E: DynamoDB é regional: o cliente procura a tabela na Região em que foi configurado. O IAM é global, então a permissão vale em todas as Regiões; tabelas existem em qualquer Região; e o nome só precisa ser único dentro da conta e da Região.

Q: Qual destes ARNs identifica corretamente uma role IAM?
- arn:aws:iam:us-east-1:111122223333:role/App
- arn:aws:sts:us-east-1:111122223333:role/App
+ arn:aws:iam::111122223333:role/App
- arn:aws:iam:::role/App
E: IAM é global, por isso o campo de Região fica vazio, mas a conta é obrigatória: arn:aws:iam::conta:role/nome. O ARN com Região está errado para IAM; sem conta, ele não identifica de qual conta é a role; e sts é o serviço que emite credenciais, não o que armazena roles.

Q: Uma equipe precisa escolher entre rodar uma API em EC2 ou em Lambda. O requisito principal é o MENOR esforço operacional. Qual escolha e por quê?
- EC2 com Auto Scaling, porque escala automaticamente sem nenhuma configuração nem manutenção de sistema operacional.
- EC2, porque a equipe controla o sistema operacional.
+ Lambda, porque a AWS gerencia servidores, sistema operacional e escalabilidade.
- Tanto faz, pois a responsabilidade compartilhada é igual nos dois e a AWS aplica os patches em ambos.
E: Em serviços mais gerenciados, a AWS assume mais responsabilidades. Em Lambda, você cuida do código e das permissões; em EC2, também de patches, AMI, capacidade e Auto Scaling. Controlar o sistema operacional aumenta o esforço, e a divisão de responsabilidades muda de serviço para serviço.

Q: Em uma questão de múltipla resposta, o enunciado pede "Quais DUAS ações...". O candidato tem certeza de uma alternativa e dúvida entre outras duas. Qual é a melhor estratégia?
- Marcar as três, porque a prova dá pontos parciais para cada alternativa correta marcada.
- Marcar só a alternativa de que tem certeza.
- Deixar em branco e voltar só se sobrar tempo.
+ Marcar exatamente duas, escolhendo a mais provável entre as duvidosas.
E: A questão só pontua se o conjunto marcado for exatamente o correto; não há ponto parcial. Marcar três ou uma garante erro. Não há penalidade por chute, então nunca deixe em branco.

Q: Um cenário pede: "várias aplicações devem receber cada pedido criado, e cada uma processa no seu ritmo". Qual padrão a palavra-chave indica?
- Uma função Lambda que recebe o pedido e chama a API de cada aplicação em sequência, repetindo se alguma falhar.
- Uma fila SQS FIFO com um grupo de mensagens por aplicação.
- Uma única fila SQS lida por todas as aplicações.
+ Fan-out com um tópico SNS (ou regra EventBridge) entregando a uma fila SQS por aplicação.
E: Fan-out entrega uma cópia da mesma mensagem a vários assinantes; uma fila por consumidor permite que cada um processe no seu ritmo. Em uma única fila, cada mensagem vai para um só consumidor; FIFO trata de ordem, não de cópias; e uma Lambda chamando todos cria acoplamento e um ponto de falha.

Q: Qual afirmação sobre grupos IAM está correta?
+ Um grupo serve para aplicar as mesmas políticas a vários usuários.
- Um grupo pode conter outros grupos.
- Um grupo pode ser o principal em uma trust policy, permitindo que todos os membros assumam a role.
- Um grupo pode receber chaves de acesso próprias.
E: Grupo é só um agrupamento de usuários para anexar políticas. Ele não é identidade, então não tem credenciais, não aparece como principal em policies e não pode ser aninhado em outro grupo.

Q: Um enunciado diz: "a empresa quer processar os eventos em tempo real e poder reprocessar os registros das últimas 24 horas". Qual serviço a palavra-chave aponta?
- Amazon SQS Standard com retenção de 14 dias.
- AWS Step Functions.
- Amazon SNS.
+ Amazon Kinesis Data Streams.
E: Kinesis Data Streams guarda os registros por um período de retenção (24 horas por padrão, ampliável) e permite que consumidores releiam a partir de um ponto. Em SQS, a mensagem some depois de apagada; SNS não guarda mensagens para releitura; e Step Functions orquestra etapas, não armazena um fluxo de eventos.

## Flashcards

F: Quantas questões e quanto tempo tem a DVA-C02?
V: 65 questões (50 pontuadas e 15 não pontuadas) em 130 minutos.

F: Qual é a nota de aprovação da DVA-C02?
V: 720, em uma escala de 100 a 1000. A pontuação é compensatória: conta o total, não cada domínio.

F: Quais são os pesos dos domínios da DVA-C02?
V: Desenvolvimento 32%, Segurança 26%, Implantação 24%, Solução de problemas e otimização 18%.

F: O que é a acomodação ESL?
V: 30 minutos extras para quem faz a prova em inglês sem ser falante nativo. Deve ser solicitada antes de agendar.

F: Formato de um ARN
V: arn:partição:serviço:região:conta:recurso. IAM não tem Região; S3 não tem Região nem conta.

F: Quais serviços da AWS são globais (não regionais)?
V: IAM, Route 53 e CloudFront. No S3, o nome do bucket é global, mas o bucket fica em uma Região.

F: Qual é a diferença entre usuário IAM e role IAM?
V: Usuário tem credenciais de longo prazo. Role não tem credencial fixa: quem a assume recebe credenciais temporárias do STS.

F: Como código rodando em Lambda, EC2 ou ECS deve obter credenciais AWS?
V: Pela role do serviço: role de execução (Lambda), instance profile (EC2) ou task role (ECS). Nunca com chaves fixas.

F: O que significa "MENOR esforço operacional" em uma questão?
V: Escolher o serviço mais gerenciado e com menos peças que atenda ao requisito, evitando código customizado e servidores próprios.

F: Uma questão de múltipla resposta dá ponto parcial?
V: Não. Só pontua se você marcar exatamente o conjunto correto, na quantidade pedida.
