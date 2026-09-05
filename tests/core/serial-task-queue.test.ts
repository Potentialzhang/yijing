import { describe, expect, it } from "vitest";
import { createSerialTaskQueue } from "@/core/async/serial-task-queue";

describe("串行任务队列", () => {
  it("按入队顺序执行，即使后一个任务先准备好", async () => {
    const queue = createSerialTaskQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const firstResult = queue.enqueue(async () => {
      events.push("first:start");
      await first;
      events.push("first:end");
      return "one";
    });
    const secondResult = queue.enqueue(async () => {
      events.push("second");
      return "two";
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await expect(firstResult).resolves.toBe("one");
    await expect(secondResult).resolves.toBe("two");
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("单个任务失败后仍允许后续任务执行，并保留失败结果", async () => {
    const queue = createSerialTaskQueue();
    const events: string[] = [];
    const failure = queue.enqueue(async () => {
      events.push("failed");
      throw new Error("temporary");
    });
    const recovery = queue.enqueue(async () => {
      events.push("recovered");
      return 42;
    });

    await expect(failure).rejects.toThrow("temporary");
    await expect(recovery).resolves.toBe(42);
    expect(events).toEqual(["failed", "recovered"]);
  });
});
