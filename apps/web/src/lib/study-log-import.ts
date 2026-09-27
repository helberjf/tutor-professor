/**
 * A file the learner picked, turned into text for the "Controle de estudos".
 *
 * Only the text is kept, so the file is read here, in the browser: .md and .txt
 * as they are, and .docx — a ZIP whose word/document.xml holds the paragraphs —
 * with a small ZIP reader and the browser's own DecompressionStream. That is the
 * whole job, and it keeps a dependency out of the bundle and images out of the
 * upload. The text lands in the form, where it can be read and edited before
 * anything is saved.
 *
 * Errors carry Portuguese messages; the screen shows them through t().
 */

import { STUDY_LOG_LIMITS } from '@/lib/api';

export const STUDY_FILE_ACCEPT = '.md,.markdown,.txt,.docx';
/** Big enough for a long .docx full of images; the text inside is what counts. */
export const MAX_STUDY_FILE_BYTES = 15 * 1024 * 1024;

export type InflateRaw = (data: Uint8Array) => Promise<Uint8Array>;

export class StudyFileError extends Error {}

export interface StudyFileText {
  text: string;
  filename: string;
  /** True when the text was longer than an entry holds and was cut. */
  truncated: boolean;
}

export function studyFileKind(name: string): 'text' | 'docx' | 'doc' | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt')) return 'text';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.doc')) return 'doc';
  return null;
}

/** Raw DEFLATE through the browser's DecompressionStream. */
export async function browserInflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new StudyFileError('Este navegador não consegue abrir .docx. Cole o texto na caixa.');
  }
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** One file out of a ZIP archive, found through its central directory. */
export async function readZipEntry(
  bytes: Uint8Array,
  wanted: string,
  inflateRaw: InflateRaw,
): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  // The end record is 22 bytes plus a comment of up to 64 KB, read backwards.
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 22 - 0xffff); index -= 1) {
    if (view.getUint32(index, true) === EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new StudyFileError('Não consegui abrir este .docx. Cole o texto na caixa.');

  const decoder = new TextDecoder();
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (name === wanted) {
      if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) break;
      // The local header repeats the name with its own extra field; sizes come
      // from the central record, which is right even when a data descriptor follows.
      const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const data = bytes.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new StudyFileError('Não consegui abrir este .docx. Cole o texto na caixa.');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function headingLevel(paragraph: string): number {
  const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(paragraph)?.[1] ?? '';
  // "Title"/"Heading2" in English Word; "Ttulo"/"Ttulo2" in Portuguese Word,
  // whose style ids drop the accented letter.
  if (/^(title|t[ií]?tulo)$/i.test(style)) return 1;
  const level = /^(?:heading|t[ií]?tulo)(\d)$/i.exec(style)?.[1];
  return level ? Math.min(Number(level), 4) : 0;
}

/** word/document.xml as Markdown: headings, list items and paragraphs. */
export function docxXmlToMarkdown(xml: string): string {
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const blocks: Array<{ text: string; list: boolean }> = [];
  for (const match of body.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const paragraph = match[1];
    let text = '';
    for (const token of paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<w:cr\/>/g)) {
      if (token[1] !== undefined) text += decodeXmlText(token[1]);
      else if (token[0].startsWith('<w:tab')) text += '\t';
      else text += '\n';
    }
    text = text.replace(/[ \t]+\n/g, '\n').trim();
    if (!text) continue;
    const level = headingLevel(paragraph);
    if (level) {
      blocks.push({ text: `${'#'.repeat(level)} ${text.replace(/\s+/g, ' ')}`, list: false });
    } else if (/<w:numPr>/.test(paragraph)) {
      blocks.push({ text: `- ${text}`, list: true });
    } else {
      blocks.push({ text, list: false });
    }
  }
  let markdown = '';
  blocks.forEach((block, index) => {
    if (index > 0) markdown += block.list && blocks[index - 1].list ? '\n' : '\n\n';
    markdown += block.text;
  });
  return markdown.trim();
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** The text inside a file's bytes. Split from readStudyFile so it runs without a File. */
export async function studyTextFromBytes(
  filename: string,
  bytes: Uint8Array,
  inflateRaw: InflateRaw = browserInflateRaw,
): Promise<StudyFileText> {
  const kind = studyFileKind(filename);
  if (kind === 'doc') {
    throw new StudyFileError('Arquivos .doc antigos não são lidos. Salve como .docx ou cole o texto.');
  }
  if (kind === null) throw new StudyFileError('Use um arquivo .md, .txt ou .docx.');
  if (bytes.byteLength > MAX_STUDY_FILE_BYTES) throw new StudyFileError('O arquivo passa de 15 MB.');

  let text: string;
  if (kind === 'text') {
    text = new TextDecoder().decode(bytes);
  } else {
    const documentXml = await readZipEntry(bytes, 'word/document.xml', inflateRaw);
    if (!documentXml) throw new StudyFileError('Não encontrei o texto deste .docx. Cole o texto na caixa.');
    text = docxXmlToMarkdown(new TextDecoder().decode(documentXml));
  }
  text = normalizeText(text);
  if (!text) throw new StudyFileError('O arquivo não tem texto.');
  const truncated = text.length > STUDY_LOG_LIMITS.content;
  return { text: truncated ? text.slice(0, STUDY_LOG_LIMITS.content) : text, filename, truncated };
}

export async function readStudyFile(file: File, inflateRaw: InflateRaw = browserInflateRaw): Promise<StudyFileText> {
  if (file.size > MAX_STUDY_FILE_BYTES) throw new StudyFileError('O arquivo passa de 15 MB.');
  return studyTextFromBytes(file.name, new Uint8Array(await file.arrayBuffer()), inflateRaw);
}
