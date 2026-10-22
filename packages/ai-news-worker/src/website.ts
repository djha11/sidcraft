import type { RssItem } from "./rss.js";

function decode(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}
function text(value: string) {
  return decode(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
function attribute(tag: string, name: string) {
  return decode(
    tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ??
      "",
  );
}
function meta(html: string, name: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (
      attribute(tag, "property").toLowerCase() === name ||
      attribute(tag, "name").toLowerCase() === name
    )
      return attribute(tag, "content");
  }
  return "";
}
function httpsUrl(raw: string, base: URL) {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}
/** Homepage discovery is deliberately same-origin and bounded; no site-wide crawl. */
export function discoverArticleUrls(html: string, base: URL, limit = 6) {
  const seen = new Set<string>();
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const url = httpsUrl(attribute(tag, "href"), base);
    if (!url || url.origin !== base.origin || url.pathname === base.pathname)
      continue;
    if (
      !/\/(?:20\d{2}\/|news\/|article[s]?\/|story\/|press[-/]release[s]?\/)/i.test(
        url.pathname,
      )
    )
      continue;
    seen.add(url.toString());
    if (seen.size >= limit) break;
  }
  return [...seen];
}
export function parseArticlePage(html: string, url: URL): RssItem | null {
  const headline = text(
    meta(html, "og:title") ||
      html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
      html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
      "",
  );
  if (headline.length < 5) return null;
  const article =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    "";
  const clean = article
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const paragraphs = [...clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => text(match[1] ?? ""))
    .filter((part) => part.length >= 40)
    .slice(0, 5);
  const description = (
    paragraphs.join(" ") ||
    text(meta(html, "og:description") || meta(html, "description"))
  ).slice(0, 5000);
  if (description.length < 10) return null;
  const suggested = httpsUrl(
    meta(html, "og:video:secure_url") ||
      meta(html, "og:video") ||
      meta(html, "og:image:secure_url") ||
      meta(html, "og:image"),
    url,
  );
  const date =
    meta(html, "article:published_time") ||
    html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1];
  const parsedDate = date ? new Date(date) : null;
  return {
    sourceUrl: url.toString(),
    originalHeadline: headline.slice(0, 500),
    description,
    suggestedMediaUrl: suggested?.toString() ?? null,
    sourcePublishedAt:
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString()
        : null,
  };
}

/** Conservative robots.txt parser for SidCraftNewsBot and wildcard groups. */
export function robotsAllows(body: string, path: string) {
  type Rule = { allow: boolean; path: string };
  const groups: Array<{ agents: string[]; rules: Rule[] }> = [];
  let group: { agents: string[]; rules: Rule[] } = { agents: [], rules: [] };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.split("#", 1)[0]?.trim() ?? "";
    const match = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!match) continue;
    const key = match[1]!.toLowerCase(),
      value = match[2]!.trim();
    if (key === "user-agent") {
      if (group.rules.length) {
        groups.push(group);
        group = { agents: [], rules: [] };
      }
      group.agents.push(value.toLowerCase());
    } else if (group.agents.length && value)
      group.rules.push({ allow: key === "allow", path: value });
  }
  groups.push(group);
  const specific = groups.filter(
    (item) =>
      item.agents.includes("sidcraftnewsbot") ||
      item.agents.includes("pulsenewsbot"),
  );
  const selected = specific.length
    ? specific
    : groups.filter((item) => item.agents.includes("*"));
  const matched = selected
    .flatMap((item) => item.rules)
    .filter((rule) => {
      const pattern = rule.path
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\$$/, "$");
      try {
        return new RegExp(`^${pattern}`).test(path);
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) =>
        b.path.replace(/[*$]/g, "").length -
          a.path.replace(/[*$]/g, "").length ||
        Number(b.allow) - Number(a.allow),
    );
  return matched[0]?.allow ?? true;
}
