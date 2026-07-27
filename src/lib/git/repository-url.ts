export type GitProvider = "GITHUB" | "GITEE";

export type RepositoryLocation = {
  provider: GitProvider;
  host: "github.com" | "gitee.com";
  owner: string;
  repository: string;
};

const PROVIDERS_BY_HOST: Record<RepositoryLocation["host"], GitProvider> = {
  "github.com": "GITHUB",
  "gitee.com": "GITEE",
};

const REPOSITORY_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;
const SCP_STYLE_PATTERN = /^git@(github\.com|gitee\.com):([^/]+)\/([^/]+)\/?$/i;

export const GIT_PROVIDER_LABELS: Record<GitProvider, string> = {
  GITHUB: "GitHub",
  GITEE: "Gitee",
};

export class RepositoryUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryUrlError";
  }
}

function parseRepositorySegments(
  host: RepositoryLocation["host"],
  owner: string,
  repositoryWithSuffix: string,
): RepositoryLocation {
  const repository = repositoryWithSuffix.replace(/\.git$/i, "");

  if (
    !owner ||
    !repository ||
    !REPOSITORY_SEGMENT_PATTERN.test(owner) ||
    !REPOSITORY_SEGMENT_PATTERN.test(repository)
  ) {
    throw new RepositoryUrlError("Git 地址中的仓库路径无效");
  }

  return {
    provider: PROVIDERS_BY_HOST[host],
    host,
    owner,
    repository,
  };
}

function parseScpStyleUrl(value: string) {
  const match = SCP_STYLE_PATTERN.exec(value);
  if (!match) return null;

  const [, rawHost, owner, repository] = match;
  return parseRepositorySegments(
    rawHost.toLowerCase() as RepositoryLocation["host"],
    owner,
    repository,
  );
}

/**
 * 只解析官方 GitHub/Gitee 的 HTTPS 和 SSH 仓库根地址。
 * 返回的平台信息用于服务端选择对应 PAT，绝不直接作为请求主机使用。
 */
export function parseRepositoryUrl(value: string): RepositoryLocation {
  const trimmedValue = value.trim();
  const scpStyleLocation = parseScpStyleUrl(trimmedValue);

  if (scpStyleLocation) return scpStyleLocation;

  let url: URL;
  try {
    url = new URL(trimmedValue);
  } catch {
    throw new RepositoryUrlError("请输入有效的 GitHub 或 Gitee 仓库地址");
  }

  if (url.protocol !== "https:" && url.protocol !== "ssh:") {
    throw new RepositoryUrlError("Git 地址仅支持 HTTPS 或 SSH 协议");
  }

  if (
    url.password ||
    (url.protocol === "https:" && url.username) ||
    (url.protocol === "ssh:" && url.username !== "git")
  ) {
    throw new RepositoryUrlError("Git 地址中不能包含访问凭据");
  }

  if (url.search || url.hash) {
    throw new RepositoryUrlError("Git 地址不能包含查询参数或锚点");
  }

  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "gitee.com") {
    throw new RepositoryUrlError("仅支持 github.com 和 gitee.com 仓库");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new RepositoryUrlError("请输入仓库根地址，不要包含页面子路径");
  }

  return parseRepositorySegments(host, segments[0], segments[1]);
}
