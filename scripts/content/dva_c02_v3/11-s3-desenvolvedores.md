# 11. S3 para desenvolvedores: objetos, URLs pré-assinadas, criptografia e eventos

## Mapa da aula
O S3 aparece na prova como armazenamento de arquivos da aplicação. Você vai aprender:

• buckets, objetos, chaves, metadados e consistência;
• operações do SDK, leitura por intervalo de bytes e limites de desempenho;
• upload multipart e Transfer Acceleration;
• URLs pré-assinadas: como funcionam e quanto tempo valem;
• criptografia: SSE-S3, SSE-KMS, DSSE-KMS, SSE-C e no cliente, e como exigir criptografia;
• controle de acesso, Block Public Access e CORS;
• notificações de eventos;
• classes de armazenamento, lifecycle e versionamento.

## Buckets, objetos e consistência
Um bucket é um contêiner com nome único no mundo, criado em uma Região. Um objeto é um arquivo identificado por sua chave (key), como fotos/2026/gato.png. O S3 não tem pastas de verdade: "fotos/2026/" é um prefixo da chave, que o console mostra como pasta.

• Tamanho de um objeto: de 0 bytes a 5 TB.
• Um único PutObject aceita até 5 GB; acima disso, multipart é obrigatório.
• Metadados de sistema (Content-Type, Content-Length) e metadados definidos pelo usuário (x-amz-meta-*, até 2 KB), definidos na gravação.
• Tags de objeto: até 10 pares chave-valor, que podem ser alterados depois e usados em lifecycle e em condições de IAM.

Consistência: o S3 tem consistência forte de leitura após escrita para todas as operações. Depois de um PUT bem-sucedido, qualquer GET ou LIST já vê o objeto novo.

## Operações do SDK e desempenho
Operações principais: PutObject, GetObject, HeadObject (só metadados, sem baixar o conteúdo), DeleteObject, CopyObject e ListObjectsV2 (até 1.000 chaves por página; use paginator).

Leitura por intervalo (byte-range fetch): o header Range: bytes=0-1048575 baixa só uma parte do objeto. Serve para ler o cabeçalho de um arquivo grande ou baixar em paralelo partes de um arquivo enorme.

Desempenho: o S3 suporta pelo menos 3.500 requisições de escrita (PUT, COPY, POST, DELETE) e 5.500 de leitura (GET, HEAD) por segundo por prefixo. Não há limite de prefixos por bucket. Para mais vazão, distribua os objetos entre vários prefixos. Excesso gera 503 SlowDown, que o SDK repete com backoff.

## Upload multipart
O upload multipart divide um objeto em partes enviadas de forma independente:

• recomendado acima de 100 MB e obrigatório acima de 5 GB;
• partes de 5 MB a 5 GB (a última pode ser menor), até 10.000 partes;
• partes podem ser enviadas em paralelo, aumentando a vazão;
• se uma parte falha, só ela é reenviada.

Fluxo: CreateMultipartUpload → UploadPart para cada parte → CompleteMultipartUpload. Os utilitários de alto nível dos SDKs fazem tudo isso automaticamente: no SDK de JavaScript v3, a classe Upload do pacote @aws-sdk/lib-storage divide o arquivo, envia as partes em paralelo e conclui o upload.

Uploads incompletos ficam guardados e cobrados até serem concluídos ou abortados. Crie uma regra de lifecycle AbortIncompleteMultipartUpload (por exemplo, após 7 dias).

Transfer Acceleration: para uploads de longa distância (usuários em outro continente), o envio entra pela borda do CloudFront mais próxima e segue pela rede da AWS. Usa o endpoint nome-do-bucket.s3-accelerate.amazonaws.com, e o nome do bucket não pode ter pontos.

## URLs pré-assinadas
Uma URL pré-assinada permite que alguém sem credenciais AWS faça uma operação específica (GET ou PUT de um objeto) por tempo limitado. A URL é assinada com as credenciais de quem a gerou.

