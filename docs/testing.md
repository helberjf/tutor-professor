# Testes E2E com Playwright

O projeto mantém seus testes Python/Node, lint, tipos e build. A camada nova usa
Playwright com TypeScript e frontend/API reais locais. Os testes com respostas
simuladas estão identificados no nome. Nenhuma chave de IA, conta real, banco
publicado ou segredo de GitHub é necessário.

Para repetir os doze scripts de API selecionados na verificação desta
implementação, execute `python scripts/e2e/run_legacy.py` na raiz com o Python
apropriado (ou `.venv/Scripts/python.exe scripts/e2e/run_legacy.py` no Windows).
O wrapper remove a herança de segredos, desativa dotenv/rede e mantém todos os
bancos e temporários dos scripts dentro de uma pasta descartável própria.

## Instalar

Requisitos: Node **22.18 ou superior**, pnpm 10 e Python 3.11 no CI. O virtualenv
local existente também pode ser usado. Na raiz, instale as dependências E2E no
Python escolhido; no Windows, com o virtualenv já existente:

```powershell
.venv/Scripts/python.exe -m pip install -r scripts/e2e/requirements.txt
cd apps/web
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e:safety
```

No Linux/macOS use `.venv/bin/python`, ou `python` se não houver virtualenv.
`E2E_PYTHON` permite informar o caminho do executável. Instale as dependências
nesse mesmo Python. Em Linux, `pnpm exec playwright install --with-deps chromium`
também instala as bibliotecas do sistema.

Se a rede corporativa exigir certificados adicionais, configure o certificado
confiável do sistema (`NODE_USE_SYSTEM_CA=1` em Node compatível ou
`NODE_EXTRA_CA_CERTS`). Não desative a validação TLS.

## Executar

Todos os comandos seguintes são executados em `apps/web`:

```powershell
pnpm test:e2e
pnpm test:e2e -- e2e/permissions
pnpm test:e2e -- --grep "retoma"
pnpm test:e2e -- --headed
pnpm test:e2e:ui
pnpm test:e2e:mobile
pnpm test:e2e:report
pnpm test:e2e:build
```

O runner inicia e encerra o próprio ambiente. **Não execute `e2e:env` antes de
`test:e2e`**: as portas ocupadas são deliberadamente recusadas. O modo UI pode
precisar do botão de execução para iniciar o webServer, conforme o Playwright.

`test:e2e:build` executa o build de produção numa cópia temporária sem `.env` e
sem credenciais herdadas. O bloqueio de conexões externas continua ativo. Isso
valida o build sem carregar a configuração de produção da máquina.

Chromium é o navegador padrão. Firefox e WebKit estão configurados para execução
adicional, após `pnpm exec playwright install firefox webkit`, usando
`pnpm test:e2e:browsers`. Não há afirmação de validação desses navegadores sem
uma execução registrada. `test:e2e:mobile` usa emulação Pixel 7 no Chromium,
não um telefone físico.

## Como o isolamento funciona

- Web: `http://127.0.0.1:3100`; API: `http://127.0.0.1:8100`. Não há opção de trocar
  a base URL por staging/produção. Nenhum servidor existente é reutilizado.
- Cada execução cria uma pasta `tutor-e2e-*` no diretório temporário do sistema,
  com um marcador próprio. O banco permitido é somente `e2e.sqlite` dessa pasta.
  O bootstrap executa as migrações reais antes do seed.
- Os processos recebem uma lista mínima de variáveis de sistema. Credenciais e
  configuração do shell não são herdadas. O frontend é copiado sem `.env*`,
  `.next` ou configuração Vercel. Apenas suas dependências são ligadas por junction
  no Windows/symlink no Linux; a limpeza remove esse link antes da pasta temporária.
- A API tem o carregamento de dotenv desativado pelo wrapper de testes, antes de
  importar a aplicação. Dados e cache de áudio pertencem à execução.
- Há bloqueio de rede no navegador e nos servidores. O endpoint dinâmico de
  descoberta de backend recebe uma resposta local vazia na fixture do navegador.
  Não se usam Supabase, SMTP, OAuth, gateway ou provedores de IA reais.
