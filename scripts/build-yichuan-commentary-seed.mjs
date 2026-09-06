import { readFile, writeFile } from "node:fs/promises";

const revision = "6caf488397a8175e80757ec186e410a0160e7f67";
const seedUrl = new URL("../content/commentary-seed.json", import.meta.url);
const canonicalUrl = new URL("../content/zhouyi-canonical.json", import.meta.url);
const seed = JSON.parse(await readFile(seedUrl, "utf8"));
const canonical = JSON.parse(await readFile(canonicalUrl, "utf8"));
const yichuanSource = {
  id: "source-yichuan-kanripo",
  kind: "classic",
  title: "《伊川易傳》",
  author: "程頤",
  dynasty: "北宋",
  edition: `四庫全書本·Kanripo KR1a0016@${revision.slice(0, 12)}`,
  url: `https://github.com/kanripo/KR1a0016/tree/${revision}`,
  licenseLabel: "公版古籍原文",
  rightsNote: "古籍原文為公版；數字底本來自 Kanripo，固定到具體修訂。",
  revision,
  retrievedAt: "2026-09-06",
  reviewStatus: "verified",
};

const additionalSources = [
  {
    id: "source-benyi-kanripo",
    repository: "KR1a0032",
    revision: "16fb9efd269cd8a2ca682ced0d576d9c72e08125",
    volumes: ["001", "002", "003", "004"],
    title: "《周易本義》",
    author: "朱熹",
    dynasty: "南宋",
    commentator: "朱熹·原注",
    tradition: "本義·象占",
    displayOrder: 30,
    rowSuffix: "zhuxi-kanripo",
    focus: (title) => `${title}卦的卦象、卦辭與占法如何連在一起？`,
    summary: (title) => `這是朱熹《周易本義》對${title}卦經文的原注節選。閱讀時可辨認他如何區分卦象、文王卦辭與占筮條件，再與程頤偏重義理修身的讀法對照。`,
    practicalHint: (title) => `寫下${title}卦的“象”與“占”各一句：前者說明看到什麼結構，後者說明在什麼條件下如何判斷。`,
  },
  {
    id: "source-zhushu-kanripo",
    repository: "KR1a0007",
    revision: "0fa05af11e9229b6cc6febe312d541fc6d4ec3bf",
    volumes: Array.from({ length: 13 }, (_, index) => String(12 + index * 2).padStart(3, "0")),
    title: "《周易註疏》",
    author: "王弼注、孔穎達疏",
    dynasty: "魏·唐",
    commentator: "王弼·孔穎達原注",
    tradition: "義理·注疏",
    displayOrder: 40,
    rowSuffix: "wangkong-kanripo",
    focus: (title) => `${title}卦的卦名、卦體與人事之義如何貫通？`,
    summary: (title) => `這是王弼注、孔穎達疏對${title}卦的原文節選。可先找“注”所抓住的主旨，再看“疏”如何補充名義、爻位與人事推演，避免只把卦名當成單一吉凶標籤。`,
    practicalHint: (title) => `從${title}卦原注中各圈出一處“卦體依據”和一處“人事推論”，檢查推論是否能回到經文。`,
  },
];

