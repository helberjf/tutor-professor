# 21. KMS e criptografia: envelope encryption, key policy, rotação e certificados

## Mapa da aula
Criptografia é uma das tarefas do domínio de segurança. Nesta aula:

• criptografia em repouso e em trânsito, no servidor e no cliente;
• tipos de chave do KMS: simétrica, assimétrica e HMAC; AWS owned, AWS managed e customer managed;
• o limite de 4 KB do Encrypt e a envelope encryption com GenerateDataKey;
• encryption context;
• key policy, grants e acesso entre contas;
• rotação, aliases, exclusão, cotas de requisição e chaves multi-Região;
• CloudHSM, ACM e AWS Private CA.

## Em repouso, em trânsito, no servidor e no cliente
• Em repouso: os dados gravados em disco ou serviço (S3, DynamoDB, EBS, RDS, SQS) ficam criptografados.
• Em trânsito: os dados viajam por TLS (HTTPS). Para exigir, use listeners HTTPS, aws:SecureTransport em bucket policies e TLS entre o load balancer e os alvos quando necessário.
• No servidor (server-side): o serviço criptografa ao gravar e descriptografa ao ler, de forma transparente para quem tem permissão.
• No cliente (client-side): a aplicação criptografa antes de enviar; o serviço só vê dados criptografados. Use quando nem o serviço de armazenamento pode ver o conteúdo em claro.

A maioria dos serviços AWS integra criptografia em repouso com o AWS KMS.

## Tipos de chave do KMS
Pelo uso:
• Simétrica (padrão): uma chave AES-256 que nunca sai do KMS sem criptografia. Usada para criptografar e descriptografar dentro do KMS e pelos serviços integrados.
• Assimétrica (RSA ou ECC): par de chaves; a pública pode ser baixada. Usada para criptografar fora da AWS por quem não pode chamar o KMS, ou para assinar e verificar assinaturas.
• HMAC: gerar e verificar códigos de autenticação de mensagens.

Pela propriedade:
• AWS owned keys: usadas internamente por serviços, invisíveis na sua conta, sem custo.
• AWS managed keys (aws/s3, aws/lambda, aws/dynamodb): criadas por um serviço na sua conta. Você vê e audita, mas não altera a key policy, não controla a rotação (anual, automática) e não as usa entre contas.
• Customer managed keys: criadas por você. Você controla key policy, grants, rotação, aliases, habilitar/desabilitar e exclusão; podem ser usadas entre contas. Têm custo mensal por chave.

Na prova: "controlar quem usa a chave, compartilhar com outra conta ou definir a rotação" → customer managed key.

## O limite de 4 KB e a envelope encryption
A API Encrypt do KMS criptografa no máximo 4 KB de dados. Ela serve para segredos pequenos, não para arquivos.

Para dados maiores, use envelope encryption:

1. Chame GenerateDataKey com o id da KMS key. O KMS devolve uma data key em duas formas: em texto claro (Plaintext) e criptografada pela KMS key (CiphertextBlob).
2. Criptografe os dados localmente com a data key em texto claro (por exemplo, AES-GCM).
3. Apague a data key em texto claro da memória.
4. Guarde os dados criptografados junto com a data key criptografada.

Para ler:
5. Chame Decrypt com a data key criptografada; o KMS devolve a data key em texto claro (se você tiver permissão kms:Decrypt).
6. Descriptografe os dados localmente.

Vantagens: dados grandes nunca trafegam até o KMS, uma única chamada ao KMS por objeto e o controle de acesso continua na KMS key. GenerateDataKeyWithoutPlaintext devolve só a forma criptografada, para quando a criptografia acontecerá depois em outro componente. O AWS Encryption SDK implementa tudo isso, inclusive cache de data keys.

