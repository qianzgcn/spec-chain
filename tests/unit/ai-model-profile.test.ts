import { describe, expect, it } from "vitest";

import { toModelProviderError } from "@/ai/model-provider";
import { aiModelProfileInputSchema } from "@/lib/ai/model-profile";

describe("AI 模型配置", () => {
  it("规范化合法的 OpenAI 兼容 Base URL", () => {
    const result = aiModelProfileInputSchema.parse({
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1/",
      modelId: "deepseek-chat",
      apiKey: "secret",
    });

    expect(result.baseUrl).toBe("https://api.deepseek.com/v1");
  });

  it.each([
    "ftp://api.example.com/v1",
    "https://user:password@api.example.com/v1",
    "https://api.example.com/v1?token=secret",
    "https://api.example.com/v1#models",
    "not-a-url",
  ])("拒绝不安全的 Base URL：%s", (baseUrl) => {
    const result = aiModelProfileInputSchema.safeParse({
      name: "测试模型",
      baseUrl,
      modelId: "model",
      apiKey: "secret",
    });

    expect(result.success).toBe(false);
  });

  it.each([
    [401, "模型 API Key 无效或已过期"],
    [403, "模型 API Key 权限不足"],
    [429, "模型服务请求过于频繁"],
  ])("将模型状态码 %i 转换为安全中文错误", (statusCode, message) => {
    const error = toModelProviderError({ statusCode, message: "raw error" });

    expect(error.message).toContain(message);
    expect(error.message).not.toContain("raw error");
  });

  it("区分模型超时", () => {
    const error = toModelProviderError(
      new DOMException("request timed out", "TimeoutError"),
    );

    expect(error.message).toBe("模型服务响应超时");
  });
});
