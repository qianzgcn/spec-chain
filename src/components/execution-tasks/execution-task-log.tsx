"use client";

import { useEffect, useRef } from "react";

import { FileSearchIcon } from "lucide-react";

import { PageSection } from "@/components/layout/page-section";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { AiExecutionLogLevel } from "@/generated/prisma/enums";
import { getAiExecutionStageLabel } from "@/lib/execution-tasks/meta";
import type {
  AiExecutionLogEntry,
  AiExecutionTaskDetail,
} from "@/lib/execution-tasks/types";
import { formatShanghaiLogTime } from "@/lib/log-time";
import { cn } from "@/lib/utils";

const LOG_LEVEL_META = {
  [AiExecutionLogLevel.INFO]: {
    label: "INFO",
    className: "text-background/70",
  },
  [AiExecutionLogLevel.WARN]: {
    label: "WARN",
    className: "text-warning",
  },
  [AiExecutionLogLevel.ERROR]: {
    label: "ERROR",
    className: "text-destructive",
  },
} satisfies Record<AiExecutionLogLevel, { label: string; className: string }>;

function useFollowLatest(dependency: number | string | null) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !shouldFollowRef.current || !dependency) return;

    const frame = requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [dependency]);

  function trackScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldFollowRef.current = distanceFromBottom <= 32;
  }

  return { viewportRef, trackScroll };
}

function LiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="info">
      <Spinner data-icon="inline-start" />
      实时
    </Badge>
  ) : null;
}

export function AiExecutionTaskLog({
  logs,
  active,
  capability,
}: {
  logs: AiExecutionLogEntry[];
  active: boolean;
  capability: AiExecutionTaskDetail["capability"];
}) {
  const { viewportRef, trackScroll } = useFollowLatest(logs.length);

  return (
    <PageSection
      title="执行日志"
      description={
        active
          ? "任务运行中，日志会实时更新。"
          : `共记录 ${logs.length} 条日志。`
      }
      actions={<LiveBadge active={active} />}
      contentClassName="p-0"
    >
      {logs.length === 0 ? (
        <Empty className="min-h-56">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSearchIcon />
            </EmptyMedia>
            <EmptyTitle>暂无执行日志</EmptyTitle>
            <EmptyDescription>
              {active ? "任务开始执行后会显示日志。" : "本次任务没有日志。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          ref={viewportRef}
          className="bg-foreground text-background max-h-[440px] min-h-56 overflow-y-auto px-5 py-4 font-mono text-[13px] leading-6"
          role="log"
          aria-live={active ? "polite" : "off"}
          onScroll={trackScroll}
        >
          {logs.map((log) => {
            const level = LOG_LEVEL_META[log.level];
            const stage = log.stage
              ? getAiExecutionStageLabel(capability, log.stage)
              : "系统";
            return (
              <div
                className="grid min-w-0 grid-cols-[12.5rem_3.5rem_minmax(8rem,auto)_minmax(0,1fr)] gap-x-3"
                key={log.position}
              >
                <time className="text-background/60">
                  {formatShanghaiLogTime(log.createdAt)}
                </time>
                <span className={cn("font-semibold", level.className)}>
                  {level.label}
                </span>
                <span className="text-background/75 truncate">[{stage}]</span>
                <span className="min-w-0 break-words whitespace-pre-wrap">
                  {log.message}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </PageSection>
  );
}

export function TestRunExecutionTaskLog({
  content,
  active,
}: {
  content: string | null;
  active: boolean;
}) {
  const { viewportRef, trackScroll } = useFollowLatest(content);

  return (
    <PageSection
      title="执行日志"
      description={active ? "任务运行中，日志会实时更新。" : undefined}
      actions={<LiveBadge active={active} />}
      contentClassName="p-0"
    >
      <div
        ref={viewportRef}
        className="bg-foreground text-background max-h-[440px] min-h-56 overflow-y-auto px-5 py-4 font-mono text-[13px] leading-6 break-words whitespace-pre-wrap"
        role="log"
        aria-live={active ? "polite" : "off"}
        onScroll={trackScroll}
      >
        {content || (active ? "等待任务输出…" : "本次任务没有日志。")}
      </div>
    </PageSection>
  );
}
