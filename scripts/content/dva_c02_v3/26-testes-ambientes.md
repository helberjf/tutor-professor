# 26. Testes e ambientes: unitários, integração, eventos de teste, stages e aliases

## Mapa da aula
As tarefas 3.2 e 3.3 da prova falam em testar em ambientes de desenvolvimento e automatizar testes de implantação. Nesta aula:

• testes unitários com mocks do SDK;
• testes de integração em recursos reais e o desafio do processamento assíncrono;
• eventos de teste JSON para Lambda;
• execução local: SAM CLI, DynamoDB Local e TestState do Step Functions;
• endpoints simulados com integração mock;
• como separar dev, homologação e produção: contas, stacks, parâmetros, stages e aliases;
• testar a versão nova antes de receber tráfego de produção.

## Testes unitários e mocks do SDK
Um teste unitário verifica a lógica do código sem chamar a AWS de verdade. Ele é rápido, barato e roda em qualquer máquina, inclusive no pipeline.

Para isso, substitua as chamadas do SDK por respostas controladas:
• TypeScript/JavaScript: aws-sdk-client-mock, que intercepta o client.send de cada client do SDK v3 e devolve respostas ou erros definidos no teste, com o Jest (ou Vitest) como executor;
• Python: botocore Stubber ou a biblioteca moto (simula serviços em memória);
• Java: bibliotecas de mock como Mockito, com o client injetado.

Boas práticas:
• separe a lógica de negócio do handler: o handler só traduz o evento e chama funções puras, que são fáceis de testar;
• crie os clients fora do handler; o aws-sdk-client-mock substitui o comportamento de todos os clients daquela classe, sem mudar o código;
• teste os caminhos de erro: ConditionalCheckFailedException, throttling, evento malformado;
• use fixtures com o formato real dos eventos (gerados por sam local generate-event).

```typescript
import { mockClient } from "aws-sdk-client-mock";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { gravarPedido, PedidoDuplicado } from "../src/pedidos"; // lógica separada do handler

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

test("grava um pedido novo com condição de não sobrescrever", async () => {
  ddbMock.on(PutCommand).resolves({});
  await gravarPedido({ pk: "p-1", total: 50 });
  const chamada = ddbMock.commandCalls(PutCommand)[0].args[0].input;
  expect(chamada.ConditionExpression).toBe("attribute_not_exists(pk)");
});

test("trata pedido duplicado", async () => {
  ddbMock.on(PutCommand).rejects(
    new ConditionalCheckFailedException({ message: "existe", $metadata: {} }),
  );
  await expect(gravarPedido({ pk: "p-1", total: 50 })).rejects.toBeInstanceOf(PedidoDuplicado);
});
```

## Testes de integração
Um teste de integração usa recursos reais (uma stack de teste com a fila, a tabela e as funções de verdade). Ele pega o que mocks não pegam:
• permissões IAM que faltam na role;
• formato real de eventos e respostas;
• configurações de timeout, memória, VPC e variáveis de ambiente;
• integração entre serviços (S3 dispara Lambda, que grava no DynamoDB).

Boas práticas:
• implante uma stack de teste isolada, de preferência em uma conta de teste, com nomes únicos por execução (ambientes efêmeros por branch ou pull request) e apague-a no fim;
• use dados de teste próprios e limpe depois;
• rode os testes com uma identidade parecida com a de produção, para pegar falta de permissão.

Testar fluxos assíncronos: o produtor recebe sucesso antes de o consumidor terminar. O teste precisa esperar o resultado com limite: consultar o DynamoDB (ou a fila de saída) a cada segundo, por até 30 segundos, e falhar se não aparecer. Um sleep fixo deixa o teste lento ou instável.

## Eventos de teste JSON
Funções Lambda recebem eventos em JSON com formato definido pela origem. Para testar:

• No console da Lambda, crie test events (privados ou compartilháveis com a equipe, guardados no EventBridge schema registry) a partir de modelos (API Gateway, S3, SQS...).
• Na CLI: aws lambda invoke --function-name pedidos:homolog --payload fileb://evento.json resposta.json.
• No SAM: sam local generate-event apigateway aws-proxy > evento.json e sam local invoke -e evento.json.

Mantenha os eventos de teste no repositório, junto com os testes. Um evento inventado que não segue o formato real (por exemplo, body já como objeto em vez de string no API Gateway) faz o teste passar e a produção falhar.

