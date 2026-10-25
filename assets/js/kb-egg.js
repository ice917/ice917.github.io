/* 霍格沃兹彩蛋：在书架页连点标题 5 下 → 分院帽 → 全站换肤；激活后再连点 5 下退出。
   状态存在 localStorage 的 kb-egg 里，页面加载时由 extend_head.html 的内联脚本先挂到
   <html data-egg>，所以刷新不会闪回默认皮肤。纯原生 JS，无依赖。 */
(function () {
  'use strict';

  var KEY = 'kb-egg';
  var title = document.querySelector('.kb-shelf-head h1');
  if (!title) return;

  var HOUSES = [
    { id: 'gryffindor', name: '格兰芬多', en: 'GRYFFINDOR' },
    { id: 'slytherin', name: '斯莱特林', en: 'SLYTHERIN' },
    { id: 'ravenclaw', name: '拉文克劳', en: 'RAVENCLAW' },
    { id: 'hufflepuff', name: '赫奇帕奇', en: 'HUFFLEPUFF' }
  ];
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function state() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }

  function active() {
    var s = state();
    return !!(s && s.on);
  }

  /* ---------------------------------------------------------------- 浮层 */

  function mount(kicker) {
    var root = document.createElement('div');
    root.className = 'hk-cer';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');

    var card = document.createElement('div');
    card.className = 'hk-cer__card';

    var k = document.createElement('p');
    k.className = 'hk-cer__kicker';
    k.textContent = kicker;

    var name = document.createElement('p');
    name.className = 'hk-cer__name';

    var en = document.createElement('p');
    en.className = 'hk-cer__en';

    var hint = document.createElement('p');
    hint.className = 'hk-cer__hint';

    card.appendChild(k);
    card.appendChild(name);
    card.appendChild(en);
    card.appendChild(hint);
    root.appendChild(card);
    document.body.appendChild(root);

    /* 下一帧再上 is-in，否则 opacity 过渡不会发生 */
    requestAnimationFrame(function () { root.classList.add('is-in'); });

    return { root: root, name: name, en: en, hint: hint };
  }

  function commit(pick) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ on: true, house: pick.id, at: Date.now() }));
    } catch (e) {}
    location.reload();
  }

  function sort() {
    var view = mount('分院帽');
    var pick = HOUSES[Math.floor(Math.random() * HOUSES.length)];
    var done = false;
    var outTimer = null;

    function finish() {
      if (done) return;
      done = true;
      if (outTimer) clearTimeout(outTimer);
      view.root.classList.add('is-final');
      view.name.textContent = pick.name;
      view.en.textContent = pick.en;
      view.hint.textContent = '就这样定了。';
      outTimer = setTimeout(function () {
        view.root.classList.add('is-out');
        outTimer = setTimeout(function () { commit(pick); }, 340);
      }, 1500);
    }

    /* 顶栏点任意处可以直接跳过循环 */
    view.root.addEventListener('click', finish);

    if (reduced) {
      view.name.textContent = '嗯……';
      view.hint.textContent = '点按任意处继续';
      setTimeout(finish, 500);
      return;
    }

    view.name.textContent = '嗯……';
    view.en.textContent = 'THE SORTING HAT';
    view.hint.textContent = '点按任意处跳过';

    var intervals = [];
    var i;
    for (i = 0; i < 12; i++) intervals.push(90);
    for (i = 0; i < 5; i++) intervals.push(170);
    for (i = 0; i < 3; i++) intervals.push(300);

    var step = 0;
    function tick() {
      if (done) return;
      if (step >= intervals.length) { finish(); return; }
      /* 最后两跳先亮出结果，再落定，避免「明明转到别的院却判给另一个」 */
      var house = step >= intervals.length - 2 ? pick : HOUSES[step % HOUSES.length];
      view.name.textContent = house.name;
      view.en.textContent = house.en;
      setTimeout(tick, intervals[step]);
      step++;
    }
    setTimeout(tick, 620);
  }

  function leave() {
    var view = mount('魔咒解除');
    view.name.textContent = '书架正在恢复原样';
    view.en.textContent = 'EVANESCO';
    view.hint.textContent = '';

    try { localStorage.removeItem(KEY); } catch (e) {}

    setTimeout(function () {
      view.root.classList.add('is-out');
      setTimeout(function () { location.reload(); }, 340);
    }, 760);
  }

  /* ------------------------------------------------------------ 连点 5 下 */

  var hits = 0;
  var last = 0;

  title.addEventListener('click', function () {
    if (document.querySelector('.hk-cer')) return;
    var now = Date.now();
    hits = now - last < 800 ? hits + 1 : 1;
    last = now;
    if (hits < 5) return;
    hits = 0;
    if (active()) leave();
    else sort();
  });
})();
