import { describe, expect, it } from "vitest";

import {
  chooseNextBrowserTask,
  getAvailableTaskSlots,
} from "@/task-scheduler/policy";

describe("任务调度策略", () => {
  it("容量只补齐空闲槽位", () => {
    expect(getAvailableTaskSlots(2, 0)).toBe(2);
    expect(getAvailableTaskSlots(2, 1)).toBe(1);
    expect(getAvailableTaskSlots(2, 2)).toBe(0);
    expect(getAvailableTaskSlots(2, 3)).toBe(0);
  });

  it("浏览器资源池在两类任务之间按发起时间 FIFO", () => {
    const earlier = new Date("2026-07-30T10:00:00.000Z");
    const later = new Date("2026-07-30T10:00:01.000Z");

    expect(
      chooseNextBrowserTask(
        { id: "ai-1", queuedAt: later },
        { id: "run-1", queuedAt: earlier },
      ),
    ).toMatchObject({ kind: "TEST_RUN", id: "run-1" });
    expect(
      chooseNextBrowserTask(
        { id: "ai-1", queuedAt: earlier },
        { id: "run-1", queuedAt: later },
      ),
    ).toMatchObject({ kind: "AI", id: "ai-1" });
  });
});
