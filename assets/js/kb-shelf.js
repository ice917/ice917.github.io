/* 书架：横向滑动、按领域筛选、新建书说明。纯原生 JS，无依赖。 */
(function () {
  'use strict';

  var shelf = document.querySelector('[data-shelf]');
  var foot = document.querySelector('[data-shelf-foot]');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.kb-filter__chip'));
  var books = shelf ? Array.prototype.slice.call(shelf.querySelectorAll('.kb-book')) : [];

  /* 书少时居中，放不下时才露出「可滑动」和左右箭头 */
  function syncShelf() {
    if (!shelf) return;
    var overflow = shelf.scrollWidth - shelf.clientWidth > 1;
    shelf.classList.toggle('is-centered', !overflow);
    if (foot) foot.hidden = !overflow;
  }

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
    syncShelf();
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      apply(chip.getAttribute('data-domain'));
    });
  });

  if (shelf) {
    shelf.addEventListener('scroll', syncShelf, { passive: true });
    window.addEventListener('resize', syncShelf);
    if (foot) {
      Array.prototype.slice.call(foot.querySelectorAll('button')).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var dir = Number(btn.getAttribute('data-shelf-dir')) || 1;
          var step = Math.max(180, Math.round(shelf.clientWidth * 0.8));
          shelf.scrollBy({ left: dir * step, behavior: 'smooth' });
        });
      });
    }
    syncShelf();
  }

  /* 右上角加号：说明怎么新增一本书 */
  var addBtn = document.querySelector('[data-newbook]');
  var dialog = document.querySelector('[data-newbook-dialog]');
  if (addBtn && dialog && typeof dialog.showModal === 'function') {
    addBtn.addEventListener('click', function () {
      dialog.showModal();
    });
    var closeBtn = dialog.querySelector('[data-newbook-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        dialog.close();
      });
    }
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  }
})();
