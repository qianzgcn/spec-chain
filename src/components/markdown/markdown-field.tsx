"use client";

import { useState } from "react";

import { MarkdownView } from "@/components/markdown/markdown-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export function MarkdownField({
  value = "",
  onChange,
  placeholder,
  rows = 8,
  id,
  "aria-invalid": ariaInvalid,
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
  "aria-invalid"?: boolean;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => setMode(value as "edit" | "preview")}
      className="gap-0 overflow-hidden rounded-lg border"
    >
      <div className="bg-muted/40 flex justify-end border-b px-2 py-1.5">
        <TabsList>
          <TabsTrigger value="edit">编辑</TabsTrigger>
          <TabsTrigger value="preview">预览</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="edit" className="m-0">
        <Textarea
          id={id}
          value={value}
          aria-invalid={ariaInvalid}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="resize-y rounded-none border-0 shadow-none focus-visible:ring-0"
        />
      </TabsContent>
      <TabsContent value="preview" className="m-0 min-h-40 p-4">
        <MarkdownView content={value} emptyText="暂无可预览内容" />
      </TabsContent>
    </Tabs>
  );
}
