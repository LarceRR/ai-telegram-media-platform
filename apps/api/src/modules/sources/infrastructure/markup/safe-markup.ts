/**
 * Bounded markup reading for hostile input.
 *
 * Ingested HTML and XML are untrusted: they can be enormous, malformed, or
 * shaped to make a naive parser do quadratic work. Everything here scans
 * linearly with indexOf, uses regexes without nested quantifiers, and guards
 * every loop with an explicit iteration budget.
 */
const MAX_ITERATIONS = 2_000_000;
const DEFAULT_ELEMENT_LIMIT = 200;

/** Content that must never contribute text: script payloads, styling, embeds. */
const HIDDEN_BLOCK_TAGS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'object',
  'embed',
] as const;

const NAME_BOUNDARIES: ReadonlySet<string> = new Set(['>', '/', ' ', '\t', '\n', '\r', '\f']);

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  shy: '',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  laquo: '\u00ab',
  raquo: '\u00bb',
  bull: '\u2022',
  middot: '\u00b7',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  deg: '\u00b0',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  sect: '\u00a7',
  para: '\u00b6',
  times: '\u00d7',
  divide: '\u00f7',
  plusmn: '\u00b1',
  micro: '\u00b5',
  frac12: '\u00bd',
  frac14: '\u00bc',
  frac34: '\u00be',
  sup2: '\u00b2',
  sup3: '\u00b3',
};

export interface MarkupElement {
  name: string;
  /** The element including its tags. */
  outer: string;
  /** Everything between the tags. Empty for self-closing elements. */
  inner: string;
}

interface OpenTagMatch {
  name: string;
  start: number;
  openEnd: number;
  selfClosing: boolean;
}

function isNameBoundary(character: string): boolean {
  return character === '' || NAME_BOUNDARIES.has(character);
}

/**
 * Walks opening tags for the requested names in document order.
 *
 * Per-name cursors are cached so a name that does not occur again is never
 * rescanned; without that, one indexOf per name per iteration is quadratic on
 * large documents. When two names start at the same offset the longer one wins,
 * so `content:encoded` is never shadowed by `content`.
 */
function* scanOpenTags(markup: string, names: readonly string[]): Generator<OpenTagMatch> {
  const lower = markup.toLowerCase();
  const cursors = new Map<string, number>();
  let index = 0;
  let guard = 0;

  const nextFor = (name: string, from: number): number => {
    const cached = cursors.get(name);
    if (cached !== undefined && (cached === -1 || cached >= from)) return cached;
    const found = lower.indexOf(`<${name}`, from);
    cursors.set(name, found);
    return found;
  };

  while (guard < MAX_ITERATIONS) {
    guard += 1;
    let start = -1;
    let matched = '';

    for (const name of names) {
      const found = nextFor(name, index);
      if (found === -1) continue;
      if (start === -1 || found < start || (found === start && name.length > matched.length)) {
        start = found;
        matched = name;
      }
    }
    if (start === -1) return;

    const nameEnd = start + matched.length + 1;
    if (!isNameBoundary(lower.charAt(nameEnd))) {
      // Advance by one character only: a longer name may start right here.
      index = start + 1;
      continue;
    }

    const openEnd = lower.indexOf('>', nameEnd);
    if (openEnd === -1) return;

    yield { name: matched, start, openEnd, selfClosing: markup.charAt(openEnd - 1) === '/' };
    index = openEnd + 1;
  }
}

/** Removes a whole element, tags and content, wherever it appears. */
function removeBlock(markup: string, tag: string): string {
  const lower = markup.toLowerCase();
  const open = `<${tag}`;
  const close = `</${tag}`;
  let output = '';
  let index = 0;
  let guard = 0;

  while (guard < MAX_ITERATIONS) {
    guard += 1;
    const start = lower.indexOf(open, index);
    if (start === -1) break;

    const nameEnd = start + open.length;
    if (!isNameBoundary(lower.charAt(nameEnd))) {
      output += markup.slice(index, nameEnd);
      index = nameEnd;
      continue;
    }

    output += markup.slice(index, start);

    const closeStart = lower.indexOf(close, nameEnd);
    if (closeStart === -1) {
      index = markup.length;
      break;
    }
    const closeEnd = lower.indexOf('>', closeStart);
    index = closeEnd === -1 ? markup.length : closeEnd + 1;
  }

  return output + markup.slice(index);
}

export function stripHiddenBlocks(markup: string): string {
  let result = markup;
  for (const tag of HIDDEN_BLOCK_TAGS) {
    result = removeBlock(result, tag);
  }
  return result;
}

export function stripComments(markup: string): string {
  let output = '';
  let index = 0;
  let guard = 0;
  while (guard < MAX_ITERATIONS) {
    guard += 1;
    const start = markup.indexOf('<!--', index);
    if (start === -1) break;
    output += markup.slice(index, start);
    const end = markup.indexOf('-->', start + 4);
    if (end === -1) return output;
    index = end + 3;
  }
  return output + markup.slice(index);
}

