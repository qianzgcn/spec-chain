import { createHash } from "node:crypto";

type UserStoryTestDesignSource = {
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  businessRules: string | null;
  nonFunctionalRequirements: string | null;
  acceptanceCriteria: ReadonlyArray<{
    given: string;
    when: string;
    then: string;
  }>;
};

type TestCaseSetSource = ReadonlyArray<{
  code: string;
  groupId: string;
  name: string;
  priority: string;
  preconditions: string | null;
  steps: string;
  enabled: boolean;
}>;

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function optionalText(value: string | null) {
  return value?.trim() || null;
}

export function createUserStoryTestDesignFingerprint(
  story: UserStoryTestDesignSource,
) {
  return fingerprint({
    title: story.title.trim(),
    asA: story.asA.trim(),
    iWant: story.iWant.trim(),
    soThat: story.soThat.trim(),
    businessRules: optionalText(story.businessRules),
    nonFunctionalRequirements: optionalText(story.nonFunctionalRequirements),
    acceptanceCriteria: story.acceptanceCriteria.map((criterion) => ({
      given: criterion.given.trim(),
      when: criterion.when.trim(),
      then: criterion.then.trim(),
    })),
  });
}

export function createTestCaseSetFingerprint(testCases: TestCaseSetSource) {
  return fingerprint(
    testCases
      .map((testCase) => ({
        code: testCase.code,
        groupId: testCase.groupId,
        name: testCase.name.trim(),
        priority: testCase.priority,
        preconditions: optionalText(testCase.preconditions),
        steps: testCase.steps.trim(),
        enabled: testCase.enabled,
      }))
      .toSorted((left, right) => left.code.localeCompare(right.code, "en")),
  );
}
