/* 书架：按领域筛选书籍。纯原生 JS，无依赖。 */
(function () {
  'use strict';

  var shelf = document.querySelector('[data-shelf]');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.kb-filter__chip'));
  if (!shelf || !chips.length) return;

  var books = Array.prototype.slice.call(shelf.querySelectorAll('.kb-book'));

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
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      apply(chip.getAttribute('data-domain'));
    });
  });
})();
