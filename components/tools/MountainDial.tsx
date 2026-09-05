"use client";

import { MOUNTAINS, mountainAt } from "@/content/mountains";

function point(degrees: number, radius: number) {
  const angle = degrees * Math.PI / 180;
  return [180 + radius * Math.sin(angle), 180 - radius * Math.cos(angle)];
}
function sector(center: number) {
  const a = point(center - 7.5, 168), b = point(center + 7.5, 168);
  const c = point(center + 7.5, 105), d = point(center - 7.5, 105);
  return `M ${a.join(" ")} A 168 168 0 0 1 ${b.join(" ")} L ${c.join(" ")} A 105 105 0 0 0 ${d.join(" ")} Z`;
}

export function MountainDial({ degrees, hideLabels, showAnswer, onSelect }: {
  degrees: number; hideLabels: boolean; showAnswer: boolean; onSelect: (degrees: number) => void;
}) {
  const current = mountainAt(degrees);
  return <svg viewBox="0 0 360 360" className="mountain-dial" role="group" aria-label="二十四山盘面">
    {MOUNTAINS.map(mountain => {
      const [x, y] = point(mountain.centerDegrees, 137);
      const selected = showAnswer && mountain.id === current.id;
      return <g key={mountain.id} role="button" tabIndex={0} aria-pressed={selected}
        aria-label={hideLabels ? `选择 ${mountain.centerDegrees} 度方位` : `${mountain.name}山，${mountain.centerDegrees}度`}
        onClick={() => onSelect(mountain.centerDegrees)} onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(mountain.centerDegrees); }
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const index = MOUNTAINS.indexOf(mountain);
            const next = event.key === "Home" ? 0 : event.key === "End" ? 23 : (index + (event.key === "ArrowLeft" ? -1 : 1) + 24) % 24;
            (event.currentTarget.parentElement?.children[next] as SVGGElement | undefined)?.focus();
          }
        }} className={selected ? "selected" : ""}>
        <path d={sector(mountain.centerDegrees)} />
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central">{hideLabels ? "·" : mountain.name}</text>
      </g>;
    })}
    {["北", "东", "南", "西"].map((name, i) => { const [x, y] = point(i * 90, 83); return <text key={name} x={x} y={y} textAnchor="middle" dominantBaseline="central">{name}</text>; })}
    <g transform={`rotate(${degrees} 180 180)`} aria-hidden="true"><path className="mountain-needle" d="M 180 76 L 187 186 L 180 181 L 173 186 Z" /></g>
    <text x="180" y="210" textAnchor="middle">{degrees.toFixed(1)}°</text>
  </svg>;
}
