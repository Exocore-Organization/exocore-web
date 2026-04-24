export function initTheme(): void {
    const saved = localStorage.getItem('exo_theme') ?? 'dark';
    document.documentElement.setAttribute('data-theme', saved);
}

export function setTheme(theme: string): void {
    localStorage.setItem('exo_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
}
