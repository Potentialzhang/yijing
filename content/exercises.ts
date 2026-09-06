import { getHexagramByPair, HEXAGRAMS } from "@/core/iching";
import { FIVE_ELEMENTS } from "./five-elements";
import { TRIGRAMS } from "@/core/iching";
import { KNOWLEDGE_CONCEPTS } from "./knowledge";
import { EARTHLY_BRANCHES, HEAVENLY_STEMS } from "./sexagenary";
import { HETU_GROUPS, NINE_PALACES } from "./hetu-luoshu";
import { SEXAGENARY_RELATIONS } from "./sexagenary-relations";

export type ExerciseKind = "concept-recall" | "trigram-name" | "trigram-lines" | "trigram-lines-name" | "trigram-name-lines" | "trigram-arrange-lines" | "trigram-element" | "trigram-direction" | "trigram-direction-name" | "trigram-nature" | "trigram-nature-name" | "trigram-family" | "trigram-body" | "five-generates" | "five-controls" | "hexagram-pair" | "hexagram-line" | "stem-element" | "stem-yinyang" | "stem-name" | "branch-element" | "branch-direction" | "branch-hour" | "branch-name" | "hetu-direction" | "hetu-element" | "hetu-numbers" | "palace-direction" | "palace-number" | "palace-trigram" | "sexagenary-relation";
export type ExerciseResponseType = "choice" | "text";

export interface Exercise {
  id: string;
  kind: ExerciseKind;
  prompt: string;
  targetType: "trigram" | "concept" | "hexagram" | "five-element";
  targetId: string;
  display: string;
  choices: readonly string[];
  answer: string;
  explanation: string;
  /** Text response exercises use a free-form input instead of choices. */
  responseType?: ExerciseResponseType;
  /** Review-only templates are available in the spaced queue but are not immediate lesson checks. */
  mode?: "immediate" | "review";
}

const trigramNames = TRIGRAMS.map((item) => item.name);
const hexagramNames = HEXAGRAMS.map((item) => item.name);
const elements = FIVE_ELEMENTS.map((item) => item.name);
const directions = TRIGRAMS.map((item) => item.direction);
const natures = TRIGRAMS.map((item) => item.nature);
const familyRoles = TRIGRAMS.map((item) => item.familyRole);
const bodyAssociations = TRIGRAMS.map((item) => item.bodyAssociations[0]);
const conceptTitles = KNOWLEDGE_CONCEPTS.map((item) => item.title);
const stemNames = HEAVENLY_STEMS.map((item) => item.name);
const stemElements = HEAVENLY_STEMS.map((item) => item.element);
const branchNames = EARTHLY_BRANCHES.map((item) => item.name);
const branchElements = EARTHLY_BRANCHES.map((item) => item.element);
const branchDirections = EARTHLY_BRANCHES.map((item) => item.direction);
const branchHours = EARTHLY_BRANCHES.map((item) => item.doubleHour);
const hetuDirections = HETU_GROUPS.map((item) => item.direction);
const hetuElements = HETU_GROUPS.map((item) => item.element);
const hetuNumberPairs = HETU_GROUPS.map((item) => item.numbers.join("、"));
const palaceDirections = NINE_PALACES.map((item) => item.direction);
const palaceNumbers = NINE_PALACES.map((item) => String(item.number));
const palaceTrigrams = NINE_PALACES.map((item) => item.trigramId);

function choices(answer: string, pool: readonly string[], offsets: number[] = [1, 3]): string[] {
  // Some source fields are intentionally repeated (for example, the central
  // palace also points to Kun).  Build the distractors from a de-duplicated
  // pool, then keep walking when an offset lands back on the answer so a
  // multiple-choice item does not silently collapse to two options.
  const uniquePool = [...new Set(pool)];
  if (uniquePool.length === 0) return [answer];

  const answerIndex = uniquePool.indexOf(answer);
  const values = [answer];
  const addCandidate = (candidate: string | undefined) => {
    if (candidate && !values.includes(candidate)) values.push(candidate);
  };

  if (answerIndex >= 0) {
    offsets.forEach((offset) => addCandidate(uniquePool[(answerIndex + offset) % uniquePool.length]));
    for (let offset = 1; values.length < Math.min(3, uniquePool.length); offset += 1) {
      addCandidate(uniquePool[(answerIndex + offset) % uniquePool.length]);
    }
  } else {
    uniquePool.forEach(addCandidate);
  }

  return values;
}

