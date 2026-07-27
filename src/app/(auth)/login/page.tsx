import type { Metadata } from "next";

import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { getCurrentUser } from "@/server/auth/session";

import styles from "./page.module.css";

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
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <div className={styles.brand}>
          <Image
            className={styles.brandMark}
            src="/specchain.svg"
            alt=""
            width={34}
            height={34}
          />
          <span>SpecChain</span>
        </div>
        <div className={styles.brandCopy}>
          <p className={styles.eyebrow}>需求与测试用例管理</p>
          <h1>
            把需求写清楚，
            <br />
            让开发与验证有据可循。
          </h1>
          <p>
            统一管理 Feature、用户故事、验收标准和测试用例，
            为开发实现、人工确认和质量验证提供一致依据。
          </p>
        </div>
        <p className={styles.version}>SpecChain 首版</p>
      </section>

      <section className={styles.formArea}>
        <div className={styles.formBox}>
          <div className={styles.formHeading}>
            <h2>登录平台</h2>
            <p>使用管理员创建的用户名和密码登录。</p>
          </div>
          <LoginForm passwordChanged={params.passwordChanged === "1"} />
        </div>
      </section>
    </main>
  );
}
