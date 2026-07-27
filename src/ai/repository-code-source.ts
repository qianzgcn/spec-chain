import { z } from "zod";

import {
  GIT_PROVIDER_LABELS,
  parseRepositoryUrl,
  type GitProvider,
} from "@/lib/git/repository-url";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CANDIDATE_FILES = 6_000;
const MAX_FILE_BYTES = 128 * 1024;

const SOURCE_FILE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".gql",
  ".graphql",
  ".h",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".less",
  ".md",
  ".mjs",
  ".mts",
  ".php",
  ".prisma",
  ".properties",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svelte",
  ".toml",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

const IGNORED_PATH_SEGMENTS = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);

const ALWAYS_INCLUDED_FILE_NAMES = new Set([
  "dockerfile",
  "makefile",
  "readme",
  "readme.md",
]);

const branchResponseSchema = z.object({
  commit: z.object({
    sha: z.string().min(1),
    commit: z
      .object({
        tree: z.object({
          sha: z.string().min(1),
        }),
      })
      .optional(),
  }),
});

const treeResponseSchema = z.object({
  truncated: z.boolean().optional().default(false),
  tree: z.array(
    z.object({
      path: z.string().min(1),
      type: z.string(),
      sha: z.string().min(1),
      size: z.number().int().nonnegative().optional(),
    }),
  ),
});

const blobResponseSchema = z.object({
  content: z.string(),
  encoding: z.string().optional().default("base64"),
});

export type RepositoryAccess = {
  id: string;
  gitUrl: string;
  branch: string;
  pat: string;
};

export type RepositoryFile = {
  path: string;
  sha: string;
  size: number | null;
};

export type RepositoryTreeSnapshot = {
  repositoryId: string;
  provider: GitProvider;
  owner: string;
  repository: string;
  branch: string;
  commitSha: string;
  files: RepositoryFile[];
  headers: Record<string, string>;
  apiBaseUrl: string;
};

export type RepositoryCodeFile = {
  path: string;
  content: string;
};

export interface RepositoryCodeSource {
  loadTree(
    repository: RepositoryAccess,
    abortSignal?: AbortSignal,
  ): Promise<RepositoryTreeSnapshot>;
  readFile(
    snapshot: RepositoryTreeSnapshot,
    file: RepositoryFile,
    abortSignal?: AbortSignal,
  ): Promise<RepositoryCodeFile>;
}

export type RepositoryCodeErrorCode =
  | "AUTH"
  | "PERMISSION"
  | "NOT_FOUND"
  | "TOO_LARGE"
  | "UNREADABLE"
  | "TIMEOUT"
  | "SERVICE";

export class RepositoryCodeError extends Error {
  constructor(
    public readonly code: RepositoryCodeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryCodeError";
  }
}

function createSignal(abortSignal?: AbortSignal) {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return abortSignal
    ? AbortSignal.any([abortSignal, timeoutSignal])
    : timeoutSignal;
}

function isTimeoutError(error: unknown) {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  return error.name === "AbortError" || error.name === "TimeoutError";
}

function buildProviderRequest(
  provider: GitProvider,
  owner: string,
  repository: string,
  pat: string,
): { apiBaseUrl: string; headers: Record<string, string> } {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepository = encodeURIComponent(repository);

  if (provider === "GITHUB") {
    return {
      apiBaseUrl: `https://api.github.com/repos/${encodedOwner}/${encodedRepository}`,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${pat}`,
        "User-Agent": "SpecChain",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    };
  }

  return {
    apiBaseUrl: `https://gitee.com/api/v5/repos/${encodedOwner}/${encodedRepository}`,
    headers: {
      Accept: "application/json",
      Authorization: `token ${pat}`,
      "User-Agent": "SpecChain",
    },
  };
}

async function readJson(
  url: string,
  headers: Record<string, string>,
  abortSignal?: AbortSignal,
  fetchImplementation: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      cache: "no-store",
      headers,
      signal: createSignal(abortSignal),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new RepositoryCodeError("TIMEOUT", "读取代码仓库超时");
    }
    throw new RepositoryCodeError("SERVICE", "无法连接代码托管平台");
  }

  if (response.status === 401) {
    throw new RepositoryCodeError("AUTH", "仓库 PAT 无效或已过期");
  }
  if (response.status === 403 || response.status === 429) {
    throw new RepositoryCodeError(
      "PERMISSION",
      "仓库 PAT 权限不足或平台接口调用受限",
    );
  }
  if (response.status === 404) {
    throw new RepositoryCodeError(
      "NOT_FOUND",
      "仓库、分支或代码文件不存在，或当前 PAT 无权访问",
    );
  }
  if (!response.ok) {
    throw new RepositoryCodeError(
      "SERVICE",
      "代码托管平台暂时不可用，请稍后重试",
    );
  }

  try {
    return await response.json();
  } catch {
    throw new RepositoryCodeError("SERVICE", "代码托管平台返回了无效数据");
  }
}

