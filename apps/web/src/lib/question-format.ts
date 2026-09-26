export interface FormattedQuestionPrompt {
  prompt: string;
  focusText: string | null;
}

const QUESTION_PATTERNS: Array<{ regex: RegExp; prompt: string | ((match: RegExpMatchArray) => string) }> = [
  {
    regex: /^O que significa\s+["'“”]?(.+?)["'“”]?\?$/i,
    prompt: 'O que significa ?',
  },
  {
    regex: /^Qual e o significado de\s+["'“”]?(.+?)["'“”]?\?$/i,
    prompt: 'Qual é o significado ?',
  },
  {
    regex: /^Qual frase significa\s+["'“”]?(.+?)["'“”]?\?$/i,
    prompt: 'Qual frase significa ?',
  },
  {
    // The API names the language studied ("em francês"), not always English.
    regex: /^Como se diz\s+["'“”]?(.+?)["'“”]?\s+em\s+(\p{L}+)\?$/iu,
    prompt: (match) => `Como se diz em ${match[2]} ?`,
  },
];

export function formatQuestionPrompt(question: string): FormattedQuestionPrompt {
  const trimmedQuestion = question.trim();

  for (const pattern of QUESTION_PATTERNS) {
    const match = trimmedQuestion.match(pattern.regex);
    if (match) {
      return {
        prompt: typeof pattern.prompt === 'function' ? pattern.prompt(match) : pattern.prompt,
        focusText: match[1].trim(),
      };
    }
  }

  return {
    prompt: trimmedQuestion,
    focusText: null,
  };
}
