import { lookup } from "node:dns/promises";
import { parseRss } from "./rss.js";
import { publicAddress } from "./network.js";
import {
  discoverArticleUrls,
  parseArticlePage,
  robotsAllows,
} from "./website.js";

type Source = {
  id: string;
  name: string;
  feedUrl: string;
  enabled: boolean;
  pollingMinutes: number;
  lastFetchedAt: string | null;
  lastError: string | null;
};
const apiUrl = process.env.PULSE_API_URL ?? "http://127.0.0.1:4000";
const key = process.env.ADMIN_API_KEY;
if (!key || key.length < 32) throw new Error("ADMIN_API_KEY_REQUIRED");
const headers = {
  "x-pulse-admin-key": key,
  "content-type": "application/json",
};

async function api<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`PULSE_API_${response.status}`);
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
async function safeFeedUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("UNSAFE_FEED_URL");
  const answers = await lookup(url.hostname, { all: true });
  if (
    !answers.length ||
    answers.some((answer) => !publicAddress(answer.address))
  )
    throw new Error("PRIVATE_FEED_ADDRESS");
  return url;
}
async function fetchPage(url: URL, accept: string) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { accept, "user-agent": "SidCraftNewsBot/1.0" },
  });
  if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 2_000_000) throw new Error("SOURCE_TOO_LARGE");
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error("SOURCE_TOO_LARGE");
  return { body, contentType: response.headers.get("content-type") ?? "" };
}
async function checkRobots(url: URL) {
  const robots = new URL("/robots.txt", url);
  const response = await fetch(robots, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
    headers: { "user-agent": "SidCraftNewsBot/1.0" },
  });
  if (response.status === 404) return "";
  if (!response.ok) throw new Error(`ROBOTS_HTTP_${response.status}`);
  const body = await response.text();
  if (body.length > 500_000) throw new Error("ROBOTS_TOO_LARGE");
  if (!robotsAllows(body, url.pathname)) throw new Error("ROBOTS_DISALLOWED");
  return body;
}
export async function runOnce(force = false) {
  const control = await api<{ paused: boolean }>("/v1/admin/ai-news/control");
  if (control.paused) return;
  const sources = await api<{ items: Source[] }>("/v1/admin/ai-news/sources");
  for (const source of sources.items.filter((item) => item.enabled)) {
    const due =
      force ||
      Boolean(source.lastError) ||
      !source.lastFetchedAt ||
      Date.now() - new Date(source.lastFetchedAt).getTime() >=
        source.pollingMinutes * 60_000;
    if (!due) continue;
    let error: string | null = null;
    try {
      const url = await safeFeedUrl(source.feedUrl);
      const robots = await checkRobots(url);
      const page = await fetchPage(
        url,
        "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html",
      );
      let items;
      if (/<rss\b|<feed\b/i.test(page.body.slice(0, 2000))) {
        items = parseRss(page.body).slice(0, 6);
      } else if (
        /text\/html/i.test(page.contentType) ||
        /<!doctype html|<html\b/i.test(page.body.slice(0, 2000))
      ) {
        const links = discoverArticleUrls(page.body, url, 6);
        if (!links.length && url.pathname !== "/") links.push(url.toString());
        items = [];
        for (const link of links) {
          try {
            const articleUrl = await safeFeedUrl(link);
            if (
              articleUrl.origin !== url.origin ||
              !robotsAllows(robots, articleUrl.pathname)
            )
              continue;
            const article = await fetchPage(articleUrl, "text/html");
            if (!/text\/html/i.test(article.contentType)) continue;
            const item = parseArticlePage(article.body, articleUrl);
            if (item) items.push(item);
          } catch (cause) {
            console.warn(
              JSON.stringify({
                stage: "article_skipped",
                sourceId: source.id,
                error: cause instanceof Error ? cause.message : "UNKNOWN_ERROR",
              }),
            );
          }
        }
      } else throw new Error("UNSUPPORTED_SOURCE_FORMAT");
      // Bound first-time cloud drafting and review load for each feed poll.
      for (const item of items) {
        await api(
          `/v1/internal/ai-news/sources/${source.id}/candidates`,
          {
            method: "POST",
            body: JSON.stringify(item),
          },
          135_000,
        );
      }
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message.slice(0, 500)
          : "UNKNOWN_SOURCE_ERROR";
      console.error(
        JSON.stringify({
          stage: "ingestion",
          sourceId: source.id,
          status: "failed",
          error,
        }),
      );
    }
    await api(`/v1/internal/ai-news/sources/${source.id}/fetch`, {
      method: "PUT",
      body: JSON.stringify({ error }),
    });
  }
}

if (/\/main\.(ts|js)$/.test(process.argv[1]?.replaceAll("\\", "/") ?? "")) {
  const once = process.argv.includes("--once");
  do {
    try {
      await runOnce(process.argv.includes("--force"));
    } catch (cause) {
      console.error(
        JSON.stringify({
          stage: "worker_loop",
          status: "failed",
          error: cause instanceof Error ? cause.message : "UNKNOWN_ERROR",
        }),
      );
      if (once) process.exitCode = 1;
    }
    if (!once) await new Promise((resolve) => setTimeout(resolve, 60_000));
  } while (!once);
}
