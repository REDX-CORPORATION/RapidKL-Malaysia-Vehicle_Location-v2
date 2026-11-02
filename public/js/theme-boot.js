// Runs before first paint (see <head>) so the page never flashes the wrong theme.
(function () {
  var style = 'auto', dark = false;
  try {
    style = localStorage.getItem('jomnaik:style') || 'auto';
    if (style !== 'light' && style !== 'dark') style = 'auto';
    dark = style === 'dark' || (style === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (e) {}
  var d = document.documentElement;
  d.dataset.theme = dark ? 'dark' : 'light';
  d.dataset.style = style;
})();
