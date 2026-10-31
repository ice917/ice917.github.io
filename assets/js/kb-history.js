/* ---------------------------------------------------------------- 阅读历史
 *
 * 记录「我点开过哪些页面」，全部存在浏览器本地 localStorage 里：
 *   key = kb-history，值是数组，元素形如
 *   { url: "/notes/murray-law/", title: "Murray 定律", section: "notes", ts: 1792917486000, count: 3 }
 *
 * - 同一页重复访问只更新时间与次数，不重复插入
 * - 跳过 /history/ 与 /search/，避免自己记录自己
 * - 上限 200 条，超出按时间裁掉最旧的
 * - 在任何页面都会「写」；只有存在 #kb-history-list 的页面（/history/）才「读」并渲染
 */
(function () {
    "use strict";

    var KEY = "kb-history";
    var MAX = 200;
    var SKIP = ["/history/", "/search/"];

    /* 板块代码 → 中文名，未登记的直接显示原始段落名 */
    var SECTION_NAMES = {
        notes: "笔记",
        "spatial-mcp": "可验证支架",
        tags: "标签",
        archives: "归档",
        search: "搜索",
        about: "关于",
        posts: "文章"
    };

    function load() {
        try {
            var raw = localStorage.getItem(KEY);
            var arr = raw ? JSON.parse(raw) : [];
            return Object.prototype.toString.call(arr) === "[object Array]" ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function save(arr) {
        try {
            localStorage.setItem(KEY, JSON.stringify(arr));
        } catch (e) {
            /* 隐私模式或配额满：静默放弃，不影响页面本身 */
        }
    }

    /* 统一成 "/a/b/" 形式，去掉查询串与锚点，避免 /a 与 /a/ 记成两条 */
    function normalize(path) {
        var p = String(path || "/").split("?")[0].split("#")[0];
        if (!/\/$/.test(p)) p += "/";
        return p;
    }

    function sectionOf(path) {
        var m = path.match(/^\/([^\/]+)\//);
        return m ? m[1] : "";
    }

    /* PaperMod 的 <title> 是「页面标题 | 站点标题」，去掉后面的站点名 */
    function pageTitle() {
        var t = document.title || "";
        var i = t.lastIndexOf(" | ");
        return (i > 0 ? t.slice(0, i) : t).trim();
    }

    function record() {
        var path = normalize(location.pathname);
        for (var i = 0; i < SKIP.length; i++) {
            if (path === SKIP[i]) return;
        }

        var arr = load();
        var ts = Date.now();
        var title = pageTitle();
        var hit = null;

        for (var j = 0; j < arr.length; j++) {
            if (arr[j] && arr[j].url === path) {
                hit = arr[j];
                break;
            }
        }

        if (hit) {
            hit.ts = ts;
            hit.count = (hit.count || 1) + 1;
            if (title) hit.title = title;
        } else {
            arr.push({
                url: path,
                title: title || path,
                section: sectionOf(path),
                ts: ts,
                count: 1
            });
        }

        arr.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
        save(arr.slice(0, MAX));
    }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
    }

    function pad(n) {
        return n < 10 ? "0" + n : "" + n;
    }

    function formatTime(ts) {
        var d = new Date(ts);
        if (isNaN(d.getTime())) return "";
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
            " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    function render() {
        var box = document.getElementById("kb-history-list");
        if (!box) return;

        var summary = document.getElementById("kb-history-summary");
        var arr = load();

        if (!arr.length) {
            box.innerHTML = '<p class="kb-history-empty">还没有记录。随便点开几个页面，再回到这里就能看到。</p>';
            if (summary) summary.textContent = "";
            return;
        }

        /* 按板块统计：这就是「我点开过哪几块板块」的汇总 */
        var counts = {};
        var order = [];
        var total = 0;
        for (var i = 0; i < arr.length; i++) {
            var s = arr[i].section || "其他";
            if (!counts[s]) { counts[s] = 0; order.push(s); }
            counts[s] += arr[i].count || 1;
            total += arr[i].count || 1;
        }
        order.sort(function (a, b) { return counts[b] - counts[a]; });

        if (summary) {
            var chips = order.map(function (s) {
                var name = SECTION_NAMES[s] || s;
                return '<span class="kb-history-chip">' + esc(name) + " · " + counts[s] + "</span>";
            }).join("");
            summary.innerHTML = '<span class="kb-history-chip kb-history-chip--total">共 ' + total +
                " 次访问 / " + arr.length + " 个页面</span>" + chips;
        }

        var html = ['<ol class="kb-history-items">'];
        for (var j = 0; j < arr.length; j++) {
            var e = arr[j];
            var sec = SECTION_NAMES[e.section] || e.section || "其他";
            var times = e.count > 1 ? '<span class="kb-history-times">×' + e.count + "</span>" : "";
            html.push(
                '<li class="kb-history-item">' +
                '<a href="' + esc(e.url) + '">' + esc(e.title || e.url) + "</a>" +
                '<span class="kb-history-meta">' +
                '<span class="kb-history-section">' + esc(sec) + "</span>" +
                '<time datetime="' + new Date(e.ts).toISOString() + '">' + esc(formatTime(e.ts)) + "</time>" +
                times +
                "</span>" +
                "</li>"
            );
        }
        html.push("</ol>");
        box.innerHTML = html.join("");
    }

    function bindClear() {
        var btn = document.getElementById("kb-history-clear");
        if (!btn) return;
        btn.addEventListener("click", function () {
            if (!window.confirm("清空全部本地阅读记录？此操作不可撤销。")) return;
            try {
                localStorage.removeItem(KEY);
            } catch (e) { /* 忽略 */ }
            render();
        });
    }

    function init() {
        record();
        render();
        bindClear();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
