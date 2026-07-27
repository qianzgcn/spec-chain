import { describe, expect, it, vi } from "vitest";

import { createRepositoryCodeSource } from "@/ai/repository-code-source";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("AI 仓库代码读取", () => {
  it("通过 GitHub 固定 API 读取分支、文件树和源码", async () => {
    const fetchImplementation = vi.fn<typeof fetch>((url) => {
      const value = String(url);
      if (value.includes("/branches/")) {
        return jsonResponse({ commit: { sha: "commit-sha" } });
      }
      if (value.includes("/git/trees/")) {
        return jsonResponse({
          truncated: false,
          tree: [
            { path: "src/page.tsx", type: "blob", sha: "blob-sha", size: 20 },
            {
              path: "node_modules/pkg/index.js",
              type: "blob",
              sha: "ignored",
              size: 10,
            },
            { path: "logo.png", type: "blob", sha: "binary", size: 10 },
          ],
        });
      }
      return jsonResponse({
        encoding: "base64",
        content: Buffer.from("export const page = true;").toString("base64"),
      });
    });
    const source = createRepositoryCodeSource(fetchImplementation);

    const snapshot = await source.loadTree({
      id: "repo-1",
      gitUrl: "https://github.com/team/spec-chain.git",
      branch: "feature/login",
      pat: "github-secret",
    });
    const file = await source.readFile(snapshot, snapshot.files[0]!);

    expect(snapshot).toMatchObject({
      provider: "GITHUB",
      owner: "team",
      repository: "spec-chain",
      branch: "feature/login",
      commitSha: "commit-sha",
      files: [{ path: "src/page.tsx", sha: "blob-sha" }],
    });
    expect(file.content).toContain("page = true");
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/repos/team/spec-chain/branches/feature%2Flogin",
    );
    expect(
      new Headers(fetchImplementation.mock.calls[0]?.[1]?.headers).get(
        "Authorization",
      ),
    ).toBe("Bearer github-secret");
  });

  it("Gitee 仓库只使用 Gitee Token", async () => {
    const fetchImplementation = vi.fn<typeof fetch>((url) =>
      String(url).includes("/branches/")
        ? jsonResponse({ commit: { sha: "commit-sha" } })
        : jsonResponse({ tree: [] }),
    );
    const source = createRepositoryCodeSource(fetchImplementation);

    await source.loadTree({
      id: "repo-1",
      gitUrl: "git@gitee.com:team/spec-chain.git",
      branch: "main",
      pat: "gitee-secret",
    });

    expect(
      new Headers(fetchImplementation.mock.calls[0]?.[1]?.headers).get(
        "Authorization",
      ),
    ).toBe("token gitee-secret");
  });

  it("拒绝平台返回的不完整文件树", async () => {
    const fetchImplementation = vi.fn<typeof fetch>((url) =>
      String(url).includes("/branches/")
        ? jsonResponse({ commit: { sha: "commit-sha" } })
        : jsonResponse({ truncated: true, tree: [] }),
    );
    const source = createRepositoryCodeSource(fetchImplementation);

    await expect(
      source.loadTree({
        id: "repo-1",
        gitUrl: "https://github.com/team/spec-chain.git",
        branch: "main",
        pat: "secret",
      }),
    ).rejects.toMatchObject({
      code: "TOO_LARGE",
    });
  });

  it("不会把平台原始错误或 PAT 带入错误信息", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      jsonResponse({ message: "secret-token raw response" }, 401),
    );
    const source = createRepositoryCodeSource(fetchImplementation);

    await expect(
      source.loadTree({
        id: "repo-1",
        gitUrl: "https://github.com/team/spec-chain.git",
        branch: "main",
        pat: "secret-token",
      }),
    ).rejects.toThrow("PAT 无效或已过期");

    try {
      await source.loadTree({
        id: "repo-1",
        gitUrl: "https://github.com/team/spec-chain.git",
        branch: "main",
        pat: "secret-token",
      });
    } catch (error) {
      expect(String(error)).not.toContain("secret-token");
      expect(String(error)).not.toContain("raw response");
    }
  });
});