- Acesso de visitante continua desativado; aprovação e gates de módulos não são
  flexibilizados. Limites de autenticação permanecem com seus valores reais.
- A fábrica `/__e2e__/fixtures` existe **somente no wrapper**, vinculada a loopback
  e ao marcador daquela execução. Ela prepara pré-condições sintéticas: conta,
  estudante e sessão real persistida. Os fluxos usam as rotas reais da aplicação.
  O teste de login autentica pela tela; os demais podem usar sessões da fixture.
- Cada teste usa uma conta própria. Administrador compartilhado só executa ações
  administrativas explícitas; a suíte usa um worker para evitar interferência.
- As contas fixas abaixo são apenas locais, descartáveis, sem endereço entregável.

## Gravar suas interações reais

```powershell
pnpm e2e:codegen
```

O comando abre um Chromium visível e o Playwright Inspector no ambiente isolado.
No Inspector, ative **Record**. Navegue, preencha formulários e use as ferramentas
de asserção de texto, valor e visibilidade. Escolha a saída **Playwright Test /
TypeScript** e copie o código para `e2e/recordings/meu-fluxo.spec.ts` antes de clicar
**Resume**, que encerra o ambiente.

Contas disponíveis:

| Perfil | E-mail sintético | Senha sintética |
| --- | --- | --- |
| Estudante aprovado | `student@e2e.invalid` | `E2e!Synthetic123` |
| Administrador | `admin@e2e.invalid` | `E2e!Synthetic123` |

Você também pode cadastrar novas contas pela interface e aprová-las como admin.
Somente dados dessa execução serão gravados. Fechar o Inspector/usar Ctrl+C
encerra os processos próprios. Se houver encerramento forçado do sistema, a
pasta temporária pode permanecer: confirme o marcador antes de removê-la; nunca
execute limpeza ampla por nome no workspace ou no diretório de dependências.

O comando usa a API oficial `page.pause()` para acessar o gravador e manter os
mesmos guardas de rede dos testes. O CLI puro `playwright codegen <url>` não
instala essas proteções e não é o procedimento deste projeto. A gravação no
Inspector precisa ser copiada pelo usuário; não há salvamento automático em arquivo.

`pnpm e2e:codegen --check` executa uma verificação headless de inicialização,
navegação e encerramento. Isso verifica a infraestrutura, não substitui uma
gravação feita por você.

## Transformar gravações em regressões confiáveis

Arquivos em `recordings/` ficam fora do Git e da execução automática. Uma gravação
contém ações; não comprova sozinha que o sistema funcionou.

1. Remova ações acidentais e dados literais de conta. Importe `test`, `expect` e
   `signIn` de `e2e/fixtures/test.ts`, adaptando o caminho à pasta funcional.
2. Use `account`/`createAccount` e `api` para pré-condições. Para testar login,
   preencha a tela com `account.email` e `account.password`.
3. Prefira `getByRole`, `getByLabel` e nomes acessíveis. Não use classes Tailwind,
   seletores de aparência, posições arbitrárias ou `waitForTimeout`.
4. Espere o resultado observável com `await expect(...)`; para uma gravação,
   confirme persistência depois de recarregar e, quando útil, pela API real.
5. Separe sucesso, erro, validação e permissão. Marque claramente os testes de UI
   com mocks. Eles não comprovam integração com um provedor externo.
6. Mova o teste revisado para a funcionalidade e execute-o antes da suíte completa.

Exemplo mínimo de um teste promovido:

```typescript
import { test, expect, signIn } from '../fixtures/test';

test('abre objetivos da própria conta', async ({ page, account }) => {
  await signIn(page, account);
  await page.goto('/objectives');
  await expect(page.getByRole('heading', { name: 'Objetivos', exact: true })).toBeVisible();
});
```

Não faça um teste depender de outro. Não reutilize IDs de uma execução anterior.
Para exclusão, crie primeiro um recurso com a fixture `api` e exclua somente seu ID.

## Ampliar a cobertura com IA

