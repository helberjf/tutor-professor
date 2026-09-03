# TODO — De app pessoal a SaaS

Roteiro para transformar o **Tutor and Professor** (hoje um app single-tenant,
com backend local e liberação manual de contas) em um produto que qualquer
pessoa possa assinar, pagar e usar sem você no meio do caminho.

Escrito a partir do estado real do código em `apps/api/main.py`,
`apps/api/models/database.py`, `apps/web/src` e `docker-compose.prod.yml`.

---

## 0. Diagnóstico — o que já está pronto

Boa parte da fundação existe. Não é um começo do zero.

| Área | Estado | Onde |
|---|---|---|
| Contas com senha forte + PBKDF2 + trava de brute force | Pronto | `services/password_policy.py`, `main.py` |
| Sessões persistentes com token hasheado e expiração | Pronto | `UserSession` em `models/database.py` |
| Login Google (OAuth) | Pronto | `GOOGLE_CLIENT_ID` etc. em `main.py` |
| Fila de aprovação de conta pelo admin | Pronto | `User.status`, rotas `/api/admin/accounts` |
| Medidor de créditos de IA por conta | Pronto | `User.ai_credits`, `user_has_ai_credit()` |
| Chave de IA por conta, criptografada (Fernet) | Pronto | `UserAISettings`, `encrypt_api_key()` |
| Migrations versionadas | Pronto | `apps/api/alembic/versions` (20+) |
| CI com lint, types, build e testes | Pronto | `.github/workflows/ci.yml` |
| Stack de produção com TLS automático | Pronto | `docker-compose.prod.yml` + Caddy |
| Produto em si (lições, revisão espaçada, simulados, flashcards, TTS) | Rico | `apps/web/src/app/*` |

**O que falta é o que separa "app com login" de "SaaS":** isolamento de dados
garantido, autoatendimento, e-mail, cobrança e operação.

---

## 1. Bloqueadores — não dá para cobrar de ninguém antes disto

- [ ] **Fechar o inquilino anônimo.** `get_default_child()` (`apps/api/main.py:686`)
      devolve a criança com `user_id IS NULL` para qualquer requisição **sem
      sessão**. Hoje isso é a "criança legado" de uso pessoal; num SaaS é um
      balde compartilhado que qualquer visitante lê e escreve.
      Exigir sessão de responsável em toda rota de dados e nunca criar perfil
      órfão; migration para adotar (ou apagar) as linhas com `user_id IS NULL`.
- [ ] **Provar o isolamento, não confiar nele.** São ~109 rotas e o escopo por
      criança é feito à mão (`child_id ==` aparece 46 vezes no `main.py`). Uma
      rota esquecida vaza dados de outra família.
      Criar uma dependency única `require_child(request)` obrigatória em toda
      rota de dados; um teste que percorre `app.routes` e falha se alguma rota
      não a usar; e um teste de invasão em que o usuário A tenta cada rota com o
      `X-Child-ID` do usuário B e espera 404 em todas.
- [ ] **Recuperação de senha.** Não existe nenhum fluxo de "esqueci minha senha"
      nem envio de e-mail no projeto. Sem isso, todo usuário travado vira
      suporte manual seu.
- [ ] **Sem chave global gratuita por padrão.** Hoje uma conta aprovada consome a
      *sua* chave de IA via créditos. Num SaaS o custo de IA precisa estar
      amarrado ao plano pago (Fase 3), ou a conta gratuita usa obrigatoriamente
      a chave própria.
- [ ] **Backend fora do seu PC.** O README ainda descreve o modelo
      Vercel + Cloudflare Tunnel apontando para uma máquina local.
      `docs/DEPLOY-VPS.md` já resolve isso — falta executar e tornar a VPS o
      caminho oficial.

---

## 2. Fase 1 — Fundação multi-tenant (2–3 semanas)

- [ ] Introduzir `Account` (ou `Organization`) como raiz do inquilino, com `User`
      pertencendo a uma conta. Hoje `User` acumula os dois papéis; separar abre
      espaço para "família com dois responsáveis" e para planos por conta.