• A URL só funciona se quem a assinou tiver permissão para aquela operação. Gerar a URL não verifica permissão; o S3 verifica quando a URL é usada.
• Validade máxima de 7 dias quando assinada com credenciais de um usuário IAM (SigV4).
• Se for assinada com credenciais temporárias (role, como em Lambda ou EC2), ela para de funcionar quando essas credenciais expirarem, mesmo que a expiração pedida seja maior.
• Para PUT, se o Content-Type foi incluído na assinatura, o cliente precisa enviar exatamente o mesmo header.
• Para formulários HTML no navegador, existe o presigned POST, que permite impor condições como tamanho máximo e prefixo da chave.

Padrão de upload direto: o navegador pede ao backend uma URL pré-assinada de PUT; o backend valida o usuário e gera a URL; o navegador envia o arquivo direto ao S3, sem passar pela Lambda nem pelo API Gateway (e sem os limites de 6 MB e 10 MB deles).

```typescript
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({});
const url = await getSignedUrl(
  s3,
  new PutObjectCommand({ Bucket: "uploads-app", Key: "clientes/c-42/rg.pdf", ContentType: "application/pdf" }),
  { expiresIn: 300 }, // 5 minutos
);
// O navegador faz PUT nesta URL com o header Content-Type: application/pdf
```

## Criptografia em repouso
Opções do lado do servidor (o S3 criptografa ao gravar e descriptografa ao ler):

• SSE-S3: chaves gerenciadas pelo S3 (AES-256). Header x-amz-server-side-encryption: AES256. É o padrão para todos os objetos novos desde 2023, sem custo extra.
• SSE-KMS: chave do AWS KMS (gerenciada pela AWS ou sua). Header aws:kms e, opcionalmente, o id da chave. Dá controle de acesso pela key policy e auditoria de uso no CloudTrail. Quem grava precisa de kms:GenerateDataKey; quem lê precisa de kms:Decrypt.
• DSSE-KMS: duas camadas de criptografia com KMS, para requisitos de conformidade.
• SSE-C: você envia a sua chave em headers a cada requisição. O S3 usa e descarta a chave, sem guardá-la. Exige HTTPS. Se você perder a chave, perde o dado.

Criptografia no cliente: a aplicação criptografa antes de enviar (por exemplo, com o Amazon S3 Encryption Client ou o AWS Encryption SDK). O S3 só vê dados já criptografados.

Atenção com SSE-KMS em alto volume: cada objeto gera chamadas ao KMS, que tem cotas de requisições por segundo. Ative S3 Bucket Keys para reduzir drasticamente as chamadas ao KMS e o custo.

