# Auditoria do Tutor and Professor

Data da analise: 2026-05-31

## Resumo executivo

O app tem boa base para estudo infantil: licoes curtas, quiz, revisao, audio, chat guiado e area dos pais. A maior fragilidade de producao ainda e operacional: o backend depende de um computador local ligado e de um Cloudflare Tunnel temporario. Para uso real com criancas, a experiencia fica mais confiavel se o backend sair do fluxo "meu PC + quick tunnel" e for para uma hospedagem estavel ou tunnel nomeado.

Nesta rodada foram implementados pontos essenciais para deixar o app mais proximo de uso real:

- sessoes persistidas no banco em vez de sessoes somente em memoria;
- dados e progresso associados ao login do responsavel;
- criacao automatica do primeiro aluno no cadastro;
- painel dos pais com progresso por aluno;
- endpoint `/api/parent/progress`;
- prioridade para a URL global mais recente do backend publicada pela Vercel;
- teste de smoke cobrindo as principais rotas FastAPI.

## Funcionalidades atuais

| Funcionalidade | Status | Nota | Observacao |
|---|---:|---:|---|
| Cadastro do responsavel | Funcional | 8/10 | Valida CPF e cria primeiro aluno junto com a conta. |
| Login do responsavel | Funcional | 8/10 | Agora usa sessao persistida no banco, sobrevivendo a restart do backend. |
| Perfis de alunos | Funcional | 8/10 | Cada responsavel ve seus alunos; login legado por senha ainda ve todos por compatibilidade. |
| Licao diaria | Funcional | 8/10 | Boa para criancas por ser curta e direta. |
| Quiz | Funcional | 7/10 | Reforca a licao, mas ainda pode ganhar mais variedade e recompensas. |
| Revisao espacada | Funcional | 8/10 | Bom potencial pedagogico; ja salva erros/acertos por aluno. |
| Chat do tutor | Funcional basico | 6/10 | Seguro e simples, mas ainda e baseado em regras locais, sem memoria pedagogica rica. |
| Audio/TTS | Funcional com fallback | 7/10 | Bom para criancas; depende de Kokoro/Edge disponivel. |
| Area dos pais | Funcional | 8/10 | Agora mostra resumo por aluno e permite acompanhar atividade. |
| Geracao de licoes com IA | Condicional | 6/10 | Depende de `GEMINI_API_KEY`; precisa curadoria para producao infantil. |
| Conexao Vercel + Cloudflare Tunnel | Funcional, fragil | 5/10 | Quick tunnel expira; usar backend estavel ou tunnel nomeado. |

## Viabilidade para criancas estudarem

Nota geral: 8/10 para estudo supervisionado e 6/10 para uso autonomo em producao sem ajustes operacionais.

Pontos fortes:

- telas simples e coloridas;
- atividades curtas, adequadas para baixa tolerancia de atencao;
- audio ajuda pronuncia e acessibilidade;
- revisao salva progresso e dificuldade por aluno;
- pais conseguem acompanhar o andamento;
- cadastro por responsavel reduz risco de uso anonimo.

Pontos de atencao:

- o app precisa de backend sempre online para nao frustrar a crianca;
- o quick tunnel da Cloudflare nao e ideal para rotina diaria;
- o chat deve continuar limitado e monitorado;
- falta modo "crianca" separado do modo "pais", com PIN ou bloqueio simples;
- falta relatorio semanal simples para o responsavel.

## Melhorias implementadas nesta rodada

1. Sessao persistida no banco
   - Criada tabela `usersession`.
   - Cookie guarda apenas token opaco; banco guarda hash.
   - Login nao depende mais de dicionario em memoria.

2. Dados por login
   - Cadastro cria um `ChildProfile` vinculado ao `User`.
   - Login cria aluno automaticamente se uma conta antiga ainda nao tiver aluno.
   - Rotas de aluno respeitam o responsavel logado e nao aceitam `X-Child-ID` de outro usuario.

3. Acompanhamento dos pais
   - Novo endpoint `GET /api/parent/progress`.
   - Tela `/parents` mostra cards compactos por aluno com dias, temas, frases, ultima atividade e palavras dificeis.

4. Conexao do backend
   - O frontend agora prefere a URL global mais recente publicada na Vercel.
   - URLs salvas manualmente no celular nao ficam presas para sempre quando o launcher publica uma URL global nova.

5. Testes
   - Criado `scripts/test_api_routes.py`.
   - O teste usa SQLite temporario e cobre cadastro, login, pais, filhos, licoes, quiz, revisao, chat, audio e logout.

## Rotas API testadas

- `GET /health`
- `GET /api/progress`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/parent/login`
- `POST /api/parent/logout`
- `GET /api/parent/settings`
- `POST /api/parent/settings`
- `GET /api/parent/children`
- `POST /api/parent/children`
- `GET /api/parent/progress`
- `GET /api/lessons`
- `GET /api/lesson/today`
- `GET /api/lesson/{id}`
- `POST /api/lesson/complete`
- `GET /api/quiz/today`
- `POST /api/quiz/submit`
- `GET /api/review`
- `POST /api/review/attempt`
- `POST /api/chat`
- `POST /api/audio/speak`
- `POST /api/parent/generate-lesson`

## Diagnostico do problema Vercel + Cloudflare Tunnel

Na analise local, a Vercel ainda retornava uma URL global antiga do dia 2026-05-25:

`https://visual-iron-locate-whereas.trycloudflare.com`

Esse quick tunnel nao resolvia mais DNS, entao o frontend ficava apontando para backend morto. O token local foi aceito pela Vercel, mas qualquer nova URL so sera gravada quando o tunnel atual responder em `/health`.

Recomendacao de producao:

- melhor: hospedar FastAPI e Postgres em ambiente sempre ligado;
- aceitavel: usar Cloudflare Tunnel nomeado com dominio fixo;
- evitar: depender de quick tunnel diario para uma crianca usar o app.

## Proximas melhorias recomendadas

| Prioridade | Melhoria | Impacto | Viabilidade |
|---|---|---:|---:|
| Alta | Backend sempre online | Muito alto | Alta |
| Alta | Reset de senha e verificacao de email | Alto | Media |
| Alta | Modo crianca separado da area dos pais | Alto | Alta |
| Media | Relatorio semanal para pais | Alto | Alta |
| Media | Trilha adaptativa por desempenho | Alto | Media |
| Media | Mais recompensas visuais sem excesso de estimulo | Medio | Alta |
| Media | Curadoria/preview de licoes geradas por IA | Alto | Media |
| Baixa | Ranking/gamificacao social | Baixo | Baixa para criancas pequenas |
| Baixa | Modo offline parcial | Medio | Media |

## Nota final

O produto esta viavel para estudo infantil supervisionado, principalmente com licoes curtas e acompanhamento dos pais. Para producao real, o maior salto de qualidade nao e visual: e tirar o backend do computador local ou transformar o tunnel em uma URL estavel.
