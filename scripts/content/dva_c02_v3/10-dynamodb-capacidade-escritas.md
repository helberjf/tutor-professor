# 10. DynamoDB: capacidade, consistência, escritas seguras, Streams, TTL e DAX

## Mapa da aula
Continuação da aula 09. Aqui estão os temas que mais geram questões com conta e com "qual recurso usar":

• modos de capacidade e o cálculo de RCU e WCU;
• leitura eventual e fortemente consistente;
• PutItem, UpdateItem, contadores atômicos e escritas condicionais;
• optimistic locking com atributo de versão;
• operações em lote e UnprocessedItems;
• transações;
• TTL, DynamoDB Streams, DAX, global tables, backups e PartiQL.

## Modos de capacidade
Sob demanda (on-demand): você paga por requisição de leitura e escrita. A tabela se ajusta sozinha ao tráfego. Bom para carga imprevisível, novas aplicações e tráfego com picos raros.

Provisionado: você define unidades de capacidade de leitura (RCU) e escrita (WCU) por segundo. Pode usar auto scaling (target tracking sobre a utilização) e capacidade reservada para reduzir custo. Bom para carga previsível e estável.

Em ambos os modos, requisições acima do que a tabela ou uma partição aguenta recebem ProvisionedThroughputExceededException (ou ThrottlingException). Os SDKs repetem com backoff automaticamente. O DynamoDB também guarda até 300 segundos de capacidade não usada (burst capacity) para absorver picos curtos, e redistribui capacidade para partições mais acessadas (adaptive capacity).

## Calculando RCU
Uma RCU permite, por segundo, para um item de até 4 KB:
• 1 leitura fortemente consistente; ou
• 2 leituras eventualmente consistentes.
Leitura transacional custa o dobro da forte: 2 RCUs por 4 KB.

O tamanho do item é arredondado para cima em múltiplos de 4 KB.

Exemplos:
• 10 leituras fortes por segundo de itens de 6 KB: 6 KB arredonda para 8 KB = 2 unidades por leitura → 10 × 2 = 20 RCU.
• As mesmas leituras, eventualmente consistentes: metade → 10 RCU.
• 50 leituras eventuais por segundo de itens de 3 KB: 1 unidade cada → 50 ÷ 2 = 25 RCU.
• 5 leituras transacionais por segundo de itens de 10 KB: 10 KB arredonda para 12 KB = 3 unidades × 2 = 6 por leitura → 30 RCU.

Em Query, o tamanho considerado é a soma dos itens lidos, arredondada para 4 KB, não cada item separadamente.

## Calculando WCU
Uma WCU permite 1 escrita por segundo de um item de até 1 KB. O tamanho é arredondado para cima em múltiplos de 1 KB. Escrita transacional custa o dobro.

Exemplos:
• 100 escritas por segundo de itens de 2,5 KB: arredonda para 3 KB = 3 WCU cada → 300 WCU.
• 20 escritas por segundo de itens de 512 bytes: 1 WCU cada → 20 WCU.
• 10 escritas transacionais por segundo de itens de 1,5 KB: 2 KB × 2 = 4 WCU cada → 40 WCU.

Dica de prova: leia com atenção se a questão fala em leitura forte, eventual ou transacional, e arredonde o tamanho antes de multiplicar.

## Leitura eventual e forte
Por padrão, as leituras são eventualmente consistentes: logo depois de uma escrita, uma leitura pode devolver o valor anterior por um curto período. Elas custam metade.

Com ConsistentRead=True, a leitura devolve o valor mais recente confirmado. Disponível em GetItem, BatchGetItem, Query e Scan na tabela e em LSIs.

Não há leitura fortemente consistente em GSIs, em DynamoDB Streams nem, por padrão, entre Regiões de uma global table.

Na prova: "o usuário salva o perfil e, ao recarregar, às vezes vê o valor antigo" → usar ConsistentRead=True nessa leitura (se for na tabela ou em um LSI).

