# TODO — De app pessoal a SaaS

Roteiro para transformar o **Tutor and Professor** em um produto que qualquer
pessoa possa assinar, pagar e usar sem você no meio do caminho.

Boa parte já foi feita. O que está marcado com `[x]` está no código e coberto
por teste; o que continua `[ ]` é o que falta, com o motivo.

---

## 1. Bloqueadores — o que impedia cobrar de qualquer pessoa

- [x] **Fechar o inquilino anônimo.** Uma requisição sem sessão recebia o perfil
      compartilhado (`user_id IS NULL`). Agora responde 401 e nenhum perfil sem
      dono é criado. `ALLOW_GUEST_ACCESS=true` traz o comportamento antigo de
      volta para uma instalação de uma família só.
- [x] **Provar o isolamento em vez de confiar nele.**
      `scripts/test_tenant_isolation.py` faz três coisas: audita todas as rotas
      de dados exigindo que resolvam o inquilino por um helper conhecido, audita
      as rotas `/api/admin` exigindo a checagem de administrador, e tenta a
      invasão de verdade — a conta A pedindo a criança da conta B espera 404.
- [x] **Recuperação de senha.** `services/email_service.py` (SMTP, com backend
      `console` para dev e CI), tokens de uso único guardados como hash, e as
      telas `/forgot-password`, `/reset-password` e `/verify-email`.
- [x] **Custo de IA amarrado ao plano.** O plano gratuito inclui zero gerações na
      chave da plataforma; a franquia dos planos pagos vira crédito, recarregado
      uma vez por período no mesmo saldo que o administrador já controlava.
- [ ] **Backend fora do seu PC.** O README ainda descreve Vercel + Cloudflare
      Tunnel apontando para uma máquina local. `docs/DEPLOY-VPS.md` resolve —
      falta executar e tornar a VPS o caminho oficial. É a única coisa desta
      lista que ninguém pode fazer por você.

---

## 2. Fundação multi-tenant

- [x] Toda rota de dados resolve o inquilino por um helper único, verificado por
      auditoria estática a cada execução do teste.
- [x] Chaves de IA guardadas com chave própria (`AI_ENCRYPTION_KEY`), envelope
      versionado e janela de rotação — girar `SESSION_SECRET` não torna mais as
      chaves ilegíveis.
- [ ] Introduzir `Account` como raiz do inquilino, com `User` pertencendo a ela.
      Hoje `User` acumula os dois papéis. Necessário para "família com dois
      responsáveis" e para o plano por assento.
- [ ] Substituir `user_is_admin()` (comparação com `ADMIN_EMAIL`) por papel
      persistido (`User.role`), auditável e transferível.
- [ ] Quebrar `main.py` em routers por domínio. Passou de 7.451 para ~8.000
      linhas neste trabalho; a auditoria de rotas segura a parte de segurança,
      mas o arquivo continua difícil de revisar.
- [ ] Trilha de auditoria: quem aprovou, revogou, apagou, exportou.

## 3. Autoatendimento

- [x] E-mail transacional com verificação de endereço e redefinição de senha.
      Os dois fluxos respondem igual para um endereço que existe e um que não —
      caso contrário viram uma forma de descobrir quem tem conta aqui.
- [x] Fila de aprovação opcional: `SIGNUP_MODE=manual` (padrão, o de hoje) ou
      `open`, em que o e-mail verificado é a barreira.
- [x] Trocar senha, encerrar todas as sessões, exportar os dados, apagar a conta.
- [ ] Trocar o e-mail da conta.
- [ ] Onboarding guiado: primeira criança, idioma, nível e primeira lição em
      menos de 3 minutos.
- [ ] Mensagem específica quando o provedor de IA está fora do ar — hoje o
      usuário vê a mensagem de crédito, que não é o que aconteceu.

## 4. Monetização

- [x] `Subscription`, `UsageRecord` e `BillingEvent` no banco; catálogo de planos
      em código (`services/billing_service.py`), porque preço muda por deploy
      revisável e não por linha editada em produção.
- [x] Planos: Gratuito (1 criança, IA só com chave própria), Família (R$ 34,90 —
      3 crianças, 300 gerações), Estudo (R$ 69 — crianças ilimitadas, 1.500
      gerações), Escola (sob consulta, não self-serve).
- [x] Limites em um lugar só (`Entitlement`): crianças na criação do perfil,
      gerações via crédito. Mensagem de erro diz o que fazer, não só "não".
- [x] Trial de 14 dias sem cartão e sem gateway. Ao expirar, cai para o gratuito
      com os dados preservados em leitura.
