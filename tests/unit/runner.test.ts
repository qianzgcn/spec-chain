import { describe, expect, it } from "vitest";

import { RunStatus } from "@/generated/prisma/enums";
import {
  buildLogContent,
  redactSecrets,
  summarizeFailure,
} from "@/runner/logs";
import { resolveRunStatus } from "@/runner/run-result";

describe("运行日志", () => {
  it("在日志入库前脱敏普通输出和错误输出", () => {
    const log = buildLogContent(
      "token=very-secret-token",
      "请求 very-secret 失败",
      ["very-secret", "very-secret-token"],
    );

    expect(log).toContain("【标准输出】");
    expect(log).toContain("【标准错误】");
    expect(log).not.toContain("very-secret");
    expect(log).toContain("******");
  });

  it("忽略空敏感值，避免破坏整段日志", () => {
    expect(redactSecrets("正常日志", [""])).toBe("正常日志");
  });

  it("从 Playwright 日志中提取简短错误摘要", () => {
    const summary = summarizeFailure(
      "第一行\nError: 断言失败\n详细信息\n调用栈",
      1,
    );
    expect(summary).toContain("Error: 断言失败");
    expect(summary.length).toBeLessThanOrEqual(1_000);
  });
});

describe("运行结果状态", () => {
  it("退出码为零时成功", () => {
    expect(
      resolveRunStatus({
        timedOut: false,
        stopRequested: false,
        exitCode: 0,
      }),
    ).toBe(RunStatus.PASSED);
  });

  it("超时优先于停止请求", () => {
    expect(
      resolveRunStatus({
        timedOut: true,
        stopRequested: true,
        exitCode: null,
      }),
    ).toBe(RunStatus.TIMED_OUT);
  });

  it("用户停止时为已停止", () => {
    expect(
      resolveRunStatus({
        timedOut: false,
        stopRequested: true,
        exitCode: null,
      }),
    ).toBe(RunStatus.STOPPED);
  });

  it("非零退出码时失败", () => {
    expect(
      resolveRunStatus({
        timedOut: false,
        stopRequested: false,
        exitCode: 1,
      }),
    ).toBe(RunStatus.FAILED);
  });
});
