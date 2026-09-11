import type { CodingTopic, DiverseLessonBlock, DiverseSubject } from '@/lib/api';

type IdFactories = {
  createSubjectId: () => string;
  createLessonId: () => string;
  createQuestionId: () => string;
};

const defaultFactories: IdFactories = {
  createSubjectId: () => `subject-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  createLessonId: () => `lesson-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  createQuestionId: () => `question-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function unwrapJsonFence(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export function buildManualStudyPrompt(subject: string, questionCount: number) {
  const requestedSubject = subject.trim() || '[TEMA DA MATÉRIA]';
  const requestedCount = Math.min(50, Math.max(1, Math.round(questionCount) || 10));
  return `Crie um estudo completo e didático sobre "${requestedSubject}" em português do Brasil, adequado para revisão por perguntas e respostas.

Divida o assunto em aulas progressivas e produza exatamente ${requestedCount} questões no total. Cada resposta deve ensinar o conteúdo com clareza, explicando o motivo e incluindo um exemplo curto quando for útil. Evite questões repetidas.

Responda somente o JSON válido, sem texto antes ou depois e sem blocos Markdown, seguindo exatamente esta estrutura:
{
  "materia": "Nome da matéria",
  "aulas": [
    {
      "titulo": "Título da aula",
      "questoes": [
        {
          "pergunta": "Pergunta terminada com interrogação?",
          "resposta": "Resposta explicativa e autossuficiente"
        }
      ]
    }
  ]
}

Regras: use no máximo 30 aulas; mantenha cada título de aula com até 80 caracteres, cada pergunta com até 120 caracteres e cada resposta com até 2.000 caracteres; distribua as ${requestedCount} questões entre as aulas; não inclua campos além dos apresentados.`;
}

export function parseManualStudyImport(raw: string, factories: IdFactories = defaultFactories): DiverseSubject {
  if (raw.length > 150_000) {
    throw new Error('A resposta da IA deve ter no máximo 150.000 caracteres.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapJsonFence(raw));
  } catch {
    throw new Error('Cole um JSON válido retornado pela IA.');
  }

  const root = asRecord(parsed);
  if (!root) throw new Error('O estudo precisa ser um objeto JSON.');

  const name = readText(root, ['materia', 'matéria', 'subject', 'name']);
  if (!name) throw new Error('Informe o nome da matéria no JSON.');
  if (name.length > 60) throw new Error('O nome da matéria deve ter no máximo 60 caracteres.');

  const rawLessons = root.aulas ?? root.lessons;
  if (!Array.isArray(rawLessons) || rawLessons.length === 0) {
    throw new Error('O estudo precisa ter pelo menos uma aula.');
  }
  if (rawLessons.length > 30) throw new Error('O estudo pode ter no máximo 30 aulas.');

  const topics: CodingTopic[] = [];
  const lessons: DiverseLessonBlock[] = [];
  const questionKeys = new Set<string>();

  rawLessons.forEach((rawLesson, lessonIndex) => {
    const lesson = asRecord(rawLesson);
    if (!lesson) throw new Error(`A aula ${lessonIndex + 1} precisa ser um objeto.`);
    const title = readText(lesson, ['titulo', 'título', 'title', 'name']);
    if (!title) throw new Error(`Informe o título da aula ${lessonIndex + 1}.`);
    if (title.length > 80) throw new Error(`O título da aula ${lessonIndex + 1} deve ter no máximo 80 caracteres.`);

    const rawQuestions = lesson.questoes ?? lesson['questões'] ?? lesson.questions ?? lesson.topics ?? lesson.items;
    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
      throw new Error(`A aula "${title}" precisa ter pelo menos uma questão.`);
    }

    const topicIds: string[] = [];
    rawQuestions.forEach((rawQuestion, questionIndex) => {
      if (topics.length >= 50) throw new Error('O estudo pode ter no máximo 50 questões.');
      const question = asRecord(rawQuestion);
      if (!question) throw new Error(`A questão ${questionIndex + 1} de "${title}" precisa ser um objeto.`);
      const front = readText(question, ['pergunta', 'question', 'topic', 'front']);
      const back = readText(question, ['resposta', 'answer', 'back']);
      if (!front || !back) throw new Error(`Preencha pergunta e resposta na questão ${questionIndex + 1} de "${title}".`);
      if (front.length > 120) throw new Error(`A pergunta ${questionIndex + 1} de "${title}" deve ter no máximo 120 caracteres.`);
      if (back.length > 2000) throw new Error(`A resposta ${questionIndex + 1} de "${title}" deve ter no máximo 2.000 caracteres.`);

      const questionKey = normalizeKey(front);
      if (questionKeys.has(questionKey)) throw new Error(`A questão "${front}" está repetida.`);
      questionKeys.add(questionKey);

      const questionId = factories.createQuestionId();
      topicIds.push(questionId);
      topics.push({ id: questionId, topic: front, answer: back, code_example: null, done: false });
    });

    lessons.push({ id: factories.createLessonId(), title, topic_ids: topicIds });
  });

  return {
    id: factories.createSubjectId(),
    name,
    topics,
    lessons,
  };
}