## Execução local e simulação
• SAM CLI: sam local invoke, sam local start-api e sam local start-lambda executam funções em contêineres Docker parecidos com o ambiente da Lambda (aula 25). As funções locais chamam serviços reais da AWS, a não ser que você aponte para emuladores.
• DynamoDB Local: versão do DynamoDB que roda na máquina ou em contêiner, para testes sem custo. Configure o client com endpoint_url local.
• Step Functions: a API TestState executa um único estado com uma entrada de exemplo, inclusive com mock do resultado da tarefa, sem criar a máquina inteira; e o Step Functions Local roda máquinas na máquina do desenvolvedor.
• Integração mock do API Gateway: devolve respostas fixas sem backend, útil para o front-end testar contra uma API que ainda não existe (aula 07).
• Imagens de contêiner: o Runtime Interface Emulator permite invocar a função localmente (aula 23).

## Ambientes: contas, stacks e parâmetros
Formas de separar dev, homologação e produção, da mais isolada para a menos:

1. Contas separadas, gerenciadas pelo AWS Organizations: o isolamento mais forte (permissões, limites, custos e incidentes não se misturam). É a recomendação da AWS.
2. Stacks separadas na mesma conta, com o mesmo template e parâmetros diferentes (nome do ambiente, capacidade, domínio). No SAM, o samconfig.toml pode ter seções por ambiente ([dev.deploy.parameters], [prod.deploy.parameters]) e o deploy escolhe com --config-env prod. No CDK, cada ambiente é uma instância da stack com outra conta/Região ou contexto.
3. Dentro de uma mesma API e função: stages do API Gateway e aliases da Lambda.

Configuração por ambiente vai em parâmetros e no Parameter Store (/app/dev/..., /app/prod/...), nunca em código. O mesmo artefato percorre os ambientes (aula 23).

## Stages e aliases para ambientes e testes
No API Gateway, cada stage (dev, homolog, prod) tem URL, configurações e stage variables próprias. A stage variable pode escolher o alias da função: a integração chama pedidos:${stageVariables.alias}.

Na Lambda, cada alias aponta para uma versão: dev → $LATEST, homolog → 8, prod → 7. Assim:
• homologação testa a versão 8 pela URL do stage homolog;
• aprovada, a promoção é mover o alias prod para 8;
• rollback é mover de volta para 7.

Lembre-se de conceder ao API Gateway permissão para invocar cada alias.

Esse modelo funciona bem para equipes pequenas. Ele compartilha conta, limites de concorrência e recursos (por exemplo, a mesma tabela, se você não separar), por isso dados de produção devem ficar em recursos separados.

## Testar a versão nova antes do tráfego de produção
Técnicas para validar uma implantação de forma automatizada:

• Invocar diretamente a versão ou o alias novo (aws lambda invoke --qualifier 8) com eventos de teste, antes de mover o alias de produção.
• Hooks do CodeDeploy: PreTraffic (BeforeAllowTraffic) executa testes contra a versão nova antes de qualquer tráfego; PostTraffic (AfterAllowTraffic) testa depois da troca. Se o hook informar falha, a implantação é revertida (aula 28).
• Canary do API Gateway: uma porcentagem das requisições do stage vai para o deployment novo.
• Implantação canary ou linear da Lambda com alarmes: tráfego real em pequena escala, com rollback automático.
• Testes de fumaça (smoke tests) no pipeline depois do deploy em homologação, e aprovação manual antes de produção.
• Monitoramento sintético: canaries do CloudWatch Synthetics chamam endpoints continuamente e alertam se falharem (aula 31).

## Testes no pipeline
Um pipeline típico organiza os testes em camadas:

1. Build: compilar, rodar testes unitários e análise estática; gerar relatórios (o CodeBuild publica relatórios JUnit e de cobertura).
2. Deploy em um ambiente de teste.
3. Testes de integração e de API contra esse ambiente.
4. Aprovação manual (opcional).
5. Deploy em produção de forma gradual, com alarmes e rollback.

Falhas em uma etapa param o pipeline antes de o artefato chegar à próxima. Ferramentas como o Amazon Q Developer podem gerar esboços de testes unitários, mas os critérios (o que é comportamento correto) precisam ser definidos por quem conhece a regra de negócio.

## Pegadinhas frequentes
• Teste unitário não chama a AWS: use aws-sdk-client-mock (ou Stubber e moto em Python).
• Mocks não verificam permissões IAM; testes de integração com a role real, sim.
• Fluxo assíncrono: espere o resultado com polling e limite de tempo, não com sleep fixo.
• Evento de teste precisa seguir o formato real da origem (body do API Gateway é string).
• sam local chama serviços reais da AWS, a menos que você aponte para emuladores.
• Isolamento mais forte entre ambientes: contas separadas.
• Stage variable apontando para alias exige permissão por alias.

