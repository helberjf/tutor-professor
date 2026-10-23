# 16. Cache e bancos: ElastiCache, RDS/Aurora e CloudFront

## Mapa da aula
A prova cobra estratégias de cache e a escolha do lugar certo para guardar dados. Nesta aula:

• lazy loading (cache-aside), write-through e TTL: vantagens e problemas de cada um;
• ElastiCache: Redis/Valkey vs. Memcached, e o cache de sessão;
• RDS e Aurora para desenvolvedores: réplicas de leitura, Multi-AZ, endpoints do Aurora e autenticação IAM;
• CloudFront: origens, OAC, chave de cache, TTL, invalidação, URLs e cookies assinados;
• Lambda@Edge vs. CloudFront Functions.

## Lazy loading (cache-aside)
Leitura com lazy loading:
1. A aplicação procura o dado no cache.
2. Se encontrar (cache hit), devolve.
3. Se não encontrar (cache miss), lê do banco, grava no cache e devolve.

Vantagens:
• só o que é pedido fica no cache;
• se o nó de cache falhar, a aplicação continua funcionando, só que mais lenta.

Desvantagens:
• cada miss custa três idas (cache, banco, cache);
• o dado pode ficar desatualizado (stale) se o banco mudar e o cache não. Use TTL para limitar esse tempo.

```typescript
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!); // criado fora do handler

export async function buscarProduto(produtoId: string): Promise<Produto> {
  const chave = `produto:${produtoId}`;
  const emCache = await redis.get(chave);
  if (emCache) return JSON.parse(emCache);                    // hit
  const produto = await banco.buscarProduto(produtoId);        // miss
  await redis.set(chave, JSON.stringify(produto), "EX", 300);  // TTL de 5 minutos
  return produto;
}
```

## Write-through e TTL
Write-through: a cada escrita no banco, a aplicação também grava no cache.

Vantagens:
• o cache nunca fica desatualizado em relação às escritas da aplicação;
• leituras logo depois da escrita já encontram o dado.

Desvantagens:
• cada escrita custa duas operações (write penalty);
• o cache se enche de dados que talvez nunca sejam lidos (cache churn);
• dados que existiam antes do cache ou que nunca foram escritos não aparecem: combine com lazy loading.

TTL (time to live) faz a entrada expirar sozinha. Combinar write-through ou lazy loading com TTL é a recomendação padrão: limita o tempo de dado velho e libera espaço.

Quando a memória enche, o cache remove entradas pela política de despejo (eviction), normalmente as menos usadas recentemente (LRU). Muitos despejos indicam cache pequeno demais.

Um problema clássico: muitas chaves expiram ao mesmo tempo, e todos os clientes vão ao banco juntos (thundering herd). Varie um pouco o TTL (jitter) e deixe só um processo recarregar cada chave.

## ElastiCache: Redis/Valkey ou Memcached
O Amazon ElastiCache é um cache em memória gerenciado, com latência abaixo de milissegundo. Ele roda na sua VPC.

Redis OSS e Valkey (o Valkey é compatível com Redis):
• estruturas de dados: strings, hashes, listas, conjuntos, sorted sets (ranking/leaderboard), pub/sub e streams;
• réplicas e Multi-AZ com failover automático;
• persistência (snapshots e AOF) e backups;
• modo cluster para dividir dados em shards;
• autenticação (AUTH, RBAC e IAM nas versões recentes) e criptografia em trânsito e em repouso.

Memcached:
• chave-valor simples;
• multithread, escala adicionando nós (o cliente distribui as chaves);
• sem replicação, sem persistência e sem backups.

Escolha: precisa de alta disponibilidade, persistência, estruturas como ranking, pub/sub ou failover → Redis/Valkey. Só um cache simples de objetos, multithread, e perder o cache não é problema → Memcached.

Também existe o ElastiCache Serverless, que escala sozinho, e o Amazon MemoryDB, compatível com Redis e durável, para usar como banco principal.

