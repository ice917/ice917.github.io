---
title: "FM-4 守恒记账：节点只算一次，边不是节点"
date: 2026-10-25
draft: false
tags: ["失效模式", "验证"]
description: "把分叉点按边数重复计算，会把「651 mm² 的材料」算成 573 条通道。账本错了，比较就没了。"
---

## 形态

能量、质量、材料这类**可加量**，一旦在离散结构上重复计数或漏计，所有下游结论都会偏，而且偏得很「合理」——数字看起来不荒谬，只是不对。

图结构上有两类对象：**节点**（格点/分叉点）和**边**（管段）。每次做汇总前必须明确：这个量是按节点守恒，还是按边守恒？

## 实例一：需求流量不能加自己的 1

`radius.py` 的 `node_flows`（L37–49）：

```python
flow = {i: 1 for i in nodes}
for v in sorted(nodes, key=lambda i: -depth[i]):
    ch = children.get(v)
    if ch:
        flow[v] = sum(flow[c] for c in ch)
```

内部节点 = **子节点之和**，不加它自己。docstring 特意写了「its own demand is not added again」。

如果按「每个节点都有需求」的直觉写成 `1 + sum(...)`：

- 根的下游需求会变成 `叶数 + 内部节点数`，而不是叶数；
- `r_root = r0 · N^(1/3)` 直接偏大；
- 更糟的是，`check_murray` 仍然会通过——因为半径和检验用的是同一个 `flow`，恒等式照样成立。见 [FM-7 框架盲区](/notes/fm-7-blindspot/)。

所以这个错**没有任何检查能抓住**，只能靠读懂那行注释。

## 实例二：材料面积按节点算，不按边算

`verify.tree_material_mm2`（L211–224）：

```python
for p, c in edges:
    for node, other in ((p, c), (c, p)):
        r = max(radii[node], radii[other])
        r_at[node] = max(r_at.get(node, 0.0), r)
return float(sum(np.pi * r ** 2 for r in r_at.values()))
```

每个节点算一次，半径取「自己」和「相邻段最大」的较大者。docstring 记录了错误版本的后果：

> Summing per-edge areas double-counts junctions and is what produced an unbuildable control group (573 channels in a 2500-cell plate).

按边求和会把每个分叉点算 k 次（k = 度数），材料面积虚高，于是「等材料」的直通道组被要求塞进 573 条通道——2500 格的板子放不下。**账本错了一步，结论从「可行」变成「荒谬」，但程序不报错。**

## 实例三：源功率在两种尺度下要相等

`field.py` L23–37 的两个源：

- 289 格 × 108 W/cm²
- 25 格 × 1249 W/cm²

`289 / 25 = 11.56`，`1249 / 108 = 11.56`——总功率相同，密度不同。这是**故意**的两种口径，而不是两个不同的实验。若把 25 格的密度直接套到 289 格上，总功率会放大 11.56 倍。见 [热源饱和](/notes/source-saturation/)。

## 实例四：3D 里的幽灵格

`conjugate_3d_flow.py` 的 docstring（L57–68）记了一次真实的记账失败：

> `field.solve_heat_3d` closes the four sides with MIRROR copies ... rows and columns 0 and grid-1 are ghosts: no equation is ever solved for them and their value duplicates a real cell. ... counting them inflated P_chan by 4% and P_base by 8%. ... With the ghosts included the closure error was 7.2e-2; with them excluded it is 1.6e-5 at worst.

幽灵格不是新格子，是镜像副本。把它们算进能量汇总，等于把边界重复加了一遍。修正后闭合误差从 7.2e-2 降到 1.6e-5——**两个都是「能量守恒」这句话，但只有后者是真的**。

同一份 docstring 还列了另外两条偏差：根节点吸收的热量在旧实现里被丢掉（因为只按边沉积），以及旧实现用 `max(s, 0)` 裁剪吸收热量、从而破坏离散能量守恒。三条都属于「账没对上」。

## 通用规则

> 守恒量必须绑定到一个**明确的基本单元**上：节点、边、面、体积元，四选一并写下来。任何跨单元求和都要显式声明权重。

三条实操：

1. 每个汇总函数先写一句「每个 X 算一次」，写在 docstring 第一行。
2. 离散守恒要做**闭合检验**（流入 − 流出 − 源 = 0），并把残差写进输出。`conjugate_3d_flow.py` 就是这么做的。
3. 如果账本错误不影响任何检查通过与否，那说明检查是恒等式——顺手去看 [FM-7 框架盲区](/notes/fm-7-blindspot/)。

## 相关

- 节点需求与半径 → [Murray 定律](/notes/murray-law/)
- 等材料基准怎么构造 → [公平比较的三级基准](/notes/fairness-basis/)
- 3D 里的三条偏差 → [3D 路线必须诚实定名](/notes/3d-route-honesty/)
