export type SourceKind = "classic" | "book" | "video" | "web" | "personal";
export type SourceStatus = "verified" | "needs-review";
export type SourceReviewOwner = "content-owner" | "project-maintainer" | "user";
export type SourceUsePolicy = "verbatim-allowed" | "metadata-only" | "user-supplied";

export interface ContentSource {
  id: string;
  kind: SourceKind;
  title: string;
  author?: string;
  edition?: string;
  publisher?: string;
  year?: string;
  locator?: string;
  url?: string;
  accessedAt?: string;
  status: SourceStatus;
  copyrightNote: string;
  reviewOwner: SourceReviewOwner;
  usePolicy: SourceUsePolicy;
}

/**
 * Citation policy is kept next to the registry so content validation and any
 * future editorial tooling share the same rules.  Pending sources are
 * intentionally metadata-only until a human confirms the edition/licence.
 */
export const SOURCE_CITATION_POLICY = {
  version: 1,
  classic: { allowedUse: "verbatim-allowed", requiredFields: ["title", "edition", "status", "copyrightNote"] },
  book: { allowedUse: "metadata-only", requiredFields: ["title", "author", "edition", "locator", "copyrightNote"] },
  video: { allowedUse: "metadata-only", requiredFields: ["title", "author", "url", "locator", "copyrightNote"] },
  web: { allowedUse: "metadata-only", requiredFields: ["title", "url", "accessedAt", "copyrightNote"] },
  personal: { allowedUse: "user-supplied", requiredFields: ["title", "copyrightNote"] },
} as const;