## PutItem, UpdateItem e contadores
• PutItem grava o item inteiro. Se já existir um item com a mesma chave, ele é substituído por completo.
• UpdateItem altera atributos específicos e cria o item se não existir. A UpdateExpression tem quatro ações: SET (definir), REMOVE (apagar atributo), ADD (somar em número ou adicionar em conjunto) e DELETE (remover de conjunto).
• DeleteItem apaga o item pela chave.
• ReturnValues (ALL_NEW, UPDATED_OLD...) devolve o item antes ou depois da mudança, sem outra leitura.

Contador atômico: SET visitas = visitas + :um (ou ADD visitas :um) incrementa no servidor, sem ler antes. Duas requisições simultâneas não se perdem. Mas contador atômico não é idempotente: se a requisição for repetida por retry, conta duas vezes. Para contagem que precisa ser exata, combine com uma condição ou um registro de idempotência.

## Escritas condicionais
ConditionExpression faz a escrita só acontecer se a condição for verdadeira, de forma atômica. Se for falsa, a escrita é rejeitada com ConditionalCheckFailedException e nada muda.

Condições úteis:
• attribute_not_exists(pk): cria apenas se não existir. Impede sobrescrever um item e torna "criar pedido" idempotente.
• attribute_exists(pk): atualiza apenas se existir.
• estoque >= :qtd: só debita se houver estoque.

```typescript
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

try {
  await doc.send(new UpdateCommand({
    TableName: "Produtos",
    Key: { produto_id: "p-10" },
    UpdateExpression: "SET estoque = estoque - :qtd",
    ConditionExpression: "estoque >= :qtd",
    ExpressionAttributeValues: { ":qtd": 1 },
  }));
} catch (erro) {
  if (erro instanceof ConditionalCheckFailedException) {
    console.log("sem estoque");
  } else {
    throw erro;
  }
}
```

## Optimistic locking
Quando dois usuários leem o mesmo item, alteram e gravam, o último sobrescreve o primeiro. Optimistic locking evita a perda:

1. O item tem um atributo de versão (por exemplo, versao = 7).
2. Ao gravar, use ConditionExpression versao = :lida (7) e SET versao = versao + 1.
3. Se outro processo já gravou, a versão é 8 e a condição falha. O código lê de novo, reaplica a mudança e tenta outra vez.

Não há lock real: ninguém fica bloqueado esperando. Os SDKs têm suporte pronto, como @DynamoDBVersionAttribute no SDK Java (DynamoDBMapper).

## Operações em lote
• BatchWriteItem: até 25 operações de Put ou Delete (máximo 16 MB) em uma ou mais tabelas. Não aceita UpdateItem nem condições.
• BatchGetItem: até 100 itens (16 MB).

Lotes não são transações: algumas operações podem dar certo e outras não. Itens que não foram processados (por throttling, por exemplo) voltam em UnprocessedItems (ou UnprocessedKeys, em leituras). O código precisa reenviar esses itens com backoff exponencial até a lista ficar vazia. Ignorar UnprocessedItems é perder dados sem erro.

Lote reduz chamadas de rede, mas não reduz a capacidade consumida: cada item consome suas próprias unidades.

## Transações
TransactWriteItems e TransactGetItems agrupam até 100 ações em uma ou mais tabelas da mesma conta e Região, com garantia de tudo ou nada (ACID).

• Cada ação pode ter uma condição. Se qualquer condição falhar, nada é aplicado, e a exceção TransactionCanceledException traz os motivos por ação.
• ConditionCheck verifica um item sem alterá-lo.
• Custo: o dobro de leituras e escritas comuns.
• ClientRequestToken torna a chamada idempotente por 10 minutos: repetir com o mesmo token não aplica duas vezes.

Exemplo clássico: transferir pontos entre duas contas (debitar uma com condição saldo >= valor e creditar a outra) ou criar um pedido e reservar o estoque juntos.

## TTL
Time to Live apaga itens expirados automaticamente:

