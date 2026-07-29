"use client";

import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#2563eb",
          colorPrimaryHover: "#1d4ed8",
          colorInfo: "#2563eb",
          colorLink: "#2563eb",
          colorLinkHover: "#1d4ed8",
          colorText: "#18212f",
          colorTextSecondary: "#667085",
          colorBgBase: "#ffffff",
          colorBgLayout: "#f4f6f8",
          colorFillAlter: "#f8fafc",
          colorBorder: "#d0d5dd",
          colorBorderSecondary: "#e4e7ec",
          borderRadius: 8,
          borderRadiusLG: 8,
          fontSize: 14,
          controlHeight: 36,
          boxShadowSecondary: "0 12px 30px rgba(16, 24, 40, 0.12)",
          fontFamily:
            '"Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        },
        components: {
          Button: {
            fontWeight: 500,
            primaryShadow: "none",
            defaultShadow: "none",
          },
          Layout: {
            bodyBg: "#f4f6f8",
            headerBg: "#ffffff",
            siderBg: "#111827",
          },
          Menu: {
            darkItemBg: "#111827",
            darkSubMenuItemBg: "#111827",
            darkItemColor: "#aab4c3",
            darkItemSelectedBg: "#1f2937",
            darkItemSelectedColor: "#ffffff",
            darkItemHoverBg: "#1f2937",
            darkItemHoverColor: "#ffffff",
            itemBorderRadius: 8,
            itemHeight: 40,
          },
          Table: {
            headerBg: "#f8fafc",
            headerColor: "#475467",
            borderColor: "#e4e7ec",
            rowHoverBg: "#f8faff",
            cellPaddingBlock: 12,
            cellPaddingInline: 16,
          },
          Input: {
            activeBorderColor: "#2563eb",
            hoverBorderColor: "#98a2b3",
            activeShadow: "0 0 0 2px rgba(37, 99, 235, 0.10)",
          },
          Select: {
            activeBorderColor: "#2563eb",
            hoverBorderColor: "#98a2b3",
            activeOutlineColor: "rgba(37, 99, 235, 0.10)",
            optionSelectedBg: "#eff6ff",
          },
          Form: {
            labelColor: "#344054",
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