export const SOURCE_REGISTRY: readonly ContentSource[] = [
  {
    id: "source-zhouyi-kanripo", kind: "classic", title: "《周易》经文 · Kanripo KR1a0001",
    edition: "TLS 转录，固定修订 8284adbf9e3435d713180e24f05bf75f8b7d1d96",
    url: "https://github.com/kanripo/KR1a0001/tree/8284adbf9e3435d713180e24f05bf75f8b7d1d96",
    accessedAt: "2026-09-05", status: "verified", reviewOwner: "project-maintainer",
    copyrightNote: "公版古籍原文；保留转录异体字与标点，仅机械移除页码和换行。逐文件 SHA-256 留存于数据文件。",
    usePolicy: "verbatim-allowed",
  },
  {
    id: "source-lunar-typescript", kind: "web", title: "lunar-typescript 1.8.6 算法与文档",
    url: "https://github.com/6tail/lunar-typescript", accessedAt: "2026-09-05", status: "verified",
    copyrightNote: "MIT 许可依赖；算法结果与项目规则分开说明。", reviewOwner: "project-maintainer", usePolicy: "metadata-only",
  },
  {
    id: "source-hko-calendar", kind: "web", title: "香港天文台 2026 公历与农历对照表",
    url: "https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2026e.txt", accessedAt: "2026-09-05", status: "verified",
    copyrightNote: "登记来源并核对日期事实；不转载年历全文。", reviewOwner: "project-maintainer", usePolicy: "metadata-only",
  },
  {
    id: "source-mountains-zhengzhen", kind: "web", title: "二十四山方位表 · 地盘正针",
    url: "https://zh.wikipedia.org/wiki/羅庚", accessedAt: "2026-09-05", status: "verified",
    copyrightNote: "登记方位事实；盘面与说明由项目实现。正五行沿用内置干支与八卦属性。", reviewOwner: "project-maintainer", usePolicy: "metadata-only",
  },
  {
    id: "source-project-editorial",
    kind: "personal",
    title: "易境项目自编基础内容",
    author: "易境项目组",
    edition: "内置学习版 v0.1",
    publisher: "易境项目",
    year: "2026",
    locator: "content/knowledge.ts · content/exercises.ts",
    status: "verified",
    copyrightNote: "项目自编，用于学习界面和练习解释。",
    reviewOwner: "project-maintainer",
    usePolicy: "user-supplied",
  },
  {
    id: "source-zhouyi-zhengyi-wikisource", kind: "classic", title: "《周易正义》·维基文库",
    author: "王弼注、孔颖达疏", edition: "四库全书本数字转录",
    url: "https://zh.wikisource.org/zh-hans/%E5%91%A8%E6%98%93%E6%AD%A3%E7%BE%A9_(%E5%9B%9B%E5%BA%AB%E5%85%A8%E6%9B%B8%E6%9C%AC)",
    accessedAt: "2026-09-06", status: "verified", reviewOwner: "project-maintainer",
    copyrightNote: "公版古籍；数字文本按 CC BY-SA 标注来源与出处。", usePolicy: "verbatim-allowed",
  },
  {
    id: "source-yichuan-yizhuan-wikisource", kind: "classic", title: "《伊川易传》·维基文库",
    author: "程颐", edition: "维基文库数字转录",
    url: "https://zh.wikisource.org/zh-hans/%E4%BC%8A%E5%B7%9D%E6%98%93%E5%82%B3",
    accessedAt: "2026-09-06", status: "verified", reviewOwner: "project-maintainer",
    copyrightNote: "公版古籍；数字文本按 CC BY-SA 标注来源与出处。", usePolicy: "verbatim-allowed",
  },
  {
    id: "source-yichuan-kanripo", kind: "classic", title: "《伊川易传》·Kanripo KR1a0016",
    author: "程頤", edition: "四庫全書本·固定修订 6caf488397a8",
    url: "https://github.com/kanripo/KR1a0016/tree/6caf488397a8175e80757ec186e410a0160e7f67",
    accessedAt: "2026-09-06", status: "verified", reviewOwner: "project-maintainer",
    copyrightNote: "公版古籍；数字底本固定到 Kanripo 具体修订。", usePolicy: "verbatim-allowed",
  },
  {
    id: "source-benyi-kanripo", kind: "classic", title: "《周易本义》·Kanripo KR1a0032",
    author: "朱熹", edition: "四库全书本·固定修订 16fb9efd269c",
    url: "https://github.com/kanripo/KR1a0032/tree/16fb9efd269cd8a2ca682ced0d576d9c72e08125",
    accessedAt: "2026-09-06", status: "verified", reviewOwner: "project-maintainer",
    copyrightNote: "公版古籍；数字底本固定到 Kanripo 具体修订。", usePolicy: "verbatim-allowed",
  },
  {
    id: "source-zhushu-kanripo", kind: "classic", title: "《周易注疏》·Kanripo KR1a0007",
    author: "王弼注、孔颖达疏", edition: "四库全书本·固定修订 0fa05af11e92",
    url: "https://github.com/kanripo/KR1a0007/tree/0fa05af11e9229b6cc6febe312d541fc6d4ec3bf",
    accessedAt: "2026-09-06", status: "verified", reviewOwner: "project-maintainer",
    copyrightNote: "公版古籍；数字底本固定到 Kanripo 具体修订。", usePolicy: "verbatim-allowed",
  },
  {
    id: "source-zhouyi-benyi-wikisource", kind: "classic", title: "《原本周易本义》·维基文库",
    author: "朱熹", edition: "四库全书本数字转录",
    url: "https://zh.wikisource.org/zh-hans/%E5%8E%9F%E6%9C%AC%E5%91%A8%E6%98%93%E6%9C%AC%E7%BE%A9_(%E5%9B%9B%E5%BA%AB%E5%85%A8%E6%9B%B8%E6%9C%AC)",
    accessedAt: "2026-09-06", status: "verified", reviewOwner: "project-maintainer",
    copyrightNote: "公版古籍；数字文本按 CC BY-SA 标注来源与出处。", usePolicy: "verbatim-allowed",
  },
  {
    id: "source-zhouyi-jijie-wikisource", kind: "classic", title: "《周易集解》·维基文库",
    author: "李鼎祚", edition: "四库全书本数字转录",
    url: "https://zh.wikisource.org/zh-hans/%E5%91%A8%E6%98%93%E9%9B%86%E8%A7%A3_(%E5%9B%9B%E5%BA%AB%E5%85%A8%E6%9B%B8%E6%9C%AC)",
    accessedAt: "2026-09-06", status: "verified", reviewOwner: "project-maintainer",
    copyrightNote: "公版古籍；数字文本按 CC BY-SA 标注来源与出处。", usePolicy: "verbatim-allowed",
  },
  {
    id: "source-zhouyi-zhezhong-wikisource", kind: "classic", title: "《御纂周易折中》·维基文库",
    author: "李光地等", edition: "四库全书本数字转录",
    url: "https://zh.wikisource.org/zh-hans/%E5%BE%A1%E7%BA%82%E5%91%A8%E6%98%93%E6%8A%98%E4%B8%AD_(%E5%9B%9B%E5%BA%AB%E5%85%A8%E6%9B%B8%E6%9C%AC)",
    accessedAt: "2026-09-06", status: "verified", reviewOwner: "project-maintainer",
    copyrightNote: "公版古籍；数字文本按 CC BY-SA 标注来源与出处。", usePolicy: "verbatim-allowed",
  },
  {
    id: "source-zhouyi-classic-pending",
    kind: "classic",
    title: "《周易》经文底本（待确定）",
    status: "needs-review",
    copyrightNote: "底本、版本和公版状态尚待内容负责人确认。",
    reviewOwner: "content-owner",
    usePolicy: "verbatim-allowed",
  },
  {
    id: "source-modern-book-pending",
    kind: "book",
    title: "现代参考书（待登记）",
    status: "needs-review",
    copyrightNote: "确认书名、作者、版本、授权范围后，仅登记必要摘要和定位。",
    reviewOwner: "content-owner",
    usePolicy: "metadata-only",
  },
  {
    id: "source-modern-video-pending",
    kind: "video",
    title: "现代课程或视频（待登记）",
    status: "needs-review",
    copyrightNote: "确认作者/频道、链接和授权范围后，仅登记必要摘要和时间点。",
    reviewOwner: "content-owner",
    usePolicy: "metadata-only",
  },
  {
    id: "source-modern-web-pending",
    kind: "web",
    title: "现代网页资料（待登记）",
    status: "needs-review",
    copyrightNote: "确认网页标题、链接、访问日期和授权范围后，仅登记元数据。",
    reviewOwner: "content-owner",
    usePolicy: "metadata-only",
  },
];
