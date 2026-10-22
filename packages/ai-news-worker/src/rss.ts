export type RssItem = {
  sourceUrl: string;
  originalHeadline: string;
  description: string;
  suggestedMediaUrl: string | null;
  sourcePublishedAt: string | null;
};

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}
function field(xml: string, name: string) {
  const match = xml.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"),
  );
  return match ? decode(match[1] ?? "") : "";
}
function mediaSuggestion(block: string) {
  const tags =
    block.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const raw = tag
      .match(/\burl=["']([^"']+)["']/i)?.[1]
      ?.replace(/&amp;/g, "&");
    const type = tag.match(/\btype=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (
      !raw ||
      (type && !type.startsWith("image/") && !type.startsWith("video/"))
    )
      continue;
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" && !url.username && !url.password)
        return url.toString();
    } catch {
      /* Ignore malformed publisher media metadata. */
    }
  }
  return null;
}
export function parseRss(xml: string): RssItem[] {
  if (!/<rss\b|<feed\b/i.test(xml)) throw new Error("UNSUPPORTED_FEED");
  const blocks =
    xml.match(
      /<item\b[^>]*>[\s\S]*?<\/item>|<entry\b[^>]*>[\s\S]*?<\/entry>/gi,
    ) ?? [];
  return blocks.slice(0, 100).flatMap((block) => {
    const atomLink = block.match(
      /<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i,
    )?.[1];
    const link = field(block, "link") || atomLink || "";
    const title = field(block, "title");
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return [];
    }
    if (url.protocol !== "https:" || title.length < 5) return [];
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    const rawDate =
      field(block, "pubDate") ||
      field(block, "published") ||
      field(block, "updated");
    const parsedDate = rawDate ? new Date(rawDate) : null;
    return [
      {
        sourceUrl: url.toString(),
        originalHeadline: title.slice(0, 500),
        description: (
          field(block, "description") || field(block, "summary")
        ).slice(0, 5000),
        suggestedMediaUrl: mediaSuggestion(block),
        sourcePublishedAt:
          parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate.toISOString()
            : null,
      },
    ];
  });
}
