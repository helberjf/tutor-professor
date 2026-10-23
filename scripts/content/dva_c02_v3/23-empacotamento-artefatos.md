# 23. Empacotamento: ZIP, layers, imagens de contêiner, ECR, CodeArtifact e Git

## Mapa da aula
O domínio de implantação começa pelo artefato: o que exatamente vai para a AWS. Nesta aula:

• como montar um pacote ZIP de Lambda em TypeScript com esbuild, inclusive com bibliotecas nativas;
• layers: estrutura de pastas, versões e compartilhamento;
• Lambda com imagem de contêiner: imagens base, Runtime Interface Client e emulador local;
• Amazon ECR: URI, login, tags, digest, lifecycle, varredura e replicação;
• AWS CodeArtifact para pacotes npm (e também pip e Maven);
• Git: branches, tags e o princípio de construir uma vez e promover o mesmo artefato.

## O pacote ZIP da Lambda
Um pacote ZIP contém o código JavaScript e as dependências. A Lambda não executa TypeScript diretamente: o código precisa ser transpilado.

Passos para uma função em TypeScript:
1. npm ci instala as dependências do package-lock.json;
2. o esbuild junta o código e as dependências usadas em um único arquivo (bundle), removendo o que não é usado (tree shaking): esbuild src/index.ts --bundle --platform=node --target=node22 --minify --outfile=dist/index.js;
3. compacte o conteúdo de dist/, não a pasta: o arquivo index.js precisa estar na raiz do ZIP;
4. configure o handler como index.handler.

Se o ZIP tiver uma pasta extra (dist/index.js), a função falha com "Runtime.ImportModuleError: Cannot find module 'index'". O handler procura o arquivo a partir da raiz. Enviar o .ts sem transpilar causa erro parecido.

O runtime Node.js já inclui o SDK v3, mas a recomendação é empacotar a versão do SDK que você testou, para não depender da versão que vem no runtime. Com o bundle, o pacote fica pequeno e o cold start diminui.

Bibliotecas com partes nativas (sharp, bcrypt, drivers de banco) precisam de binários para Linux e para a arquitetura da função (x86_64 ou arm64). Instalar no Windows ou no macOS e enviar o node_modules gera erros ao carregar o módulo. Soluções: instalar os binários da plataforma correta (npm install --os=linux --cpu=arm64 sharp), construir dentro de um contêiner compatível (sam build --use-container) ou usar imagem de contêiner. Módulos nativos não entram no bundle do esbuild: marque-os como external e inclua a pasta deles no pacote.

Envio: até 50 MB compactado direto pela API; maior que isso, envie para o S3 e informe bucket e chave (o limite de 250 MB descompactado continua).

```bash
npm ci
npx esbuild src/index.ts --bundle --platform=node --target=node22 --minify --sourcemap --outfile=dist/index.js
cd dist && zip -r ../funcao.zip . && cd ..
aws lambda update-function-code --function-name pedidos --zip-file fileb://funcao.zip
```

## Layers
Uma layer é um ZIP com bibliotecas, runtimes customizados, dados ou extensões, compartilhado entre funções. O conteúdo é extraído em /opt no ambiente de execução.

A estrutura de pastas importa para que o runtime encontre as bibliotecas:
• Node.js: nodejs/node_modules/ → /opt/nodejs/node_modules (o runtime já procura módulos nesse caminho);
• Python: python/ → /opt/python;
• binários: bin/ → /opt/bin.

Com bundle do esbuild, as dependências já vão dentro do index.js; layers são úteis para módulos nativos compartilhados, extensões e código comum entre muitas funções.

Regras:
• cada publicação cria uma versão imutável da layer, com ARN que termina no número da versão;
• a função aponta para uma versão específica; publicar uma versão nova da layer não atualiza as funções: é preciso alterar a configuração de cada função para a nova versão;
• até 5 layers por função, e o total (função + layers) até 250 MB descompactado;
• layers podem ser compartilhadas com outras contas ou com a organização por meio de permissões na versão da layer;
• funções em imagem de contêiner não usam layers: as dependências vão na imagem.

Na prova: "várias funções usam a mesma biblioteca e o pacote de cada uma ficou grande" → layer. "Atualizei a layer e as funções continuam com a versão antiga" → atualizar a referência de versão nas funções.

## Lambda com imagem de contêiner
Uma função pode ser empacotada como imagem de contêiner, com até 10 GB. Vantagens: dependências grandes, ferramentas de build de contêiner já usadas pela equipe e o mesmo processo de imagem para Lambda e ECS.

