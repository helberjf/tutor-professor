# 09. DynamoDB: chaves, Query, Scan, índices e paginação

## Mapa da aula
DynamoDB é o banco mais cobrado da prova. Nesta primeira aula:

• tabela, item, atributo e o limite de 400 KB por item;
• chave primária simples e composta; partition key de alta cardinalidade e partições quentes;
• GetItem, Query e Scan, e por que Scan é a última opção;
• KeyConditionExpression, FilterExpression, ProjectionExpression e nomes reservados;
• paginação com LastEvaluatedKey e o limite de 1 MB;
• índices secundários globais (GSI) e locais (LSI): quando usar cada um.

A aula 10 trata de capacidade, consistência, escritas seguras, transações, TTL, Streams e DAX.

## Tabela, item e atributo
Uma tabela guarda itens; cada item é um conjunto de atributos (nome e valor). Além da chave primária, cada item pode ter atributos diferentes: não existe esquema fixo para o resto.

• Tamanho máximo de um item: 400 KB (nomes e valores somados). Para objetos maiores, guarde o conteúdo no S3 e a referência (bucket e chave) no item.
• Tipos: String (S), Number (N), Binary (B), Boolean, Null, Map (M), List (L) e conjuntos (SS, NS, BS).

DynamoDB é serverless: não há servidor para gerenciar e a latência é de poucos milissegundos em qualquer escala, desde que o acesso seja feito pela chave.

## Chave primária simples e composta
A chave primária identifica cada item de forma única e não pode ser alterada depois de gravada (para mudar, apague e recrie o item).

• Simples: só a partition key (por exemplo, usuario_id). Cada valor identifica um item.
• Composta: partition key + sort key (por exemplo, cliente_id + data_pedido). Vários itens podem compartilhar a partition key, ordenados pela sort key. O par precisa ser único.

O DynamoDB aplica uma função hash à partition key para decidir em qual partição física o item fica. Itens com a mesma partition key formam uma item collection, guardada junto e ordenada pela sort key.

## Cardinalidade e partições quentes
A capacidade da tabela é distribuída entre partições. Se muitas requisições usam a mesma partition key, uma única partição recebe a carga: é a partição quente (hot partition), que causa throttling mesmo com a tabela tendo capacidade total sobrando.

Boas partition keys têm muitos valores distintos e acesso bem distribuído: id do usuário, id do pedido, id do dispositivo.

Más partition keys: status ("ATIVO"/"INATIVO"), data do dia, tipo de produto, um valor fixo.

