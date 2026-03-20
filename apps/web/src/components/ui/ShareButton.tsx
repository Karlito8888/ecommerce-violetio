import { useShare } from "@ecommerce/shared";
import { useToast } from "./Toast";

import "../../styles/components/share-button.css";

interface ShareButtonProps {
  url: string;
  title: string;
  text?: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Share button with Web Share API + clipboard fallback.
 *
 * Follows the same BEM + a11y pattern as WishlistButton:
 * - `e.preventDefault()` / `e.stopPropagation()` to prevent parent link navigation
 * - Toast feedback for share result
 * - Accessible `aria-label`
 *
 * UX spec: subtle, non-intrusive — no social platform icons or "Share!" CTAs.
 */
export default function ShareButton({
  url,
  title,
  text,
  label,
  className,
  size = "sm",
}: ShareButtonProps) {
  const { share } = useShare();
  const toast = useToast();

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const result = await share({ title, text, url });

    if (result.method === "clipboard" && result.success) {
      toast.success("Link copied!");
    } else if (result.method === "native" && result.success) {
      toast.success("Shared!");
    } else if (!result.success && result.method === "unsupported") {
      toast.error("Could not share link");
    }
    // No toast on native cancel — user intentionally dismissed
  };

  return (
    <button
      type="button"
      className={`share-button share-button--${size}${className ? ` ${className}` : ""}`}
      onClick={handleClick}
      aria-label={label ?? "Share"}
    >
      {/* Share arrow icon — U+2197 (North East Arrow) */}↗
    </button>
  );
}
