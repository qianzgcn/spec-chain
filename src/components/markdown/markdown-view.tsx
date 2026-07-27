import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export function MarkdownView({
  content,
  emptyText = "暂无内容",
}: {
  content?: string | null;
  emptyText?: string;
}) {
  if (!content?.trim()) {
    return <span className="text-sm text-slate-400">{emptyText}</span>;
  }

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
