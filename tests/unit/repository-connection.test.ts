import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseRepositoryUrl } from "@/lib/git/repository-url";

vi.mock("server-only", () => ({}));

const { checkRepositoryConnection, verifyGitCredential } =
  await import("@/server/projects/repository-connection");

function response(status: number, body = "{}") {
  return Promise.resolve(new Response(body, { status }));
}

describe("仓库连接检查", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      "GITHUB" as const,
      "https://api.github.com/user",
      "Bearer github-secret",
      "github-secret",
      "qianzgcn",
    ],
    [
      "GITEE" as const,
      "https://gitee.com/api/v5/user",
      "token gitee-secret",
      "gitee-secret",
      "nodepression",
    ],
  ])(
    "验证 %s PAT 并返回所属账号",
    async (provider, url, authorization, pat, account) => {
      const fetchImplementation = vi.fn<typeof fetch>(() =>
        response(200, JSON.stringify({ login: account })),
      );

      await expect(
        verifyGitCredential(provider, pat, fetchImplementation),
      ).resolves.toEqual({ provider, account });
      expect(fetchImplementation).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          cache: "no-store",
          headers: expect.objectContaining({ Authorization: authorization }),
        }),
      );
    },
  );

  it("拒绝无效 PAT 且不泄露明文", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() => response(401));

    await expect(
      verifyGitCredential(
        "GITHUB",
        "never-return-this-token",
        fetchImplementation,
      ),
    ).rejects.toThrow("PAT 无效或已过期");

    try {
      await verifyGitCredential(
        "GITHUB",
        "never-return-this-token",
        fetchImplementation,
      );
    } catch (error) {
      expect(String(error)).not.toContain("never-return-this-token");
    }
  });

  it("使用 GitHub PAT 并正确编码带斜杠的分支", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() => response(200));
    const location = parseRepositoryUrl(
      "https://github.com/openai/spec-chain.git",
    );

    const result = await checkRepositoryConnection(
      location,
      "feature/login",
      "github-secret",
      fetchImplementation,
    );

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls[1]?.[0]).toBe(
      "https://api.github.com/repos/openai/spec-chain/branches/feature%2Flogin",
    );
    expect(
      new Headers(fetchImplementation.mock.calls[0]?.[1]?.headers).get(
        "Authorization",
      ),
    ).toBe("Bearer github-secret");
    expect(result).toEqual({
      provider: "GITHUB",
      owner: "openai",
      repository: "spec-chain",
      branch: "feature/login",
    });
    expect(JSON.stringify(result)).not.toContain("github-secret");
  });

  it("Gitee 仓库只使用 Gitee Token 认证格式", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() => response(200));
    const location = parseRepositoryUrl("git@gitee.com:team/spec-chain.git");

    await checkRepositoryConnection(
      location,
      "main",
      "gitee-secret",
      fetchImplementation,
    );

    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      "https://gitee.com/api/v5/repos/team/spec-chain",
    );
    expect(
      new Headers(fetchImplementation.mock.calls[0]?.[1]?.headers).get(
        "Authorization",
      ),
    ).toBe("token gitee-secret");
  });

  it.each([
    [401, 401, "PAT 无效或已过期"],
    [403, 403, "PAT 权限不足或接口调用受限"],
    [404, 404, "仓库不存在或当前凭据无权访问"],
    [200, 404, "仓库可访问，但指定分支不存在"],
    [500, 500, "服务暂时不可用"],
  ])(
    "将平台响应 %i/%i 转换为安全中文错误",
    async (repositoryStatus, branchStatus, expectedMessage) => {
      const fetchImplementation = vi.fn<typeof fetch>((url) =>
        String(url).includes("/branches/")
          ? response(branchStatus)
          : response(repositoryStatus),
      );
      const location = parseRepositoryUrl(
        "https://github.com/openai/spec-chain.git",
      );

      await expect(
        checkRepositoryConnection(
          location,
          "main",
          "never-return-this-token",
          fetchImplementation,
        ),
      ).rejects.toThrow(expectedMessage);

      try {
        await checkRepositoryConnection(
          location,
          "main",
          "never-return-this-token",
          fetchImplementation,
        );
      } catch (error) {
        expect(String(error)).not.toContain("never-return-this-token");
      }
    },
  );

  it("区分连接超时与普通网络错误", async () => {
    const location = parseRepositoryUrl(
      "https://github.com/openai/spec-chain.git",
    );
    const timeoutFetch = vi.fn<typeof fetch>(() =>
      Promise.reject(new DOMException("超时", "TimeoutError")),
    );
    const networkFetch = vi.fn<typeof fetch>(() =>
      Promise.reject(new TypeError("network failed")),
    );

    await expect(
      checkRepositoryConnection(location, "main", "secret", timeoutFetch),
    ).rejects.toThrow("连接超时");
    await expect(
      checkRepositoryConnection(location, "main", "secret", networkFetch),
    ).rejects.toThrow("无法连接 GitHub");
  });
});
