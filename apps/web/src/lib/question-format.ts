export interface FormattedQuestionPrompt {
  prompt: string;
  focusText: string | null;
}

const QUESTION_PATTERNS: Array<{ regex: RegExp; prompt: string }> = [
  {
    regex: /^O que significa\s+["'“”]?(.+?)["'“”]?\?$/i,
    prompt: 'O que significa ?',
  },
  {
    regex: /^Qual e o significado de\s+["'“”]?(.+?)["'“”]?\?$/i,
    prompt: 'Qual e o significado ?',
  },
  {
    regex: /^Qual frase significa\s+["'“”]?(.+?)["'“”]?\?$/i,
    prompt: 'Qual frase significa ?',
  },
  {
    regex: /^Como se diz\s+["'“”]?(.+?)["'“”]?\s+em ingles\?$/i,
    prompt: 'Como se diz em ingles ?',
  },
];

export function formatQuestionPrompt(question: string): FormattedQuestionPrompt {
  const trimmedQuestion = question.trim();

  for (const pattern of QUESTION_PATTERNS) {
    const match = trimmedQuestion.match(pattern.regex);
    if (match) {
      return {
        prompt: pattern.prompt,
        focusText: match[1].trim(),
      };
    }
  }

  return {
    prompt: trimmedQuestion,
    focusText: null,
  };
}
