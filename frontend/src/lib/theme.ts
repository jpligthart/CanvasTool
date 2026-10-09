export type Theme = "light" | "dark";

const KEY = "cursusbeheer:theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function stored(): Theme | null {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : null;
}

export function currentTheme(): Theme {
  return stored() ?? (media().matches ? "dark" : "light");
}

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Applies the theme before first render and follows the OS until the user picks one. */
export function initTheme(): void {
  apply(currentTheme());
  media().addEventListener("change", () => {
    if (!stored()) apply(currentTheme());
  });
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme);
  apply(theme);
}
