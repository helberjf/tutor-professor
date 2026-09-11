# Importação manual de estudo criado por IA

## Objetivo

Permitir que uma pessoa copie um prompt pronto para qualquer IA, cole a resposta no Tutor and Professor e crie uma matéria completa com blocos de estudo e questões respondidas em uma única operação.

## Experiência

Na visão geral de **Outras matérias**, um painel “Importar estudo com IA” explica um fluxo de três passos: copiar o prompt, enviá-lo à IA preferida e colar o JSON retornado. O usuário pode editar o tema e a quantidade sugerida antes de copiar. Ao colar, o app valida e mostra uma prévia com nome da matéria, número de aulas e número de questões. A confirmação salva e mostra o card da nova matéria, pronto para abrir. O painel deixa claro que essa opção não usa a chave nem os créditos de IA do app.

## Formato aceito

O formato principal usa chaves em português:

```json
{
  "materia": "Sistema Solar",
  "aulas": [
    {
      "titulo": "Planetas rochosos",
      "questoes": [
        {
          "pergunta": "Quais são os planetas rochosos?",
          "resposta": "Mercúrio, Vênus, Terra e Marte."
        }
      ]
    }
  ]
}
```

Também são aceitos os equivalentes em inglês (`subject`, `lessons`, `title`, `questions`, `question`, `answer`) e respostas envolvidas por cercas Markdown de JSON. A matéria deve ter de 1 a 60 caracteres, entre 1 e 30 aulas, entre 1 e 50 questões únicas, perguntas de até 120 caracteres e respostas de até 2.000 caracteres.

## Arquitetura e dados

Um módulo puro no frontend contém o prompt, remove cercas Markdown, valida o documento e o converte para `DiverseSubject`. Cada questão ganha identidade local canônica e entra em `subject.topics`; cada aula vira `DiverseLessonBlock` e guarda apenas `topic_ids`. Isso preserva o modelo já usado por estudo, revisão espaçada e leitura dos blocos.

O container da página chama um endpoint dedicado que acrescenta uma única matéria ao `DiverseDay`. O backend reaplica os limites do contrato, lê a versão atual, verifica nome e identidade duplicados e usa a atualização atômica já existente; assim, um snapshot antigo do navegador nunca substitui outras matérias. Repetir exatamente o mesmo pacote na mesma data é idempotente, o que reconcilia uma resposta perdida após a gravação. O seletor de data fica bloqueado durante a gravação; como defesa adicional, o estado visual só assume o conteúdo retornado se o usuário ainda estiver na mesma data e preserva o JSON caso a tela tenha mudado.

## Erros e segurança

JSON inválido, respostas brutas acima de 150.000 caracteres, campos ausentes, limites excedidos e questões repetidas são recusados antes de qualquer gravação. Uma matéria com o mesmo nome na data também é recusada. A interface mantém o texto colado após falhas para permitir correção.

## Testes

Testes unitários exercitam prompt, cercas Markdown, aliases em inglês, mapeamento de aulas para IDs e principais erros. O fluxo visual é testado com Playwright: abrir importação, copiar/visualizar, colar pacote, verificar prévia, confirmar e observar a nova matéria aberta após a resposta persistida.
