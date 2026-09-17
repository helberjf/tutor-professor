export type DeepeningInline = {
  type: 'text' | 'strong' | 'emphasis' | 'code';
  value: string;
};

export type DeepeningBlock =
  | { type: 'heading'; level: 1 | 2 | 3; content: DeepeningInline[] }
  | { type: 'paragraph'; content: DeepeningInline[] }
  | { type: 'list'; ordered: boolean; items: DeepeningInline[][] }
  | { type: 'code'; language: string; code: string };

const INLINE_MARK = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;

export function parseInlineMarkdown(value: string): DeepeningInline[] {
  const result: DeepeningInline[] = [];
  let cursor = 0;

  for (const match of value.matchAll(INLINE_MARK)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push({ type: 'text', value: value.slice(cursor, index) });
    const token = match[0];
    if (token.startsWith('**')) result.push({ type: 'strong', value: token.slice(2, -2) });
    else if (token.startsWith('`')) result.push({ type: 'code', value: token.slice(1, -1) });
    else result.push({ type: 'emphasis', value: token.slice(1, -1) });
    cursor = index + token.length;
  }

  if (cursor < value.length) result.push({ type: 'text', value: value.slice(cursor) });
  return result.length ? result : [{ type: 'text', value }];
}

export function parseDeepeningMarkdown(markdown: string): DeepeningBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: DeepeningBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*([^\s`]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language: fence[1] || '', code: code.join('\n') });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        content: parseInlineMarkdown(heading[2].trim()),
      });
      index += 1;
      continue;
    }

    const list = line.match(/^\s*(?:(\d+)\.|[-*])\s+(.+)$/);
    if (list) {
      const ordered = Boolean(list[1]);
      const items: DeepeningInline[][] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:(\d+)\.|[-*])\s+(.+)$/);
        if (!item || Boolean(item[1]) !== ordered) break;
        items.push(parseInlineMarkdown(item[2].trim()));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,3})\s+/.test(lines[index])
      && !/^```/.test(lines[index])
      && !/^\s*(?:(\d+)\.|[-*])\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', content: parseInlineMarkdown(paragraph.join(' ')) });
  }

  return blocks;
}