## Sessões fora do servidor
Uma aplicação web com várias instâncias atrás de um load balancer não deve guardar a sessão do usuário na memória de uma instância: a próxima requisição pode ir para outra instância, e a sessão some quando a instância é substituída.

Soluções:
• guardar a sessão no ElastiCache (Redis/Valkey) ou no DynamoDB (com TTL);
• evitar sticky sessions como solução principal: elas prendem o usuário a uma instância e perdem a sessão se ela cair.

Na prova: "tornar a aplicação stateless para escalar horizontalmente" → sessão no ElastiCache ou DynamoDB.

## RDS e Aurora para desenvolvedores
Réplicas de leitura (read replicas): cópias do banco atualizadas de forma assíncrona, com endpoint próprio. Servem para escalar leituras. A aplicação precisa mandar as leituras para o endpoint da réplica; e, por serem assíncronas, podem estar um pouco atrasadas.

Multi-AZ: uma instância standby em outra AZ, com replicação síncrona e failover automático. Serve para alta disponibilidade, não para escalar leituras (na implantação clássica, a standby não aceita conexões).

Aurora:
• cluster endpoint: aponta para a instância de escrita;
• reader endpoint: distribui conexões entre as réplicas de leitura (até 15);
• custom endpoints: grupos de instâncias escolhidos por você;
• Aurora Serverless v2: capacidade que se ajusta automaticamente.

Autenticação IAM no banco (MySQL e PostgreSQL): em vez de senha fixa, a aplicação gera um token de autenticação com a API do RDS (generate-db-auth-token), válido por 15 minutos, usando a role. A conexão precisa usar SSL. Combine com RDS Proxy para muitas conexões vindas da Lambda (aula 06) e com Secrets Manager quando usar senha (aula 22).

## CloudFront: origens e acesso ao S3
O Amazon CloudFront é a CDN da AWS: guarda cópias do conteúdo em pontos de presença no mundo todo, reduzindo latência e carga na origem.

Origens: bucket S3, Application Load Balancer, API Gateway, Function URL, MediaStore ou qualquer servidor HTTP.

Para um bucket S3 privado servido só pelo CloudFront, use Origin Access Control (OAC): a distribuição assina as requisições ao S3, e a bucket policy permite s3:GetObject apenas ao principal cloudfront.amazonaws.com com a condição do ARN da distribuição. O OAC substitui o antigo Origin Access Identity (OAI) e suporta SSE-KMS.

