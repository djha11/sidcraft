import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = [
  "apps/mobile/src/tab-screen.tsx",
  "apps/mobile/app/_layout.tsx",
  "apps/mobile/app/index.tsx",
  "apps/mobile/app/login.tsx",
  "apps/mobile/app/register.tsx",
  "apps/mobile/app/forgot-password.tsx",
  "apps/mobile/app/pulse.tsx",
  "apps/mobile/app/trending.tsx",
  "apps/mobile/app/(tabs)/_layout.tsx",
  "apps/mobile/app/(tabs)/pulse.tsx",
  "apps/mobile/app/(tabs)/feed.tsx",
  "apps/mobile/app/(tabs)/news.tsx",
  "apps/mobile/app/(tabs)/chat.tsx",
  "apps/mobile/app/(tabs)/search.tsx",
  "apps/mobile/app/(tabs)/profile.tsx",
];
const accent = ["#caff55", "#bfff46", "#baff32", "#c8ff3d", "#9cff22"];
const lightText = [
  "#f5f6f8",
  "#f6f7fa",
  "#f7f8fa",
  "#eef1f5",
  "#edf0f5",
  "#e9ecf1",
  "#dce1e8",
  "#d9dde5",
  "#e4e8ee",
  "#aeb5c0",
  "#aeb6c3",
  "#a9b0bc",
];
const muted = [
  "#9299a7",
  "#929aaa",
  "#8b95a5",
  "#8993a4",
  "#828b9c",
  "#818b9c",
  "#7f8999",
  "#7f8794",
  "#7d8797",
  "#778193",
  "#747e8f",
  "#737b89",
  "#737d8e",
  "#6f7889",
  "#6f7888",
  "#687180",
  "#687183",
  "#596272",
  "#545e70",
];
const backgrounds = ["#0b0d12", "#000017", "#020218", "#050608"];
const surfaces = [
  "#11151c",
  "#11151d",
  "#11161d",
  "#151a22",
  "#151923",
  "#171b23",
  "#171c24",
  "#171c25",
  "#1a2029",
  "#1c2430",
  "#1d2531",
  "#202630",
  "#202734",
];
const borders = [
  "#1d2230",
  "#202434",
  "#202532",
  "#252b35",
  "#262d3a",
  "#282e3d",
  "#29303d",
  "#293040",
  "#29313c",
  "#2a303c",
  "#303744",
  "#303846",
  "#303946",
  "#354053",
  "#394250",
  "#3a4350",
];
const extraSurfaces = [
  "#080a0f",
  "#090b10",
  "#10141b",
  "#10141c",
  "#10151c",
  "#111620",
  "#131722",
  "#131820",
  "#141820",
  "#141923",
  "#151922",
  "#151a24",
  "#151b23",
  "#171d26",
  "#181d26",
  "#192115",
  "#19231a",
  "#1b2029",
  "#1b202a",
  "#1b212a",
  "#1d242e",
  "#202732",
  "#202815",
  "#202833",
  "#202a19",
  "#222832",
  "#222a34",
  "#222a35",
  "#29351d",
  "#2a1c1e",
  "#2b3440",
  "#33451d",
];
const extraText = [
  "#f1f3f7",
  "#f3f5f8",
  "#e8eaf0",
  "#e8ebf0",
  "#e6e8ed",
  "#e2e5ea",
  "#dfe4eb",
  "#d9dde4",
  "#c8ced7",
  "#c4c9d1",
  "#b7bfcb",
];
const extraMuted = [
  "#aab0ba",
  "#aab2bf",
  "#a7afbb",
  "#a5adba",
  "#a1a9b4",
  "#9da5b2",
  "#9aa3b1",
  "#9aa3af",
  "#9aa3b2",
  "#99a2af",
  "#969eaa",
  "#939baa",
  "#929ba8",
  "#929baa",
  "#8f97a4",
  "#8f98a6",
  "#8d95a3",
  "#8d96a4",
  "#8d96a5",
  "#8c95a3",
  "#8b929e",
  "#8993a1",
  "#8892a0",
  "#858e9c",
  "#818a98",
  "#7f8896",
  "#7f8897",
  "#7f8998",
  "#7e8795",
  "#7e8797",
  "#7d8694",
  "#7c8491",
  "#78818e",
  "#788392",
  "#747d8a",
  "#747e8d",
  "#737b88",
  "#737c8b",
  "#737d8c",
  "#69717f",
  "#697382",
  "#66707e",
  "#626a78",
  "#56606f",
  "#46505d",
];
const extraBorders = [
  "#171b29",
  "#191e2b",
  "#202631",
  "#232a35",
  "#252b38",
  "#252c36",
  "#252c37",
  "#272d36",
  "#27303b",
  "#29303a",
  "#29313d",
  "#2a3039",
  "#2a313c",
  "#2b313c",
  "#2b323d",
  "#2b3340",
  "#2d3440",
  "#303947",
  "#33401f",
  "#343b48",
  "#343d49",
  "#343d4a",
  "#343e4c",
  "#353c49",
  "#36404e",
  "#394352",
  "#3a4351",
  "#3b4553",
  "#465427",
  "#4a5361",
  "#59616d",
];

