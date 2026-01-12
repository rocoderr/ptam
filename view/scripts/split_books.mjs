#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RE_TOC_LINE =
  /^(?<indent>\s*)- \[(?<title>[^\]]+)\]\((?<path>[^)#]+)#(?<id>sec-[^)]+)\)\s*$/;
const RE_ANCHOR = /^<a id="(?<id>sec-[^"]+)"><\/a>\s*$/;

function readText(filePath) {
  return readFile(filePath, "utf8");
}

async function writeText(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

async function writeJson(filePath, obj) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const text = JSON.stringify(obj, null, 2) + "\n";
  await writeFile(filePath, text, "utf8");
}

function parseToc(tocMd) {
  const items = [];
  for (const line of tocMd.split("\n")) {
    const match = line.match(RE_TOC_LINE);
    if (!match) continue;
    const indent = match.groups.indent || "";
    const title = match.groups.title.trim();
    const id = match.groups.id.trim();

    const depth = Math.floor(indent.length / 2);
    if (depth !== 0 && depth !== 1) continue;
    items.push({ id, title, depth });
  }

  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`Duplicate TOC id: ${item.id}`);
    seen.add(item.id);
  }
  return items;
}

function extractTitlesByAnchor(bookMd) {
  const lines = bookMd.split("\n");
  const anchorIndex = indexAnchors(lines);
  const titleById = new Map();
  const headingRe = /^(#{2,6})\s+(?<title>.+)$/;
  for (const [id, start] of anchorIndex.entries()) {
    let title = null;
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const match = line.match(headingRe);
      if (match) {
        title = match.groups.title.trim();
      }
      break;
    }
    if (title) titleById.set(id, title);
  }
  return titleById;
}

function indexAnchors(lines) {
  const index = new Map();
  lines.forEach((line, i) => {
    const match = line.match(RE_ANCHOR);
    if (match) index.set(match.groups.id, i);
  });
  return index;
}

function ensureAllIds(items, anchorIndex, label) {
  const missing = items.filter((x) => !anchorIndex.has(x.id)).map((x) => x.id);
  if (missing.length) {
    const sample = missing.slice(0, 10).join(", ");
    throw new Error(
      `${label}: missing anchors: ${sample}${missing.length > 10 ? " ..." : ""}`
    );
  }
}

function sliceForItem(items, anchorIndex, lines, i) {
  const item = items[i];
  const start = anchorIndex.get(item.id);
  if (item.depth === 1) {
    const j = i + 1;
    const end = j < items.length ? anchorIndex.get(items[j].id) : lines.length;
    return [start, end];
  }

  let firstChildIdx = null;
  for (let j = i + 1; j < items.length; j++) {
    if (items[j].depth === 0) break;
    if (items[j].depth === 1) {
      firstChildIdx = j;
      break;
    }
  }
  if (firstChildIdx !== null) {
    return [start, anchorIndex.get(items[firstChildIdx].id)];
  }

  let nextChapterIdx = null;
  for (let j = i + 1; j < items.length; j++) {
    if (items[j].depth === 0) {
      nextChapterIdx = j;
      break;
    }
  }
  const end =
    nextChapterIdx !== null ? anchorIndex.get(items[nextChapterIdx].id) : lines.length;
  return [start, end];
}

function renderFrontMatter(title, lang) {
  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle} · Political Triple-Axis Model</title>
    <link rel="stylesheet" href="../assets/site.css" />
  </head>
  <body data-base="../">
    <div class="app">
      <aside class="sidebar">
        <div class="sidebar__top">
          <a class="brand" href="../index.html">Political Triple-Axis Model</a>
          <div class="lang">
            <a href="../zh/index.html">中文</a>
            <a href="../en/index.html">English</a>
            <a href="../axis/index.html">3D</a>
          </div>
        </div>
        <nav id="toc" class="toc" data-lang="${lang}"></nav>
      </aside>

      <main class="main">
        <article class="content" id="content"></article>
        <script type="text/markdown" id="md-source"></script>
      </main>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/markdown-it@13.0.1/dist/markdown-it.min.js"></script>
    <script src="../assets/markdown-render.js"></script>
    <script src="../assets/toc.js"></script>
  </body>
