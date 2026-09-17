# Aprofundamento com IA legivel na area de estudo

## Objetivo

Transformar a resposta de `Aprofundar com IA` em uma leitura confortavel e formatada, semelhante ao conteudo mostrado no Notion, sem reduzir a area util da aula nem alterar o texto copiado.

## Escopo

A mudanca se limita ao modal de leitura de topicos de programacao em `TopicView`.

Ela nao altera:

- o endpoint ou o prompt de aprofundamento;
- a persistencia, pois a resposta continua temporaria;
- o formato Markdown retornado pela API;
- o comportamento das demais telas de resumo.

## Experiencia do usuario

1. Ao selecionar `Aprofundar com IA`, a area principal do modal troca da aula para uma visualizacao de aprofundamento.
2. A pergunta opcional e a acao `Gerar aprofundamento` aparecem no topo dessa area, sem ocupar o cabecalho fixo da aula.
3. Durante a geracao, a area principal mostra um estado de carregamento claro.
4. A resposta aparece como conteudo de leitura, com largura confortavel e suporte visual para titulos, paragrafos, listas, enfase, codigo inline e blocos de codigo.
5. Os controles `A-` e `A+` continuam dimensionando todo o conteudo exibido.
6. `Copiar para Notion` copia o Markdown original, preservando sua estrutura.
7. `Voltar a aula` restaura a etapa atual sem apagar a pergunta ou a resposta gerada. Fechar o aprofundamento ou trocar de etapa segue a regra existente de limpar o estado temporario.
8. Erros permanecem na area de aprofundamento e permitem nova tentativa sem fechar a tela.

## Arquitetura e componentes

`ReadingStudyModal` continua sendo o dono do estado de pergunta, resposta, carregamento, erro e copia. O formulario atualmente renderizado dentro do cabecalho sera movido para a area principal do modal.

Um componente local de apresentacao recebera o Markdown da resposta e o convertera em elementos React seguros. Ele cobrira somente a sintaxe que o contrato do prompt produz:

- titulos de niveis 1 a 3;
- paragrafos e linhas em branco;
- listas ordenadas e nao ordenadas;
- negrito e italico;
- codigo inline;
- blocos de codigo delimitados por crases triplas.

O renderizador nao usara HTML fornecido pela IA e nao utilizara `dangerouslySetInnerHTML`. Texto desconhecido permanecera texto comum, evitando transformar a resposta da IA em markup executavel.

Blocos de codigo reutilizarao a apresentacao visual de `SyntaxCodeBlock` quando isso for compativel com o conteudo. A resposta inteira ficara em uma coluna de leitura com largura limitada, espacamento vertical e contraste equivalentes aos da aula.

## Fluxo de dados

1. O usuario abre o modo de aprofundamento.
2. O formulario chama `api.deepenCodingReadingStep` com o mesmo payload atual.
3. A API retorna `{ content: markdown }`.
4. O estado guarda esse Markdown sem transformacao, para que a copia continue fiel.
5. O componente de apresentacao interpreta o texto apenas durante a renderizacao.
6. `Voltar a aula` muda somente a visualizacao; a resposta continua disponivel enquanto o usuario permanecer na mesma etapa.

## Estados e falhas

- Antes da primeira geracao, a area mostra a pergunta opcional e uma explicacao curta do resultado esperado.
- Enquanto a API responde, o botao fica desabilitado e um indicador evita envios duplicados.
- Em caso de erro, a pergunta digitada permanece e a mensagem aparece perto do formulario.
- Respostas vazias nao exibem o leitor nem habilitam a copia.
- Markdown incompleto ou desconhecido degrada para texto legivel, sem quebrar o modal.
- Ao mudar de etapa, o aprofundamento volta ao estado inicial, conforme o comportamento atual.

## Testes

O desenvolvimento seguira um ciclo de teste primeiro:

1. Um teste de interface falhara enquanto a resposta ainda usar o `textarea` pequeno no cabecalho.
2. O teste exigira que o formulario e o leitor do aprofundamento estejam na area principal, com `Voltar a aula` e `Copiar para Notion`.
3. Testes do renderizador cobrirao titulos, listas, enfase, codigo inline, blocos de codigo e texto Markdown malformado.
4. Os testes existentes do aprofundamento, do layout movel e a verificacao TypeScript serao executados novamente.

## Criterios de aceite

- A resposta nao aparece mais em um `textarea` de oito linhas.
- A area principal do modal e usada para ler o aprofundamento.
- Markdown comum e exibido como conteudo formatado e legivel.
- O texto copiado e exatamente o Markdown retornado pela API.
- O usuario pode voltar para a aula sem perder a resposta na etapa atual.
- A fonte do aprofundamento responde aos controles de tamanho.
- O modal continua utilizavel em celular e desktop.