• Você escolhe um atributo do tipo Number com o horário de expiração em epoch (segundos desde 1970, não milissegundos).
• Um processo em segundo plano apaga os itens expirados, sem consumir WCU. A exclusão não é imediata: pode levar alguns dias.
• Até ser apagado, o item expirado ainda aparece em leituras. Se isso importa, filtre por expiracao > agora.
• As exclusões por TTL aparecem no DynamoDB Streams como exclusões feitas pelo serviço, o que permite arquivar o item no S3 antes de sumir.

Usos: sessões, tokens temporários, dados de cache e registros com prazo legal.

## DynamoDB Streams
O Streams registra cada alteração de item (inserção, atualização, exclusão) em ordem por item, com retenção de 24 horas. O StreamViewType define o conteúdo:

• KEYS_ONLY: só as chaves.
• NEW_IMAGE: o item depois da mudança.
• OLD_IMAGE: o item antes da mudança.
• NEW_AND_OLD_IMAGES: os dois.

Consumidores: Lambda (event source mapping, aula 05) ou aplicações com o adaptador KCL. Usos: atualizar uma visão derivada, enviar notificações, replicar para outro sistema, auditoria e agregações.

Se precisar de retenção maior ou de vários consumidores com o modelo do Kinesis, existe a opção Kinesis Data Streams for DynamoDB.

## DAX
DynamoDB Accelerator (DAX) é um cache em memória gerenciado, colocado na frente do DynamoDB, com leituras em microssegundos.

• É compatível com a API do DynamoDB: troca-se o client pelo client do DAX, quase sem mudar o código.
• Tem dois caches: item cache (GetItem, BatchGetItem) e query cache (Query, Scan), cada um com seu TTL (padrão de 5 minutos).
• Escritas passam pelo DAX para o DynamoDB (write-through) e atualizam o item cache.
• Leituras fortemente consistentes não são atendidas pelo cache: vão direto ao DynamoDB.
• Roda em um cluster dentro da VPC.

DAX vs. ElastiCache: DAX é para acelerar leituras do DynamoDB sem reescrever a aplicação. ElastiCache é para cache genérico: resultados calculados, sessões, dados de várias fontes (aula 16).

## Global tables, backups e PartiQL
• Global tables: réplicas da tabela em várias Regiões, todas aceitando escritas (multi-ativo). A replicação é assíncrona; em conflito, vale a última escrita. Uso: baixa latência global e recuperação de desastre.
• Backups: point-in-time recovery (PITR) restaura para qualquer segundo dos últimos 35 dias; backups sob demanda guardam cópias completas; exportação para o S3 sem consumir capacidade.
• PartiQL: linguagem compatível com SQL para DynamoDB (ExecuteStatement). As regras de acesso continuam as mesmas: um SELECT sem condição na partition key vira um Scan.

## Pegadinhas frequentes
• RCU: 4 KB; WCU: 1 KB. Arredonde para cima antes de multiplicar.
• Leitura eventual custa metade; transacional, o dobro.
• GSI não tem leitura forte.
• BatchWriteItem não é transação; trate UnprocessedItems.
• PutItem substitui o item inteiro.
• TTL usa epoch em segundos e não apaga na hora.
• DAX não acelera leituras fortemente consistentes.

## Resumo para revisão
• On-demand: imprevisível, por requisição. Provisionado: previsível, RCU/WCU, auto scaling.
• RCU = 1 leitura forte/s de 4 KB = 2 eventuais; transacional = 2 RCU. WCU = 1 escrita/s de 1 KB; transacional = 2 WCU.
• ConsistentRead=True na tabela e em LSIs.
• Condições: attribute_not_exists, comparações → ConditionalCheckFailedException. Versão para optimistic locking.
• BatchWriteItem 25 itens, BatchGetItem 100, 16 MB; UnprocessedItems com backoff.
• Transações: até 100 ações, tudo ou nada, custo 2×, ClientRequestToken.
• TTL: epoch em segundos, sem custo de escrita, exclusão em até alguns dias.
• Streams: 24 h, KEYS_ONLY/NEW_IMAGE/OLD_IMAGE/NEW_AND_OLD_IMAGES.
• DAX: microssegundos, item e query cache, TTL padrão 5 min, não atende leitura forte.

## Questões

