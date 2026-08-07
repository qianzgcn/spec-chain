import { createHash } from "node:crypto";

type SpecificationTestCase = {
  id: string;
  code: string;
  name: string;
  preconditions: string | null;
  steps: string;
  enabled: boolean;
};

export type DeliverySpecificationStory = {
  id: string;
  code: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  businessRules: string | null;
  nonFunctionalRequirements: string | null;
  acceptanceCriteria: Array<{
    position: number;
    given: string;
    when: string;
    then: string;
  }>;
  testCases: SpecificationTestCase[];
};

export type RegressionTestCase = SpecificationTestCase & {
  userStoryId: string | null;
};

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeStory(story: DeliverySpecificationStory) {
  return {
    id: story.id,
    code: story.code,
    title: story.title,
    asA: story.asA,
    iWant: story.iWant,
    soThat: story.soThat,
    businessRules: story.businessRules,
    nonFunctionalRequirements: story.nonFunctionalRequirements,
    acceptanceCriteria: story.acceptanceCriteria
      .toSorted((left, right) => left.position - right.position)
      .map(({ position, given, when, then }) => ({
        position,
        given,
        when,
        then,
      })),
    testCases: story.testCases
      .filter((testCase) => testCase.enabled)
      .toSorted((left, right) => left.code.localeCompare(right.code))
      .map(({ id, code, name, preconditions, steps }) => ({
        id,
        code,
        name,
        preconditions,
        steps,
      })),
  };
}

export function createDeliverySpecificationFingerprint(
  stories: readonly DeliverySpecificationStory[],
) {
  return hash(
    stories
      .toSorted((left, right) => left.code.localeCompare(right.code))
      .map(normalizeStory),
  );
}

export function createDeliverySpecificationSnapshot(
  story: DeliverySpecificationStory,
) {
  return JSON.stringify(normalizeStory(story));
}

export function createRegressionFingerprint(
  testCases: readonly RegressionTestCase[],
) {
  return hash(
    testCases
      .toSorted((left, right) => left.code.localeCompare(right.code))
      .map((testCase) => ({
        id: testCase.id,
        code: testCase.code,
        name: testCase.name,
        preconditions: testCase.preconditions,
        steps: testCase.steps,
        enabled: testCase.enabled,
        userStoryId: testCase.userStoryId,
      })),
  );
}
