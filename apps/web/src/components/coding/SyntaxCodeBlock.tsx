import { normalizeCodeLanguage, tokenizeCode, type CodeTokenKind } from './syntax-highlighter';

interface SyntaxCodeBlockProps {
  code: string;
  language?: string | null;
  className?: string;
}

const TOKEN_CLASS: Record<CodeTokenKind, string> = {
  plain: 'text-slate-100',
  keyword: 'text-[#ff7b72]',
  type: 'text-[#ffa657]',
  function: 'text-[#d2a8ff]',
  number: 'text-[#79c0ff]',
  string: 'text-[#a5d6ff]',
  comment: 'text-[#8b949e] italic',
  operator: 'text-[#ff7b72]',
  punctuation: 'text-[#c9d1d9]',
};

export function SyntaxCodeBlock({ code, language, className = '' }: SyntaxCodeBlockProps) {
  const normalizedLanguage = normalizeCodeLanguage(language);
  const tokens = tokenizeCode(code, normalizedLanguage);

  return (
    <pre
      className={`overflow-x-auto rounded-2xl border border-slate-800 bg-[#0d1117] p-4 font-mono text-xs leading-relaxed text-slate-100 shadow-inner ${className}`}
      data-language={normalizedLanguage}
    >
      <code>
        {tokens.map((token) => (
          <span key={`${token.offset}-${token.kind}`} className={TOKEN_CLASS[token.kind]}>
            {token.value}
          </span>
        ))}
      </code>
    </pre>
  );
}
