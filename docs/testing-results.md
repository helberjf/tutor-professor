# Resultados da implantação de testes — 21/10/2026

## Verificações executadas localmente

| Verificação | Resultado |
| --- | --- |
| Regressão Playwright / Chromium — após correção | 66 passaram; zero falhas, retries ou testes pulados |
| Navegação de páginas | 30/30 estados esperados verificados no navegador |
| Emulação mobile / Chromium Pixel 7 | 4 testes passaram |
| Scripts Node existentes do frontend | 55 passaram |
| Scripts Python selecionados | 12 passaram, com dotenv/rede desativados e bancos temporários |
| Regressão determinística de revogação | 3 casos passaram após reproduzirem as falhas antes da correção |
| Proteções do harness | 4 testes Node e 2 testes Python passaram |
| Codegen headless `--check` | Inicialização, navegação e encerramento passaram |
| Prova de evidências | Falha deliberada gerou screenshot, vídeo, trace e JSON; wrapper confirmou os arquivos |
| TypeScript | `pnpm typecheck` passou |
| Lint atual do projeto | `pnpm lint` passou |
| Build de produção isolado | `pnpm test:e2e:build` passou, sem arquivos `.env` ou acesso externo |
| Lockfile | `pnpm install --frozen-lockfile --offline` passou |

As execuções utilizaram dados sintéticos, frontend local e API real com SQLite
novo, migrado até a revisão 0042. Não foram usadas credenciais reais, banco
publicado ou chamadas a provedores externos. As regras de aprovação, autorização
e revogação foram preservadas; a correção de API trata a atualização concorrente
de atividade de uma sessão excluída.

## Matriz das páginas

Todos os itens abaixo passaram na regressão Chromium. Os testes verificam o
estado específico da rota, não apenas o status HTTP do documento. Perfis comuns
usam contas exclusivas; administração usa apenas a conta sintética de admin.

| Página | Perfil / estado verificado |
| --- | --- |
| `/` | Visitante: início e chamada de aprendizagem |
| `/login` | Visitante: formulário de entrada |
| `/register` | Visitante: formulário de cadastro |
| `/forgot-password` | Visitante: recuperação de senha |
| `/reset-password` | Visitante: link incompleto sem token |
| `/verify-email` | Visitante: link inválido/incompleto sem token |
| `/offline` | Visitante: informação de indisponibilidade |
| `/connect` | Admin: configuração de conexão |
| `/account` | Conta aprovada: configurações |
| `/parents` | Conta aprovada: redirecionamento para `/account` |
| `/onboarding` | Conta aprovada com onboarding pendente: primeira etapa |
| `/admin` | Admin: dashboard administrativo |
| `/admin/accounts` | Admin: fila de aprovação |
| `/admin/users` | Admin: usuários e autorização de IA |
| `/admin/learn` | Admin: editor de aprendizado |
| `/dashboard` | Conta aprovada: resumo de estudos |
| `/study` | Conta aprovada: área de idiomas |
| `/lesson` | Conta aprovada: cartão de lição sintética |
| `/lesson/history` | Conta aprovada: histórico de lições |
| `/quiz` | Conta aprovada: questão e alternativas |
| `/review` | Conta nova aprovada: estado sem revisão pendente |
| `/quick-review` | Conta nova aprovada: estado sem palavras pendentes |
| `/session` | Conta aprovada: fila de estudo e ação de revelar significado |
| `/diverse` | Conta aprovada: redirecionamento para estudos gerais |
| `/objectives` | Conta aprovada: objetivos |
| `/study-log` | Conta aprovada: controle de estudos |
| `/activity-log` | Conta aprovada: seletor de data das atividades |
| `/exams` | Conta aprovada: simulados |
| `/books` | Conta aprovada: biblioteca |
| `/chat` | Conta aprovada: conversa com tutor |

Há verificações adicionais de visitante em áreas privadas, acesso administrativo
negado, contas pendentes/rejeitadas, aprovação/revogação, isolamento entre contas,
persistência, progresso ponderado, módulos, matérias/tópicos manuais, diário e
simulado com acerto/erro. O sucesso de chat usa resposta simulada, identificada no
teste; a recusa de geração de livro sem configuração utiliza a API real.

## Defeito corrigido: revogação concorrente de sessões

Antes da correção, as rodadas capturaram
`sqlalchemy.orm.exc.StaleDataError` na tabela `usersession`: uma requisição ainda
tentava atualizar a sessão enquanto outra a revogava. O cenário envolvia tela
aberta com consultas em segundo plano e revogação de acesso. A condição pode
produzir erro de servidor na requisição concorrente.

Houve uma rodada intermediária com 66/66 testes passando. Na repetição anterior à correção,
os testes abaixo capturaram falhas de requisição no navegador e falharam; os logs
da API registraram `StaleDataError`/erro de servidor no mesmo cenário:

- `e2e/auth/login.spec.ts`: sessão revogada impede acesso após recarregar.
- `e2e/permissions/access.spec.ts`: aprovação libera a conta, rejeição revoga sua sessão.

`get_request_user_session` agora atualiza `last_seen_at` com um UPDATE condicional,
na mesma transação. Se a sessão já foi revogada/expirou, a autorização é recusada.
O objeto não fica com uma atualização ORM pendente que falharia no flush.

O teste `scripts/test_session_revocation_race.py` reproduz a remoção entre consulta
e atualização, a remoção antes de um flush e a persistência normal de atividade.
Dois casos falharam antes da alteração; os três passaram depois. Os dois E2E
originais também passaram na suíte completa de 66 testes, sem enfraquecer suas
asserções nem permitir erros de rede/servidor. A revisão independente não apontou
defeitos concretos na correção. A concorrência específica em PostgreSQL não foi
validada nesta máquina.

## Limites da verificação

- Não havia gravações reais do usuário. Os testes iniciais vieram da análise das
  regras do código; o ambiente de gravação está pronto para novos fluxos reais.
- O Inspector interativo está configurado por `page.pause()`; a verificação
  automática exercitou o mesmo ambiente/navegador em modo headless. O usuário
  ainda precisa gravar e copiar suas interações.
- Firefox/WebKit estão configurados, mas não foram executados nesta máquina.
- GitHub Actions foi preparado e revisado. Os resultados desta tabela são locais;
  o resultado remoto deve ser consultado na aba Actions do repositório após o push.
- PostgreSQL/RLS, OAuth, SMTP, gateway, IA/TTS reais e PWA em aparelho físico não
  foram exercitados. Nenhum resultado local equivale à validação de produção.
- O comando preexistente `test:manual-study-import` foi corrigido para executar
  o script existente `test-study-log-import.mjs`.

Os relatórios HTML locais estão em `apps/web/playwright-report/` e
`apps/web/mobile-playwright-report/`. A regressão principal também gera
`apps/web/test-results/results.json` e `junit.xml`; a prova de falha fica em
`apps/web/evidence-results/`. Esses arquivos são ignorados pelo Git e podem ser
regenerados com os comandos de `docs/testing.md`.
