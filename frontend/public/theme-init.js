// Runs before the first paint so a dark-mode user never sees a white flash.
// (A separate file rather than an inline script: the app's Content-Security-Policy does not allow inline scripts.)
(function () {
  var theme = 'light';
  try {
    var saved = localStorage.getItem('7heaven_theme');
    if (saved === 'light' || saved === 'dark') {
      theme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
  } catch (e) {
    /* storage blocked: stay with light */
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
