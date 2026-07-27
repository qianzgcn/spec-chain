"use client";

import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#0b7f9f",
          colorInfo: "#0b7f9f",
          colorLink: "#0b7898",
          colorText: "#17232e",
          colorTextSecondary: "#667585",
          colorBgBase: "#ffffff",
          colorBgLayout: "#f5f7f9",
          colorFillAlter: "#f7f9fa",
          colorBorder: "#dfe5ea",
          colorBorderSecondary: "#e7ebef",
          borderRadius: 6,
          borderRadiusLG: 10,
          fontSize: 14,
          controlHeight: 36,
          boxShadowSecondary: "0 12px 32px rgba(20, 36, 50, 0.12)",
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
            bodyBg: "#f5f7f9",
            headerBg: "#ffffff",
            siderBg: "#12232e",
          },
          Menu: {
            darkItemBg: "#12232e",
            darkSubMenuItemBg: "#10202a",
            darkItemColor: "#aebdc7",
            darkItemSelectedBg: "#1b3a48",
            darkItemSelectedColor: "#ffffff",
            darkItemHoverBg: "#192f3b",
            darkItemHoverColor: "#ffffff",
            itemBorderRadius: 6,
            itemHeight: 42,
          },
          Table: {
            headerBg: "#f7f9fa",
            headerColor: "#526273",
            borderColor: "#e7ebef",
            rowHoverBg: "#f8fbfc",
            cellPaddingBlock: 13,
            cellPaddingInline: 16,
          },
          Input: {
            activeBorderColor: "#0b7f9f",
            hoverBorderColor: "#94a8b5",
            activeShadow: "0 0 0 2px rgba(11, 127, 159, 0.10)",
          },
          Select: {
            activeBorderColor: "#0b7f9f",
            hoverBorderColor: "#94a8b5",
            activeOutlineColor: "rgba(11, 127, 159, 0.10)",
            optionSelectedBg: "#edf7fa",
          },
          Form: {
            labelColor: "#344454",
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
