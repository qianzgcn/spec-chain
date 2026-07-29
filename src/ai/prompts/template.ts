const PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

export function renderPromptTemplate(
  template: string,
  variables: Readonly<Record<string, string>>,
) {
  const placeholders = [
    ...new Set(
      [...template.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]),
    ),
  ];
  const missingVariables = placeholders.filter(
    (name) => !Object.hasOwn(variables, name),
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `提示词模板缺少变量：${missingVariables.sort().join("、")}`,
    );
  }

  return template.replace(
    PLACEHOLDER_PATTERN,
    (_placeholder, name: string) => variables[name],
  );
}
