/* 书架：按领域筛选书籍 + 横向滑动。纯原生 JS，无依赖。 */
(function () {
  'use strict';

  var shelf = document.querySelector('[data-shelf]');
  if (!shelf) return;

  var chips = Array.prototype.slice.call(document.querySelectorAll('.kb-filter__chip'));
  var books = Array.prototype.slice.call(shelf.querySelectorAll('.kb-book'));
  var nav = document.querySelector('[data-shelf-nav]');

  function apply(domain) {
    chips.forEach(function (chip) {
      var on = chip.getAttribute('data-domain') === domain;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    books.forEach(function (book) {
      book.hidden = domain !== '*' && book.getAttribute('data-domain') !== domain;
    });
    shelf.classList.toggle('is-filtered', domain !== '*');
    syncNav();
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      apply(chip.getAttribute('data-domain'));
    });
  });

  /* 只有书多到放不下时才显示左右箭头 */
  function syncNav() {
    if (!nav) return;
    nav.hidden = shelf.scrollWidth - shelf.clientWidth <= 1;
  }

  if (nav) {
    Array.prototype.slice.call(nav.querySelectorAll('button')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = Number(btn.getAttribute('data-shelf-dir')) || 1;
        var step = Math.max(180, Math.round(shelf.clientWidth * 0.8));
        shelf.scrollBy({ left: dir * step, behavior: 'smooth' });
      });
    });
    window.addEventListener('resize', syncNav);
    syncNav();
  }
})();