function isCandidatePath(filePath: string) {
  const normalized = filePath.replaceAll("\\", "/");
  const segments = normalized.toLowerCase().split("/");

  if (
    segments.some(
      (segment) =>
        segment === ".." ||
        IGNORED_PATH_SEGMENTS.has(segment) ||
        segment.endsWith(".min.js"),
    )
  ) {
    return false;
  }

  const fileName = segments.at(-1) ?? "";
  if (ALWAYS_INCLUDED_FILE_NAMES.has(fileName)) return true;

  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex < 0) return false;
  return SOURCE_FILE_EXTENSIONS.has(fileName.slice(extensionIndex));
}

export function createRepositoryCodeSource(
  fetchImplementation: typeof fetch = fetch,
): RepositoryCodeSource {
  return {
    async loadTree(repository, abortSignal) {
      const location = parseRepositoryUrl(repository.gitUrl);
      const request = buildProviderRequest(
        location.provider,
        location.owner,
        location.repository,
        repository.pat,
      );
      const encodedBranch = encodeURIComponent(repository.branch);

      const branchPayload = await readJson(
        `${request.apiBaseUrl}/branches/${encodedBranch}`,
        request.headers,
        abortSignal,
        fetchImplementation,
      );
      const branchResult = branchResponseSchema.safeParse(branchPayload);
      if (!branchResult.success) {
        throw new RepositoryCodeError(
          "SERVICE",
          `${GIT_PROVIDER_LABELS[location.provider]} 返回的分支信息无效`,
        );
      }

      const treePayload = await readJson(
        `${request.apiBaseUrl}/git/trees/${encodeURIComponent(
          branchResult.data.commit.commit?.tree.sha ??
            branchResult.data.commit.sha,
        )}?recursive=1`,
        request.headers,
        abortSignal,
        fetchImplementation,
      );
      const treeResult = treeResponseSchema.safeParse(treePayload);
      if (!treeResult.success) {
        throw new RepositoryCodeError(
          "SERVICE",
          `${GIT_PROVIDER_LABELS[location.provider]} 返回的文件树无效`,
        );
      }
      if (treeResult.data.truncated) {
        throw new RepositoryCodeError(
          "TOO_LARGE",
          `仓库 ${location.owner}/${location.repository} 的文件树不完整，无法可靠分析`,
        );
      }

      const files = treeResult.data.tree.flatMap((entry) =>
        entry.type === "blob" && isCandidatePath(entry.path)
          ? [
              {
                path: entry.path.replaceAll("\\", "/"),
                sha: entry.sha,
                size: entry.size ?? null,
              },
            ]
          : [],
      );

      if (files.length > MAX_CANDIDATE_FILES) {
        throw new RepositoryCodeError(
          "TOO_LARGE",
          `仓库 ${location.owner}/${location.repository} 可分析文件超过 ${MAX_CANDIDATE_FILES} 个，暂时无法可靠分析`,
        );
      }

      return {
        repositoryId: repository.id,
        provider: location.provider,
        owner: location.owner,
        repository: location.repository,
        branch: repository.branch,
        commitSha: branchResult.data.commit.sha,
        files,
        headers: request.headers,
        apiBaseUrl: request.apiBaseUrl,
      };
    },

    async readFile(snapshot, file, abortSignal) {
      if (file.size !== null && file.size > MAX_FILE_BYTES) {
        throw new RepositoryCodeError(
          "TOO_LARGE",
          `代码文件 ${file.path} 超过 128 KB`,
        );
      }

      const payload = await readJson(
        `${snapshot.apiBaseUrl}/git/blobs/${encodeURIComponent(file.sha)}`,
        snapshot.headers,
        abortSignal,
        fetchImplementation,
      );
      const parsed = blobResponseSchema.safeParse(payload);
      if (!parsed.success || parsed.data.encoding.toLowerCase() !== "base64") {
        throw new RepositoryCodeError(
          "UNREADABLE",
          `代码文件 ${file.path} 无法作为文本读取`,
        );
      }

      const buffer = Buffer.from(
        parsed.data.content.replaceAll(/\s/g, ""),
        "base64",
      );
      if (buffer.byteLength > MAX_FILE_BYTES || buffer.includes(0)) {
        throw new RepositoryCodeError(
          "UNREADABLE",
          `代码文件 ${file.path} 不是可分析的文本文件`,
        );
      }

      return {
        path: file.path,
        content: buffer.toString("utf8"),
      };
    },
  };
}
