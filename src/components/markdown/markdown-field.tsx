"use client";

import { useState } from "react";

import { Input, Segmented } from "antd";

import { MarkdownView } from "@/components/markdown/markdown-view";

export function MarkdownField({
  value = "",
  onChange,
  placeholder,
  rows = 8,
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex justify-end border-b border-slate-200 bg-slate-50 px-2 py-2">
        <Segmented
          size="small"
          value={mode}
          onChange={setMode}
          options={[
            { label: "编辑", value: "edit" },
            { label: "预览", value: "preview" },
          ]}
        />
      </div>
      {mode === "edit" ? (
        <Input.TextArea
          variant="borderless"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="!rounded-none !px-4 !py-3"
        />
      ) : (
        <div className="min-h-40 px-4 py-3">
          <MarkdownView content={value} emptyText="暂无可预览内容" />
        </div>
      )}
    </div>
  );
}
