---
title: "两把尺子：PITCH_MM=1.0 与 grid_mm=0.9"
date: 2026-10-25
draft: false
tags: ["陷阱", "数值方法"]
description: "项目里故意同时存在两个格距。合并它们是错的，混用它们更错。"
---

## 两个数

| 常数 | 值 | 位置 | 身份 |
| --- | ---: | --- | --- |
| `field.PITCH_MM` | 1.0 | `field.py` L21 | 无量纲求解器的**定义常数**（五点差分里的 `h`） |
| `calibrate.paper_grid_mm(grid)` | 45 / 50 = 0.9 | `calibrate.py` L225–255 | 把无量纲板子**映射**到 45 mm 封装的参数 |

这两个数长得像同一件事，其实不是。前者决定了整个历史数据集的坐标系；后者决定了「一格等于多少毫米」。改前者，项目里所有既有数字都会漂移；改后者，只是换了一把量尺。

## 为什么不能统一

「单一事实源」是好习惯，但在这里是**错的**。`paper_grid_mm` 的 docstring（L232–240）明确写着：

> Two pitches coexist BY DESIGN and must NOT be unified (the naive "single source of truth" fix would be wrong).

原因是它们在两个不同的抽象层：一个是方程本身的离散尺度，一个是封装尺寸的映射系数。硬合并只会把「哪一层」这个问题藏起来。

## 混用一次的代价

P0b v3 就栽在这里：脚本自带 `PITCH_MM = 1.0`，而 `calibrate` 用 `grid_mm = 0.9`。10% 的格距差，经 `r⁴` 放大成：

- 单段流阻 **+52%**
- 总压降 **16 倍**

（数字出自 `calibrate.py` L227–230 的注释，它也标注了 `DEFECT_REMEDIATION_PLAN.md §10.9`。）

`r⁻⁴` 的放大是这段代码里最容易低估的地方：格距差 11.1%（0.9→1.0），四次方就是 1.52 倍。这类误差不会报错，只会让结论悄悄变成另一个数。

## 现在怎么防

1. **唯一入口。** 所有真实单位几何必须调用 `paper_grid_mm(grid)`，它从 `PACKAGE_MM` 反推，不重复书写 0.9。
2. **自洽断言。** `paper_grid_mm` 内部 `assert abs(i7_14700k(grid).grid_mm - grid_mm) < 1e-12`——两个门必须给同一个数（L253–254）。
3. **拒绝歧义。** `tree_dp_pa` 里：

```python
if abs(grid_mm - PITCH_MM) < 1e-12:
    raise ValueError("tree_dp_pa: grid_mm equals field.PITCH_MM. ...")
```

（L452–457）传 1.0 进来直接抛异常，而不是算出一个错的帕斯卡。

## 学到的通用规则

> 同一个物理量在两个抽象层各有一个常数时，正确的做法不是合并，而是**给每个常数起一个说明它属于哪一层的名字**，并在边界处强制转换。

见 [FM-1 尺度混用](/notes/fm-1-scale/) 看这个错误在别处怎么重演，以及 [FM-2 压降口径](/notes/fm-2-dp/) 看它如何与「口径」问题叠加。
