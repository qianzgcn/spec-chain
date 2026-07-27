export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { recoverRunnerState } = await import("@/server/runner/launcher");
  await recoverRunnerState();
}
