"use client";

import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#5661e8",
          colorPrimaryHover: "#4651d1",
          colorInfo: "#5661e8",
          colorLink: "#5661e8",
          colorLinkHover: "#4651d1",
          colorText: "#202633",
          colorTextSecondary: "#687083",
          colorBgBase: "#ffffff",
          colorBgLayout: "#f6f7fb",
          colorFillAlter: "#f7f8fc",
          colorBorder: "#d9dde7",
          colorBorderSecondary: "#e8eaf0",
          borderRadius: 8,
          borderRadiusLG: 10,
          fontSize: 14,
          controlHeight: 36,
          boxShadowSecondary: "0 14px 36px rgba(31, 38, 51, 0.12)",
          fontFamily:
            '"Segoe UI Variable", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        },
        components: {
          Button: {
            fontWeight: 500,
            primaryShadow: "none",
            defaultShadow: "none",
          },
          Layout: {
            bodyBg: "#f6f7fb",
            headerBg: "#ffffff",
            siderBg: "#171923",
          },
          Menu: {
            darkItemBg: "#171923",
            darkSubMenuItemBg: "#171923",
            darkItemColor: "#aeb3c1",
            darkItemSelectedBg: "#292c39",
            darkItemSelectedColor: "#ffffff",
            darkItemHoverBg: "#222530",
            darkItemHoverColor: "#ffffff",
            itemBorderRadius: 8,
            itemHeight: 40,
          },
          Table: {
            headerBg: "#f7f8fc",
            headerColor: "#596174",
            borderColor: "#eceef3",
            rowHoverBg: "#f5f6fc",
            cellPaddingBlock: 12,
            cellPaddingInline: 16,
          },
          Input: {
            activeBorderColor: "#5661e8",
            hoverBorderColor: "#aeb4c1",
            activeShadow: "0 0 0 2px rgba(86, 97, 232, 0.10)",
          },
          Select: {
            activeBorderColor: "#5661e8",
            hoverBorderColor: "#aeb4c1",
            activeOutlineColor: "rgba(86, 97, 232, 0.10)",
            optionSelectedBg: "#eceeff",
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
