# Correção global do webapp: contraste, português e versões da API

## Contexto e causa raiz

O frontend publicado em `https://tutorprofessor.vercel.app` já contém as telas
de Sessão e Objetivos, mas o projeto separado da API
(`https://tutor-professor-api.vercel.app`) está em uma revisão anterior. As
rotas `/api/study/session/start` e `/api/objectives` respondem `404`, por isso a
tela de Sessão mostra a mensagem de servidor antigo e Objetivos exibe o erro
bruto `Not Found`. O banco também precisa das migrations de sessão e objetivos
antes de a API nova atender requisições autenticadas.

O checkout local está sete commits atrás de `origin/main` e possui alterações
locais não relacionadas. A implementação será feita em um worktree isolado
partindo de `origin/main`; as alterações existentes serão preservadas.

## Objetivos

1. Fazer Sessão e Objetivos funcionarem com a API e o schema atuais.
2. Evitar que uma API temporariamente antiga apareça como `Not Found`.
3. Corrigir o português dos textos fixos da interface, mensagens da API e do
   pacote de conteúdo didático mantido no repositório, sem alterar dados
   escritos pelos usuários nem nomes técnicos, identificadores ou exemplos em
   outros idiomas.
4. Garantir contraste legível nos temas claro e escuro, incluindo estados
   desabilitados e botões com texto branco.
5. Deixar testes que impeçam a regressão dos três problemas.

## Desenho da solução

### API, migrations e fluxo de publicação

O worktree partirá de `origin/main`. A API será atualizada primeiro e as
migrations serão aplicadas na ordem já definida pelo projeto, incluindo
`0025_study_sessions_and_auto_day`, `0026_child_profile_birth_date` e
`0027_objectives`. O schema será conferido antes do deploy da API. Depois que as
rotas autenticadas responderem, o frontend corrigido será publicado.

O deploy manterá os dois projetos Vercel separados, sem trocar domínios,
credenciais ou dados. A validação pós-publicação usará um usuário já existente
e testará login, sessão, objetivos e carregamento de lição/revisão. Se a API
estiver indisponível ou atrasada, o frontend exibirá uma mensagem em português
com ação de tentar novamente e links úteis; nunca renderizará o corpo cru
`Not Found`.

### Contraste e temas

Será criado um padrão único para ações desabilitadas: fundo e texto explícitos,
opacidade integral e cores que continuam legíveis no tema claro e no escuro.
As ações coloridas com texto branco receberão tons que atendam contraste para
texto normal; estados de resposta correta/incorreta manterão suas cores
semânticas. A correção será aplicada nas classes compartilhadas e nos casos
específicos que não usam o padrão, sem alterar a aparência de ícones que não
contêm texto.

Um teste estático detectará combinações conhecidas de texto branco com
superfícies claras e estados desabilitados sem contraste. Um smoke test no
navegador verificará as telas principais nos dois temas e registrará qualquer
elemento de texto com contraste insuficiente.

### Revisão de português

Os textos fixos serão revisados por contexto, começando por grafias
inequivocamente sem acento (`não`, `você`, `sessão`, `lição`, `revisão`,
`questão`, `início`, `possível`, `configuração`, `próxima`, `inglês`,
`conteúdo`, `descrição`, `título` e equivalentes). A revisão inclui páginas,
componentes, mensagens de erro, estados vazios, rótulos de navegação, respostas
da API e campos em português do conteúdo didático versionado.

Não haverá substituição cega por palavra: termos ambíguos, nomes próprios,
palavras em inglês e valores digitados pelo usuário serão avaliados pelo
contexto. Um teste de regressão cobrirá o conjunto de grafias inequívocas nos
arquivos de produto.

### Objetivos e Sessão

`ObjectivesBoard` tratará `404` como incompatibilidade de versão e exibirá um
estado orientativo em português, com opção de recarregar. A tela de Sessão
manterá o mesmo comportamento, com texto revisado. Depois que a API estiver
atualizada, o fluxo de criação, checklist, percentual e arquivamento será
validado por testes de API e pelo teste de interface existente.

## Testes e critérios de aceite

- Testes de API existentes de sessão e objetivos passam contra banco temporário.
- Typecheck, lint e build do frontend passam sem avisos novos.
- O teste de cobertura de tema continua verde.
- O teste de português não encontra grafias inequívocas sem acento nos textos
  de produto.
- Smoke test autenticado confirma que `/session` abre a fila, salva progresso,
  conclui o dia e que `/objectives` cria um objetivo, adiciona itens, marca um
  item e atualiza o percentual.
- Em tema claro e escuro, não há texto branco em superfície branca nem texto
  de ação desabilitada com contraste insuficiente.
- A API publicada contém as rotas novas e o frontend deixa de exibir a tela de
  servidor anterior.

## Fora de escopo

- Alterar dados pessoais ou textos criados pelos usuários.
- Renomear endpoints, campos JSON ou identificadores internos.
- Introduzir um sistema completo de internacionalização.
- Refatorar módulos sem relação com contraste, português, objetivos, sessão ou
  o deploy coordenado.
