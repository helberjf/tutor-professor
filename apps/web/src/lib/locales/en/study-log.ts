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
  'Carregando registros…': 'Loading entries…',
  'Nada registrado ainda': 'Nothing logged yet',
  'Registre o que estudou hoje. Tópicos marcados como estudados e lições concluídas também aparecem aqui.':
    'Log what you studied today. Topics marked as studied and finished lessons show up here too.',
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

  // Search
  'Buscar nos registros': 'Search the entries',
  'Buscar no título, no texto e na ficha': 'Search titles, texts and sheets',
  'Buscando…': 'Searching…',
  'Nenhum registro com essa busca.': 'No entries match this search.',

  // Rename and merge
  'Caderno': 'Notebook',
  'Renomear': 'Rename',
  'Juntar': 'Merge',
  'Disciplina inteira': 'Whole subject area',
  'Novo nome da disciplina': 'New subject area name',
  'Novo nome da matéria': 'New subject name',
  'Em branco: fica sem matéria': 'Blank: no subject',
  'Já existe "{name}": os registros vão para lá e os dois grupos viram um só.':
    '"{name}" already exists: the entries move there and the two groups become one.',
  'Muda só aqui no Controle de estudos; em Outras disciplinas o nome continua o mesmo.':
    'Changes only here in the study log; in Other disciplines the name stays the same.',
  'Vale para todos os registros desta matéria.': 'Applies to every entry of this subject.',
  'Escolha o novo nome da disciplina.': 'Pick the new name of the subject area.',
  'Não foi possível renomear.': 'Could not rename.',

  // Notebook
  'Não foi possível abrir o caderno.': 'Could not open the notebook.',
  'Abrindo o caderno…': 'Opening the notebook…',
  'Fechar caderno': 'Close notebook',
  'Baixar .md': 'Download .md',
  '{summarized} de {total} registros com ficha': '{summarized} of {total} entries with a sheet',
  '{minutes} min de leitura': '{minutes} min read',
  'Escrevendo a ficha {current} de {total}: {title}': 'Writing sheet {current} of {total}: {title}',
  'Gerar as {count} fichas que faltam': 'Write the {count} missing sheets',
  'Gerar a ficha que falta': 'Write the missing sheet',
  'Configure uma chave de IA na Área da conta para gerar as fichas que faltam.':
    'Set up an AI key in the account area to write the missing sheets.',
  'Registros só com o tempo ficam sem ficha — edite e cole o que estudou para ter uma.':
    'Entries with only the time have no sheet — edit them and paste what you studied to get one.',

  // Review
  'Revisar fichas': 'Review sheets',
  'Revisar esta ficha': 'Review this sheet',
  'Modo revisar': 'Review mode',
  'Montando a revisão…': 'Setting up the review…',
  'Não foi possível abrir a revisão.': 'Could not open the review.',
  'Não foi possível salvar a revisão.': 'Could not save the review.',
  'Fechar revisão': 'Close review',
  'Nada para revisar aqui ainda': 'Nothing to review here yet',
  'As perguntas vêm das fichas. Gere as fichas dos seus registros e volte para revisar.':
    'The questions come from the sheets. Write the sheets of your entries and come back to review.',
  'Pergunta {current} de {total}': 'Question {current} of {total}',
  'Atalhos: 1 = sabia · 2 = não sabia': 'Shortcuts: 1 = knew it · 2 = did not know',
  'Você sabia {known} de {total} perguntas': 'You knew {known} of {total} questions',
  'Concluir': 'Done',
  'revisado hoje': 'reviewed today',
  'revisado ontem': 'reviewed yesterday',
  'revisado há {days} dias': 'reviewed {days} days ago',

  // Period analysis
  'Analisar período': 'Analyse period',
  'Análise do período': 'Period analysis',
  'Fechar análise': 'Close analysis',
  'Período': 'Period',
  '30 dias': '30 days',
  'Personalizado': 'Custom',
  'De': 'From',
  'Até': 'To',
  'Escolha um período de até um ano, com o fim depois do começo.':
    'Pick a period of up to a year that ends after it starts.',
  'Calculando o período…': 'Working out the period…',
  'Não foi possível calcular o período.': 'Could not work out the period.',
  'Tempo registrado': 'Time logged',
  'igual ao período anterior': 'same as the period before',
  '+{time} que o período anterior': '+{time} vs. the period before',
  '−{time} que o período anterior': '−{time} vs. the period before',
  'maior sequência: {days}': 'longest streak: {days}',
  '1 dia': '1 day',
  '{count} dias': '{count} days',
  'Registros': 'Entries',
  '{count} com ficha': '{count} with a sheet',
  'Revisões': 'Reviews',
  'nenhuma revisão no período': 'no reviews in the period',
  '1 revisão': '1 review',
  '{count} revisões': '{count} reviews',
  'Dia a dia': 'Day by day',
  'Tempo registrado em cada dia do período': 'Time logged on each day of the period',
  'Cinza: dia com registro sem tempo (tópico estudado ou lição concluída).':
    'Grey: a day with entries but no time logged (a topic studied or a lesson finished).',
  'Dia da semana': 'Day of the week',
  'Para revisar': 'To review',
  '1 ficha ainda não revisada': '1 sheet not reviewed yet',
  '{count} fichas ainda não revisadas': '{count} sheets not reviewed yet',
  '1 registro sem ficha': '1 entry without a sheet',
  '{count} registros sem ficha': '{count} entries without a sheet',
  'Análise da IA': 'AI analysis',
  'A IA lê os números acima e os seus registros e escreve o que eles mostram: o que você estudou, seu ritmo, o que revisar e os próximos passos.':
    'The AI reads the numbers above and your entries and writes what they show: what you studied, your rhythm, what to review and what to do next.',
  'Analisar com IA': 'Analyse with AI',
  'A IA está lendo seus registros…': 'The AI is reading your entries…',
  'Não foi possível escrever a análise.': 'Could not write the analysis.',
  'Não foi possível abrir a análise.': 'Could not open the analysis.',
  'Não foi possível excluir a análise.': 'Could not delete the analysis.',
  'Abrindo a análise…': 'Opening the analysis…',
  'Nada registrado nesse período.': 'Nothing logged in this period.',
  'Configure uma chave de IA na Área da conta para a IA analisar o período.':
    'Set up an AI key in the account area so the AI can analyse the period.',
  'Gerada em {when}': 'Written on {when}',
  'Os registros desse período mudaram depois desta análise. Refaça para incluir o que mudou.':
    'The entries of this period changed after this analysis. Redo it to include the changes.',
  'Refazer': 'Redo',
  'Excluir esta análise? Dá para gerar outra depois.': 'Delete this analysis? You can write another one later.',
  'Análises anteriores': 'Earlier analyses',
  'Análise': 'Analysis',
};