```typescript
import { createCipheriv, randomBytes } from "node:crypto";
import { GenerateDataKeyCommand, KMSClient } from "@aws-sdk/client-kms";

const kms = new KMSClient({});
const contexto = { relatorio: "r-2026-10", tenant: "t-42" };

const chave = await kms.send(new GenerateDataKeyCommand({
  KeyId: "alias/relatorios", KeySpec: "AES_256", EncryptionContext: contexto,
}));
const iv = randomBytes(12);
const cifra = createCipheriv("aes-256-gcm", chave.Plaintext!, iv);
const cifrado = Buffer.concat([cifra.update(conteudo), cifra.final()]);
const tag = cifra.getAuthTag();
chave.Plaintext!.fill(0); // não guarde a chave em claro
await salvar({ cifrado, iv, tag, chaveCifrada: chave.CiphertextBlob, contexto });

// Leitura: DecryptCommand({ CiphertextBlob, EncryptionContext: contexto }) devolve a data key
```

## Decrypt, ReEncrypt e encryption context
• Decrypt com chave simétrica não precisa informar o KeyId: o texto cifrado carrega a identificação da chave. Informar o KeyId mesmo assim é uma boa prática para evitar usar uma chave inesperada.
• ReEncrypt troca a KMS key que protege um dado criptografado sem expor o texto claro fora do KMS (útil para migrar para outra chave).

Encryption context é um conjunto de pares chave-valor não secretos enviado no Encrypt ou GenerateDataKey. Ele fica vinculado ao texto cifrado: o Decrypt só funciona com o mesmo contexto. Usos:
• garantir que um dado cifrado de um tenant não seja descriptografado como se fosse de outro;
• auditoria: o contexto aparece nos eventos do CloudTrail;
• autorização: policies podem exigir valores com a condição kms:EncryptionContext:chave.

Não coloque segredos no contexto: ele é registrado em texto claro nos logs.

## Key policy, IAM e grants
Toda KMS key tem uma key policy, a policy baseada em recurso que controla o acesso a ela.

• A key policy padrão contém um statement que dá à conta (arn:aws:iam::CONTA:root) acesso total à chave. Esse statement é o que permite que policies IAM concedam o uso da chave. Sem ele, só funciona o que a própria key policy listar.
• Separe administradores da chave (podem alterar a policy, agendar exclusão) de usuários da chave (kms:Encrypt, kms:Decrypt, kms:GenerateDataKey).
• A condição kms:ViaService permite o uso da chave apenas quando a requisição vem de um serviço, por exemplo s3.sa-east-1.amazonaws.com.
• Grants: delegações programáticas e temporárias (CreateGrant, RetireGrant), usadas por serviços como EBS e RDS para usar a chave em seu nome.

Erro comum: uma role tem kms:Decrypt na policy IAM, mas recebe AccessDenied. Causa provável: a key policy não tem o statement que habilita as policies IAM da conta (ou não lista essa role).

## KMS entre contas
Para uma identidade da conta B usar uma customer managed key da conta A:

1. Na conta A, a key policy permite o principal da conta B (a conta ou uma role específica) nas ações necessárias.
2. Na conta B, a policy IAM da identidade permite as mesmas ações no ARN da chave da conta A.

As duas partes são obrigatórias. AWS managed keys não podem ser usadas entre contas; por isso, para compartilhar um bucket criptografado ou um snapshot com outra conta, use uma customer managed key.

Exemplo: um segredo do Secrets Manager ou objetos do S3 com SSE-KMS lidos de outra conta exigem permissão no recurso e kms:Decrypt na chave, dos dois lados.

## Rotação, aliases e exclusão
Rotação automática (customer managed, simétricas, material gerado pelo KMS): o KMS cria um novo material de chave no período configurado (de 90 a 2.560 dias; padrão de 365). A chave lógica, o id e o ARN não mudam, e os materiais antigos são mantidos para descriptografar dados antigos. Não é preciso recriptografar nada. Existe também rotação sob demanda.

AWS managed keys giram automaticamente a cada ano. Chaves assimétricas, HMAC e com material importado não têm rotação automática: a rotação é manual, criando uma chave nova e mudando o alias.

Alias: um nome amigável (alias/pagamentos) que aponta para uma chave. O código usa o alias; para rotação manual, aponte o alias para a chave nova.

Exclusão: agendada com período de espera de 7 a 30 dias (padrão 30). Depois de excluída, os dados criptografados com ela ficam irrecuperáveis. Na dúvida, desabilite a chave em vez de excluir.

