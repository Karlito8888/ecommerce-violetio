import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import ContentProductCard from "./ContentProductCard";

const EMBED_REGEX = /\{\{product:([a-zA-Z0-9_-]+)\}\}/g;

/**
 * Content segment — either a markdown text block or a product embed.
 */
export type ContentSegment =
  | { type: "markdown"; content: string }
  | { type: "product"; productId: string };

/**
 * Splits markdown content at {{product:ID}} embed boundaries.
 * Returns an array of alternating markdown/product segments.
 */
export function splitContentWithEmbeds(markdown: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  for (const match of markdown.matchAll(EMBED_REGEX)) {
    const matchIndex = match.index!;

    if (matchIndex > lastIndex) {
      segments.push({ type: "markdown", content: markdown.slice(lastIndex, matchIndex) });
    }

    segments.push({ type: "product", productId: match[1] });
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < markdown.length) {
    segments.push({ type: "markdown", content: markdown.slice(lastIndex) });
  }

  return segments;
}

/**
 * Configure marked to add target="_blank" and rel="noopener noreferrer" to external links.
 */
const renderer = new marked.Renderer();
const originalLinkRenderer = renderer.link.bind(renderer);
renderer.link = function (token) {
  const html = originalLinkRenderer(token);
  if (token.href && token.href.startsWith("http")) {
    return html.replace("<a ", '<a target="_blank" rel="noopener noreferrer" ');
  }
  return html;
};

marked.setOptions({ renderer });

/**
 * Renders a markdown string to sanitized HTML.
 * Uses marked for Markdown→HTML parsing, then DOMPurify to sanitize
 * the output and prevent XSS — even though content is admin-controlled,
 * this provides defense-in-depth against compromised admin accounts.
 */
export function renderMarkdownToHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ["target", "rel"],
  });
}

interface MarkdownRendererProps {
  content: string;
}

/**
 * Renders editorial Markdown content with inline product embeds.
 *
 * ## Pipeline
 * 1. Split content at {{product:ID}} boundaries
 * 2. Markdown segments → marked → DOMPurify.sanitize() → safe HTML
 * 3. Product segments → <ContentProductCard> React components
 *
 * ## Security
 * All HTML is sanitized through DOMPurify before rendering.
 * The dangerouslySetInnerHTML usage is safe because DOMPurify strips
 * all script tags, event handlers, and other XSS vectors.
 */
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const segments = useMemo(() => splitContentWithEmbeds(content), [content]);

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "product") {
          return (
            <ContentProductCard
              key={`product-${segment.productId}`}
              productId={segment.productId}
            />
          );
        }

        // SECURITY: HTML is sanitized by DOMPurify.sanitize() in renderMarkdownToHtml()
        // before being passed to dangerouslySetInnerHTML — all XSS vectors are stripped.
        const sanitizedHtml = renderMarkdownToHtml(segment.content);
        return <div key={`md-${index}`} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
      })}
    </>
  );
}
