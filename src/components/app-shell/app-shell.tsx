"use client";

import { useMemo, useState, useTransition } from "react";

import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import ApiOutlined from "@ant-design/icons/ApiOutlined";
import DownOutlined from "@ant-design/icons/DownOutlined";
import FileTextOutlined from "@ant-design/icons/FileTextOutlined";
import FolderOpenOutlined from "@ant-design/icons/FolderOpenOutlined";
import HistoryOutlined from "@ant-design/icons/HistoryOutlined";
import LogoutOutlined from "@ant-design/icons/LogoutOutlined";
import SettingOutlined from "@ant-design/icons/SettingOutlined";
import SolutionOutlined from "@ant-design/icons/SolutionOutlined";
import TeamOutlined from "@ant-design/icons/TeamOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import { Avatar, Dropdown, Layout, Menu, Select, message } from "antd";
import type { MenuProps } from "antd";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { switchProjectAction } from "@/app/actions/projects";
import { UserRole } from "@/generated/prisma/enums";
import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { ChangePasswordModal } from "@/components/auth/change-password-modal";
import { confirmLeaveIfDirty } from "@/hooks/use-unsaved-changes";

import styles from "./app-shell.module.css";

const { Header, Sider, Content } = Layout;

const TABLE_PAGE_PATHS = new Set([
  "/requirements",
  "/requirements/pending-review",
  "/ai-executions",
  "/ai-settings",
  "/test-cases",
  "/test-case-groups",
  "/projects",
  "/users",
]);

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
  if (pathname.startsWith("/requirements/pending-review")) {
    return "/requirements/pending-review";
  }
  if (pathname.startsWith("/requirements")) return "/requirements";
  if (pathname.startsWith("/features")) return "/requirements";
  if (pathname.startsWith("/user-stories")) return "/requirements";
  if (pathname.startsWith("/ai-executions")) return "/ai-executions";
  if (pathname.startsWith("/ai-settings")) return "/ai-settings";
  if (pathname.startsWith("/test-case-groups")) return "/test-case-groups";
  if (pathname.startsWith("/test-cases")) return "/test-cases";
  if (pathname.startsWith("/project-settings/repositories")) {
    return "/project-settings/repositories";
  }
  if (pathname.startsWith("/project-settings/testing")) {
    return "/project-settings/testing";
  }
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
  const contentClassName = TABLE_PAGE_PATHS.has(pathname)
    ? `${styles.content} ${styles.tableContent}`
    : styles.content;
  const { isNavigating, navigate } = useNavigationFeedback();
  const [messageApi, messageContext] = message.useMessage();
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [isSwitching, startSwitchTransition] = useTransition();
  const [isLoggingOut, startLogoutTransition] = useTransition();

  const menuItems = useMemo<MenuProps["items"]>(
    () => [
      {
        key: "requirements-root",
        icon: <FileTextOutlined />,
        label: "需求",
        children: [
          {
            key: "/requirements",
            label: "需求列表",
          },
          {
            key: "/requirements/pending-review",
            label: "待评审需求",
          },
        ],
      },
      {
        key: "/ai-executions",
        icon: <HistoryOutlined />,
        label: "AI 执行记录",
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
        key: "project-settings-root",
        icon: <SettingOutlined />,
        label: "项目设置",
        children: [
          {
            key: "/project-settings",
            label: "基础设置",
          },
          {
            key: "/project-settings/repositories",
            label: "代码仓库",
          },
          {
            key: "/project-settings/testing",
            label: "测试设置",
          },
        ],
      },
      {
        key: "/projects",
        icon: <FolderOpenOutlined />,
        label: "项目管理",
      },
      ...(user.role === UserRole.ADMIN
        ? [
            {
              key: "/ai-settings",
              icon: <ApiOutlined />,
              label: "模型配置",
            },
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

  function navigateFromMenu({ key }: { key: string }) {
    if (key.startsWith("/")) {
      navigate(key);
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
      navigate("/requirements");
      router.refresh();
    });
  }

  return (
    <>
      {messageContext}
      <Layout className={styles.layout}>
        <Sider className={styles.sider} width={232}>
          <div className={styles.logo}>
            <Image
              className={styles.logoMark}
              src="/specchain.svg"
              alt=""
              width={34}
              height={34}
            />
            <span className={styles.logoName}>SpecChain</span>
          </div>

          <Menu
            className={styles.menu}
            theme="dark"
            mode="inline"
            items={menuItems}
            selectedKeys={[resolveSelectedKey(pathname)]}
            defaultOpenKeys={[
              "requirements-root",
              "test-cases-root",
              "project-settings-root",
            ]}
            onClick={navigateFromMenu}
          />
        </Sider>

        <Layout className={styles.mainLayout}>
          <Header className={styles.header}>
            <div className={styles.projectContext}>
              <span className={styles.projectContextIcon}>
                <ApartmentOutlined />
              </span>
              <div className={styles.projectContextBody}>
                <span className={styles.projectContextLabel}>当前项目</span>
                {projects.length > 0 ? (
                  <Select
                    className={styles.projectSelect}
                    value={currentProject?.id}
                    placeholder="请选择项目"
                    options={projects.map((project) => ({
                      label: project.name,
                      value: project.id,
                    }))}
                    onChange={switchProject}
                    loading={isSwitching}
                    variant="borderless"
                    suffixIcon={<DownOutlined />}
                  />
                ) : (
                  <button
                    className={styles.emptyProject}
                    type="button"
                    onClick={() => navigate("/projects")}
                  >
                    <span>暂无项目</span>
                    <strong>创建项目</strong>
                  </button>
                )}
              </div>
            </div>
            <Dropdown menu={{ items: userMenu }} trigger={["click"]}>
              <button className={styles.userButton} type="button">
                <Avatar className={styles.userAvatar} size={30}>
                  {user.username.slice(0, 1).toUpperCase()}
                </Avatar>
                <span className={styles.userName}>{user.username}</span>
                <DownOutlined className={styles.userChevron} />
              </button>
            </Dropdown>
          </Header>
          <Content className={contentClassName} aria-busy={isNavigating}>
            {children}
          </Content>
        </Layout>
      </Layout>

      <ChangePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />
    </>
  );
}
