import {
  bigrams,
  canonicalizeText,
  canonicalizeUrl,
  contentHash,
  extractEntities,
  extractTopics,
  jaccard,
  tokenize,
  truncateOnWord,
} from './text';

describe('text canonicalization', () => {
  it('folds case, punctuation and whitespace into one form', () => {
    expect(canonicalizeText('  The  Bank\u2019s rate -- raised! ')).toBe('the bank s rate raised');
  });

  it('gives the same hash to formatting variants of the same text', () => {
    expect(contentHash('Rate raised to 5%')).toBe(contentHash('  rate   raised to 5% '));
  });

  it('gives different hashes to different facts', () => {
    expect(contentHash('Rate raised to 5%')).not.toBe(contentHash('Rate raised to 6%'));
  });

  it('drops stopwords and single characters from tokens', () => {
    expect(tokenize('The central bank of a country')).toEqual(['central', 'bank', 'country']);
  });

  it('keeps word order visible through bigrams', () => {
    expect(bigrams(['bank', 'raises', 'rate'])).toEqual(['bank raises', 'raises rate']);
  });
});

describe('entity and topic extraction', () => {
  it('keeps names that appear mid-sentence', () => {
    const entities = extractEntities('The regulator fined Acme Corp today. Acme Corp appealed.');
    expect(entities).toContain('acme');
    expect(entities).toContain('corp');
  });

  it('ignores a word that is only capitalized because it opens a sentence', () => {
    expect(extractEntities('Yesterday the market fell sharply.')).not.toContain('yesterday');
  });

  it('ranks topics by frequency and breaks ties predictably', () => {
    const topics = extractTopics('rate rate rate inflation inflation bank', 3);
    expect(topics).toEqual(['rate', 'inflation', 'bank']);
  });
});

describe('canonical urls', () => {
  it('strips tracking parameters, fragments and www', () => {
    expect(canonicalizeUrl('https://www.News.test/a/?utm_source=tg&id=7#top')).toBe(
      'https://news.test/a?id=7',
    );
  });

  it('treats reordered query parameters as the same link', () => {
    expect(canonicalizeUrl('https://news.test/a?b=2&a=1')).toBe(
      canonicalizeUrl('https://news.test/a?a=1&b=2'),
    );
  });

  it('does not throw on an unparseable value', () => {
    expect(canonicalizeUrl('  NOT a url ')).toBe('not a url');
  });
});

describe('overlap and truncation', () => {
  it('scores identical sets as 1 and disjoint sets as 0', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(jaccard(['a'], ['b'])).toBe(0);
  });

  it('treats an empty side as no evidence rather than a perfect match', () => {
    expect(jaccard([], [])).toBe(0);
  });

  it('never cuts a summary mid-word', () => {
    expect(truncateOnWord('the central bank raised rates again', 20)).toBe('the central bank');
  });
});
