"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";

import { ModelProviderError, checkModelProvider } from "@/ai/model-provider";
import { AiCapability } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { aiModelProfileInputSchema } from "@/lib/ai/model-profile";
import { decryptAesGcm, encryptAesGcm } from "@/lib/security/aes-gcm";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";

const createProfileSchema = aiModelProfileInputSchema.extend({
  apiKey: aiModelProfileInputSchema.shape.apiKey.min(1, "请输入模型 API Key"),
});

const updateProfileSchema = aiModelProfileInputSchema.extend({
  id: z.string().min(1),
});

const profileIdSchema = z.string().min(1);

async function hasDuplicateName(name: string, excludedId?: string) {
  const profiles = await db.aiModelProfile.findMany({
    where: {
      deletedAt: null,
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
    select: { name: true },
  });
  const normalizedName = name.toLocaleLowerCase();
  return profiles.some(
    (profile) => profile.name.toLocaleLowerCase() === normalizedName,
  );
}

export async function createAiModelProfileAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const parsed = createProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查模型配置",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (await hasDuplicateName(parsed.data.name)) {
    return { ok: false, message: "模型档案名称已存在" };
  }

  const profile = await db.aiModelProfile.create({
    data: {
      name: parsed.data.name,
      baseUrl: parsed.data.baseUrl,
      modelId: parsed.data.modelId,
      apiKeyEncrypted: encryptAesGcm(parsed.data.apiKey, env.ENCRYPTION_KEY),
    },
    select: { id: true },
  });

  revalidatePath("/ai-settings");
  return { ok: true, message: "模型档案已创建", data: profile };
}

export async function updateAiModelProfileAction(
  input: unknown,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查模型配置",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const profile = await db.aiModelProfile.findFirst({
    where: { id: parsed.data.id, deletedAt: null },
    select: { id: true, apiKeyEncrypted: true },
  });
  if (!profile) {
    return { ok: false, message: "模型档案不存在或已删除" };
  }
  if (await hasDuplicateName(parsed.data.name, profile.id)) {
    return { ok: false, message: "模型档案名称已存在" };
  }

  await db.aiModelProfile.update({
    where: { id: profile.id },
    data: {
      name: parsed.data.name,
      baseUrl: parsed.data.baseUrl,
      modelId: parsed.data.modelId,
      apiKeyEncrypted: parsed.data.apiKey
        ? encryptAesGcm(parsed.data.apiKey, env.ENCRYPTION_KEY)
        : profile.apiKeyEncrypted,
    },
  });

  revalidatePath("/ai-settings");
  return { ok: true, message: "模型档案已保存" };
}

export async function deleteAiModelProfileAction(
  profileId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const parsedId = profileIdSchema.safeParse(profileId);
  if (!parsedId.success) {
    return { ok: false, message: "模型档案无效" };
  }

  const profile = await db.aiModelProfile.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      capabilityBindings: { select: { capability: true }, take: 1 },
    },
  });
  if (!profile) {
    return { ok: false, message: "模型档案不存在或已删除" };
  }
  if (profile.capabilityBindings.length > 0) {
    return {
      ok: false,
      message: "该模型正在作为默认模型，请先更换能力绑定",
    };
  }

  await db.aiModelProfile.update({
    where: { id: profile.id },
    data: { deletedAt: new Date(), apiKeyEncrypted: "" },
  });

  revalidatePath("/ai-settings");
  return { ok: true, message: "模型档案已删除" };
}

export async function bindUserStoryModelAction(
  profileId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const parsedId = profileIdSchema.safeParse(profileId);
  if (!parsedId.success) {
    return { ok: false, message: "请选择默认模型" };
  }

  const profile = await db.aiModelProfile.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: { id: true },
  });
  if (!profile) {
    return { ok: false, message: "模型档案不存在或已删除" };
  }

  await db.aiCapabilityBinding.upsert({
    where: { capability: AiCapability.GENERATE_USER_STORY },
    create: {
      capability: AiCapability.GENERATE_USER_STORY,
      modelProfileId: profile.id,
    },
    update: { modelProfileId: profile.id },
  });

  revalidatePath("/ai-settings");
  return { ok: true, message: "生成 US 的默认模型已更新" };
}

export async function checkAiModelProfileAction(
  profileId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const parsedId = profileIdSchema.safeParse(profileId);
  if (!parsedId.success) {
    return { ok: false, message: "模型档案无效" };
  }

  const profile = await db.aiModelProfile.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      name: true,
      baseUrl: true,
      modelId: true,
      apiKeyEncrypted: true,
    },
  });
  if (!profile) {
    return { ok: false, message: "模型档案不存在或已删除" };
  }

  let apiKey: string;
  try {
    apiKey = decryptAesGcm(profile.apiKeyEncrypted, env.ENCRYPTION_KEY);
  } catch {
    return {
      ok: false,
      message: "模型 API Key 无法读取，请重新配置",
    };
  }

  try {
    await checkModelProvider({ ...profile, apiKey });
    return {
      ok: true,
      message: "模型连接正常，并支持生成所需的结构化结果",
    };
  } catch (error) {
    if (error instanceof ModelProviderError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "模型检查失败，请稍后重试" };
  }
}
