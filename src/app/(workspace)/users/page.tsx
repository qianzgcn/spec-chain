import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { UserManagement } from "@/components/users/user-management";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = {
  title: "用户管理",
};

export default async function UsersPage() {
  const currentUser = await requireAdmin();
  const users = await db.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="用户管理"
        description="管理登录账号和平台角色；普通用户可操作全部项目业务数据。"
      />

      <UserManagement
        currentUserId={currentUser.id}
        users={users.map((user) => ({
          ...user,
          createdAt: user.createdAt.toISOString(),
        }))}
      />
    </PageContainer>
  );
}
