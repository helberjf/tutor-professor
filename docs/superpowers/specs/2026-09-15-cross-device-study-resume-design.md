# Retomada de estudo entre dispositivos

## Objetivo

Ao tocar em **Continuar de onde parou**, o aluno deve voltar ao conteúdo de estudo mais recente, inclusive quando trocar de celular ou computador. Se a última atividade foi uma aula de Programação, o aplicativo deve reabrir a aba de Programação, a mesma matéria, o mesmo tópico e o mesmo modo de estudo.

## Comportamento esperado

- A retomada pertence ao aluno autenticado e fica salva no servidor.
- A posição é atualizada somente depois que o conteúdo solicitado foi carregado e validado.
- O destino mais recente vence uma sessão guiada antiga. Uma sessão guiada continua podendo ser retomada, mas não deve sequestrar o botão depois que o aluno estudou outra disciplina.
- O botão mostra um resumo do destino, por exemplo `Continuar: JavaScript — Arrays`.
- O comportamento cobre sessão guiada, lição de idioma, revisão, Programação e Outras matérias.
- Se o conteúdo foi removido ou deixou de pertencer ao aluno, a API devolve um destino seguro para a área correspondente em vez de um link quebrado.
- Abrir uma tela não conta como conclusão, acerto ou atividade diária; a retomada é um marcador de navegação separado das métricas pedagógicas.

## Persistência

Será criada a migração `0030_study_resume.py` e uma tabela com um registro por aluno. O registro terá:

- `child_id`, único e vinculado ao aluno;
- `kind`, identificando sessão, lição, revisão, tópico de Programação, flashcards, questões ou matéria diversa;
- `context`, JSON com apenas os identificadores necessários ao tipo do destino;
- `updated_at`, usado para indicar quando a posição foi alterada.

Os nomes e links não serão aceitos livremente do navegador. A API valida os identificadores, confirma que pertencem ao aluno, busca os nomes atuais e monta o destino canônico. Isso evita links adulterados e mantém a retomada correta depois de uma matéria ser renomeada.

## API

Dois endpoints autenticados serão adicionados:

- `GET /api/study/resume`: devolve `has_resume`, `kind`, `href`, `label` e `updated_at`. Sem registro válido, usa a sessão guiada aberta como compatibilidade; sem nenhuma posição, devolve `has_resume: false`.
- `PUT /api/study/resume`: recebe o tipo e os identificadores do conteúdo carregado, valida a propriedade e cria ou atualiza o registro do aluno de maneira idempotente.

Tipos e destinos canônicos:

- sessão guiada: `/session`;
- lição de idioma: `/lesson`;
- revisão: `/review`;
- Programação em leitura ou questões: `/study?tab=coding&mode=<modo>&subject_id=<id>&topic_id=<id>`;
- flashcards de Programação: `/study?tab=coding&mode=flashcards&subject_id=<id>`;
- Outras matérias: `/study?tab=diverse&date=<data>&subject_id=<id>` e, quando aplicável, `lesson_id=<id>`.

## Aplicativo web

Uma pequena função cliente registrará a retomada sem bloquear a tela. Falhas nessa gravação não interrompem o estudo; a posição anterior continua disponível.

O componente de Programação passará a aceitar `mode`, `subject_id` e `topic_id` da URL. Depois de carregar as matérias, ele valida a matéria, carrega seus tópicos e abre o tópico solicitado. Outras matérias também restaurará a data e a matéria pelos identificadores da URL.

A página inicial consultará a nova API junto com os demais dados. Quando houver retomada, o botão principal usará o `href` canônico e exibirá o `label`. O botão para iniciar uma fila nova continuará separado.

As páginas registram a posição nestes momentos:

- sessão guiada: quando a fila é carregada e após cada avanço;
- lição e revisão: quando o conteúdo válido aparece;
- Programação: quando a matéria, o tópico ou o modo é efetivamente aberto;
- Outras matérias: quando a matéria ou lição selecionada é exibida.

## Tratamento de conteúdo inválido

Ao ler a retomada, a API confirma novamente que o conteúdo existe e pertence ao aluno. Se um tópico de Programação foi apagado, volta para a matéria; se a matéria também foi apagada, volta para Programação. Para Outras matérias, volta para a aba correspondente. O registro inválido é normalizado para que visitas futuras não repitam o erro.

## Testes

O desenvolvimento seguirá o ciclo teste falhando, implementação mínima e teste passando.

- Testes da API confirmarão isolamento por aluno, atualização da posição, links canônicos, prioridade sobre sessão antiga e fallback após exclusão.
- Testes do frontend confirmarão que o botão usa o destino retornado e que URLs profundas restauram matéria, tópico e modo.
- Os testes existentes de sessão continuarão garantindo que o índice da fila seja retomado.
- A verificação final incluirá migração, testes da API, testes do frontend, lint, tipagem, build e navegação real no aplicativo.

## Fora do escopo

- Sincronizar posição de rolagem dentro do texto da aula.
- Manter várias posições recentes ao mesmo tempo; haverá apenas o destino mais recente por aluno.
- Considerar a simples abertura de uma tela como lição concluída.
