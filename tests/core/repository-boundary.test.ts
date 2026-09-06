import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeImportedBackupData } from "@/db/backup-repository";

function sourceFiles(root: string): string[] {
  const directory = join(process.cwd(), root);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(join(root, entry.name));
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("数据库访问边界", () => {
  it("领域 core 不直接依赖浏览器 DOM 或存储 API", () => {
    const files = sourceFiles("core").filter((file) => !file.includes("/core/browser/"));
    const browserApiPattern = /typeof\s+(?:window|document)\b|\bwindow\.(?:addEventListener|removeEventListener|localStorage)\b|\bdocument\.(?:addEventListener|removeEventListener|visibilityState)\b|\bnavigator\.|\b(?:localStorage|sessionStorage|BroadcastChannel)\b/;
    const violations = files.filter((file) => browserApiPattern.test(readFileSync(file, "utf8")));
    expect(violations.map((file) => file.replace(`${process.cwd()}/`, ""))).toEqual([]);
  });

  it("页面组件不直接访问 Dexie 表", () => {
    const files = [...sourceFiles("app"), ...sourceFiles("components")];
    const violations = files.filter((file) => /yijingDb\s*\./.test(readFileSync(file, "utf8")));
    expect(violations.map((file) => file.replace(`${process.cwd()}/`, ""))).toEqual([]);
  });

  it("页面组件只通过统一 repository 入口调用持久化领域操作", () => {
    const files = [...sourceFiles("app"), ...sourceFiles("components")];
    const violations = files.filter((file) => /@\/db\/(migrations|preferences|progress|review)(?:[\"'])/.test(readFileSync(file, "utf8")));
    expect(violations.map((file) => file.replace(`${process.cwd()}/`, ""))).toEqual([]);
  });

  it("页面组件对数据库 schema 只保留类型导入", () => {
    const files = [...sourceFiles("app"), ...sourceFiles("components")];
    const violations = files.flatMap((file) => readFileSync(file, "utf8").split("\n")
      .filter((line) => line.includes('@/db/schema') && !/^\s*import\s+type\b/.test(line) && !/^\s*import\s*\{\s*type\b/.test(line))
      .map(() => file));
    expect(violations.map((file) => file.replace(`${process.cwd()}/`, ""))).toEqual([]);
  });

  it("生产 E2E 并行运行时使用隔离端口并同步清理范围", () => {
    const config = readFileSync(join(process.cwd(), "playwright.production.config.ts"), "utf8");
    const runner = readFileSync(join(process.cwd(), "scripts/run-production-e2e.mjs"), "utf8");
    expect(config).toContain("YIJING_PRODUCTION_PORT");
    expect(config).toContain("baseURL: productionBaseURL");
    expect(config).toContain("url: productionBaseURL");
    expect(config).toContain("--port ${productionPort}");
    expect(runner).toContain("createServer");
    expect(runner).toContain("const productionPort = configuredPort === undefined");
    expect(runner).toContain("YIJING_PRODUCTION_PORT: String(productionPort)");
    expect(runner).toContain("listeningPids(productionPort)");
  });

  it("生产冒烟默认使用临时端口并保留显式地址契约", () => {
    const smoke = readFileSync(join(process.cwd(), "scripts/smoke-production.mjs"), "utf8");
    expect(smoke).toContain("function positiveNumber(value, fallback)");
    expect(smoke).toContain("const normalizedTimeoutMs = positiveNumber(timeoutMs, 30_000)");
    expect(smoke).toContain("function fetchWithinDeadline(url, init, deadline)");
    expect(smoke).toContain("new AbortController()");
    expect(smoke).toContain("const deadline = Date.now() + normalizedTimeoutMs");
    expect(smoke).toContain("await assertRoutes(deadline)");
    expect(smoke).toContain("createServer");
    expect(smoke).toContain("findFreePort(host)");
    expect(smoke).toContain("process.env.SMOKE_PORT === undefined");
    expect(smoke).toContain("parsePort(process.env.SMOKE_PORT)");
    expect(smoke).toContain("process.env.SMOKE_BASE_URL ?? `http://${host}:${port}`");
  });

  it("笔记删除与撤销使用原子更新而不是覆盖旧快照", () => {
    const editor = readFileSync(join(process.cwd(), "components/notes/NoteEditor.tsx"), "utf8");
    expect(editor).toContain("updateNoteAtomically");
    expect(editor).not.toContain("putNote");
    expect(editor).toContain("createSerialTaskQueue");
    expect(editor).toContain("saveQueue.current.enqueue");
    expect(editor).toContain("const undoClearTimer = useRef<number | null>(null)");
    expect(editor).toContain("const mountedRef = useRef(false)");
    expect(editor).toContain("const mutationBusyRef = useRef(false)");
    expect(editor).toContain("if (mutationBusyRef.current) return");
    expect(editor).toContain("saveQueue.current.enqueue(async () => {");
    expect(editor).toContain("正在删除…");
    expect(editor).toContain("正在撤销删除…");
    expect(editor).toContain("disabled={mutationBusy}");
    expect(editor).toContain("mountedRef.current = false");
    expect(editor).toContain("if (mountedRef.current) setStatus");
    expect(editor).toContain("window.clearTimeout(undoClearTimer.current)");
    expect(editor).toContain("undoClearTimer.current = window.setTimeout");
  });

  it("笔记原子写入统一复用领域归一化", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    expect(repository).toContain("normalizeNoteForWrite");
    expect(repository).toContain("normalizeSourceRefForWrite(sourceRef)");
    expect(repository).toContain("normalizeNoteForKey(id, next)");
    expect(repository).toContain("记录 ID 与原子操作目标不一致");
    expect(readFileSync(join(process.cwd(), "core/notes/records.ts"), "utf8")).toContain("更新时间不能早于创建时间");
  });

  it("勘误状态切换使用原子更新而不是回写列表旧对象", () => {
    const editor = readFileSync(join(process.cwd(), "components/content/ContentErrata.tsx"), "utf8");
    expect(editor).toContain("updateErratumAtomically");
    expect(editor).toContain("const [writing, setWriting] = useState(false)");
    expect(editor).toContain("if (loading || readError || writing) return;");
    expect(editor).toContain("const writeDisabled = loading || readError || writing");
    expect(editor).toContain("disabled={writeDisabled}");
    expect(editor).toContain("正在保存勘误记录");
  });

  it("复习界面对损坏状态给出可恢复提示", () => {
    const session = readFileSync(join(process.cwd(), "components/review/ReviewSession.tsx"), "utf8");
    const instant = readFileSync(join(process.cwd(), "components/learning/InstantPractice.tsx"), "utf8");
    expect(session).toContain("InvalidReviewStateError");
    expect(session).toContain("复习状态已损坏");
    expect(instant).toContain("InvalidReviewStateError");
    expect(instant).toContain("复习状态已损坏");
  });

  it("来源编辑器使用统一串行队列保护连续保存", () => {
    const editor = readFileSync(join(process.cwd(), "components/notes/SourceRefEditor.tsx"), "utf8");
    expect(editor).toContain("createSerialTaskQueue");
    expect(editor).toContain("saveQueue.current.enqueue");
    expect(editor).toContain("replaceSourceRefAtPreservingRest");
    expect(editor).toContain("isValidLocalDate");
    expect(editor).toContain("访问日期无效");
    expect(editor).toContain('target="_blank"');
    expect(editor).toContain('rel="noreferrer noopener"');
    const contentPage = readFileSync(join(process.cwd(), "app/settings/content/page.tsx"), "utf8");
    expect(contentPage).toContain('target="_blank"');
    expect(contentPage).toContain('rel="noreferrer noopener"');
  });

  it("时间排序统一按实际时间瞬间比较", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    const notesPage = readFileSync(join(process.cwd(), "app/notes/page.tsx"), "utf8");
    expect(repository).toContain("compareIsoTimestamps");
    expect(repository).not.toContain('orderBy("updatedAt")');
    expect(notesPage).toContain("compareIsoTimestamps");
    expect(notesPage).not.toContain("updatedAt.localeCompare");
    expect(notesPage).not.toContain("createdAt.localeCompare");
  });

  it("repository 门面本身存在并集中实现表访问", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    const backupRepository = readFileSync(join(process.cwd(), "db/backup-repository.ts"), "utf8");
    expect(repository).toContain("yijingDb");
    expect(backupRepository).toContain("mergeBackupData");
    expect(statSync(join(process.cwd(), "db/repository.ts")).isFile()).toBe(true);
  });

  it("服务端数据库迁移覆盖个人业务表", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    const migration = readFileSync(join(process.cwd(), "scripts/migrate.mjs"), "utf8");
    expect(repository).not.toContain("indexedDB");
    expect(migration).toContain("schema_migrations");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS favorites");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS lab_snapshots");
  });

  it("客户端启动不打开浏览器数据库", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    const schema = readFileSync(join(process.cwd(), "db/schema.ts"), "utf8");
    expect(repository).not.toContain("indexedDB");
    expect(schema).not.toContain("Dexie");
    expect(schema).toContain("/api/data");
  });

  it("统一备份入口会先归一化旧版勘误记录", () => {
    const input = {
      notes: [],
      reviewAttempts: [],
      reviewCardStates: [],
      conceptProgress: [],
      favorites: [],
      preferences: [],
      labSnapshots: [],
      errata: [{ id: "legacy", targetType: "concept", targetId: "yin-yang-lines" } as never],
      compassRecords: [],
      compassCorrections: [],
    };
    const normalized = normalizeImportedBackupData(input);
    expect(normalized.errata[0]).toMatchObject({
      id: "legacy",
      status: "open",
      category: "question",
      contentVersion: 1,
    });
    expect(normalized.errata[0].history).toHaveLength(1);
    expect(input.errata[0]).toEqual({
      id: "legacy",
      targetType: "concept",
      targetId: "yin-yang-lines",
    });
    expect(normalizeImportedBackupData(normalized).errata[0]).toEqual(normalized.errata[0]);
  });

  it("合并入口在事务前固定归一化后的输入快照", () => {
    const backupRepository = readFileSync(join(process.cwd(), "db/backup-repository.ts"), "utf8");
    expect(backupRepository).toContain("const normalizedData = normalizeImportedBackupData(data)");
    expect(backupRepository).toContain("assertBackupDataIntegrity(normalizedData)");
    expect(backupRepository).toContain("summarizeImport(normalizedData, currentData)");
  });

  it("撤销导入在同一事务内读取并恢复最新快照", () => {
    const backupRepository = readFileSync(join(process.cwd(), "db/backup-repository.ts"), "utf8");
    const undoStart = backupRepository.indexOf("export async function undoLatestImport");
    expect(undoStart).toBeGreaterThanOrEqual(0);
    const undoBody = backupRepository.slice(undoStart);
    expect(undoBody).toContain('return yijingDb.transaction(\n    "rw"');
    expect(undoBody.indexOf('yijingDb.recoverySnapshots.get("latest-import")')).toBeGreaterThan(undoBody.indexOf("async () => {"));
    expect(undoBody).toContain('yijingDb.recoverySnapshots.delete("latest-import")');
  });

  it("清空确认摘要在单一只读事务内统计所有数据表", () => {
    const backupRepository = readFileSync(join(process.cwd(), "db/backup-repository.ts"), "utf8");
    const countStart = backupRepository.indexOf("export async function countUserData");
    const countBody = backupRepository.slice(countStart, backupRepository.indexOf("export async function clearUserData", countStart));
    expect(countBody).toContain('return yijingDb.transaction("r", userDataTables');
    expect(countBody).toContain("yijingDb.notes.count()");
    expect(countBody).toContain("yijingDb.compassCorrections.count()");
  });

  it("今日摘要与统计从单一只读事务读取学习记录快照", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    const snapshotStart = repository.indexOf("export function readStudySnapshot");
    const snapshotBody = repository.slice(snapshotStart, repository.indexOf("export function getReviewCardState", snapshotStart));
    expect(snapshotBody).toContain('yijingDb.transaction(\n    "r"');
    expect(snapshotBody).toContain("yijingDb.reviewCardStates.toArray()");
    expect(snapshotBody).toContain("yijingDb.conceptProgress.toArray()");
    expect(snapshotBody).toContain("yijingDb.reviewAttempts.toArray()");
  });

  it("个人知识库从单一只读事务读取笔记与收藏快照", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    const notesPage = readFileSync(join(process.cwd(), "app/notes/page.tsx"), "utf8");
    const snapshotStart = repository.indexOf("export function readKnowledgeBaseSnapshot");
    const snapshotBody = repository.slice(snapshotStart, repository.indexOf("export function getFavorite", snapshotStart));
    expect(snapshotBody).toContain('yijingDb.transaction(\n    "r"');
    expect(snapshotBody).toContain("yijingDb.notes.toArray()");
    expect(snapshotBody).toContain("yijingDb.favorites.toArray()");
    expect(notesPage).toContain("readKnowledgeBaseSnapshot");
    expect(notesPage).not.toContain("Promise.all([\n      listNotesByUpdatedAt()");
  });

  it("复习队列从单一只读事务读取偏好与卡片状态", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    const session = readFileSync(join(process.cwd(), "components/review/ReviewSession.tsx"), "utf8");
    const snapshotStart = repository.indexOf("export function readReviewQueueSnapshot");
    const snapshotBody = repository.slice(snapshotStart, repository.indexOf("export function getFavorite", snapshotStart));
    expect(snapshotBody).toContain('yijingDb.transaction(\n    "r"');
    expect(snapshotBody).toContain("yijingDb.reviewCardStates.toArray()");
    expect(snapshotBody).toContain("yijingDb.reviewAttempts.toArray()");
    expect(snapshotBody).toContain('yijingDb.preferences.get("dailyNewCardLimit")');
    expect(snapshotBody).toContain('yijingDb.preferences.get("sessionBatchSize")');
    expect(snapshotBody).toContain("responseTimesMs");
    expect(session).toContain("readReviewQueueSnapshot");
    expect(session).not.toContain('getPreference("dailyNewCardLimit")');
    expect(session).not.toContain('getReviewCardState(exercise.id)');
  });

  it("跨标签广播失败时不会阻断本地变更通知", () => {
    const events = readFileSync(join(process.cwd(), "db/events.ts"), "utf8");
    expect(events).toContain("tryPostDataChanged");
    expect(events).toContain("dataChannel = null");
    expect(events).not.toContain("localStorage");
    expect(events).toContain("BroadcastChannel");
  });

  it("六十四卦索引从单一只读事务读取收藏与学习状态", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    const index = readFileSync(join(process.cwd(), "components/hexagram/HexagramIndex.tsx"), "utf8");
    const snapshotStart = repository.indexOf("export function readHexagramIndexSnapshot");
    const snapshotBody = repository.slice(snapshotStart, repository.indexOf("export function getFavorite", snapshotStart));
    expect(snapshotBody).toContain('yijingDb.transaction(\n    "r"');
    expect(snapshotBody).toContain("yijingDb.favorites.toArray()");
    expect(snapshotBody).toContain("yijingDb.reviewCardStates.toArray()");
    expect(index).toContain("readHexagramIndexSnapshot");
    expect(index).not.toContain("Promise.all([listFavorites(), listReviewCardStates()])");
  });

  it("首页勘误汇总从单一只读事务读取待处理列表与计数", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    const feedback = readFileSync(join(process.cwd(), "components/content/ContentAuditFeedback.tsx"), "utf8");
    const snapshotStart = repository.indexOf("export function readErrataSummarySnapshot");
    const snapshotBody = repository.slice(snapshotStart, repository.indexOf("export function putErratum", snapshotStart));
    expect(snapshotBody).toContain('yijingDb.transaction("r", yijingDb.errata');
    expect(snapshotBody).toContain('yijingDb.errata.where("status").equals("open").toArray()');
    expect(snapshotBody).toContain('yijingDb.errata.where("status").equals("resolved").count()');
    expect(feedback).toContain("readErrataSummarySnapshot");
    expect(feedback).not.toContain("Promise.all([\n      listOpenErrata()");
  });

  it("数据设置页从单一只读事务读取恢复快照与备份时间", () => {
    const repository = readFileSync(join(process.cwd(), "db/backup-repository.ts"), "utf8");
    const backup = readFileSync(join(process.cwd(), "components/data/DataBackup.tsx"), "utf8");
    const snapshotStart = repository.indexOf("export function readBackupMetadataSnapshot");
    const snapshotBody = repository.slice(snapshotStart, repository.indexOf("export async function mergeBackupData", snapshotStart));
    expect(snapshotBody).toContain('yijingDb.transaction(\n    "r"');
    expect(snapshotBody).toContain('yijingDb.recoverySnapshots.get("latest-import")');
    expect(snapshotBody).toContain('yijingDb.preferences.get("lastExportAt")');
    expect(backup).toContain("readBackupMetadataSnapshot");
    expect(backup).not.toContain("Promise.all([\n        hasRecoverySnapshot()");
  });

  it("偏好读取使用统一快照，AI 相关偏好使用原子批量写入", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    const preferences = readFileSync(join(process.cwd(), "components/settings/Preferences.tsx"), "utf8");
    const hydrator = readFileSync(join(process.cwd(), "components/settings/PreferenceHydrator.tsx"), "utf8");
    const ai = readFileSync(join(process.cwd(), "components/settings/AIAssistSettings.tsx"), "utf8");
    const snapshotStart = repository.indexOf("export function readPreferenceSnapshot");
    const snapshotBody = repository.slice(snapshotStart, repository.indexOf("export type PreferenceUpdate", snapshotStart));
    expect(snapshotBody).toContain('yijingDb.transaction("r", yijingDb.preferences');
    expect(snapshotBody).toContain("yijingDb.preferences.bulkGet");
    expect(repository).toContain("const preferenceWriteQueue = createSerialTaskQueue()");
    expect(repository).toContain("persistPreference");
    expect(repository).toContain("preferenceWriteQueue.enqueue");
    expect(preferences).toContain("readPreferenceSnapshot");
    expect(preferences).not.toContain('getPreference("theme")');
    expect(preferences).toContain("preferenceWriteQueue");
    expect(preferences).toContain("setPreferencesAtomically");
    expect(preferences).not.toContain("setPreference(");
    expect(preferences).toContain("const themeRef = useRef<string>(DEFAULT_PREFERENCES.theme)");
    expect(preferences).toContain("const fontScaleRef = useRef<string>(DEFAULT_PREFERENCES.fontScale)");
    expect(preferences).toContain("applyVisualPreferences(value, fontScaleRef.current)");
    expect(preferences).toContain("applyVisualPreferences(themeRef.current, value)");
    expect(hydrator).toContain("readPreferenceSnapshot");
    expect(ai).toContain("readPreferenceSnapshot");
    expect(ai).toContain("setPreferencesAtomically");
    expect(ai).toContain("preferenceWriteQueue");
    expect(ai).not.toContain("setPreference(");
    expect(ai).not.toContain('setPreference("aiAssistEnabled", nextEnabled)');
  });

  it("学习摘要读取失败时显示可重试错误而不是静默显示空数据", () => {
    const files = [
      "components/dashboard/TodayStats.tsx",
      "components/dashboard/TodayTasks.tsx",
      "components/dashboard/StudyStats.tsx",
      "components/review/WeakPoints.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain("StudyDataError");
      expect(source).toContain("StudyDataLoading");
      expect(source).not.toContain(".catch(() => undefined)");
    }
  });

  it("偏好设置首次读取完成前不会提交未确认的默认值", () => {
    const preferences = readFileSync(join(process.cwd(), "components/settings/Preferences.tsx"), "utf8");
    expect(preferences).toContain("const [loading, setLoading] = useState(true)");
    expect(preferences).toContain("{loading ? \"正在读取设置…\" : status}");
    expect(preferences).toContain("disabled={loading}");
  });

  it("笔记聚合读取失败时不会静默显示空知识库", () => {
    const notesPage = readFileSync(join(process.cwd(), "app/notes/page.tsx"), "utf8");
    expect(notesPage).toContain("正在读取账户笔记");
    expect(notesPage).toContain("笔记暂时无法读取");
    expect(notesPage).toContain("onClick={refresh}");
    expect(notesPage).not.toContain(".catch(() => undefined)");
  });

  it("六十四卦索引读取状态失败时不会静默显示错误的学习标记", () => {
    const index = readFileSync(join(process.cwd(), "components/hexagram/HexagramIndex.tsx"), "utf8");
    expect(index).toContain("正在读取卦象学习状态");
    expect(index).toContain("卦象学习状态暂时无法读取");
    expect(index).toContain("onClick={refreshStatus}");
    expect(index).not.toContain(".catch(() => undefined)");
  });

  it("详情学习状态读取失败时不会静默回退为未开始", () => {
    const status = readFileSync(join(process.cwd(), "components/review/ReviewTargetLearningStatus.tsx"), "utf8");
    expect(status).toContain("正在读取学习状态");
    expect(status).toContain("学习状态暂时无法读取");
    expect(status).toContain("onClick={refresh}");
    expect(status).toContain("lastTarget.current !== targetKey");
    expect(status).toContain("isValidReviewState");
    expect(status).toContain("数据待修复");
    expect(status).toContain('href="/settings/data"');
  });

  it("薄弱点列表不会展示结构损坏的复习卡", () => {
    const weakPoints = readFileSync(join(process.cwd(), "components/review/WeakPoints.tsx"), "utf8");
    expect(weakPoints).toContain("isValidReviewState");
  });

  it("首页与统计页只使用可解释的复习状态作答记录", () => {
    const todayStats = readFileSync(join(process.cwd(), "components/dashboard/TodayStats.tsx"), "utf8");
    const studyStats = readFileSync(join(process.cwd(), "components/dashboard/StudyStats.tsx"), "utf8");
    const confusions = readFileSync(join(process.cwd(), "core/review/confusion.ts"), "utf8");
    expect(todayStats).toContain("isValidReviewState");
    expect(studyStats).toContain("isValidReviewState");
    expect(confusions).toContain("isValidReviewState");
  });

  it("学习地图进度读取失败时不会静默回退为未开始", () => {
    const status = readFileSync(join(process.cwd(), "components/learning/LessonStatus.tsx"), "utf8");
    expect(status).toContain("正在读取");
    expect(status).toContain("学习状态暂时无法读取");
    expect(status).toContain("onClick={refresh}");
    expect(status).not.toContain(".catch(() => undefined)");
    expect(status).toContain("lastConceptId.current !== conceptId");
  });

  it("前置知识读取期间显示状态且失败后可就地重试", () => {
    const notice = readFileSync(join(process.cwd(), "components/learning/PrerequisiteNotice.tsx"), "utf8");
    expect(notice).toContain("const [loading, setLoading] = useState(prerequisites.length > 0)");
    expect(notice).toContain("prerequisite-loading");
    expect(notice).toContain("重试读取");
    expect(notice).toContain("onClick={() => void refresh()}");
  });

  it("AI 授权设置首次读取期间不会展示或提交未确认的默认值", () => {
    const settings = readFileSync(join(process.cwd(), "components/settings/AIAssistSettings.tsx"), "utf8");
    expect(settings).toContain("const [loading, setLoading] = useState(true)");
    expect(settings).toContain("正在读取 AI 设置…");
    expect(settings).toContain("重试读取");
    expect(settings).toContain("disabled={loading || loadError}");
    expect(settings).toContain("window.addEventListener(DATA_CHANGED_EVENT, refresh)");
    expect(settings).toContain('current.startsWith("AI 设置读取失败")');
    expect(settings).toContain("const mountedRef = useRef(false)");
    expect(settings).toContain("mountedRef.current = false");
    expect(settings).toContain("if (mountedRef.current) setStatus");
    expect(settings).toContain("const enabledRef = useRef(false)");
    expect(settings).toContain("const scopesRef = useRef<AiScopeId[]>([])");
    expect(settings).toContain('const purposeRef = useRef<AiPreviewPurpose>("study-draft")');
    expect(settings).toContain("saveConsent(enabledRef.current, nextScopes, purposeRef.current)");
    expect(settings).toContain("saveConsent(enabledRef.current, scopesRef.current, nextPurpose)");
  });

  it("数据备份页读取提醒失败时不掩盖错误并支持重试", () => {
    const backup = readFileSync(join(process.cwd(), "components/data/DataBackup.tsx"), "utf8");
    expect(backup).toContain("const [metadataLoading, setMetadataLoading] = useState(true)");
    expect(backup).toContain("const [metadataError, setMetadataError] = useState(false)");
    expect(backup).toContain("备份提醒暂时无法读取");
    expect(backup).toContain("onClick={refreshMetadata}");
    expect(backup).toContain("window.addEventListener(DATA_CHANGED_EVENT, refreshMetadata)");
    expect(backup).toContain("metadataSequence.current += 1");
    expect(backup).toContain("const mountedRef = useRef(false)");
    expect(backup).toContain("if (!mountedRef.current) return");
    expect(backup).toContain("if (mountedRef.current) setExporting(false)");
    expect(backup).toContain("if (mountedRef.current) setImporting(false)");
    expect(backup).toContain("if (mountedRef.current) setClearing(false)");
  });

  it("快速自测读取期间不会覆盖进行中的答题，并提供重试", () => {
    const selfTest = readFileSync(join(process.cwd(), "components/onboarding/SelfTest.tsx"), "utf8");
    expect(selfTest).toContain("const [loading, setLoading] = useState(true)");
    expect(selfTest).toContain("正在读取上次自测…");
    expect(selfTest).toContain("const startedRef = useRef(false)");
    expect(selfTest).toContain("if (startedRef.current) return");
    expect(selfTest).toContain("重试读取");
    expect(selfTest).toContain("window.addEventListener(DATA_CHANGED_EVENT, refresh)");
  });

  it("快速自测结果保存失败时保留结果并提供重试保存", () => {
    const selfTest = readFileSync(join(process.cwd(), "components/onboarding/SelfTest.tsx"), "utf8");
    expect(selfTest).toContain("const [pendingSave, setPendingSave] = useState<SelfTestResult | null>(null)");
    expect(selfTest).toContain("const [saveError, setSaveError] = useState(false)");
    expect(selfTest).toContain("结果尚未保存到账户数据库。");
    expect(selfTest).toContain("重试保存");
    expect(selfTest).toContain("onClick={() => void saveResult(pendingSave)}");
    expect(selfTest).toContain("setPendingSave(nextResult)");
  });

  it("罗盘修正历史读取失败时保留历史并提供重试", () => {
    const correction = readFileSync(join(process.cwd(), "components/tools/CompassCorrection.tsx"), "utf8");
    expect(correction).toContain("const [loading, setLoading] = useState(true)");
    expect(correction).toContain("const [loadError, setLoadError] = useState(false)");
    expect(correction).toContain("修正历史暂时无法读取");
    expect(correction).toContain("onClick={refreshHistory}");
    expect(correction).not.toContain("setHistory([])");
    expect(correction).toContain("disabled={loading || saving}");
    expect(correction).toContain("const mountedRef = useRef(false)");
    expect(correction).toContain("if (!mountedRef.current) return");
    expect(correction).toContain("if (mountedRef.current) setStatus");
    expect(correction).toContain("const [saving, setSaving] = useState(false)");
    expect(correction).toContain("if (saving) return;");
    expect(correction).toContain("disabled={loading || saving}");
  });

  it("推演快照读取失败时保留实验内容并提供重试", () => {
    const lab = readFileSync(join(process.cwd(), "components/lab/HexagramLab.tsx"), "utf8");
    expect(lab).toContain("const [snapshotLoading, setSnapshotLoading] = useState(true)");
    expect(lab).toContain("const [snapshotError, setSnapshotError] = useState(false)");
    expect(lab).toContain("已保存推演暂时无法读取");
    expect(lab).toContain("onClick={refreshSnapshots}");
    expect(lab).not.toContain("setSnapshots([])");
    expect(lab).toContain("window.addEventListener(DATA_CHANGED_EVENT, refreshSnapshots)");
    expect(lab).toContain("const [snapshotSaving, setSnapshotSaving] = useState(false)");
    expect(lab).toContain("if (snapshotSaving) return;");
    expect(lab).toContain("disabled={snapshotSaving}");
  });

  it("坐向记录读取失败时保留历史并提供重试", () => {
    const records = readFileSync(join(process.cwd(), "components/tools/CompassRecords.tsx"), "utf8");
    expect(records).toContain("const [loading, setLoading] = useState(true)");
    expect(records).toContain("const [loadError, setLoadError] = useState(false)");
    expect(records).toContain("历史坐向记录暂时无法读取");
    expect(records).toContain("onClick={refreshRecords}");
    expect(records).not.toContain("setRecords([])");
    expect(records).toContain("window.addEventListener(DATA_CHANGED_EVENT, refreshRecords)");
    expect(records).toContain("const normalizedDegrees = normalizeDegrees(degrees)");
    expect(records).toContain("degrees: normalizedDegrees");
    expect(records).toContain("const mountedRef = useRef(false)");
    expect(records).toContain("if (!mountedRef.current) return");
    expect(records).toContain("if (mountedRef.current) setStatus");
    expect(records).toContain("const [saving, setSaving] = useState(false)");
    expect(records).toContain("if (saving) return;");
    expect(records).toContain("disabled={!allowSave || loading || saving}");
  });

  it("坐向记录 repository 写入再次执行领域归一化", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    expect(repository).toContain("normalizeCompassRecordForWrite");
    expect(repository).toContain("add(normalizeCompassRecordForWrite(record))");
  });

  it("罗盘修正 repository 写入再次执行范围归一化", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    expect(repository).toContain("normalizeCompassCorrectionRecordForWrite");
    expect(repository).toContain("add(normalizeCompassCorrectionRecordForWrite(record))");
  });

  it("推演快照 repository 写入再次重算派生卦", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    expect(repository).toContain("normalizeLabSnapshotForWrite");
    expect(repository).toContain("add(normalizeLabSnapshotForWrite(snapshot))");
  });

  it("内容勘误 repository 写入保护状态历史契约", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    expect(repository).toContain("normalizeErratumForWrite");
    expect(repository).toContain("put(normalizeErratumForWrite(record))");
    expect(repository).toContain("const normalized = normalizeErratumForWrite(next)");
    expect(repository).toContain("errata.put(normalized)");
    expect(repository).toContain("勘误记录 ID 与原子操作目标不一致");
  });

  it("收藏 repository 写入保护可回链目标", () => {
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    expect(repository).toContain("normalizeFavoriteForWrite");
    expect(repository).toContain("put(normalizeFavoriteForWrite(record))");
    expect(repository).toContain("export async function toggleFavoriteAtomically");
    expect(repository).toContain('yijingDb.transaction("rw", yijingDb.favorites');
    const favorite = readFileSync(join(process.cwd(), "components/notes/FavoriteButton.tsx"), "utf8");
    expect(favorite).toContain("toggleFavoriteAtomically");
    expect(favorite).toContain("setFavorite(nextFavorite)");
  });

  it("课程进度写入拒绝未知知识点目标", () => {
    const progress = readFileSync(join(process.cwd(), "db/progress.ts"), "utf8");
    expect(progress).toContain("if (cards.length === 0)");
    expect(progress).toContain("未知知识点或未配置课程练习");
    expect(progress).toContain("Number.isFinite(minimumScore)");
    expect(progress).toContain("isValidIsoTimestamp");
    expect(progress).toContain("isValidLocalDate");
  });

  it("复习写入先校验不可变题目快照与提交字段", () => {
    const review = readFileSync(join(process.cwd(), "db/review.ts"), "utf8");
    expect(review).toContain("assertReviewExerciseSnapshot(exercise)");
    expect(review).toContain("assertReviewSubmission({");
  });

  it("复习队列读取失败时可重试且会取消过期请求", () => {
    const session = readFileSync(join(process.cwd(), "components/review/ReviewSession.tsx"), "utf8");
    const instantPractice = readFileSync(join(process.cwd(), "components/learning/InstantPractice.tsx"), "utf8");
    expect(session).toContain("const loadQueue = useCallback(() =>");
    expect(session).toContain("const loadSequence = useRef(0)");
    expect(session).toContain("复习队列暂时无法读取");
    expect(session).toContain("onClick={loadQueue}");
    expect(session).toContain("重试读取");
    expect(session).toContain("loadSequence.current += 1");
    expect(session).toContain("const mountedRef = useRef(false)");
    expect(session).toContain("if (!mountedRef.current) return;");
    expect(instantPractice).toContain("const mountedRef = useRef(false)");
    expect(instantPractice).toContain("if (!mountedRef.current) return true;");
  });

  it("复习总结笔记使用每次会话唯一 ID，避免同日覆盖", () => {
    const session = readFileSync(join(process.cwd(), "components/review/ReviewSession.tsx"), "utf8");
    expect(session).toContain("const [sessionId] = useState(createSessionId)");
    expect(session).toContain('<NoteEditor targetType="session" targetId={sessionId} />');
    expect(session).not.toContain('<NoteEditor targetType="session" targetId={localDate()} />');
  });

  it("课程进度读取失败时不允许在未知状态下写入", () => {
    const progress = readFileSync(join(process.cwd(), "components/learning/LessonProgress.tsx"), "utf8");
    expect(progress).toContain("const [readError, setReadError] = useState(false)");
    expect(progress).toContain("状态暂时无法读取");
    expect(progress).toContain("重试读取");
    expect(progress).toContain("if (!loaded || readError || saving) return");
    expect(progress).toContain("disabled={!loaded || readError || saving}");
    expect(progress).toContain("const mountedRef = useRef(false)");
    expect(progress).toContain("if (mountedRef.current) setSaving(false)");
  });

  it("备份导入、导出和清空操作使用统一互斥锁", () => {
    const backup = readFileSync(join(process.cwd(), "components/data/DataBackup.tsx"), "utf8");
    expect(backup).toContain("const [clearing, setClearing] = useState(false)");
    expect(backup).toContain("const busy = importing || exporting || clearing");
    expect(backup).toContain("if (busy) return;");
    expect(backup).toContain("disabled={busy}");
    expect(backup).toContain("{clearing ? \"正在清空…\" : \"清空账户数据\"}");
  });

  it("首页勘误汇总读取失败时不会静默显示为空记录", () => {
    const feedback = readFileSync(join(process.cwd(), "components/content/ContentAuditFeedback.tsx"), "utf8");
    expect(feedback).toContain("正在读取账户勘误记录");
    expect(feedback).toContain("勘误记录暂时无法读取");
    expect(feedback).toContain("onClick={refresh}");
    expect(feedback).not.toContain(".catch(() => undefined)");
  });

  it("异步写入完成后不会更新已卸载的页面", () => {
    const preferences = readFileSync(join(process.cwd(), "components/settings/Preferences.tsx"), "utf8");
    const errata = readFileSync(join(process.cwd(), "components/content/ContentErrata.tsx"), "utf8");
    const lab = readFileSync(join(process.cwd(), "components/lab/HexagramLab.tsx"), "utf8");
    const deferredLab = readFileSync(join(process.cwd(), "components/lab/DeferredHexagramLab.tsx"), "utf8");
    const install = readFileSync(join(process.cwd(), "components/system/InstallPrompt.tsx"), "utf8");
    const auditExport = readFileSync(join(process.cwd(), "components/content/ContentAuditExport.tsx"), "utf8");
    const calendarInspector = readFileSync(join(process.cwd(), "components/content/CalendarEvidenceInspector.tsx"), "utf8");
    const sourceEditor = readFileSync(join(process.cwd(), "components/notes/SourceRefEditor.tsx"), "utf8");
    for (const source of [preferences, errata, lab, install, auditExport, calendarInspector, sourceEditor]) {
      expect(source).toContain("const mountedRef = useRef(false)");
      expect(source).toContain("mountedRef.current = false");
    }
    expect(preferences).toContain('if (mountedRef.current) setStatus("设置已保存")');
    expect(errata).toContain("if (!mountedRef.current) return;");
    expect(lab).toContain("if (!mountedRef.current) return;");
    expect(install).toContain("if (!mountedRef.current) return;");
    expect(auditExport).toContain("if (!mountedRef.current) return;");
    expect(calendarInspector).toContain("if (!mountedRef.current) return;");
    expect(sourceEditor).toContain("if (mountedRef.current) setSourceStatus");
    expect(sourceEditor).toContain("if (mountedRef.current) setAdditionalStatus");
    expect(sourceEditor).toContain("if (!mountedRef.current) return;");
    const todayLabel = readFileSync(join(process.cwd(), "components/dashboard/TodayLabel.tsx"), "utf8");
    expect(todayLabel).toContain("const mountedRef = useRef(false)");
    expect(todayLabel).toContain("mountedRef.current = false");
    expect(todayLabel).toContain("if (!mountedRef.current) return;");
    const offlineStatus = readFileSync(join(process.cwd(), "components/system/OfflineStatus.tsx"), "utf8");
    expect(offlineStatus).toContain("const mountedRef = useRef(false)");
    expect(offlineStatus).toContain("mountedRef.current = false");
    expect(offlineStatus).toContain("if (!mountedRef.current) return;");
    expect(deferredLab).toContain("const idleFallbackTimer = globalThis.setTimeout");
    expect(deferredLab).toContain("globalThis.clearTimeout(idleFallbackTimer)");
  });

  it("收藏状态读取失败时不会静默显示为未收藏", () => {
    const favorite = readFileSync(join(process.cwd(), "components/notes/FavoriteButton.tsx"), "utf8");
    expect(favorite).toContain("正在读取收藏状态");
    expect(favorite).toContain("收藏状态暂时无法读取");
    expect(favorite).toContain("onClick={refresh}");
    expect(favorite).not.toContain(".catch(() => undefined)");
    expect(favorite).toContain("lastFavoriteId.current !== id");
    expect(favorite).toContain("const mountedRef = useRef(false)");
    expect(favorite).toContain("if (!mountedRef.current) return;");
  });

  it("来源编辑器读取失败时保护表单并提供重试", () => {
    const source = readFileSync(join(process.cwd(), "components/notes/SourceRefEditor.tsx"), "utf8");
    expect(source).toContain("正在读取来源");
    expect(source).toContain("来源暂时无法读取");
    expect(source).toContain("onClick={retryRead}");
    expect(source).toContain("disabled={loading || readError}");
    const readBody = source.slice(source.indexOf("void getNote(noteId)"), source.indexOf("const locatorPlaceholder"));
    expect(readBody).not.toContain(".catch(() => undefined)");
  });

  it("来源追加使用事务提交后的记录更新聚合状态", () => {
    const source = readFileSync(join(process.cwd(), "components/notes/SourceRefEditor.tsx"), "utf8");
    const repository = readFileSync(join(process.cwd(), "db/repository.ts"), "utf8");
    expect(repository).toContain("export async function upsertNoteAtomicallyResult(");
    expect(repository).toContain("export async function appendNoteSourceRefAtomically(");
    expect(source).toContain("appendNoteSourceRefAtomically");
    expect(source).toContain("const writtenSourceRefs = writtenNote.sourceRefs");
    expect(source).toContain("setAdditionalSources(writtenSourceRefs.slice(1))");
  });

  it("新增数据读取错误态具有深色主题语义表面", () => {
    const styles = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(styles).toContain('html[data-theme="dark"] .content-audit-feedback-state.is-error');
    expect(styles).toContain('html[data-theme="dark"] .content-errata-state.is-error');
    expect(styles).toContain('html[data-theme="dark"] .source-load-error');
    expect(styles).toContain('html[data-theme="dark"] .favorite-state-error');
    expect(styles).toContain('html[data-theme="dark"] .lesson-status-error');
    expect(styles).toContain('html[data-theme="dark"] .compass-correction-error');
    expect(styles).toContain('html[data-theme="dark"] .lab-snapshot-error');
  });

  it("详情勘误读取失败时保护表单并提供重试", () => {
    const errata = readFileSync(join(process.cwd(), "components/content/ContentErrata.tsx"), "utf8");
    expect(errata).toContain("正在读取账户勘误记录");
    expect(errata).toContain("勘误记录暂时无法读取");
    expect(errata).toContain("onClick={retryRead}");
    expect(errata).toContain("const writeDisabled = loading || readError || writing");
    expect(errata).toContain("setItems([])");
    expect(errata).toContain("lastTarget.current !== targetKey");
  });

  it("归一化导入数据时不泄漏界面元数据并复制嵌套集合", () => {
    const input = {
      notes: [{
        id: "snapshot-note",
        targetType: "hexagram",
        targetId: "hexagram-01",
        markdown: "原始内容",
        tags: ["结构"],
        sourceRefs: [{ label: "来源" }],
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      }],
      reviewAttempts: [],
      reviewCardStates: [],
      conceptProgress: [],
      favorites: [],
      preferences: [],
      labSnapshots: [],
      errata: [],
      compassRecords: [],
      compassCorrections: [],
      importSummary: { incoming: 1 },
    };
    const normalized = normalizeImportedBackupData(input as never);
    expect(normalized).not.toHaveProperty("importSummary");

    input.notes[0].tags.push("被外部修改");
    input.notes[0].sourceRefs[0].label = "被外部修改";
    expect(normalized.notes[0].tags).toEqual(["结构"]);
    expect(normalized.notes[0].sourceRefs).toEqual([{ label: "来源" }]);
  });

  it("归一化导入笔记时复用写入契约并清理标签与来源空白", () => {
    const input = {
      notes: [{
        id: " note-normalized ",
        targetType: "hexagram",
        targetId: "hexagram-01",
        markdown: "内容",
        tags: [" 结构 ", "结构", ""],
        sourceRefs: [{ label: " 来源 ", kind: "book", author: " 作者 " }],
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      }],
      reviewAttempts: [],
      reviewCardStates: [],
      conceptProgress: [],
      favorites: [],
      preferences: [],
      labSnapshots: [],
      errata: [],
      compassRecords: [],
      compassCorrections: [],
    };
    const normalized = normalizeImportedBackupData(input as never);
    expect(normalized.notes[0]).toMatchObject({
      id: "note-normalized",
      tags: ["结构"],
      sourceRefs: [{ label: "来源", kind: "book", author: "作者" }],
    });
    expect(() => normalizeImportedBackupData({
      ...input,
      notes: [{ ...input.notes[0], sourceRefs: [{ label: "   " }] }],
    } as never)).toThrow(/来源 1 缺少名称/);
  });

  it("生产启动入口保持 standalone 资源与参数契约", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: { start?: string };
    };
    const starter = readFileSync(join(process.cwd(), "scripts/start-production.mjs"), "utf8");
    expect(packageJson.scripts?.start).toBe("node scripts/start-production.mjs");
    expect(starter).toContain('const serverPath = ".next/standalone/server.js"');
    expect(starter).toContain('cpSync("public", ".next/standalone/public"');
    expect(starter).toContain('cpSync(".next/static", ".next/standalone/.next/static"');
    expect(starter).toContain('optionValue(["--hostname", "-H"])');
    expect(starter).toContain('optionValue(["--port", "-p"])');
    expect(starter).toContain("const inlineName = options.find((name) => argument.startsWith(`${name}=`))");
    expect(starter).toContain("options.includes(argument)");
    expect(starter).toContain("Scan from right to left");
    expect(starter).not.toContain("next start");
  });

  it("容器门禁只在容器启动后读取运行时日志", () => {
    const script = readFileSync(join(process.cwd(), "scripts/test-container.mjs"), "utf8");
    expect(script).toContain("let containerStarted = false");
    expect(script).toContain("containerStarted = true");
    expect(script).toContain("if (containerStarted)");
    expect(script).toContain('docker", args');
    expect(script).toContain('compose(["build"]');
    expect(script).toContain('compose(["up", "-d"]');
    expect(script).toContain('compose(["down", "--volumes", "--remove-orphans"]');
    expect(script).toContain("appContainerId()");
    expect(script).toContain("inspectHealth()");
    expect(script).toContain("runAccountDataCheck()");
    expect(script).toContain('/api/auth/register');
    expect(script).toContain('/api/data?table=notes');
    expect(script).toContain("await findFreePort()");
    expect(script).toContain("process.env.CONTAINER_PORT");
    expect(script).toContain("PostgreSQL + 易境应用");
  });

  it("内部部署与本地测试入口保持可重复运行契约", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const deploy = readFileSync(join(process.cwd(), "scripts/deploy.mjs"), "utf8");
    const localTest = readFileSync(join(process.cwd(), "scripts/local-test.mjs"), "utf8");
    const compose = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8");
    const docs = readFileSync(join(process.cwd(), "docs/06-本地测试与Docker部署.md"), "utf8");

    expect(packageJson.scripts?.deploy).toBe("node scripts/deploy.mjs");
    expect(packageJson.scripts?.["local:test"]).toBe("node scripts/local-test.mjs");
    expect(deploy).toContain('runCompose(["up", "-d"');
    expect(deploy).toContain("async function waitForHealthy()");
    expect(deploy).toContain('"healthy"');
    expect(deploy).toContain("PostgreSQL + 易境 Compose 服务");
    expect(deploy).toContain("YIJING_DB_CONTAINER");
    expect(deploy).toContain("DEPLOY_SKIP_BUILD");
    expect(localTest).toContain("npm, [\"run\", \"dev\"");
    expect(localTest).toContain("/api/health");
    expect(localTest).toContain("LOCAL_TEST_PORT");
    expect(compose).toContain("name: yijing");
    expect(compose).toContain("restart: unless-stopped");
    expect(compose).toContain("YIJING_BIND");
    expect(compose).toContain("YIJING_PORT");
    expect(docs).toContain("npm run test:container");
    expect(docs).toContain("npm run deploy");
    expect(docs).toContain("docker compose up -d --build");
    expect(docs).toContain("账户模式");
  });

  it("快速自测保存在异步完成后尊重组件挂载状态", () => {
    const selfTest = readFileSync(join(process.cwd(), "components/onboarding/SelfTest.tsx"), "utf8");
    expect(selfTest).toContain("const mountedRef = useRef(false)");
    expect(selfTest).toContain("mountedRef.current = false");
    expect(selfTest).toContain("if (!mountedRef.current) return");
    expect(selfTest).toContain("if (mountedRef.current) setSaving(false)");
  });
});
