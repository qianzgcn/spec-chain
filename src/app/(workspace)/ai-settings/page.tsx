import type { Metadata } from "next";

import { AiSettingsManagement } from "@/components/ai/ai-settings-management";
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
    <div className="page-shell page-shell--table">
      <div className="page-heading">
        <div>
          <h1 className="page-title">模型配置</h1>
          <p className="page-description">
            管理 OpenAI 兼容模型，并指定 AI 辅助生成 US 使用的默认模型。
          </p>
        </div>
      </div>

      <AiSettingsManagement
        profiles={profiles.map((profile) => ({
          ...profile,
          updatedAt: profile.updatedAt.toISOString(),
        }))}
        defaultProfileId={binding?.modelProfileId ?? null}
      />
    </div>
  );
}
