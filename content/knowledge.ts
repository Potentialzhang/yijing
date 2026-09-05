export type ContentKind = "canonical" | "editorial" | "external_view" | "computed";

export interface ContentBlock {
  id: string;
  kind: ContentKind;
  title?: string;
  markdown: string;
  sourceIds: string[];
  traditionTags: string[];
  reviewedAt?: string;
}

export interface KnowledgeConcept {
  id: string;
  title: string;
  summary: string;
  stage: string;
  prerequisites: string[];
  keywords: string[];
  body: string[];
  blocks: ContentBlock[];
  sourceIds: string[];
  reviewStatus: "draft" | "reviewed" | "published";
  commonConfusions?: string[];
  relatedConceptIds?: string[];
  exerciseTemplateIds?: string[];
  contentVersion?: number;
}

type KnowledgeConceptDraft = Omit<KnowledgeConcept, "blocks">;

const BASE_KNOWLEDGE_CONCEPTS: readonly KnowledgeConceptDraft[] = [
  {
    id: "yin-yang-lines",
    title: "阴阳与爻",
    summary: "六十四卦的最小构成单位，是阴爻与阳爻的组合。",
    stage: "第一阶段 · 符号基础",
    prerequisites: [],
    keywords: ["阴", "阳", "爻", "变化"],
    body: ["本应用把阳爻编码为 1、阴爻编码为 0，并且所有爻数组从下往上存储。", "先熟悉符号，再观察一条爻变化如何让整个卦象变化。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
  {
    id: "five-elements",
    title: "五行生克",
    summary: "木、火、土、金、水之间的相生与相克关系。",
    stage: "第二阶段 · 关系基础",
    prerequisites: ["yin-yang-lines"],
    keywords: ["木", "火", "土", "金", "水", "相生", "相克"],
    body: ["相生顺序：木生火、火生土、土生金、金生水、水生木。", "相克关系以环状关系图练习，不把关系图直接等同于现实判断。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
  {
    id: "trigrams",
    title: "八卦结构",
    summary: "三条阴阳爻组成一个经卦，八种组合各有名称与基本象意。",
    stage: "第三阶段 · 八卦",
    prerequisites: ["yin-yang-lines"],
    keywords: ["乾", "坤", "坎", "离", "震", "巽", "艮", "兑"],
    body: ["从下往上读三爻：下爻、中爻、上爻。", "页面中的八卦卡片将结构、自然象、五行与方位分开呈现。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
  {
    id: "hexagram-composition",
    title: "上下卦与六十四卦",
    summary: "两个三爻经卦上下组合，形成六爻卦。",
    stage: "第六阶段 · 六十四卦",
    prerequisites: ["trigrams"],
    keywords: ["上卦", "下卦", "本卦", "卦序"],
    body: ["本应用将下卦放在六爻数组前 3 位，上卦放在后 3 位。", "六十四卦按文王卦序展示，卦序与 Unicode 显示符分开管理。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
  {
    id: "changing-lines",
    title: "本卦与变卦",
    summary: "改变一爻或多爻，观察本卦与变卦的结构差异。",
    stage: "第八阶段 · 本卦与变卦",
    prerequisites: ["hexagram-composition"],
    keywords: ["动爻", "本卦", "变卦", "多爻"],
    body: ["实验室会用文字明确指出发生变化的爻位。", "本卦保留原始六爻，变卦只切换被标记的动爻，点击顺序不会改变结果。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
  {
    id: "trigram-images",
    title: "八卦核心象意",
    summary: "把三爻结构连接到自然象、性质与家庭角色，但不把象意当作唯一断语。",
    stage: "第四阶段 · 八卦核心象意",
    prerequisites: ["trigrams"],
    keywords: ["自然象", "性质", "家庭角色", "象意"],
    body: ["乾、坤、震、巽、坎、离、艮、兑分别有天、地、雷、风、水、火、山、泽等基础自然象。", "象意是帮助记忆和观察关系的语言，使用时要标明体系与来源，不把单一关键词直接等同于现实结论。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
  {
    id: "earlier-later-heaven",
    title: "先天与后天八卦",
    summary: "先天与后天是不同的排列体系，学习时需要明确当前使用的体系。",
    stage: "第五阶段 · 先天与后天",
    prerequisites: ["trigrams"],
    keywords: ["先天", "后天", "方位", "体系标签"],
    body: ["同一个八卦在先天与后天体系中可能对应不同的排列位置，页面会把体系标签和方位分开。", "先掌握后天方位字段，再用对照表理解先天排列，不把两套顺序混写。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
  {
    id: "line-positions",
    title: "六爻位置",
    summary: "初、二、三、四、五、上六个位置提供阅读六爻结构的统一坐标。",
    stage: "第七阶段 · 六爻位置",
    prerequisites: ["hexagram-composition"],
    keywords: ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"],
    body: ["本应用以初爻为第 1 爻、上爻为第 6 爻，数据从下往上保存，显示时上爻在上。", "记忆位置时先说清楚爻位，再描述阴阳或变化，避免只用视觉高低猜测。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
  {
    id: "king-wen-sequence",
    title: "文王卦序",
    summary: "六十四卦按约定卦序编号，序号是索引身份，不等同于单一解释。",
    stage: "第六阶段 · 文王卦序",
    prerequisites: ["hexagram-composition"],
    keywords: ["文王卦序", "卦号", "索引", "身份"],
    body: ["每一卦都有稳定的 1～64 编号，页面同时显示卦名、上下卦和六爻签名。", "卦序用于查找与建立地图，阅读卦辞时仍要回到具体底本和来源。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
  {
    id: "relation-hexagrams",
    title: "错卦、综卦与互卦",
    summary: "用固定的结构变换观察一个卦的关系，不直接生成吉凶结论。",
    stage: "第九阶段 · 错综互卦入门",
    prerequisites: ["changing-lines", "line-positions"],
    keywords: ["错卦", "综卦", "互卦", "结构变换"],
    body: ["错卦反转六爻阴阳，综卦上下倒置，互卦取二至五爻组成内在上下卦。", "关系卦首先是可验证的结构操作，先复述计算过程，再讨论任何外部观点。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
  {
    id: "content-sources",
    title: "原文、释义与来源",
    summary: "区分经典原文、项目释义、程序计算和个人理解，保持学习材料可追溯。",
    stage: "辅助 · 内容素养",
    prerequisites: ["yin-yang-lines"],
    keywords: ["经典原文", "编辑释义", "来源", "版权"],
    body: ["页面会把 canonical、editorial、computed 和 personal 分层展示；没有来源复核的内容保持待校对状态。", "现代书籍、视频和网页只记录必要摘要与定位，导出个人数据时不会重复导出内置正文。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
  {
    id: "heavenly-stems",
    title: "十天干基础",
    summary: "十个天干按阴阳成对、按五行分组，是干支学习的第一层静态结构。",
    stage: "第十阶段 · 干支基础",
    prerequisites: ["five-elements"],
    keywords: ["甲", "乙", "阴阳", "五行", "十天干"],
    body: ["甲乙、丙丁、戊己、庚辛、壬癸分别成对归入木、火、土、金、水。", "本页只用于记忆天干的序列、阴阳和五行；尚未进行年柱、月柱、日柱或时柱计算。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "draft",
    commonConfusions: ["天干的顺序不等于具体日期的干支结果。", "同一五行的一对天干仍需区分阴阳。"],
    relatedConceptIds: ["five-elements", "earthly-branches"],
  },
  {
    id: "earthly-branches",
    title: "十二地支基础",
    summary: "十二地支连接序列、阴阳、五行、方位和时段，是进入干支关系前的记忆地图。",
    stage: "第十一阶段 · 干支基础",
    prerequisites: ["heavenly-stems"],
    keywords: ["子", "丑", "寅", "卯", "十二地支", "时辰"],
    body: ["十二地支按子、丑、寅、卯、辰、巳、午、未、申、酉、戌、亥排列，并以阴阳交替形成基础记忆节奏。", "页面中的月份和时段是静态记忆提示，不替代带时区、节气和换日规则的历法计算。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "draft",
    commonConfusions: ["地支的月份提示不是公历月份，也不能单独推出完整命盘。", "方向字段是学习用分区，边界规则会在后续罗盘/历法 ADR 中单独定义。"],
    relatedConceptIds: ["heavenly-stems", "earlier-later-heaven"],
  },
  {
    id: "hetu-luoshu",
    title: "河图与洛书入门",
    summary: "把河图的成组数字与洛书的九格数字分开记忆，不把两套结构混成一张图。",
    stage: "第十二阶段 · 数字与方位",
    prerequisites: ["earthly-branches"],
    keywords: ["河图", "洛书", "数字", "方位", "结构"],
    body: ["河图页面以方向、五行和成组数字呈现；洛书页面以九格数字排列呈现。", "工具中的方位与五行是学习提示，待来源和体系确认后再扩展规则，不用于自动排盘。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "draft",
    commonConfusions: ["河图成组数字与洛书九格数字是两层不同的记忆结构。", "数字网格不等于已经完成了历法或罗盘推导。"],
    relatedConceptIds: ["earthly-branches", "nine-palaces"],
  },
  {
    id: "nine-palaces",
    title: "九宫基础",
    summary: "通过九个宫位连接数字、方位、关联卦和五行，建立进入罗盘前的中间层。",
    stage: "第十三阶段 · 九宫",
    prerequisites: ["hetu-luoshu", "trigrams"],
    keywords: ["九宫", "宫位", "方位", "关联卦", "数字"],
    body: ["九宫交互图允许点击每个宫位，查看数字、方位、关联卦和五行字段。", "当前页面只用于学习映射；罗盘盘层、角度边界和真实传感器属于后续阶段。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "draft",
    commonConfusions: ["九宫数字布局与河图成组数字不是同一张图。", "关联卦字段是学习提示，不代表完整流派判断。"],
    relatedConceptIds: ["hetu-luoshu", "earlier-later-heaven"],
  },
  {
    id: "active-recall",
    title: "主动回忆与间隔复习",
    summary: "先尝试回忆，再查看答案，并用回忆质量决定下一次复习时间。",
    stage: "辅助 · 学习方法",
    prerequisites: ["line-positions"],
    keywords: ["主动回忆", "间隔复习", "自评", "薄弱点"],
    body: ["练习不只是查答案：先在脑中说出结构，再选择答案并进行四级自评。", "复习日期由本地记录推导，忘记会缩短间隔，连续通过会逐步拉长间隔。"],
    sourceIds: ["source-project-editorial"],
    reviewStatus: "reviewed",
  },
];

/**
 * Keep the short body field as a compatibility/readability surface while
 * making the rendered source layer explicit and machine-verifiable.
 */
export const KNOWLEDGE_CONCEPTS: readonly KnowledgeConcept[] =
  BASE_KNOWLEDGE_CONCEPTS.map((concept) => ({
    ...concept,
    blocks: concept.body.map((markdown, index) => ({
      id: concept.id + "-block-" + (index + 1),
      kind: "editorial" as const,
      title: index === 0 ? "核心说明" : "补充说明",
      markdown,
      sourceIds: [...concept.sourceIds],
      traditionTags: ["通用基础"],
    })),
  }));

export const COURSE_ORDER = [
  "yin-yang-lines",
  "five-elements",
  "trigrams",
  "trigram-images",
  "earlier-later-heaven",
  "hexagram-composition",
  "line-positions",
  "king-wen-sequence",
  "changing-lines",
  "relation-hexagrams",
  "content-sources",
  "heavenly-stems",
  "earthly-branches",
  "hetu-luoshu",
  "nine-palaces",
  "active-recall",
] as const;

export const ORDERED_KNOWLEDGE_CONCEPTS: readonly KnowledgeConcept[] = COURSE_ORDER.map((id) => KNOWLEDGE_CONCEPTS.find((concept) => concept.id === id)).filter((concept): concept is KnowledgeConcept => Boolean(concept));