Requisitos:
• a imagem precisa implementar a Lambda Runtime API. As imagens base da AWS (public.ecr.aws/lambda/nodejs:22, python, java...) já trazem o Runtime Interface Client;
• com uma imagem base própria (por exemplo, Alpine ou Debian), adicione o Runtime Interface Client da linguagem;
• para testar localmente, use o Runtime Interface Emulator, que já vem nas imagens base da AWS: rode o contêiner e envie um POST para o endpoint local de invocação;
• a imagem precisa estar no Amazon ECR, e a arquitetura da imagem deve ser a mesma da função.

```dockerfile
FROM public.ecr.aws/lambda/nodejs:22
COPY package.json package-lock.json ${LAMBDA_TASK_ROOT}/
RUN npm ci --omit=dev
COPY dist/ ${LAMBDA_TASK_ROOT}/
CMD ["index.handler"]
```

## Tag, digest e atualização da função
Uma imagem é identificada por:
• tag: um nome legível (v1.4.2, latest). Por padrão, uma tag pode ser movida para outra imagem;
• digest: o hash do conteúdo (sha256:...), imutável.

Quando você configura a função com uma URI de imagem por tag, a Lambda resolve a tag para o digest no momento da implantação. Enviar uma nova imagem com a mesma tag não muda a função: é preciso chamar update-function-code com a URI (de novo) para a Lambda resolver o novo digest.

Para rastreabilidade, implante por tag de versão única (ou por digest) em vez de latest, e ative a imutabilidade de tags no repositório para impedir que uma tag de versão seja sobrescrita.

## Amazon ECR
O Amazon Elastic Container Registry guarda imagens de contêiner em repositórios privados (há também o ECR Public).

URI: CONTA.dkr.ecr.REGIAO.amazonaws.com/repositorio:tag

Login do Docker: o ECR usa um token temporário.
aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin 111122223333.dkr.ecr.sa-east-1.amazonaws.com

Permissões:
• obter o token: ecr:GetAuthorizationToken;
• enviar: ecr:InitiateLayerUpload, UploadLayerPart, CompleteLayerUpload, BatchCheckLayerAvailability e PutImage;
• baixar: ecr:BatchGetImage e ecr:GetDownloadUrlForLayer.
"no basic auth credentials" ou "authorization token has expired" no push indicam que falta fazer (ou refazer) o login.

Recursos do repositório:
• lifecycle policies: expiram imagens antigas ou sem tag (manter só as últimas 20);
• varredura de imagens (scan on push), básica ou aprimorada com o Amazon Inspector, para encontrar vulnerabilidades;
• tag immutability;
• replicação entre Regiões e contas;
• repository policy para permitir que outras contas baixem imagens.

## AWS CodeArtifact
O CodeArtifact é um repositório gerenciado de pacotes de software: npm, PyPI (pip), Maven, Gradle, NuGet, entre outros. Para um projeto TypeScript, ele substitui o registro do npm.

• Domínio: agrupa repositórios de uma organização, com armazenamento compartilhado.
• Repositório: onde as equipes publicam pacotes internos e de onde as builds baixam dependências.
• Upstream e conexão externa: um repositório pode buscar pacotes de outro repositório ou de registros públicos (npmjs.com, PyPI) e guardar uma cópia. As builds continuam funcionando mesmo se o registro público ficar indisponível, e você controla quais versões entram.
• Autenticação: aws codeartifact login --tool npm --domain empresa --repository interno configura o .npmrc com um token temporário (por padrão, 12 horas).

Na prova: "publicar bibliotecas internas e usar dependências aprovadas de registros públicos com controle e cache" → CodeArtifact. "Guardar imagens de contêiner" → ECR.

## Git, versões e promoção do artefato
Controle de versão baseado em Git aparece nas questões de implantação:

• Branches separam o trabalho: main (produção), develop, branches de funcionalidade. Um pipeline pode disparar por branch.
• Tags marcam versões de release (v2.3.0) e podem disparar pipelines de publicação.
• O hash do commit identifica exatamente o código de um artefato.
• Repositórios podem ficar no AWS CodeCommit (que voltou a aceitar novos clientes em novembro de 2025) ou no GitHub, GitLab e Bitbucket, conectados à AWS pelas AWS CodeConnections.

Princípio importante: build once, deploy many. Construa o artefato uma vez (ZIP, imagem com digest) e promova o mesmo artefato por dev, homologação e produção, mudando apenas a configuração de cada ambiente (variáveis, parâmetros). Reconstruir para cada ambiente pode gerar artefatos diferentes do que foi testado.

## Pegadinhas frequentes
• O handler procura o arquivo na raiz do ZIP; pasta extra quebra a importação.
• Bibliotecas nativas precisam ser construídas para Amazon Linux e a arquitetura da função.
• Layer nova não atualiza funções automaticamente.
• Layers: estrutura nodejs/node_modules/ (ou python/); até 5; total de 250 MB.
• Imagem com a mesma tag não atualiza a função sem update-function-code.
• Login do ECR: get-login-password com docker login; o token expira.
• Imagem de contêiner não usa layers.