## Como exigir criptografia e HTTPS
• Criptografia padrão do bucket: todo objeto gravado sem header recebe a criptografia configurada (SSE-S3 ou SSE-KMS com uma chave escolhida).
• Bucket policy para exigir SSE-KMS: negar s3:PutObject quando a condição s3:x-amz-server-side-encryption não for aws:kms.
• Bucket policy para exigir criptografia em trânsito: negar todas as ações quando aws:SecureTransport for false.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "SomenteHTTPS",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": ["arn:aws:s3:::dados-app", "arn:aws:s3:::dados-app/*"],
    "Condition": {"Bool": {"aws:SecureTransport": "false"}}
  }]
}
```

## Controle de acesso
Quem pode acessar um objeto depende de:

• políticas IAM da identidade que faz a requisição;
• bucket policy (política baseada em recurso do bucket);
• Block Public Access, que impede acesso público mesmo que uma policy tente liberar. Vem ligado por padrão;
• ACLs, desativadas por padrão (Object Ownership "bucket owner enforced"). Use policies.

Na mesma conta, basta um Allow na identidade ou na bucket policy (sem Deny). Entre contas, é preciso Allow nos dois lados: na policy IAM da outra conta e na bucket policy.

Lembre-se do formato dos ARNs: ações sobre o bucket (s3:ListBucket) usam arn:aws:s3:::bucket; ações sobre objetos (s3:GetObject) usam arn:aws:s3:::bucket/*. Errar isso gera AccessDenied.

## CORS no S3
Se uma página em https://app.exemplo.com usa JavaScript para ler ou enviar arquivos direto para o bucket (por exemplo, com uma URL pré-assinada), o bucket precisa de uma configuração CORS:

• AllowedOrigins: https://app.exemplo.com;
• AllowedMethods: GET, PUT, POST;
• AllowedHeaders: os headers que o navegador vai enviar (Content-Type...);
• ExposeHeaders: headers da resposta que o JavaScript pode ler (ETag, útil em multipart);
• MaxAgeSeconds: por quanto tempo o navegador guarda o resultado do preflight.

Sem isso, o upload funciona no curl, mas falha no navegador com erro de CORS.

## Notificações de eventos
O S3 pode avisar quando objetos são criados, apagados ou restaurados (s3:ObjectCreated:*, s3:ObjectRemoved:*...):

• Destinos diretos: SNS, SQS e Lambda, com filtro por prefixo e sufixo da chave (uploads/ e .jpg).
• EventBridge: ligando a integração, todos os eventos do bucket vão para o EventBridge, com filtros mais ricos (tamanho, metadados), vários destinos, archive e replay.

Regras práticas:
• Entrega pelo menos uma vez, normalmente em segundos. O consumidor precisa ser idempotente: use bucket, chave e versionId (ou sequencer) para identificar o evento.
• O destino precisa permitir que o S3 publique: política do tópico ou da fila, ou permissão de invocação na Lambda.
• Para vários consumidores do mesmo evento, mande para SNS ou EventBridge e faça fan-out.
• Cuidado com laços: não grave a saída no mesmo prefixo que dispara a função.

## Classes de armazenamento, lifecycle e versionamento
Classes, da mais acessada para a mais fria:
• S3 Standard: acesso frequente.
• S3 Intelligent-Tiering: move objetos entre camadas automaticamente conforme o uso; bom para padrão de acesso desconhecido.
• S3 Standard-IA e One Zone-IA: acesso infrequente, com cobrança por recuperação; One Zone fica em uma só AZ.
• S3 Glacier Instant Retrieval, Glacier Flexible Retrieval e Glacier Deep Archive: arquivamento, do acesso em milissegundos ao de horas.

Regras de lifecycle movem objetos entre classes (transições) ou os apagam (expiração) por idade, prefixo ou tag.

Versionamento guarda todas as versões de um objeto. Apagar sem informar a versão cria um delete marker, e o objeto pode ser recuperado. Use lifecycle para expirar versões antigas (noncurrent versions) e controlar o custo.

Hospedagem de site estático: o S3 serve páginas por HTTP. Para HTTPS e domínio próprio, coloque o CloudFront na frente (aula 16).

## Pegadinhas frequentes
• PutObject único até 5 GB; acima disso, multipart.
• URL pré-assinada com credencial de role expira junto com a credencial.
• SSE-C exige HTTPS e o envio da chave em toda requisição.
• SSE-KMS em alto volume: S3 Bucket Keys para não estourar a cota do KMS.
• s3:ListBucket no ARN do bucket; s3:GetObject em bucket/*.
• Upload pelo navegador falha só no navegador → CORS no bucket.
• Uploads multipart incompletos geram custo; use AbortIncompleteMultipartUpload.

## Resumo para revisão
• Objeto até 5 TB; PUT único até 5 GB; consistência forte.
• 3.500 escritas e 5.500 leituras por segundo por prefixo.
• Multipart: recomendado acima de 100 MB, obrigatório acima de 5 GB, partes de 5 MB, até 10.000.
• Transfer Acceleration para longa distância.
• Pré-assinada: até 7 dias com usuário IAM; limitada pela credencial temporária.
• SSE-S3 (padrão), SSE-KMS (auditoria, Bucket Keys), DSSE-KMS, SSE-C (HTTPS, chave sua), no cliente.
• Exigir criptografia: criptografia padrão + bucket policy; HTTPS com aws:SecureTransport.
• Eventos para SNS, SQS, Lambda ou EventBridge; idempotência.

## Questões

Q: Um aplicativo web permite que usuários enviem vídeos de até 2 GB. Hoje os arquivos passam pela API Gateway e por uma Lambda, e uploads grandes falham. Qual desenho resolve com menos código?
+ O backend gera uma URL pré-assinada de PUT e o navegador envia o arquivo direto ao S3.
- Dividir o vídeo em pedaços de 6 MB e enviar cada um pela API.
- Usar SSE-C para aceitar arquivos maiores.
- Aumentar o timeout da Lambda para 15 minutos.
E: Com a URL pré-assinada, o arquivo vai direto para o S3, sem os limites de payload do API Gateway (10 MB) e da Lambda (6 MB). Timeout não muda limite de tamanho, quebrar em pedaços pela API reinventa o multipart, e o tipo de criptografia não altera limites de upload.

Q: Uma função Lambda gera URLs pré-assinadas com validade de 24 horas, mas os usuários relatam que os links param de funcionar em poucas horas. Por quê?
- O bucket tem versionamento ativado.
+ A URL foi assinada com as credenciais temporárias da role da função e expira quando elas expiram.
- O objeto foi movido para Glacier.
- URLs pré-assinadas valem no máximo 1 hora.
E: A validade efetiva de uma URL assinada com credenciais temporárias é limitada pela expiração dessas credenciais. O máximo de 7 dias vale para credenciais de usuário IAM, e versionamento não invalida URLs.

Q: Uma empresa exige que todo objeto gravado em um bucket use SSE-KMS. Uploads sem esse tipo de criptografia devem ser rejeitados. Qual é a solução?
- Uma regra de lifecycle que recriptografa com SSE-KMS, depois de 1 dia, todo objeto gravado sem criptografia.
+ Uma bucket policy que nega s3:PutObject quando s3:x-amz-server-side-encryption não for aws:kms.
- Ativar Transfer Acceleration, que só aceita uploads criptografados e rejeita os demais automaticamente.
- Ativar o versionamento.
E: A bucket policy com Deny condicionado ao header rejeita uploads fora do padrão. A criptografia padrão do bucket também ajuda, aplicando SSE-KMS a uploads sem header; versionamento, lifecycle e Transfer Acceleration não tratam de criptografia na gravação.

Q: Após ativar SSE-KMS em um bucket que recebe milhares de uploads por segundo, a aplicação começou a receber erros de throttling do KMS. Qual é a correção recomendada?
- Desativar o versionamento.
+ Ativar S3 Bucket Keys no bucket.
- Trocar para SSE-C.
- Gerar uma chave KMS nova para cada objeto.
E: S3 Bucket Keys reduzem muito as chamadas ao KMS, porque o S3 usa uma chave de nível de bucket por um período. SSE-C transfere a gestão da chave para a aplicação; uma chave KMS por objeto aumentaria as chamadas; e versionamento não muda o uso do KMS.

Q: Uma empresa quer que o S3 nunca armazene suas chaves de criptografia, mas que a criptografia continue sendo feita no lado do servidor. Qual opção atende?
- SSE-KMS com chave gerenciada pelo cliente, que fica sob controle exclusivo da empresa.
- SSE-S3.
+ SSE-C, enviando a chave em cada requisição por HTTPS.
- DSSE-KMS, com duas camadas de criptografia e chaves geradas pelo cliente.
E: No SSE-C, a chave vem nos headers da requisição, o S3 criptografa e descarta a chave. Em SSE-S3 a chave é do S3, e em SSE-KMS e DSSE-KMS as chaves ficam no KMS. A criptografia no cliente também evitaria entregar a chave, mas aí a criptografia não é no servidor.

Q: Um aplicativo faz upload de arquivos de 8 GB para o S3 com PutObject e recebe erro. Qual é a correção?
- Ativar Transfer Acceleration.
- Comprimir o arquivo antes do envio, porque o PutObject aceita no máximo o mesmo payload de 6 MB da Lambda.
- Aumentar o tamanho máximo do bucket.
+ Usar upload multipart, obrigatório para objetos acima de 5 GB.
E: Um único PUT aceita até 5 GB; acima disso, é preciso multipart (que também é recomendado a partir de 100 MB). Transfer Acceleration muda o caminho de rede, não o limite; buckets não têm tamanho máximo; e 6 MB é limite da Lambda.

Q: Uma página em https://portal.exemplo.com envia arquivos para o S3 usando URLs pré-assinadas. O upload funciona com curl, mas falha no navegador com erro de CORS. O que configurar?
- Uma bucket policy permitindo s3:PutObject a todos.
- Desligar o Block Public Access.
+ Uma configuração CORS no bucket permitindo a origem do portal, o método PUT e os headers enviados.
- Ativar a hospedagem de site estático no bucket, que libera o acesso do navegador a partir de qualquer origem.
E: O navegador exige que o bucket responda com headers CORS para a origem do portal; o curl não aplica essa regra. Abrir o bucket ao público é perigoso e desnecessário, já que a URL pré-assinada autoriza o PUT, e site estático não muda o CORS.

Q: Uma função recebe AccessDenied ao listar os objetos de um bucket, embora tenha s3:ListBucket na policy com o recurso arn:aws:s3:::relatorios/*. Qual é a correção?
- Ativar o versionamento do bucket.
- Usar credenciais de um usuário IAM, porque roles de Lambda não podem listar buckets inteiros.
+ Usar o recurso arn:aws:s3:::relatorios (o bucket, sem /*) para s3:ListBucket.
- Adicionar s3:GetObject.
E: ListBucket é uma ação sobre o bucket, cujo ARN não tem /*; o /* representa os objetos, usado em GetObject e PutObject. GetObject não lista, e versionamento e tipo de credencial não corrigem o ARN.

Q: Três sistemas diferentes precisam reagir a cada imagem enviada a um bucket. Qual configuração permite que todos recebam o mesmo evento?
- Uma regra de lifecycle por sistema.
- Três notificações de evento iguais, uma para cada fila SQS, todas com o mesmo prefixo e sufixo no bucket.
- Uma única fila SQS lida pelos três sistemas.
+ Enviar os eventos para um tópico SNS (ou para o EventBridge) e assinar as três filas ou funções.
E: Fan-out por SNS ou EventBridge entrega o mesmo evento a vários destinos. O S3 não permite notificações com prefixo e sufixo sobrepostos para o mesmo tipo de evento; em uma fila única, cada mensagem vai para um só consumidor; e lifecycle não gera notificações para sistemas.

Q: Um bucket recebe 20.000 leituras GET por segundo de objetos no mesmo prefixo e algumas requisições retornam 503 SlowDown. Qual mudança aumenta a vazão?
- Desativar a consistência forte do bucket para reduzir o custo de cada leitura.
- Mudar os objetos para S3 Glacier.
+ Distribuir os objetos em vários prefixos.
- Usar SSE-C.
E: O desempenho escala por prefixo (5.500 GET por segundo por prefixo); vários prefixos multiplicam a capacidade. Glacier piora o acesso, a consistência forte não pode ser desligada e o tipo de criptografia não aumenta a vazão.

## Flashcards

F: Limites de tamanho de objetos no S3
V: Objeto de até 5 TB. Um único PutObject até 5 GB. Multipart recomendado acima de 100 MB e obrigatório acima de 5 GB (partes de 5 MB, até 10.000).

F: Desempenho do S3 por prefixo
V: 3.500 PUT/COPY/POST/DELETE e 5.500 GET/HEAD por segundo por prefixo. Mais prefixos, mais vazão.

F: Validade de uma URL pré-assinada
V: Até 7 dias com credenciais de usuário IAM (SigV4). Com credenciais temporárias, expira quando elas expiram.

F: Tipos de criptografia no servidor do S3
V: SSE-S3 (padrão, AES-256), SSE-KMS (aws:kms, auditoria e key policy), DSSE-KMS (duas camadas), SSE-C (chave do cliente em cada requisição, HTTPS obrigatório).

F: O que são S3 Bucket Keys?
V: Chave de nível de bucket usada com SSE-KMS para reduzir as chamadas ao KMS, evitando throttling e reduzindo custo.

F: Como exigir HTTPS em um bucket?
V: Bucket policy com Deny para s3:* quando aws:SecureTransport for false.

F: Permissões KMS para usar SSE-KMS
V: Gravar: kms:GenerateDataKey. Ler: kms:Decrypt. Além das permissões do S3.

F: Para onde o S3 envia notificações de eventos?
V: SNS, SQS e Lambda (filtro por prefixo e sufixo) ou EventBridge (filtros ricos, vários destinos, archive e replay). Entrega pelo menos uma vez.

F: Para que serve Transfer Acceleration?
V: Acelerar uploads de longa distância pela borda do CloudFront. Endpoint bucket.s3-accelerate.amazonaws.com; nome sem pontos.

F: O que a regra AbortIncompleteMultipartUpload faz?
V: Apaga as partes de uploads multipart não concluídos depois de N dias, evitando custo de armazenamento escondido.
