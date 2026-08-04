import { createHash } from "node:crypto";

import {
  referencedVariableNames,
  type ProjectVariableMetadata,
} from "@/lib/project-variables/references";

export type AutomationVariableMetadata = ProjectVariableMetadata;

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
  const referencedNames = referencedVariableNames({
    testCase: input.testCase,
    variables: input.variables,
  });
  const normalized = {
    testCase: {
      name: input.testCase.name.trim(),
      preconditions: input.testCase.preconditions?.trim() || null,
      steps: input.testCase.steps.trim(),
    },
    baseUrl: input.baseUrl.trim(),
    automationInstructions: input.automationInstructions?.trim() || null,
    referencedVariableNames: [...referencedNames].toSorted((left, right) =>
      left.localeCompare(right, "en"),
    ),
    variables: input.variables
      .filter((variable) => referencedNames.has(variable.name))
      .map((variable) => ({
        name: variable.name,
        kind: variable.kind,
        encrypted: variable.encrypted,
        description: variable.description?.trim() || null,
        fields: variable.fields
          .map((field) => ({
            name: field.name,
            kind: field.kind,
            encrypted: field.encrypted,
            description: field.description?.trim() || null,
          }))
          .toSorted((left, right) => left.name.localeCompare(right.name, "en")),
      }))
      .toSorted((left, right) => left.name.localeCompare(right.name, "en")),
  };

  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
