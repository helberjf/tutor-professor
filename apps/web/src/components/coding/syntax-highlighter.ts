export type CodeLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'go' | 'plain';

export type CodeTokenKind =
  | 'plain'
  | 'keyword'
  | 'type'
  | 'function'
  | 'number'
  | 'string'
  | 'comment'
  | 'operator'
  | 'punctuation';

export interface CodeToken {
  kind: CodeTokenKind;
  value: string;
  offset: number;
}

const TYPE_SCRIPT_KEYWORDS = new Set([
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'finally', 'for',
  'from', 'function', 'get', 'if', 'implements', 'import', 'in', 'instanceof', 'interface',
  'let', 'new', 'of', 'private', 'protected', 'public', 'readonly', 'return', 'set', 'static',
  'super', 'switch', 'throw', 'try', 'type', 'typeof', 'var', 'void', 'while', 'with', 'yield',
]);

const TYPE_SCRIPT_TYPES = new Set([
  'Array', 'Promise', 'Record', 'Set', 'Map', 'Date', 'Error', 'RegExp', 'boolean', 'false',
  'never', 'null', 'number', 'object', 'string', 'true', 'undefined', 'unknown',
]);

const PYTHON_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while',
  'with', 'yield',
]);

const PYTHON_TYPES = new Set(['bool', 'dict', 'float', 'int', 'list', 'set', 'str', 'tuple']);

const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'new', 'null',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'super', 'switch',
  'this', 'throw', 'throws', 'try', 'void', 'while',
]);

const GO_KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough',
  'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range',
  'return', 'select', 'struct', 'switch', 'type', 'var',
]);

const GO_TYPES = new Set([
  'bool', 'byte', 'complex64', 'complex128', 'error', 'float32', 'float64', 'int', 'int8',
  'int16', 'int32', 'int64', 'rune', 'string', 'uint', 'uint8', 'uint16', 'uint32', 'uint64',
  'uintptr',
]);

export function normalizeCodeLanguage(language?: string | null): CodeLanguage {
  const value = (language || '').trim().toLowerCase();
  if (!value) return 'typescript';
  if (value === 'ts' || value === 'tsx' || value === 'typescript') return 'typescript';
  if (value === 'js' || value === 'jsx' || value === 'javascript') return 'javascript';
  if (value === 'py' || value === 'python') return 'python';
  if (value === 'java') return 'java';
  if (value === 'go' || value === 'golang') return 'go';
  return 'typescript';
}

function isIdentifierStart(char: string) {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string) {
  return /[A-Za-z0-9_$]/.test(char);
}

function classifyIdentifier(value: string, language: CodeLanguage, nextChar: string): CodeTokenKind {
  if (language === 'python') {
    if (PYTHON_KEYWORDS.has(value)) return 'keyword';
    if (PYTHON_TYPES.has(value)) return 'type';
  } else if (language === 'java') {
    if (JAVA_KEYWORDS.has(value)) return 'keyword';
    if (/^[A-Z]/.test(value)) return 'type';
  } else if (language === 'go') {
    if (GO_KEYWORDS.has(value)) return 'keyword';
    if (GO_TYPES.has(value)) return 'type';
  } else {
    if (TYPE_SCRIPT_KEYWORDS.has(value)) return 'keyword';
    if (TYPE_SCRIPT_TYPES.has(value)) return 'type';
    if (/^[A-Z]/.test(value)) return 'type';
  }
  if (nextChar === '(') return 'function';
  return 'plain';
}

function readString(code: string, start: number, quote: string) {
  let index = start + 1;
  while (index < code.length) {
    if (code[index] === '\\') {
      index += 2;
      continue;
    }
    if (code[index] === quote) {
      index += 1;
      break;
    }
    index += 1;
  }
  return code.slice(start, index);
}

function nextNonSpace(code: string, index: number) {
  let cursor = index;
  while (cursor < code.length && /\s/.test(code[cursor])) cursor += 1;
  return code[cursor] || '';
}

export function tokenizeCode(code: string, languageInput?: string | null): CodeToken[] {
  const language = normalizeCodeLanguage(languageInput);
  const tokens: CodeToken[] = [];
  let index = 0;

  function push(kind: CodeTokenKind, value: string, offset = index) {
    tokens.push({ kind, value, offset });
  }

  while (index < code.length) {
    const char = code[index];
    const next = code[index + 1] || '';

    if (/\s/.test(char)) {
      const start = index;
      while (index < code.length && /\s/.test(code[index])) index += 1;
      push('plain', code.slice(start, index), start);
      continue;
    }

    if (char === '/' && next === '/') {
      const start = index;
      while (index < code.length && code[index] !== '\n') index += 1;
      push('comment', code.slice(start, index), start);
      continue;
    }

    if (char === '/' && next === '*') {
      const start = index;
      index += 2;
      while (index < code.length && !(code[index] === '*' && code[index + 1] === '/')) index += 1;
      index = Math.min(index + 2, code.length);
      push('comment', code.slice(start, index), start);
      continue;
    }

    if (language === 'python' && char === '#') {
      const start = index;
      while (index < code.length && code[index] !== '\n') index += 1;
      push('comment', code.slice(start, index), start);
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const value = readString(code, index, char);
      push('string', value);
      index += value.length;
      continue;
    }

    if (/\d/.test(char)) {
      const start = index;
      while (index < code.length && /[A-Za-z0-9_.]/.test(code[index])) index += 1;
      push('number', code.slice(start, index), start);
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      while (index < code.length && isIdentifierPart(code[index])) index += 1;
      const value = code.slice(start, index);
      push(classifyIdentifier(value, language, nextNonSpace(code, index)), value, start);
      continue;
    }

    if ('{}[]();,.'.includes(char)) {
      push('punctuation', char);
      index += 1;
      continue;
    }

    if ('+-*/%=!<>?:&|^~'.includes(char)) {
      const start = index;
      while (index < code.length && '+-*/%=!<>?:&|^~'.includes(code[index])) index += 1;
      push('operator', code.slice(start, index), start);
      continue;
    }

    push('plain', char);
    index += 1;
  }

  return tokens;
}
