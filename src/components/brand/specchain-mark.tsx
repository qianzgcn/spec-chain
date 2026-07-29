export function SpecChainMark({
  className,
  size = 34,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 64 64"
    >
      <rect width="64" height="64" rx="10" fill="currentColor" />
      <path
        d="M26.5 38.5l-3.8 3.8a8 8 0 0 1-11.3-11.3l7-7a8 8 0 0 1 11.3 0l2.2 2.2m5.6-.7 3.8-3.8A8 8 0 0 1 52.6 33l-7 7a8 8 0 0 1-11.3 0l-2.2-2.2M24.5 39.5l15-15"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
    </svg>
  );
}
