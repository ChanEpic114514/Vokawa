const paths = {
  lens: "M4 7h4l2-3h4l2 3h4v14H4ZM16 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  translate:
    "m4 5 7 0m-3-2v2m-3 3c1 4 4 6 7 7m-2-10c0 6-3 10-7 12m10 3 4-11 4 11m-6-4h4",
  chat: "M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0ZM7 10h9m-9 4h6",
  sound: "M3 10v4m4-7v10m5-14v18m5-14v10m4-7v4",
  book: "M5 3h14v19l-7-5-7 5ZM8 7h8m-8 4h6",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Zm-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-3 0h6",
  play: "m8 4 12 8-12 8Z",
  stop: "M6 6h12v12H6Z",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  swap: "M3 8h18m-4-4 4 4-4 4M21 16H3m4-4-4 4 4 4",
  copy: "M9 9h12v12H9ZM15 9V3H3v12h6",
  star: "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z",
  close: "m6 6 12 12M6 18 18 6",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  magic:
    "m4 20 12-12 4 4-12 12M14 10l4 4M5 3v4m-2-2h4m11-4v4m-2-2h4M4 12v2m-1-1h2",
  refresh: "M20 8a8 8 0 1 0 0 8M20 3v5h-5",
  search: "M15 15l6 6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  check: "m4 12 5 5L20 6",
  chevron: "m8 4 8 8-8 8",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18m0-18c5 5 5 13 0 18",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