/** CDATA carries real content, so it is unwrapped rather than dropped. */
export function unwrapCdata(markup: string): string {
  let output = '';
  let index = 0;
  let guard = 0;
  while (guard < MAX_ITERATIONS) {
    guard += 1;
    const start = markup.indexOf('<![CDATA[', index);
    if (start === -1) break;
    output += markup.slice(index, start);
    const end = markup.indexOf(']]>', start + 9);
    if (end === -1) return output + markup.slice(start + 9);
    output += markup.slice(start + 9, end);
    index = end + 3;
  }
  return output + markup.slice(index);
}

/**
 * Replaces every complete tag with a single space.
 *
 * Hand-rolled instead of `/<[^>]*>/g`: that pattern backtracks across the whole
 * remaining string for each unclosed `<`, which is quadratic on input designed
 * to trigger it. An unclosed `<` is kept as literal text, so prose like
 * "5 < 10" is not silently truncated.
 */
export function stripTags(markup: string): string {
  let output = '';
  let index = 0;
  let guard = 0;
  while (guard < MAX_ITERATIONS) {
    guard += 1;
    const start = markup.indexOf('<', index);
    if (start === -1) break;
    const end = markup.indexOf('>', start + 1);
    if (end === -1) break;
    output += `${markup.slice(index, start)} `;
    index = end + 1;
  }
  return output + markup.slice(index);
}

export function decodeEntities(value: string): string {
  return value.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g,
    (match: string, entity: string) => {
      if (entity.startsWith('#')) {
        const hex = entity.charAt(1).toLowerCase() === 'x';
        const digits = hex ? entity.slice(2) : entity.slice(1);
        const code = Number.parseInt(digits, hex ? 16 : 10);
        if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return '';
        if (code >= 0xd800 && code <= 0xdfff) return '';
        return String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Markup in, plain readable text out. Hidden blocks never contribute.
 *
 * Feeds routinely ship HTML escaped inside an XML element, so tags are stripped
 * once, entities decoded, and tags stripped again if the decode revealed more.
 */
export function cleanText(markup: string): string {
  const visible = stripHiddenBlocks(stripComments(unwrapCdata(markup)));
  const once = decodeEntities(stripTags(visible));
  const twice = once.includes('<') ? stripTags(stripHiddenBlocks(once)) : once;
  return collapseWhitespace(twice);
}

export function readAttribute(tag: string, attribute: string): string | undefined {
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const match = pattern.exec(tag);
  if (!match) return undefined;
  const raw = match[1] ?? match[2] ?? match[3];
  return raw === undefined ? undefined : decodeEntities(raw);
}

/** Opening tags for the given names, in document order. */
export function findOpenTags(
  markup: string,
  names: readonly string[],
  limit = DEFAULT_ELEMENT_LIMIT,
): string[] {
  const tags: string[] = [];
  for (const match of scanOpenTags(markup, names)) {
    if (tags.length >= limit) break;
    tags.push(markup.slice(match.start, match.openEnd + 1));
  }
  return tags;
}

/**
 * Elements for the given names, in document order, with their inner markup.
 *
 * Same-name nesting is not modelled; none of the elements we read (feed items,
 * paragraphs, articles) legitimately nest inside themselves.
 */
export function extractElements(
  markup: string,
  names: readonly string[],
  limit = DEFAULT_ELEMENT_LIMIT,
): MarkupElement[] {
  const lower = markup.toLowerCase();
  const elements: MarkupElement[] = [];

  for (const match of scanOpenTags(markup, names)) {
    if (elements.length >= limit) break;

    if (match.selfClosing) {
      elements.push({
        name: match.name,
        outer: markup.slice(match.start, match.openEnd + 1),
        inner: '',
      });
      continue;
    }

    const closeStart = lower.indexOf(`</${match.name}`, match.openEnd);
    if (closeStart === -1) {
      elements.push({
        name: match.name,
        outer: markup.slice(match.start),
        inner: markup.slice(match.openEnd + 1),
      });
      break;
    }
    const closeEnd = lower.indexOf('>', closeStart);
    const end = closeEnd === -1 ? markup.length : closeEnd + 1;
    elements.push({
      name: match.name,
      outer: markup.slice(match.start, end),
      inner: markup.slice(match.openEnd + 1, closeStart),
    });
  }

  return elements;
}

export function firstElement(markup: string, names: readonly string[]): MarkupElement | undefined {
  return extractElements(markup, names, 1)[0];
}

/** Cleaned text of the first matching element, or an empty string. */
export function elementText(markup: string, names: readonly string[]): string {
  const element = firstElement(markup, names);
  return element ? cleanText(element.inner) : '';
}

/**
 * Resolves a possibly relative reference and refuses anything that is not a
 * plain HTTP(S) URL, so `javascript:` and `data:` payloads can never reach the
 * database or the UI.
 */
export function safeAbsoluteUrl(value: string | undefined, base: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = decodeEntities(value).trim();
  if (trimmed === '') return undefined;
  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.username !== '' || url.password !== '') return undefined;
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}
