import { describe, expect, it } from "vitest";
import { parseSourceImport } from "./source-import";

describe("parseSourceImport", () => {
  it("accepts 100 categorized HTTPS feeds", () => {
    const rows = Array.from(
      { length: 100 },
      (_, index) =>
        `Channel ${index} | https://example.org/feed/${index}.xml | stocks | 30`,
    );
    expect(parseSourceImport(rows.join("\n"))).toHaveLength(100);
  });
  it("rejects oversized, unsafe, and uncategorized imports", () => {
    expect(() =>
      parseSourceImport(
        Array(101).fill("Channel | https://example.org/rss | world").join("\n"),
      ),
    ).toThrow("SOURCE_IMPORT_COUNT");
    expect(() =>
      parseSourceImport("Channel | http://example.org/rss | world"),
    ).toThrow("SOURCE_IMPORT_ROW");
    expect(() =>
      parseSourceImport("Channel | https://example.org/rss | mystery"),
    ).toThrow("SOURCE_IMPORT_ROW");
  });
  it("defaults new approved feeds to a two-minute check", () => {
    expect(
      parseSourceImport("Official | https://example.org/rss | world")[0]
        ?.pollingMinutes,
    ).toBe(2);
  });
});
