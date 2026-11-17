export const ink = "var(--color-background-body)",
  surface = "var(--color-background-card)",
  line = "var(--color-border)",
  muted = "var(--color-text-secondary)",
  accent = "var(--color-accent)";
export const panel = {
  background: surface,
  border: "var(--studio-border-width) solid " + line,
  borderRadius: "var(--radius-container)",
  overflow: "hidden",
};
export const fill = { flex: 1, minWidth: 0 };
export const mono = {
  fontFamily: "var(--font-family-code)",
  fontSize: "var(--font-size-sm, .75rem)",
  letterSpacing: ".08em",
  textTransform: "uppercase",
};
export const media = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
};
export const buttonWrap = {
  borderRadius: "var(--radius-control)",
  overflow: "hidden",
};
