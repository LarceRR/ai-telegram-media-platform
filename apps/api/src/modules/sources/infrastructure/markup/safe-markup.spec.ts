import {
  cleanText,
  collapseWhitespace,
  decodeEntities,
  elementText,
  extractElements,
  findOpenTags,
  readAttribute,
  safeAbsoluteUrl,
  stripComments,
  stripHiddenBlocks,
  stripTags,
  unwrapCdata,
} from './safe-markup';

describe('safe markup reading', () => {
  it('drops script, style and embed payloads entirely', () => {
    const markup =
      '<p>keep</p><script>steal(document.cookie)</script><style>.a{color:red}</style><iframe src="http://evil.test"></iframe>';
    const stripped = stripHiddenBlocks(markup);
    expect(stripped).not.toContain('steal');
    expect(stripped).not.toContain('color:red');
    expect(stripped).not.toContain('evil.test');
    expect(cleanText(markup)).toBe('keep');
  });

  it('does not confuse a prefixed tag name with a hidden block', () => {
    expect(cleanText('<scripted>visible</scripted>')).toBe('visible');
  });

  it('survives an unterminated hidden block without leaking it', () => {
    expect(cleanText('<p>before</p><script>while(true){}')).toBe('before');
  });

  it('keeps an unclosed angle bracket as text instead of truncating', () => {
    expect(stripTags('5 < 10 and 2 > 1')).toBe('5 < 10 and 2 > 1'.replace('< 10 and 2 >', ' '));
    expect(cleanText('<p>price is 5 < 10</p>')).toBe('price is 5 < 10');
  });

  it('strips tags again after decoding escaped markup', () => {
    expect(cleanText('<summary>&lt;p&gt;Escaped &amp;amp; body&lt;/p&gt;</summary>')).toBe(
      'Escaped & body',
    );
  });

  it('removes comments and unwraps CDATA', () => {
    expect(stripComments('a<!-- hidden -->b')).toBe('ab');
    expect(unwrapCdata('<![CDATA[<b>bold</b>]]>')).toBe('<b>bold</b>');
    expect(cleanText('<description><![CDATA[<p>Hello &amp; welcome</p>]]></description>')).toBe(
      'Hello & welcome',
    );
  });

  it('decodes named and numeric entities and ignores unsafe code points', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &#65; &#x42;')).toBe('a & b <c> A B');
    expect(decodeEntities('&#xD800;')).toBe('');
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
  });

  it('collapses whitespace deterministically', () => {
    expect(collapseWhitespace('  a \n\t b  ')).toBe('a b');
  });

  it('reads quoted, single quoted and bare attributes', () => {
    const tag = '<img src="http://a.test/1.png" alt=\'first &amp; last\' width=10>';
    expect(readAttribute(tag, 'src')).toBe('http://a.test/1.png');
    expect(readAttribute(tag, 'alt')).toBe('first & last');
    expect(readAttribute(tag, 'width')).toBe('10');
    expect(readAttribute(tag, 'missing')).toBeUndefined();
  });

  it('extracts namespaced elements without matching a shared prefix', () => {
    const xml =
      '<content>plain</content><content:encoded>rich</content:encoded><summary>short</summary>';
    expect(elementText(xml, ['content:encoded'])).toBe('rich');
    expect(elementText(xml, ['content'])).toBe('plain');
    expect(extractElements(xml, ['content', 'content:encoded', 'summary'])).toHaveLength(3);
  });

  it('handles self-closing and unterminated elements', () => {
    const elements = extractElements('<link href="http://a.test"/><item>one', ['link', 'item']);
    expect(elements[0]?.inner).toBe('');
    expect(elements[1]?.inner).toBe('one');
  });

  it('respects the element budget', () => {
    const markup = '<item>x</item>'.repeat(50);
    expect(extractElements(markup, ['item'], 10)).toHaveLength(10);
    expect(findOpenTags(markup, ['item'], 5)).toHaveLength(5);
  });

  it('refuses non-HTTP references', () => {
    expect(safeAbsoluteUrl('javascript:alert(1)', 'https://a.test/')).toBeUndefined();
    expect(
      safeAbsoluteUrl('data:text/html;base64,PHNjcmlwdD4=', 'https://a.test/'),
    ).toBeUndefined();
    expect(safeAbsoluteUrl('https://user:pass@a.test/x', 'https://a.test/')).toBeUndefined();
    expect(safeAbsoluteUrl('', 'https://a.test/')).toBeUndefined();
    expect(safeAbsoluteUrl(undefined, 'https://a.test/')).toBeUndefined();
  });

  it('resolves relative references against the source URL and drops fragments', () => {
    expect(safeAbsoluteUrl('/a/b?c=1#frag', 'https://a.test/feed')).toBe('https://a.test/a/b?c=1');
  });

  it('stays fast on adversarial input', () => {
    const hostile = `${'<'.repeat(200_000)}<script>${'a'.repeat(200_000)}`;
    const started = Date.now();
    cleanText(hostile);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