## Cotas e desempenho
O KMS tem cotas de requisições criptográficas por segundo, por conta e Região, compartilhadas entre as operações (Encrypt, Decrypt, GenerateDataKey...). Acima delas, as chamadas recebem ThrottlingException.

Como evitar:
• envelope encryption com cache de data keys (AWS Encryption SDK), em vez de uma chamada ao KMS por pequeno dado;
• S3 Bucket Keys para SSE-KMS em alto volume (aula 11);
• backoff exponencial nos retries;
• pedir aumento de cota em Service Quotas, se necessário.

Chaves multi-Região: chaves com o mesmo material e id em várias Regiões. Um dado cifrado em uma Região pode ser decifrado em outra sem chamar a Região de origem. Úteis para criptografia no cliente em aplicações globais e recuperação de desastre.

## CloudHSM, ACM e Private CA
AWS CloudHSM: módulos de segurança de hardware (HSM) dedicados, em cluster na sua VPC, totalmente controlados por você. Use quando a exigência é "HSM de uso exclusivo (single-tenant)" ou controle total das chaves pelo cliente, sem a AWS gerenciar o acesso.

AWS Certificate Manager (ACM):
• emite certificados TLS públicos gratuitos para serviços integrados: Elastic Load Balancing, CloudFront, API Gateway e outros;
• renova automaticamente (com validação por DNS, a renovação é totalmente automática);
• também importa certificados de terceiros (sem renovação automática).
Lembre: para CloudFront e APIs edge-optimized, o certificado precisa estar em us-east-1; para os demais, na Região do recurso.

AWS Private CA: autoridade certificadora privada gerenciada para emitir certificados internos (serviços em rede privada, TLS mútuo entre microsserviços, dispositivos IoT).

## Pegadinhas frequentes
• Encrypt direto: no máximo 4 KB. Arquivos usam GenerateDataKey (envelope).
• Guarde a data key criptografada, nunca a em texto claro.
• Decrypt exige o mesmo encryption context usado na criptografia.
• Sem o statement da conta na key policy, policies IAM não dão acesso à chave.
• AWS managed key não pode ser usada entre contas.
• Rotação automática mantém id e ARN e não exige recriptografar.
• Exclusão de chave: espera de 7 a 30 dias; prefira desabilitar.
• ThrottlingException do KMS → cache de data keys, Bucket Keys ou aumento de cota.

## Resumo para revisão
• Simétrica (padrão), assimétrica (pública baixável; assinar), HMAC.
• AWS owned, AWS managed (aws/servico, rotação anual, sem cross-account) e customer managed (controle total).
• Encrypt até 4 KB; GenerateDataKey devolve Plaintext + CiphertextBlob; Decrypt devolve a data key.
• Encryption context: não secreto, obrigatório no Decrypt, aparece no CloudTrail, usado em condições.
• Key policy obrigatória; statement da conta habilita IAM; grants; kms:ViaService.
• Entre contas: key policy + IAM.
• Rotação automática 90–2.560 dias (padrão 365); aliases; exclusão 7–30 dias.
• Cotas por segundo → cache de data keys, Bucket Keys.
• CloudHSM (HSM dedicado), ACM (certificados públicos, renovação automática), Private CA.

## Questões

Q: Uma aplicação precisa criptografar arquivos de 50 MB antes de gravá-los, usando uma chave do KMS. A chamada kms.encrypt com o arquivo inteiro falha. Qual é a abordagem correta?
- Dividir o arquivo em pedaços de 4 KB e chamar Encrypt para cada um.
- Pedir aumento do limite de tamanho do Encrypt.
- Usar uma chave assimétrica, que aceita arquivos grandes.
+ Envelope encryption: GenerateDataKey, criptografar localmente e guardar a data key criptografada com o arquivo.
E: Encrypt aceita no máximo 4 KB; a envelope encryption criptografa os dados localmente e usa o KMS só para proteger a data key. Milhares de chamadas de 4 KB seriam lentas, caras e sujeitas a throttling; o limite não é ajustável; e chaves assimétricas também têm limite pequeno.