## Resumo para revisão
• ZIP: TypeScript transpilado e empacotado com esbuild, index.js na raiz, handler index.handler; 50 MB direto ou via S3, 250 MB descompactado.
• Nativos: construir em Amazon Linux/arquitetura certa (sam build --use-container).
• Layers: /opt; versões imutáveis; até 5; compartilháveis; atualizar a versão nas funções.
• Imagem: até 10 GB, no ECR; imagens base com Runtime Interface Client; Runtime Interface Emulator para teste local.
• Tag resolvida para digest na implantação; use tags únicas e imutáveis.
• ECR: URI conta.dkr.ecr.regiao.amazonaws.com/repo:tag; login com get-login-password; lifecycle, scan, replicação.
• CodeArtifact: npm, pip, Maven; upstreams e conexões externas; token de 12 h (codeartifact login --tool npm).
• Git: branches, tags, commit; construir uma vez e promover o mesmo artefato.

## Questões

Q: Uma função Node.js falha com "Runtime.ImportModuleError: Cannot find module 'index'". O ZIP foi criado compactando a pasta "dist", que contém index.js. Qual é a causa?
- O runtime Node.js não suporta pacotes ZIP, só imagens de contêiner.
+ O index.js está dentro de uma subpasta no ZIP; o arquivo precisa estar na raiz do pacote.
- A função precisa de uma layer com o index.js.
- O handler deve se chamar main.handler.
E: O handler index.handler procura index.js na raiz do pacote; compactar a pasta cria o caminho dist/index.js. ZIP é suportado, o código da função não precisa estar em layer e o nome do handler pode ser qualquer um configurado.

Q: Um desenvolvedor no Windows instalou a biblioteca nativa sharp e enviou o node_modules no ZIP para uma função arm64. A função falha ao carregar o módulo. Qual é a solução?
- Mudar o runtime para uma versão antiga do Node.js.
+ Instalar os binários de Linux arm64 (npm install --os=linux --cpu=arm64) ou construir em contêiner compatível.
- Aumentar a memória da função.
- Mover a biblioteca para variáveis de ambiente.
E: Bibliotecas com código nativo precisam ser compiladas para o sistema e a arquitetura em que a função roda. Memória, runtimes antigos ou variáveis de ambiente não resolvem uma incompatibilidade de binário.

Q: Dez funções usam a mesma biblioteca de 40 MB, e cada equipe a inclui no próprio pacote. A empresa quer gerenciar a biblioteca em um só lugar. Qual é a solução?
- Usar uma variável de ambiente apontando para a biblioteca no S3, baixada a cada inicialização de ambiente.
- Colocar a biblioteca no código de uma função central e chamá-la das outras funções por invocação síncrona.
- Guardar a biblioteca em /tmp de cada função.
+ Publicar a biblioteca em uma layer e configurar as funções para usá-la.
E: Layers compartilham bibliotecas entre funções e são montadas em /opt. /tmp é temporário e por ambiente, baixar do S3 a cada inicialização aumenta o cold start, e chamar outra função não substitui uma importação de biblioteca.

Q: A equipe publicou a versão 4 de uma layer com uma correção de segurança, mas as funções continuam usando o código antigo. Por quê?
- A layer precisa ser compartilhada com a organização para que a versão nova seja distribuída às funções da conta.
+ Cada função aponta para uma versão específica da layer; é preciso atualizar as funções para a versão 4.
- Layers só são lidas no primeiro deploy.
- As layers são atualizadas nas funções em até 24 horas, depois que a nova versão se propaga pela Região inteira.
E: Versões de layer são imutáveis e as funções apontam para um ARN com número de versão. Publicar a versão 4 não muda as funções até que cada uma seja atualizada. Não há propagação automática, e compartilhamento trata de outras contas.

Q: Uma função empacotada como imagem usa a tag "latest". A equipe enviou uma nova imagem com a mesma tag, mas a função continua executando o código anterior. O que fazer?
- Apagar a imagem antiga do ECR.
- Esperar o cache do ECR expirar.
- Aumentar a concorrência provisionada para que novos ambientes sejam criados já com a imagem mais recente.
+ Chamar update-function-code com a URI da imagem para que a Lambda resolva o novo digest.
E: A Lambda resolve a tag para um digest na implantação e continua usando esse digest. É preciso atualizar o código da função para resolver de novo. Apagar a imagem antiga pode até quebrar a função, e concorrência não muda o código.

