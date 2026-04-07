/**
 * Theme Toggle - Dark/Light mode with system preference support
 */

(function() {
  const STORAGE_KEY = 'gex-theme';
  
  // Theme colors
  const themes = {
    dark: {
      '--bg-dark': '#0d0d0d',
      '--bg-main': '#141414',
      '--bg-card': '#1a1a1a',
      '--bg-card-hover': '#222',
      '--sidebar-bg': '#111',
      '--text': '#fff',
      '--text-muted': '#888',
      '--text-dim': '#666',
      '--border': '#2a2a2a',
      '--border-light': '#333'
    },
    light: {
      '--bg-dark': '#f5f5f5',
      '--bg-main': '#ffffff',
      '--bg-card': '#ffffff',
      '--bg-card-hover': '#f8f8f8',
      '--sidebar-bg': '#fafafa',
      '--text': '#1a1a1a',
      '--text-muted': '#666',
      '--text-dim': '#999',
      '--border': '#e5e5e5',
      '--border-light': '#eee'
    }
  };

  function getPreferredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function setTheme(theme) {
    const colors = themes[theme];
    Object.entries(colors).forEach(([prop, value]) => {
      document.documentElement.style.setProperty(prop, value);
    });
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    return next;
  }

  // Create toggle button
  function createToggleButton() {
    const btn = document.createElement('button');
    btn.id = 'themeToggle';
    btn.className = 'btn btn-default';
    btn.style.cssText = 'background: linear-gradient(135deg, #0d120d 0%, #141a14 100%); border: 1px solid rgba(34, 197, 94, 0.2); color: rgba(34, 197, 94, 0.7); transition: all 0.2s;';
    btn.innerHTML = '<span id="themeIcon">🌙</span>';
    btn.title = 'Toggle theme';
    btn.onmouseenter = () => {
      btn.style.borderColor = '#22c55e';
      btn.style.color = '#22c55e';
      btn.style.boxShadow = '0 0 12px rgba(34, 197, 94, 0.2)';
    };
    btn.onmouseleave = () => {
      btn.style.borderColor = 'rgba(34, 197, 94, 0.2)';
      btn.style.color = 'rgba(34, 197, 94, 0.7)';
      btn.style.boxShadow = 'none';
    };
    btn.onclick = () => {
      const theme = toggleTheme();
      document.getElementById('themeIcon').textContent = theme === 'dark' ? '🌙' : '☀️';
    };
    
    // Find header actions
    const headerActions = document.querySelector('.header-actions') || document.querySelector('.topbar > div:last-child');
    if (headerActions) {
      headerActions.prepend(btn);
    }
  }

  // Initialize
  const initial = getPreferredTheme();
  setTheme(initial);
  
  // Add toggle on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createToggleButton);
  } else {
    createToggleButton();
  }

  // Listen for system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });

  // Export for external use
  window.gexTheme = { setTheme, toggleTheme, getPreferredTheme };
})();
