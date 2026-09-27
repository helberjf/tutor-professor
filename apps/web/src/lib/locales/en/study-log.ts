/** The "Controle de estudos" page, its entry points and the file reader's messages. */
export const STUDY_LOG_EN: Record<string, string> = {
  // Page and entry points
  'Controle de estudos': 'Study log',
  'Controle': 'Log',
  'Abrindo o controle de estudos': 'Opening the study log',
  'Voltar aos estudos': 'Back to studies',
  'Tudo o que você estudou': 'Everything you studied',
  'Registre cada estudo: cole o texto, anexe um arquivo .md, .txt ou .docx, ou informe só o tempo. A IA escreve uma ficha para você revisar e conseguir ensinar a alguém. Tópicos marcados como estudados e lições concluídas entram aqui sozinhos.':
    'Log every study session: paste the text, attach a .md, .txt or .docx file, or just enter the time. The AI writes a sheet you can review from and use to teach someone else. Topics marked as studied and finished lessons show up here on their own.',
  'Registre o que estudou e revise pelas fichas': 'Log what you studied and review from the sheets',
  'Registrar no Controle de estudos': 'Add it to the study log',

  // Summary at the top
  '7 dias': '7 days',
  'igual à semana anterior': 'same as the week before',
  '+{time} que a semana anterior': '+{time} vs. the week before',
  '−{time} que a semana anterior': '−{time} vs. the week before',
  'Dias com estudo': 'Days studied',
  '1 registro': '1 entry',
  '{count} registros': '{count} entries',

  // Form
  'Novo registro': 'New entry',
  'O que você estudou?': 'What did you study?',
  'Ex.: Direito, Programação': 'E.g.: Law, Programming',
  'Em branco: a IA escolhe': 'Blank: the AI picks it',
  'Em branco: a IA sugere um título': 'Blank: the AI suggests a title',
  'Opcional': 'Optional',
  'Texto do que estudou': 'Text of what you studied',
  'Anexar .md, .txt ou .docx': 'Attach .md, .txt or .docx',
  'Cole aqui o que você leu ou anotou — ou deixe em branco e informe só o tempo.':
    'Paste what you read or wrote down here — or leave it blank and just enter the time.',
  'Esquecer o nome do arquivo': 'Forget the file name',
  'Tempo (minutos)': 'Time (minutes)',
  'Usar os pomodoros de hoje ({minutes} min)': "Use today's pomodoros ({minutes} min)",
  'Data do estudo': 'Study date',
  'Ao salvar, a IA escreve a ficha para você revisar e conseguir ensinar a alguém.':
    'When you save, the AI writes the sheet you can review from and use to teach someone else.',
  'Sem uma chave de IA, o registro é salvo sem ficha.': 'Without an AI key, the entry is saved without a sheet.',
  'Configurar a IA': 'Set up the AI',
  'Escolha a disciplina do que você estudou.': 'Pick the subject area of what you studied.',
  'Informe o tempo em minutos, de 1 a {max}.': 'Enter the time in minutes, from 1 to {max}.',
  'Cole o que estudou ou informe quanto tempo estudou.': 'Paste what you studied or enter how long you studied.',
  'Não foi possível salvar o registro.': 'Could not save the entry.',
  'O arquivo era maior do que um registro comporta; ficou só o começo.':
    'The file was longer than an entry holds; only the beginning was kept.',
  'Não consegui ler o arquivo. Cole o texto na caixa.': 'Could not read the file. Paste the text in the box.',

  // File reader
  'Este navegador não consegue abrir .docx. Cole o texto na caixa.':
    'This browser cannot open .docx files. Paste the text in the box.',
  'Não consegui abrir este .docx. Cole o texto na caixa.': 'Could not open this .docx. Paste the text in the box.',
  'Arquivos .doc antigos não são lidos. Salve como .docx ou cole o texto.':
    'Old .doc files cannot be read. Save it as .docx or paste the text.',
  'Use um arquivo .md, .txt ou .docx.': 'Use a .md, .txt or .docx file.',
  'O arquivo passa de 15 MB.': 'The file is over 15 MB.',
  'Não encontrei o texto deste .docx. Cole o texto na caixa.': 'Could not find the text in this .docx. Paste the text in the box.',
  'O arquivo não tem texto.': 'The file has no text.',

  // List
  'Seus registros': 'Your entries',
  'Como agrupar': 'How to group',
  'Por dia': 'By day',
  'Por disciplina': 'By subject area',
  'Filtrar registros': 'Filter entries',
  'Filtrar por título, disciplina ou matéria': 'Filter by title, subject area or subject',
  'Carregando registros…': 'Loading entries…',
  'Nada registrado ainda': 'Nothing logged yet',
  'Registre o que estudou hoje. Tópicos marcados como estudados e lições concluídas também aparecem aqui.':
    'Log what you studied today. Topics marked as studied and finished lessons show up here too.',
  'Nenhum registro com esse filtro.': 'No entries match this filter.',
  'Mostrar dias anteriores': 'Show earlier days',
  'Sem matéria': 'No subject',
  'Não foi possível carregar os registros.': 'Could not load the entries.',
  'Não foi possível abrir o registro.': 'Could not open the entry.',
  'Não foi possível escrever a ficha.': 'Could not write the sheet.',
  'Excluir este registro? A ficha e o texto dele somem junto.': 'Delete this entry? Its sheet and text go with it.',
  'Não foi possível excluir o registro.': 'Could not delete the entry.',

  // Entry
  'Arquivo': 'File',
  'Tópico estudado': 'Topic studied',
  'Lição concluída': 'Lesson finished',
  'Anotação antiga': 'Old note',
  'matéria escolhida pela IA': 'subject picked by the AI',
  'Escrevendo a ficha…': 'Writing the sheet…',
  'Ficha pronta': 'Sheet ready',
  'Abrindo registro…': 'Opening entry…',
  'Ficha': 'Sheet',
  'Copiado': 'Copied',
  'Copiar': 'Copy',
  'Editar ficha': 'Edit sheet',
  'Salvar ficha': 'Save sheet',
  'Refazer ficha': 'Rewrite sheet',
  'Gerar ficha com IA': 'Write the sheet with AI',
  'Configure uma chave de IA na Área da conta para gerar a ficha.': 'Set up an AI key in the account area to write the sheet.',
  'Ainda não há texto para gerar a ficha. Edite o registro e cole o que estudou.':
    'There is no text to write the sheet from yet. Edit the entry and paste what you studied.',
  'Texto original': 'Original text',
  'Abrir aula': 'Open the lesson',
  'Editar registro': 'Edit entry',
  'Salvar alterações': 'Save changes',

  // Language tab record
  'Meta do dia cumprida estudando.': "Today's goal met by studying.",
  'Estude na sessão de hoje ou registre o que estudou no Controle de estudos para fechar a meta.':
    "Study in today's session or add what you studied to the study log to meet the goal.",
  'Planejamento': 'Plan',
  'Salvar planejamento': 'Save plan',
  'Nada registrado neste dia. O que você estudar fica no Controle de estudos, com uma ficha para revisar.':
    'Nothing logged on this day. What you study goes to the study log, with a sheet to review.',
  'Depois do estudo, registre no Controle de estudos o que realmente fez. Isso alimenta os dias seguidos.':
    'After studying, add what you actually did to the study log. It keeps your streak going.',
};
