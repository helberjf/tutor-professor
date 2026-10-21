# Chat e geração de livros — 21/10/2026

## Correções e limites

O chat atual é um tutor local de vocabulário, sem chamada a um modelo de IA.
As respostas fora do assunto vinham de buscas por trechos de palavras (`hi`
em `this`, por exemplo), seleção de lições sem filtro de perfil/idioma e descarte
do histórico. Agora ele compara palavras e frases completas, prioriza frases
mais específicas e consulta apenas lições acessíveis no idioma do perfil.
Pedidos de exemplo e repetição retomam o assunto anterior; palavras incidentais
de um exemplo não substituem esse assunto. Perguntas sem correspondência pedem
esclarecimento em vez de oferecer uma lição arbitrária.

A criação de livros mantém o fluxo existente: roteiro, confirmação e uma página
por clique, até **5 páginas**. As proteções adicionais são aplicadas na API:

- Roteiro: teto de **1.800 tokens de saída** por chamada.
- Página: teto de **1.000 tokens de saída** por chamada.
- Uma chamada por etapa, sem novas tentativas automáticas ao receber erro ou JSON inválido.
- Texto original e tradução limitados a 800 caracteres cada; roteiro e vocabulário também são limitados.
- Contexto da geração: até as três páginas anteriores salvas no banco, sem confiar no texto reenviado pelo cliente.
- Páginas em sequência; repetir uma página salva devolve o mesmo registro sem chamada de IA ou novo crédito.
- Pedidos simultâneos são serializados por livro; PostgreSQL usa o mecanismo existente de advisory lock e SQLite usa lock local.
- O endpoint legado de geração integral pode reutilizar um livro existente; novas gerações com mais de uma página devem usar o fluxo paginado.

Os tetos de saída são enviados nos campos próprios de cada provedor:
[Gemini](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig),
[OpenAI](https://developers.openai.com/api/reference/resources/chat) e
[Anthropic](https://platform.claude.com/docs/en/api/messages/create).
Outros provedores compatíveis recebem `max_tokens`. Isso limita a saída de cada
chamada; tokens de entrada e a contabilização do provedor também afetam o custo.

A cobrança existente foi preservada: resposta recebida do provedor conta como
uso mesmo se o JSON for inválido; falha sem resposta bem-sucedida não consome
crédito. O callback que pode efetuar commit é adiado até a página estar salva na
transação para não liberar o lock antes da hora.

## Regressões automatizadas

Da raiz, usando o Python do ambiente virtual:

```powershell
.venv/Scripts/python.exe scripts/e2e/run_legacy.py test_chat_context.py test_book_generation_limits.py test_book_page_requests.py
```

Os scripts cobrem seleção de vocabulário, acentos, contexto, idioma/perfil,
limites dos payloads dos provedores, respostas inválidas, cobrança, sequência,
contexto vindo do banco e pedidos duplicados/simultâneos. O runner aceita apenas
nomes da lista permitida, desativa dotenv e rede e utiliza bancos descartáveis.

No frontend:

```powershell
cd apps/web
pnpm exec playwright test e2e/books-chat/chat.spec.ts --project=chromium
```

Esse fluxo cobre chat com API real, geração de livro por clique com provedor
simulado, envio vazio e recusa de geração sem chave. Os testes não usam chaves
reais nem geram custos em provedores. PostgreSQL e respostas reais dos modelos
não foram exercitados localmente.

Resultados locais: 15 scripts da API passaram (incluindo 34 casos novos nos três
scripts acima), assim como TypeScript, lint e a verificação existente das regras
de livros. Os cinco E2E focados passaram na execução isolada, sem retries.
Uma rodada anterior, simultânea à regressão Python, teve timeout aguardando a
resposta inicial do chat; a captura mostrava requisições pendentes, sem resposta
fora do assunto. Não foi necessário alterar as asserções ou o timeout para a
execução isolada passar. A causa dessa espera não foi confirmada.
