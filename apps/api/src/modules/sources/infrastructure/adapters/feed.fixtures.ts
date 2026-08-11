/** Fixtures for adapter contract tests. Excluded from the build output. */

export const FEED_URL = 'https://feed.test/rss.xml';
export const PAGE_URL = 'https://web.test/article?utm_source=x';

export const RSS_2_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Example feed</title>
    <link>https://feed.test/</link>
    <item>
      <title>First &amp; foremost</title>
      <link>https://feed.test/posts/1</link>
      <guid isPermaLink="false">post-1</guid>
      <pubDate>Mon, 10 Aug 2026 09:00:00 GMT</pubDate>
      <dc:creator>Ada Lovelace</dc:creator>
      <description><![CDATA[<p>Summary with <b>markup</b> and <img src="/img/one.png" alt="One"></p><script>steal(document.cookie)</script>]]></description>
      <enclosure url="https://cdn.feed.test/one.jpg" type="image/jpeg" length="1024"/>
      <enclosure url="https://cdn.feed.test/audio.mp3" type="audio/mpeg" length="2048"/>
      <media:thumbnail url="https://cdn.feed.test/thumb.jpg"/>
    </item>
    <item>
      <title>Second</title>
      <link>/posts/2</link>
      <pubDate>Tue, 11 Aug 2026 09:00:00 GMT</pubDate>
      <content:encoded><![CDATA[<p>Richer body</p>]]></content:encoded>
      <description>Ignored when content:encoded exists</description>
    </item>
  </channel>
</rss>`;

export const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom feed</title>
  <entry>
    <title>Atom entry</title>
    <id>urn:uuid:9f1c</id>
    <link rel="edit" href="https://atom.test/edit/1"/>
    <link rel="alternate" href="https://atom.test/entry/1"/>
    <updated>2026-08-10T12:00:00Z</updated>
    <author><name>Grace Hopper</name></author>
    <summary type="html">&lt;p&gt;Escaped &amp;amp; summary&lt;/p&gt;</summary>
  </entry>
</feed>`;

/** One entry is unusable, the other is fine: the good one must still land. */
export const PARTIALLY_BROKEN_FEED = `<rss version="2.0"><channel>
  <item>
    <title>No link here</title>
    <description>Body without any link</description>
  </item>
  <item>
    <title>Usable</title>
    <link>https://feed.test/posts/ok</link>
    <description>Body</description>
  </item>
</channel></rss>`;

export const EMPTY_FEED = `<rss version="2.0"><channel><title>Nothing here</title></channel></rss>`;

export const HTML_PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>Page &amp; title</title>
  <meta property="og:description" content="Deck copy for the page">
  <meta property="og:image" content="https://cdn.web.test/hero.jpg">
  <link rel="stylesheet" href="https://cdn.web.test/app.css">
  <link rel="canonical" href="https://web.test/article">
  <script>tracker('pageview')</script>
  <style>.headline { color: red }</style>
</head>
<body>
  <nav><p>Skip to content</p></nav>
  <article>
    <p>First paragraph.</p>
    <p>Second paragraph with &hellip; an ellipsis.</p>
    <img src="/img/inline.png" alt="Inline">
    <script>moreTracking()</script>
  </article>
</body>
</html>`;

export const HTML_PAGE_HOSTILE_CANONICAL = `<html><head>
  <title>Hostile canonical</title>
  <link rel="canonical" href="javascript:alert(document.domain)">
</head><body><article><p>Body text.</p><img src="data:image/png;base64,AAAA" alt="inline"></article></body></html>`;

export const HTML_PAGE_BLANK = `<html><head></head><body><div></div></body></html>`;