Q: Uma aplicação faz 20 leituras fortemente consistentes por segundo de itens de 7 KB. Quantas RCUs são necessárias?
- 80
+ 40
- 35
- 20
E: 7 KB arredonda para 8 KB, o que dá 2 unidades por leitura forte: 20 × 2 = 40 RCU. 20 ignora o tamanho, 35 não arredonda e 80 corresponderia a leituras transacionais.

Q: Uma aplicação grava 50 itens por segundo, cada um com 1,5 KB. Quantas WCUs são necessárias, sem transações?
- 50
+ 100
- 75
- 200
E: 1,5 KB arredonda para 2 KB, ou seja, 2 WCU por escrita: 50 × 2 = 100 WCU. 75 não arredonda, 50 ignora o tamanho e 200 seria o custo de escritas transacionais.

Q: Depois de salvar uma configuração, o usuário recarrega a página e às vezes vê o valor antigo. A leitura é um GetItem na tabela. Qual é a correção mais simples?
- Colocar DAX na frente da tabela.
- Criar um GSI e ler pelo índice.
+ Usar ConsistentRead=True no GetItem.
- Usar BatchGetItem.
E: Leituras eventualmente consistentes podem devolver o valor anterior por um curto período; a leitura forte devolve o último valor confirmado. GSIs só têm leitura eventual, o DAX não atende leituras fortes pelo cache e BatchGetItem não muda a consistência por si só.

Q: Dois atendentes abrem o mesmo cadastro, cada um altera um campo e salva. A alteração do primeiro desaparece. A equipe quer detectar o conflito sem bloquear registros. O que implementar?
- Usar leitura fortemente consistente nos dois atendentes.
- Aumentar a WCU da tabela.
- Uma transação com TransactGetItems antes de salvar.
+ Optimistic locking: atributo de versão e ConditionExpression comparando a versão lida.
E: Com a condição de versão, a segunda gravação falha se o item mudou desde a leitura, e o código pode reler e reaplicar a mudança. Leitura forte não impede que o primeiro salvamento seja sobrescrito, transação de leitura não protege a escrita seguinte e capacidade não tem relação com o conflito.

Q: Um serviço de cadastro precisa garantir que nunca vai sobrescrever um usuário existente ao criar um novo com o mesmo id. Qual é a forma mais simples?
- BatchWriteItem com um único item, que rejeita a gravação quando a chave já existe na tabela.
+ PutItem com ConditionExpression attribute_not_exists(usuario_id).
- Fazer GetItem com leitura forte antes e só chamar PutItem se o item ainda não existir.
- UpdateItem sem condição.
E: A condição é avaliada de forma atômica na própria escrita; se o item existir, a operação falha com ConditionalCheckFailedException. Ler antes e gravar depois abre uma janela para corrida, BatchWriteItem não aceita condições e UpdateItem sem condição criaria ou alteraria o item.

Q: Um job grava 10.000 itens com BatchWriteItem. Ao conferir, alguns itens não estão na tabela, embora nenhuma exceção tenha sido lançada. O que faltou?
- Ligar o TTL da tabela.
- Usar lotes de 100 itens por chamada, o que obriga o DynamoDB a confirmar cada item antes de responder.
+ Reenviar os itens devolvidos em UnprocessedItems, com backoff exponencial.
- Usar ConsistentRead na gravação, para que o lote só termine depois de todos os itens serem confirmados.
E: BatchWriteItem pode processar parte do lote e devolver o restante em UnprocessedItems, sem exceção. O limite é 25 itens por chamada, ConsistentRead é de leitura e TTL apaga itens expirados.

Q: Um sistema de fidelidade precisa transferir pontos entre duas contas: debitar de uma somente se houver saldo e creditar na outra. As duas mudanças devem acontecer juntas ou nenhuma. Qual recurso usar?
- DynamoDB Streams para desfazer o débito em caso de falha.
+ TransactWriteItems com uma condição de saldo no débito.
- BatchWriteItem com as duas atualizações.
- Dois UpdateItem em sequência com retries.
E: Transações aplicam todas as ações ou nenhuma, e a condição de saldo cancela tudo se não houver pontos. BatchWriteItem não é atômico nem aceita UpdateItem; atualizações separadas podem ficar pela metade; e compensar via Streams é complexo e deixa estados intermediários visíveis.