## Resumo para revisão
• Unitário: lógica isolada, mocks do SDK (aws-sdk-client-mock com Jest), fixtures com eventos reais.
• Integração: stack de teste isolada, role real, polling com limite para fluxos assíncronos, limpeza ao final.
• Eventos de teste: console (compartilháveis), CLI invoke --payload, sam local generate-event.
• Local: SAM CLI, DynamoDB Local, TestState e Step Functions Local, integração mock, Runtime Interface Emulator.
• Ambientes: contas separadas (melhor), stacks com parâmetros (samconfig --config-env), stages e aliases.
• Validação antes do tráfego: invoke por qualifier, hooks do CodeDeploy, canary do API Gateway, canary/linear com alarmes, smoke tests, Synthetics.

## Questões

Q: Um desenvolvedor quer testar no pipeline a lógica de uma função que grava no DynamoDB, sem criar recursos na AWS e sem custo. Qual abordagem usar?
- Executar a função em uma conta de produção com uma tabela temporária.
+ Testes unitários no Jest com o SDK simulado pelo aws-sdk-client-mock.
- Executar a função com --dry-run, que roda o código sem gravar nada no DynamoDB.
- sam deploy a cada commit.
E: Mocks do SDK permitem testar a lógica sem chamar a AWS. Produção nunca deve receber testes, sam deploy cria recursos reais e a Lambda não tem execução em dry-run de código.

Q: Todos os testes unitários passam, mas a função falha em produção com AccessDenied ao gravar na fila. Que tipo de teste teria pegado o problema?
+ Um teste de integração com a função implantada, usando a role real e recursos reais de teste.
- Um teste de carga.
- Mais testes unitários com mocks.
- Um teste de snapshot do template.
E: Mocks simulam o SDK e não avaliam permissões IAM; só um teste com a role e os recursos reais revela o AccessDenied. Snapshot compara templates e teste de carga mede desempenho.

Q: Um teste de integração envia um arquivo ao S3 e verifica, logo em seguida, se o resultado do processamento apareceu no DynamoDB. O teste falha às vezes. Qual é a correção?
- Aumentar a memória da função.
- Adicionar sleep de 5 minutos antes da verificação.
+ Consultar o DynamoDB a intervalos curtos até o resultado aparecer ou um limite de tempo ser atingido.
- Remover o teste.
E: O processamento é assíncrono; o teste precisa esperar com polling e limite. Memória não torna o fluxo síncrono, e um sleep fixo longo deixa o teste lento e ainda pode falhar.

Q: Uma função recebe eventos do API Gateway com integração proxy. O teste unitário passa usando um evento com body como objeto JSON, mas em produção event.body.id vem undefined. Por quê?
- A função precisa de uma layer de JSON.
+ No proxy real, body chega como string e precisa de JSON.parse; o evento de teste não segue o formato real.
- O API Gateway remove o campo body quando a requisição tem Content-Type application/json e o envia em outro campo.
- O teste deveria usar ProjectionExpression para selecionar o campo id do body, como o API Gateway faz em produção.
E: No proxy, body chega como string; o código precisa decodificá-la. Gerar o evento com sam local generate-event ou modelos do console evita esse erro. O campo não é removido, e layer ou ProjectionExpression não têm relação.

Q: A empresa quer o isolamento mais forte entre desenvolvimento, homologação e produção, separando permissões, limites de serviço e custos. Qual é a recomendação?
- Aliases diferentes da Lambda.
- Stages diferentes do API Gateway, cada um com suas próprias permissões e limites de serviço.
- Tags diferentes nos recursos.
+ Contas AWS separadas, gerenciadas pelo AWS Organizations.
E: Contas separadas isolam permissões, cotas (como concorrência da Lambda), custos e incidentes. Stages, aliases e tags compartilham a mesma conta e seus limites.

Q: Uma equipe usa o mesmo template SAM para dev e prod, com parâmetros diferentes, e quer evitar digitar as opções de cada ambiente. Qual recurso ajuda?
- Um alias por ambiente no template, cada um guardando os parâmetros de deploy do seu ambiente.
- Variáveis de ambiente da Lambda.
+ Seções por ambiente no samconfig.toml e sam deploy --config-env prod.
- Criar dois templates diferentes.
E: O samconfig.toml guarda parâmetros por ambiente, escolhidos com --config-env. Templates duplicados divergem com o tempo, variáveis de ambiente configuram a função, não o deploy, e aliases não definem os parâmetros da stack.

