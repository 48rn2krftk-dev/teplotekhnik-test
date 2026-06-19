import type { AppSettings } from "../types";

export type ResolvedTheme = "light" | "dark";

export function resolveTheme(
  theme: AppSettings["theme"],
  prefersDark: boolean
): ResolvedTheme {
  if (theme === "system") {
    return prefersDark ? "dark" : "light";
  }

  return theme;
}

export function applyTheme(theme: AppSettings["theme"]): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function updateTheme() {
    const resolvedTheme = resolveTheme(theme, media.matches);
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }

  updateTheme();

  if (theme !== "system") {
    return () => {};
  }

  media.addEventListener("change", updateTheme);

  return () => {
    media.removeEventListener("change", updateTheme);
  };
}
