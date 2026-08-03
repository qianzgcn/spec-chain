"use client";

import { javascript } from "@codemirror/lang-javascript";
import CodeMirror from "@uiw/react-codemirror";

export type TypeScriptEditorProps = {
  value?: string;
  height?: string;
  placeholder?: string;
  ariaLabel?: string;
  onChange?: (value: string) => void;
};

export function TypeScriptEditor({
  value = "",
  height = "420px",
  placeholder,
  ariaLabel,
  onChange = () => undefined,
}: TypeScriptEditorProps) {
  return (
    <div className="bg-background overflow-hidden rounded-lg border">
      <CodeMirror
        value={value}
        height={height}
        extensions={[javascript({ typescript: true })]}
        onCreateEditor={(view) => {
          if (ariaLabel) view.contentDOM.setAttribute("aria-label", ariaLabel);
        }}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          autocompletion: true,
          bracketMatching: true,
        }}
        placeholder={placeholder}
      />
    </div>
  );
}
