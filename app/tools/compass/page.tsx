import Link from "next/link";
import { CompassExplorer } from "@/components/tools/CompassExplorer";

export default function CompassPage() {
  return (
    <main className="subpage tool-page">
      <header className="subpage-header">
        <Link href="/tools" className="back-link">
          ← 工具
        </Link>
        <p className="eyebrow">学习型罗盘 · 八方与二十四山</p>
        <h1>先把角度读清楚。</h1>
        <p className="subpage-lead">
          用手动角度理解
          360°、八方与二十四山。切换地盘正针后可点击盘面定位、查看坐向和正五行，或隐藏标签观察。设备方向读取仍为可选辅助。
        </p>
      </header>
      <CompassExplorer />
      <div className="test-academy-link" aria-label="统一测试入口"><span>需要检验方位记忆？</span><Link className="outline-button" href="/test-academy">进入测试学堂 <span>↗</span></Link></div>
      <section className="pending-content">
        <span className="content-label">学习边界</span>
        <h2>角度是输入，方位是映射</h2>
        <p>
          当前工具把 0° 定义为北，按顺时针方向增加角度，并以每 45°
          为一个八方中心。边界采用中心左右 22.5°
          的几何分区；二十四山以 15° 为间隔，中心左右各 7.5°，边界左闭右开。坐山为向首的对面（相差 180°），其他流派盘层需另列规则与来源。
        </p>
        <div className="cycle-page-links">
          <Link className="outline-button" href="/learn/nine-palaces">
            复习九宫 <span>↗</span>
          </Link>
          <Link className="outline-button" href="/tools/hetu-luoshu">
            打开河图洛书九宫 <span>↗</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
