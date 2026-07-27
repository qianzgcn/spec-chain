import type { Metadata } from "next";

import { AntdRegistry } from "@ant-design/nextjs-registry";

import { AntdProvider } from "@/app/antd-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SpecChain",
    template: "%s · SpecChain",
  },
  description: "需求与测试用例管理平台",
  icons: {
    icon: "/specchain.svg",
    shortcut: "/specchain.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <AntdProvider>{children}</AntdProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
