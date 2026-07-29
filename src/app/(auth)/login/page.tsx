import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { SpecChainMark } from "@/components/brand/specchain-mark";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "登录",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ passwordChanged?: string }>;
}) {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  const params = await searchParams;

  return (
    <main className="bg-background grid h-full grid-cols-[minmax(520px,0.95fr)_minmax(580px,1.05fr)] overflow-auto">
      <section className="bg-muted/40 flex min-h-screen flex-col border-r px-16 py-11">
        <div className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <SpecChainMark size={34} />
          <span>SpecChain</span>
        </div>
        <div className="my-auto max-w-xl">
          <p className="text-muted-foreground mb-5 text-xs font-medium tracking-[0.14em] uppercase">
            需求与测试用例管理
          </p>
          <h1 className="text-5xl leading-[1.16] font-semibold tracking-[-0.045em]">
            把需求写清楚，
            <br />
            让开发与验证有据可循。
          </h1>
          <p className="text-muted-foreground mt-7 max-w-lg text-base leading-8">
            统一管理 Feature、用户故事、验收标准和测试用例，
            为开发实现、人工确认和质量验证提供一致依据。
          </p>
        </div>
        <p className="text-muted-foreground text-xs">SpecChain 首版</p>
      </section>

      <section className="grid min-h-screen place-items-center px-12 py-10">
        <div className="w-[400px]">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">登录平台</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              使用管理员创建的用户名和密码登录。
            </p>
          </div>
          <LoginForm passwordChanged={params.passwordChanged === "1"} />
        </div>
      </section>
    </main>
  );
}
