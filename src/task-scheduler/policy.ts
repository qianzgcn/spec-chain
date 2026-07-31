export type QueuedBrowserTask =
  | { kind: "AI"; id: string; queuedAt: Date }
  | { kind: "TEST_RUN"; id: string; queuedAt: Date };

export function getAvailableTaskSlots(limit: number, running: number) {
  return Math.max(0, limit - running);
}

export function chooseNextBrowserTask(
  aiTask: { id: string; queuedAt: Date } | null,
  testRun: { id: string; queuedAt: Date } | null,
): QueuedBrowserTask | null {
  if (!aiTask && !testRun) return null;
  if (
    aiTask &&
    (!testRun || aiTask.queuedAt.getTime() <= testRun.queuedAt.getTime())
  ) {
    return { kind: "AI", ...aiTask };
  }
  return { kind: "TEST_RUN", ...testRun! };
}
