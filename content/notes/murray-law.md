---
title: "Murray 定律与它的恒等式陷阱"
date: 2026-10-25
draft: false
tags: ["算法", "陷阱"]
description: "r = r0·N^(1/3) 让每个分叉都满足 r父³ = Σr子³。所以 check_murray 永远不会失败。"
---

## 定律

Murray 定律说：分叉处要保持流阻最小，父管半径的三次方等于子管半径三次方之和。

$$r_{\text{parent}}^3 = \sum_i r_{\text{child},i}^3$$

配合「叶端半径 = r0、每个叶需求为 1」，可以整体解出一个闭式：

$$r = r_0 \cdot N^{1/3}$$

`N` 是这个节点下游的叶子数。`assign_radii`（`radius.py` L52–64）就这一行：

```python
flow = node_flows(edges)
return {i: r0 * (flow[i] ** (1.0 / 3.0)) for i in flow}
```

## N 是怎么数的（这里有个易错点）

`node_flows`（L37–49）从最深节点往上累加：

```python
flow = {i: 1 for i in nodes}
for v in sorted(nodes, key=lambda i: -depth[i]):
    ch = children.get(v)
    if ch:
        flow[v] = sum(flow[c] for c in ch)
```

叶初始为 1，内部节点等于**子节点之和**，且**不加自己的 1**。docstring 明说：「an internal node carries the sum of its children's demands (its own demand is not added again)」。

为什么要强调这句？因为「每个节点都有需求」的直觉会让你写 `flow[v] = 1 + sum(...)`，那样内部节点会多算一次，`r_root` 会偏大，而且分叉守恒会以另一种方式被破坏。这一条属于 [FM-4 守恒记账](/notes/fm-4-conservation/)。

## 陷阱：这个检查不可能失败

`check_murray`（L67–94）算 `r_parent³ / Σ r_child³` 的相对误差。但注意 `r` 是怎么来的：

- `r_parent = r0 · (Σ N_child)^(1/3)`
- `Σ r_child³ = r0³ · Σ N_child`
- 所以 `r_parent³ = r0³ · Σ N_child = Σ r_child³`，**恒等**。

实测 `max_rel_err = 4.845e-16`（`run_report.json`），这就是浮点数的 0，不是「精度很高」。`pass = true` 只说明代码没写错符号，**不说明这棵树符合任何生物或物理规律**。

> 判据：如果一个检查的输入全部由同一个公式和同一个参数导出，那么它检查的是自己的定义，不是物理。见 [FM-7 框架盲区](/notes/fm-7-blindspot/)。

## 半径分布说明什么

`murray.profile`：

| 字段 | 值 |
| --- | ---: |
| `min` | 0.5 |
| `max` | 1.9682 |
| `mean` | 0.573 |
| `frac_le_0_6mm` | 0.8575 |

85.75% 的节点半径 ≤ 0.6 mm，也就是 `r = r0`（N = 1）——这些节点下游只有一个叶，是「单叶走廊」。400 × 0.8575 = 343 个，剩下 57 个正好是分叉数，数目对得上（这是算术一致性，不是证明）。

`max = 1.9682` 可以独立验算：`0.5 × 61^(1/3) = 0.5 × 3.9364 = 1.9682`。与 61 个叶自洽。

## 真正的问题：根比格距还粗

`1.9682 mm` 的根管，放在 `0.9 mm` 的格距上——**相邻通道会重叠**。这就是约束 C2 的内容。

`generator.py` L23–27 把这件事说得很清楚：

> `calibrate.report()` measures the project's own 61-leaf tree at `r_root = 1.6661 mm > 0.9 mm` pitch, so the historical tree violates C2.

同时 `generator.py` 给出了正确的用法：不要用它去卡叶数，而是**反解 r0**：

```python
r0 = pitch / N_leaves ** (1/3)
```

这样 `r_root` 就正好等于格距。

⚠ 这里有一个**尚未解决的数值矛盾**，必须记下来：

- `run_report.json` 里那棵 61 叶树，`r_max = 1.9682` → 对应 `r0 = 0.5`、叶数 61。
- `generator.py` L25/L86 与 `DEFECT_REMEDIATION_PLAN.md` §10.10 说「61 叶树实测 `r_root = 1.6661`」。反推 `(1.6661/0.5)³ = 37.0`，也就是 37 个叶，不是 61。

两个数**不可能同时**属于同一棵 `r0 = 0.5` 的 61 叶树。要么叶数不同，要么 `r0` 不同，要么其中一个数是旧版本残留。要结案，需要拿到 `1.6661` 那次的运行记录（叶数 + `r0`）。**结论不受影响**：1.9682 和 1.6661 都 > 0.9，C2 都不过。但这个矛盾本身值得记着——它正是「同一句话对应两个数」的典型样本。

另外 `组装方案.md` L237 又给了 `r_root = 1.96825`，与 `run_report.json` 一致，倾向说明 1.9682 是当前值。

## 相关

- 半径怎么变成 STL 的圆柱 → [STL 与可制造性](/notes/stl-and-manufacturability/)
- 节点计数为什么只算一次 → [FM-4 守恒记账](/notes/fm-4-conservation/)
- 这条定律在比较里起什么作用 → [公平比较的三级基准](/notes/fairness-basis/)
