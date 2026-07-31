import { RunStatus } from "@/generated/prisma/enums";

export function resolveRunStatus({
  timedOut,
  stopRequested,
  exitCode,
}: {
  timedOut: boolean;
  stopRequested: boolean;
  exitCode: number | null;
}) {
  if (timedOut) return RunStatus.TIMED_OUT;
  if (stopRequested) return RunStatus.STOPPED;
  return exitCode === 0 ? RunStatus.PASSED : RunStatus.FAILED;
}
