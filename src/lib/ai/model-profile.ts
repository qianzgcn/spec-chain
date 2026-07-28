import { z } from "zod";

function isValidBaseUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname === "/" ? "" : pathname}`;
}

export const aiModelProfileInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请输入模型名称")
    .max(100, "模型名称不能超过 100 个字符"),
  baseUrl: z
    .string()
    .trim()
    .min(1, "请输入 Base URL")
    .max(500, "Base URL 不能超过 500 个字符")
    .refine(isValidBaseUrl, {
      message: "Base URL 必须是 HTTP(S) 地址，且不能包含凭据、查询参数或锚点",
    })
    .transform(normalizeBaseUrl),
  modelId: z
    .string()
    .trim()
    .min(1, "请输入模型 ID")
    .max(200, "模型 ID 不能超过 200 个字符"),
  apiKey: z.string().trim().max(4_000, "API Key 不能超过 4000 个字符"),
});
