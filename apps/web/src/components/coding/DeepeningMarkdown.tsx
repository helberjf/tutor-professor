import { Fragment } from 'react';

import { SyntaxCodeBlock } from './SyntaxCodeBlock';
import { parseDeepeningMarkdown, type DeepeningInline } from './deepening-markdown';

interface DeepeningMarkdownProps {
  content: string;
  fallbackLanguage?: string;
}

function InlineContent({ content }: { content: DeepeningInline[] }) {
  return content.map((part, index) => {
    const key = `${part.type}-${index}-${part.value}`;
    if (part.type === 'strong') {
      return <strong key={key} className="font-black text-slate-900">{part.value}</strong>;
    }
    if (part.type === 'emphasis') return <em key={key}>{part.value}</em>;
    if (part.type === 'code') {
      return (
        <code key={key} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.88em] text-rose-700">
          {part.value}
        </code>
      );
    }
    return <Fragment key={key}>{part.value}</Fragment>;
  });
}

export function DeepeningMarkdown({ content, fallbackLanguage }: DeepeningMarkdownProps) {
  const blocks = parseDeepeningMarkdown(content);

  return (
    <article className="mx-auto w-full max-w-[76ch] text-slate-700">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === 'heading') {
          if (block.level === 1) {
            return (
              <h3 key={key} className="mt-8 text-[1.7em] font-black leading-tight text-slate-950 first:mt-0">
                <InlineContent content={block.content} />
              </h3>
            );
          }
          if (block.level === 2) {
            return (
              <h4 key={key} className="mt-8 text-[1.35em] font-black leading-tight text-slate-900">
                <InlineContent content={block.content} />
              </h4>
            );
          }
          return (
            <h5 key={key} className="mt-6 text-[1.1em] font-black leading-tight text-slate-900">
              <InlineContent content={block.content} />
            </h5>
          );
        }
        if (block.type === 'code') {
          return (
            <SyntaxCodeBlock
              key={key}
              code={block.code}
              language={block.language || fallbackLanguage}
              className="mt-5 text-[0.8em]"
            />
          );
        }
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List
              key={key}
              className={`mt-4 space-y-2 pl-7 text-[1em] font-medium leading-[1.75] ${block.ordered ? 'list-decimal' : 'list-disc'}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}><InlineContent content={item} /></li>
              ))}
            </List>
          );
        }
        return (
          <p key={key} className="mt-4 text-[1em] font-medium leading-[1.8]">
            <InlineContent content={block.content} />
          </p>
        );
      })}
    </article>
  );
}
