export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [{ recoverRunnerState }, { recoverAiQueueState }] = await Promise.all([
    import("@/server/runner/launcher"),
    import("@/server/ai/launcher"),
  ]);
  await Promise.all([recoverRunnerState(), recoverAiQueueState()]);
}
