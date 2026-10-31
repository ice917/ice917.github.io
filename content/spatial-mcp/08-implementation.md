---
title: "8. 实现：4300 行代码在做什么"
date: 2026-10-31
draft: false
tags: ["工程实现", "MCP", "架构", "函数设计"]
description: "三层架构、一次断言的完整数据流、七个几何模块与九个工具层的逐函数职责表，以及六个决定成败的实现细节。"
---

第 4 章讲了"为什么是 SVG 和 MCP"，但没讲代码长什么样。这一章补上：**4300 行 Python，按函数拆开，每个函数负责什么。**

## 8.1 三层，边界很硬

```
┌─────────────────────────────────────────────┐
│  接口层                                      │
│  server.py (219)   9 个 @server.tool        │  ← MCP 协议
│  cli.py    (366)   6 个子命令                │  ← 命令行
└──────────────────┬──────────────────────────┘
                   │ 两个入口共用同一批 run_* 函数
┌──────────────────▼──────────────────────────┐
│  工具层 tools/                               │
│  9 个 run_xxx()，只做"调用 + 转 Pydantic"    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  几何内核 geometry/                          │
│  7 个模块，纯函数，输入 SVG 文本，输出数据类  │
└─────────────────────────────────────────────┘
```

| 层 | 文件 | 行数 | 依赖 MCP 吗 |
| --- | --- | --- | --- |
| 接口 | `server.py` / `cli.py` | 219 / 366 | 是 / 否 |
| 工具 | `tools/*.py`（9 个） | 596 | 否 |
| 内核 | `geometry/*.py`（7 个） | 2853 | 否 |
| 契约 | `schema/models.py` | 184 | 否 |

**内核完全不认识 MCP**。这是刻意的：几何判定可以被单元测试直接调用，不需要起服务、不需要协议、不需要 AI。

`tools/` 层薄得出奇——最薄的 `lint_svg.py` 只有 14 行，`score_reward.py` 16 行。它们存在的唯一理由是**把 dataclass 转成 Pydantic 模型**，让 MCP 能序列化。逻辑一行都不放这里。

## 8.2 一次断言的完整路径

以 `assert_relations('#cup1 在 #cup2 左边')` 为例，从文本到结果经过 8 步：

```
SVG 文本
  │  parser._strip_hidden()     剔除 defs/clipPath/filter 里的非绘制元素
  │  svgelements 解析            transform 在此被 reify 展平
  │  _tag_of() / _element_id()  归一化标签与 id
  │  _estimate_text_bbox()      文本用字体度量估算（±20%）
  ▼
GeometryModel{elements, groups, canvas, warnings}
  │  parser.resolve_selector()  '#cup1' → ElementInfo（或合成组）
  ▼
ElementInfo{bbox, anchors, endpoints, path_points, kind}
  │  relations.evaluate_assertion()  按 constraint 分派到三族之一
  ▼
AssertionResult{status, deviation_px, hint, detail, unit}
  │  tools.assert_relations.run_*()   转 Pydantic + 按 unit 分组
  ▼
AssertRelationsResult{results, pass_count, unit_groups}
```

两种失败在这里已经分开了：**`AssertionSpecError`（写错了）** 和 **`status="fail"`（画错了）**。前者抛异常，后者返回值——混在一起就分不清"工具不会"和"模型画错"。

## 8.3 几何内核：七个模块

### parser.py（618 行）——把 SVG 变成可计算的对象

