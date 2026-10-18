(() => {
  let saved;
  try { saved = localStorage.getItem('studyTheme'); } catch {}
  let theme = saved === 'light' ? 'light' : 'dark';
  function apply() {
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById('themeToggle');
    if (button) { button.textContent = theme === 'dark' ? 'Light theme' : 'Dark theme'; button.setAttribute('aria-pressed', String(theme === 'dark')); button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'); }
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('themeToggle').onclick = () => {
      theme = theme === 'dark' ? 'light' : 'dark'; saved = theme;
      try { localStorage.setItem('studyTheme', theme); } catch {}
      apply();
    };
  });
})();
