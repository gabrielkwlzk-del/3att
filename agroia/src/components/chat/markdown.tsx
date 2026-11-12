"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renderiza a resposta da IA. HTML bruto é ignorado (react-markdown não executa HTML). */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-agro text-[15px] sm:text-base">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {linkChildren}
            </a>
          ),
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
