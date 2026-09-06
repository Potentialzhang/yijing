export interface HexagramSequenceVerseLine {
  start: number;
  end: number;
  text: string;
}

export interface HexagramSequenceVerseSection {
  id: "upper" | "lower";
  title: string;
  subtitle: string;
  lines: readonly HexagramSequenceVerseLine[];
}

/**
 * 朱熹《周易本义》所载《上下经卦名次序歌》的通行简体文本。
 * 起止序号用于帮助初学者把长句切成可核对的小段，也便于测试覆盖 1—64 卦。
 */
export const HEXAGRAM_SEQUENCE_VERSE: readonly HexagramSequenceVerseSection[] = [
  {
    id: "upper",
    title: "上经",
    subtitle: "第 1—30 卦",
    lines: [
      { start: 1, end: 12, text: "乾坤屯蒙需讼师，比小畜兮履泰否。" },
      { start: 13, end: 22, text: "同人大有谦豫随，蛊临观兮噬嗑贲。" },
      { start: 23, end: 30, text: "剥复无妄大畜颐，大过坎离三十备。" },
    ],
  },
  {
    id: "lower",
    title: "下经",
    subtitle: "第 31—64 卦",
    lines: [
      { start: 31, end: 38, text: "咸恒遁兮及大壮，晋与明夷家人睽。" },
      { start: 39, end: 51, text: "蹇解损益夬姤萃，升困井革鼎震继。" },
      { start: 52, end: 61, text: "艮渐归妹丰旅巽，兑涣节兮中孚至。" },
      { start: 62, end: 64, text: "小过既济兼未济，是为下经三十四。" },
    ],
  },
] as const;

export const HEXAGRAM_SEQUENCE_MEMORY_TIPS = [
  "先记两端：乾坤开篇，坎离收上经；咸恒开下经，既济、未济收尾。",
  "再按相邻两卦成组：乾坤、屯蒙、需讼、师比……每次只增加一组。",
  "最后把口诀和卡片互相核对：能说出卦名后，再回看卦象与上下卦。",
] as const;
