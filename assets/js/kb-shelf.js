/* 书架：书名搜索 + 按领域筛选 + 右侧栏收起、新建书说明。纯原生 JS，无依赖。 */
(function () {
  'use strict';

  var shelf = document.querySelector('[data-shelf]');
  var search = document.querySelector('[data-book-search]');
  var none = document.querySelector('[data-shelf-none]');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.kb-filter__chip'));
  var books = shelf ? Array.prototype.slice.call(shelf.querySelectorAll('.kb-book')) : [];
  var domain = '*';
  var query = '';

  function normalize(text) {
    return String(text || '').trim().toLowerCase();
  }

  /* 领域与书名是「与」的关系：两个条件都满足才留下 */
  function apply() {
    var shown = 0;
    books.forEach(function (book) {
      var okDomain = domain === '*' || book.getAttribute('data-domain') === domain;
      var okQuery = !query || normalize(book.getAttribute('data-title')).indexOf(query) !== -1;
      var on = okDomain && okQuery;
      book.hidden = !on;
      if (on) shown++;
    });
    if (none) none.hidden = !books.length || shown > 0;
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      domain = chip.getAttribute('data-domain') || '*';
      chips.forEach(function (other) {
        var on = other === chip;
        other.classList.toggle('is-on', on);
        other.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      apply();
    });
  });

  if (search) {
    search.addEventListener('input', function () {
      query = normalize(search.value);
      apply();
    });
  }

  /* 右侧栏：状态记在 localStorage 的 kb-side 里，页面内联脚本先按它展开，
     这里负责点击后的同步。收起时内容不销毁，只隐藏，留言框不会被重载。 */
  var side = document.querySelector('[data-side]');
  var sideToggle = document.querySelector('[data-side-toggle]');

  function setSide(collapsed) {
    side.classList.toggle('is-collapsed', collapsed);
    sideToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    sideToggle.setAttribute('aria-label', collapsed ? '展开侧栏' : '收起侧栏');
    var text = sideToggle.querySelector('.kb-side__toggle-text');
    if (text) text.textContent = collapsed ? '展开' : '收起';
    var icon = sideToggle.querySelector('.kb-side__toggle-icon');
    if (icon) icon.textContent = collapsed ? '‹' : '›';
    try {
      localStorage.setItem('kb-side', collapsed ? 'closed' : 'open');
    } catch (e) {}
  }

  if (side && sideToggle) {
    sideToggle.addEventListener('click', function () {
      setSide(!side.classList.contains('is-collapsed'));
    });
    if (side.classList.contains('is-collapsed')) setSide(true);
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
