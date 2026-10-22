const categories = new Set([
  "india",
  "world",
  "politics",
  "business",
  "stocks",
  "tech",
  "sports",
  "entertainment",
]);

export function parseSourceImport(input: string) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length || lines.length > 100)
    throw new Error("SOURCE_IMPORT_COUNT");
  return lines.map((line) => {
    const columns = line.split("|").map((value) => value.trim());
    if (columns.length < 3 || columns.length > 4)
      throw new Error("SOURCE_IMPORT_ROW");
    const [name, feedUrl, category, interval] = columns;
    const pollingMinutes = interval ? Number(interval) : 2;
    let url: URL;
    try {
      url = new URL(feedUrl ?? "");
    } catch {
      throw new Error("SOURCE_IMPORT_URL");
    }
    if (
      !name ||
      name.length < 2 ||
      name.length > 120 ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !categories.has(category ?? "") ||
      !Number.isInteger(pollingMinutes) ||
      pollingMinutes < 2 ||
      pollingMinutes > 1440
    ) {
      throw new Error("SOURCE_IMPORT_ROW");
    }
    return { name, feedUrl, category, pollingMinutes };
  });
}
