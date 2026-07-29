"use client";

import { ConfigProvider } from "antd";
import type { ThemeConfig } from "antd";
import zhCN from "antd/locale/zh_CN";

import { designTokens } from "@/theme/tokens";

const { colors, controlHeight, radius, shadows, status, typography } =
  designTokens;

const antdTheme = {
  token: {
    colorPrimary: colors.brand,
    colorPrimaryHover: colors.brandHover,
    colorPrimaryActive: colors.brandActive,
    colorInfo: colors.brand,
    colorSuccess: status.success.text,
    colorWarning: status.warning.text,
    colorError: colors.danger,
    colorLink: colors.brand,
    colorLinkHover: colors.brandHover,
    colorText: colors.text,
    colorTextSecondary: colors.textSecondary,
    colorBgBase: colors.surface,
    colorBgLayout: colors.appBackground,
    colorFillAlter: colors.surfaceSubtle,
    colorBorder: colors.borderStrong,
    colorBorderSecondary: colors.border,
    borderRadius: radius.control,
    borderRadiusLG: radius.large,
    fontSize: typography.fontSizeBody,
    controlHeight,
    boxShadowSecondary: shadows.popup,
    fontFamily: typography.fontFamily,
  },
  components: {
    Button: {
      colorPrimary: colors.action,
      colorPrimaryHover: colors.actionHover,
      colorPrimaryActive: colors.actionActive,
      primaryColor: colors.surface,
      defaultColor: colors.text,
      defaultBorderColor: colors.borderStrong,
      defaultHoverColor: colors.action,
      defaultHoverBorderColor: colors.textMuted,
      defaultHoverBg: colors.surfaceSubtle,
      fontWeight: 600,
      primaryShadow: "none",
      defaultShadow: "none",
    },
    Layout: {
      bodyBg: colors.appBackground,
      headerBg: colors.surface,
      siderBg: colors.sidebar,
    },
    Menu: {
      itemBg: colors.sidebar,
      subMenuItemBg: colors.sidebar,
      itemColor: colors.textSecondary,
      itemSelectedBg: colors.brandSoft,
      itemSelectedColor: colors.brandHover,
      subMenuItemSelectedColor: colors.brandHover,
      itemHoverBg: colors.surfaceMuted,
      itemHoverColor: colors.text,
      itemActiveBg: colors.brandSoftStrong,
      itemBorderRadius: radius.control,
      itemHeight: 40,
    },
    Table: {
      headerBg: colors.surfaceSubtle,
      headerColor: colors.textSecondary,
      borderColor: colors.border,
      rowHoverBg: colors.rowHover,
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
    },
    Input: {
      activeBorderColor: colors.brand,
      hoverBorderColor: colors.textMuted,
      activeShadow: `0 0 0 2px ${colors.focusRing}`,
    },
    Select: {
      activeBorderColor: colors.brand,
      hoverBorderColor: colors.textMuted,
      activeOutlineColor: colors.focusRing,
      optionActiveBg: colors.surfaceMuted,
      optionSelectedBg: colors.brandSoft,
    },
    Form: {
      labelColor: colors.text,
    },
    Tag: {
      defaultBg: colors.surfaceMuted,
      defaultColor: colors.textSecondary,
    },
  },
} satisfies ThemeConfig;

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      {children}
    </ConfigProvider>
  );
}
