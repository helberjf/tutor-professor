# Operar como SaaS

O que muda quando o app deixa de ser de uma família e passa a ser de estranhos.
Complementa o [deploy na VPS](DEPLOY-VPS.md), que continua sendo o caminho de
instalação.

---

## 1. Configuração mínima antes de abrir para outras pessoas

Tudo está em `.env.prod.example` com explicação. O resumo do que **não pode**
ficar no padrão:

| Variável | Valor | Por quê |
|---|---|---|
| `ALLOW_GUEST_ACCESS` | `false` | Ligado, todo visitante sem sessão compartilha um mesmo perfil de criança. |
| `SESSION_SECRET` | valor único | Assina as sessões. Com placeholder a API se recusa a subir. |
| `AI_ENCRYPTION_KEY` | valor único | Criptografa as chaves de IA guardadas. Separada do `SESSION_SECRET` para que girar um não destrua o outro. |
| `EMAIL_PROVIDER` | `smtp` + servidor | Com `console` ninguém consegue verificar e-mail nem redefinir senha. |
| `TRUST_PROXY_HEADERS` | `true` atrás do Caddy | Sem isso, o limite de requisições vê o proxy como único cliente. |
| `SIGNUP_MODE` | `manual` ou `open` | `open` só funciona com e-mail configurado. |

Verificação rápida depois de subir:

```bash
curl -s https://SEU_DOMINIO/health
```

## 2. Como um novo cadastro entra

```
cadastro → e-mail de verificação → [ SIGNUP_MODE=open  → aprovado automaticamente ]
                                   [ SIGNUP_MODE=manual → fila do administrador em /admin ]
```

O modo manual é o padrão e continua útil para beta fechado ou piloto em escola.

## 3. Planos e limites

O catálogo está em `apps/api/services/billing_service.py`, em código, não no
banco: preço e limite mudam por deploy, que é revisável e reversível.

- Conta sem assinatura = plano gratuito. Nada é criado no cadastro.
- O limite de crianças é verificado ao criar um perfil.
- A franquia mensal de IA do plano vira **créditos**, recarregados uma vez por
  período. Créditos concedidos à mão pelo administrador nunca são reduzidos pela
  recarga — as duas coisas somam no mesmo saldo.
- `past_due` continua com acesso: um cartão que falhou hoje de manhã não deve
  tirar a lição da criança antes de o gateway terminar as tentativas.
- O teste gratuito não precisa de gateway nenhum. Pagar, sim.

Para ligar um gateway: preencher `BILLING_PROVIDER`, `BILLING_WEBHOOK_SECRET` e
implementar a criação da sessão de checkout em `start_checkout`. O webhook em
`POST /api/billing/webhook` já valida a assinatura sobre o corpo cru e ignora
entregas repetidas pelo id do evento.

## 4. Quanto cada conta custa

Cada geração que usa a chave da plataforma grava uma linha em `usagerecord` com
um custo estimado (`AI_GENERATION_COST_MICROS`, em milionésimos). Chamadas com
a chave do próprio cliente também são registradas, com custo zero.

```sql
-- as contas mais caras do mês
SELECT u.email,
       COUNT(*) FILTER (WHERE r.kind = 'ai_generation')          AS geracoes,
       SUM(r.cost_micros) / 10000.0                              AS centavos
FROM usagerecord r
JOIN "user" u ON u.id = r.user_id
WHERE r.period_key = to_char(now(), 'YYYY-MM')
GROUP BY u.email
ORDER BY centavos DESC
LIMIT 20;
```

O custo é uma estimativa por chamada até o provedor passar a devolver contagem
de tokens. Compare com a fatura real e corrija `AI_GENERATION_COST_MICROS`.

## 5. Logs

`LOG_FORMAT=json` emite uma linha por requisição com `request_id`, rota, status,
duração e `account_id`. É o que transforma "um usuário disse que falhou" em uma
consulta:

```bash
docker compose -f docker-compose.prod.yml logs api \
  | grep '"account_id": 42' | tail -50
```

Requisições acima de `SLOW_REQUEST_MS` saem como `warning`. O `X-Request-ID` vai
na resposta, então dá para pedir o número ao usuário.

## 6. Limite de requisições

Janela deslizante em memória (`apps/api/services/rate_limit.py`): login e
cadastro por endereço, geração por conta.

**Limitação real:** o contador é por processo. Com mais de um worker do uvicorn,
o teto efetivo se multiplica pelo número de workers. Antes de escalar
horizontalmente, mova para um armazenamento compartilhado.

## 7. Backup e ensaio de restauração

O cron de `pg_dump` está em [DEPLOY-VPS.md](DEPLOY-VPS.md). O que faltava era
provar que o dump volta:

```bash
./scripts/restore-drill.sh backups/db-2026-09-01.sql.gz
```

O script restaura em um banco descartável ao lado do de produção, roda as
migrações e confere se as tabelas voltaram com linhas. **Rode uma vez por mês e
anote quanto tempo levou** — esse número é o seu tempo de recuperação real.

## 8. Girar segredos

- `SESSION_SECRET`: desloga todo mundo. Rows de chave de IA anteriores à
  separação ainda precisam do valor antigo para serem lidas.
- `AI_ENCRYPTION_KEY`: coloque o valor antigo em `AI_ENCRYPTION_KEYS_OLD`,
  suba com a chave nova, e as linhas se atualizam conforme são lidas.

## 9. Pedidos de titular (LGPD)

Ambos são autoatendimento e não precisam de você:

- Cópia dos dados: `GET /api/account/export`
- Exclusão total: `POST /api/account/delete` (pede a senha de novo)

A exclusão apaga na ordem certa — respostas, tentativas, provas, matérias,
lições e por fim o perfil e a conta — porque o esquema não tem cascade e um
perfil apagado primeiro deixaria órfãos que ninguém encontraria depois.

## 10. Checklist antes do primeiro cliente pagante

- [ ] `ALLOW_GUEST_ACCESS=false` e `SESSION_SECRET`/`AI_ENCRYPTION_KEY` próprios
- [ ] SMTP real configurado e um e-mail de teste recebido
- [ ] `python scripts/test_tenant_isolation.py` verde no ambiente de produção
- [ ] Um ensaio de restauração feito e cronometrado
- [ ] [Política de privacidade](privacidade.md) e [termos](termos.md) revisados
      por advogado, publicados e aceitos no cadastro
- [ ] Gateway de pagamento configurado e um webhook de teste aplicado
- [ ] Você consegue responder, por conta, quanto ela custou em IA neste mês
