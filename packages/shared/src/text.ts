import { createHash } from 'node:crypto';

/**
 * Deterministic text canonicalization for Smart Memory.
 *
 * Every comparison in M3 (hash equality, entity overlap, embeddings) has to see
 * the same normalization, otherwise two representations of the same article
 * disagree about whether they are the same article. That is why this lives in
 * one shared place instead of being reimplemented per module.
 */

const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'об', 'об', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'for',
  'from', 'had', 'has', 'have', 'her', 'his', 'how', 'its', 'not', 'now', 'off', 'one',
  'our', 'out', 'she', 'that', 'the', 'their', 'them', 'then', 'they', 'this', 'those',
  'was', 'were', 'what', 'when', 'which', 'who', 'will', 'with', 'you', 'your',
  'без', 'был', 'была', 'были', 'было', 'быть', 'вам', 'вас', 'ведь', 'весь', 'вот',
  'все', 'всех', 'где', 'даже', 'для', 'его', 'ему', 'если', 'есть', 'еще', '같',
  'или', 'как', 'кто', 'меня', 'может', 'над', 'надо', 'наш', 'него', 'нее', 'ней',
  'нет', 'них', 'ничего', 'потом', 'потому', 'при', 'про', 'себя', 'сейчас', 'так',
  'такой', 'там', 'тем', 'тоже', 'тот', 'тут', 'уже', 'чего', 'чем', 'что', 'чтобы',
  'эта', 'эти', 'это', 'этого', 'этом', 'этот',
]);

const CAPITALIZED = /\p{Lu}[\p{L}\p{N}'\u2019-]*/gu;

/**
 * Tracking parameters carry no meaning but change the URL, so two links to the
 * same article would otherwise never match on canonical URL.
 */
const TRACKING_PARAM =
  /^(?:utm_[a-z_]*|ref|referrer|source|fbclid|gclid|yclid|igshid|mc_cid|mc_eid|_ga|spm)$/i;

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function canonicalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenize(value: string, options: { keepStopwords?: boolean } = {}): string[] {
  const canonical = canonicalizeText(value);
  if (canonical === '') return [];
  const tokens = canonical.split(' ');
  if (options.keepStopwords === true) return tokens;
  return tokens.filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

/**
 * Adjacent token pairs. Without them "bank raises rate" and "rate raises bank"
 * embed identically, which is exactly the kind of false duplicate that blocks
 * legitimate content.
 */
export function bigrams(tokens: readonly string[]): string[] {
  const pairs: string[] = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const left = tokens[index - 1];
    const right = tokens[index];
    if (left !== undefined && right !== undefined) pairs.push(`${left} ${right}`);
  }
  return pairs;
}

/**
 * Capitalized terms, minus the ones that are only capitalized because they open
 * a sentence. A term still counts if it appears more than once, since a real
 * name tends to recur while a sentence opener usually does not.
 */
export function extractEntities(value: string, limit = 20): string[] {
  const counts = new Map<string, number>();
  const midSentence = new Set<string>();

  for (const match of value.matchAll(CAPITALIZED)) {
    const token = canonicalizeText(match[0]);
    if (token.length < 3 || STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
    if (!opensSentence(value, match.index ?? 0)) midSentence.add(token);
  }

  const eligible = new Map<string, number>();
  for (const [token, count] of counts) {
    if (midSentence.has(token) || count > 1) eligible.set(token, count);
  }
  return rankByCount(eligible, limit);
}

/** Most frequent meaningful tokens. Ties break alphabetically to stay stable. */
export function extractTopics(value: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenize(value)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return rankByCount(counts, limit);
}

/**
 * Best-effort. An unparseable value is returned lowercased rather than thrown
 * away: a bad URL must not be able to abort ingestion of a good article.
 */
export function canonicalizeUrl(value: string): string {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = '';
  }

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(comparePairs);
  url.search = '';
  for (const [key, entry] of params) url.searchParams.append(key, entry);

  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

/** Content identity. Two items with the same hash are the same text. */
export function contentHash(value: string): string {
  return createHash('sha256').update(canonicalizeText(value)).digest('hex');
}

/** Set overlap in [0, 1]. Empty on either side means no evidence, so zero. */
export function jaccard(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const a = new Set(left);
  const b = new Set(right);
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Cuts on a word boundary so a summary never ends mid-word. */
export function truncateOnWord(value: string, maxChars: number): string {
  const collapsed = value.trim().replace(/\s+/g, ' ');
  if (collapsed.length <= maxChars) return collapsed;
  const clipped = collapsed.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd();
}

function opensSentence(text: string, index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = text[cursor];
    if (char === undefined) return true;
    if (/\s/.test(char)) continue;
    return char === '.' || char === '!' || char === '?' || char === ':' || char === '"';
  }
  return true;
}

function rankByCount(counts: ReadonlyMap<string, number>, limit: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1] !== 0 ? b[1] - a[1] : compare(a[0], b[0])))
    .slice(0, Math.max(0, limit))
    .map(([token]) => token);
}

function comparePairs(a: readonly [string, string], b: readonly [string, string]): number {
  const byKey = compare(a[0], b[0]);
  return byKey !== 0 ? byKey : compare(a[1], b[1]);
}

/** Codepoint order, not locale order: CI and production must agree. */
function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
