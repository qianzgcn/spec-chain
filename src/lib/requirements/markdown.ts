type AcceptanceCriterionMarkdown = {
  given: string;
  when: string;
  then: string;
};

type UserStoryMarkdown = {
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  businessRules?: string | null;
  nonFunctionalRequirements?: string | null;
  acceptanceCriteria: AcceptanceCriterionMarkdown[];
};

type FeatureMarkdown = {
  name: string;
  summary: string;
  backgroundGoal: string;
  userStories: UserStoryMarkdown[];
};

function buildUserStorySections(story: UserStoryMarkdown, headingLevel: 1 | 3) {
  const heading = "#".repeat(headingLevel);
  const sectionHeading = "#".repeat(headingLevel + 1);
  const itemHeading = "#".repeat(headingLevel + 2);
  const sections = [
    `${heading} ${story.title}`,
    "",
    `${sectionHeading} 用户故事`,
    "",
    `**As** ${story.asA}`,
    "",
    `**I want** ${story.iWant}`,
    "",
    `**so that** ${story.soThat}`,
    "",
    `${sectionHeading} 验收标准`,
    "",
    ...story.acceptanceCriteria.flatMap((criterion, index) => [
      `${itemHeading} ${index + 1}`,
      "",
      `- **Given** ${criterion.given}`,
      `- **When** ${criterion.when}`,
      `- **Then** ${criterion.then}`,
      "",
    ]),
  ];

  if (story.businessRules?.trim()) {
    sections.push(
      `${sectionHeading} 业务规则`,
      "",
      story.businessRules.trim(),
      "",
    );
  }

  if (story.nonFunctionalRequirements?.trim()) {
    sections.push(
      `${sectionHeading} 非功能需求`,
      "",
      story.nonFunctionalRequirements.trim(),
      "",
    );
  }

  return sections;
}

export function buildUserStoryMarkdown(story: UserStoryMarkdown) {
  return buildUserStorySections(story, 1).join("\n").trim();
}

export function buildFeatureMarkdown(feature: FeatureMarkdown) {
  const sections = [
    `# ${feature.name}`,
    "",
    feature.summary,
    "",
    "## 业务背景与目标",
    "",
    feature.backgroundGoal.trim(),
  ];

  if (feature.userStories.length > 0) {
    sections.push("", "## 用户故事", "");

    feature.userStories.forEach((story) => {
      const storySections = buildUserStorySections(story, 3);
      sections.push(...storySections, "");
    });
  }

  return sections.join("\n").trim();
}
