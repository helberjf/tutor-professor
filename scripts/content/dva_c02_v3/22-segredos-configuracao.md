# 22. Segredos e configuração: Secrets Manager, Parameter Store, AppConfig e dados sensíveis

## Mapa da aula
Esta aula fecha o domínio de segurança com a gestão de dados sensíveis no código. Você vai aprender:

• Secrets Manager: armazenamento, rotação automática, rótulos de versão, replicação e acesso entre contas;
• Parameter Store: hierarquia, SecureString, tiers e leitura por caminho;
• quando usar cada um;
• como ler segredos na Lambda sem custo e latência excessivos: cache e extensão;
• AppConfig: feature flags e configuração dinâmica com implantação gradual e rollback;
• classificação de dados, logs sem dados sensíveis e máscara no CloudWatch Logs.

## AWS Secrets Manager
O Secrets Manager guarda segredos: senhas de banco, chaves de APIs de terceiros, tokens.

• Os valores são criptografados com KMS (a chave aws/secretsmanager ou uma customer managed key).
• A aplicação lê com GetSecretValue, usando a própria role; o segredo não fica no código nem no repositório.
• Rotação automática em uma agenda (por exemplo, a cada 30 dias). Para RDS, Aurora, Redshift e DocumentDB há rotação gerenciada pronta; para outros sistemas, você fornece uma função Lambda de rotação.
• Replicação para outras Regiões (recuperação de desastre e aplicações multi-Região).
• Política baseada em recurso no segredo para acesso de outras contas. Para isso, o segredo precisa usar uma customer managed key, e a outra conta também precisa de kms:Decrypt na chave.
• O RDS pode gerenciar a senha mestre diretamente no Secrets Manager, com rotação.

Custo: por segredo por mês e por chamadas de API.

```typescript
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const secrets = new SecretsManagerClient({});
const { SecretString } = await secrets.send(new GetSecretValueCommand({ SecretId: "prod/pedidos/banco" }));
const segredo = JSON.parse(SecretString!);
const conexao = await conectar({ host: segredo.host, user: segredo.username, password: segredo.password });
```

## Como funciona a rotação
A função de rotação executa quatro etapas, controlando versões com rótulos (staging labels):

1. createSecret: gera uma nova senha e grava uma nova versão com o rótulo AWSPENDING.
2. setSecret: altera a senha no banco (ou no serviço) para o valor pendente.
3. testSecret: testa o login com a nova senha.
4. finishSecret: move o rótulo AWSCURRENT para a nova versão; a anterior fica com AWSPREVIOUS.

As aplicações leem o AWSCURRENT por padrão. Por isso:
• não guarde a senha em cache para sempre: use cache com prazo e, se o login falhar, busque o valor atual de novo;
• a função de rotação precisa alcançar o banco (normalmente, estar na mesma VPC) e o endpoint do Secrets Manager (VPC endpoint ou NAT);
• para evitar quedas, há a estratégia de rotação com usuários alternados (dois usuários no banco, alternando a cada rotação).

## Parameter Store
O Parameter Store, do AWS Systems Manager, guarda configuração e segredos simples em uma hierarquia de nomes:
/pedidos/prod/banco/host
/pedidos/prod/banco/senha
/pedidos/homolog/banco/host

Tipos:
• String e StringList: texto em claro (URLs, nomes de tabelas, flags simples);
• SecureString: valor criptografado com KMS. Para ler em claro, use WithDecryption=True, e a role precisa de kms:Decrypt na chave.

Tiers:
• Standard: gratuito, valores de até 4 KB, até 10.000 parâmetros por conta e Região.
• Advanced: pago, valores de até 8 KB, mais parâmetros e parameter policies (expiração e notificações de um parâmetro).

