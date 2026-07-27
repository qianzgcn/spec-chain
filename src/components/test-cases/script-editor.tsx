"use client";

import { javascript } from "@codemirror/lang-javascript";
import CodeMirror from "@uiw/react-codemirror";

export type ScriptEditorProps = {
  value?: string;
  onChange?: (value: string) => void;
};

export function ScriptEditor({
  value = "",
  onChange = () => undefined,
}: ScriptEditorProps) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-300">
      <CodeMirror
        value={value}
        height="420px"
        extensions={[javascript({ typescript: true })]}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          autocompletion: true,
          bracketMatching: true,
        }}
        placeholder={`import { test, expect } from "@playwright/test";

test("用例名称", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/系统名称/);
});`}
      />
    </div>
  );
}
