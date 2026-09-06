import Link from "next/link";

const tools = [
  {
    href: "/tools/five-elements",
    title: "五行生克",
    description: "切换相生、相克和同时显示，查看关系方向。",
    label: "关系图",
  },
  {
    href: "/tools/trigrams",
    title: "八卦卡片",
    description: "查看三爻结构、象意、五行与先后天方位。",
    label: "结构卡",
  },
  {
    href: "/tools/sexagenary-relations",
    title: "干支关系",
    description: "分层查看天干五合、地支六合与六冲。",
    label: "规则表",
  },
  {
    href: "/tools/hetu-luoshu",
    title: "河图 · 洛书 · 九宫",
    description: "分别查看数字结构、方位提示和九宫关联卦。",
    label: "方位表",
  },
  {
    href: "/tools/calendar",
    title: "干支与节气",
    description: "按时区计算四柱与二十四节气，比较零点和子初换日。",
    label: "计算器",
  },
  {
    href: "/tools/compass",
    title: "360° 学习罗盘",
    description: "切换八方和二十四山，点击定位、查看边界、记录坐向。",
    label: "罗盘",
  },
  {
    href: "/divination",
    title: "六次铜钱起卦",
    description: "依次录入六次铜钱结果，自动生成本卦、动爻和变卦。",
    label: "算卦",
  },
];

export default function ToolsPage() {
  return (
    <main className="subpage tools-page">
      <header className="subpage-header">
        <Link href="/" className="back-link">
          ← 回到今日
        </Link>
        <p className="eyebrow">工具集合 · 结构优先</p>
        <h1>把关系放到眼前。</h1>
        <p className="subpage-lead">
          工具用于查看结构、计算干支和记录方位；需要答题时，统一进入测试学堂。历法计算和罗盘映射均列出所用规则，不用于预测命运。
        </p>
        <Link className="outline-button tools-test-link" href="/test-academy">进入测试学堂 <span>↗</span></Link>
      </header>
      <div className="tools-hub-grid">
        {tools.map((tool) => (
          <Link href={tool.href} className="tools-hub-card" key={tool.href}>
            <span>{tool.label}</span>
            <h2>{tool.title}</h2>
            <p>{tool.description}</p>
            <strong>打开工具 ↗</strong>
          </Link>
        ))}
      </div>
    </main>
  );
}