- [ ] Adicionar `account_id` nas tabelas de conteúdo gerado e indexar.
      Alternativa mais barata: manter `child_id` como âncora e garantir o join
      até `User` numa camada única de repositório.
- [ ] Camada de acesso a dados que **sempre** recebe o tenant. Nenhum
      `session.exec(select(X))` solto dentro de uma rota.
- [ ] Substituir `user_is_admin()` (comparação com `ADMIN_EMAIL`,
      `apps/api/main.py:1438`) por papel persistido (`User.role`), auditável e
      transferível.
- [ ] Quebrar `main.py` (7.451 linhas) em routers por domínio: `auth`, `admin`,
      `lessons`, `review`, `coding`, `exam`, `billing`. Sem isso, revisar
      segurança a cada mudança fica inviável.
- [ ] Trilha de auditoria: quem aprovou, revogou, apagou, exportou.

## 3. Fase 2 — Autoatendimento (2 semanas)

- [ ] Provedor de e-mail transacional + templates: verificação de e-mail, reset
      de senha, boas-vindas, aviso de cobrança, fim de trial.
- [ ] Verificação de e-mail no cadastro (substitui a aprovação manual como
      barreira anti-spam).
- [ ] Tornar a fila de aprovação **opcional por configuração**
      (`SIGNUP_MODE=open|manual`). O código de aprovação já existe e continua
      útil para modo escola / beta fechado.
- [ ] Onboarding guiado: criar a primeira criança, escolher idioma e nível,
      chegar à primeira lição em menos de 3 minutos.
- [ ] Autoatendimento de conta: trocar e-mail, trocar senha, encerrar sessões
      ativas, apagar a conta.
- [ ] Estado de erro quando a IA está indisponível — hoje o usuário vê mensagem
      de crédito, mas não de falha do provedor.

## 4. Fase 3 — Monetização (2–3 semanas)

- [ ] Escolher o gateway. Brasil + cartão internacional: **Stripe** (assinatura e
      portal do cliente prontos) ou **Mercado Pago / Pagar.me** se Pix for
      essencial. Pix pesa a favor do mercado brasileiro.
- [ ] Modelos: `Plan`, `Subscription`, `Invoice`, `UsageRecord`.
- [ ] Definir os planos. Sugestão inicial, ancorada no custo real (IA + TTS + VPS):
      - **Free** — 1 criança, conteúdo estático, sem IA (ou IA só com chave própria).
      - **Família (R$ 29–39/mês)** — até 3 crianças, N gerações de IA/mês, TTS, simulados.
      - **Estudo (R$ 59–79/mês)** — crianças ilimitadas, curriculum de programação, exames, export.
      - **Escola/turma** — por assento, cobrança anual, painel do professor.
- [ ] Ligar os créditos de IA que já existem ao plano: recarga automática no
      início do ciclo, em vez de recarga manual pelo admin.
- [ ] Webhooks do gateway mudando o status da assinatura, idempotentes e com
      replay. O webhook é a fonte da verdade, não o retorno do checkout.
- [ ] Enforcement de limites em um lugar só (nº de crianças, gerações/mês,
      minutos de TTS), com mensagem clara de upgrade.
- [ ] Trial de 14 dias sem cartão. Downgrade gracioso: dados preservados em
      leitura, geração bloqueada.
- [ ] Portal de cobrança: trocar cartão, ver faturas, cancelar sem falar com você.
- [ ] Nota fiscal / emissor. Decidir cedo (PJ, regime tributário, NFS-e) — dá
      mais trabalho que o código.

## 5. Fase 4 — Operação e conformidade (2 semanas)

- [ ] **Custo por conta.** Registrar tokens e chamadas por usuário; sem isso um
      usuário pesado consome a margem inteira sem aparecer em lugar nenhum.
- [ ] Rate limiting real nas rotas de IA e de auth (hoje só existe a trava de
      login). Por conta *e* por IP.
- [ ] Observabilidade: Sentry para erros, logs estruturados com `account_id`,
      métricas de latência e de falha do provedor de IA. Nada disso existe hoje.
