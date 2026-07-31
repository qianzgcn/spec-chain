import { createHash } from "node:crypto";

import type { VariableKind } from "@/generated/prisma/enums";

export type AutomationVariableMetadata = {
  name: string;
  kind: VariableKind;
  description: string | null;
};

export type AutomationFingerprintInput = {
  testCase: {
    name: string;
    preconditions: string | null;
    steps: string;
  };
  baseUrl: string;
  automationInstructions: string | null;
  variables: readonly AutomationVariableMetadata[];
};

export function createAutomationInputFingerprint(
  input: AutomationFingerprintInput,
) {
  const normalized = {
    testCase: {
      name: input.testCase.name.trim(),
      preconditions: input.testCase.preconditions?.trim() || null,
      steps: input.testCase.steps.trim(),
    },
    baseUrl: input.baseUrl.trim(),
    automationInstructions: input.automationInstructions?.trim() || null,
    variables: input.variables
      .map((variable) => ({
        name: variable.name,
        kind: variable.kind,
        description: variable.description?.trim() || null,
      }))
      .toSorted((left, right) => left.name.localeCompare(right.name, "en")),
  };

  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
