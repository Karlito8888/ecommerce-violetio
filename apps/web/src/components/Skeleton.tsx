type SkeletonVariant = "text" | "image" | "card";

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string;
  height?: string;
  className?: string;
}

export default function Skeleton({
  variant = "text",
  width,
  height,
  className = "",
}: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <div
      className={`skeleton skeleton--${variant} ${className}`.trim()}
      style={style}
      role="status"
      aria-label="Loading"
    />
  );
}
