(() => {
  'use strict';
  const escape = (value = '') =>
    String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]
    );
  const icons = {
    play: '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5v14m8-14v14" stroke-width="3.5"/>',
    step: '<path d="m5 6 9 6-9 6z" fill="currentColor" stroke="none"/><path d="M18 6v12" stroke-width="2.6"/>',
    reset: '<path d="M3.5 10a8.5 8.5 0 1 1 1.7 7.6"/><path d="M3.5 4.5V10H9"/>',
    grid: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5"/><rect x="14" y="14" width="6.5" height="6.5" rx="1.5"/>',
    expand: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
    shrink: '<path d="M4 9h5V4m11 5h-5V4M4 15h5v5m11-5h-5v5"/>',
    panels:
      '<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5v6l3.8 2"/>',
    book: '<path d="M4 4h11a3 3 0 0 1 3 3v13H6a2 2 0 0 1-2-2zm0 13a2 2 0 0 1 2-2h12M8 8h6"/>',
    note: '<path d="M5 3.5h10L19 8v12.5H5zM14.5 4v5H19M8 13h8m-8 4h6"/>',
    close: '<path d="m6 6 12 12M18 6l-12 12"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    mission:
      '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    pencil: '<path d="m4 15 11-11 4 4L8 19l-5 1zM13 6l4 4"/>',
    image:
      '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m4 16 5-5 4 4 3-3 5 5"/><circle cx="15" cy="8.5" r="1.4" fill="currentColor" stroke="none"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  };
  function icon(name, size = 18) {
    return (
      '<svg class="icon" width="' +
      Number(size) +
      '" height="' +
      Number(size) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (icons[name] || '') +
      '</svg>'
    );
  }
  function range(key, label, value, min, max, step = 1, unit = '') {
    const percent = Math.max(0, Math.min(100, ((Number(value) - min) / (max - min || 1)) * 100));
    return (
      '<label class="field range-field"><span class="field-line"><span>' +
      escape(label) +
      '</span><output>' +
      escape(value) +
      '<small>' +
      escape(unit) +
      '</small></output></span><input type="range" data-key="' +
      escape(key) +
      '" min="' +
      escape(min) +
      '" max="' +
      escape(max) +
      '" step="' +
      escape(step) +
      '" value="' +
      escape(value) +
      '" data-unit="' +
      escape(unit) +
      '" style="--range-fill:' +
      percent +
      '%"></label>'
    );
  }
  function select(key, label, value, options) {
    const choices = options
      .map((option) => {
        const [v, l] = Array.isArray(option) ? option : [option, option];
        return (
          '<option value="' +
          escape(v) +
          '"' +
          (String(value) === String(v) ? ' selected' : '') +
          '>' +
          escape(l) +
          '</option>'
        );
      })
      .join('');
    return (
      '<label class="field select-field"><span>' +
      escape(label) +
      '</span><select data-key="' +
      escape(key) +
      '">' +
      choices +
      '</select></label>'
    );
  }
  function toggle(key, label, checked) {
    return (
      '<label class="toggle-field"><span>' +
      escape(label) +
      '</span><input type="checkbox" data-key="' +
      escape(key) +
      '"' +
      (checked ? ' checked' : '') +
      '><span class="switch-track" aria-hidden="true"></span></label>'
    );
  }
  function button(key, label, variant = '') {
    return (
      '<button type="button" class="control-button ' +
      escape(variant) +
      '" data-act="' +
      escape(key) +
      '">' +
      escape(label) +
      '</button>'
    );
  }
  window.Lab = { scenes: Object.create(null), ui: { escape, icon, range, select, toggle, button } };
})();
