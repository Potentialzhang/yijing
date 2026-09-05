/**
 * Run asynchronous tasks in enqueue order while allowing one failed task to
 * be observed by its caller without poisoning the queue for later tasks.
 *
 * This is intentionally framework-agnostic so local persistence callers can
 * share the same ordering guarantee without depending on React state.
 */
export interface SerialTaskQueue {
  enqueue<T>(task: () => Promise<T>): Promise<T>;
}

export function createSerialTaskQueue(): SerialTaskQueue {
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const next = tail.then(task);
      // Keep the chain alive after a rejected task. The rejection remains
      // visible through `next`, while later tasks still get their turn.
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}
