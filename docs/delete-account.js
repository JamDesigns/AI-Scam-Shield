(() => {
  const picker = document.getElementById('language');
  const sections = [...document.querySelectorAll('[data-locale]')];
  const supported = new Set(sections.map(s => s.dataset.locale));
  function show(value) {
    const language = supported.has(value) ? value : 'en';
    picker.value = language;
    sections.forEach(s => { s.hidden = s.dataset.locale !== language; });
    document.documentElement.lang = language === 'en' ? 'en-GB' : language;
  }
  picker.addEventListener('change', () => show(picker.value));
  const explicit = new URLSearchParams(location.search).get('lang');
  show((explicit || navigator.language || 'en').replace('_', '-').toLowerCase().split('-')[0]);
})();