Leitura:
• GetParameter (um), GetParameters (vários), GetParametersByPath (todos sob um caminho, com Recursive=True). A permissão IAM pode ser dada por caminho: arn:aws:ssm:...:parameter/pedidos/prod/*.
• Parâmetros têm histórico de versões e rótulos; dá para ler uma versão específica (nome:3).

O Parameter Store não tem rotação automática. Ele também lê segredos do Secrets Manager por um caminho especial (/aws/reference/secretsmanager/nome) e oferece parâmetros públicos da AWS, como o id da AMI mais recente do Amazon Linux.

## Secrets Manager ou Parameter Store?
Escolha Secrets Manager quando precisar de:
• rotação automática de credenciais;
• replicação entre Regiões;
• acesso entre contas por resource policy;
• gerar senhas aleatórias e integração nativa com bancos.

Escolha Parameter Store quando precisar de:
• configuração da aplicação (URLs, nomes, limites) organizada por ambiente;
• segredos simples sem rotação, com o menor custo (tier Standard gratuito);
• leitura de muitos parâmetros por caminho.

Na prova: "rotacionar automaticamente a senha do RDS a cada 30 dias" → Secrets Manager. "Guardar configurações por ambiente com o menor custo" → Parameter Store. "Valor sensível criptografado sem rotação, barato" → Parameter Store SecureString.

Os dois podem ser referenciados no CloudFormation por dynamic references: {{resolve:ssm:/pedidos/prod/tabela}}, {{resolve:ssm-secure:...}} e {{resolve:secretsmanager:prod/pedidos/banco:SecretString:password}} (aula 24).

## Segredos na Lambda: cache e extensão
Ler o segredo a cada invocação aumenta latência, custo e o risco de throttling da API. Alternativas:

• Ler na inicialização (fora do handler) e guardar em cache com um prazo (por exemplo, 5 minutos), recarregando se o login falhar.
• AWS Parameters and Secrets Lambda Extension: uma extensão (adicionada como layer) que busca e guarda em cache parâmetros e segredos. O código consulta um endpoint local (localhost:2773) com o header X-Aws-Parameters-Secrets-Token, e a extensão só chama a API quando o cache expira.
• Utilitário de parâmetros do Powertools for AWS Lambda, com cache embutido.

Evite colocar o valor do segredo em variáveis de ambiente: quem tem lambda:GetFunctionConfiguration consegue ler, e mudar o segredo exige atualizar a função. Guarde na variável de ambiente só o nome do segredo.

## AWS AppConfig
O AppConfig, também parte do Systems Manager, publica configuração dinâmica e feature flags sem reimplantar o código:

• Fontes: configuração hospedada no próprio AppConfig, S3, Parameter Store, Secrets Manager e outras.
• Validadores: JSON Schema ou uma função Lambda verificam a configuração antes de publicar. Uma configuração inválida não chega às aplicações.
• Estratégias de implantação: liberar aos poucos (linear ou exponencial) ou de uma vez, com um tempo de observação (bake time) no final.
• Rollback automático: se um alarme do CloudWatch disparar durante a implantação, o AppConfig volta para a versão anterior.
• Leitura: as aplicações consultam o AppConfig periodicamente; na Lambda, a AppConfig Agent Lambda extension faz cache local.

Na prova: "ativar uma funcionalidade para 10% dos usuários e voltar automaticamente se houver erros, sem reimplantar" → AppConfig feature flags com implantação gradual e alarme. "Mudar um limite de configuração em execução, validando o formato antes" → AppConfig com validador.

## Classificação e dados sensíveis no código
Classifique os dados para decidir como tratá-los:
• PII (dados pessoais identificáveis): nome, CPF, e-mail, endereço;
• PHI (dados de saúde);
• dados de pagamento (PCI);
• segredos (senhas, tokens, chaves).

Práticas no código:
• nunca grave segredos no código, em arquivos de configuração versionados ou em imagens de contêiner;
• não registre segredos nem PII em logs: registre ids e campos permitidos, não o objeto inteiro da requisição;
• valide e sanitize entradas (tipo, tamanho, formato) e use consultas parametrizadas para evitar injeção de SQL;
• mascare dados na resposta (mostrar só os últimos dígitos do cartão);
• use TLS em trânsito e criptografia em repouso.

## CloudWatch Logs: máscara de dados e Macie
Mesmo com cuidado, dados sensíveis podem acabar em logs. O CloudWatch Logs tem data protection policies por log group:

• identificam padrões (e-mails, números de cartão, CPFs, chaves de acesso AWS) com identificadores gerenciados ou customizados;
• mascaram esses dados na ingestão: quem lê os logs vê os valores ocultos;
• só identidades com a permissão logs:Unmask podem ver o conteúdo original;
• podem gerar métricas e relatórios das ocorrências encontradas.

Amazon Macie descobre e classifica dados sensíveis (PII) em buckets S3 e gera alertas. Use para encontrar onde dados pessoais estão guardados.

Ferramentas de análise de código, como a varredura de segurança do Amazon Q Developer, ajudam a encontrar segredos e vulnerabilidades no código antes do deploy (aula 27).

## Pegadinhas frequentes
• Rotação automática é recurso do Secrets Manager, não do Parameter Store.
• SecureString exige WithDecryption=True e kms:Decrypt.
• Standard: 4 KB e gratuito; Advanced: 8 KB e parameter policies.
• Segredo entre contas exige resource policy no segredo e customer managed key com permissão para a outra conta.
• Depois da rotação, cache eterno do segredo gera falhas de login.
• Variável de ambiente da Lambda não é lugar para o valor do segredo.
• Feature flag com rollback por alarme → AppConfig.
• Dados sensíveis em logs → data protection policy; ver sem máscara exige logs:Unmask.

## Resumo para revisão
• Secrets Manager: KMS, GetSecretValue, rotação automática por Lambda (gerenciada para RDS e outros), rótulos AWSCURRENT/AWSPENDING/AWSPREVIOUS, replicação, resource policy.
• Rotação: createSecret, setSecret, testSecret, finishSecret.
• Parameter Store: hierarquia, String/StringList/SecureString, Standard (4 KB, grátis) e Advanced (8 KB, policies), GetParametersByPath, sem rotação.
• Dynamic references no CloudFormation para os dois.
• Lambda: cache com prazo, Parameters and Secrets Extension (localhost:2773) ou Powertools.
• AppConfig: feature flags, validadores, implantação gradual com bake time e rollback por alarme.
• Dados sensíveis: classificar, não logar, sanitizar entradas; data protection policies (logs:Unmask) e Macie.

## Questões

Q: Uma aplicação usa um banco RDS PostgreSQL e a política da empresa exige trocar a senha automaticamente a cada 30 dias, sem mudar o código a cada troca. Qual solução atende?
- Usar uma chave KMS com rotação anual.
- Guardar a senha em uma SecureString do Parameter Store e trocá-la manualmente.
- Guardar a senha em uma variável de ambiente criptografada da Lambda.
+ Guardar a credencial no Secrets Manager com rotação automática e ler o segredo em tempo de execução.
E: O Secrets Manager rotaciona a credencial (com rotação gerenciada para RDS) e a aplicação sempre lê a versão atual. O Parameter Store não rotaciona, a variável de ambiente exigiria atualizar a função e a rotação do KMS troca o material da chave, não a senha do banco.

Q: Uma equipe quer guardar URLs, nomes de tabelas e limites de cada ambiente, organizados como /app/prod/... e /app/dev/..., com o menor custo. Alguns valores são sensíveis, mas não precisam de rotação. Qual opção usar?
- Um arquivo JSON no repositório Git.
+ Parameter Store no tier Standard, com SecureString para os valores sensíveis.
- Secrets Manager para todos os valores.
- Variáveis de ambiente em todas as funções.
E: O Parameter Store organiza por hierarquia, é gratuito no tier Standard e criptografa valores sensíveis com SecureString. Secrets Manager cobra por segredo, variáveis de ambiente espalham a configuração e arquivos versionados expõem valores sensíveis.

Q: Uma função lê uma SecureString com GetParameter e recebe o valor criptografado em vez do texto claro. O que corrigir?
- Usar o tier Advanced.
- Ler o parâmetro com GetParametersByPath, que descriptografa automaticamente os valores SecureString do caminho.
+ Chamar GetParameter com WithDecryption=True e garantir kms:Decrypt na chave usada.
- Mudar o tipo do parâmetro para String, que continua protegido pela criptografia padrão da conta.
E: SecureString só é devolvido em claro com WithDecryption=True e permissão para descriptografar com a chave KMS. Mudar para String expõe o valor, e tier ou API de leitura não descriptografam.

Q: Uma função Lambda chama GetSecretValue a cada invocação e recebe muitas chamadas por segundo, aumentando custo e latência. Qual é a melhor melhoria com pouco código?
- Criar um segredo para cada invocação, distribuindo as chamadas entre vários segredos para evitar throttling.
+ Usar a AWS Parameters and Secrets Lambda Extension (ou cache com prazo fora do handler).
- Copiar o valor do segredo para uma variável de ambiente da função, atualizada por um job sempre que o segredo mudar.
- Aumentar a memória da função.
E: A extensão guarda o segredo em cache local e só consulta a API quando o cache expira, reduzindo custo e latência. A variável de ambiente expõe o segredo e não acompanha a rotação, memória não reduz chamadas e criar segredos não faz sentido.

Q: Depois da primeira rotação automática do segredo do banco, a aplicação passou a falhar no login por algumas horas. Ela lê o segredo uma única vez, quando o contêiner inicia. Qual é a correção?
- Ler sempre a versão AWSPREVIOUS.
- Desativar a rotação.
- Aumentar o intervalo de rotação para 1 ano, reduzindo a chance de a aplicação ficar com uma senha desatualizada.
+ Usar cache com prazo e, em caso de falha de autenticação, buscar de novo a versão AWSCURRENT do segredo.
E: Depois da rotação, o rótulo AWSCURRENT aponta para a nova senha; a aplicação precisa reler o segredo. Desativar ou espaçar a rotação contraria a política, e a versão anterior deixa de valer.

Q: Um segredo do Secrets Manager na conta A deve ser lido por uma role na conta B. O segredo está criptografado com a chave aws/secretsmanager. O que é necessário?
+ Trocar para uma customer managed key, dar kms:Decrypt à role da conta B na key policy e liberá-la na resource policy do segredo.
- Usar o endpoint global do Secrets Manager.
- Apenas uma policy IAM na conta B.
- Replicar o segredo para a conta B com a replicação do Secrets Manager, que copia valor e chave para a outra conta automaticamente.
E: Acesso entre contas exige resource policy no segredo e uma chave KMS que a outra conta possa usar; AWS managed keys não são compartilháveis. A replicação é entre Regiões da mesma conta, e não existe endpoint global para esse fim.

Q: Uma empresa quer ativar uma nova funcionalidade para os usuários aos poucos e voltar automaticamente para a configuração anterior se a taxa de erros subir, sem reimplantar o código. Qual serviço usar?
- AWS CodeDeploy com canary.
- Parameter Store com parameter policies que alternam o valor da flag por porcentagem e notificam em caso de erro.
- Lambda aliases com pesos.
+ AWS AppConfig com feature flag, estratégia de implantação gradual e alarme do CloudWatch para rollback.
E: O AppConfig libera configuração aos poucos e reverte quando um alarme dispara, sem novo deploy. CodeDeploy e aliases trocam versões de código, e parameter policies tratam de expiração e notificação de parâmetros.

Q: Logs de uma API estão registrando e-mails e números de cartão dos clientes. A equipe quer ocultar esses dados para a maioria das pessoas, mas permitir que a equipe de segurança veja os originais em investigações. Qual recurso usar?
+ Uma data protection policy no log group, com logs:Unmask só para a equipe de segurança.
- Apagar o log group diariamente.
- Criptografar o log group com uma chave KMS e dar kms:Decrypt só à equipe de segurança, escondendo os dados dos demais.
- Reduzir a retenção para 1 dia.
E: A data protection policy mascara dados sensíveis na ingestão, e só quem tem logs:Unmask vê os valores. Apagar logs perde evidências, a criptografia do log group não esconde dados de quem tem acesso de leitura e retenção curta não mascara nada. O ideal também é corrigir o código para não registrar esses dados.

Q: A equipe precisa descobrir quais buckets S3 contêm dados pessoais (PII) para revisar o acesso. Qual serviço usar?
+ Amazon Macie.
- AWS Config.
- Amazon Inspector.
- AWS Trusted Advisor.
E: O Macie analisa objetos no S3 e identifica dados sensíveis como PII. Config avalia configurações, Inspector procura vulnerabilidades em cargas de trabalho e Trusted Advisor dá recomendações gerais.

Q: Durante a rotação de um segredo, qual rótulo identifica a nova versão antes de ser confirmada?
- AWSPREVIOUS
- AWSLATEST
+ AWSPENDING
- AWSCURRENT
E: A nova versão é criada com AWSPENDING; no passo finishSecret, AWSCURRENT passa para ela e a versão antiga recebe AWSPREVIOUS. AWSLATEST não é um rótulo do Secrets Manager.

## Flashcards

F: Recursos principais do Secrets Manager
V: Segredos criptografados com KMS, rotação automática (Lambda; gerenciada para RDS/Aurora/Redshift/DocumentDB), replicação entre Regiões, resource policy para outras contas.

F: Etapas da rotação no Secrets Manager
V: createSecret (AWSPENDING), setSecret (aplica no banco), testSecret (testa) e finishSecret (move AWSCURRENT; a antiga vira AWSPREVIOUS).

F: Tipos de parâmetro no Parameter Store
V: String, StringList e SecureString (criptografado com KMS; ler com WithDecryption=True e kms:Decrypt).

F: Tiers do Parameter Store
V: Standard: gratuito, até 4 KB, 10.000 parâmetros. Advanced: pago, até 8 KB, parameter policies (expiração e notificações).

F: Secrets Manager ou Parameter Store?
V: Rotação automática, replicação ou cross-account → Secrets Manager. Configuração por ambiente e segredos simples baratos → Parameter Store.

F: Como ler vários parâmetros de uma hierarquia?
V: GetParametersByPath com Recursive=True (ex.: /app/prod/). Permissão IAM pode ser dada por caminho.

F: AWS Parameters and Secrets Lambda Extension
V: Extensão em layer que faz cache de parâmetros e segredos; o código consulta localhost:2773 com o header X-Aws-Parameters-Secrets-Token.

F: O que o AWS AppConfig oferece?
V: Configuração dinâmica e feature flags com validadores (JSON Schema/Lambda), implantação gradual com bake time e rollback automático por alarme do CloudWatch.

F: Data protection policy do CloudWatch Logs
V: Mascara dados sensíveis (e-mail, cartão, chaves) na ingestão de um log group. Ver o original exige logs:Unmask.

F: Para que serve o Amazon Macie?
V: Descobrir e classificar dados sensíveis (PII) em buckets S3.
