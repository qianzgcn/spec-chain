import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { taskDb, taskRuntime } from "@/task-runtime/runtime";

async function findFirstPng(directory: string): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirstPng(entryPath);
      if (nested) return nested;
    } else if (entry.name.toLocaleLowerCase().endsWith(".png")) {
      return entryPath;
    }
  }
  return null;
}

function isInsideDataDirectory(target: string) {
  const relative = path.relative(taskRuntime.dataDir, target);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

export async function purgeExpiredArtifacts() {
  while (true) {
    const expiredRuns = await taskDb.testRun.findMany({
      where: {
        artifactsExpireAt: { lte: new Date() },
        artifactsPurgedAt: null,
      },
      take: 100,
      select: { id: true, screenshotPath: true },
    });

    for (const run of expiredRuns) {
      if (run.screenshotPath) {
        const artifactPath = path.resolve(
          taskRuntime.dataDir,
          run.screenshotPath,
        );
        if (isInsideDataDirectory(artifactPath)) {
          await rm(path.dirname(artifactPath), {
            recursive: true,
            force: true,
          }).catch(() => undefined);
        }
      }

      await taskDb.testRun.updateMany({
        where: { id: run.id, artifactsPurgedAt: null },
        data: {
          logContent: null,
          screenshotPath: null,
          artifactsPurgedAt: new Date(),
        },
      });
    }

    if (expiredRuns.length < 100) return;
  }
}

export async function persistFailureScreenshot(runId: string, workDir: string) {
  const screenshot = await findFirstPng(path.join(workDir, "test-results"));
  if (!screenshot) return null;

  const artifactDirectory = path.join(taskRuntime.dataDir, "artifacts", runId);
  await mkdir(artifactDirectory, { recursive: true });
  const target = path.join(artifactDirectory, "failure.png");
  await copyFile(screenshot, target);
  return path.posix.join("artifacts", runId, "failure.png");
}
