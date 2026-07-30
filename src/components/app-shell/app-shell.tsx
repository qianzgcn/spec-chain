"use client";

import { useState, useTransition, type ComponentType } from "react";

import {
  BotIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  FolderKanbanIcon,
  HistoryIcon,
  KeyRoundIcon,
  LogOutIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { switchProjectAction } from "@/app/actions/projects";
import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { WorkspaceBreadcrumbs } from "@/components/app-shell/workspace-breadcrumbs";
import { ChangePasswordModal } from "@/components/auth/change-password-modal";
import { SpecChainMark } from "@/components/brand/specchain-mark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { UserRole } from "@/generated/prisma/enums";
import { confirmLeaveIfDirty } from "@/hooks/use-unsaved-changes";
import { cn } from "@/lib/utils";

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

type NavItem = {
  label: string;
  href: string;
};

type NavGroup = {
  label: string;
  icon: ComponentType;
  href?: string;
  children?: NavItem[];
};

function isPathActive(pathname: string, href: string) {
  if (href === "/requirements") {
    return (
      pathname === href ||
      pathname.startsWith("/features") ||
      pathname.startsWith("/user-stories")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationGroup({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) {
  const Icon = group.icon;
  const active =
    group.children?.some((item) => isPathActive(pathname, item.href)) ?? false;
  const [openState, setOpenState] = useState<{
    pathname: string;
    open: boolean;
  } | null>(null);
  const open = openState?.pathname === pathname ? openState.open : active;

  if (group.href) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isPathActive(pathname, group.href)}
          tooltip={group.label}
          render={<Link href={group.href} />}
        >
          <Icon />
          <span>{group.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={(nextOpen) => setOpenState({ pathname, open: nextOpen })}
    >
      <SidebarMenuItem>
        <CollapsibleTrigger
          render={<SidebarMenuButton tooltip={group.label} />}
        >
          <Icon />
          <span>{group.label}</span>
          <ChevronRightIcon className="ml-auto transition-transform data-panel-open:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {group.children?.map((item) => (
              <SidebarMenuSubItem key={item.href}>
                <SidebarMenuSubButton
                  isActive={isPathActive(pathname, item.href)}
                  render={<Link href={item.href} />}
                >
                  <span>{item.label}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

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

export function AppShell({
  user,
  projects,
  currentProject,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isNavigating, navigate } = useNavigationFeedback();
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [isSwitching, startSwitchTransition] = useTransition();
  const [isLoggingOut, startLogoutTransition] = useTransition();
  const tablePage = TABLE_PAGE_PATHS.has(pathname);
  const projectOptions = projects.map((project) => ({
    label: project.name,
    value: project.id,
  }));

  const navigation: NavGroup[] = [
    {
      label: "需求",
      icon: FileTextIcon,
      children: [
        { label: "需求列表", href: "/requirements" },
        { label: "待评审需求", href: "/requirements/pending-review" },
      ],
    },
    {
      label: "AI 执行记录",
      icon: HistoryIcon,
      href: "/ai-executions",
    },
    {
      label: "测试用例",
      icon: ClipboardCheckIcon,
      children: [
        { label: "用例列表", href: "/test-cases" },
        { label: "分组管理", href: "/test-case-groups" },
      ],
    },
    {
      label: "项目设置",
      icon: SettingsIcon,
      children: [
        { label: "基础设置", href: "/project-settings" },
        { label: "代码仓库", href: "/project-settings/repositories" },
        { label: "测试设置", href: "/project-settings/testing" },
      ],
    },
    {
      label: "项目管理",
      icon: FolderKanbanIcon,
      href: "/projects",
    },
    ...(user.role === UserRole.ADMIN
      ? [
          {
            label: "模型配置",
            icon: BotIcon,
            href: "/ai-settings",
          },
          {
            label: "用户管理",
            icon: UsersIcon,
            href: "/users",
          },
        ]
      : []),
  ];

  function switchProject(projectId: string | null) {
    if (!projectId || !confirmLeaveIfDirty()) return;

    startSwitchTransition(async () => {
      const result = await switchProjectAction(projectId);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      navigate("/requirements");
      router.refresh();
    });
  }

  return (
    <>
      <SidebarProvider
        className="h-dvh min-h-0 overflow-hidden"
        style={{ "--sidebar-width": "14rem" } as React.CSSProperties}
      >
        <Sidebar collapsible="icon">
          <SidebarHeader className="gap-2 border-b p-2">
            <div className="flex h-9 items-center">
              <Link
                href="/requirements"
                className="flex min-w-0 items-center gap-2 px-2"
              >
                <SpecChainMark size={28} />
                <span className="truncate text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
                  SpecChain
                </span>
              </Link>
            </div>
            <div className="flex flex-col gap-1 px-1 group-data-[collapsible=icon]:hidden">
              {projects.length ? (
                <Select
                  items={projectOptions}
                  value={currentProject?.id ?? null}
                  disabled={isSwitching}
                  onValueChange={switchProject}
                >
                  <SelectTrigger className="w-full" aria-label="当前项目">
                    <SelectValue>
                      {() => currentProject?.name ?? "请选择项目"}
                    </SelectValue>
                    {isSwitching ? <Spinner /> : null}
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/projects")}
                >
                  创建项目
                </Button>
              )}
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigation.map((group) => (
                    <NavigationGroup
                      key={group.href ?? group.label}
                      group={group}
                      pathname={pathname}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t">
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                    <Avatar className="size-7 rounded-md">
                      <AvatarFallback className="rounded-md text-xs">
                        {user.username.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium">
                        {user.username}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {user.role === UserRole.ADMIN ? "管理员" : "普通用户"}
                      </div>
                    </div>
                    <ChevronsUpDownIcon className="ml-auto" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    align="end"
                    className="w-56"
                  >
                    <DropdownMenuLabel>
                      <div className="flex flex-col gap-1">
                        <span>{user.username}</span>
                        <span className="text-muted-foreground text-xs font-normal">
                          {user.role === UserRole.ADMIN ? "管理员" : "普通用户"}
                        </span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onClick={() => setPasswordModalOpen(true)}
                      >
                        <KeyRoundIcon />
                        修改密码
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={isLoggingOut}
                        onClick={() =>
                          startLogoutTransition(() => logoutAction())
                        }
                      >
                        {isLoggingOut ? <Spinner /> : <LogOutIcon />}
                        {isLoggingOut ? "正在退出…" : "退出登录"}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="h-dvh min-h-0 overflow-hidden">
          <header className="flex h-11 shrink-0 items-center gap-3 border-b px-5">
            <SidebarTrigger />
            <WorkspaceBreadcrumbs pathname={pathname} />
          </header>
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col p-5",
              tablePage ? "overflow-hidden" : "overflow-y-auto",
            )}
            aria-busy={isNavigating}
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>

      <ChangePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />
    </>
  );
}
