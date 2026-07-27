export function redactSecrets(content: string, secrets: string[]) {
  return secrets
    .filter(Boolean)
    .toSorted((left, right) => right.length - left.length)
    .reduce(
      (sanitized, secret) => sanitized.split(secret).join("******"),
      content,
    );
}

export function buildLogContent(
  stdout: string,
  stderr: string,
  secrets: string[],
) {
  const sections: string[] = [];
  if (stdout) sections.push(`【标准输出】\n${stdout}`);
  if (stderr) sections.push(`【标准错误】\n${stderr}`);
  return redactSecrets(sections.join("\n\n"), secrets);
}

export function summarizeFailure(logContent: string, exitCode: number | null) {
  const lines = logContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const errorIndex = lines.findIndex(
    (line) => line.startsWith("Error:") || line.includes(" Error: "),
  );
  const relevant =
    errorIndex >= 0
      ? lines.slice(errorIndex, errorIndex + 8).join("\n")
      : lines.slice(-8).join("\n");

  return relevant.slice(0, 1_000) || `Playwright 退出码：${exitCode ?? "未知"}`;
}