Q: Uma tabela de sessões deve apagar automaticamente sessões com mais de 24 horas, sem custo de escrita. O que configurar?
- Um LSI ordenado pela data de criação.
- Uma função agendada pelo EventBridge que faz Scan a cada hora e chama DeleteItem nas sessões antigas.
+ TTL com um atributo Number contendo o horário de expiração em epoch (segundos).
- DynamoDB Streams com view type OLD_IMAGE.
E: O TTL apaga itens expirados em segundo plano sem consumir WCU. Scan com exclusões consome leitura e escrita; um LSI só ordena; e Streams registram mudanças, não apagam itens.

Q: Uma equipe precisa atualizar um índice de busca no OpenSearch sempre que um produto muda no DynamoDB, enviando o item completo depois da alteração. Qual configuração usar?
- DAX com write-through.
+ DynamoDB Streams com StreamViewType NEW_IMAGE e uma função Lambda consumidora.
- TTL no atributo atualizado_em.
- Um GSI com projeção ALL, que replica cada item alterado para o índice de busca do OpenSearch.
E: O Streams com NEW_IMAGE entrega o item depois de cada mudança, e a Lambda o envia ao índice de busca. TTL apaga itens, o GSI é outra forma de consultar a mesma tabela e o DAX é um cache, não um mecanismo de integração.

Q: Uma aplicação de leitura intensa no DynamoDB precisa de latência de microssegundos, com a menor mudança de código possível. Qual serviço usar?
- ElastiCache for Redis com cache-aside escrito manualmente.
- Um GSI adicional.
+ DynamoDB Accelerator (DAX).
- Global tables em mais Regiões.
E: O DAX é um cache compatível com a API do DynamoDB: basta trocar o client. ElastiCache exige implementar a lógica de cache; GSI e global tables não oferecem latência de microssegundos.

## Flashcards

F: Quanto vale 1 RCU?
V: 1 leitura fortemente consistente por segundo de até 4 KB, ou 2 eventualmente consistentes. Leitura transacional custa 2 RCU por 4 KB.

F: Quanto vale 1 WCU?
V: 1 escrita por segundo de até 1 KB. Escrita transacional custa 2 WCU por 1 KB. Arredonde o tamanho para cima.

F: Onde existe leitura fortemente consistente no DynamoDB?
V: Na tabela e em LSIs (GetItem, BatchGetItem, Query, Scan com ConsistentRead=True). Não em GSIs nem em Streams.

F: Para que serve ConditionExpression?
V: Para gravar só se uma condição for verdadeira, de forma atômica (ex.: attribute_not_exists, estoque >= :qtd). Se falhar: ConditionalCheckFailedException.

F: Como funciona optimistic locking no DynamoDB?
V: Atributo de versão; a escrita usa ConditionExpression versao = :lida e incrementa a versão. Se outro processo gravou antes, a condição falha e o código tenta de novo.

F: Limites e comportamento do BatchWriteItem
V: Até 25 Put/Delete (16 MB), sem Update e sem condições. Não é atômico: itens não processados voltam em UnprocessedItems.

F: Transações no DynamoDB
V: TransactWriteItems/TransactGetItems: até 100 ações, tudo ou nada, mesma conta e Região, custo 2×, ClientRequestToken para idempotência.

F: Como funciona o TTL do DynamoDB?
V: Atributo Number com epoch em segundos. Itens expirados são apagados em segundo plano, sem custo de WCU, em até alguns dias. A exclusão aparece no Streams.

F: StreamViewType do DynamoDB Streams
V: KEYS_ONLY, NEW_IMAGE, OLD_IMAGE e NEW_AND_OLD_IMAGES. Retenção de 24 horas, ordem por item.

F: Características do DAX
V: Cache em memória compatível com a API do DynamoDB, microssegundos, item cache e query cache (TTL padrão 5 min), write-through, em VPC. Não atende leituras fortes.
