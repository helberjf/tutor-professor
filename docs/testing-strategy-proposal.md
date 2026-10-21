# Proposta de testes automatizados — 20/10/2026

Status: diagnóstico e proposta para revisão. Playwright e os testes descritos abaixo ainda não foram implementados. Nenhuma regra de negócio foi alterada.

## Diagnóstico verificado

- Frontend: `apps/web`, Next.js 15.5.24, React 19, TypeScript, App Router e pnpm 10; 30 arquivos `page.tsx`.
- Backend: `apps/api`, FastAPI 0.109.2, SQLModel/SQLAlchemy, Alembic e httpx. Autenticação por cookies e bearer token; seleção de estudante e autorização por conta.
- Persistência: PostgreSQL no ambiente publicado; os testes Python existentes demonstram uso de SQLite temporário.
- Testes atuais: 83 scripts `scripts/test_*.py` e 54 scripts `.mjs` em `apps/web/scripts`. Predominam scripts Python com asserções/unittest e scripts Node com `node:assert`; parte da cobertura do frontend verifica código-fonte, sem executar o navegador.
- `@playwright/test` e `playwright` não estão instalados no frontend; pytest e Playwright Python também não estão instalados no virtualenv verificado. A referência a Playwright no lockfile é um peer opcional do Next.js, não uma suíte configurada.
- `.github/workflows/ci.yml` já executa lint, tipos, build, scripts de frontend/backend e auditoria. Preservar esses jobs.
- `pnpm typecheck` passou. Também passaram os scripts existentes `test-private-routes.mjs`, `test-api-config-choice.mjs` e `test-question-queue.mjs`. Isso não comprova funcionamento das páginas no navegador.
- O script npm `test:manual-study-import` aponta para um arquivo ausente. Existe `test-study-log-import.mjs`; confirmar a intenção antes de ajustar esse comando.
- Há dois documentos anteriores não rastreados sobre DVA-C02 no workspace. Preservá-los.

## Abordagem recomendada e alternativas

Recomendada: Playwright com frontend e API reais locais, SQLite descartável para a execução cotidiana e mocks apenas nas fronteiras externas de IA, áudio e e-mail. Preserva autenticação, validações, permissões e persistência reais, com execução reproduzível e sem custos de provedores.

Alternativa: E2E inteiramente com PostgreSQL descartável em contêiner. Maior fidelidade ao banco publicado, com custo adicional de instalação e tempo. Manter uma execução de integração com PostgreSQL no CI para diferenças de SQL/migrações que SQLite não detecta; não usar o banco publicado.

Alternativa: simular toda a API no navegador. Útil para estados de interface difíceis de reproduzir, mas insuficiente como estratégia principal porque não valida autorização e persistência reais.

## Estrutura proposta

```text
apps/web/
  playwright.config.ts             # navegadores, servidores, evidências e relatórios
  e2e/
    fixtures/                     # contexto de teste, contas e dados próprios por caso
    support/                      # URLs permitidas, catálogo de rotas e asserções comuns
    pages/                        # helpers apenas para interações realmente repetidas
    recordings/                   # gravações a revisar; fora da suíte de regressão
    navigation/                   # visita das 30 páginas e links internos
    auth/                         # cadastro, login, logout, recuperação e onboarding
    permissions/                  # admin, aprovação, módulos e isolamento de contas
    account/                      # estudantes, preferências e segurança
    learning/                     # estudo, lições, perguntas, revisões e retomada
    objectives/                   # objetivos, progresso e planos
    study-log/                    # registro de estudos e histórico
    subjects/                     # matérias gerais e programação
    exams/                        # simulados, respostas e cronômetro
    books-chat/                   # leitura, conversa e falhas de integração
    resilience/                   # offline, indisponibilidade e configuração de conexão
  scripts/
    e2e-environment.mjs            # inicialização local e validação de destinos
    e2e-codegen.mjs                # mesmo isolamento da suíte + gravação interativa
scripts/e2e/
  serve_api.py                    # ambiente limpo, banco descartável e serviços externos locais
  seed.py                         # contas e conteúdo sintéticos; valida banco antes de escrever
.github/workflows/e2e.yml          # job separado sem segredos de produção
docs/testing.md                   # instalação, gravação, promoção, execução e relatórios
```

Os nomes são propostos, não arquivos já criados. Alterações previstas em `package.json`, `pnpm-lock.yaml` e `.gitignore` serão aditivas. Não substituir o TypeScript ou o pipeline atual.