const esc = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const file of files) {
  const path = resolve(root, file);
  let source = readFileSync(path, "utf8");
  const importPath = file.includes("/(tabs)/")
    ? "../../src/theme"
    : file.includes("/app/")
      ? "../src/theme"
      : "./theme";
  if (!source.includes('from "' + importPath + '"'))
    source = `import { palette } from "${importPath}";\n${source}`;
  for (const hex of accent) {
    source = source.replaceAll(`color="${hex}"`, "color={palette.accent}");
    source = source.replaceAll(`"${hex}"`, "palette.accent");
  }
  for (const hex of lightText) {
    source = source.replaceAll(`color="${hex}"`, "color={palette.text}");
    source = source.replaceAll(`"${hex}"`, "palette.text");
  }
  for (const hex of muted) {
    source = source.replaceAll(`color="${hex}"`, "color={palette.muted}");
    source = source.replaceAll(`"${hex}"`, "palette.muted");
  }
  for (const hex of backgrounds) {
    source = source.replace(
      new RegExp(`color:\\s*"${esc(hex)}"`, "gi"),
      "color: palette.onAccent",
    );
    source = source.replaceAll(`color="${hex}"`, "color={palette.onAccent}");
    source = source.replace(
      new RegExp(`borderColor:\\s*"${esc(hex)}"`, "gi"),
      "borderColor: palette.border",
    );
    source = source.replace(
      new RegExp(`backgroundColor:\\s*"${esc(hex)}"`, "gi"),
      "backgroundColor: palette.background",
    );
    source = source.replaceAll(`"${hex}"`, "palette.background");
  }
  for (const hex of surfaces) {
    source = source.replace(
      new RegExp(`color:\\s*"${esc(hex)}"`, "gi"),
      "color: palette.text",
    );
    source = source.replace(
      new RegExp(`borderColor:\\s*"${esc(hex)}"`, "gi"),
      "borderColor: palette.borderSoft",
    );
    source = source.replace(
      new RegExp(`backgroundColor:\\s*"${esc(hex)}"`, "gi"),
      "backgroundColor: palette.surface",
    );
    source = source.replaceAll(`"${hex}"`, "palette.surface");
  }
  for (const hex of borders)
    source = source.replaceAll(`"${hex}"`, "palette.borderSoft");
  for (const hex of extraSurfaces)
    source = source.replaceAll(`"${hex}"`, "palette.surface");
  for (const hex of extraText)
    source = source.replaceAll(`"${hex}"`, "palette.text");
  for (const hex of extraMuted)
    source = source.replaceAll(`"${hex}"`, "palette.muted");
  for (const hex of extraBorders)
    source = source.replaceAll(`"${hex}"`, "palette.borderSoft");
  source = source.replaceAll('"#071000"', "palette.onAccent");
  source = source.replaceAll('"#caff5520"', "palette.accentSoft");
  if (
    ![
      "apps/mobile/app/(tabs)/feed.tsx",
      "apps/mobile/app/(tabs)/news.tsx",
      "apps/mobile/app/(tabs)/profile.tsx",
    ].includes(file)
  ) {
    source = source.replaceAll('color="#fff"', "color={palette.text}");
    source = source.replaceAll('"#fff"', "palette.text");
  }
  source = source.replaceAll('color="#111"', "color={palette.onAccent}");
  source = source.replace(/color:\s*"#111"/g, "color: palette.onAccent");
  source = source.replace(
    /backgroundColor:\s*"#111"/g,
    "backgroundColor: palette.surfaceStrong",
  );
  source = source.replaceAll('"#111"', "palette.text");
  source = source.replace(/=palette\.([A-Za-z]+)/g, "={palette.$1}");
  source = source.replaceAll("backgroundcolor", "backgroundColor");
  source = source.replaceAll("bordercolor", "borderColor");
  source = source.replaceAll("borderBottomcolor", "borderBottomColor");
  source = source.replaceAll(
    "backgroundColor: palette.onAccent",
    "backgroundColor: palette.background",
  );
  source = source.replaceAll(
    "backgroundColor: palette.text",
    "backgroundColor: palette.surfaceStrong",
  );
  source = source.replaceAll(
    "borderColor: palette.onAccent",
    "borderColor: palette.border",
  );
  source = source.replaceAll(
    "borderColor: palette.text",
    "borderColor: palette.border",
  );
  writeFileSync(path, source);
}