Q: Depois de usar GenerateDataKey e criptografar um arquivo, o que deve ser armazenado junto com o arquivo criptografado?
- Nada; o KMS guarda a data key para você.
+ A data key criptografada (CiphertextBlob).
- A data key em texto claro.
- A KMS key exportada.
E: A data key criptografada é guardada junto dos dados e, na leitura, o Decrypt do KMS devolve a versão em claro. Guardar a versão em claro anula a proteção, KMS keys simétricas não podem ser exportadas e o KMS não armazena data keys.

Q: Uma role tem kms:Decrypt em sua policy IAM para uma customer managed key da mesma conta, mas recebe AccessDenied. Qual é a causa mais provável?
- A chave precisa ter rotação automática habilitada, porque o KMS bloqueia Decrypt em chaves sem rotação ativa.
+ A key policy não tem o statement que permite à conta usar policies IAM para essa chave, nem lista a role.
- A role precisa de kms:Encrypt também, porque o KMS só permite descriptografar a quem pode criptografar com a chave.
- O KMS exige MFA para Decrypt.
E: O acesso a KMS keys depende da key policy; sem o statement que habilita as policies IAM da conta (ou sem citar a role), a policy IAM não tem efeito. MFA, Encrypt e rotação não são requisitos para Decrypt.

Q: Objetos de um bucket com SSE-KMS precisam ser lidos por uma role de outra conta. A bucket policy já permite s3:GetObject para essa role. As leituras falham. O que falta?
- Desativar a criptografia padrão do bucket, para que os objetos passem a ser entregues sem descriptografia.
- Trocar para a AWS managed key aws/s3, que o S3 compartilha automaticamente com as contas autorizadas na bucket policy.
+ Permitir kms:Decrypt para a role na key policy da customer managed key e na policy IAM da role.
- Habilitar Transfer Acceleration.
E: A leitura de objetos SSE-KMS exige permissão de descriptografar na chave, concedida na key policy e na identidade da outra conta. AWS managed keys não podem ser usadas entre contas; desativar a criptografia não altera objetos já gravados e reduz a segurança.

Q: Um sistema multi-tenant criptografa dados de cada cliente com a mesma KMS key. A equipe quer garantir que um dado cifrado de um tenant só possa ser descriptografado quando o código informar esse mesmo tenant, e quer ver o tenant nos logs do CloudTrail. O que usar?
- Grants temporários por tenant.
- ReEncrypt a cada leitura.
+ Encryption context com o id do tenant na criptografia e na descriptografia.
- Um alias diferente para cada tenant, todos apontando para a mesma chave, usado na criptografia e na leitura.
E: O encryption context fica vinculado ao texto cifrado: o Decrypt falha com outro contexto, e os valores aparecem no CloudTrail. Aliases só dão nomes à chave, ReEncrypt troca a chave protetora e grants delegam uso, sem vincular o dado ao tenant.

Q: Uma customer managed key protege dados há três anos com rotação automática anual. Após a rotação, o que acontece com os dados criptografados antes dela?
- Precisam ser recriptografados com o novo material.
+ Continuam legíveis: o KMS mantém os materiais antigos, e a chave mantém id e ARN.
- São recriptografados automaticamente pelo KMS em segundo plano, nas semanas seguintes à rotação do material.
- Ficam inacessíveis até a restauração do material antigo.
E: A rotação automática acrescenta material novo para novas criptografias e guarda os anteriores para descriptografar dados antigos, sem trocar id ou ARN. Não é preciso nem acontece recriptografia.

Q: Uma aplicação faz milhares de chamadas GenerateDataKey por segundo para criptografar mensagens pequenas e começou a receber ThrottlingException do KMS. Qual é a solução recomendada?
- Desativar a rotação da chave.
- Usar uma chave diferente para cada mensagem.
- Trocar para Encrypt direto, que não tem cota de requisições e aceita mensagens pequenas de até 4 KB.
+ AWS Encryption SDK com cache de data keys, reaproveitando cada data key dentro de limites.
E: O cache de data keys reduz as chamadas ao KMS mantendo a envelope encryption. As cotas do KMS são por conta e Região, então chaves diferentes não ajudam; Encrypt também conta na cota; e a rotação não afeta a taxa de chamadas.