Comportamentos (cache behaviors) definem regras por padrão de caminho: /api/* para o API Gateway sem cache, /static/* para o S3 com cache longo.

HTTPS: a viewer protocol policy pode redirecionar HTTP para HTTPS. Certificados do ACM para domínios próprios do CloudFront precisam estar em us-east-1.

## Chave de cache, TTL e invalidação
A chave de cache decide se duas requisições recebem a mesma resposta guardada. Por padrão, ela é o domínio e o caminho. Uma cache policy define o que mais entra na chave: headers, cookies e query strings.

• Se a resposta varia por idioma, inclua o header Accept-Language na chave; senão, um usuário pode receber a página em outro idioma.
• Incluir valores demais (todos os cookies e query strings) reduz a taxa de acerto do cache.
• Uma origin request policy envia valores à origem sem colocá-los na chave de cache. Encaminhar um header não o coloca automaticamente na chave.

TTL: a cache policy define TTL mínimo, padrão e máximo. Os headers Cache-Control e Expires da origem são respeitados dentro desses limites.

Atualizar conteúdo:
• Invalidação: remove objetos do cache antes do TTL (por caminho ou /*). Há cobrança acima de uma cota mensal de caminhos.
• Nomes versionados (app.v42.js): a forma recomendada para arquivos estáticos; a nova versão tem outra URL e não precisa de invalidação.

## URLs e cookies assinados
Para restringir conteúdo a usuários pagantes ou autenticados:

• URL assinada: dá acesso a um arquivo específico (um vídeo, um PDF). Bom quando o cliente não aceita cookies.
• Cookie assinado: dá acesso a vários arquivos (todos os segmentos de um vídeo em streaming, uma área inteira do site) sem mudar as URLs.

A assinatura usa um par de chaves cujo lado público fica em um trusted key group da distribuição. A aplicação gera a URL ou o cookie com validade e, opcionalmente, restrição de IP.

Não confunda com URL pré-assinada do S3: a pré-assinada dá acesso direto ao S3; a assinada do CloudFront dá acesso pela CDN, com cache e borda.

Outros recursos de segurança: restrição geográfica (geo restriction), AWS WAF na distribuição e field-level encryption para campos sensíveis de formulários.

## Lambda@Edge e CloudFront Functions
Código que roda no CloudFront, perto do usuário:

CloudFront Functions:
• JavaScript leve, tempo de execução abaixo de milissegundo, escala para milhões de requisições por segundo;
• apenas nos eventos de viewer request e viewer response;
• sem acesso à rede nem ao corpo da requisição;
• usos: reescrever URL, redirecionar, normalizar headers e query strings para melhorar o cache, validar um token simples.

Lambda@Edge:
• Node.js ou Python, mais tempo de execução e mais memória;
• nos quatro eventos: viewer request, viewer response, origin request e origin response;
• pode acessar a rede e outros serviços AWS, e ler o corpo;
• usos: autenticação complexa, escolher a origem dinamicamente, gerar respostas, redimensionar imagens.

Regra prática: transformação simples e barata de headers ou URLs → CloudFront Functions. Lógica pesada, chamada de rede ou eventos de origem → Lambda@Edge.

## Pegadinhas frequentes
• Lazy loading pode servir dado velho; write-through sobrecarrega as escritas. TTL ajuda nos dois.
• Memcached não tem replicação nem persistência.
• Multi-AZ é disponibilidade; read replica é escala de leitura.
• Aurora: escrita no cluster endpoint, leitura no reader endpoint.
• Token de autenticação IAM do RDS vale 15 minutos.
• Encaminhar um header à origem não o coloca na chave de cache.
• Certificado ACM do CloudFront fica em us-east-1.
• CloudFront Functions não acessam a rede; Lambda@Edge, sim.

## Resumo para revisão
• Lazy loading: só o pedido fica em cache, tolera falha do cache, miss caro, risco de dado velho. Write-through: cache sempre atual, write penalty, churn. Use TTL.
• ElastiCache Redis/Valkey: estruturas, réplicas, Multi-AZ, persistência. Memcached: simples, multithread, sem replicação.
• Sessão de usuário no ElastiCache ou DynamoDB.
• RDS: read replicas (assíncronas, leitura) vs. Multi-AZ (síncrona, failover). Aurora: cluster e reader endpoints.
• IAM DB auth: token de 15 minutos, SSL.
• CloudFront: OAC para S3 privado; cache policy define a chave; origin request policy só encaminha; TTL mín./padrão/máx.; invalidação ou nomes versionados.
• URL assinada (um arquivo) vs. cookie assinado (vários).
• CloudFront Functions (viewer, leve) vs. Lambda@Edge (quatro eventos, rede).

## Questões

Q: Uma aplicação usa lazy loading com ElastiCache e, às vezes, mostra preços antigos por horas depois de uma atualização no banco. Qual é a mudança mais simples para limitar o tempo de dado desatualizado?
- Aumentar o tamanho do nó de cache.
+ Definir um TTL nas entradas do cache (e, se necessário, atualizar o cache na escrita).
- Trocar o Redis por Memcached.
- Desativar o lazy loading e consultar sempre o banco.
E: Com TTL, as entradas expiram e a próxima leitura busca o valor novo; write-through complementa atualizando o cache nas escritas. O tipo de engine e o tamanho do nó não afetam a atualização, e abandonar o cache elimina o ganho de desempenho.

Q: Um ranking de jogadores precisa ser atualizado em tempo real e consultado por posição, com alta disponibilidade e failover automático. Qual opção atende?
- CloudFront com TTL de 1 segundo.
+ ElastiCache for Redis/Valkey com sorted sets e Multi-AZ.
- ElastiCache for Memcached.
- DynamoDB com Scan ordenado.
E: Sorted sets mantêm o ranking ordenado, e o Redis/Valkey oferece réplicas com failover automático. Memcached não tem essas estruturas nem replicação; Scan não ordena e é caro; CloudFront é cache de conteúdo HTTP.

Q: Uma aplicação web roda em várias instâncias EC2 atrás de um ALB e guarda a sessão do usuário na memória da instância. Usuários são desconectados quando o Auto Scaling remove instâncias. Qual é a solução recomendada?
- Ativar sticky sessions no ALB para que cada usuário volte sempre para a instância que guarda sua sessão.
+ Guardar as sessões no ElastiCache ou no DynamoDB.
- Aumentar o tamanho das instâncias para que o Auto Scaling precise removê-las com menos frequência.
- Usar uma única instância maior.
E: Sessão em um armazenamento externo torna a aplicação stateless: qualquer instância atende o usuário, e nada se perde quando uma instância sai. Sticky sessions continuam perdendo a sessão quando a instância é removida, e instâncias maiores ou únicas não resolvem a disponibilidade.

Q: Um banco Aurora MySQL está com CPU alta por causa de consultas de relatório. A aplicação deve continuar gravando na instância principal. O que fazer com menos mudanças?
+ Adicionar réplicas Aurora e enviar as consultas de relatório para o reader endpoint.
- Habilitar autenticação IAM.
- Aumentar o período de retenção de backups, liberando a CPU usada pelos snapshots automáticos do banco.
- Ativar Multi-AZ e mandar as consultas de relatório para a instância standby, que fica ociosa em outra AZ.
E: Réplicas de leitura com o reader endpoint tiram as consultas da instância de escrita. A standby clássica de Multi-AZ é para failover e não atende leituras; backups e autenticação não reduzem a carga de consultas.

Q: Uma função Lambda precisa se conectar a um RDS PostgreSQL sem guardar senha. Qual mecanismo usar?
+ Autenticação IAM do RDS: gerar um token com a role da função e conectar com SSL.
- Variável de ambiente com a senha criptografada por KMS, descriptografada na inicialização da função.
- Uma API key do API Gateway.
- Uma bucket policy do S3.
E: Com IAM database authentication, o token é gerado a partir das credenciais da role e vale por 15 minutos, sem senha fixa. Senha em variável de ambiente continua sendo senha fixa, e as outras opções não autenticam no banco.

Q: Um bucket S3 com arquivos estáticos deve ser acessível apenas pelo CloudFront, nunca diretamente pela URL do S3. Qual é a configuração recomendada?
- Configurar CORS no bucket.
+ Origin Access Control na origem e bucket policy permitindo s3:GetObject só à distribuição do CloudFront.
- Deixar o bucket público e confiar no cache do CloudFront, já que quase todas as requisições serão atendidas pela borda.
- Usar URLs pré-assinadas do S3 nas páginas.
E: O OAC faz o CloudFront assinar as requisições, e a bucket policy aceita só a distribuição. Bucket público permite acesso direto, URLs pré-assinadas dão acesso direto ao S3, e CORS trata de navegadores, não de restringir a origem.

Q: Um site atrás do CloudFront serve páginas em português e inglês conforme o header Accept-Language. Usuários começaram a ver a página no idioma errado depois de ligar o cache. Qual é a correção?
+ Incluir Accept-Language na chave de cache pela cache policy.
- Fazer uma invalidação de /* a cada hora.
- Encaminhar Accept-Language à origem apenas pela origin request policy.
- Reduzir o TTL padrão para 0.
E: Se o header não está na chave, as respostas dos dois idiomas compartilham a mesma entrada. Só encaminhar o header à origem não o coloca na chave; TTL zero e invalidações frequentes acabam com o benefício do cache.

Q: Um curso online quer liberar todos os segmentos de vídeo de uma aula apenas para alunos matriculados, sem mudar as URLs dos arquivos. Qual recurso do CloudFront usar?
- Field-level encryption.
- Restrição geográfica.
- URLs assinadas para cada segmento.
+ Cookies assinados.
E: Cookies assinados liberam vários arquivos sem alterar as URLs; URLs assinadas exigiriam uma URL por arquivo. Restrição geográfica limita por país, e field-level encryption protege campos de formulários.

Q: Uma equipe precisa reescrever URLs e normalizar query strings em todas as requisições dos usuários, com a menor latência e o menor custo possíveis. Não há chamadas de rede. Qual recurso usar?
- Lambda@Edge no evento origin response.
- Uma regra do AWS WAF.
- Uma função Lambda regional atrás do API Gateway.
+ CloudFront Functions no evento viewer request.
E: CloudFront Functions são feitas para transformações leves de URL e headers no viewer request, com execução abaixo de milissegundo. Lambda@Edge é mais pesado e o origin response acontece depois da origem; uma Lambda regional adiciona uma ida à Região; e WAF filtra requisições, não as reescreve.

Q: Uma equipe publica uma nova versão do arquivo app.js no S3 várias vezes por dia e sempre precisa invalidar o CloudFront. Qual prática evita as invalidações?
- Desligar o cache do comportamento.
+ Usar nomes de arquivo versionados (app.v43.js) e atualizar as referências no HTML.
- Definir o TTL máximo como 1 ano.
- Usar Lambda@Edge no evento origin response para apagar do cache a versão antiga a cada novo upload.
E: Com nomes versionados, cada versão tem outra URL e é buscada na origem sem invalidação. TTL longo agrava o problema, desligar o cache perde o benefício e Lambda@Edge não apaga o cache.

## Flashcards

F: Lazy loading (cache-aside): prós e contras
V: Prós: só cacheia o que é pedido; a falha do cache não derruba a aplicação. Contras: miss custa 3 idas; pode servir dado velho (use TTL).

F: Write-through: prós e contras
V: Prós: cache sempre atualizado nas escritas. Contras: cada escrita custa duas operações; cache com dados que nunca são lidos; combine com lazy loading e TTL.

F: Redis/Valkey vs. Memcached no ElastiCache
V: Redis/Valkey: estruturas (sorted sets, pub/sub), réplicas, Multi-AZ, persistência, backups. Memcached: chave-valor simples, multithread, sem replicação nem persistência.

F: Read replica vs. Multi-AZ no RDS
V: Read replica: assíncrona, endpoint próprio, escala leituras. Multi-AZ: standby síncrona para failover, alta disponibilidade.

F: Endpoints do Aurora
V: Cluster endpoint (escrita), reader endpoint (balanceia entre réplicas, até 15) e custom endpoints.

F: Autenticação IAM no RDS
V: Token gerado com generate-db-auth-token a partir da role, válido por 15 minutos, conexão com SSL. MySQL e PostgreSQL.

F: O que é Origin Access Control (OAC)?
V: Mecanismo para o CloudFront acessar um bucket S3 privado; a bucket policy permite só cloudfront.amazonaws.com para aquela distribuição. Substitui o OAI.

F: Cache policy vs. origin request policy no CloudFront
V: Cache policy define a chave de cache (headers, cookies, query strings) e TTLs. Origin request policy só encaminha valores à origem, sem colocá-los na chave.

F: URL assinada vs. cookie assinado no CloudFront
V: URL assinada: um arquivo. Cookie assinado: vários arquivos sem mudar as URLs.

F: CloudFront Functions vs. Lambda@Edge
V: CloudFront Functions: JS leve, só viewer request/response, sem rede. Lambda@Edge: Node.js/Python, os 4 eventos (viewer e origin), com rede.