- [ ] Backups testados. O cron de `pg_dump` está documentado em
      `docs/DEPLOY-VPS.md:188` — falta **restaurar** um backup num ambiente
      limpo e cronometrar. Backup não testado não é backup.
- [ ] Ambiente de staging com dados sintéticos.
- [ ] Rotação do `SESSION_SECRET`. Hoje ele hasheia sessões **e** deriva a chave
      Fernet das chaves de IA (`apps/api/main.py:3491`): girar o segredo hoje
      torna toda chave de IA salva indecifrável. Separar as duas chaves e
      versionar o envelope de criptografia.
- [ ] Servir o cache de áudio com autorização. `/api/audio/file` é um
      `StaticFiles` público (`apps/api/main.py:373`): qualquer pessoa com a URL
      baixa o áudio.
- [ ] **LGPD + dados de crianças.** O ponto mais sério deste produto:
      - Base legal e consentimento do responsável, registrado com data.
      - Política de privacidade e termos de uso publicados.
      - Export e exclusão de dados a pedido (direito do titular).
      - Retenção definida: quanto tempo o histórico fica após o cancelamento.
      - Cuidado com o que vai ao provedor de IA: nome da criança e texto livre
        não deveriam sair do servidor sem necessidade.
      - Vender fora do Brasil muda as regras: COPPA (EUA) e GDPR-K (UE).
- [ ] Contrato de processamento de dados com o provedor de IA e desativação de
      treinamento sobre os dados enviados.

## 6. Fase 5 — Produto e entrada no mercado (contínuo)

- [ ] Landing page com proposta clara, preço visível e prova — o app é bonito,
      use screenshots reais.
- [ ] Analytics de produto: ativação (primeira lição concluída), retenção D7/D30,
      conversão trial→pago.
- [ ] Relatório semanal por e-mail para o responsável — é o que faz o pagante
      perceber valor e renovar.
- [ ] Suporte: caixa de entrada, FAQ, changelog público.
- [ ] Modo escola/professor: turmas, atribuição de lições, relatório por aluno.
      É onde está o ticket alto, e o modelo atual (`ChildProfile` sob `User`) já
      está a meio caminho.
- [ ] Internacionalização da interface: o produto ensina vários idiomas, mas a UI
      é PT-BR.

---

## 7. Decisões abertas (responder antes de codar a Fase 3)

1. **Quem paga?** Responsável individual ou escola? Muda preço, contrato, nota
   fiscal e modelo de dados. Recomendo começar em B2C mantendo `Account`
   genérico o bastante para virar B2B depois.
2. **Quem paga a IA?** Chave sua embutida no plano (margem apertada, produto
   melhor) ou chave do cliente (margem alta, atrito enorme). O código suporta os
   dois hoje — a decisão é comercial, não técnica.
3. **Pix é obrigatório?** Se sim, Stripe sozinho não resolve bem.
4. **Nicho.** "Tutor de inglês para crianças" e "trainer de LeetCode/AWS" são
   dois produtos com públicos diferentes dentro do mesmo repositório. Vender os
   dois juntos confunde a landing page. Escolher um para lançar.

## 8. Definição de pronto para o v1 pago

- [ ] Um estranho cria conta, verifica e-mail, usa 14 dias, paga com cartão e
      usa o produto — sem nenhuma ação manual sua.
- [ ] Teste automatizado prova que a conta A não enxerga nada da conta B.
- [ ] Restauração de backup executada e cronometrada pelo menos uma vez.
- [ ] Política de privacidade e termos publicados e aceitos no cadastro.
- [ ] Você consegue responder, por conta: quanto ela custou em IA neste mês.

---

## Ordem sugerida

```
Fase 1 (isolamento)
  → Fase 2 (autoatendimento)
  → Fase 4 parcial (observabilidade, backup, LGPD)
  → Fase 3 (cobrança)
  → Fase 5 (mercado)
```

Cobrança é a última coisa técnica: cobrar de um sistema que vaza dados ou perde
o banco é pior do que não cobrar.
