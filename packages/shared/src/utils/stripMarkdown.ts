/**
 * Strips markdown syntax to produce readable plain text.
 *
 * This is an MVP approach for contexts where a full markdown renderer is not
 * available (e.g. React Native without a markdown library). It converts
 * markdown source into clean plain text by removing formatting syntax while
 * preserving the readable content.
 *
 * **Limitations:**
 * - Does NOT produce formatted/styled output — just plain text
 * - Product embeds (`{{product:ID}}`) are replaced with a placeholder, not
 *   rendered as interactive elements
 * - Complex markdown (tables, footnotes, nested lists) may not be perfectly
 *   cleaned but will be passably readable
 *
 * A proper markdown renderer (e.g. `react-native-markdown-display`) should
 * replace this for production-quality content display.
 */
export function stripMarkdownSyntax(markdown: string): string {
  let text = markdown;

  // Remove code blocks (fenced with ``` or ~~~)
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/~~~[\s\S]*?~~~/g, "");

  // Remove inline code
  text = text.replace(/`([^`]+)`/g, "$1");

  // Remove product embeds {{product:ID}}
  text = text.replace(/\{\{product:[^}]+\}\}/g, "");

  // Remove images ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  // Remove links [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Remove heading markers (lines starting with # to ######)
  text = text.replace(/^#{1,6}\s+/gm, "");

  // Remove bold/italic markers
  text = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
  text = text.replace(/_{1,3}([^_]+)_{1,3}/g, "$1");

  // Remove strikethrough
  text = text.replace(/~~([^~]+)~~/g, "$1");

  // Remove blockquote markers
  text = text.replace(/^>\s?/gm, "");

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, "");

  // Remove unordered list markers (-, *, +)
  text = text.replace(/^[\s]*[-*+]\s+/gm, "");

  // Remove ordered list markers (1., 2., etc.)
  text = text.replace(/^[\s]*\d+\.\s+/gm, "");

  // Collapse multiple blank lines into a single one
  text = text.replace(/\n{3,}/g, "\n\n");

  // Trim leading/trailing whitespace
  return text.trim();
}