- [x] `past_due` continua com acesso: um cartão que falhou hoje de manhã não tira
      a lição da criança antes de o gateway terminar as tentativas.
- [x] Webhook `POST /api/billing/webhook` com assinatura HMAC sobre o corpo cru e
      idempotência por id de evento — a reentrega que todo gateway faz não
      aplica o efeito duas vezes.
- [ ] **Escolher e ligar o gateway.** Falta só a criação da sessão de checkout em
      `start_checkout` e as credenciais. Stripe se cartão basta; Mercado Pago ou
      Pagar.me se Pix for essencial — e para o mercado brasileiro provavelmente é.
- [ ] Portal de cobrança: trocar cartão, ver faturas, cancelar sozinho.
- [ ] Nota fiscal e regime tributário. Dá mais trabalho que o código.

## 5. Operação e conformidade

- [x] Custo por conta: uma linha em `usagerecord` por geração, com custo
      estimado por chamada (`AI_GENERATION_COST_MICROS`) até o provedor devolver
      contagem de tokens. Consulta pronta em `docs/saas-operacao.md`.
- [x] Rate limiting em login, cadastro e geração — por conta e por endereço.
      Limitação conhecida e documentada: o contador é por worker do uvicorn.
- [x] Logs estruturados em JSON com `account_id`, `request_id`, rota, status e
      duração; requisição lenta sai como warning; `X-Request-ID` volta na
      resposta para o usuário poder citar.
- [x] Áudio em cache deixou de ser um diretório público: link assinado de curta
      duração, com verificação de path traversal.
- [x] Ensaio de restauração automatizado: `scripts/restore-drill.sh` restaura o
      dump num banco descartável, roda as migrações e confere as linhas.
- [ ] **Rodar o ensaio uma vez e anotar o tempo.** O script existe; o número que
      importa é quanto tempo uma restauração real leva no seu servidor.
- [ ] Sentry (ou equivalente) para exceções. Os logs cobrem o "o quê"; falta o
      alerta.
- [ ] Ambiente de staging com dados sintéticos.
- [x] LGPD, direitos do titular: `GET /api/account/export` e
      `POST /api/account/delete`, ambos na área de pais. A exclusão remove na
      ordem certa porque o esquema não tem cascade.
- [ ] **Publicar política de privacidade e termos.** Rascunhos técnicos em
      `docs/privacidade.md` e `docs/termos.md`, escritos a partir do que o
      software realmente faz. Precisam de revisão jurídica antes de irem ao ar,
      e do aceite registrado no cadastro.
- [ ] DPA com o provedor de IA e confirmação de que o treinamento sobre os dados
      enviados está desligado.
- [ ] Retenção definida: quanto tempo o histórico fica após o cancelamento.

## 6. Produto e mercado

- [x] Módulos por conta: a parte de programação (currículo, decks, LeetCode) sai
      desligada e é ativada em Configurações. Resolve também o problema de
      posicionamento — o produto se apresenta como tutor de idiomas, e quem quer
      o resto liga.
- [ ] Landing page com preço visível e screenshots reais.
- [ ] Analytics de produto: ativação, retenção D7/D30, conversão trial→pago.
- [ ] Relatório semanal por e-mail ao responsável — é o que faz o pagante
      perceber valor e renovar.
- [ ] Suporte: caixa de entrada, FAQ, changelog.
- [ ] Modo escola: turmas, atribuição de lições, painel do professor. É onde
      está o ticket alto.
- [ ] Internacionalização da interface (ensina vários idiomas, mas a UI é PT-BR).

---

## 7. Decisões que continuam suas

1. **Gateway.** Pix muda a resposta. Sem Pix, Stripe; com Pix, Mercado Pago ou
   Pagar.me.
2. **Preço.** Os valores nos planos são um ponto de partida ancorado em custo
   estimado, não uma pesquisa de mercado.
3. **B2C ou escola.** O modelo de dados já comporta os dois; a landing page, não.
4. **Quanto de IA incluir.** 300 e 1.500 gerações são chutes informados. O
   `usagerecord` existe justamente para você trocar chute por número depois do
   primeiro mês.

## 8. Definição de pronto para o v1 pago

- [x] Teste automatizado prova que a conta A não enxerga nada da conta B.
- [x] Uma pessoa cria conta, verifica e-mail, testa 14 dias e usa o produto sem
      ação manual sua.
- [x] Você consegue responder, por conta, quanto ela custou em IA neste mês.
- [ ] Ela consegue **pagar** — falta o gateway.
- [ ] Restauração de backup executada e cronometrada pelo menos uma vez.
- [ ] Política de privacidade e termos publicados e aceitos no cadastro.