</html>`;
}

async function generateChapterFiles({ items, bookMd, outDir, lang }) {
  const lines = bookMd.split("\n");
  const anchorIndex = indexAnchors(lines);
  ensureAllIds(items, anchorIndex, `${lang} book`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const [start, end] = sliceForItem(items, anchorIndex, lines, i);
    const chunk = lines.slice(start, end).join("\n").trim() + "\n";
    const outPath = path.join(outDir, `${item.id}.html`);
    const html = renderFrontMatter(item.title, lang).replace(
      '<script type="text/markdown" id="md-source"></script>',
      `<script type="text/markdown" id="md-source">${chunk.replace(
        /<\/script>/g,
        "<\\/script>"
      )}</script>`
    );
    await writeText(outPath, html);
  }
}

function tocToJson(items) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    depth: item.depth,
  }));
}

const RE_PAIR = /^(?<zh>.+?)（(?<en>[^（）]+)）$/;
const RE_NUM_RANGE = /(?<a>[+\-−]?\d)\s*[～~-]\s*(?<b>[+\-−]?\d)/;
const RE_NUM_SINGLE = /(?<n>[+\-−]?\d)/g;

function normalizeMinus(s) {
  return s.replace(/−/g, "-");
}

function parseNamePair(s) {
  const value = s.trim();
  const match = value.match(RE_PAIR);
  if (!match) return [value, value];
  return [match.groups.zh.trim(), match.groups.en.trim()];
}

function parseAxisRange(text) {
  const t = normalizeMinus(text);
  const rangeMatch = t.match(RE_NUM_RANGE);
  if (rangeMatch) return [Number(rangeMatch.groups.a), Number(rangeMatch.groups.b)];

  const singles = [];
  let m;
  while ((m = RE_NUM_SINGLE.exec(t))) {
    singles.push(Number(m.groups.n));
  }
  if (singles.length) {
    const n = singles[singles.length - 1];
    return [n, n];
  }
  return null;
}

function extractTableAfterAnchor(bookMd, anchorId) {
  const lines = bookMd.split("\n");
  const anchorLine = `<a id="${anchorId}"></a>`;
  const start = lines.indexOf(anchorLine);
  if (start === -1) throw new Error(`Anchor not found for table extraction: ${anchorId}`);

  const tableLines = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.slice(1).includes("|")) {
      inTable = true;
      tableLines.push(line.trimEnd());
      continue;
    }
    if (inTable) break;
  }
  if (!tableLines.length) throw new Error(`No markdown table found after anchor: ${anchorId}`);
  return tableLines;
}

function parseMarkdownTable(tableLines) {
  const rows = [];
  for (const line of tableLines) {
    const raw = line.trim();
    if (!raw.startsWith("|") || !raw.endsWith("|")) continue;
    const parts = raw.slice(1, -1).split("|").map((x) => x.trim());
    rows.push(parts);
  }
  if (rows.length < 3) throw new Error("Table too small to parse.");
  return rows.slice(2);
}

function extractIdeologiesFromSec62(bookMd) {
  const tableLines = extractTableAfterAnchor(bookMd, "sec-6-2");
  const rows = parseMarkdownTable(tableLines);
  const items = [];

  for (const row of rows) {
    if (row.length < 5) continue;
    const [nameZh, nameEn] = parseNamePair(row[0]);
    const xText = row[1];
    const yText = row[2];
    const zText = row[3];
    const overlay = row[4];

    items.push({
      id: normalizeMinus(nameEn).toLowerCase().replace(/\s+/g, "-"),
      name: { zh: nameZh, en: nameEn },
      raw: { x: xText, y: yText, z: zText, overlay },
      range: {
        x: parseAxisRange(xText),
        y: parseAxisRange(yText),
        z: parseAxisRange(zText),
      },
    });
  }

  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`Duplicate ideology id in table: ${item.id}`);
    seen.add(item.id);
  }
  return items;
}

function ensureAnchorsExist(lines, anchorIds, label) {
  const anchorIndex = indexAnchors(lines);
  const missing = anchorIds.filter((id) => !anchorIndex.has(id));
  if (missing.length) {
    throw new Error(`${label}: missing anchors: ${missing.join(", ")}`);
  }
}

function extractIdeologiesFromSec7(bookMd) {
  const lines = bookMd.split("\n");
  const anchorIds = [
    "sec-7-1",
    "sec-7-2",
    "sec-7-3",
    "sec-7-4",
    "sec-7-5",
    "sec-7-6",
    "sec-7-7",
    "sec-7-8",
  ];
  ensureAnchorsExist(lines, anchorIds, "sec-7 ideologies");

  return [
    {
      id: "wokeism",
      name: { zh: "觉醒主义", en: "Wokeism" },
      raw: {
        x: "不稳定，更多是工具（−1～+1）",
        y: "中性到左（0～−2）：拒绝空间收缩与非国家强制",
        z: "强左（−3）：身份直接生成权利边界",
        overlay: "压迫者—被压迫者透镜（Oppressor–Oppressed Lens）；取消文化（Cancel Culture）",
      },
      range: { x: [-1, 1], y: [0, -2], z: [-3, -3] },
      group: "contemporary",
    },
    {
      id: "structural-antiracism",
      name: { zh: "当代反种族主义", en: "Structural Antiracism" },
      raw: {
        x: "中性到左（0～−2）：配额/补偿等工具性再分配",
        y: "中性到左（0～−2）：质疑更易被视为伤害",
        z: "左（−2）：群体历史处境生成权利边界",
        overlay: "压迫者—被压迫者透镜（Oppressor–Oppressed Lens）；取消文化（Cancel Culture）",
      },
      range: { x: [0, -2], y: [0, -2], z: [-2, -2] },
      group: "contemporary",
    },
    {
      id: "feminism",
      name: { zh: "当代女权主义", en: "Feminism" },
      raw: {
        x: "分叉明显（+1～−2）：规则内平权 vs 结构纠偏",
        y: "分叉明显（+1～−2）：拒绝空间是否被压缩",
        z: "分叉明显（+1～−3）：权利是否由身份直接生成",
        overlay: "觉醒主义化（Wokeism）；取消文化（Cancel Culture）",
      },
      range: { x: [1, -2], y: [1, -2], z: [1, -3] },
      group: "contemporary",
    },
    {
      id: "gender-politics",
      name: { zh: "性别政治", en: "Gender Politics" },
      raw: {
        x: "被动向左（0～−2）：制度执行成本牵引",
        y: "中性到左（0～−3）：拒绝空间按路径收缩",
        z: "左到极左（−2～−4）：性别认同成为权利边界",
        overlay: "性别自我认同（Gender Self-identification）；取消文化（Cancel Culture）",
      },
      range: { x: [0, -2], y: [0, -3], z: [-2, -4] },
      group: "contemporary",
    },
    {
      id: "anti-colonialism",
      name: { zh: "反殖民主义", en: "Anti-colonialism" },
      raw: {
        x: "中性到强左（0～−3）：补偿与再分配义务",
        y: "中性到左（0～−2）：责任拒绝被道德化",
        z: "中性到左（0～−3）：历史处境生成当代权利",
        overlay: "压迫者—被压迫者透镜（Oppressor–Oppressed Lens）；取消文化（Cancel Culture）",
      },
      range: { x: [0, -3], y: [0, -2], z: [0, -3] },
      group: "contemporary",
    },
    {
      id: "environmentalism",
      name: { zh: "环保主义", en: "Environmentalism" },
      raw: {
        x: "右到强左（+2.5～−4）：市场型到治理型路径",
        y: "右到强左（+2～−4）：低强制到高强制",
        z: "右到左（+3～−3）：政策目标 vs 环境高阶权利",
        overlay: "技术条件与产业结构（Technological Conditions & Industrial Structure）；危机叙事（Crisis Narrative）",
      },
      range: { x: [2.5, -4], y: [2, -4], z: [3, -3] },
      group: "contemporary",
    },
    {
      id: "animal-protectionism",
      name: { zh: "动物保护主义", en: "Animal Protectionism" },
      raw: {
        x: "中性到左（0～−2）：成本正当性被压缩",
        y: "中性到左（0～−3）：生活方式与科研被强制",
        z: "右到左（+3～−3）：福利→准权利→动物权利",
        overlay: "权利主体扩展（Expanded Rights Subject）",
      },
      range: { x: [0, -2], y: [0, -3], z: [3, -3] },
      group: "contemporary",
    },
    {
      id: "anthropocentrism",
      name: { zh: "人类中心主义", en: "Anthropocentrism" },
      raw: {
        x: "中性（0）：不构成经济秩序主张",
        y: "中性（0）：不主张压缩自由边界",
        z: "右（+2～+3）：权利主体限于人",
        overlay: "制度可裁决性（Adjudicability）",
      },
      range: { x: [0, 0], y: [0, 0], z: [2, 3] },
      group: "contemporary",
    },
    {
      id: "zionism",
      name: { zh: "犹太复国主义", en: "Zionism" },
      raw: {
        x: "不必然，分叉明显（+1～−1）：可与社民或市场结合",
        y: "中性到左（0～−2）：安全优先时收缩自由边界",
        z: "右（+2～+3）：权利通过国家承载",
        overlay: "民族主义 / 国际主义（Nationalism / Internationalism）；安全风险（Security Risks）",
      },
      range: { x: [1, -1], y: [0, -2], z: [2, 3] },
      group: "contemporary",
    },
  ];
}

function mergeIdeologies(...lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.id)) {
        throw new Error(`Duplicate ideology id in merge: ${item.id}`);
      }
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(__filename), "..", "..");
  const viewDir = path.join(repoRoot, "view");

  const tocPath = path.join(repoRoot, "book", "TableOfContents.md");
  const zhBookPath = path.join(
    repoRoot,
    "book",
    "政治三轴模型--政治“左、右”的三大本体轴与覆盖变量分析框架.md"
  );
  const enBookPath = path.join(repoRoot, "book", "Political_Triple-Axis_Model.md");

  const tocItems = parseToc(await readText(tocPath));
  const enTitleMap = extractTitlesByAnchor(await readText(enBookPath));
  const tocItemsEn = tocItems.map((item) => ({
    ...item,
    title: enTitleMap.get(item.id) || item.title,
  }));

  await generateChapterFiles({
    items: tocItems,
    bookMd: await readText(zhBookPath),
    outDir: path.join(viewDir, "zh"),
    lang: "zh",
  });
  await generateChapterFiles({
    items: tocItemsEn,
    bookMd: await readText(enBookPath),
    outDir: path.join(viewDir, "en"),
    lang: "en",
  });

  await writeJson(path.join(viewDir, "assets", "toc.zh.json"), tocToJson(tocItems));
  await writeJson(
    path.join(viewDir, "assets", "toc.en.json"),
    tocToJson(tocItemsEn)
  );

  const classicIdeologies = extractIdeologiesFromSec62(await readText(zhBookPath)).map(
    (item) => ({
      ...item,
      group: "classic",
    })
  );
  const contemporaryIdeologies = extractIdeologiesFromSec7(await readText(zhBookPath));
  const ideologies = mergeIdeologies(classicIdeologies, contemporaryIdeologies);
  await writeJson(
    path.join(viewDir, "assets", "ideologies.extracted.json"),
    ideologies
  );

  console.log("OK: generated static HTML pages, TOC JSON, and ideologies JSON.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
