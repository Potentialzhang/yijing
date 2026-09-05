import { describe, expect, it } from "vitest";
import {
  assertBackupDataIntegrity,
  BACKUP_FORMAT,
  calculateBackupChecksum,
  parseBackupEnvelope,
  summarizeImport,
  shouldImportRecord,
} from "@/core/data/backup";
import {
  migrateCompassRecord,
  migrateCompassCorrectionRecord,
  migratePreferenceRecord,
  migrateConceptProgressRecord,
  migrateErratumRecord,
  migrateFavoriteRecord,
  migrateLabSnapshotRecord,
  migrateNoteRecord,
  migrateReviewAttemptRecord,
  migrateReviewCardStateRecord,
} from "@/db/migrations";
import { EXERCISES } from "@/content/exercises";
import { normalizeErratumForWrite } from "@/core/content/errata";
import { formatLocalDate } from "@/core/date/local";

const emptyData = {
  notes: [],
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

describe("本地备份协议", () => {
  it("按各数据表的合并规则生成新增、更新和跳过摘要", () => {
    const existing = {
      ...emptyData,
      notes: [{ id: "note-1", markdown: "旧内容", updatedAt: "2026-08-01T00:00:00.000Z" }],
      reviewAttempts: [{ id: "attempt-1" }],
      favorites: [{ id: "favorite-1", createdAt: "2026-08-02T00:00:00.000Z" }],
    } as never;
    const incoming = {
      ...emptyData,
      notes: [
        { id: "note-1", markdown: "新内容", updatedAt: "2026-08-03T00:00:00.000Z" },
        { id: "note-2", updatedAt: "2026-08-01T00:00:00.000Z" },
        { id: "note-3", updatedAt: "2026-08-01T00:00:00.000Z" },
      ],
      reviewAttempts: [{ id: "attempt-1" }, { id: "attempt-2" }],
      favorites: [
        { id: "favorite-1", createdAt: "2026-08-01T00:00:00.000Z" },
      ],
    } as never;

    const summary = summarizeImport(incoming, existing);
    expect(summary).toMatchObject({
      incoming: 6,
      additions: 3,
      conflicts: 3,
      updates: 1,
      skipped: 2,
    });
    expect(summary.tables.find((table) => table.key === "notes")).toMatchObject({
      incoming: 3,
      additions: 2,
      conflicts: 1,
      updates: 1,
      skipped: 0,
    });
    expect(summary.tables.find((table) => table.key === "reviewAttempts")).toMatchObject({
      incoming: 2,
      additions: 1,
      conflicts: 1,
      updates: 0,
      skipped: 1,
    });
    expect(summary.tables.find((table) => table.key === "favorites")).toMatchObject({
      incoming: 1,
      additions: 0,
      conflicts: 1,
      updates: 0,
      skipped: 1,
    });
    expect(
      shouldImportRecord(
        { id: "note-1", markdown: "旧内容", updatedAt: "2026-08-04T00:00:00.000Z" },
        { id: "note-1", markdown: "旧内容", updatedAt: "2026-08-01T00:00:00.000Z" },
        0,
      ),
    ).toBe(false);
  });

  it("按实际时间瞬间判断导入冲突，而不是比较带偏移的字符串", () => {
    expect(
      shouldImportRecord(
        { id: "note-1", markdown: "导入的新内容", updatedAt: "2026-08-26T17:00:00.000Z" },
        { id: "note-1", markdown: "本地内容", updatedAt: "2026-08-27T00:30:00.000+08:00" },
        0,
      ),
    ).toBe(true);
  });

  it("导入内容比较不受对象字段插入顺序和语言环境影响", () => {
    const incoming = {
      id: "note-locale-stable",
      markdown: "同一内容",
      metadata: { z: 1, "ä": 2 },
      updatedAt: "2026-08-26T00:00:00.000Z",
    };
    const existing = {
      updatedAt: "2026-08-25T00:00:00.000Z",
      metadata: { "ä": 2, z: 1 },
      markdown: "同一内容",
      id: "note-locale-stable",
    };
    expect(shouldImportRecord(incoming, existing, 0)).toBe(false);
  });

  it("为每张导入表使用稳定且唯一的身份字段", () => {
    const existing = {
      ...emptyData,
      reviewCardStates: [{
        cardId: "card-1",
        stepIndex: 0,
        updatedAt: "2026-08-01T00:00:00.000Z",
      }],
    } as never;
    const incoming = {
      ...emptyData,
      reviewCardStates: [{
        cardId: "card-1",
        stepIndex: 1,
        updatedAt: "2026-08-02T00:00:00.000Z",
      }, {
        cardId: "card-2",
        updatedAt: "2026-08-02T00:00:00.000Z",
      }],
    } as never;

    const summary = summarizeImport(incoming, existing);
    expect(summary.tables.map((table) => table.key)).toEqual([
      "notes",
      "reviewAttempts",
      "reviewCardStates",
      "conceptProgress",
      "favorites",
      "preferences",
      "labSnapshots",
      "errata",
      "compassRecords",
      "compassCorrections",
    ]);
    expect(summary.tables.find((table) => table.key === "reviewCardStates")).toMatchObject({
      incoming: 2,
      additions: 1,
      conflicts: 1,
      updates: 1,
      skipped: 0,
    });
  });

  it("支持 v1 空数据并补齐可选集合", () => {
    expect(
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        data: {},
      }),
    ).toEqual(emptyData);
  });

  it("校验备份信封中存在的版本和导出时间元数据", () => {
    expect(
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        appVersion: "0.1.0",
        contentVersion: "seed-1",
        exportedAt: "2026-08-28T00:00:00.000Z",
        data: {},
      }),
    ).toEqual(emptyData);
    expect(() =>
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        appVersion: "",
        data: {},
      }),
    ).toThrow();
    expect(() =>
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        exportedAt: "not-a-date",
        data: {},
      }),
    ).toThrow();
    expect(() =>
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        exportedAt: "2026-02-30T00:00:00.000Z",
        data: {},
      }),
    ).toThrow();
    expect(() =>
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        exportedAt: "2026-08-28",
        data: {},
      }),
    ).toThrow();
  });

  it("生成并验证可选备份校验和，同时兼容无校验和的旧文件", () => {
    const checksum = calculateBackupChecksum(emptyData);
    expect(checksum).toMatch(/^fnv1a32-[0-9a-f]{8}$/);
    expect(
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        checksum,
        data: emptyData,
      }),
    ).toEqual(emptyData);
    expect(
      calculateBackupChecksum({
        compassCorrections: [],
        compassRecords: [],
        errata: [],
        labSnapshots: [],
        preferences: [],
        favorites: [],
        conceptProgress: [],
        reviewCardStates: [],
        reviewAttempts: [],
        notes: [],
      }),
    ).toBe(checksum);
    expect(() =>
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        checksum: "fnv1a32-00000000",
        data: emptyData,
      }),
    ).toThrow(/校验和不匹配/);
  });

  it("接受有界的作答耗时并拒绝异常值", () => {
    const card = EXERCISES[0];
    const baseAttempt = {
      id: "attempt-response-time",
      cardId: card.id,
      promptSnapshot: card.prompt,
      answerSnapshot: card.answer,
      objectiveCorrect: true,
      reviewMode: "spaced" as const,
      recallGrade: "remembered" as const,
      reviewedAt: "2026-08-26T00:00:00.000Z",
      localDate: "2026-08-26",
    };
    expect(parseBackupEnvelope({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      data: { ...emptyData, reviewAttempts: [{ ...baseAttempt, responseTimeMs: 1234 }] },
    }).reviewAttempts[0].responseTimeMs).toBe(1234);
    for (const responseTimeMs of [-1, 1.5, 86_400_001]) {
      expect(() => parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        data: { ...emptyData, reviewAttempts: [{ ...baseAttempt, responseTimeMs }] },
      })).toThrow();
    }
  });

  it("接受可选复述并拒绝超长复述", () => {
    const card = EXERCISES[0];
    const attempt = {
      id: "attempt-self-explanation",
      cardId: card.id,
      promptSnapshot: card.prompt,
      answerSnapshot: card.answer,
      objectiveCorrect: true,
      reviewMode: "spaced" as const,
      recallGrade: "remembered" as const,
      selfExplanation: "乾是纯阳，先记住三爻皆阳。",
      reviewedAt: "2026-08-26T00:00:00.000Z",
      localDate: "2026-08-26",
    };
    expect(parseBackupEnvelope({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      data: { ...emptyData, reviewAttempts: [attempt] },
    }).reviewAttempts[0].selfExplanation).toBe(attempt.selfExplanation);
    expect(() => parseBackupEnvelope({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      data: { ...emptyData, reviewAttempts: [{ ...attempt, selfExplanation: "x".repeat(2001) }] },
    })).toThrow();
  });

  it("拒绝备份信封、数据表和来源中的未声明字段", () => {
    const envelope = {
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      data: emptyData,
    };
    expect(() =>
      parseBackupEnvelope({ ...envelope, unexpected: true }),
    ).toThrow(/字段/);
    expect(() =>
      parseBackupEnvelope({
        ...envelope,
        data: { ...emptyData, unexpected: [] },
      }),
    ).toThrow(/字段/);
    const note = {
      id: "strict-note",
      targetType: "hexagram",
      targetId: "hexagram-01",
      markdown: "",
      tags: [],
      sourceRefs: [{ label: "来源", unexpected: "不应写入" }],
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
    };
    expect(() =>
      parseBackupEnvelope({
        ...envelope,
        data: { ...emptyData, notes: [note] },
      }),
    ).toThrow(/字段/);
  });

  it("拒绝备份记录中的未修剪业务标识符", () => {
    const note = {
      id: " note-with-leading-space",
      targetType: "hexagram",
      targetId: "hexagram-01",
      markdown: "",
      tags: [],
      sourceRefs: [],
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
    };
    expect(() => parseBackupEnvelope({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      data: { ...emptyData, notes: [note] },
    })).toThrow(/文件格式|已修剪/);
  });

  it("来源链接必须包含真实的 HTTP(S) 主机", () => {
    const base = {
      id: "note-source-url",
      targetType: "hexagram",
      targetId: "hexagram-01",
      markdown: "",
      tags: [],
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
      sourceRefs: [{ label: "来源", kind: "web", url: "https://example.com/page" }],
    };
    expect(() =>
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        data: { ...emptyData, notes: [base] },
      }),
    ).not.toThrow();
    expect(() =>
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        data: {
          ...emptyData,
          notes: [{ ...base, sourceRefs: [{ label: "来源", kind: "web", url: "http://" }] }],
        },
      }),
    ).toThrow();
    expect(() =>
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        data: {
          ...emptyData,
          notes: [{ ...base, sourceRefs: [{ label: "来源", kind: "web", url: "http:foo" }] }],
        },
      }),
    ).toThrow();
  });

  it("兼容旧笔记缺少 sourceRefs，并保留为安全默认值", () => {
    const data = parseBackupEnvelope({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      data: {
        ...emptyData,
        notes: [
          {
            id: "hexagram:hexagram-01",
            targetType: "hexagram",
            targetId: "hexagram-01",
            markdown: "旧笔记",
            tags: [],
            createdAt: "2026-08-26T00:00:00.000Z",
            updatedAt: "2026-08-26T00:00:00.000Z",
          },
        ],
      },
    });
    expect(data.notes[0].sourceRefs).toEqual([]);
  });

  it("拒绝记录中的非严格 ISO 时间戳", () => {
    expect(() =>
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        data: {
          ...emptyData,
          notes: [{
            id: "note-invalid-time",
            targetType: "hexagram",
            targetId: "hexagram-01",
            markdown: "",
            createdAt: "2026-08-26",
            updatedAt: "2026-08-26T24:00:00.000Z",
          }],
        },
      }),
    ).toThrow();
  });

  it("兼容旧备份复习卡并补齐调度算法版本", () => {
    const data = parseBackupEnvelope({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      data: {
        ...emptyData,
        reviewCardStates: [{
          cardId: "trigram-qian-name",
          targetType: "trigram",
          targetId: "qian",
          stepIndex: 0,
          dueDate: "2026-08-26",
          lapseCount: 0,
          consecutivePasses: 0,
          isWeak: false,
          updatedAt: "2026-08-26T00:00:00.000Z",
        }],
      },
    });
    expect(data.reviewCardStates[0]).toMatchObject({ algorithmVersion: 1, consecutiveForgets: 0 });
  });

  it("备份保留未知复习算法版本，交给当前队列隔离", () => {
    const data = parseBackupEnvelope({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      data: {
        ...emptyData,
        reviewCardStates: [{
          cardId: "future-algorithm-card",
          targetType: "trigram",
          targetId: "qian",
          algorithmVersion: 99,
          stepIndex: 0,
          dueDate: "2026-08-26",
          lapseCount: 0,
          consecutivePasses: 0,
          isWeak: false,
          updatedAt: "2026-08-26T00:00:00.000Z",
        }],
      },
    });
    expect(data.reviewCardStates[0].algorithmVersion).toBe(99);
    expect(() => assertBackupDataIntegrity(data)).not.toThrow();
  });

  it("拒绝缺少关键字段的作答记录", () => {
    expect(() =>
      parseBackupEnvelope({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        data: { ...emptyData, reviewAttempts: [{ id: "attempt-1" }] },
      }),
    ).toThrow();
  });

  it("拒绝事务完成后会产生的重复主键", () => {
    const data = parseBackupEnvelope({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      data: {
        ...emptyData,
        preferences: [
          {
            key: "theme",
            value: "light",
            updatedAt: "2026-08-26T00:00:00.000Z",
          },
          {
            key: "theme",
            value: "dark",
            updatedAt: "2026-08-26T00:00:00.000Z",
          },
        ],
      },
    });
    expect(() => assertBackupDataIntegrity(data)).toThrow(/重复主键/);
  });

  it("接受指向现有知识对象的完整备份引用", () => {
    const card = EXERCISES[0];
    const data = {
      ...emptyData,
      notes: [{
        id: "note-1",
        targetType: "hexagram_line" as const,
        targetId: "hexagram-01-1",
        markdown: "逐爻记录",
        tags: [],
        sourceRefs: [],
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      }],
      reviewCardStates: [{
        cardId: card.id,
        targetType: card.targetType,
        targetId: card.targetId,
        stepIndex: 0,
        dueDate: "2026-08-26",
        lapseCount: 0,
        consecutivePasses: 0,
        isWeak: false,
        updatedAt: "2026-08-26T00:00:00.000Z",
      }],
      reviewAttempts: [{
        id: "attempt-1",
        cardId: card.id,
        promptSnapshot: card.prompt,
        answerSnapshot: card.answer,
        objectiveCorrect: true,
        reviewMode: "immediate" as const,
        recallGrade: "remembered" as const,
        reviewedAt: "2026-08-26T00:00:00.000Z",
        localDate: "2026-08-26",
      }],
    };
    expect(() => assertBackupDataIntegrity(data)).not.toThrow();
  });

  it("拒绝结构合法但指向不存在对象的备份", () => {
    const data = {
      ...emptyData,
      notes: [{
        id: "note-orphan",
        targetType: "hexagram" as const,
        targetId: "hexagram-99",
        markdown: "孤立笔记",
        tags: [],
        sourceRefs: [],
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      }],
    };
    expect(() => assertBackupDataIntegrity(data)).toThrow(/不存在的hexagram/);
  });

  it("拒绝没有复习卡对应关系的作答记录", () => {
    const card = EXERCISES[0];
    const data = {
      ...emptyData,
      reviewAttempts: [{
        id: "attempt-orphan",
        cardId: card.id,
        promptSnapshot: card.prompt,
        answerSnapshot: card.answer,
        recallGrade: "forgot" as const,
        reviewedAt: "2026-08-26T00:00:00.000Z",
        localDate: "2026-08-26",
      }],
    };
    expect(() => assertBackupDataIntegrity(data)).toThrow(/缺少对应复习卡/);
  });

  it("拒绝已知复习卡被替换为其他合法目标", () => {
    const card = EXERCISES[0];
    const data = {
      ...emptyData,
      reviewCardStates: [{
        cardId: card.id,
        targetType: "hexagram" as const,
        targetId: "hexagram-01",
        stepIndex: 0,
        dueDate: "2026-08-26",
        lapseCount: 0,
        consecutivePasses: 0,
        isWeak: false,
        updatedAt: "2026-08-26T00:00:00.000Z",
      }],
    };
    expect(() => assertBackupDataIntegrity(data)).toThrow(/目标与练习定义不一致/);
  });

  it("拒绝当前版本作答记录被替换为其他题目快照", () => {
    const card = EXERCISES[0];
    const data = {
      ...emptyData,
      reviewCardStates: [{
        cardId: card.id,
        targetType: card.targetType,
        targetId: card.targetId,
        stepIndex: 0,
        dueDate: "2026-08-26",
        lapseCount: 0,
        consecutivePasses: 0,
        isWeak: false,
        updatedAt: "2026-08-26T00:00:00.000Z",
      }],
      reviewAttempts: [{
        id: "attempt-tampered-snapshot",
        cardId: card.id,
        exerciseVersion: 1,
        targetType: card.targetType,
        promptSnapshot: "被替换的题目",
        answerSnapshot: card.answer,
        recallGrade: "remembered" as const,
        reviewedAt: "2026-08-26T00:00:00.000Z",
        localDate: "2026-08-26",
      }],
    };
    expect(() => assertBackupDataIntegrity(data)).toThrow(/题目快照与练习定义不一致/);
  });

  it("兼容缺少题目版本的旧作答备份", () => {
    const card = EXERCISES[0];
    const data = {
      ...emptyData,
      reviewCardStates: [{
        cardId: card.id,
        targetType: card.targetType,
        targetId: card.targetId,
        stepIndex: 0,
        dueDate: "2026-08-26",
        lapseCount: 0,
        consecutivePasses: 0,
        isWeak: false,
        updatedAt: "2026-08-26T00:00:00.000Z",
      }],
      reviewAttempts: [{
        id: "attempt-legacy-snapshot",
        cardId: card.id,
        promptSnapshot: "旧版本题目快照",
        answerSnapshot: "旧版本答案快照",
        recallGrade: "remembered" as const,
        reviewedAt: "2026-08-26T00:00:00.000Z",
        localDate: "2026-08-26",
      }],
    };
    expect(() => assertBackupDataIntegrity(data)).not.toThrow();
  });

  it("拒绝格式正确但日历无效的复习日期", () => {
    const card = EXERCISES[0];
    const withInvalidAttemptDate = {
      ...emptyData,
      reviewCardStates: [{
        cardId: card.id,
        targetType: card.targetType,
        targetId: card.targetId,
        stepIndex: 0,
        dueDate: "2026-08-26",
        lapseCount: 0,
        consecutivePasses: 0,
        isWeak: false,
        updatedAt: "2026-08-26T00:00:00.000Z",
      }],
      reviewAttempts: [{
        id: "attempt-invalid-date",
        cardId: card.id,
        promptSnapshot: card.prompt,
        answerSnapshot: card.answer,
        recallGrade: "remembered" as const,
        reviewedAt: "2026-08-26T00:00:00.000Z",
        localDate: "2026-02-30",
      }],
    };
    expect(() => assertBackupDataIntegrity(withInvalidAttemptDate)).toThrow(/本地日期无效/);

    expect(() => assertBackupDataIntegrity({
      ...withInvalidAttemptDate,
      reviewAttempts: [],
      reviewCardStates: [{
        ...withInvalidAttemptDate.reviewCardStates[0],
        dueDate: "2026-13-01",
      }],
    })).toThrow(/到期日期无效/);
  });

  it("拒绝来源记录中的非法访问日期", () => {
    const data = {
      ...emptyData,
      notes: [{
        id: "note-invalid-source-date",
        targetType: "hexagram" as const,
        targetId: "hexagram-01",
        markdown: "来源日期边界",
        tags: [],
        sourceRefs: [{
          label: "学习来源",
          kind: "book" as const,
          accessedAt: "2026-02-30",
        }],
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      }],
    };
    expect(() => assertBackupDataIntegrity(data)).toThrow(/访问日期无效/);
  });

  it("拒绝来源记录中的非 HTTP(S) 链接", () => {
    const data = {
      ...emptyData,
      notes: [{
        id: "note-invalid-source-url",
        targetType: "hexagram" as const,
        targetId: "hexagram-01",
        markdown: "来源链接边界",
        tags: [],
        sourceRefs: [{
          label: "不安全来源",
          url: "javascript:alert(1)",
        }],
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      }],
    };
    expect(() => assertBackupDataIntegrity(data)).toThrow();
  });

  it("拒绝用户记录中的非法 ISO 时间戳", () => {
    const data = {
      ...emptyData,
      notes: [{
        id: "note-invalid-timestamp",
        targetType: "hexagram" as const,
        targetId: "hexagram-01",
        markdown: "时间戳边界",
        tags: [],
        sourceRefs: [],
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "yesterday",
      }],
    };
    expect(() => assertBackupDataIntegrity(data)).toThrow();
  });

  it("拒绝状态与历史不一致或时间倒序的内容勘误备份", () => {
    const base = {
      id: "erratum-integrity",
      targetType: "hexagram" as const,
      targetId: "hexagram-01",
      category: "question" as const,
      description: "待复核的内容记录",
      proposedText: "",
      sourceRef: "",
      contentVersion: 1,
      status: "resolved" as const,
      history: [
        { status: "open" as const, at: "2026-08-26T00:00:00.000Z" },
        { status: "resolved" as const, at: "2026-08-26T01:00:00.000Z" },
      ],
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T01:00:00.000Z",
    };
    expect(() => assertBackupDataIntegrity({ ...emptyData, errata: [base] })).not.toThrow();
    expect(() => assertBackupDataIntegrity({
      ...emptyData,
      errata: [{ ...base, status: "open" as const }],
    })).toThrow(/当前状态与状态历史不一致/);
    expect(() => assertBackupDataIntegrity({
      ...emptyData,
      errata: [{
        ...base,
        history: [
          { status: "open" as const, at: "2026-08-26T02:00:00.000Z" },
          { status: "resolved" as const, at: "2026-08-26T01:00:00.000Z" },
        ],
      }],
    })).toThrow(/状态历史时间顺序无效/);
  });

  it("迁移 v1 样例记录时补齐默认字段且不覆盖已有内容", () => {
    const note = {
      id: "note-1",
      targetId: "hexagram-01",
      markdown: "我的记录",
    } as Record<string, unknown>;
    const attempt = { id: "attempt-1", objectiveCorrect: false } as Record<
      string,
      unknown
    >;
    const state = { cardId: "card-1" } as Record<string, unknown>;
    const progress = {
      conceptId: "yin-yang-lines",
      masteryScore: 140,
    } as Record<string, unknown>;
    const compass = {
      id: "compass-1",
      degrees: -22.5,
      title: "手工记录",
    } as Record<string, unknown>;
    const now = "2026-08-26T00:00:00.000Z";
    migrateNoteRecord(note, now);
    migrateReviewAttemptRecord(attempt, now);
    migrateReviewCardStateRecord(state, now);
    migrateConceptProgressRecord(progress, now);
    migrateCompassRecord(compass, now);
    const favorite = {
      id: "favorite-1",
      targetType: "unknown",
      targetId: "",
      createdAt: "not-a-date",
    } as Record<string, unknown>;
    const snapshot = {
      id: "snapshot-1",
      lowerTrigramId: "unknown",
      upperTrigramId: "kun",
      movingPositions: [1, 1, 7, "2"],
      baseHexagramId: "hexagram-64",
      changedHexagramId: "hexagram-64",
      title: "",
      note: 123,
      createdAt: "not-a-date",
      updatedAt: "not-a-date",
    } as Record<string, unknown>;
    migrateFavoriteRecord(favorite, now);
    migrateLabSnapshotRecord(snapshot, now);
    const correction = {
      id: "correction-1",
      offsetDegrees: "240",
      reason: "",
    } as Record<string, unknown>;
    migrateCompassCorrectionRecord(correction, now);
    expect(note).toMatchObject({
      markdown: "我的记录",
      targetType: "hexagram",
      sourceRefs: [],
      updatedAt: now,
    });
    expect(attempt).toMatchObject({
      recallGrade: "forgot",
      localDate: "2026-08-26",
    });
    expect(state).toMatchObject({
      targetType: "concept",
      targetId: "card-1",
      algorithmVersion: 1,
      dueDate: "2026-08-26",
      updatedAt: now,
    });
    expect(progress).toMatchObject({
      status: "learning",
      masteryScore: 100,
      updatedAt: now,
    });
    expect(compass).toMatchObject({
      degrees: 337.5,
      directionId: "north",
      layerId: "eight-directions-v1",
      ruleVersion: 1,
      title: "手工记录",
      environmentNote: "",
      createdAt: now,
      updatedAt: now,
    });
    expect(correction).toMatchObject({
      offsetDegrees: 180,
      reason: "历史手动修正",
      createdAt: now,
      updatedAt: now,
    });
    expect(favorite).toEqual({
      id: "favorite-1",
      targetType: "concept",
      targetId: "unknown",
      createdAt: now,
    });
    expect(snapshot).toMatchObject({
      lowerTrigramId: "qian",
      upperTrigramId: "kun",
      movingPositions: [1],
      baseHexagramId: "hexagram-11",
      changedHexagramId: "hexagram-46",
      title: "地天泰",
      note: "",
      createdAt: now,
      updatedAt: now,
    });
    const preferences = [
      { key: "theme", value: "unsupported" },
      { key: "dailyNewCardLimit", value: "invalid" },
      { key: "sessionBatchSize", value: 999 },
      { key: "aiAllowedScopes", value: "[\"unknown-scope\"]" },
      { key: "aiPreviewPurpose", value: "fortune-telling" },
      { key: "lastExportAt", value: "not-a-date" },
      { key: "futurePreference", value: { unsupported: true } },
    ] as Record<string, unknown>[];
    preferences.forEach((record) => migratePreferenceRecord(record, now));
    expect(preferences).toEqual([
      { key: "theme", value: "light", updatedAt: now },
      { key: "dailyNewCardLimit", value: 10, updatedAt: now },
      { key: "sessionBatchSize", value: 20, updatedAt: now },
      { key: "aiAllowedScopes", value: "[]", updatedAt: now },
      { key: "aiPreviewPurpose", value: "study-draft", updatedAt: now },
      { key: "lastExportAt", value: "", updatedAt: now },
      { key: "futurePreference", value: "", updatedAt: now },
    ]);
  });

  it("迁移复习记录时拒绝虚构日期并限制复习状态边界", () => {
    const attempt = {
      id: "attempt-invalid-date",
      reviewedAt: "not-a-date",
      localDate: "2026-02-30",
      recallGrade: "remembered",
      responseTimeMs: -1,
    } as Record<string, unknown>;
    const state = {
      cardId: "state-invalid-date",
      dueDate: "2026-02-30",
      stepIndex: 99,
      lapseCount: -2,
      consecutivePasses: -4,
    } as Record<string, unknown>;
    const progress = {
      conceptId: "yin-yang-lines",
      masteryScore: 50,
      lastStudiedAt: "not-a-date",
    } as Record<string, unknown>;
    const note = {
      id: "note-invalid-optional-date",
      targetId: "hexagram-01",
      markdown: "旧记录",
      deletedAt: "2026-02-30T00:00:00.000Z",
    } as Record<string, unknown>;
    const now = "2026-03-01T10:00:00.000Z";
    migrateReviewAttemptRecord(attempt, now);
    migrateReviewCardStateRecord(state, now);
    migrateConceptProgressRecord(progress, now);
    migrateNoteRecord(note, now);
    expect(attempt).toMatchObject({ reviewedAt: now, localDate: "2026-03-01" });
    expect(attempt).not.toHaveProperty("responseTimeMs");
    expect(state).toMatchObject({ algorithmVersion: 1, dueDate: "2026-03-01", stepIndex: 5, lapseCount: 0, consecutivePasses: 0, consecutiveForgets: 0 });
    const weakState = { ...state, isWeak: true } as Record<string, unknown>;
    delete weakState.consecutiveForgets;
    migrateReviewCardStateRecord(weakState, now);
    expect(weakState.consecutiveForgets).toBe(2);
    expect(progress).not.toHaveProperty("lastStudiedAt");
    expect(note).not.toHaveProperty("deletedAt");
  });

  it("迁移缺失本地日期时按用户本地日历回退，而不是截取 UTC 日期", () => {
    const now = "2026-03-01T23:30:00-08:00";
    const attempt = {
      id: "attempt-missing-local-date",
      reviewedAt: "not-a-date",
      localDate: "2026-02-30",
      recallGrade: "remembered",
    } as Record<string, unknown>;
    const state = {
      cardId: "state-missing-due-date",
      dueDate: "2026-02-30",
    } as Record<string, unknown>;
    migrateReviewAttemptRecord(attempt, now);
    migrateReviewCardStateRecord(state, now);
    const expected = formatLocalDate(new Date(now));
    expect(attempt.localDate).toBe(expected);
    expect(state.dueDate).toBe(expected);
  });

  it("迁移带时区的历史时间时保留其墙上日期，UTC 时间按当前本地日历解释", () => {
    const offsetAttempt = {
      id: "attempt-offset-date",
      reviewedAt: "2026-03-01T00:30:00-08:00",
      localDate: "2026-02-30",
      recallGrade: "remembered",
    } as Record<string, unknown>;
    const utcAttempt = {
      id: "attempt-utc-date",
      reviewedAt: "2026-03-01T23:30:00Z",
      localDate: "2026-02-30",
      recallGrade: "remembered",
    } as Record<string, unknown>;
    const now = "2026-03-10T12:00:00Z";
    migrateReviewAttemptRecord(offsetAttempt, now);
    migrateReviewAttemptRecord(utcAttempt, now);
    expect(offsetAttempt.localDate).toBe("2026-03-01");
    expect(utcAttempt.localDate).toBe(formatLocalDate(new Date(utcAttempt.reviewedAt as string)));
  });

  it("迁移复习记录时清洗非法复述并保留规范化文本", () => {
    const now = "2026-03-01T10:00:00.000Z";
    const valid = { id: "attempt-reflection-valid", selfExplanation: "  乾为纯阳  " } as Record<string, unknown>;
    const blank = { id: "attempt-reflection-blank", selfExplanation: "   " } as Record<string, unknown>;
    const invalid = { id: "attempt-reflection-invalid", selfExplanation: "x".repeat(2001) } as Record<string, unknown>;
    migrateReviewAttemptRecord(valid, now);
    migrateReviewAttemptRecord(blank, now);
    migrateReviewAttemptRecord(invalid, now);
    expect(valid.selfExplanation).toBe("乾为纯阳");
    expect(blank).not.toHaveProperty("selfExplanation");
    expect(invalid).not.toHaveProperty("selfExplanation");
  });

  it("迁移时清洗存在但非法的枚举字段，避免严格备份契约被旧数据卡住", () => {
    const now = "2026-03-01T10:00:00.000Z";
    const note = {
      id: "note-invalid-target-type",
      targetType: "future-target",
      targetId: "hexagram-01",
      markdown: "旧记录",
    } as Record<string, unknown>;
    migrateNoteRecord(note, now);
    expect(note.targetType).toBe("hexagram");

    const attempt = {
      id: "attempt-invalid-enums",
      cardId: "card-1",
      targetType: "future-target",
      exerciseVersion: 0,
      objectiveCorrect: "yes",
      reviewMode: "later",
      hintUsed: "sometimes",
      recallGrade: "remembered",
    } as Record<string, unknown>;
    migrateReviewAttemptRecord(attempt, now);
    expect(attempt).not.toHaveProperty("targetType");
    expect(attempt).not.toHaveProperty("exerciseVersion");
    expect(attempt).not.toHaveProperty("objectiveCorrect");
    expect(attempt).not.toHaveProperty("reviewMode");
    expect(attempt).not.toHaveProperty("hintUsed");

    const state = {
      cardId: "card-1",
      targetType: "future-target",
      targetId: "card-1",
    } as Record<string, unknown>;
    migrateReviewCardStateRecord(state, now);
    expect(state.targetType).toBe("concept");
  });

  it("迁移时间戳时拒绝日历溢出和缺少时区的伪 ISO 字符串", () => {
    const values = [
      "2026-02-30T00:00:00.000Z",
      "2026-08-26T12:00:00",
      "2026-08-26T99:00:00.000Z",
      "2026-08-26T24:00:00.000Z",
    ];
    values.forEach((value, index) => {
      const record = {
        id: `note-invalid-iso-${index}`,
        targetId: "hexagram-01",
        markdown: "旧记录",
        createdAt: value,
        updatedAt: value,
      } as Record<string, unknown>;
      migrateNoteRecord(record, "2026-03-01T10:00:00.000Z");
      expect(record.createdAt).toBe("2026-03-01T10:00:00.000Z");
      expect(record.updatedAt).toBe("2026-03-01T10:00:00.000Z");
    });
  });

  it("迁移笔记时修复时间顺序，避免旧数据绕过当前写入契约", () => {
    const note = {
      id: "note-out-of-order",
      targetType: "hexagram",
      targetId: "hexagram-01",
      markdown: "旧记录",
      createdAt: "2026-03-02T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      deletedAt: "2026-03-01T12:00:00.000Z",
    } as Record<string, unknown>;
    migrateNoteRecord(note, "2026-03-03T00:00:00.000Z");
    expect(note.updatedAt).toBe(note.createdAt);
    expect(note).not.toHaveProperty("deletedAt");
  });

  it("迁移时保留显式未知复习算法版本，交给运行时拒绝", () => {
    const state = {
      cardId: "future-algorithm-card",
      algorithmVersion: 99,
      dueDate: "2026-03-01",
      stepIndex: 1,
      lapseCount: 0,
      consecutivePasses: 0,
      isWeak: false,
    } as Record<string, unknown>;
    migrateReviewCardStateRecord(state, "2026-03-01T10:00:00.000Z");
    expect(state.algorithmVersion).toBe(99);
  });

  it("迁移笔记来源时移除无效访问日期但保留来源字段", () => {
    const note = {
      id: "note-invalid-source-date",
      sourceRefs: [
        { label: "有效来源", accessedAt: "2026-02-28", locator: "p. 1", url: "https://example.com/source" },
        { label: "无效来源", accessedAt: "2026-02-30", locator: "p. 2", url: "javascript:alert(1)", kind: "unknown", author: 123 },
        { label: "", url: "http://" },
        "损坏条目",
      ],
    } as Record<string, unknown>;
    migrateNoteRecord(note, "2026-03-01T10:00:00.000Z");
    expect(note.sourceRefs).toEqual([
      { label: "有效来源", accessedAt: "2026-02-28", locator: "p. 1", url: "https://example.com/source" },
      { label: "无效来源", locator: "p. 2" },
      { label: "未命名来源" },
    ]);
  });

  it("迁移笔记来源时移除未声明的嵌套字段", () => {
    const note = {
      id: "note-source-extra-field",
      targetId: "hexagram-01",
      sourceRefs: [{ label: "来源", unexpected: "legacy", author: "作者" }],
    } as Record<string, unknown>;
    migrateNoteRecord(note, "2026-03-01T10:00:00.000Z");
    expect(note.sourceRefs).toEqual([{ label: "来源", author: "作者" }]);
  });

  it("迁移旧版内容勘误并保留状态变更历史", () => {
    const now = "2026-08-27T00:00:00.000Z";
    const record = {
      id: "erratum-1",
      targetType: "hexagram",
      targetId: "hexagram-1",
      category: "correction",
      description: "旧版勘误",
      proposedText: "",
      sourceRef: "",
      contentVersion: 1,
      status: "resolved",
      unexpected: "legacy-field",
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T01:00:00.000Z",
    } as Record<string, unknown>;
    migrateErratumRecord(record, now);
    expect(() => normalizeErratumForWrite(record as never)).not.toThrow();
    expect(record).not.toHaveProperty("unexpected");
    expect(record.history).toEqual([
      { status: "open", at: "2026-08-26T00:00:00.000Z" },
      { status: "resolved", at: "2026-08-26T01:00:00.000Z" },
    ]);

    const changed = {
      ...record,
      status: "open",
    };
    migrateErratumRecord(changed, now);
    expect((changed as Record<string, unknown>).history).toEqual([
      { status: "open", at: "2026-08-26T00:00:00.000Z" },
      { status: "resolved", at: "2026-08-26T01:00:00.000Z" },
      { status: "open", at: "2026-08-26T01:00:00.000Z" },
    ]);
  });

  it("迁移勘误追加状态时不会制造倒序历史", () => {
    const record = {
      id: "erratum-out-of-order",
      targetType: "hexagram",
      targetId: "hexagram-01",
      category: "question",
      description: "旧记录",
      proposedText: "",
      sourceRef: "",
      contentVersion: 1,
      status: "resolved",
      history: [{ status: "open", at: "2026-03-03T00:00:00.000Z" }],
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
    } as Record<string, unknown>;
    migrateErratumRecord(record, "2026-03-04T00:00:00.000Z");
    expect(record.history).toEqual([
      { status: "open", at: "2026-03-03T00:00:00.000Z" },
      { status: "resolved", at: "2026-03-03T00:00:00.000Z" },
    ]);
  });

  it("校验坐向记录的范围、盘层和唯一主键", () => {
    const record = {
      id: "compass-1",
      degrees: 90,
      directionId: "east",
      layerId: "eight-directions-v1",
      ruleVersion: 1,
      title: "门口",
      environmentNote: "晨间",
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
    } as const;
    expect(() =>
      assertBackupDataIntegrity({ ...emptyData, compassRecords: [record] }),
    ).not.toThrow();
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        compassRecords: [{ ...record, degrees: 360 }],
      }),
    ).toThrow();
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        compassRecords: [{ ...record, degrees: 44 }],
      }),
    ).toThrow(/角度与方位不一致/);
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        compassRecords: [record, record],
      }),
    ).toThrow(/重复主键/);
  });

  it("校验推演快照的动爻唯一性以及本卦/变卦结构", () => {
    const snapshot = {
      id: "snapshot-1",
      lowerTrigramId: "qian",
      upperTrigramId: "qian",
      movingPositions: [],
      baseHexagramId: "hexagram-01",
      changedHexagramId: "hexagram-01",
      title: "乾为天",
      note: "",
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
    };
    expect(() =>
      assertBackupDataIntegrity({ ...emptyData, labSnapshots: [snapshot] }),
    ).not.toThrow();
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        labSnapshots: [{ ...snapshot, movingPositions: [1, 1] }],
      }),
    ).toThrow(/动爻位置存在重复/);
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        labSnapshots: [{ ...snapshot, baseHexagramId: "hexagram-02" }],
      }),
    ).toThrow(/本卦与上下卦不一致/);
  });

  it("拒绝不安全或未知的 AI 偏好值", () => {
    const base = {
      key: "aiAllowedScopes",
      value: JSON.stringify(["selected-notes"]),
      updatedAt: "2026-08-26T00:00:00.000Z",
    } as const;
    expect(() =>
      assertBackupDataIntegrity({ ...emptyData, preferences: [base] }),
    ).not.toThrow();
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        preferences: [{ ...base, value: "" }],
      }),
    ).not.toThrow();
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        preferences: [{ ...base, value: JSON.stringify(["unknown-scope"]) }],
      }),
    ).toThrow(/AI 数据范围/);
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        preferences: [{ ...base, value: JSON.stringify(["selected-notes", "selected-notes"]) }],
      }),
    ).toThrow(/AI 数据范围/);
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        preferences: [{ key: "aiAssistEnabled", value: "true", updatedAt: base.updatedAt }],
      }),
    ).toThrow(/AI 开关/);
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        preferences: [{ key: "aiPreviewPurpose", value: "fortune-telling", updatedAt: base.updatedAt }],
      }),
    ).toThrow(/AI 预览用途/);
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        preferences: [{ key: "futurePreference", value: "anything", updatedAt: base.updatedAt }],
      }),
    ).toThrow(/未知偏好键/);
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        preferences: [{ key: "theme", value: "sepia", updatedAt: base.updatedAt }],
      }),
    ).toThrow(/偏好 theme 的值无效/);
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        preferences: [{ key: "lastExportAt", value: "0", updatedAt: base.updatedAt }],
      }),
    ).toThrow(/偏好 lastExportAt 的值无效/);
  });

  it("校验罗盘手动修正的范围和历史主键", () => {
    const correction = {
      id: "correction-1",
      offsetDegrees: -12.5,
      reason: "用户手动修正",
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
    } as const;
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        compassCorrections: [correction],
      }),
    ).not.toThrow();
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        compassCorrections: [{ ...correction, offsetDegrees: 181 }],
      }),
    ).toThrow();
    expect(() =>
      assertBackupDataIntegrity({
        ...emptyData,
        compassCorrections: [correction, correction],
      }),
    ).toThrow(/重复主键/);
  });
});
