const EXACT_TITLES: Record<string, string> = {
  "/": "今日",
  "/learn": "学习地图",
  "/lab/hexagram": "卦象实验室",
  "/hexagrams": "六十四卦索引",
  "/library": "易学知识库",
  "/trigrams": "八卦卡片",
  "/review": "复习中心",
  "/review/session": "复习会话",
  "/notes": "个人笔记",
  "/notes/draft": "AI 辅学笔记",
  "/account": "账户与同步",
  "/stats": "学习统计",
  "/self-test": "快速自测",
  "/tools": "工具集合",
  "/tools/five-elements": "五行生克",
  "/tools/trigrams": "八卦工具",
  "/tools/hexagram-sequence": "六十四卦卦序歌",
  "/tools/sexagenary-relations": "干支关系",
  "/tools/hetu-luoshu": "河图洛书与九宫",
  "/tools/calendar": "干支与节气",
  "/tools/compass": "学习罗盘",
  "/settings": "设置",
  "/settings/data": "数据安全",
  "/settings/content": "内容治理",
  "/settings/preferences": "学习偏好",
  "/settings/ai": "AI 辅学设置",
};

const KNOWLEDGE_TITLES: Record<string, string> = {
  "yin-yang-lines": "阴阳与爻",
  "five-elements": "五行及生克",
  trigrams: "八卦结构",
  "trigram-images": "八卦核心象意",
  "earlier-later-heaven": "先天与后天八卦",
  "hexagram-composition": "上下卦与六十四卦",
  "line-positions": "六爻位置",
  "king-wen-sequence": "文王卦序",
  "changing-lines": "本卦与变卦",
  "relation-hexagrams": "错卦、综卦与互卦",
  "content-sources": "内容与来源",
  "heavenly-stems": "十天干",
  "earthly-branches": "十二地支",
  "hetu-luoshu": "河图洛书",
  "nine-palaces": "九宫",
  "active-recall": "主动回忆",
};

const TRIGRAM_TITLES: Record<string, string> = {
  qian: "乾",
  dui: "兑",
  li: "离",
  zhen: "震",
  xun: "巽",
  kan: "坎",
  gen: "艮",
  kun: "坤",
};

/** Return a stable, descriptive title for both static and dynamic app routes. */
export function documentTitleForPathname(pathname: string): string {
  const normalized = pathname.split("?", 1)[0].replace(/\/$/, "") || "/";
  const exact = EXACT_TITLES[normalized];
  if (exact) return `${exact} · 易境`;
  if (normalized.startsWith("/learn/")) {
    const id = normalized.slice("/learn/".length);
    return `${KNOWLEDGE_TITLES[id] ?? "知识点"} · 易境`;
  }
  if (normalized.startsWith("/hexagrams/")) {
    const number = Number(normalized.slice("/hexagrams/".length));
    return Number.isInteger(number) && number >= 1 && number <= 64
      ? `第 ${number} 卦详情 · 易境`
      : "六十四卦详情 · 易境";
  }
  if (normalized.startsWith("/trigrams/")) {
    const id = normalized.slice("/trigrams/".length);
    return `${TRIGRAM_TITLES[id] ?? "八卦"}卦详情 · 易境`;
  }
  return "易境 · 个人易学学习工具";
}
