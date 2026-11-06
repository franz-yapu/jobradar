// Applies the saved theme before the first paint, so a dark-mode user never sees a white flash.
// A separate file (not inline) so the production Content-Security-Policy can stay `script-src 'self'`.
try {
  var theme = localStorage.getItem("jobradar.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (error) {}
