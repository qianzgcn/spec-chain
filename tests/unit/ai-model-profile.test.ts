import { NoObjectGeneratedError, NoOutputGeneratedError } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  assertStructuredOutputComplete,
  buildStructuredSystemPrompt,
  toModelProviderError,
} from "@/ai/model-provider";
import { aiModelProfileInputSchema } from "@/lib/ai/model-profile";

describe("AI 模型配置", () => {
  it("结构化请求向兼容模型提供完整的 JSON Schema", () => {
    const prompt = buildStructuredSystemPrompt(
      "生成用户故事",
      z.object({
        title: z.string(),
        acceptanceCriteria: z.array(
          z.object({
            given: z.string(),
            when: z.string(),
            then: z.string(),
          }),
        ),
      }),
    );

    expect(prompt).toContain("JSON");
    expect(prompt).toContain("生成用户故事");
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"acceptanceCriteria"');
    expect(prompt).toContain('"given"');
  });

  it("将模型输出截断与结构化能力不足明确区分", () => {
    expect(() => assertStructuredOutputComplete("stop")).not.toThrow();

    try {
      assertStructuredOutputComplete("length");
      expect.unreachable("应当识别输出长度限制");
    } catch (error) {
      expect(error).toMatchObject({
        code: "OUTPUT_LIMIT",
        message: "模型输出达到长度限制，未能生成完整的结构化结果",
      });
    }
  });

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

  it("将 JSON 解析或结构校验失败归类为结构化输出错误", () => {
    const objectError = new NoObjectGeneratedError({
      message: "response did not match schema",
      cause: new Error("raw validation details"),
      text: '{"unexpected":true}',
      response: {
        id: "response-id",
        modelId: "model-id",
        timestamp: new Date(),
      },
      usage: {
        inputTokens: 10,
        inputTokenDetails: {
          noCacheTokens: 10,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 5,
        outputTokenDetails: {
          textTokens: 5,
          reasoningTokens: 0,
        },
        totalTokens: 15,
      },
      finishReason: "stop",
    });
    const error = toModelProviderError(
      new NoOutputGeneratedError({ cause: objectError }),
    );

    expect(error).toMatchObject({
      code: "STRUCTURED_OUTPUT",
      message: "模型返回内容不符合任务所需的数据结构，请稍后重试",
    });
    expect(error.message).not.toContain("raw validation details");
    expect(error.message).not.toContain('{"unexpected":true}');
  });

  it("嵌套的结构化输出长度截断仍归类为输出超限", () => {
    const objectError = new NoObjectGeneratedError({
      response: {
        id: "response-id",
        modelId: "model-id",
        timestamp: new Date(),
      },
      usage: {
        inputTokens: 10,
        inputTokenDetails: {
          noCacheTokens: 10,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 4_096,
        outputTokenDetails: {
          textTokens: 4_096,
          reasoningTokens: 0,
        },
        totalTokens: 4_106,
      },
      finishReason: "length",
    });
    const error = toModelProviderError(
      new NoOutputGeneratedError({ cause: objectError }),
    );

    expect(error.code).toBe("OUTPUT_LIMIT");
  });
});
