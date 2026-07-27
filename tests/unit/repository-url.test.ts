import { describe, expect, it } from "vitest";

import {
  parseRepositoryUrl,
  RepositoryUrlError,
} from "@/lib/git/repository-url";

describe("仓库地址识别", () => {
  it.each([
    [
      "https://github.com/openai/spec-chain.git",
      "GITHUB",
      "openai",
      "spec-chain",
    ],
    ["git@github.com:openai/spec-chain.git", "GITHUB", "openai", "spec-chain"],
    [
      "ssh://git@github.com/openai/spec-chain.git",
      "GITHUB",
      "openai",
      "spec-chain",
    ],
    ["https://gitee.com/team/spec-chain", "GITEE", "team", "spec-chain"],
    ["git@gitee.com:team/spec-chain.git", "GITEE", "team", "spec-chain"],
  ] as const)("识别 %s", (gitUrl, provider, owner, repository) => {
    expect(parseRepositoryUrl(gitUrl)).toMatchObject({
      provider,
      owner,
      repository,
    });
  });

  it.each([
    "http://github.com/openai/spec-chain.git",
    "https://user:token@github.com/openai/spec-chain.git",
    "https://github.com/openai/spec-chain.git?token=secret",
    "https://github.com/openai/spec-chain/tree/main",
    "https://gitlab.com/openai/spec-chain.git",
    "ssh://root@github.com/openai/spec-chain.git",
    "not-a-git-url",
  ])("拒绝不受支持或不安全的地址：%s", (gitUrl) => {
    expect(() => parseRepositoryUrl(gitUrl)).toThrow(RepositoryUrlError);
  });
});
