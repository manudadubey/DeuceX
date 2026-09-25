// PRD-05 section 7's text arithmetic: word count, reading time and the
// teaser. Pure, so the editor shows the same numbers the server stores.

/** Paragraphs are separated by one or more blank lines. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

/** Reading time in minutes = max(1, round(words / 160)); 197 -> 1, 390 -> 2, 512 -> 3. */
export function readMinutes(words: number): number {
  return Math.max(1, Math.round(words / 160));
}

/** "197 words · about 1 minute to read" */
export function countLine(body: string): string {
  const words = wordCount(body);
  const minutes = readMinutes(words);
  return `${words} ${words === 1 ? 'word' : 'words'} · about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} to read`;
}

export const TEASER_MAX_CHARS = 400;

/** C-13 / section 7: the first paragraph, up to 400 characters, cut at a word boundary. */
export function teaserText(body: string): string {
  const first = paragraphs(body)[0] ?? '';
  if (first.length <= TEASER_MAX_CHARS) return first;
  const cut = first.slice(0, TEASER_MAX_CHARS - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 200 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

/** Sentences, split on terminal punctuation followed by whitespace. */
export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=["“'‘(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}