| 函数 / 类 | 职责 |
| --- | --- |
| `SvgParseError` | 解析失败的专用异常，与几何失败区分 |
| `Canvas` | 画布矩形（x/y/w/h），来自 viewBox 或 width/height |
| `visible_fraction(bbox, canvas)` | **单个函数的复用**：元素与画布求交后的面积占比。R18 和 canvas_fit 共用它，保证两处口径一致 |
| `ElementInfo` | 元素的一个快照：bbox、四角锚点、真实端点、路径采样点、`kind`（element/group）、`member_indices` |
| `GeometryModel` | 全文档模型：`elements` + `groups`（组→成员序号）+ `canvas` + `warnings` + `source_text` |
| `_float(value)` | 容错数值解析（`"12px"` / `"1e3"` / 空串） |
| `_element_id(el)` / `_tag_of(el)` | 归一化 id 与标签，处理命名空间前缀 `svg:rect` |
| `_strip_hidden(svg_text)` | **按标签剥离** `<defs>` `<clipPath>` `<filter>` `<mask>` `<linearGradient>` 等容器内容，返回清洗后文本 + 被忽略项 |
| `_endpoints_of(el)` | 取 line/polyline/polygon/path 的**真实首尾点**，用于连线判定 |
| `_path_points_of(el, per_seg=6)` | 路径按段采样成折线点列，供 `on_path` / `points_toward` 用 |
| `_trajectory_closed(el, tag)` | 判断轨迹是否闭合——闭合路径做 `points_toward` 无意义，直接拒绝 |
| `_estimate_text_bbox(el)` | 文本 bbox 估算（字体度量拿不到时按字符宽度经验值），并写入 warning |
| `_group_members(svg_text)` | **用 lxml 重建祖先链**，把每个 `<g id>` 映射到成员序号（svgelements 的 `el.parent` 全是 None，走不通） |
| `_GROUP_SCAN_TAGS` | 必须与 `rasterize._DRAWABLE_TAGS` 严格一致，测试里锁死 |
| `resolve_selector(sel, model)` | 三种语法：`#id` / `tag[n]` / `n`；`#id` 命中元素优先，其次合成组；**id 有歧义直接抛错** |
| `_resolve_group(gid, model)` | 合成 `kind="group"` 的假元素：bbox 取成员并集，不下蛋到 `elements`（否则序号全乱） |
| `parse_geometry(svg_text)` | 总入口，串起上面所有步骤，返回 `GeometryModel` |

**为什么这个文件最长**：SVG 有六套坐标系（viewport / viewBox / 用户单位 / 物理单位 / 百分比 / transform 矩阵），`transform` 还要逐层累乘。这些都在这里被压平成一套用户单位，后面所有模块才能只面对 bbox。

### relations.py（869 行）——20 条约束的求值器

| 符号 | 职责 |
| --- | --- |
| `CONSTRAINTS` | 约束注册表：`{名称: (arity, 单位族)}`，arity ∈ `pair/single/list` |
| `QUANTIFIERS` | 四种量词：`all_pairs`（C(n,2)）/ `consecutive`（n-1）/ `all_equal`（以首个为基准）/ `all`（逐个） |
| `MASK_CONSTRAINTS` | 掩膜族的**默认容差**（ratio，如 0.01），与 px 族分开 |
| `PATH_CONSTRAINTS` | `on_path` / `points_toward`，要求元素有采样点 |
| `AssertionResult` | 单条判定：`status` / `deviation_px` / `hint` / `detail` / `unit` |
| `AssertionSpecError` | 契约写错（未知约束、缺参数、量词误用）——与几何失败严格分开 |
| `_label(info)` | 把元素渲染成可读标签（`rect[3](#c)` 或 `g(#hand)`），hint 里用 |
| `_require_bbox(info)` | 取 bbox 或抛出可自纠错误（"该元素没有可用 bbox"） |
| `_ok()` / `_fail()` | 构造通过/失败结果，统一填单位与 detail |
| `evaluate_assertion(model, spec)` | **分派中心**：量词 → 配对 → 掩膜族 → 按 arity 走 single/list/pair |
| `_quantified_pairs(selectors, quantifier)` | 把元素列表展开成对/单元素组合 |
| `_quantified_result(...)` | 把 N 条判定**聚合回一条**（保留最差偏差 + 前 8 条明细） |
| `_eval_zip(model, constraint, spec, tol)` | 逐位配对：`a_elements[i]` vs `b_elements[i]`，长度必须相等 |
| `_eval_quantified(...)` | 量词入口：展开 → 递归判定 → 聚合；拒绝 `all` 用在 pair 类、拒绝给 `equidistant` 加量词 |
| `evaluate_assertions(model, specs)` | 批量入口，一条一个结果，互不影响（单条规格错只失败该条） |
| `_mask_of(model, info, at_ms)` | 取掩膜：普通元素走 `element_mask`，组走 `group_mask` |
| `_eval_mask(...)` | 掩膜族五种：`mask_overlap` / `mask_non_overlap` / `mask_contains` / `mask_coverage` / `mask_non_degenerate` |
| `_eval_inside_canvas(...)` | 画布内判定，用 `visible_fraction` 而非 bbox 包含 |
| `_point_segment_distance(p, s, e)` | 点到线段距离——**不是点到直线**，否则轨迹判定会假通过 |
| `distance_to_polyline(p, pts)` | 点到折线最短距离，`on_path` 的核心 |
| `_require_trajectory(info, role)` | 检查元素是否可当轨迹（有采样点、未闭合） |
| `_eval_path(...)` | `on_path`：点到折线距离 ≤ tol；`points_toward`：末端是否朝向目标 |
| `_eval_pair(...)` | 13 条 bbox 族约束的实际比较逻辑 |
| `_eval_equidistant(...)` | 多元素等距：按坐标排序后比较相邻间距 |

