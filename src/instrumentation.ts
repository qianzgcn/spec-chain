export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { recoverExecutionTaskState } = await import("@/server/tasks/launcher");
  await recoverExecutionTaskState();
}