As suítes iniciais foram geradas com auxílio de IA a partir das regras atuais do
código e dos testes existentes. **Ainda não havia uma gravação sua para derivá-las.**
Uma gravação futura pode ser revisada com este pedido:

> Analise a gravação e as regras das rotas/componentes correspondentes. Gere
> cenários independentes de sucesso, erro, validação, permissão e persistência
> usando e2e/fixtures/test.ts. Identifique a regra de origem. Preserve todas as
> regras de negócio, não use credenciais reais, destinos externos ou waits fixos.
> Diferencie UI simulada de integração real. Execute e relate falhas reais sem
> reduzir as asserções para esconder defeitos.

Não há chamada a LLM na execução dos testes ou no CI. Os resultados de IA para UI
são dados determinísticos, revisáveis. A integração real de geração, cobrança e
normalização continua pertencendo aos testes de serviço/API e a uma futura
homologação separada com provedores explicitamente autorizados.

## Relatórios e diagnóstico

- `playwright-report/index.html`: relatório HTML (`pnpm test:e2e:report`).
- `test-results/junit.xml` e `test-results/results.json`: resultados estruturados.
- Na falha: screenshot, vídeo e `trace.zip`, inclusive na primeira tentativa.
- Cada teste inclui `browser-diagnostics` com exceções JS, HTTP 5xx inesperados,
  tentativas externas e falhas de transporte. Os testes de resiliência permitem
  somente as falhas que simulam explicitamente. Aborts normais de navegação são
  desconsiderados.
- Visitas às páginas anexam `page-visit`, com rota, perfil e URL final.
- Use o botão **Trace** no relatório ou `pnpm exec playwright show-trace <arquivo>`.
  O trace permite inspecionar ações, DOM e requisições localmente.
- `pnpm test:e2e:evidence` executa um teste deliberadamente errado, fora da
  regressão normal. O wrapper só passa quando confirma uma falha e arquivos
  não vazios de screenshot, vídeo, trace e JSON em `evidence-results/`.

Os artefatos podem conter tokens e dados sintéticos. Estão ignorados pelo Git;
no GitHub a retenção configurada é de sete dias. Não grave uma sessão real para
compartilhar um trace. Não se usa retry automático para transformar falhas em verde.

## GitHub Actions

`.github/workflows/e2e.yml` executa Chromium em PRs e pushes de `main`, com smoke
mobile adicional, instalação de dependências e upload de evidências mesmo em
falha. Não exige segredos de produção. O pipeline anterior permanece separado.
Na execução manual, escolha Chromium, Firefox ou WebKit.

Os jobs de cada navegador têm seus próprios serviços e banco. Como os relatórios
mobile usam pastas próprias, não sobrescrevem o resultado desktop. Configurar o
workflow localmente não significa que ele já executou no GitHub: isso depende
do push/PR e de Actions habilitado no repositório.

## Cobertura e limites

`e2e/support/routes.ts` lista as 30 páginas com o perfil e o estado esperado. Um
teste compara esse catálogo aos arquivos `page.tsx`; uma página nova sem entrada
faz a cobertura de navegação falhar. `/parents` e `/diverse` são redirecionamentos
legados; `/connect` requer admin, embora não use o gate global de rotas privadas.
Links de recuperação sem token mostram seu estado de erro esperado.

Além da navegação, há fluxos de login e sessão, aprovação e rejeição, isolamento
entre contas, módulos, perfil, estudo/retomada, objetivos/progresso, diário,
matérias/tópicos manuais, chat controlado, livro sem autorização e simulados.
Uma página renderizar não comprova todas as operações possíveis nela.

SQLite permite execução rápida e local. A suíte não certifica peculiaridades de
PostgreSQL, políticas RLS, entregabilidade de e-mail, OAuth, pagamentos, instalação
PWA em aparelho real nem qualidade de IA/TTS externos. Uma camada adicional com
PostgreSQL descartável pode ampliar essa fidelidade; não apontar esta suíte para
Supabase ou outro banco publicado.

Consulte também `docs/testing-results.md` para a execução efetivamente verificada,
limitações e problemas observados, sem confundir configuração com validação.
