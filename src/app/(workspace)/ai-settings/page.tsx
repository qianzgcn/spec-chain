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
  const [profiles, binding] = await Promise.all([
    db.aiModelProfile.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        modelId: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
    db.aiCapabilityBinding.findUnique({
      where: { capability: AiCapability.GENERATE_USER_STORY },
      select: { modelProfileId: true },
    }),
  ]);

  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="模型配置"
        description="管理 OpenAI 兼容模型，并指定 AI 辅助生成 US 使用的默认模型。"
      />

      <AiSettingsManagement
        profiles={profiles.map((profile) => ({
          ...profile,
          updatedAt: profile.updatedAt.toISOString(),
        }))}
        defaultProfileId={binding?.modelProfileId ?? null}
      />
    </PageContainer>
  );
}
