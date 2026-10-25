---
title: "STL 与可制造性：closed 不等于 manifold"
date: 2026-10-25
draft: false
tags: ["工程", "验证"]
description: "19152 个三角形、边界边 0、却仍有 228 条非流形边。这两个结论不矛盾。"
---

## 几何是怎么拼的

`export_stl`（`mesh.py` L80–102）对**每条边导一个圆柱**，两端都在同一个 z 平面上：

```python
a = np.array([px * pitch_mm, py * pitch_mm, height / 2.0])
b = np.array([cx * pitch_mm, cy * pitch_mm, height / 2.0])
tris_all.extend(cylinder_tris(a, b, rp, rc, n=n_sides))
```

这不是布尔并集，是**一堆互相穿插的圆柱直接写进同一个 STL**。理解这一点，后面所有「奇怪」的数字都顺了：

- 每条边独立成管，分叉处靠几何重叠「连上」，不是拓扑焊接；
- 端盖共面（z = height/2 = 2.5），因为父端和子端在同一个平面上，注释 L94–97 说明这是修过的：早先父端在 z=0、子端在 z=height，两端端盖相距 4.23 mm，STL 根本不是连通的管道（`DEFECT_REMEDIATION_PLAN.md` §10.20）。

## 法向为什么要整体翻转

`cylinder_tris` 末尾（L70–77）有一次全局反向：

```python
return [(c, b, a) for a, b, c in tris]
```

注释给了实测依据：按原绕序构建的 r=0.5、h=1 的 12 边形圆柱，有符号体积是 **−0.75 mm³**（12 边形面积 0.75 × 高 1），也就是每个面的法向都指向实体内部。所以统一翻一次，而不是逐个面判断。

这是个好习惯：**先测一个有符号量，再决定翻不翻**。凭「看起来对不对」改绕序，会把一半面改错。

## 三角形数可以手算对账

每条边：12 个侧面四边形 = 24 个三角形，加两端各 12 个扇形 = 24 个三角形，共 **48** 个。

399 条边 × 48 = **19152**，与 `run_report.json` 的 `stl.triangles = 19152` 完全一致。这条对账说明导出循环既没漏边也没重复。

## 三级检查

`stl_manifold_report`（L121–168）的 docstring 把三级写得很清楚：

1. **闭合（closure）**：每条有向边 `(a,b)` 的出现次数与 `(b,a)` 相同 ⇒ `boundary_edges = 0`。
2. **流形（manifoldness）**：每条边恰好被 2 个三角形共享（各一次方向）。
3. **退化三角形**：三个顶点重合的被跳过。

## 实测

| 字段 | 值 | 含义 |
| --- | ---: | --- |
| `triangles` | 19152 | 与手算一致 |
| `unique_directed_edges` | 40948 | 去重后的有向边 |
| `edges_paired_once` | 24676 | 正常配对的边 |
| `junction_edges_shared_twice` | 16044 | 被 4 个三角形共享的分叉边 |
| `unpaired_edges` | 228 | 既不 1-1 也不 2-2 |
| `boundary_edges` | 0 | 没有开口 |
| `closed` | **true** | 体积可以封闭 |
| `nonmanifold_edges` | 228 | 被 ≥3 个三角形共享 |
| `is_manifold` | **false** | 不满足严格流形 |

`closed = true` 与 `is_manifold = false` **可以同时成立**：前者只要求每条边正反成对（没有边界），后者要求每条边恰好两个面。多个圆柱在分叉处共用一个端盖圆心，端盖扇形会和别的圆柱的侧面共享同一条边，于是出现 3–4 个面共边——闭合被破坏不了，但流形性被破坏了。这是 docstring 里点名的情形：「Coincident end caps at a multi-way node make some edges span 3 or 4 triangles」。

## bbox 里藏着一个半径

`stl.bbox_mm.size_mm = [19.8, 19.8, 3.936]`，`height_mm = 5.0`，`pitch_mm = 0.9`。

z 方向跨度 4.4682 − 0.5318 = **3.936**，而 `height/2 = 2.5`，所以上下各多出 `2.5 − 0.5318 = 1.9682`。**1.9682 就是根半径 `r_max`**，与 `murray.profile.max` 完全一致。

推论：垂直方向勉强装得下（1.9682 < 2.5），水平方向装不下——格距只有 0.9 mm，而管径 2 × 1.9682 = 3.936 mm。相邻根段在板上必然重叠，这就是约束 C2 的几何含义，见 [Murray 定律](/notes/murray-law/)。

## 得到的判断

- STL **可以**用来做流道概念示意、体渲染、粗略 3D 打印外形；
- STL **不能**直接当作可制造模型：228 条非流形边 + 根段重叠，切片前必须先做布尔并集与半径约束重解；
- `pitch_mm` 传进来的是 0.9（`heat_tree.py` L159 `C.paper_grid_mm(grid)`），而 `export_stl` 的默认值是 1.0——**默认值千万别依赖**。见 [FM-1 尺度混用](/notes/fm-1-scale/)。
