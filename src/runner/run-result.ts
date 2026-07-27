import { RunStatus } from "@/generated/prisma/enums";

export function resolveRunStatus({
  timedOut,
  stopRequested,
  leaseLost,
  exitCode,
}: {
  timedOut: boolean;
  stopRequested: boolean;
  leaseLost: boolean;
  exitCode: number | null;
}) {
  if (timedOut) return RunStatus.TIMED_OUT;
  if (stopRequested) return RunStatus.STOPPED;
  if (leaseLost) return RunStatus.FAILED;
  return exitCode === 0 ? RunStatus.PASSED : RunStatus.FAILED;
}
