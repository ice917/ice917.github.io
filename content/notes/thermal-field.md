---
title: "温度场：五点差分与 Jacobi"
date: 2026-10-25
draft: false
tags: ["物理", "数值方法"]
description: "一个泊松方程、4513 次迭代、一个只验证了一半的 sanity check。"
---

## 方程

稳态导热、内部有热源：

$$\nabla^2 T = -\frac{q}{k}$$

在 50×50 的均匀网格上离散，每个内点用自己与上下左右四个邻居的平均值，加上源项：

```python
Tn[1:-1, 1:-1] = (
    0.25 * (T[2:, 1:-1] + T[:-2, 1:-1] + T[1:-1, 2:] + T[1:-1, :-2])
    + src_b
)
```

这是 `field.py` 的 `_solve_poisson`（L161–164）。`src_b` 是预先算好的 `q·h²/(4k)`，只在源区那几个格子里非零。`k = 1`、`h = PITCH_MM`，都是无量纲的——所以这一步算出来的 `T` **没有单位**。

## 边界条件

- 默认 `h_conv = 0`，走 Dirichlet 分支：四边全部钉在 `T_boundary = 25.0`（L180–183）。
- 若 `h_conv > 0`，四边走 Robin（L165–178）：`Bi = h_conv · PITCH_MM`，边格用「唯一的内邻居 + 一个虚拟的环境温度格」更新；四个角因为只有两个内邻居，公式系数换成 `2a/2b`。

注释里写了一句容易被忽略的话：`h_conv = 0` 时必须继续走 Dirichlet 分支。改成「Bi=0 的 Robin」会得到不同的边界，别顺手合并。

## 迭代

Jacobi 迭代，判据是 `max|T_new - T_old| < tol`。本次运行：`"converged": true`，`"iterations": 4513`（`run_report.json` 的 `field` 段）。

Jacobi 每一步只用到旧值，所以可以直接整块切片赋值（上面的写法），不用逐格循环。代价是收敛慢——这就是为什么需要 4513 次。

## sanity check 验了什么，没验什么

`outputs/run_report.json` 的 `sanity_check` 段：

| 字段 | 值 |
| --- | ---: |
| `slope_measured` | -0.16017 |
| `slope_analytic` | -0.15915 |
| `ratio` | 1.0064 |
| `r2_log_fit` | 0.99998 |

它做的是：在点源情形下，把温度沿径向取对数，拟合出的斜率应当等于解析解的衰减指数。实测比率 1.0064、R² 0.99998，说明**网格上的衰减长度是对的**。

但它**没有**验：

- 源区的总功率是否守恒（源强度怎么归一化的，见 [热源饱和](/notes/source-saturation/)）；
- 网格加密后解是否收敛（没有做 h 收敛研究）；
- 绝对值是否有物理意义——因为下一步就把它缩放了。

## 归一化：温度是相对的

```python
rise = float(T.max() - T_boundary)
return T_boundary + (T - T_boundary) * (T_target - T_boundary) / rise
```

`normalize_field`（L393–402）把峰值仿射拉到 100 °C。它成立的理由写在 docstring 里：泊松问题对 `q` 是仿射的，所以缩放解等价于换一个源强度，**不是近似**。

推论很重要：后面所有 `T_max = 27.596 °C` 之类的数字，都是「峰值 100 °C 的那个装置」里的读数，不能当成真实芯片温度。要拿真实温度，必须换成带 `k = 148 W/(m·K)` 的物理口径重算。

## 接下来

- 为什么 `h` 有两把尺子 → [两把尺子](/notes/two-calibers/)
- 源区为什么有 289 格和 25 格两种 → [热源饱和](/notes/source-saturation/)
- 梯度是怎么变成树的 → [热驱动贪心生长](/notes/greedy-growth/)
