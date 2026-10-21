# Gravações para revisão

Execute `pnpm e2e:codegen` em `apps/web`. No Playwright Inspector, ative **Record**,
navegue no ambiente descartável e acrescente asserções de visibilidade, valor e texto.
Copie o código TypeScript para um arquivo nesta pasta antes de clicar **Resume**.

Esses arquivos são ignorados pelo Git e pelo runner. Podem conter senhas e tokens
sintéticos. Revise, substitua os dados por fixtures de `../fixtures/test.ts`, acrescente
resultados esperados e só então mova o teste para a pasta da funcionalidade.

Instruções completas e roteiro de revisão com IA: `docs/testing.md`, na raiz do projeto.
