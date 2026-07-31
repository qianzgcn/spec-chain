import type { TestCaseScriptSource } from "@/generated/prisma/enums";

export type AutomationScriptStatus =
  "NOT_GENERATED" | "AI_GENERATED" | "MANUAL" | "STALE";

export const AUTOMATION_SCRIPT_STATUS_META: Record<
  AutomationScriptStatus,
  {
    label: string;
    badgeVariant: "info" | "success" | "warning" | "outline";
  }
> = {
  NOT_GENERATED: { label: "未生成", badgeVariant: "outline" },
  AI_GENERATED: { label: "AI生成", badgeVariant: "success" },
  MANUAL: { label: "手工编写", badgeVariant: "info" },
  STALE: { label: "需更新", badgeVariant: "warning" },
};

export function getAutomationScriptStatus(input: {
  script: string | null;
  source: TestCaseScriptSource | null;
  aiFingerprint: string | null;
  currentFingerprint: string;
}): AutomationScriptStatus {
  if (!input.script?.trim()) return "NOT_GENERATED";
  if (input.source !== "AI") return "MANUAL";
  return input.aiFingerprint === input.currentFingerprint
    ? "AI_GENERATED"
    : "STALE";
}
