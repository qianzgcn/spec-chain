"use client";

import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#087ca7",
          colorInfo: "#087ca7",
          colorText: "#17212b",
          colorTextSecondary: "#607080",
          colorBgBase: "#ffffff",
          colorBgLayout: "#f3f5f7",
          colorBorder: "#dce2e8",
          borderRadius: 6,
          borderRadiusLG: 8,
          fontSize: 14,
          controlHeight: 36,
          boxShadowSecondary: "0 8px 28px rgba(24, 42, 58, 0.12)",
          fontFamily:
            '"Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        },
        components: {
          Button: {
            fontWeight: 500,
          },
          Layout: {
            bodyBg: "#f3f5f7",
            headerBg: "#ffffff",
            siderBg: "#15232e",
          },
          Menu: {
            darkItemBg: "#15232e",
            darkSubMenuItemBg: "#111e27",
            darkItemSelectedBg: "#087ca7",
            darkItemHoverBg: "#203441",
          },
          Table: {
            headerBg: "#f7f8fa",
            headerColor: "#425466",
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