**两个设计要点**：

1. **单位强制分组**。`deviation_px` 和 `deviation_ratio` 永不混算——`tools` 层按 `unit` 分组输出，跨组不可排序、不可平均。
2. **量词与配对聚合回一条**。因为 `contract.py` 是按"断言组通过率"折入维度的，展开成 N 条会**改变所有既有契约的分数**。这是向后兼容的硬约束。

### rasterize.py（394 行）——真实像素的隔离渲染

| 符号 | 职责 |
| --- | --- |
| `MASK_WIDTH = 512` | 掩膜统一栅格宽度，让 N 次渲染的成本可控 |
| `ALPHA_THRESHOLD = 128` | alpha > 128 才算"画出来了" |
| `_DRAWABLE_TAGS` | 8 种可绘制标签，与 parser 的组扫描标签锁死一致 |
| `_CHROME_CANDIDATES` | 浏览器候选路径（系统 Chrome / Edge） |
| `find_browser()` | 定位可用的 headless 浏览器 |
| `_svg_size` / `raster_scale` | 算 SVG 用户单位 → 像素的缩放比，保证所有掩膜同一栅格 |
| `_render_cairosvg` | 快，但 filter/mask 支持有限 |
| `_render_browser` | 用 `--virtual-time-budget` 控 SMIL 时刻，支持 `at_ms` |
| `render_png_auto(..., backend)` | **后端选择**：`auto` 走回退链；指定后不回退（要精确输出就不能静默降级） |
| `_MASK_CSS` | **隔离渲染的关键**：全局 `visibility:hidden`，只让带 `data-spm-target` 的节点及其子孙可见 |
| `_enumerate_drawable(svg_text)` | 用 lxml 按文档序取可绘制节点，返回 (root, nodes) |
| `_mask_cache_key` | blake2b 哈希（SVG + 序号 + 宽度 + 时刻），避免重复渲染 |
| `_binarise(png)` | PNG → 单通道二值图（PIL，不引入 numpy） |
| `element_mask(svg_text, index, ...)` | 单元素掩膜：打标记 → 注入 CSS → 渲染 → 二值化，带缓存 |
| `group_mask(svg_text, members, ...)` | 组掩膜：给 N 个成员同时打标记，CSS 自动让它们可见 |
| `mask_area` / `mask_intersection_area` / `mask_union_area` | 掩膜算术，纯 PIL 实现 |

**这个模块的巧劲**：`_MASK_CSS` 第三行 `[data-spm-target] *{visibility:visible}` 意味着"标记容器 → 容器内全部可见"。所以组掩膜**不需要重建 SVG**，只要给多个兄弟节点打标记即可。这是组支持能落地的技术前提。

### contract.py（386 行）——六维评分

| 函数 / 类 | 职责 |
| --- | --- |
| `_anchor_grade(err, tol)` | 锚点分级：容差内 1.0，线性衰减到 4× 容差处为 0 |
| `DimScore` | 单维结果：`score` / `failures` / **`specified`**（契约是否真的约束了这一维） |
| `ContractReport` | 总分 + 六维 + 断言结果 + warnings |
| `_render_check(svg_text)` | render_validity 的实现：能否解析并渲染 |
| `_point_near_bbox(point, bbox, tol)` | 端点是否落在目标框附近（连通性判定） |
| `score_contract(svg, contract, unspecified_dims)` | 总入口：六维各自算原生分 → 断言组通过率折入 → 按 `exclude/zero/neutral` 合成总分 |

