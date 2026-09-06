import { getTrigram, type HexagramIdentity } from "@/core/iching";
import { getCanonicalEntry, getHexagramJudgment, getHexagramLineTexts } from "@/content/hexagrams";

/**
 * The library intentionally keeps the canonical text and the study scaffolding
 * separate.  This gives the detail page stable fields without rendering source
 * audit metadata in the reading flow.
 */
export function getHexagramStudy(hexagram: HexagramIdentity) {
  const lower = getTrigram(hexagram.lowerTrigramId);
  const upper = getTrigram(hexagram.upperTrigramId);
  const judgment = getHexagramJudgment(hexagram.id);
  const canonical = getCanonicalEntry(hexagram.id);
  const lines = getHexagramLineTexts(hexagram.id);
  const shortName = getCanonicalEntry(hexagram.id).title;

  return {
    shortName: shortName || hexagram.name,
    virtue: `${lower.keywords[0]}为内在根基，${upper.keywords[0]}为外在趋势；在上下卦互动中保持合时、守正。`,
    image: `${upper.nature}在上，${lower.nature}在下，形成“${hexagram.name}”之象。先看上下位置，再观察六爻如何推进或收束。`,
    mnemonic: `记作「${lower.name}下${upper.name}上」：${lower.symbol}在下、${upper.symbol}在上；先认三爻，再联想到“${shortName}”的主题。`,
    judgment: judgment.canonicalText ?? "暂无卦辞正文",
    judgmentInterpretation: judgment.blocks[0]?.markdown ?? "先把卦辞读成一句关于时位与行动的提示。",
    // The canonical import keeps the first 彖传 and 卦象传 paragraphs from
    // the same public-domain edition as the judgment/line text.  Keeping
    // these alongside the project-written interpretation means the detail
    // page can show the actual transmission without presenting a generic
    // placeholder as if it were the source text.
    tuan: canonical.tuan ?? "暂无彖传正文",
    tuanInterpretation: `学习提示：从“${lower.nature}”与“${upper.nature}”的关系理解${shortName}，关注它为何在此时呈现为这样的通塞、进退与聚散。`,
    xiang: canonical.xiang ?? "暂无象传正文",
    xiangInterpretation: `学习提示：观察${upper.nature}在上、${lower.nature}在下的画面，把自然之象转成可复述的行为提醒：先辨位置，再定取舍。`,
    lines: lines.map((line, index) => ({
      position: index + 1,
      label: line.canonicalText?.split(/[：、。]/)[0] || `${index === 0 ? "初" : index === 5 ? "上" : ["二", "三", "四", "五"][index - 1]}爻`,
      canonical: line.canonicalText ?? "暂无爻辞正文",
      interpretation: line.blocks[0]?.markdown ?? "先复述爻辞，再说明这一爻在全卦中的位置。",
    })),
  };
}