Q: Uma equipe precisa usar certificados TLS públicos em um ALB e em uma distribuição CloudFront, com renovação automática e sem custo de certificado. Qual serviço usar e onde?
- AWS Private CA, na Região do ALB.
- AWS CloudHSM.
+ AWS Certificate Manager: um certificado na Região do ALB e outro em us-east-1 para o CloudFront.
- Certificados autoassinados gerados pela equipe e importados no IAM, renovados por um script a cada ano.
E: O ACM emite certificados públicos gratuitos com renovação automática para serviços integrados; o CloudFront exige certificados em us-east-1. Private CA emite certificados privados, autoassinados não são confiáveis para navegadores e CloudHSM é para chaves em HSM dedicado.

Q: Uma regulamentação exige que as chaves criptográficas fiquem em um HSM de uso exclusivo da empresa, controlado apenas por ela. Qual serviço atende?
- AWS KMS com AWS managed keys.
+ AWS CloudHSM.
- AWS Certificate Manager.
- AWS Secrets Manager.
E: CloudHSM oferece HSMs dedicados (single-tenant) sob controle do cliente. O KMS é multi-tenant e gerenciado pela AWS, Secrets Manager guarda segredos e ACM emite certificados.

Q: Uma equipe precisa trocar imediatamente a chave usada por uma aplicação que referencia "alias/pagamentos". A chave atual é assimétrica e não tem rotação automática. Como fazer sem mudar o código?
- Habilitar a rotação automática na chave assimétrica.
- Excluir a chave antiga imediatamente.
- Exportar a chave privada da chave atual, gerar uma nova e importá-la na mesma conta com o mesmo alias.
+ Criar uma nova chave e apontar alias/pagamentos para ela, mantendo a antiga para os dados antigos.
E: Para chaves sem rotação automática, a rotação manual é criar outra chave e mover o alias; o código continua usando o alias, e a chave antiga segue disponível para dados antigos. Excluir a chave tornaria esses dados irrecuperáveis.

## Flashcards

F: Limite de dados da API Encrypt do KMS
V: 4 KB. Para mais, envelope encryption com GenerateDataKey.

F: O que GenerateDataKey devolve?
V: A data key em texto claro (Plaintext, para usar e descartar) e criptografada pela KMS key (CiphertextBlob, para guardar junto dos dados).

F: Tipos de KMS key por propriedade
V: AWS owned (invisível), AWS managed (aws/servico, rotação anual, sem cross-account, policy fixa) e customer managed (controle total, cross-account, custo mensal).

F: O que é encryption context?
V: Pares chave-valor não secretos vinculados ao texto cifrado; o Decrypt exige o mesmo contexto. Aparece no CloudTrail e pode ser exigido em policies.

F: Papel da key policy no KMS
V: Toda chave tem uma. O statement que concede acesso à conta (root) habilita as policies IAM; sem ele, só vale o que a key policy listar.

F: Usar uma KMS key de outra conta
V: Key policy da conta dona permite o principal externo + policy IAM do principal permite as ações no ARN da chave. Só customer managed keys.

F: Rotação automática de chaves do KMS
V: Customer managed simétricas: 90 a 2.560 dias (padrão 365) ou sob demanda; mantém id/ARN e materiais antigos. AWS managed: anual.

F: Exclusão de uma KMS key
V: Agendada com espera de 7 a 30 dias (padrão 30); depois, dados cifrados ficam irrecuperáveis. Prefira desabilitar.

F: Como evitar ThrottlingException no KMS?
V: Cache de data keys (Encryption SDK), S3 Bucket Keys, backoff nos retries e aumento de cota.

F: ACM vs. Private CA vs. CloudHSM
V: ACM: certificados públicos gratuitos e renovados para serviços integrados. Private CA: certificados privados internos. CloudHSM: HSM dedicado controlado pelo cliente.
