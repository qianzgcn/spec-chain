"use client";

import { useMemo, useState, useTransition } from "react";

import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import FileTextOutlined from "@ant-design/icons/FileTextOutlined";
import FolderOpenOutlined from "@ant-design/icons/FolderOpenOutlined";
import LogoutOutlined from "@ant-design/icons/LogoutOutlined";
import SettingOutlined from "@ant-design/icons/SettingOutlined";
import SolutionOutlined from "@ant-design/icons/SolutionOutlined";
import TeamOutlined from "@ant-design/icons/TeamOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import {
  Avatar,
  Dropdown,
  Layout,
  Menu,
  Select,
  Space,
  Typography,
  message,
} from "antd";
import type { MenuProps } from "antd";
import { usePathname, useRouter } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { switchProjectAction } from "@/app/actions/projects";
import { UserRole } from "@/generated/prisma/enums";
import { ChangePasswordModal } from "@/components/auth/change-password-modal";
import { confirmLeaveIfDirty } from "@/hooks/use-unsaved-changes";

import styles from "./app-shell.module.css";

const { Header, Sider, Content } = Layout;

type AppShellProps = {
  user: {
    id: string;
    username: string;
    role: UserRole;
  };
  projects: Array<{ id: string; name: string }>;
  currentProject: { id: string; name: string } | null;
  children: React.ReactNode;
};

function resolveSelectedKey(pathname: string) {
  if (pathname.startsWith("/requirements")) return "/requirements";
  if (pathname.startsWith("/features")) return "/requirements";
  if (pathname.startsWith("/user-stories")) return "/requirements";
  if (pathname.startsWith("/test-case-groups")) return "/test-case-groups";
  if (pathname.startsWith("/test-cases")) return "/test-cases";
  if (pathname.startsWith("/project-settings")) return "/project-settings";
  if (pathname.startsWith("/projects")) return "/projects";
  if (pathname.startsWith("/users")) return "/users";
  return pathname;
}

export function AppShell({
  user,
  projects,
  currentProject,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [isSwitching, startSwitchTransition] = useTransition();
  const [isLoggingOut, startLogoutTransition] = useTransition();

  const menuItems = useMemo<MenuProps["items"]>(
    () => [
      {
        key: "/requirements",
        icon: <FileTextOutlined />,
        label: "需求",
      },
      {
        key: "test-cases-root",
        icon: <SolutionOutlined />,
        label: "测试用例",
        children: [
          {
            key: "/test-cases",
            label: "用例列表",
          },
          {
            key: "/test-case-groups",
            label: "分组管理",
          },
        ],
      },
      {
        key: "/project-settings",
        icon: <SettingOutlined />,
        label: "项目设置",
      },
      {
        key: "/projects",
        icon: <FolderOpenOutlined />,
        label: "项目管理",
      },
      ...(user.role === UserRole.ADMIN
        ? [
            {
              key: "/users",
              icon: <TeamOutlined />,
              label: "用户管理",
            },
          ]
        : []),
    ],
    [user.role],
  );

  const userMenu: MenuProps["items"] = [
    {
      key: "identity",
      label: (
        <div className={styles.identity}>
          <strong>{user.username}</strong>
          <span>{user.role === UserRole.ADMIN ? "管理员" : "普通用户"}</span>
        </div>
      ),
      disabled: true,
    },
    { type: "divider" },
    {
      key: "password",
      icon: <UserOutlined />,
      label: "修改密码",
      onClick: () => setPasswordModalOpen(true),
    },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: isLoggingOut ? "正在退出…" : "退出登录",
      disabled: isLoggingOut,
      onClick: () => startLogoutTransition(() => logoutAction()),
    },
  ];

  function navigate({ key }: { key: string }) {
    if (key.startsWith("/") && confirmLeaveIfDirty()) {
      router.push(key);
    }
  }

  function switchProject(projectId: string) {
    if (!confirmLeaveIfDirty()) return;

    startSwitchTransition(async () => {
      const result = await switchProjectAction(projectId);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      router.push("/requirements");
      router.refresh();
    });
  }

  return (
    <>
      {messageContext}
      <Layout className={styles.layout}>
        <Sider className={styles.sider} width={232}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>SC</span>
            <span>SpecChain</span>
          </div>

          <div className={styles.projectArea}>
            <div className={styles.projectLabel}>当前项目</div>
            <Select
              className={styles.projectSelect}
              value={currentProject?.id}
              placeholder="暂无项目"
              options={projects.map((project) => ({
                label: project.name,
                value: project.id,
              }))}
              onChange={switchProject}
              loading={isSwitching}
              disabled={projects.length === 0}
              suffixIcon={<ApartmentOutlined />}
            />
          </div>

          <Menu
            className={styles.menu}
            theme="dark"
            mode="inline"
            items={menuItems}
            selectedKeys={[resolveSelectedKey(pathname)]}
            defaultOpenKeys={["test-cases-root"]}
            onClick={navigate}
          />
        </Sider>

        <Layout className={styles.mainLayout}>
          <Header className={styles.header}>
            <div className={styles.context}>
              <Typography.Text className={styles.contextLabel}>
                {currentProject?.name ?? "平台管理"}
              </Typography.Text>
            </div>
            <Dropdown menu={{ items: userMenu }} trigger={["click"]}>
              <button className={styles.userButton} type="button">
                <Space size={9}>
                  <Avatar size={30} icon={<UserOutlined />} />
                  <span>{user.username}</span>
                </Space>
              </button>
            </Dropdown>
          </Header>
          <Content className={styles.content}>{children}</Content>
        </Layout>
      </Layout>

      <ChangePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />
    </>
  );
}
