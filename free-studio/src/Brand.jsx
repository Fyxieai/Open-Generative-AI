import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
export function Logo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 12 26 4l13 8v20l-17 9-13-8V12Z"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="m9 12 13 8 17-8M22 20v21M17 8l14 8v20M9 26l13 8 17-9"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path d="m22 20 9-4v12l-9 5V20Z" fill="currentColor" />
    </svg>
  );
}
export default function Brand() {
  return (
    <HStack gap={2} vAlign="center">
      <Logo />
      <Text
        type="label"
        style={{ letterSpacing: ".16em", fontSize: "var(--studio-brand-size)" }}
      >
        PARALLAX
      </Text>
    </HStack>
  );
}
export function Glyph({ name, size = 18 }) {
  const p = {
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="9" cy="8" r="2" />
        <path d="m3 17 6-5 4 4 4-6 4 7" />
      </>
    ),
    video: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m10 9 5 3-5 3z" />
      </>
    ),
    code: (
      <>
        <path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    plug: (
      <>
        <path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
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
      {p[name] || p.spark}
    </svg>
  );
}
