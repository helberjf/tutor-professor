# Política de Privacidade — rascunho

> **Este é um rascunho técnico, não um documento jurídico pronto.** Ele descreve
> com precisão o que o software realmente faz hoje, para que um advogado possa
> transformá-lo em uma política válida. Não publique como está: os campos entre
> `[colchetes]` precisam ser preenchidos e o texto precisa de revisão jurídica,
> especialmente por envolver dados de crianças.

**Controlador:** [razão social, CNPJ, endereço]
**Encarregado (DPO):** [nome e e-mail de contato]
**Última atualização:** [data]

---

## 1. O que este serviço é

O Tutor and Professor é um aplicativo de estudo usado por um responsável adulto,
que cria perfis para as crianças sob sua responsabilidade e acompanha o
progresso delas.

**A conta é sempre do adulto.** A criança não cria conta, não tem senha e não
recebe e-mail. O que existe é um perfil dentro da conta do responsável.

## 2. Dados que coletamos

**Do responsável (titular da conta)**

| Dado | Por quê | Base legal sugerida |
|---|---|---|
| Nome e sobrenome | Identificar a conta | Execução de contrato |
| E-mail | Login, verificação, redefinição de senha | Execução de contrato |
| CPF (armazenado apenas como hash) | Evitar contas duplicadas | Execução de contrato |
| Senha (hash PBKDF2-HMAC-SHA256, 260.000 iterações, salt por senha) | Autenticação | Execução de contrato |
| Data e hora de acessos, IP da requisição (em log) | Segurança e limite de abuso | Legítimo interesse |
| Chave de API de IA, se você fornecer (criptografada) | Usar seu próprio provedor de IA | Execução de contrato |

**Do perfil da criança**

| Dado | Por quê |
|---|---|
| Primeiro nome ou apelido | Personalizar as lições |
| Faixa etária | Ajustar o nível do conteúdo |
| Idioma de origem e idioma-alvo | Escolher o conteúdo |
| Respostas, acertos, erros e datas de estudo | Repetição espaçada e relatório de progresso |

Não pedimos endereço, escola, telefone, foto ou data de nascimento exata da
criança. **Recomendamos usar apenas o primeiro nome ou um apelido no perfil.**

## 3. Consentimento do responsável

O cadastro é feito por um adulto, que declara ser responsável legal pela criança
cujo perfil cria. Registramos a data e a hora desse aceite junto com a conta.

## 4. Inteligência artificial

Parte do conteúdo é gerada por um provedor de IA externo ([nome do provedor]).

- O que é enviado ao provedor: o tema ou assunto de estudo, o nível e o idioma.
- O que **não** é enviado: o nome da criança, o e-mail do responsável, o CPF ou
  qualquer identificador da conta.
- Se você configurar a sua própria chave de API, as chamadas saem sob a sua
  conta no provedor e passam a seguir a política dele.
- Temos [acordo de tratamento de dados / DPA] com o provedor e o treinamento de
  modelos sobre os dados enviados está [desativado — confirmar e documentar].

## 5. Áudio

A leitura em voz alta é gerada por um serviço de síntese de voz e o arquivo fica
em cache no servidor. Os links de áudio são assinados e expiram em poucas horas.
Nenhum áudio da criança é gravado: o aplicativo não usa o microfone.

## 6. Com quem compartilhamos

- Provedor de IA (item 4).
- Provedor de hospedagem ([nome]) e de e-mail transacional ([nome]).
- Gateway de pagamento, quando houver assinatura paga: ele recebe nome, e-mail e
  dados de cobrança. **Não armazenamos número de cartão em nenhum momento.**
- Autoridades, quando houver obrigação legal.

Não vendemos dados e não usamos os dados das crianças para publicidade.

## 7. Por quanto tempo guardamos

- Enquanto a conta existir.
- Após o cancelamento: [X dias] para permitir recuperação, e depois exclusão.
- Após pedido de exclusão: apagamos imediatamente os dados da conta e dos
  perfis. Backups em rotação ainda contêm os dados por até [Y dias] e são
  sobrescritos no ciclo normal.
- Registros exigidos por lei (por exemplo, logs de acesso pelo Marco Civil da
  Internet) são mantidos pelo prazo legal.

## 8. Seus direitos (LGPD, art. 18)

Você pode, a qualquer momento e sem falar com ninguém:

- **Obter uma cópia dos seus dados** — área de pais, ou `GET /api/account/export`.
- **Apagar a conta e tudo que está sob ela** — área de pais, ou
  `POST /api/account/delete`. É irreversível e pede a senha novamente.
- **Corrigir dados** — a área de pais permite editar nome, perfil e preferências.
- **Encerrar sessões** em todos os aparelhos.

Para qualquer outro pedido: [e-mail do encarregado]. Prazo de resposta: 15 dias.

## 9. Segurança

- Todo o tráfego passa por HTTPS.
- Senhas nunca são armazenadas em texto claro.
- Chaves de API de IA são criptografadas com uma chave dedicada, separada da que
  assina as sessões.
- Cada conta enxerga apenas os próprios dados; isso é verificado por testes
  automatizados a cada alteração do código.
- Tentativas repetidas de senha bloqueiam o acesso temporariamente.

## 10. Fora do Brasil

Os provedores de IA, hospedagem e e-mail podem processar dados fora do Brasil.
[Descrever as salvaguardas: cláusulas contratuais, região do provedor.]

## 11. Mudanças nesta política

Avisaremos por e-mail antes de mudanças relevantes.

---

## Pendências antes de publicar

- [ ] Revisão por advogado com prática em LGPD e dados de crianças.
- [ ] Preencher todos os `[colchetes]`.
- [ ] Confirmar e anexar o DPA do provedor de IA e a desativação de treinamento.
- [ ] Definir os prazos de retenção `[X]` e `[Y]`.
- [ ] Se houver venda fora do Brasil: avaliar COPPA (EUA) e GDPR-K (UE), que têm
      exigências diferentes desta política.
