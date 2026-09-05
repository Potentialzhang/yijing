import type { CalculatedCalendarReading } from "@/core/calendar/calculate";

export function CalendarResult({ reading }: { reading: CalculatedCalendarReading }) {
  const format = (instant: string) => new Intl.DateTimeFormat("zh-CN", {
    timeZone: reading.input.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(instant));
  return <article className="calendar-reading" aria-label="干支与节气计算结果">
    <div className="section-heading"><div><p className="eyebrow">历法计算</p><h2>年、月、日、时</h2></div><span>{reading.input.timeZone}</span></div>
    <div className="calendar-facts four-pillars">
      {(["year", "month", "day", "hour"] as const).map((key, i) => <span key={key}>{["年柱", "月柱", "日柱", "时柱"][i]}<strong>{reading.sexagenary[key]?.label}</strong></span>)}
    </div>
    <div className="calendar-facts"><span>当地时间<strong>{reading.timeInterpretation.localDateTime}</strong></span><span>农历（中国标准时间）<strong>{reading.lunarLabel}</strong></span></div>
    <div className="calendar-facts">{[["上一节气", reading.previousSolarTerm], ["下一节气", reading.nextSolarTerm]].map(([title, term]) => typeof term === "object" && term && <span key={String(title)}>{String(title)}<strong>{term.name}</strong><small>{format(term.occurredAt)}</small></span>)}</div>
    <details open><summary>本年二十四节气 · {reading.input.timeZone}</summary><div className="solar-term-grid">{reading.solarTerms.map(term => <div key={term.occurredAt} data-current={term.occurredAt === reading.previousSolarTerm?.occurredAt}><strong>{term.name}</strong><time dateTime={term.occurredAt}>{format(term.occurredAt)}</time></div>)}</div></details>
    <details><summary>查看计算依据与边界</summary><ol>{reading.explanation.map(text => <li key={text}>{text}</li>)}</ol><p>规则：{reading.ruleSet.id} · 算法：{reading.engine}</p><p><a href="https://github.com/6tail/lunar-typescript" target="_blank" rel="noreferrer">算法文档</a> · <a href="https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2026e.txt" target="_blank" rel="noreferrer">香港天文台日期对照</a></p></details>
  </article>;
}
