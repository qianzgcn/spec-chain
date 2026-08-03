"use client";

import { TypeScriptEditor } from "@/components/editors/typescript-editor";

export type ScriptEditorProps = {
  value?: string;
  onChange?: (value: string) => void;
};

export function ScriptEditor({
  value = "",
  onChange = () => undefined,
}: ScriptEditorProps) {
  return (
    <TypeScriptEditor
      value={value}
      onChange={onChange}
      placeholder={`import { test, expect } from "@playwright/test";

test("用例名称", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/系统名称/);
});`}
    />
  );
}