Técnica para chaves muito acessadas: write sharding, que adiciona um sufixo aleatório ou calculado à chave (pedido#3, pedido#7) para espalhar as escritas, e na leitura consulta todos os sufixos.

Na prova: "throttling em uma tabela com capacidade sobrando" ou "uma chave recebe a maior parte do tráfego" → partition key de baixa cardinalidade; escolha uma chave melhor ou faça sharding.

## GetItem, Query e Scan
• GetItem: lê um item pela chave primária completa. É a leitura mais barata e rápida.
• BatchGetItem: até 100 itens (ou 16 MB) de uma ou mais tabelas em uma chamada.
• Query: lê itens de uma única partition key, com condição opcional na sort key: =, <, <=, >, >=, BETWEEN e begins_with. O resultado vem ordenado pela sort key (ScanIndexForward=False inverte para ordem decrescente).
• Scan: lê a tabela inteira (ou o índice inteiro), item por item. Consome capacidade de tudo o que lê.

Scan em uma tabela grande é lento e caro. Para acelerar um Scan inevitável (exportação, migração), use parallel scan, dividindo a tabela em segmentos (parâmetros Segment e TotalSegments), cada um lido por um worker. Mas a solução certa para uma consulta frequente é modelar uma chave ou índice que permita Query.

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const { Items = [] } = await doc.send(new QueryCommand({
  TableName: "Pedidos",
  KeyConditionExpression: "cliente_id = :c AND data_pedido BETWEEN :inicio AND :fim",
  ExpressionAttributeValues: { ":c": "c-42", ":inicio": "2026-10-01", ":fim": "2026-10-31" },
  ScanIndexForward: false, // mais recentes primeiro
}));
for (const pedido of Items) {
  console.log(pedido.data_pedido, pedido.total);
}
```

## FilterExpression e ProjectionExpression
• KeyConditionExpression decide quais itens são lidos (só pode usar as chaves).
• FilterExpression descarta itens depois da leitura, antes de devolver. Os itens descartados já consumiram capacidade de leitura. Filtro não torna um Scan barato.
• ProjectionExpression escolhe quais atributos devolver. Reduz o tráfego de rede, mas não reduz a capacidade consumida, que é calculada pelo tamanho do item lido.

Nomes reservados e placeholders:
• Muitas palavras são reservadas (name, status, date, data, size, year...). Para usá-las, crie um alias em ExpressionAttributeNames: #s → status.
• Valores entram por ExpressionAttributeValues: :ativo → "ATIVO".

Exemplo de filtro: FilterExpression "#s = :ativo" com ExpressionAttributeNames {"#s": "status"} e ExpressionAttributeValues {":ativo": "ATIVO"}. Com o DynamoDBDocumentClient, os valores são objetos JavaScript comuns; com o DynamoDBClient puro, eles vão no formato tipado ({":ativo": {"S": "ATIVO"}}).

## Paginação: 1 MB e LastEvaluatedKey
Query e Scan leem no máximo 1 MB de dados por chamada (antes do filtro). Se houver mais, a resposta inclui LastEvaluatedKey. Para continuar, repita a chamada com ExclusiveStartKey igual a esse valor. Quando LastEvaluatedKey não vem, você chegou ao fim.

O parâmetro Limit diz quantos itens avaliar, não quantos devolver. Com Limit=10 e um filtro que descarta 8, a página vem com 2 itens e um LastEvaluatedKey.

Uma página com Items vazio e LastEvaluatedKey presente não significa fim: o filtro descartou tudo naquela fatia, mas ainda há dados.

```typescript
import { paginateQuery } from "@aws-sdk/lib-dynamodb";

// Versão manual: repete a Query com ExclusiveStartKey até não vir LastEvaluatedKey.
async function* todosOsPedidos(clienteId: string) {
  let ultima: Record<string, unknown> | undefined;
  do {
    const pagina = await doc.send(new QueryCommand({
      TableName: "Pedidos",
      KeyConditionExpression: "cliente_id = :c",
      ExpressionAttributeValues: { ":c": clienteId },
      ExclusiveStartKey: ultima,
    }));
    yield* pagina.Items ?? [];
    ultima = pagina.LastEvaluatedKey;
  } while (ultima);
}

// Versão pronta do SDK v3, que faz o mesmo laço:
for await (const pagina of paginateQuery({ client: doc }, {
  TableName: "Pedidos",
  KeyConditionExpression: "cliente_id = :c",
  ExpressionAttributeValues: { ":c": "c-42" },
})) {
  console.log(pagina.Items?.length);
}
```

## Índice secundário global (GSI)
Um GSI permite consultar por outra chave: outra partition key e, opcionalmente, outra sort key. Exemplo: tabela Pedidos com chave pedido_id; GSI com partition key cliente_id e sort key data_pedido para "pedidos do cliente por data".

Características:
• pode ser criado ou removido a qualquer momento;
• leituras são sempre eventualmente consistentes;
• tem capacidade própria (em modo provisionado). Se o GSI sofrer throttling nas escritas, as escritas na tabela também sofrem throttling. Dê ao GSI capacidade de escrita suficiente;
• a chave do GSI não precisa ser única;
• padrão de 20 GSIs por tabela.

Projeção: quais atributos são copiados para o índice. KEYS_ONLY (só chaves), INCLUDE (chaves + atributos escolhidos) ou ALL (o item inteiro). Uma consulta no GSI só enxerga os atributos projetados; mais projeção significa mais armazenamento e mais custo de escrita.

Índice esparso: itens sem o atributo da chave do GSI não entram no índice. Útil para "só os pedidos com atraso", gravando o atributo apenas nesses itens.

## Índice secundário local (LSI)
Um LSI mantém a mesma partition key da tabela e usa outra sort key. Exemplo: tabela com cliente_id + data_pedido; LSI com cliente_id + valor_total, para "pedidos do cliente por valor".

Características:
• só pode ser criado junto com a tabela;
• permite leitura fortemente consistente;
• usa a capacidade da tabela;
• limite de 10 GB por valor de partition key (somando tabela e LSIs);
• até 5 LSIs por tabela;
• pode buscar atributos não projetados na tabela base, com custo extra de leitura.

Escolha rápida:
• Precisa de outra partition key, ou o índice surgiu depois que a tabela existia → GSI.
• Mesma partition key, outra ordenação, e precisa de leitura fortemente consistente → LSI, planejado na criação.

## Modelar pelo padrão de acesso
Em DynamoDB, você começa pelas perguntas que a aplicação faz, não pelas entidades:

1. Liste os padrões de acesso: "buscar pedido por id", "pedidos do cliente no mês", "pedidos atrasados".
2. Para cada padrão, escolha uma chave da tabela ou de um índice que responda com GetItem ou Query.
3. Use sort keys compostas para hierarquias: "PEDIDO#2026-10-23#p91" permite begins_with("PEDIDO#2026-10").

Busca de texto livre ("produtos cujo nome contém 'azul'") não é o forte do DynamoDB: Scan com contains é caro. Para isso, integre com o Amazon OpenSearch Service.

## Pegadinhas frequentes
• Query exige igualdade na partition key; condições de intervalo só na sort key.
• FilterExpression e ProjectionExpression não reduzem a capacidade consumida.
• Limit limita itens avaliados, não devolvidos.
• Página vazia com LastEvaluatedKey não é o fim.
• GSI: só leitura eventualmente consistente; capacidade insuficiente no GSI causa throttling na tabela.
• LSI só na criação da tabela.
• "status", "name", "date" são palavras reservadas: use ExpressionAttributeNames.

## Resumo para revisão
• Item até 400 KB. Chave simples (partition) ou composta (partition + sort).
• Alta cardinalidade evita partições quentes; write sharding espalha chaves muito acessadas.
• GetItem/BatchGetItem (100 itens, 16 MB) < Query (uma partition key) < Scan (tudo; parallel scan).
• Filter e Projection depois da leitura; não economizam capacidade.
• 1 MB por página; LastEvaluatedKey → ExclusiveStartKey.
• GSI: outra chave, a qualquer momento, só eventual, capacidade própria, 20 por tabela.
• LSI: mesma partition key, só na criação, forte possível, 10 GB por partition key, 5 por tabela.

## Questões

Q: Uma tabela de sessões usa como partition key o campo "status", que tem apenas os valores "ATIVA" e "EXPIRADA". A tabela sofre throttling, embora a capacidade total esteja longe do limite. Qual é a causa?
+ A partition key tem baixa cardinalidade e concentra o tráfego em poucas partições.
- O tamanho dos itens passa de 400 KB.
- A tabela não tem LSI.
- O modo de capacidade sob demanda não suporta esse tráfego.
E: Com só dois valores, quase todas as requisições vão para as mesmas partições, criando partições quentes. Itens grandes seriam rejeitados, não limitados por throttling; LSI não distribui carga; e o problema existe em qualquer modo de capacidade.

Q: Uma aplicação precisa listar os pedidos de um cliente feitos em outubro, e a tabela tem partition key cliente_id e sort key data_pedido. Qual operação é a mais eficiente?
+ Query com cliente_id igual ao cliente e data_pedido BETWEEN o início e o fim do mês.
- Scan com FilterExpression por cliente_id e data.
- BatchGetItem com todas as datas de outubro.
- GetItem com cliente_id.
E: Query lê só a item collection do cliente e usa a sort key para o intervalo. Scan leria a tabela inteira; GetItem exige a chave completa; e BatchGetItem exigiria saber cada sort key exata.

Q: Um Scan com FilterExpression devolve só 5 itens, mas consome capacidade como se tivesse lido 10.000. Por quê?
+ A capacidade é calculada pelos itens lidos, e o filtro só é aplicado depois da leitura.
- A FilterExpression é aplicada antes da leitura, mas cobra o dobro de capacidade para cada item que examina.
- O Scan sempre lê as três cópias de cada item, uma por zona de disponibilidade, e cobra por todas elas.
- Os 5 itens devolvidos são grandes demais.
E: O filtro descarta itens depois de lidos, então a capacidade de leitura corresponde a tudo o que foi lido. O caminho para reduzir custo é uma chave ou índice que permita Query.

Q: Um código lê a primeira página de uma Query e encontra Items vazio. O desenvolvedor conclui que não há resultados. A resposta trazia LastEvaluatedKey. O que está errado?
- A Query precisa de um Limit maior que 1 MB.
+ Ainda há dados: o filtro descartou os itens daquela página; é preciso continuar com ExclusiveStartKey.
- LastEvaluatedKey indica um erro de permissão em parte dos itens, que a Query não conseguiu ler e omitiu da página.
- Nada; Items vazio sempre significa fim dos dados, e LastEvaluatedKey só aparece quando a página veio cheia.
E: Cada chamada lê até 1 MB antes do filtro. Se tudo foi filtrado, Items pode vir vazio, mas LastEvaluatedKey indica que a leitura não terminou. O fim só acontece quando LastEvaluatedKey não vem.

Q: Uma tabela tem partition key pedido_id. Agora a equipe precisa consultar pedidos por email do cliente. A tabela já está em produção. O que fazer?
+ Criar um GSI com partition key email.
- Recriar a tabela com email como sort key.
- Criar um LSI com partition key email.
- Usar Scan com FilterExpression por email.
E: GSIs podem ter outra partition key e ser criados a qualquer momento. LSIs mantêm a partition key da tabela e só podem ser criados junto com ela; recriar a tabela é desnecessário; e Scan é caro para um acesso frequente.

Q: Uma aplicação precisa de leitura fortemente consistente de pedidos de um cliente ordenados por valor, além da ordem por data da tabela. A tabela ainda está sendo projetada. Qual escolha atende?
- Um GSI com partition key cliente_id e sort key valor_total.
+ Um LSI com sort key valor_total, criado junto com a tabela.
- Duas tabelas sincronizadas por código.
- Um GSI com projeção ALL e ConsistentRead=true.
E: LSIs permitem leitura fortemente consistente e mantêm a partition key da tabela, mas precisam ser criados com ela, o que é possível porque a tabela ainda está sendo projetada. GSIs só oferecem leitura eventualmente consistente, independentemente da projeção.

Q: Escritas na tabela principal começaram a sofrer throttling, embora a tabela tenha capacidade de escrita provisionada sobrando. Ela tem um GSI. Qual é a causa provável?
+ O GSI não tem capacidade de escrita suficiente, e o throttling nele limita as escritas na tabela.
- A projeção do GSI é KEYS_ONLY.
- A tabela precisa de um LSI para equilibrar as escritas, porque o GSI sozinho concentra a carga em uma partição.
- O GSI só aceita leituras.
E: Cada escrita que afeta o GSI consome capacidade dele; se o GSI sofre throttling, as escritas na tabela também sofrem. A correção é aumentar a capacidade do GSI (ou usar sob demanda). Projeção KEYS_ONLY reduz o custo do índice, não causa o problema.

Q: Uma consulta usa FilterExpression "status = :s" e recebe ValidationException: "Attribute name is a reserved keyword". Como corrigir?
- Colocar o nome do atributo entre aspas simples ou duplas dentro da expressão, como 'status' = :s.
- Usar ProjectionExpression no lugar do filtro.
+ Usar um placeholder em ExpressionAttributeNames, como "#s = :s" com {"#s": "status"}.
- Renomear a coluna em todos os itens.
E: Palavras reservadas, como status, precisam de um placeholder de nome em ExpressionAttributeNames. Renomear dados é desnecessário, aspas não resolvem e ProjectionExpression seleciona atributos, não filtra itens.

Q: Uma exportação mensal precisa ler uma tabela de 500 GB o mais rápido possível. Qual técnica aumenta a vazão da leitura completa?
+ Parallel scan, com Segment e TotalSegments divididos entre vários workers.
- Aumentar o Limit para 10 MB.
- Scan sequencial com ProjectionExpression, que lê só os atributos pedidos e por isso consome menos capacidade.
- Query com begins_with na partition key.
E: O parallel scan divide a tabela em segmentos lidos em paralelo. Query exige igualdade na partition key, ProjectionExpression não reduz a capacidade consumida, e cada página continua limitada a 1 MB.

Q: Qual afirmação sobre um GSI está correta?
- A chave do índice precisa ser única para cada item, como acontece com a chave primária da tabela.
+ Uma consulta no índice só retorna os atributos projetados nele.
- Ele só pode ser criado junto com a tabela.
- Ele permite leitura fortemente consistente.
E: Consultas em GSI só veem os atributos projetados (KEYS_ONLY, INCLUDE ou ALL). GSIs podem ser criados a qualquer momento, só oferecem leitura eventualmente consistente e sua chave pode se repetir entre itens.

## Flashcards

F: Tamanho máximo de um item no DynamoDB
V: 400 KB. Para dados maiores, guarde no S3 e salve a referência no item.

F: Chave primária simples vs. composta
V: Simples: só partition key. Composta: partition key + sort key; vários itens compartilham a partition key e são ordenados pela sort key.

F: O que é uma partição quente?
V: Uma partition key que recebe tráfego demais e causa throttling, mesmo com capacidade total sobrando. Resolva com chaves de alta cardinalidade ou write sharding.

F: Condições permitidas em uma Query
V: Igualdade na partition key; na sort key: =, <, <=, >, >=, BETWEEN e begins_with.

F: FilterExpression reduz a capacidade consumida?
V: Não. O filtro é aplicado depois da leitura; você paga pelo que foi lido. ProjectionExpression também não reduz.

F: Como paginar Query/Scan no DynamoDB?
V: Cada chamada lê até 1 MB. Se vier LastEvaluatedKey, repita com ExclusiveStartKey. O fim é quando LastEvaluatedKey não vem.

F: O que o parâmetro Limit faz em Query/Scan?
V: Limita quantos itens são avaliados (antes do filtro), não quantos são devolvidos.

F: Características de um GSI
V: Outra partition/sort key; criado a qualquer momento; só leitura eventual; capacidade própria (throttling no GSI afeta a tabela); projeção KEYS_ONLY, INCLUDE ou ALL; 20 por tabela.

F: Características de um LSI
V: Mesma partition key, outra sort key; só na criação da tabela; permite leitura forte; usa a capacidade da tabela; 10 GB por partition key; 5 por tabela.

F: Como usar um atributo com nome reservado (ex.: status)?
V: Com ExpressionAttributeNames: "#s = :v" e {"#s": "status"}. Valores vão em ExpressionAttributeValues.
