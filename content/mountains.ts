import { normalizeDegrees } from "@/core/compass/directions";

const NAMES = "子癸丑艮寅甲卯乙辰巽巳丙午丁未坤申庚酉辛戌乾亥壬";
// 正五行；不等同于洪范五行，也不把三元龙阴阳套到干支本义上。
const ELEMENTS = "水水土土木木木木土木火火火火土土金金金金土金水水";
export const MOUNTAINS = [...NAMES].map((name, index) => ({
  id: `mountain-${index}`, name, centerDegrees: index * 15,
  startDegrees: normalizeDegrees(index * 15 - 7.5),
  endDegrees: normalizeDegrees(index * 15 + 7.5),
  element: ELEMENTS[index],
  sourceIds: ["source-mountains-zhengzhen"],
  ruleVersion: "zhengzhen-24-v1",
}));

export function mountainAt(degrees: number) {
  return MOUNTAINS[Math.floor((normalizeDegrees(degrees) + 7.5) / 15) % 24];
}

export function mountainBearing(degrees: number) {
  return { facing: mountainAt(degrees), sitting: mountainAt(degrees + 180) };
}