**`specified` 是这套评分的关键字段**。没有它，"契约没提这个维度"会被读成"这个维度满分"——这正是项目早期最严重的缺陷（无关 rect 也能拿 0.74）。

### lint.py（346 行）——21 条规则

| 符号 | 职责 |
| --- | --- |
| `LintItem` | 单条规则结果：`rule` / `status`(pass/warn/fail) / `detail` / `line` |
| `LintReport` | `score`（pass 数 / 总数）+ 全部条目 |
| `lint_svg(svg_text, model=None)` | 21 条规则一次跑完；可复用已解析的 model 避免重复解析 |

规则分三类：**结构类**（id 唯一、引用存在、含 NaN）、**几何类**（元素出画、部分出血）、**风格类**（内联样式、禁用色）。

`R18_within_canvas` 的语义是这套规则里最讲究的一条：`可见占比 == 0` 才 fail（永久不可见），`0 < 占比 < 1` 只 warn（出血是设计）。

### validate.py（139 行）——XML 级校验

| 函数 / 类 | 职责 |
| --- | --- |
| `_NUMERIC_ATTRS` | 需要检查数值有限性的属性白名单 |
| `_URL_REF_RE` / `_HREF_REF_RE` | `url(#id)` 与 `#id` 引用提取，用于查"引用了不存在的 id" |
| `_LENGTH_RE` | 长度值解析（含单位） |
| `parse_length(token)` | 单个长度 token → 数值 |
| `ValidationReport` | `ok` + `errors` + `warnings`（都带行号） |
| `validate_svg(svg_text)` | 语法、根元素、数值属性、id 引用、style 声明 |

### render.py（101 行）——渲染与差异

| 函数 | 职责 |
| --- | --- |
| `render_png(...)` / `render_png_with_backend(...)` | 后者额外返回**实际使用的后端** |
| `render_risk_notes(svg, backend)` | 检测 `filter/mask/clipPath/pattern/marker`，落到 cairosvg 时给近似风险提示 |
| `render_backend(...)` | 只问"会用哪个后端"，不渲染 |
| `png_size` | 读 PNG 头拿宽高 |
| `diff_png(a, b)` | 逐像素比较，返回差异占比 + 变化像素数 |

## 8.4 工具层：九个薄封装

| 工具 | 入口函数 | 行数 | 做什么 |
| --- | --- | --- | --- |
| `get_geometry` | `run_get_geometry` | 60 | 解析 → 元素 + **组**清单（组成员、并集 bbox） |
| `assert_relations` | `run_assert_relations` | 47 | 批量断言 → 结果 + **按单位分组** |
| `suggest_assertions` | `run_suggest_assertions` | 362 | 从几何反推候选断言，标出 `divergence_risk` |
| `check_layout_contract` | `run_check_layout_contract` | 23 | 六维评分 + 断言结果 |
| `score_reward` | `run_score_reward` | 16 | 标量 reward + 分项 + 失败清单 |
| `validate_svg` | `run_validate_svg` | 15 | 转 Pydantic |
| `lint_svg` | `run_lint_svg` | 14 | 转 Pydantic |
| `render_svg` | `run_render_svg` | 26 | 渲染 + 后端标注 + 风险提示 |
| `diff_render` | `run_diff_render` | 33 | 两版对比 + 差异图 |

唯一"重"的是 `suggest_assertions`（362 行），因为它是**唯一不做裁决的工具**——要从几何反推"你可能想断言什么"，得算近邻、近似对齐、开方向、画布边距等一堆启发式，还要用 `_paint_problems` 识别"声明了但没画出来"的空壳元素。

## 8.5 两个入口，一套引擎