Q: A equipe quer que a URL do stage homolog chame a versão candidata da função e a URL do stage prod chame a versão aprovada, usando uma única API. O que configurar?
- Concorrência reservada por stage.
+ Aliases homolog e prod e uma stage variable no ARN da integração, com permissão de invocação por alias.
- Um mapping template diferente por stage, que reescreve o nome da função chamada conforme o stage da requisição.
- Duas funções com nomes diferentes.
E: A stage variable escolhe o alias por stage, e cada alias aponta para uma versão. Funções duplicadas complicam a promoção, concorrência não escolhe versão e mapping templates transformam dados, não escolhem a função.

Q: Antes de liberar qualquer tráfego para uma nova versão de função, o pipeline deve executar testes automáticos contra ela e cancelar a implantação se falharem. Qual recurso atende?
- Um alarme de custo.
+ Um hook PreTraffic (BeforeAllowTraffic) do CodeDeploy, que testa a versão nova e informa sucesso ou falha.
- Um teste unitário com aws-sdk-client-mock executado no pipeline depois do deploy, simulando o tráfego de produção na versão nova.
- Uma regra de lifecycle.
E: O hook PreTraffic roda antes da troca de tráfego e, se informar falha, o CodeDeploy reverte. Alarmes de custo e lifecycle não testam versões, e o teste unitário não roda contra a versão implantada.

Q: Um time front-end precisa começar a integrar com uma API cujo backend só ficará pronto em duas semanas. Qual solução permite isso com pouco esforço?
+ Criar os métodos no API Gateway com integração mock, devolvendo respostas de exemplo.
- Usar uma Function URL apontando para uma função vazia, que devolve 200 para qualquer requisição do front-end.
- Esperar o backend.
- Expor o banco de dados diretamente.
E: A integração mock responde com dados fixos definidos no próprio API Gateway, mantendo o contrato da API. Expor o banco é inseguro, e uma Function URL precisa de uma função com código.

Q: Um desenvolvedor quer testar apenas um estado Task de uma máquina do Step Functions, com uma entrada de exemplo, sem criar a máquina inteira. Qual recurso usar?
+ A API TestState do Step Functions.
- CloudWatch Synthetics.
- O Policy Simulator do IAM.
- sam local start-api.
E: TestState executa um estado isolado com entrada de exemplo e pode simular o resultado da tarefa. Synthetics testa endpoints em produção, o Policy Simulator avalia permissões e start-api emula APIs com funções.

## Flashcards

F: Ferramentas para simular o SDK em testes unitários
V: TypeScript/JavaScript: aws-sdk-client-mock (com Jest ou Vitest). Python: botocore Stubber ou moto. Java: Mockito com o client injetado.

F: O que testes de integração pegam que unitários não pegam?
V: Permissões IAM, formato real de eventos, configurações (timeout, VPC, variáveis) e integração entre serviços.

F: Como testar um fluxo assíncrono?
V: Disparar o evento e consultar o resultado repetidamente com intervalo curto e limite de tempo, em vez de sleep fixo.

F: Onde obter eventos de teste no formato real?
V: Modelos de test events do console da Lambda (podem ser compartilhados), sam local generate-event e exemplos da documentação de cada serviço.

F: Opções para testar localmente
V: SAM CLI (local invoke, start-api, start-lambda), DynamoDB Local, TestState e Step Functions Local, integração mock do API Gateway, Runtime Interface Emulator.

F: Formas de separar ambientes, da mais isolada para a menos
V: Contas separadas (Organizations) → stacks separadas com parâmetros (samconfig --config-env) → stages do API Gateway e aliases da Lambda.

F: Como usar stages e aliases para homologação e produção?
V: Cada stage usa uma stage variable com o nome do alias; cada alias aponta para uma versão. Promover = mover o alias. Dar permissão de invocação por alias.

F: Como testar uma nova versão antes de receber tráfego de produção?
V: Invocar a versão (--qualifier), hook PreTraffic do CodeDeploy, canary do stage do API Gateway, implantação canary/linear com alarmes e smoke tests.

F: Para que serve a integração mock do API Gateway em testes?
V: Responder com dados fixos sem backend, permitindo que o front-end avance antes do backend existir.

F: O que é um ambiente efêmero?
V: Uma stack de teste criada por branch ou pull request, com nomes únicos, usada nos testes e apagada depois.