## Isolamento obrigatório

1. Usar portas dedicadas em loopback, por exemplo web `127.0.0.1:3100` e API `127.0.0.1:8100`. Recusar destinos externos e portas ocupadas por processos de outra execução. Não reutilizar automaticamente um servidor aberto.
2. Criar diretório temporário próprio com banco, áudio e arquivos sintéticos. Verificar o caminho absoluto antes de seed ou limpeza. Nunca aproveitar o SQLite existente em `apps/api`.
3. Iniciar subprocessos com ambiente controlado. A API chama `load_dotenv()` e o Next.js lê `.env.local`: impedir herança de credenciais e configuração de produção, inclusive SMTP, IA, Supabase, armazenamento, OAuth, pagamento, KV e GitHub. A técnica será verificada antes de importar a API ou iniciar o Next.js.
4. Fixar `NEXT_PUBLIC_API_BASE_URL` e as origens CORS no ambiente local; neutralizar descoberta dinâmica em `/api/runtime-backend`. Contextos novos não podem carregar URLs ou tokens do navegador pessoal. Bloquear e registrar tentativas de conexão externa tanto no navegador quanto nos subprocessos de teste.
5. Manter `ALLOW_GUEST_ACCESS=false`, aprovação manual e gates de módulos reais. Criar contas sintéticas de administrador, aprovada, pendente, rejeitada e uma segunda conta para testar isolamento. Fazer login pela API real ou pela tela; não simular um administrador apenas alterando localStorage.
6. Usar dados exclusivos por teste; autenticação e seleção de estudante não podem vazar entre casos. Iniciar com um worker para estabilizar persistência; paralelizar apenas com isolamento comprovado por worker.
7. IA/TTS/e-mail devem usar doubles locais no processo exclusivo de testes, sem modificar regras da aplicação publicada. Separar os cenários com falhas simuladas dos testes com API real. Não chamar provedores pagos nem enviar mensagens reais.
8. Exclusão e outros cenários destrutivos só podem atuar em dados criados pela própria execução e após a verificação do destino de teste.

## Fluxos mais críticos

| Prioridade | Fluxo | Verificações essenciais |
| --- | --- | --- |
| P0 | Cadastro e sessão | Campos obrigatórios, CPF/e-mail/senha inválidos, duplicidade, cadastro pendente, login correto/incorreto, logout e sessão expirada |
| P0 | Aprovação e administração | Acesso direto não autorizado, aprovação/rejeição, revogação de sessão; autorização de IA independente da aprovação |
| P0 | Isolamento entre contas e estudantes | Conta A não lê nem altera dados da B, inclusive por ID na URL e `X-Child-ID`; troca de estudante preserva o escopo |
| P0 | Jornada principal de estudo | Abrir área de estudo, selecionar estudante/idioma, responder certo/errado, salvar progresso, recarregar e retomar |
| P1 | Revisões e questões | Fila vazia/preenchida, correção, agendamento, ausência de duplicidade e resumo coerente |
| P1 | Objetivos e diário | Criar/editar, validação, progresso e persistência; histórico de análises e retomada |
| P1 | Módulos e matérias | Programação começa desativada; ativação abre rotas reais; idioma obrigatório não pode ser desativado; paginação e importação inválida |
| P1 | Simulados | Início, respostas, tempo, finalização e resultados persistidos; estados sem questões |
| P1 | IA e créditos | Sem permissão, sem saldo, falha do provedor, resposta inválida e sucesso determinístico; falha não consome crédito |
| P1 | Recuperação e configurações | Token ausente/inválido/expirado, senha fraca, troca de senha e revogação de sessões; não revelar existência de e-mail |
| P2 | Livros, chat, áudio e resiliência | Estados vazios, respostas locais controladas, falhas de áudio/IA/rede, offline e backend indisponível |

Os cenários partem das regras já existentes no código e nos testes. Encontrar defeito deve produzir teste falhando e registro do problema; nunca flexibilizar a regra para deixar a suíte verde.

## Inventário para navegação no navegador

