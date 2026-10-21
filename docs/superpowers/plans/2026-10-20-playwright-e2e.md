# Playwright E2E — plano de implementação

Proposta aprovada pelo usuário em 20/10/2026: `docs/testing-strategy-proposal.md`.

Objetivo: executar e gravar interações reais em um ambiente descartável, preservando regras de negócio e o pipeline existente.

- [x] Proteções: escrever e executar testes negativos para ambiente limpo, destinos locais, diretórios descartáveis e conexões externas; implementar os guardas em `apps/web/scripts/e2e/` e `scripts/e2e/`.
- [x] Ambiente: inicializar API real com banco SQLite migrado e contas sintéticas; copiar frontend sem arquivos `.env` para diretório temporário; criar fixtures exclusivas por teste e seed determinístico.
- [x] Playwright: adicionar `@playwright/test` com pnpm, configuração TypeScript, Chromium/mobile, evidências de falha, relatórios HTML/JUnit/JSON e Codegen no mesmo contexto protegido.
- [x] Cobertura: catálogo das 30 páginas; visitantes, estudante e admin; testes funcionais de autenticação, permissões, conta, estudo, objetivos, diário, módulos, simulados e resiliência baseados no código atual.
- [x] Verificação: executar typecheck, lint e scripts existentes; executar suíte E2E; investigar falhas sem alterar regras de negócio; comprovar screenshot/vídeo/trace com falha deliberada controlada.
- [x] CI e documentação: workflow separado no GitHub Actions; instruções em português para instalação, gravação, revisão com IA e relatórios; matriz de páginas e limitações reais.
- [x] Revisão independente de segurança e confiabilidade; corrigir problemas e repetir apenas verificações afetadas.

Comandos previstos: `pnpm test:e2e:safety`, `pnpm test:e2e`, `pnpm test:e2e:mobile`, `pnpm e2e:codegen`, `pnpm test:e2e:report`, `pnpm typecheck` e `pnpm lint` em `apps/web`.

Arquivos de produção não serão alterados para contornar resultados de testes. Os scripts de teste existentes e as alterações de outras tarefas serão preservados.
