/* 知识地图：零依赖 Canvas 力导向图
 * 用法：页面上放
 *   <div class="kb-graph" data-graph="/graph.json" data-mode="full" data-height="620">
 *     <div class="kb-graph__bar"><label class="kb-search"><input type="search"></label><button class="kb-reset">复位</button></div>
 *     <div class="kb-graph__stage"><canvas></canvas><div class="kb-tip" hidden></div></div>
 *     <div class="kb-graph__foot"><span class="kb-status"></span></div>
 *   </div>
 * data-mode="focus" + data-focus="<slug>" + data-depth="1" 只画某篇笔记的邻域。
 * 配色全部读 PaperMod 的 CSS 变量，切换 data-theme 时自动重绘。
 */
(function () {
  'use strict';

  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cache = Object.create(null);

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    v = (v || '').trim();
    return v || fallback;
  }

  function palette() {
    return {
      bg: cssVar('--theme', '#ffffff'),
      fg: cssVar('--primary', '#1e1e1e'),
      muted: cssVar('--secondary', '#6c6c6c'),
      note: cssVar('--kb-note', '#2f6fed'),
      tag: cssVar('--kb-tag', '#b4762a')
    };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadGraph(url) {
    if (!cache[url]) {
      cache[url] = fetch(url, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return r.json();
      });
    }
    return cache[url];
  }

  function Graph(root) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tip = root.querySelector('.kb-tip');
    this.status = root.querySelector('.kb-status');
    this.input = root.querySelector('.kb-search input');

    this.mode = root.dataset.mode === 'focus' ? 'focus' : 'full';
    this.focusId = root.dataset.focus || '';
    this.depth = Math.max(1, parseInt(root.dataset.depth || '1', 10));
    this.heightOverride = parseInt(root.dataset.height || '0', 10) || 0;

    this.nodes = [];
    this.links = [];
    this.byId = Object.create(null);
    this.adj = Object.create(null);
    this.view = { x: 0, y: 0, k: 1 };
    this.hover = null;
    this.drag = null;
    this.pan = null;
    this.down = null;
    this.pointers = new Map();
    this.pinch = null;
    this.query = '';
    this.temp = 0;
    this.worldW = 1200;
    this.worldH = 800;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.palette = palette();
    this.width = 0;
    this.height = 0;
  }

  /* ---------------- 生命周期 ---------------- */

  Graph.prototype.boot = function () {
    var self = this;
    this.resize();
    return loadGraph(this.root.dataset.graph).then(function (data) {
      self.build(data);
      self.bind();
      self.temp = Math.min(self.worldW, self.worldH) * 0.12;
      self.relax(REDUCED ? 700 : 520);
      self.fitView();
      self.draw();
      self.root.classList.add('is-ready');
      if (self.status) {
        self.status.textContent = self.nodes.length + ' 个节点 · ' + self.links.length + ' 条连线';
      }
    }).catch(function (err) {
      self.root.classList.add('is-failed');
      if (self.status) self.status.textContent = '地图数据加载失败：' + err.message;
    });
  };

  Graph.prototype.resize = function () {
    var w = Math.max(260, Math.round(this.root.clientWidth));
    var h = this.heightOverride || Math.max(320, Math.min(760, Math.round(w * 0.66)));
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = h + 'px';
    if (this.nodes.length) {
      this.fitView();
      this.draw();
    }
  };

  /* ---------------- 构图 ---------------- */

  Graph.prototype.build = function (data) {
    var self = this;
    var allNodes = (data.nodes || []).map(function (n) {
      return {
        id: n.id,
        label: n.label || n.id,
        url: n.url || '',
        kind: n.kind === 'tag' ? 'tag' : 'note',
        summary: n.summary || '',
        x: 0, y: 0, deg: 0, r: 6, fixed: false
      };
    });

    var index = Object.create(null);
    allNodes.forEach(function (n) { index[n.id] = n; });

    var seen = Object.create(null);
    var allLinks = (data.links || []).filter(function (l) {
      if (!index[l.source] || !index[l.target] || l.source === l.target) return false;
      var a = l.source < l.target ? l.source : l.target;
      var b = l.source < l.target ? l.target : l.source;
      var key = (l.kind || 'link') + '|' + a + '|' + b;
      if (seen[key]) return false;
      seen[key] = 1;
      return true;
    }).map(function (l) {
      return { source: l.source, target: l.target, kind: l.kind || 'link' };
    });

    /* 邻域模式：从焦点节点向外做 depth 层 BFS */
    if (this.mode === 'focus' && this.focusId && index[this.focusId]) {
      var frontier = Object.create(null);
      frontier[this.focusId] = 1;
      for (var d = 0; d < this.depth; d++) {
        var add = [];
        allLinks.forEach(function (l) {
          if (frontier[l.source] && !frontier[l.target]) { frontier[l.target] = 1; add.push(l.target); }
          if (frontier[l.target] && !frontier[l.source]) { frontier[l.source] = 1; add.push(l.source); }
        });
        if (!add.length) break;
      }
      allNodes = allNodes.filter(function (n) { return frontier[n.id]; });
    }

    var keep = Object.create(null);
    allNodes.forEach(function (n) { keep[n.id] = 1; });
    allLinks = allLinks.filter(function (l) { return keep[l.source] && keep[l.target]; });

    allLinks.forEach(function (l) {
      index[l.source].deg++;
      index[l.target].deg++;
    });

    var count = allNodes.length || 1;
    var R = 42 * Math.sqrt(count);
    allNodes.forEach(function (n, i) {
      var a = (i / count) * Math.PI * 2;
      var jitter = 0.55 + ((i * 37) % 53) / 100;
      n.x = Math.cos(a) * R * jitter;
      n.y = Math.sin(a) * R * jitter;
      n.r = n.kind === 'tag'
        ? 4.5 + 1.4 * Math.sqrt(n.deg)
        : 5 + 1.9 * Math.sqrt(n.deg);
    });

    this.nodes = allNodes;
    this.links = allLinks;
    this.byId = index;
    this.adj = Object.create(null);
    allLinks.forEach(function (l) {
      (self.adj[l.source] || (self.adj[l.source] = Object.create(null)))[l.target] = 1;
      (self.adj[l.target] || (self.adj[l.target] = Object.create(null)))[l.source] = 1;
    });
  };

  /* ---------------- 布局：Fruchterman-Reingold + 向心引力 ---------------- */

  Graph.prototype.relax = function (iters) {
    var nodes = this.nodes;
    var links = this.links;
    if (!nodes.length) return;

    var k = Math.sqrt((this.worldW * this.worldH) / nodes.length) * 0.62;
    var t = Math.max(this.temp, 0.35);
    var i, j, a, b, dx, dy, d2, d, f, ux, uy;
    var gravity = 0.010;

    for (var it = 0; it < iters; it++) {
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          b = nodes[j];
          dx = a.x - b.x;
          dy = a.y - b.y;
          d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = (Math.random() - 0.5) * 2 || 0.5;
            dy = (Math.random() - 0.5) * 2 || 0.5;
            d2 = dx * dx + dy * dy;
          }
          d = Math.sqrt(d2);
          f = (k * k) / d;
          ux = dx / d;
          uy = dy / d;
          a.vx = (a.vx || 0) + ux * f;
          a.vy = (a.vy || 0) + uy * f;
          b.vx = (b.vx || 0) - ux * f;
          b.vy = (b.vy || 0) - uy * f;
        }
      }

      for (i = 0; i < links.length; i++) {
        var l = links[i];
        a = this.byId[l.source];
        b = this.byId[l.target];
        if (!a || !b) continue;
        dx = a.x - b.x;
        dy = a.y - b.y;
        d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        /* 吸引力按度数开方归一：高连接度的笔记不会互相拽成一团 */
        f = Math.min((d * d) / k, k * 3) / Math.sqrt(Math.min(a.deg || 1, b.deg || 1));
        ux = dx / d;
        uy = dy / d;
        a.vx -= ux * f;
        a.vy -= uy * f;
        b.vx += ux * f;
        b.vy += uy * f;
      }

      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        if (a.fixed) { a.vx = 0; a.vy = 0; continue; }
        a.vx += -a.x * gravity;
        a.vy += -a.y * gravity;
        var sp = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
        if (sp > t) { a.vx = (a.vx / sp) * t; a.vy = (a.vy / sp) * t; }
        a.x += a.vx;
        a.y += a.vy;
        a.vx = 0;
        a.vy = 0;
      }

      t *= 0.972;
      if (t < 0.4) t = 0.4;
    }
    this.temp = t;
  };

  Graph.prototype.kick = function () {
    if (this._anim) return;
    this.temp = Math.min(this.worldW, this.worldH) * 0.025;
    var self = this;
    this._anim = true;
    function step() {
      self.relax(3);
      self.draw();
      if (self.temp > 0.5) {
        requestAnimationFrame(step);
      } else {
        self._anim = false;
      }
    }
    requestAnimationFrame(step);
  };

  /* ---------------- 视图变换 ---------------- */

  Graph.prototype.sx = function (n) { return n.x * this.view.k + this.view.x; };
  Graph.prototype.sy = function (n) { return n.y * this.view.k + this.view.y; };
  Graph.prototype.radius = function (n) { return Math.max(4, n.r * Math.min(this.view.k, 2.4)); };

  Graph.prototype.fitView = function () {
    var nodes = this.nodes;
    if (!nodes.length) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });
    var pad = 64;
    var bw = Math.max(maxX - minX, 1) + pad * 2;
    var bh = Math.max(maxY - minY, 1) + pad * 2;
    var k = Math.min(this.width / bw, this.height / bh);
    k = Math.max(0.22, Math.min(k, 1.9));
    this.view.k = k;
    this.view.x = this.width / 2 - ((minX + maxX) / 2) * k;
    this.view.y = this.height / 2 - ((minY + maxY) / 2) * k;
  };

  Graph.prototype.zoomAt = function (px, py, factor) {
    var k0 = this.view.k;
    var k1 = Math.max(0.18, Math.min(k0 * factor, 5));
    var ratio = k1 / k0;
    this.view.x = px - (px - this.view.x) * ratio;
    this.view.y = py - (py - this.view.y) * ratio;
    this.view.k = k1;
    this.draw();
  };

  Graph.prototype.localPoint = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  Graph.prototype.hitTest = function (px, py) {
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      var dx = this.sx(n) - px;
      var dy = this.sy(n) - py;
      var d = Math.sqrt(dx * dx + dy * dy);
      var r = this.radius(n) + 6;
      if (d <= r && d < bestD) { best = n; bestD = d; }
    }
    return best;
  };

  /* ---------------- 绘制 ---------------- */

  Graph.prototype.matches = function (n) {
    if (!this.query) return true;
    var hay = (n.label + ' ' + n.id + ' ' + (n.summary || '')).toLowerCase();
    return hay.indexOf(this.query) >= 0;
  };

  Graph.prototype.draw = function () {
    var ctx = this.ctx;
    var self = this;
    var P = this.palette;
    var k = this.view.k;
    var hover = this.hover;
    var near = hover ? this.adj[hover.id] || {} : null;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    /* 连线 */
    this.links.forEach(function (l) {
      var s = self.byId[l.source];
      var t = self.byId[l.target];
      if (!s || !t) return;
      var dim = (hover && l.source !== hover.id && l.target !== hover.id) ||
        (self.query && !(self.matches(s) && self.matches(t)));
      ctx.save();
      ctx.globalAlpha = dim ? 0.1 : (l.kind === 'tag' ? 0.32 : 0.55);
      ctx.strokeStyle = l.kind === 'tag' ? P.tag : P.note;
      ctx.lineWidth = l.kind === 'tag' ? 1 : Math.max(1, 1.5 * Math.min(k, 1.5));
      if (l.kind === 'tag') ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(self.sx(s), self.sy(s));
      ctx.lineTo(self.sx(t), self.sy(t));
      ctx.stroke();
      ctx.restore();
    });

    /* 节点 */
    var fontBase = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    var labelQueue = [];
    this.nodes.forEach(function (n) {
      var x = self.sx(n);
      var y = self.sy(n);
      var r = self.radius(n);
      var isHover = hover && hover.id === n.id;
      var isNear = hover && (isHover || near[n.id]);
      var alpha = hover ? (isNear ? 1 : 0.18) : 1;
      if (self.query) alpha *= (self.matches(n) ? 1 : 0.12);

      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.kind === 'tag' ? P.tag : P.note;
      ctx.fill();

      if (n.kind === 'tag') {
        ctx.lineWidth = 2;
        ctx.strokeStyle = P.bg;
        ctx.stroke();
      }
      if (isHover) {
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = P.fg;
        ctx.stroke();
      }
      /* 邻域模式：标出当前这篇笔记 */
      if (self.mode === 'focus' && n.id === self.focusId) {
        ctx.beginPath();
        ctx.arc(x, y, r + 6, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = P.fg;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();

      /* 被淡出的节点不参与排字，避免残影叠字 */
      if (alpha > 0.35) labelQueue.push({ n: n, x: x, y: y, r: r, a: alpha });
    });

    /* 标签：按重要度优先占位，压到别的标签或节点圆点上就不画（悬停用 tooltip 看全名） */
    var rank = function (n) {
      if (hover && hover.id === n.id) return 1000;
      if (self.mode === 'focus' && n.id === self.focusId) return 900;
      return (n.kind === 'tag' ? 100 : 0) + n.deg;
    };
    labelQueue.sort(function (p, q) { return rank(q.n) - rank(p.n); });

    /* 所有节点圆点都是障碍：文字压在别的节点上会显得整片糊 */
    var dots = this.nodes.map(function (n) {
      return { x: self.sx(n), y: self.sy(n), r: self.radius(n) + 3 };
    });
    var boxes = [];
    var W = this.width;
    var H = this.height;
    labelQueue.forEach(function (item) {
      var n = item.n;
      var label = n.label.length > 12 ? n.label.slice(0, 11) + '…' : n.label;
      ctx.font = (n.kind === 'tag' ? '600 ' : '') + fontBase;
      var tw = ctx.measureText(label).width;
      var th = 14;
      var tx = Math.min(Math.max(item.x, tw / 2 + 4), W - tw / 2 - 4);
      var ty = item.y + item.r + 5;
      if (ty + th > H - 2) ty = item.y - item.r - 5 - th;
      var x0 = tx - tw / 2 - 3;
      var x1 = tx + tw / 2 + 3;
      var y0 = ty - 2;
      var y1 = ty + th;
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        if (x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0) return;
      }
      /* 自身圆点允许贴着，其它圆点不许压 */
      for (var j = 0; j < dots.length; j++) {
        var c = dots[j];
        if (c.x === item.x && c.y === item.y) continue;
        var nx = Math.max(x0, Math.min(c.x, x1));
        var ny = Math.max(y0, Math.min(c.y, y1));
        if ((c.x - nx) * (c.x - nx) + (c.y - ny) * (c.y - ny) < c.r * c.r) return;
      }
      boxes.push({ x0: x0, y0: y0, x1: x1, y1: y1 });

      ctx.save();
      ctx.globalAlpha = item.a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3;
      ctx.strokeStyle = P.bg;
      ctx.strokeText(label, tx, ty);
      ctx.fillStyle = n.kind === 'tag' ? P.tag : P.fg;
      ctx.fillText(label, tx, ty);
      ctx.restore();
    });
  };

  /* ---------------- 交互 ---------------- */

  Graph.prototype.showTip = function (n, p) {
    if (!this.tip) return;
    if (!n) { this.tip.hidden = true; return; }
    this.tip.hidden = false;
    this.tip.innerHTML =
      '<strong>' + esc(n.label) + '</strong>' +
      '<em>' + (n.kind === 'tag' ? '标签' : '笔记') + ' · ' + n.deg + ' 连接</em>' +
      (n.summary ? '<span>' + esc(n.summary) + '</span>' : '');
    var tw = this.tip.offsetWidth;
    var th = this.tip.offsetHeight;
    var left = Math.max(6, Math.min(p.x - tw / 2, this.width - tw - 6));
    var top = p.y - th - 16;
    if (top < 6) top = p.y + 22;
    this.tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  };

  Graph.prototype.setQuery = function (q) {
    this.query = (q || '').trim().toLowerCase();
    this.draw();
  };

  Graph.prototype.bind = function () {
    var self = this;
    var cv = this.canvas;

    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId);
      self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (self.pointers.size === 2) {
        var pts = Array.from(self.pointers.values());
        self.pinch = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          k: self.view.k
        };
        self.drag = null;
        self.pan = null;
        self.down = null;
        return;
      }

      var p = self.localPoint(e);
      var hit = self.hitTest(p.x, p.y);
      self.down = { x: p.x, y: p.y, moved: 0, hit: hit };
      if (hit) {
        self.drag = hit;
        hit.fixed = true;
      } else {
        self.pan = { x: p.x, y: p.y, ox: self.view.x, oy: self.view.y };
      }
      cv.style.cursor = 'grabbing';
    });

    cv.addEventListener('pointermove', function (e) {
      if (self.pointers.has(e.pointerId)) {
        self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (self.pinch && self.pointers.size === 2) {
        var pts = Array.from(self.pointers.values());
        var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (self.pinch.dist > 4) {
          var rect = cv.getBoundingClientRect();
          var midX = (pts[0].x + pts[1].x) / 2 - rect.left;
          var midY = (pts[0].y + pts[1].y) / 2 - rect.top;
          self.view.k = self.pinch.k;
          self.zoomAt(midX, midY, dist / self.pinch.dist);
        }
        return;
      }

      var p = self.localPoint(e);
      if (self.down) {
        self.down.moved = Math.max(self.down.moved, Math.hypot(p.x - self.down.x, p.y - self.down.y));
      }

      if (self.drag) {
        self.drag.x = (p.x - self.view.x) / self.view.k;
        self.drag.y = (p.y - self.view.y) / self.view.k;
        self.kick();
        return;
      }
      if (self.pan) {
        self.view.x = self.pan.ox + (p.x - self.pan.x);
        self.view.y = self.pan.oy + (p.y - self.pan.y);
        self.draw();
        return;
      }

      var hit = self.hitTest(p.x, p.y);
      if (hit !== self.hover) {
        self.hover = hit;
        cv.style.cursor = hit ? 'pointer' : 'grab';
        self.draw();
      }
      self.showTip(hit, p);
    });

    cv.addEventListener('pointerup', function (e) {
      var url = (self.down && self.down.moved < 5 && self.down.hit) ? self.down.hit.url : '';
      self.pointers.delete(e.pointerId);
      if (self.pointers.size < 2) self.pinch = null;
      if (self.drag) { self.drag.fixed = false; self.drag = null; }
      self.pan = null;
      self.down = null;
      cv.style.cursor = 'grab';
      if (self.hover) self.showTip(self.hover, self.localPoint(e));
      else if (self.tip) self.tip.hidden = true;
      if (url) window.location.href = url;
    });

    cv.addEventListener('pointercancel', function (e) {
      if (self.drag) { self.drag.fixed = false; self.drag = null; }
      self.pan = null;
      self.down = null;
      self.pointers.delete(e.pointerId);
      self.pinch = null;
    });

    cv.addEventListener('pointerleave', function () {
      self.hover = null;
      if (self.tip) self.tip.hidden = true;
      self.draw();
    });

    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = self.localPoint(e);
      self.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0014));
    }, { passive: false });

    cv.addEventListener('dblclick', function () {
      self.fitView();
      self.draw();
    });

    var reset = this.root.querySelector('.kb-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        self.setQuery('');
        if (self.input) self.input.value = '';
        self.hover = null;
        if (self.tip) self.tip.hidden = true;
        self.kick();
        self.temp = Math.min(self.worldW, self.worldH) * 0.12;
        self.relax(320);
        self.fitView();
        self.draw();
      });
    }

    if (this.input) {
      this.input.addEventListener('input', function () {
        self.setQuery(self.input.value);
      });
      this.input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          self.input.value = '';
          self.setQuery('');
        }
      });
    }

    if (window.ResizeObserver) {
      var lastW = this.width;
      new ResizeObserver(function () {
        if (Math.abs(self.root.clientWidth - lastW) < 2) return;
        lastW = self.root.clientWidth;
        self.resize();
      }).observe(this.root);
    }
  };

  /* ---------------- 主题跟随 + 挂载 ---------------- */

  function watchTheme() {
    var mo = new MutationObserver(function () {
      graphs.forEach(function (g) {
        g.palette = palette();
        g.draw();
      });
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  }

  var graphs = [];

  function mountAll() {
    Array.prototype.forEach.call(document.querySelectorAll('.kb-graph'), function (el) {
      if (el.dataset.kbMounted) return;
      el.dataset.kbMounted = '1';
      var g = new Graph(el);
      graphs.push(g);
      g.boot();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      mountAll();
      watchTheme();
    });
  } else {
    mountAll();
    watchTheme();
  }

  window.KBGraph = { mountAll: mountAll, palette: palette };
})();