Q: Um pipeline falha no docker push para o ECR com "no basic auth credentials". O que está faltando?
- Ativar a varredura de imagens.
- Tornar o repositório público.
+ Fazer login com aws ecr get-login-password | docker login, usando uma identidade com ecr:GetAuthorizationToken.
- Uma lifecycle policy no repositório que libere o push de novas imagens quando o limite de imagens for atingido.
E: O ECR exige login com um token temporário obtido por get-login-password. Lifecycle e scan não tratam de autenticação, e tornar o repositório público não permite push sem credenciais.

Q: Uma empresa quer que suas builds baixem dependências npm e pip de um repositório controlado, com cópia dos pacotes públicos aprovados e publicação de bibliotecas internas. Qual serviço usar?
- Amazon S3 com versionamento.
- AWS CodeCommit.
- Amazon ECR.
+ AWS CodeArtifact com conexões externas para npmjs e PyPI.
E: O CodeArtifact é um repositório de pacotes que publica bibliotecas internas e faz proxy e cache de registros públicos. ECR guarda imagens de contêiner, S3 não fala os protocolos de npm e pip e CodeCommit guarda código-fonte.

Q: Um time quer testar localmente uma função empacotada como imagem baseada em public.ecr.aws/lambda/nodejs:22, enviando um evento de teste ao contêiner. O que permite isso?
- O CloudWatch agent.
- O AWS X-Ray daemon, que expõe um endpoint local de invocação na porta 2000.
- Uma Function URL local.
+ O Runtime Interface Emulator da imagem base, recebendo um POST no endpoint local.
E: As imagens base da AWS trazem o Runtime Interface Emulator, que simula a API de invocação localmente. Function URL é recurso na nuvem, e X-Ray e CloudWatch agent tratam de observabilidade.

Q: A equipe quer que uma imagem testada em homologação seja exatamente a mesma implantada em produção, sem risco de alguém sobrescrever a tag. Qual combinação é adequada?
- Usar sempre a tag latest.
- Copiar o Dockerfile para produção.
- Reconstruir a imagem a partir do mesmo commit para produção, garantindo assim que o conteúdo seja idêntico ao testado.
+ Promover a mesma imagem (por digest ou tag única) e ativar tag immutability no repositório.
E: Promover o mesmo artefato garante que produção recebe o que foi testado, e tags imutáveis impedem a troca da imagem por trás da tag. Reconstruir pode gerar outra imagem (dependências mudam), e latest é móvel por definição.

Q: Um repositório ECR acumula milhares de imagens antigas e o custo de armazenamento cresce. Qual recurso resolve com menos esforço?
- Replicar o repositório para outra Região.
- Ativar tag immutability.
- Um script cron em uma instância EC2 que lista e apaga manualmente as imagens com mais de 30 dias.
+ Uma lifecycle policy que expira imagens sem tag e mantém apenas as N mais recentes.
E: Lifecycle policies do ECR limpam imagens automaticamente por idade, quantidade ou status de tag. Um script exige manutenção, imutabilidade de tags não remove imagens e replicação aumenta o armazenamento.

## Flashcards

F: Como montar um ZIP de Lambda em TypeScript
V: npm ci, esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js e compactar o conteúdo de dist/ (index.js na raiz). Handler: index.handler.

F: Por que uma biblioteca nativa falha na Lambda?
V: O binário foi instalado para outro sistema ou arquitetura. Instale para Linux e x86_64/arm64 (npm install --os=linux --cpu=arm64) ou construa em contêiner (sam build --use-container).

F: Estrutura de pastas de uma layer
V: Node.js: nodejs/node_modules/ → /opt/nodejs/node_modules. Python: python/ → /opt/python. Binários: bin/ → /opt/bin.

F: Regras de layers
V: Versões imutáveis; a função referencia uma versão; até 5 por função; total de 250 MB descompactado; compartilháveis entre contas; imagens de contêiner não usam layers.

F: Requisitos de uma imagem para Lambda
V: Até 10 GB, no ECR, mesma arquitetura da função e Runtime Interface Client (já presente nas imagens base da AWS).

F: Por que uma nova imagem com a mesma tag não atualiza a função?
V: A Lambda resolve a tag para um digest na implantação. É preciso chamar update-function-code para resolver de novo.

F: Login do Docker no ECR
V: aws ecr get-login-password --region R | docker login --username AWS --password-stdin CONTA.dkr.ecr.R.amazonaws.com (exige ecr:GetAuthorizationToken).

F: Recursos de um repositório ECR
V: Lifecycle policies, scan on push (básico ou Inspector), tag immutability, replicação entre Regiões/contas e repository policy.

F: O que é o AWS CodeArtifact?
V: Repositório gerenciado de pacotes (npm, pip, Maven, NuGet...) com upstreams e conexões a registros públicos; login com token temporário (12 h por padrão).

F: O que significa "build once, deploy many"?
V: Construir o artefato uma vez e promover o mesmo artefato entre ambientes, mudando apenas a configuração.