export const EXERCISES: readonly Exercise[] = [
  ...TRIGRAMS.map((trigram) => ({ id: `trigram-name-${trigram.id}`, kind: "trigram-name" as const, prompt: "看卦符，选择卦名", targetType: "trigram" as const, targetId: trigram.id, display: trigram.symbol, choices: choices(trigram.name, trigramNames), answer: trigram.name, explanation: `${trigram.name}的三爻签名是 ${trigram.lines.join("")}，基本自然象为${trigram.nature}。` })),
  ...TRIGRAMS.map((trigram) => ({ id: `trigram-lines-${trigram.id}`, kind: "trigram-lines" as const, prompt: `${trigram.name}的三爻签名是什么？`, targetType: "trigram" as const, targetId: trigram.id, display: trigram.name, choices: choices(trigram.lines.join(""), TRIGRAMS.map((item) => item.lines.join(""))), answer: trigram.lines.join(""), explanation: `${trigram.name}按初爻到上爻从下往上存储为 ${trigram.lines.join("" )}。` })),
  ...TRIGRAMS.map((trigram) => ({ id: `trigram-lines-name-${trigram.id}`, kind: "trigram-lines-name" as const, prompt: "看三爻结构，选择卦名", targetType: "trigram" as const, targetId: trigram.id, display: trigram.lines.join(""), choices: choices(trigram.name, trigramNames), answer: trigram.name, explanation: `${trigram.name}的三爻结构从初爻到上爻为 ${trigram.lines.join("" )}。` })),
  ...TRIGRAMS.map((trigram) => ({ id: `trigram-name-lines-${trigram.id}`, kind: "trigram-name-lines" as const, prompt: `按卦名选择${trigram.name}的三爻结构`, targetType: "trigram" as const, targetId: trigram.id, display: trigram.name, choices: choices(trigram.lines.join(""), TRIGRAMS.map((item) => item.lines.join(""))), answer: trigram.lines.join(""), explanation: `${trigram.name}按从下往上保存为 ${trigram.lines.join("" )}。` })),
  // This interactive exercise builds its answer from the user's three taps;
  // `choices` lists the available line tokens rather than final answers.
  ...TRIGRAMS.map((trigram) => ({ id: `trigram-arrange-lines-${trigram.id}`, kind: "trigram-arrange-lines" as const, prompt: `按从下往上排列${trigram.name}的三爻`, targetType: "trigram" as const, targetId: trigram.id, display: trigram.name, choices: ["阳爻", "阴爻"], answer: trigram.lines.join(""), explanation: `${trigram.name}从初爻到上爻的排列是 ${trigram.lines.join("" )}。` })),
  ...TRIGRAMS.map((trigram) => ({ id: `trigram-element-${trigram.id}`, kind: "trigram-element" as const, prompt: `${trigram.name}的五行是什么？`, targetType: "trigram" as const, targetId: trigram.id, display: trigram.symbol, choices: choices(trigram.element, elements), answer: trigram.element, explanation: `${trigram.name}在本应用的基础资料中归为${trigram.element}。` })),
  ...TRIGRAMS.map((trigram) => ({ id: `trigram-direction-${trigram.id}`, kind: "trigram-direction" as const, responseType: "text" as const, prompt: `请填写${trigram.name}的后天方位`, targetType: "trigram" as const, targetId: trigram.id, display: trigram.name, choices: choices(trigram.direction, directions), answer: trigram.direction, explanation: `${trigram.name}的后天方位记录为${trigram.direction}。` })),
  ...TRIGRAMS.map((trigram) => ({ id: `trigram-direction-name-${trigram.id}`, kind: "trigram-direction-name" as const, prompt: `看后天方位${trigram.direction}，选择对应卦名`, targetType: "trigram" as const, targetId: trigram.id, display: trigram.direction, choices: choices(trigram.name, trigramNames), answer: trigram.name, explanation: `${trigram.name}的后天方位是${trigram.direction}。` })),
  ...TRIGRAMS.map((trigram) => ({ id: `trigram-nature-${trigram.id}`, kind: "trigram-nature" as const, prompt: `哪一个自然象对应${trigram.name}？`, targetType: "trigram" as const, targetId: trigram.id, display: trigram.symbol, choices: choices(trigram.nature, natures), answer: trigram.nature, explanation: `${trigram.name}的基础自然象为${trigram.nature}。` })),
  ...TRIGRAMS.map((trigram) => ({ id: `trigram-nature-name-${trigram.id}`, kind: "trigram-nature-name" as const, prompt: `看自然象“${trigram.nature}”，选择对应卦名`, targetType: "trigram" as const, targetId: trigram.id, display: trigram.nature, choices: choices(trigram.name, trigramNames), answer: trigram.name, explanation: `${trigram.nature}是${trigram.name}的基础自然象。` })),
  ...TRIGRAMS.map((trigram) => ({ id: `trigram-family-${trigram.id}`, kind: "trigram-family" as const, prompt: `${trigram.name}对应哪一个家庭角色？`, targetType: "trigram" as const, targetId: trigram.id, display: trigram.name, choices: choices(trigram.familyRole, familyRoles), answer: trigram.familyRole, explanation: `${trigram.name}的家庭角色字段为${trigram.familyRole}。` })),
  ...TRIGRAMS.map((trigram, index) => ({ id: `trigram-body-${trigram.id}`, kind: "trigram-body" as const, prompt: `${trigram.name}常用身体对应是什么？`, targetType: "trigram" as const, targetId: trigram.id, display: trigram.name, choices: choices(bodyAssociations[index], bodyAssociations), answer: bodyAssociations[index], explanation: `本应用首批基础资料把${trigram.name}与${bodyAssociations[index]}作为记忆联想字段。` })),
  ...FIVE_ELEMENTS.map((element) => ({ id: `five-generates-${element.id}`, kind: "five-generates" as const, prompt: `${element.name}生什么？`, targetType: "five-element" as const, targetId: element.id, display: element.name, choices: choices(element.generates, elements), answer: element.generates, explanation: `相生环为木→火→土→金→水→木，${element.name}生${element.generates}。` })),
  ...FIVE_ELEMENTS.map((element) => ({ id: `five-controls-${element.id}`, kind: "five-controls" as const, prompt: `${element.name}克什么？`, targetType: "five-element" as const, targetId: element.id, display: element.name, choices: choices(element.controls, elements), answer: element.controls, explanation: `基础相克关系中，${element.name}克${element.controls}。` })),
  ...TRIGRAMS.flatMap((lower) => TRIGRAMS.map((upper) => { const hexagram = getHexagramByPair(lower.id, upper.id); return { id: `hexagram-pair-${lower.id}-${upper.id}`, kind: "hexagram-pair" as const, prompt: `下卦为${lower.name}、上卦为${upper.name}，组成哪一卦？`, targetType: "hexagram" as const, targetId: hexagram.id, display: `${upper.symbol} / ${lower.symbol}`, choices: choices(hexagram.name, hexagramNames), answer: hexagram.name, explanation: `下卦${lower.name}、上卦${upper.name}对应第${hexagram.kingWenNumber}卦${hexagram.name}。` }; })),
  ...TRIGRAMS.map((trigram) => ({ id: `hexagram-line-${trigram.id}`, kind: "hexagram-line" as const, prompt: `${trigram.name}为${trigram.nature}的三爻结构是什么？`, targetType: "trigram" as const, targetId: trigram.id, display: trigram.symbol, choices: choices(trigram.lines.join(""), TRIGRAMS.map((item) => item.lines.join(""))), answer: trigram.lines.join(""), explanation: `${trigram.name}按初爻到上爻从下往上为 ${trigram.lines.join("")}。` })),
  ...HEAVENLY_STEMS.map((stem) => ({ id: `stem-element-${stem.id}`, kind: "stem-element" as const, mode: "review" as const, prompt: `天干${stem.name}的五行是什么？`, targetType: "concept" as const, targetId: "heavenly-stems", display: `${stem.name} · ${stem.yinYang}干`, choices: choices(stem.element, [...new Set(stemElements)]), answer: stem.element, explanation: `${stem.name}归入${stem.element}，再与同组天干区分阴阳。` })),
  ...HEAVENLY_STEMS.map((stem) => ({ id: `stem-yinyang-${stem.id}`, kind: "stem-yinyang" as const, mode: "review" as const, prompt: `天干${stem.name}属于哪一类？`, targetType: "concept" as const, targetId: "heavenly-stems", display: `${stem.name} · ${stem.element}`, choices: ["阳", "阴"], answer: stem.yinYang, explanation: `${stem.name}在本阶段的静态字段标记为${stem.yinYang}。` })),
  ...HEAVENLY_STEMS.map((stem) => ({ id: `stem-name-${stem.id}`, kind: "stem-name" as const, mode: "review" as const, prompt: `哪个天干属于${stem.yinYang}${stem.element}？`, targetType: "concept" as const, targetId: "heavenly-stems", display: `${stem.yinYang}${stem.element}`, choices: choices(stem.name, stemNames), answer: stem.name, explanation: `${stem.name}是第${stem.index}位天干，归入${stem.yinYang}${stem.element}。` })),
  ...EARTHLY_BRANCHES.map((branch) => ({ id: `branch-element-${branch.id}`, kind: "branch-element" as const, mode: "review" as const, prompt: `地支${branch.name}的五行是什么？`, targetType: "concept" as const, targetId: "earthly-branches", display: `${branch.name} · ${branch.direction}`, choices: choices(branch.element, [...new Set(branchElements)]), answer: branch.element, explanation: `${branch.name}在本阶段的静态字段归入${branch.element}。` })),
  ...EARTHLY_BRANCHES.map((branch) => ({ id: `branch-direction-${branch.id}`, kind: "branch-direction" as const, mode: "review" as const, prompt: `地支${branch.name}的方位记忆提示是什么？`, targetType: "concept" as const, targetId: "earthly-branches", display: `${branch.name} · ${branch.element}`, choices: choices(branch.direction, branchDirections), answer: branch.direction, explanation: `${branch.name}的方位记忆提示为${branch.direction}；它不是精密罗盘边界。` })),
  ...EARTHLY_BRANCHES.map((branch) => ({ id: `branch-hour-${branch.id}`, kind: "branch-hour" as const, mode: "review" as const, prompt: `地支${branch.name}对应哪个时段提示？`, targetType: "concept" as const, targetId: "earthly-branches", display: `${branch.name} · ${branch.monthHint}`, choices: choices(branch.doubleHour, branchHours), answer: branch.doubleHour, explanation: `${branch.name}的时段提示为${branch.doubleHour}，仅用于静态记忆。` })),
  ...EARTHLY_BRANCHES.map((branch) => ({ id: `branch-name-${branch.id}`, kind: "branch-name" as const, mode: "review" as const, prompt: `哪个地支位于${branch.direction}？`, targetType: "concept" as const, targetId: "earthly-branches", display: branch.direction, choices: choices(branch.name, branchNames), answer: branch.name, explanation: `${branch.name}是第${branch.index}位地支，方位记忆提示为${branch.direction}。` })),
  ...HETU_GROUPS.map((group) => ({ id: `hetu-direction-${group.id}`, kind: "hetu-direction" as const, mode: "review" as const, prompt: `河图中${group.numbers.join("、")}对应哪个方向？`, targetType: "concept" as const, targetId: "hetu-luoshu", display: `${group.numbers.join("、")} · ${group.element}`, choices: choices(group.direction, hetuDirections), answer: group.direction, explanation: `${group.numbers.join("、")}在本阶段的河图方向提示为${group.direction}。` })),
  ...HETU_GROUPS.map((group) => ({ id: `hetu-element-${group.id}`, kind: "hetu-element" as const, mode: "review" as const, prompt: `河图${group.direction}方对应哪一五行？`, targetType: "concept" as const, targetId: "hetu-luoshu", display: group.direction, choices: choices(group.element, hetuElements), answer: group.element, explanation: `${group.direction}方的河图数字组为${group.numbers.join("、")}，五行提示为${group.element}。` })),
  ...HETU_GROUPS.map((group) => ({ id: `hetu-numbers-${group.id}`, kind: "hetu-numbers" as const, mode: "review" as const, prompt: `河图${group.direction}方的成组数字是什么？`, targetType: "concept" as const, targetId: "hetu-luoshu", display: group.direction, choices: choices(group.numbers.join("、"), hetuNumberPairs), answer: group.numbers.join("、"), explanation: `${group.direction}方的成组数字提示为${group.numbers.join("、")}。` })),
  ...NINE_PALACES.map((palace) => ({ id: `palace-direction-${palace.id}`, kind: "palace-direction" as const, mode: "review" as const, prompt: `九宫${palace.number}对应哪个方位？`, targetType: "concept" as const, targetId: "nine-palaces", display: palace.name, choices: choices(palace.direction, palaceDirections), answer: palace.direction, explanation: `${palace.name}的方位提示为${palace.direction}。` })),
  ...NINE_PALACES.map((palace) => ({ id: `palace-number-${palace.id}`, kind: "palace-number" as const, mode: "review" as const, prompt: `哪个九宫名称对应数字${palace.number}？`, targetType: "concept" as const, targetId: "nine-palaces", display: palace.direction, choices: choices(String(palace.number), palaceNumbers), answer: String(palace.number), explanation: `${palace.name}的数字为${palace.number}。` })),
  ...NINE_PALACES.map((palace) => ({ id: `palace-trigram-${palace.id}`, kind: "palace-trigram" as const, mode: "review" as const, prompt: `九宫${palace.number}关联哪一卦？`, targetType: "concept" as const, targetId: "nine-palaces", display: palace.name, choices: choices(palace.trigramId, palaceTrigrams), answer: palace.trigramId, explanation: `${palace.name}的关联卦字段为${palace.trigramId}，只作学习提示。` })),
  ...SEXAGENARY_RELATIONS.map((relation) => {
    const sameKind = SEXAGENARY_RELATIONS.filter((item) => item.kind === relation.kind).map((item) => item.title);
    const targetId = relation.kind === "stem-combination" ? "heavenly-stems" : "earthly-branches";
    return { id: `relation-${relation.id}`, kind: "sexagenary-relation" as const, mode: "review" as const, prompt: `${relation.kind === "stem-combination" ? "天干五合" : relation.kind === "branch-combination" ? "地支六合" : "地支六冲"}中，哪一组配对是${relation.title}？`, targetType: "concept" as const, targetId, display: relation.title, choices: choices(relation.title, sameKind), answer: relation.title, explanation: relation.explanation };
  }),
  ...KNOWLEDGE_CONCEPTS.flatMap((concept) => [
    { id: `concept-name-${concept.id}`, kind: "concept-recall" as const, prompt: `本节学习的知识点名称是什么？`, targetType: "concept" as const, targetId: concept.id, display: concept.summary, choices: choices(concept.title, conceptTitles), answer: concept.title, explanation: `当前知识点是“${concept.title}”，先用一句话复述其定义。` },
    { id: `concept-keyword-${concept.id}`, kind: "concept-recall" as const, prompt: `“${concept.title}”最先要记住哪个关键词？`, targetType: "concept" as const, targetId: concept.id, display: concept.title, choices: choices(concept.keywords[0], [...new Set(KNOWLEDGE_CONCEPTS.flatMap((item) => item.keywords))]), answer: concept.keywords[0], explanation: `本节关键词包括：${concept.keywords.join("、")}。` },
    { id: `concept-stage-${concept.id}`, kind: "concept-recall" as const, prompt: `“${concept.title}”属于哪一个学习阶段？`, targetType: "concept" as const, targetId: concept.id, display: concept.title, choices: choices(concept.stage, [...new Set(KNOWLEDGE_CONCEPTS.map((item) => item.stage))]), answer: concept.stage, explanation: `知识内容索引把它放在${concept.stage}。` },
  ]),
];

export const REVIEW_EXERCISES = EXERCISES;
