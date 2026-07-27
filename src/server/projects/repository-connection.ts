import "server-only";

import {
  GIT_PROVIDER_LABELS,
  type GitProvider,
  type RepositoryLocation,
} from "@/lib/git/repository-url";

const CONNECTION_TIMEOUT_MS = 10_000;
const USER_AGENT = "SpecChain";

export type RepositoryConnectionSummary = {
  provider: GitProvider;
  owner: string;
  repository: string;
  branch: string;
};

export class RepositoryConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryConnectionError";
  }
}

type ProviderRequest = {
  repositoryUrl: string;
  branchUrl: string;
  headers: Record<string, string>;
};

function buildRequest(
  location: RepositoryLocation,
  branch: string,
  pat: string,
): ProviderRequest {
  const owner = encodeURIComponent(location.owner);
  const repository = encodeURIComponent(location.repository);
  const encodedBranch = encodeURIComponent(branch);

  if (location.provider === "GITHUB") {
    const baseUrl = `https://api.github.com/repos/${owner}/${repository}`;
    return {
      repositoryUrl: baseUrl,
      branchUrl: `${baseUrl}/branches/${encodedBranch}`,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${pat}`,
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    };
  }

  const baseUrl = `https://gitee.com/api/v5/repos/${owner}/${repository}`;
  return {
    repositoryUrl: baseUrl,
    branchUrl: `${baseUrl}/branches/${encodedBranch}`,
    headers: {
      Accept: "application/json",
      Authorization: `token ${pat}`,
      "User-Agent": USER_AGENT,
    },
  };
}

function throwForResponses(
  provider: GitProvider,
  repositoryResponse: Response,
  branchResponse: Response,
) {
  const providerLabel = GIT_PROVIDER_LABELS[provider];
  const statuses = [repositoryResponse.status, branchResponse.status];

  if (statuses.includes(401)) {
    throw new RepositoryConnectionError(`${providerLabel} PAT 无效或已过期`);
  }

  if (statuses.includes(403) || statuses.includes(429)) {
    throw new RepositoryConnectionError(
      `${providerLabel} PAT 权限不足或接口调用受限`,
    );
  }

  if (repositoryResponse.status === 404) {
    throw new RepositoryConnectionError("仓库不存在或当前凭据无权访问");
  }

  if (!repositoryResponse.ok) {
    throw new RepositoryConnectionError(
      `${providerLabel} 服务暂时不可用，请稍后重试`,
    );
  }

  if (branchResponse.status === 404) {
    throw new RepositoryConnectionError("仓库可访问，但指定分支不存在");
  }

  if (!branchResponse.ok) {
    throw new RepositoryConnectionError(
      `${providerLabel} 服务暂时不可用，请稍后重试`,
    );
  }
}

/**
 * 使用托管平台 API 验证 PAT、仓库和分支读取权限。
 * 请求目标由平台类型固定生成，避免用户输入造成 SSRF。
 */
export async function checkRepositoryConnection(
  location: RepositoryLocation,
  branch: string,
  pat: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<RepositoryConnectionSummary> {
  const request = buildRequest(location, branch, pat);
  const signal = AbortSignal.timeout(CONNECTION_TIMEOUT_MS);

  try {
    const [repositoryResponse, branchResponse] = await Promise.all([
      fetchImplementation(request.repositoryUrl, {
        cache: "no-store",
        headers: request.headers,
        signal,
      }),
      fetchImplementation(request.branchUrl, {
        cache: "no-store",
        headers: request.headers,
        signal,
      }),
    ]);

    throwForResponses(location.provider, repositoryResponse, branchResponse);
  } catch (error) {
    if (error instanceof RepositoryConnectionError) throw error;

    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new RepositoryConnectionError("连接超时，请检查网络后重试");
    }

    throw new RepositoryConnectionError(
      `无法连接 ${GIT_PROVIDER_LABELS[location.provider]}，请检查网络后重试`,
    );
  }

  return {
    provider: location.provider,
    owner: location.owner,
    repository: location.repository,
    branch,
  };
}
