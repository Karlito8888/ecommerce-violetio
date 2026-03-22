/**
 * @module FaqAccordion
 *
 * Native HTML `<details>`/`<summary>` accordion for FAQ items.
 *
 * Accessibility features:
 * - Uses semantic `<details>`/`<summary>` elements (keyboard accessible with zero JS)
 * - `role="region"` + `aria-labelledby` on answer panels for screen reader navigation
 * - Chevron icon marked `aria-hidden` to avoid redundant announcements
 * - Markdown answers sanitized with DOMPurify to prevent XSS from CMS content
 */

import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import type { FaqItem } from "@ecommerce/shared";

interface FaqAccordionProps {
  items: FaqItem[];
  /** When set, matching items render with open attribute */
  highlightedIds?: Set<string>;
}

/**
 * Renders FAQ items as native <details>/<summary> accordion.
 * Zero-JS operation — keyboard accessible out of the box.
 */
export default function FaqAccordion({ items, highlightedIds }: FaqAccordionProps) {
  return (
    <div className="faq-accordion">
      {items.map((item) => {
        const isHighlighted = highlightedIds?.has(item.id);
        return (
          <details
            key={item.id}
            className={`faq-accordion__item${isHighlighted ? " faq-accordion__item--highlighted" : ""}`}
            open={isHighlighted}
          >
            <summary className="faq-accordion__question" id={`faq-q-${item.id}`}>
              <span>{item.question}</span>
              <ChevronIcon />
            </summary>
            <FaqAnswer markdown={item.answerMarkdown} questionId={item.id} />
          </details>
        );
      })}
    </div>
  );
}

function FaqAnswer({ markdown, questionId }: { markdown: string; questionId: string }) {
  // Content is sanitized with DOMPurify before rendering — safe from XSS
  const html = useMemo(() => {
    const raw = marked.parse(markdown, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [markdown]);

  return (
    <div
      className="faq-accordion__answer"
      role="region"
      aria-labelledby={`faq-q-${questionId}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ChevronIcon() {
  return (
    <svg
      className="faq-accordion__icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 7.5L10 12.5L15 7.5" />
    </svg>
  );
}
