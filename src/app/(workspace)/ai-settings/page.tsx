import type { Metadata } from "next";

import { AiSettingsManagement } from "@/components/ai/ai-settings-management";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AiCapability } from "@/generated/prisma/enums";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = {
  title: "模型配置",
};

export default async function AiSettingsPage() {
  await requireAdmin();
  const [profiles, bindings] = await Promise.all([
    db.aiModelProfile.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        modelId: true,
        lastCheckStatus: true,
        lastCheckedAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
    db.aiCapabilityBinding.findMany({
      where: {
        capability: {
          in: [
            AiCapability.GENERATE_USER_STORY,
            AiCapability.GENERATE_TEST_CASES,
            AiCapability.GENERATE_AUTOMATION_SCRIPT,
          ],
        },
      },
      select: { capability: true, modelProfileId: true },
    }),
  ]);
  const bindingByCapability = new Map(
    bindings.map((binding) => [binding.capability, binding.modelProfileId]),
  );

  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="模型配置"
        description="管理 OpenAI 兼容模型，并分别指定三项 AI 能力使用的默认模型。"
      />

      <AiSettingsManagement
        profiles={profiles.map((profile) => ({
          ...profile,
          lastCheckedAt: profile.lastCheckedAt?.toISOString() ?? null,
          updatedAt: profile.updatedAt.toISOString(),
        }))}
        defaultProfileIds={{
          [AiCapability.GENERATE_USER_STORY]:
            bindingByCapability.get(AiCapability.GENERATE_USER_STORY) ?? null,
          [AiCapability.GENERATE_TEST_CASES]:
            bindingByCapability.get(AiCapability.GENERATE_TEST_CASES) ?? null,
          [AiCapability.GENERATE_AUTOMATION_SCRIPT]:
            bindingByCapability.get(AiCapability.GENERATE_AUTOMATION_SCRIPT) ??
            null,
        }}
      />
    </PageContainer>
  );
}