```python
# server.py
@server.tool()
@_as_tool_error
def assert_relations(svg: str, assertions: list[dict]) -> AssertRelationsResult:
    return run_assert_relations(svg, assertions)

# cli.py
def cmd_assert(args) -> dict:
    res = run_assert_relations(svg, assertions)
    ...
```

`_as_tool_error` 是 MCP 侧的装饰器：把内核异常翻成协议的 `isError` + 可自纠消息。

CLI 侧不共享这个装饰器，而是自己处理退出码：

| 退出码 | 含义 |
| --- | --- |
| 0 | 通过（或非 `--strict` 下有问题） |
| 1 | `--strict` 且有失败 |
| 2 | 参数 / 文件错误 |
| 3 | `--strict` 且有未 ack 的阻断级 warning |

**两个入口共用 `run_*`，所以永远不会漂移**——这是分层带来的最直接好处。

## 8.6 六个决定成败的实现细节

**1. `transform` 必须展平，否则一切归零。**
`svgelements` 的 `reify()` 把变换矩阵乘进几何，之后所有 bbox 都是用户坐标系。不展平的话，一个 `translate(100,100)` 就能让全部断言错位。

**2. 组的祖先链要走 lxml。**
`svgelements` 的 `el.parent` 恒为 `None`——实测确认。所以 `_group_members` 用 lxml 的 `getparent()` 重建，并按文档序给可绘制元素编号。**两套解析器的元素顺序必须一致**，否则组掩膜会绑错节点，因此有一个测试专门锁 `_GROUP_SCAN_TAGS == _DRAWABLE_TAGS`。

**3. 掩膜用 CSS 隔离，不重建 SVG。**
`visibility:hidden` + `[data-spm-target]` 标记，比"复制一份只留目标元素"可靠得多——后者会破坏 `id` 引用、`clipPath` 和渐变定义。

**4. id 有歧义必须报错。**
早期实现是"取第一个匹配"，结果是重复 id 时静默绑错对象。现在是：命中的元素数 + 同名组数 > 1 就抛 `SelectorError`，并列出冲突对象。**歧义即错误，不替调用方猜。**

**5. 物理单位 + viewBox 会静默错 3.78 倍。**
`width="100mm"` 时 svgelements 把元素坐标换算成 CSS px，而画布仍按 viewBox 单位度量。实测 `width="10"` 的矩形落到 `37.8`。现在检测到就发 warning，并在 CLI 里列为**阻断级**（需 ack 才能过门禁）。

**6. 后端指定后不回退。**
`backend="cairosvg"` 失败就报错，不偷偷换成浏览器——因为"要精确渲染却拿到近似结果"比失败更糟。反过来 `auto` 仍保留回退链，保证可用性。

## 8.7 测试策略

171 个用例，12 个文件，不按"一个函数一个测试"组织，而是按**失败模式**组织：

| 文件 | 覆盖的失败模式 |
| --- | --- |
| `test_parser.py` | 坐标系、transform、文本估算、隐藏元素剔除 |
| `test_relations.py` | 20 条约束 + 量词 + 逐位配对 + 误用拒绝 |
| `test_group.py` | 组选择器、组掩膜、嵌套组、**标签一致性锁** |
| `test_contract.py` | 六维、三口径、`specified` 语义 |
| `test_masks.py` | 五种掩膜约束的真实像素行为 |
| `test_dirty_data.py` | 歧义 id、单位混用、警告透传 |
| `test_cli.py` | 退出码语义、preset、ack gate |
| `test_render_backend.py` | 后端选择、不回退 |

有一条贯穿所有测试的原则：**断言"错误输入会显式失败"，而不只是"正确输入会通过"**。

## 8.8 复现

```powershell
cd d:/解释token/vidio/svg-spatial-mcp
conda run -n svg-mcp python -m pytest -q          # 171 passed
svgcheck check out.svg --preset illustration      # 日常检查
svgcheck --strict check out.svg --preset infographic   # 门禁
```

## 一句话结论

**几何内核 2853 行做判定，工具层 596 行做转换，接口层 585 行做交付。**
三层的边界是"谁能改"而不是"谁好看"：内核可被独立测试，工具层可被任意接口复用，接口层可以换（MCP → CLI → 将来的别的），判定逻辑一行都不用动。
