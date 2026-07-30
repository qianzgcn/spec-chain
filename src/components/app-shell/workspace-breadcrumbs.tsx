import { Fragment } from "react";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type BreadcrumbEntry = {
  label: string;
  href?: string;
};

function buildBreadcrumbs(pathname: string): BreadcrumbEntry[] {
  const segments = pathname.split("/").filter(Boolean);

  if (pathname === "/requirements/pending-review") {
    return [
      { label: "需求列表", href: "/requirements" },
      { label: "待评审需求" },
    ];
  }

  if (pathname.startsWith("/requirements/pending-review/")) {
    return [
      { label: "需求列表", href: "/requirements" },
      { label: "待评审需求", href: "/requirements/pending-review" },
      { label: "评审需求" },
    ];
  }

  if (pathname === "/features/new") {
    return [{ label: "需求列表", href: "/requirements" }, { label: "新建 FE" }];
  }

  if (segments[0] === "features" && segments[1]) {
    const featurePath = `/features/${segments[1]}`;
    if (segments[2] === "edit") {
      return [
        { label: "需求列表", href: "/requirements" },
        { label: "FE 详情", href: featurePath },
        { label: "编辑 FE" },
      ];
    }
    if (segments[2] === "user-stories" && segments[3] === "new") {
      return [
        { label: "需求列表", href: "/requirements" },
        { label: "FE 详情", href: featurePath },
        { label: "新建US" },
      ];
    }
    return [{ label: "需求列表", href: "/requirements" }, { label: "FE 详情" }];
  }

  if (pathname === "/user-stories/new") {
    return [{ label: "需求列表", href: "/requirements" }, { label: "新建US" }];
  }

  if (pathname === "/user-stories/ai-generate") {
    return [
      { label: "需求列表", href: "/requirements" },
      { label: "AI辅助生成US" },
    ];
  }

  if (segments[0] === "user-stories" && segments[1]) {
    const storyPath = `/user-stories/${segments[1]}`;
    if (segments[2] === "edit") {
      return [
        { label: "需求列表", href: "/requirements" },
        { label: "US 详情", href: storyPath },
        { label: "编辑US" },
      ];
    }
    return [{ label: "需求列表", href: "/requirements" }, { label: "US 详情" }];
  }

  if (segments[0] === "ai-executions" && segments[1]) {
    return [
      { label: "AI 执行记录", href: "/ai-executions" },
      { label: "执行详情" },
    ];
  }

  if (pathname === "/test-case-groups") {
    return [{ label: "测试用例", href: "/test-cases" }, { label: "分组管理" }];
  }

  if (pathname === "/test-cases/new") {
    return [{ label: "用例列表", href: "/test-cases" }, { label: "新建用例" }];
  }

  if (segments[0] === "test-cases" && segments[1]) {
    const testCasePath = `/test-cases/${segments[1]}`;
    if (segments[2] === "edit") {
      return [
        { label: "用例列表", href: "/test-cases" },
        { label: "用例详情", href: testCasePath },
        { label: "编辑用例" },
      ];
    }
    if (segments[2] === "runs") {
      return [
        { label: "用例列表", href: "/test-cases" },
        { label: "用例详情", href: testCasePath },
        { label: "执行记录" },
      ];
    }
    return [{ label: "用例列表", href: "/test-cases" }, { label: "用例详情" }];
  }

  if (pathname === "/project-settings/repositories") {
    return [
      { label: "项目设置", href: "/project-settings" },
      { label: "代码仓库" },
    ];
  }

  if (pathname === "/project-settings/testing") {
    return [
      { label: "项目设置", href: "/project-settings" },
      { label: "测试设置" },
    ];
  }

  return [];
}

export function WorkspaceBreadcrumbs({ pathname }: { pathname: string }) {
  const entries = buildBreadcrumbs(pathname);
  if (!entries.length) return null;

  const parent = [...entries]
    .slice(0, -1)
    .reverse()
    .find((entry) => entry.href);

  return (
    <>
      {parent?.href ? (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={parent.href} />}
          aria-label={`返回${parent.label}`}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          返回
        </Button>
      ) : null}
      <Separator orientation="vertical" className="h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {entries.map((entry, index) => {
            const last = index === entries.length - 1;
            return (
              <Fragment key={`${entry.label}-${index}`}>
                <BreadcrumbItem>
                  {entry.href && !last ? (
                    <BreadcrumbLink render={<Link href={entry.href} />}>
                      {entry.label}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{entry.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {!last ? <BreadcrumbSeparator /> : null}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  );
}