- Públicas e de recuperação: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/connect`, `/offline`.
- Conta e administração: `/account`, `/onboarding`, `/parents`, `/admin`, `/admin/accounts`, `/admin/users`, `/admin/learn`.
- Aprendizado: `/dashboard`, `/study`, `/lesson`, `/lesson/history`, `/quiz`, `/review`, `/quick-review`, `/session`, `/diverse`.
- Planejamento e conteúdo: `/objectives`, `/study-log`, `/activity-log`, `/exams`, `/books`, `/chat`.

Para cada rota: visitante, conta aprovada ou administrador conforme o acesso esperado; contas pendentes/rejeitadas nos gates; desktop e amostra mobile. Rotas que exigem estudante, token ou conteúdo terão fixtures específicas. Abrir uma página não basta: validar seu estado esperado, ação principal, erros de JavaScript e falhas inesperadas de rede. Redirecionamento ou bloqueio esperado também é resultado correto.

Gerar matriz com rota, perfil, cenário, resultado e evidência; não declarar todas as funcionalidades verificadas apenas porque as páginas renderizaram. Nenhuma página foi aberta nesta etapa: não havia servidor local nas portas verificadas, e o ambiente isolado ainda depende da revisão desta proposta.

## Gravação e testes adicionais com IA

- Propor os comandos `pnpm e2e:env`, `pnpm e2e:codegen`, `pnpm test:e2e`, `pnpm test:e2e:ui` e `pnpm test:e2e:report`; eles ainda não existem.
- O comando de gravação inicia ou se conecta somente ao ambiente dedicado validado. Para manter o bloqueio de rede e as fixtures também durante a gravação, usar contexto próprio com `page.pause()`/Inspector se o Codegen CLI puro não oferecer os mesmos controles.
- Gravações vão para `recordings/` e não são executadas automaticamente. Revisar dados, separar casos e acrescentar resultados esperados antes de promover para a pasta funcional.
- Usar `getByRole`, `getByLabel` e texto semântico; `data-testid` somente quando necessário para um contrato estável. Evitar seletores CSS de aparência, `nth()` sem semântica e esperas fixas.
- A IA pode transformar uma gravação em cenários de sucesso, erro, permissão e limites, usando a regra correspondente do código. Cada teste deve identificar a origem: gravação ou regra analisada. Não atribuir a uma gravação que o usuário ainda não fez.
- Evitar chamadas a LLM no CI. A contribuição da IA é código de teste revisável, com fixtures e asserções determinísticas.

## Evidências e execução automática

- Screenshots: `only-on-failure`; vídeos e traces: `retain-on-failure`, incluindo a primeira falha mesmo sem retry.
- HTML local, JUnit no CI e anexos por caso. Capturar exceções do navegador e falhas inesperadas de API; não falhar por respostas 4xx deliberadamente testadas.
- Chromium como regressão inicial; projetos de Firefox/WebKit e mobile como expansão ou execução manual/agendada conforme custo. Não confundir emulação mobile com teste em aparelho real.
- GitHub Actions: instalação reprodutível de pnpm/Python, dependências e navegador, inicialização isolada, E2E sem segredos de produção e upload de relatórios/evidências mesmo quando houver falha. Retenção limitada de artefatos sintéticos.
- Preservar lint, typecheck, build e testes atuais. Tratar teste que só passa no retry como instabilidade a corrigir; não usar retries para esconder erro funcional.
- Validar deliberadamente uma falha temporária para comprovar geração de screenshot, vídeo, trace e relatório, retirando esse caso antes da entrega.

## Critérios de entrega da implementação

1. Instalação e descoberta dos testes reproduzíveis; TypeScript e testes existentes continuam passando, ou falhas preexistentes ficam claramente registradas.
2. Guardas de URL, banco e conexões externas exercitadas antes dos cenários que escrevem dados.
3. Navegação executada pelas 30 páginas, com matriz de resultados e limitações explícitas.
4. Fluxos P0 e cenários representativos P1 executados com sucesso/erro/permissão/validação; falhas reais relatadas sem alterar regras.
5. Gravação interativa pronta para o usuário e procedimento demonstrado com dados sintéticos.
6. Evidências de falha verificadas e workflow pronto para execução pelo GitHub Actions. Execução local não equivale a workflow já executado no GitHub.
7. Documentação em português com instalação, gravação, promoção de gravações, expansão com IA, execução, depuração, relatórios e limpeza segura.

Referências técnicas: [Codegen](https://playwright.dev/docs/codegen), [boas práticas](https://playwright.dev/docs/best-practices), [configuração de evidências](https://playwright.dev/docs/test-use-options), [CI](https://playwright.dev/docs/ci).