const rawFiles = [];
for (const volume of ["001", "002", "003", "004"]) {
  const url = `https://raw.githubusercontent.com/kanripo/KR1a0016/${revision}/KR1a0016_${volume}.txt`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下載《伊川易傳》卷${volume}失敗：${response.status}`);
  rawFiles.push({ volume, text: await response.text() });
}

const extracted = new Map();
for (const { volume, text } of rawFiles) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const symbol = lines[index][0];
    const codePoint = symbol?.codePointAt(0) ?? 0;
    if (codePoint < 0x4dc0 || codePoint > 0x4dff) continue;
    let number = codePoint - 0x4dc0 + 1;
    const prose = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      const firstCodePoint = line[0]?.codePointAt(0) ?? 0;
      if (firstCodePoint >= 0x4dc0 && firstCodePoint <= 0x4dff) break;
      if (!line.startsWith("　")) continue;
      const clean = line.replace(/<pb:[^>]+>/g, "").replace(/¶/g, "").replace(/\s+/g, "");
      if (clean) prose.push(clean);
      if (prose.join("").length >= 190) break;
    }
    const textExcerpt = prose.join("");
    if (textExcerpt.length < 40) throw new Error(`第 ${number} 卦未提取到足够的程頤原注`);
    // The source edition contains three known Unicode hexagram-glyph typos;
    // its written section headings are unambiguous, so correct only those.
    if (textExcerpt.startsWith("咸序卦")) number = 31;
    if (textExcerpt.startsWith("井序卦")) number = 48;
    if (textExcerpt.startsWith("既濟序卦")) number = 63;
    extracted.set(number, { volume, symbol, excerpt: `${textExcerpt.slice(0, 190)}${textExcerpt.length > 190 ? "……" : ""}` });
  }
}
if (extracted.size !== 64) {
  const missing = Array.from({ length: 64 }, (_, index) => index + 1).filter((number) => !extracted.has(number));
  throw new Error(`应提取 64 卦，实际 ${extracted.size} 卦；缺少 ${missing.join("、")}`);
}

const generated = canonical.rows.map((row) => {
  const item = extracted.get(row.number);
  if (!item) throw new Error(`缺少第 ${row.number} 卦`);
  const padded = String(row.number).padStart(2, "0");
  return {
    id: `hexagram-${padded}-chengyi-kanripo`,
    hexagramId: `hexagram-${padded}`,
    sourceId: yichuanSource.id,
    commentator: "程頤·原注",
    dynasty: "北宋",
    tradition: "義理·程傳",
    focus: `${row.title}卦的卦序、卦體與主旨如何相互說明？`,
    excerpt: item.excerpt,
    summary: `這是程頤對${row.title}卦的開篇原注。閱讀時可先找出他如何從卦序、上下卦、卦德或所處之時建立卦義，再與本頁經文和彖、象對讀。`,
    practicalHint: `先不看白話導讀，用一句話寫下原注中的“${row.title}之時”；再標出哪一句來自卦體，哪一句是程頤的義理發揮。`,
    locator: `KR1a0016_${item.volume}.txt·${item.symbol}${row.title}卦開篇`,
    displayOrder: 20,
    reviewStatus: "reviewed",
    contentVersion: 1,
  };
});

const additionalGenerated = [];
for (const sourceDefinition of additionalSources) {
  const occurrences = [];
  for (const volume of sourceDefinition.volumes) {
    const url = `https://raw.githubusercontent.com/kanripo/${sourceDefinition.repository}/${sourceDefinition.revision}/${sourceDefinition.repository}_${volume}.txt`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下載${sourceDefinition.title}卷${volume}失敗：${response.status}`);
    const lines = (await response.text()).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const symbol = [...lines[index]].find((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint >= 0x4dc0 && codePoint <= 0x4dff;
      });
      if (!symbol) continue;
      const prose = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const line = lines[cursor];
        if ([...line].some((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint >= 0x4dc0 && codePoint <= 0x4dff;
        })) break;
        const clean = line
          .replace(/<pb:[^>]+>/g, "")
          .replace(/¶/g, "")
          .replace(/^#.*$/g, "")
          .replace(/\//g, "")
          .replace(/\s+/g, "");
        if (clean) prose.push(clean);
        if (prose.join("").length >= 230) break;
      }
      const textExcerpt = prose.join("");
      if (textExcerpt.length < 40) throw new Error(`${sourceDefinition.title}第 ${occurrences.length + 1} 卦未提取到足够原注`);
      occurrences.push({ volume, symbol, excerpt: `${textExcerpt.slice(0, 220)}${textExcerpt.length > 220 ? "……" : ""}` });
    }
  }
  if (occurrences.length !== 64) throw new Error(`${sourceDefinition.title}应提取 64 卦，实际 ${occurrences.length} 卦`);
  const sourceRecord = {
    id: sourceDefinition.id,
    kind: "classic",
    title: sourceDefinition.title,
    author: sourceDefinition.author,
    dynasty: sourceDefinition.dynasty,
    edition: `四庫全書本·Kanripo ${sourceDefinition.repository}@${sourceDefinition.revision.slice(0, 12)}`,
    url: `https://github.com/kanripo/${sourceDefinition.repository}/tree/${sourceDefinition.revision}`,
    licenseLabel: "公版古籍原文",
    rightsNote: "古籍原文為公版；數字底本來自 Kanripo，固定到具體修訂。",
    revision: sourceDefinition.revision,
    retrievedAt: "2026-09-06",
    reviewStatus: "verified",
  };
  seed.sources = [...seed.sources.filter((item) => item.id !== sourceRecord.id), sourceRecord];
  additionalGenerated.push(...canonical.rows.map((row, index) => {
    const item = occurrences[index];
    const padded = String(row.number).padStart(2, "0");
    return {
      id: `hexagram-${padded}-${sourceDefinition.rowSuffix}`,
      hexagramId: `hexagram-${padded}`,
      sourceId: sourceRecord.id,
      commentator: sourceDefinition.commentator,
      dynasty: sourceDefinition.dynasty,
      tradition: sourceDefinition.tradition,
      focus: sourceDefinition.focus(row.title),
      excerpt: item.excerpt,
      summary: sourceDefinition.summary(row.title),
      practicalHint: sourceDefinition.practicalHint(row.title),
      locator: `${sourceDefinition.repository}_${item.volume}.txt·第${row.number}卦·${row.title}卦開篇`,
      displayOrder: sourceDefinition.displayOrder,
      reviewStatus: "reviewed",
      contentVersion: 1,
    };
  }));
}

seed.sources = [...seed.sources.filter((item) => item.id !== yichuanSource.id), yichuanSource];
seed.commentaries = [
  ...seed.commentaries.filter((item) => !item.id.endsWith("-chengyi-kanripo") && !additionalSources.some((sourceDefinition) => item.id.endsWith(`-${sourceDefinition.rowSuffix}`))),
  ...generated,
  ...additionalGenerated,
];
seed.version = Math.max(2, Number(seed.version) || 1);
await writeFile(seedUrl, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
console.log(`已生成 ${generated.length + additionalGenerated.length} 条三家逐卦原注：程頤、朱熹、王弼·孔穎達`);
