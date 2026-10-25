---
title: "函数图谱：LaTeX 公式 ↔ Python 代码"
date: 2026-10-25
draft: false
tags: ["索引", "LaTeX", "Python"]
description: "heat_tree 里 12 个核心函数的公式形式与源码逐行对照，带锚点索引，下次直接查。"
---

## 这一页怎么用

查东西分三步：

1. 先看下面的**索引表**，按「我想算什么」找到函数名；
2. 点锚点跳到该函数，看**公式**（LaTeX）和**代码**（Python，行号对得上源码）；
3. 看**易错点**——那里写的是我实际踩到或读出来的坑，不是泛泛的提醒。

每条都保持同一个结构：公式 → 代码 → 符号对照 → 易错点。公式在构建期由 Hugo 用 KaTeX 转成 MathML，不依赖任何外部 CDN，断网也能看。

## 索引

| # | 函数 | 文件 | 做什么 | 核心公式 |
| --- | --- | --- | --- | --- |
| 1 | [`build_tree`](#build-tree) | `radius.py` | 边表 → 父子关系 + 深度 | 深度递推 |
| 2 | [`node_flows`](#node-flows) | `radius.py` | 每个节点下游的叶数 | 自底向上求和 |
| 3 | [`assign_radii`](#assign-radii) | `radius.py` | 按 Murray 定律定半径 | \(r = r_0 N^{1/3}\) |
| 4 | [`check_murray`](#check-murray) | `radius.py` | 验算分叉守恒 | 相对误差 |
| 5 | [`grow_tree`](#grow-tree) | `grow.py` | 从最热格点长树 | 贪心取最热邻格 |
| 6 | [`source_mask`](#source-mask) | `field.py` | 方形热源掩膜 | 指示函数 |
| 7 | [`solve_heat`](#solve-heat) / `_solve_poisson` | `field.py` | 稳态温度场 | 离散泊松 + Jacobi |
| 8 | [`flow_shares`](#flow-shares) | `conjugate.py` | 叶数 → 流量份额 | 归一化 |
| 9 | [`coolant_temperatures`](#coolant-temperatures) | `conjugate.py` | 冷却液沿途温升 | 能量守恒 |
| 10 | [`poiseuille_dp`](#poiseuille-dp) | `verify.py` | 进出口压降 | 沿一条路径求和 |
| 11 | [`max_r0_for_leaves`](#max-r0-for-leaves) | `generator.py` | 反解可行的 \(r_0\) | 三次根反解 |
| 12 | [`coolant_flow_m3s`](#coolant-flow-m3s) | `calibrate.py` | 功率 → 体积流量 | \(\dot V = P/(\rho c_p \Delta T)\) |

标「a.u.」的量是无量纲或任意单位，不能直接当帕斯卡、毫米用，详见 [两把尺子](/notes/two-calibers/)。

## 常量（写公式时要对得上的数）

| 常量 | 值 | 位置 |
| --- | --- | --- |
| `PITCH_MM` | 1.0 | `field.py` L21 |
| `SRC_RADIUS_REAL` | 8.0 | `field.py` L36 |
| `SRC_RADIUS_SYNTHETIC` | 2.0 | `field.py` L37 |
| `MU` | 1.0 a.u. | `verify.py` L27 |
| `T_COOL` | 25.0 ℃ | `verify.py` L28 |
| `RHO_WATER` | 997.0 kg/m³ | `calibrate.py` L49 |
| `CP_WATER` | 4182.0 J/(kg·K) | `calibrate.py` L50 |
| `RHO_CP` | \(\rho c_p\)，两者相乘 | `conjugate.py` L70 |

## 1. build_tree：把边表变成可遍历的树 {#build-tree}

**职责**：输入一串「父 → 子」的边，输出四样东西——子表、父表、深度、根。

**公式**

$$\begin{aligned}
C(p) &= \{\, c \mid (p, c) \in E \,\} \\
P(c) &= p \quad \text{for each } (p, c) \in E \\
d(v) &=
\begin{cases}
0, & v = \text{root} \\
d(P(v)) + 1, & \text{otherwise}
\end{cases}
\end{aligned}$$

**代码**（`radius.py` L18–34）

```python
def build_tree(edges: list[tuple[int, int]]):
    """Return (children, parent, depth, root) for an edge list."""
    children: dict[int, list[int]] = {}
    parent: dict[int, int] = {}
    for p, c in edges:
        children.setdefault(p, []).append(c)
        parent[c] = p
    root = edges[0][0]

    depth: dict[int, int] = {root: 0}
    stack = [root]
    while stack:
        v = stack.pop()
        for ch in children.get(v, []):
            depth[ch] = depth[v] + 1
            stack.append(ch)
    return children, parent, depth, root
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(E\) | `edges` | 边表，元素是 `(p, c)` |
| \(C(p)\) | `children[p]` | 父节点 p 的孩子列表 |
| \(P(c)\) | `parent[c]` | 子节点 c 的唯一父节点 |
| \(d(v)\) | `depth[v]` | 到根的边数 |

**易错点**

- 根不是算出来的，是**约定**的：`root = edges[0][0]`（L25）。它假定第一条边的左端就是根。`grow_tree` 生成的边满足这个约定（第一条边从最热格点出发），但**手写或重排过的边表不满足**，此时深度会算到一棵不存在于根下的子树上。
- 深度用的是显式栈 DFS，不是递归。好处是不会在几百个节点的树上撞递归上限；代价是深度大于约 1000 时也不会有问题，但栈的顺序会让 `depth` 的写入顺序不可预测——**只依赖 `depth` 的值，不要依赖遍历顺序**。

## 2. node_flows：数每个节点下游有几片叶 {#node-flows}

**职责**：给每个节点标一个整数值 \(N(v)\)，等于它下游的叶数（叶子自己算 1）。

**公式**

$$N(v) =
\begin{cases}
1, & C(v) = \varnothing \\
\displaystyle\sum_{c \in C(v)} N(c), & C(v) \neq \varnothing
\end{cases}$$

**代码**（`radius.py` L37–49）

```python
def node_flows(edges: list[tuple[int, int]]) -> dict[int, float]:
    """Downstream demand per node: a leaf carries 1, an internal node carries
    the sum of its children's demands (its own demand is not added again)."""
    children, parent, depth, root = build_tree(edges)
    nodes = set(parent) | set(parent.values()) | {root}

    flow = {i: 1 for i in nodes}
    # deepest first: by the time we reach v, every child of v is finalised
    for v in sorted(nodes, key=lambda i: -depth[i]):
        ch = children.get(v)
        if ch:
            flow[v] = sum(flow[c] for c in ch)
    return flow
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(N(v)\) | `flow[v]` | 下游叶数（整数，但以 float 存） |
| \(C(v) = \varnothing\) | `ch` 为 `None` | 叶节点 |
| 自底向上 | `sorted(nodes, key=lambda i: -depth[i])` | 按深度降序，保证孩子先算完 |

**易错点**

⚠ **这个文件的模块 docstring 和函数 docstring 互相矛盾，是本项目里真实存在的不一致。**

- 模块 docstring（`radius.py` L5）写的是 `flow(parent) = 1 + sum(flow(child))`；
- 函数 docstring（L38–39）写的是「its own demand is not added again」，即**不加 1**；
- 实现（L43–48）也是**不加 1**：先全部置 1，再只用 `sum(...)` 覆盖。

所以模块 docstring 是错的。如果照它写，根的值会从 61 变成 400（每个节点多算一次），`assign_radii` 会把根半径放大到 \(\,(400/61)^{1/3} \approx 1.87\,\) 倍。**以 L48 的代码为准**，这也是 [Murray 定律与它的恒等式陷阱](/notes/murray-law/) 里强调的那个「多算一次」的坑。

- 另一处脆弱点：L45 用 `depth[i]` 取深度。如果边表里存在从根不可达的节点（多棵树、或乱序边表导致 `root` 认错），`depth` 里没有那个键，这里会直接抛 `KeyError` 而不是给出提示。项目内所有调用都是单棵树，所以没触发；但这是**未防御的输入假设**，不是已证明安全的写法。

## 3. assign_radii：按 Murray 定律定半径 {#assign-radii}

**职责**：核心只有一行——把叶数开三次方，乘基准半径。

**公式**

$$r(v) = r_0 \cdot N(v)^{1/3}$$

**代码**（`radius.py` L52–64）

```python
def assign_radii(
    edges: list[tuple[int, int]],
    grid: int,
    r0: float = 0.5,
) -> dict[int, float]:
    """Murray-law radii for the tree given as an edge list.

    grid = number of columns (idx = y*grid + x).
    """
    if not edges:
        return {}
    flow = node_flows(edges)
    return {i: r0 * (flow[i] ** (1.0 / 3.0)) for i in flow}
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(r(v)\) | 返回值 `{节点: 半径}` | 单位 mm（当 `r0` 用 mm 时） |
| \(r_0\) | `r0 = 0.5` | 叶端（毛细）半径 |
| \(N(v)\) | `flow[i]` | 下游叶数 |

**易错点**

- **`grid` 是死参数**：签名里有 `grid: int`（L54），`grid = number of columns (idx = y*grid + x)` 也写进了 docstring（L59），但函数体从 L61 到 L64 **一次都没有用到 `grid`**。二维索引只出现在别处（比如 `grow.py` 的 `divmod`），这里传什么值都不影响结果。删掉它不会改变任何输出——这是可验证的：L61–64 是完整函数体。
- 这个函数返回的是**绝对半径**，不是相对值。\(N\) 的最大值决定最粗的根：\(r_{\text{root}} = r_0 N_{\text{leaves}}^{1/3}\)。所以叶数一变，根就变，可制造性也跟着变——见 [STL 与可制造性](/notes/stl-and-manufacturability/)。

## 4. check_murray：验算分叉守恒 {#check-murray}

**职责**：在每个「有 2 个以上孩子」的节点上，比较父半径三次方与子半径三次方之和。

**公式**

$$\varepsilon = \max_{\substack{v \\ |C(v)| \ge 2}}
\frac{\left|\, r(v)^3 - \sum_{c \in C(v)} r(c)^3 \,\right|}
{\sum_{c \in C(v)} r(c)^3}$$

$$\text{pass} = \left[\, \varepsilon < \text{tol} \,\right], \qquad \text{tol} = 10^{-9}$$

**代码**（`radius.py` L67–94，完整）

```python
def check_murray(edges: list[tuple[int, int]], radii: dict[int, float], tol: float = 1e-9) -> dict:
    """Verify r_parent^3 == sum(r_children^3) at every branching node."""
    children, _, _, _ = build_tree(edges)

    rows = []
    worst = 0.0
    for p, ch in children.items():
        if len(ch) < 2:
            continue
        lhs = radii[p] ** 3
        rhs = sum(radii[c] ** 3 for c in ch)
        err = abs(lhs - rhs) / rhs
        worst = max(worst, err)
        rows.append(
            {
                "parent": p,
                "n_children": len(ch),
                "r_parent": radii[p],
                "sum_r_child_cubed": rhs,
                "rel_err": err,
            }
        )
    return {
        "n_forks": len(rows),
        "max_rel_err": worst,
        "pass": bool(worst < tol),
        "rows": rows,
    }
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(\varepsilon\) | `max_rel_err` | 最坏相对误差 |
| \(\lvert C(v)\rvert \ge 2\) | `if len(ch) < 2: continue` | 只查真分叉，单孩子走廊跳过 |
| 分母 \(\sum r^3\) | `rhs` | 用子节点之和做分母（不是父），所以是相对误差 |

**易错点**

- **这个检查在数学上不可能失败**。因为 \(r(v) = r_0 N(v)^{1/3}\)，所以

$$r(v)^3 = r_0^3 N(v) = r_0^3 \sum_{c \in C(v)} N(c) = \sum_{c \in C(v)} r(c)^3$$

  两边恒等，\(\varepsilon\) 只剩浮点误差。`pass = true` 只证明「代码里的三次方和开三次方没写反」，**不证明树符合任何生物或物理规律**。实测 `max_rel_err` 是 \(4.845\times10^{-16}\) 量级——这就是浮点 0。完整讨论见 [Murray 定律与它的恒等式陷阱](/notes/murray-law/) 与 [FM-7 框架盲区](/notes/fm-7-blindspot/)。
- 判据要盯住：**当检验的输入全部由被检验的公式和同一组参数导出时，这个检验验证的是它自己的定义**。要独立检验，得换一条路径（比如用流量和压降反推半径），而不是用 \(r = r_0 N^{1/3}\) 生成再验算 \(r^3\)。

## 5. grow_tree：从最热格点往外长树 {#grow-tree}

**职责**：从温度场里挑最热的格子当根，每一步把「与当前树相邻的最热格」接进来，父节点选「树内最热的那个邻格」。

**公式**

设 \(\mathcal{T}\) 为已入树的格点集合，\(j \sim \mathcal{T}\) 表示 \(j\) 与树中某格 4-邻接：

$$j^{*} = \arg\max_{\,j \notin \mathcal{T},\; j \sim \mathcal{T}} T_j$$

父节点取树内最热的邻格：

$$P(j^{*}) = \arg\max_{\,k \in \mathcal{T},\; k \sim j^{*}} T_k$$

循环条件是「堆非空」**且**「边数还没撑满预算」：

$$|E| + 1 < \texttt{max\_nodes} \quad \wedge \quad \text{heap} \neq \varnothing$$

所以最终边数停在「\(\texttt{max\_nodes} - 1\)」与「堆提前耗尽时的弹出数」中较小的那个。后者由温度场的形状决定，不是由参数决定。

**代码**（`grow.py` L54–73；L35–52 是初始化与 `push_neighbors`，此处省略）

```python
    while heap and len(edges) + 1 < max_nodes:
        _, j = heapq.heappop(heap)
        if in_tree[j]:
            continue                      # stale heap entry
        in_tree[j] = True

        # parent = hottest already-in-tree neighbour
        y, x = divmod(j, grid_x)
        best_parent, best_val = None, -np.inf
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < grid_y and 0 <= nx < grid_x:
                k = ny * grid_x + nx
                if in_tree[k] and float(T.flat[k]) > best_val:
                    best_val = float(T.flat[k])
                    best_parent = k
        if best_parent is None:
            continue
        edges.append((best_parent, j))
        push_neighbors(j)

    return edges
```

`push_neighbors` 把邻居压成 `(-T, j)`：

```python
def push_neighbors(i: int) -> None:
    y, x = divmod(i, grid_x)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < grid_y and 0 <= nx < grid_x:
            j = ny * grid_x + nx
            if not in_tree[j]:
                heapq.heappush(heap, (-float(T.flat[j]), j))
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(T_j\) | `T.flat[j]` | 格点温度 |
| \(\arg\max T_j\) | `heapq.heappop(heap)`（存 `-T`） | 最小堆取负号 = 最大温度 |
| 并列时取小下标 | 元组 `(-T, j)` 的第二项 | 堆比较自动按 `j` 升序破并列 |
| \(j \sim \mathcal{T}\) | 四方向循环 + `in_tree[k]` | 4-邻接 |

**易错点**

- **陈旧堆项必须有 `if in_tree[j]: continue`（L56–57）**。同一个格点可能被多个邻居重复压栈（只在压栈时检查 `in_tree`，出栈时可能已经进树了）。去掉这一行会让同一个格点被写入两次 `edges`，树就不再是树，而是一个带重复边的图。
- 并列打破是**隐式**的：`heapq` 比较元组时，第一项相同就比第二项 `j`，所以自然得到「温度降序、下标升序」的确定性结果。代码里没有一行显式写「下标升序」，它藏在元组比较里。
- L70–71 的 `if best_parent is None: continue` 实际**不可达**：任何被压进堆的 `j` 都是由某个当时已在树中的格点压入的，而 `in_tree` 只增不减，所以弹出时至少有一个树内邻格。这是一条防御性分支，不是可达分支——留着无害，但不要以为它在处理某种真实情况。
- 生长的方向完全由 `T` 决定，所以「源动则树动」。这条性质由 `shape_signature` 单独量化，见 [贪心生长](/notes/greedy-growth/)。

## 6. source_mask：方形热源掩膜 {#source-mask}

**职责**：在 `grid × grid` 的板上，把中心附近一个正方形区域标成 `True`。

**公式**

$$S(i, j) = \mathbf{1}\!\left[\,|i - c_y| \le \rho \ \wedge\ |j - c_x| \le \rho\,\right]$$

默认 \(\rho = 8\)（`SRC_RADIUS_REAL`），所以掩膜是 \((2\rho+1)^2 = 17\times17 = 289\) 个格点。

**代码**（`field.py` L56–65）

```python
def source_mask(grid: int, center: tuple[int, int],
                radius: float = SRC_RADIUS_REAL) -> np.ndarray:
    """Square source mask of half-width `radius` cells around `center`=(y, x).

    Default is the REAL-scale footprint (SRC_RADIUS_REAL). The synthetic
    5x5 block is still available as SRC_RADIUS_SYNTHETIC.
    """
    cy, cx = center
    yy, xx = np.mgrid[0:grid, 0:grid]
    return (np.abs(yy - cy) <= radius) & (np.abs(xx - cx) <= radius)
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(\rho\) | `radius` | 半宽，单位是**格数**，不是 mm |
| \((c_y, c_x)\) | `center` | 中心格，注意是 `(y, x)` 顺序 |
| \(S\) | 返回的 bool 数组 | `True` = 该格发热 |

**易错点**

- 是**方**不是圆：判据是分别对两轴取绝对值，不是欧氏距离。想要圆就得写 `(yy-cy)**2 + (xx-cx)**2 <= radius**2`，两者面积差 \(\pi/4 \approx 0.785\)。
- `<=` 不是 `<`：半宽 8 的方形边长是 17 格（含中心），不是 16。算面积时差一圈。
- 半宽是**格数**。`SRC_RADIUS_REAL = 8.0` 里的「REAL」指的是「对应真实芯片尺寸的格数」，不是 8 mm。真实尺寸要通过 `PITCH_MM` 换算，见 [两把尺子](/notes/two-calibers/)。

## 7. solve_heat / _solve_poisson：稳态温度场 {#solve-heat}

**职责**：解二维稳态导热方程，输出整块板的温度场。

**公式**

连续形式（\(k\) 为导热系数，\(q\) 为体热源）：

$$\nabla^2 T + \frac{q}{k} = 0$$

离散形式（步长 \(h\) = `PITCH_MM`，四点差分）：

$$\frac{T_{i+1,j} + T_{i-1,j} + T_{i,j+1} + T_{i,j-1} - 4T_{i,j}}{h^2} + \frac{q_{i,j}}{k} = 0$$

整理成 Jacobi 迭代式（代码里就是这一行）：

$$T^{(n+1)}_{i,j} = \frac{1}{4}\left(T^{(n)}_{i+1,j} + T^{(n)}_{i-1,j} + T^{(n)}_{i,j+1} + T^{(n)}_{i,j-1}\right) + \frac{q_{i,j} h^2}{4k}$$

收敛判据（相邻两轮的最大改变量）：

$$\left\| T^{(n+1)} - T^{(n)} \right\|_\infty < \tau, \qquad \tau = 10^{-6}$$

边界两种模式。默认 Dirichlet（边界环钉死在 \(T_b\)）：

$$T\big|_{\partial\Omega} = T_b = 25\ ^\circ\text{C}$$

开启对流后换成 Robin，边界格 \(P\) 有

$$T_P = \frac{T_{in} + (1 + B_i)\,T_{amb}}{2 + B_i}, \qquad B_i = \frac{h_{conv} h}{k}$$

**代码**（`field.py` L159–192，主循环；L152–158 为初始化，省略）

```python
    while it < max_iter:
        Tn = T.copy()
        Tn[1:-1, 1:-1] = (
            0.25 * (T[2:, 1:-1] + T[:-2, 1:-1] + T[1:-1, 2:] + T[1:-1, :-2])
            + src_b
        )
        if Bi > 0.0:
            # Robin on all four edges: each edge cell has exactly one interior
            # neighbour and one ghost at T_ambient.
            a = 1.0 + Bi
            b = 2.0 + Bi
            Tn[0, 1:-1] = (Tn[1, 1:-1] + a * T_ambient) / b
            Tn[-1, 1:-1] = (Tn[-2, 1:-1] + a * T_ambient) / b
            Tn[1:-1, 0] = (Tn[1:-1, 1] + a * T_ambient) / b
            Tn[1:-1, -1] = (Tn[1:-1, -2] + a * T_ambient) / b
            # corners: two interior neighbours
            Tn[0, 0] = (Tn[1, 0] + Tn[0, 1] + 2.0 * a * T_ambient) / (2.0 * b)
            Tn[0, -1] = (Tn[1, -1] + Tn[0, -2] + 2.0 * a * T_ambient) / (2.0 * b)
            Tn[-1, 0] = (Tn[-2, 0] + Tn[-1, 1] + 2.0 * a * T_ambient) / (2.0 * b)
            Tn[-1, -1] = (Tn[-2, -1] + Tn[-1, -2] + 2.0 * a * T_ambient) / (2.0 * b)
        else:
            Tn[0, :] = T_boundary
            Tn[-1, :] = T_boundary
            Tn[:, 0] = T_boundary
            Tn[:, -1] = T_boundary

        residual = float(np.max(np.abs(Tn - T)))
        T = Tn
        it += 1
        if residual < tol:
            converged = True
            break
```

源项在 `solve_heat` 里装配（L227–231）：

```python
    cy, cx = source_center if source_center is not None else ((grid - 1) // 2, (grid - 1) // 2)
    src = source_mask(grid, (cy, cx), source_radius)
    src_b = (q * PITCH_MM**2 / (4.0 * k)) * src[1:-1, 1:-1]
    return _solve_poisson(src_b, grid, T_init, T_boundary, max_iter, tol,
                          h_conv=h_conv, T_ambient=T_ambient)
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(h\) | `PITCH_MM` | 格距，默认 1.0 |
| \(q_{i,j}h^2/(4k)\) | `src_b` | 已含差分系数，所以迭代式里只加不减 |
| \(\tau\) | `tol = 1e-6` | 残差阈值 |
| \(B_i\) | `Bi = h_conv * PITCH_MM` | 默认 `k = 1`，故 \(B_i = h_{conv} h\) |
| \(T_b\) | `T_boundary = 25.0` | Dirichlet 边界值 |

**易错点**

- **`src_b` 已经乘过 \(h^2/(4k)\)，不要再乘一次**。迭代式右边直接加 `src_b`，它对应的是 \(\frac{q h^2}{4k}\) 这整个系数。如果改成 `+ 4*src_b` 或 `+ q`，解的尺度会整体错。
- 内层更新用的是 `Tn[...] = 0.25 * (T[...])`：**右边全读旧值 `T`**，这是 Jacobi 的定义。若把右边改成 `Tn`，就变成 Gauss–Seidel，收敛更快但每步结果不同，两次运行不能逐位比较。
- Robin 分支里，边格公式用的是 `Tn[1, 1:-1]`（**已经更新过的**内点），不是 `T`。所以 Robin 模式其实是半隐式的，与纯 Jacobi 不完全一致；Dirichlet 分支则整圈直接赋值，没有这个问题。这个差异不影响收敛到稳态，但影响迭代过程的中间值。
- ⚠ **docstring L145 的推导式和代码差一个负号**。原文写的是

  $$(T_{in} + T_{amb} - 2T_P)/h^2 + q_P = h_{conv}(T_{amb} - T_P)$$

  在代码默认 \(h = k = 1\)、\(q_P = 0\) 下解这个式子，得到 \(T_P = \dfrac{T_{in} + (1 - B_i)T_{amb}}{2 - B_i}\)，与实现里的 \((1 + B_i)/(2 + B_i)\) 不同号。实现对应的等式右侧应是 \(-h_{conv}(T_{amb} - T_P)\)。**以代码为准**：`a = 1 + Bi`、`b = 2 + Bi` 是 L168–169 的实际取值，验算时照抄代码。

## 8. flow_shares：叶数换算成流量份额 {#flow-shares}

**职责**：`node_flows` 给的是**叶计数**（根 = 61），不能直接当流量用；这里除以根值，变成份额。

**公式**

$$\phi(v) = \frac{N(v)}{N(\text{root})}, \qquad \phi(\text{root}) = 1$$

$$q_v = q_{total} \cdot \phi(v)$$

**代码**（`conjugate.py` L75–92）

```python
def flow_shares(edges) -> dict[int, float]:
    """Per-node volumetric flow SHARE (sums to 1 at the root).

    `radius.node_flows` returns a leaf COUNT -- a leaf carries 1 and the
    root carries the total number of leaves (61 for the single-source
    tree). Using it raw multiplies the flow by up to 61x. Divide by the
    root's count so every caller gets a share.
    """
    flow = Ra.node_flows(edges)
    if not flow:
        return {}
    children = {c for _, c in edges}
    roots = [n for n in flow if n not in children]
    root = roots[0] if roots else max(flow, key=flow.get)
    total = float(flow[root])
    if total <= 0.0:
        return {n: 0.0 for n in flow}
    return {n: flow[n] / total for n in flow}
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(\phi(v)\) | 返回的字典值 | 无量纲份额，\(\phi \in (0, 1]\) |
| \(N(\text{root})\) | `total` | 总叶数 |
| root | `roots[0]` 或 `max(flow, key=flow.get)` | 从没当过孩子的节点 |

**易错点**

- **别把 `node_flows` 的返回值直接当流量**。它是计数，根上是 61；直接用等于把总流量放大 61 倍，所有温升会被压小 61 倍。docstring 明写了这一点，这也是最容易犯的一次单位错误——它没有量纲，所以不会报错，只会让结果安静地偏小。
- 找根的方式和 `build_tree` 不同：这里用「不是任何人的孩子」判据（L86–88），而 `build_tree` 用 `edges[0][0]`。两处对同一棵树的根认定**通常一致，但没有互相校验**。若边表乱序，两处会给出不同的根，而代码不会报错。

## 9. coolant_temperatures：冷却液沿途温升 {#coolant-temperatures}

**职责**：从入口开始，按拓扑序沿每条边累加温升。

**公式**

$$T_v = T_{P(v)} + \frac{Q_{\text{heat}}(P(v), v)}{\rho c_p \, q_v}, \qquad q_v = q_{total}\,\phi(v)$$

入口边界条件：

$$T_{\text{inlet}} = 25\ ^\circ\text{C}$$

**代码**（`conjugate.py` L120–133）

```python
def coolant_temperatures(edges, q_total_m3s, heat_per_edge_w, t_inlet_c=T_COOL):
    """Coolant temperature at every node, marching from the inlet."""
    order, parents = chain_order(edges)
    shares = flow_shares(edges)
    T: dict[int, float] = {}
    for n in order:
        p = parents[n]
        if p is None:
            T[n] = float(t_inlet_c)
            continue
        q_here = q_total_m3s * shares.get(n, 0.0)
        q_heat = heat_per_edge_w.get((p, n), 0.0)
        T[n] = T[p] + (q_heat / (RHO_CP * q_here) if q_here > 0.0 else 0.0)
    return T
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(T_v\) | `T[n]` | 节点处液温，℃ |
| \(Q_{\text{heat}}\) | `heat_per_edge_w[(p, n)]` | 该段通道吸收的热功率 W |
| \(\rho c_p\) | `RHO_CP` = 997 × 4182 ≈ \(4.17\times10^{6}\) | J/(m³·K) |
| \(q_v\) | `q_total_m3s * shares[n]` | 该节点处的体积流量 m³/s |

**易错点**

- **必须按拓扑序推进**，不能按字典序或节点编号序。`chain_order` 用入度做 Kahn 拓扑排序，并在 L115–116 检查「边表是不是 DAG」，不是就 `raise ValueError("tree edges are not a DAG")`。这是全项目里少见的显式失败——它拦的是「上游还没算就算下游」这类静默错误。
- L132 的三元表达式：`q_here > 0.0` 才除。流量为 0 时温升记为 0，而不是无穷大。这在物理上是「没有流量就没有对流换热」，但也意味着**这条边的热量凭空消失**——它不会进到任何别的地方。看到 0 流量时要意识到能量不守恒。
- 温升是**累加**的，所以最深叶片的液温 = 沿途所有段的温升之和。分叉点下游流量变小、温升变大，因此最热的叶片通常在最深、最细的末端，而不是在根附近。

## 10. poiseuille_dp：树的进出口压降 {#poiseuille-dp}

**职责**：算从入口到出口的压降。树是**单入口多出口**的网络，所以压降是**沿一条根到叶的路径**，不是所有段相加。

**公式**

单段阻力（泊肃叶，圆管层流）：

$$R_{(p,c)} = \frac{8 \mu L}{\pi\, r_e^4}, \qquad r_e = \min(r_p, r_c), \quad L = \text{pitch}$$

该段的流量份额：

$$Q_c = \frac{N(c)}{N(\text{root})}$$

路径压降（沿路径取和，跨子树取最大）：

$$\Delta p = \max_{\pi \in \text{root}\to\text{leaf}} \ \sum_{(p,c) \in \pi} R_{(p,c)} \, Q_c$$

写成递归就是代码里的 `path_dp`：

$$\text{path\_dp}(v) =
\begin{cases}
0, & C(v) = \varnothing \\
\max_{c \in C(v)} \left[ R_{(v,c)} Q_c + \text{path\_dp}(c) \right], & C(v) \neq \varnothing
\end{cases}$$

**代码**（`verify.py` L869–890）

```python
    from radius import build_tree, node_flows
    children, parent, depth, root = build_tree(edges)
    nodes = set(parent) | set(parent.values()) | {root}
    demand = node_flows(edges)
    total_demand = demand[root]

    def r_edge(p: int, c: int) -> float:
        r = min(radii[p], radii[c])
        return 8.0 * MU * pitch_mm / (np.pi * r ** 4)

    q = {v: demand[v] / total_demand for v in nodes}

    if not as_network:
        return sum(r_edge(p, c) * q[c] for p, c in edges)

    def path_dp(v: int) -> float:
        ch = children.get(v)
        if not ch:
            return 0.0
        return max(r_edge(v, c) * q[c] + path_dp(c) for c in ch)

    return path_dp(root)
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(R\) | `r_edge(p, c)` | 单段阻力，单位 a.u. |
| \(\mu\) | `MU = 1.0` | a.u.，比值里会约掉 |
| \(L\) | `pitch_mm = PITCH_MM = 1.0` | 段长 = 一格 |
| \(\max\) | `max(...)` | 只走最坏那条路径 |

**易错点**

- **`as_network=False` 是历史口径，不要用于新结果**。它把所有边求和，等于把树当成一根串联长管；串联管只有在「每段末端都把流量全部取走」时才成立，树不是。代码保留它只为复现旧数字（docstring L859–860 明说）。
- 阻力对半径是 **4 次方**，且取 `min(r_p, r_c)`。半径差 2 倍，阻力差 16 倍。所以压降几乎完全由最细的那几段决定，粗段可以忽略——这也是为什么 Murray 定律的三次方能压住压降。
- 默认 `pitch_mm = 1.0` 是**无量纲求解器的常数**，算出来的 \(\Delta p\) 是 a.u.，只能用于「树 vs 对照」的比值。要 Pa 必须走 `calibrate.tree_dp_pa(..., calibrate.paper_grid_mm())`，那条路径用 0.9 mm 的真实格距。这是 [FM-2 压降口径](/notes/fm-2-dp/) 的核心。

## 11. max_r0_for_leaves：反解可行的叶端半径 {#max-r0-for-leaves}

**职责**：给定叶数和格距，求最大的 \(r_0\)，使根管不超出单格（约束 C2）。

**公式**

正向（叶数上限，`max_feasible_leaves`）：

$$N_{\text{leaves}}^{\max} = \left\lfloor \left(\frac{\text{pitch}}{r_0}\right)^{3} \right\rfloor$$

反向（给定叶数求 \(r_0\)，本函数）：

$$r_0^{\max} = \frac{\text{pitch}}{N_{\text{leaves}}^{1/3}}$$

两者互逆，且都来自同一条约束 \(r_{\text{root}} = r_0 N^{1/3} \le \text{pitch}\)。

**代码**（`generator.py` L73–78 与 L100–102）

```python
def max_feasible_leaves(r0_mm: float, pitch_mm: float) -> int:
    """Largest leaf count whose ROOT still fits inside one cell.

    Murray: r_root = r0 * N_leaves^(1/3). C2 requires r_root <= pitch_mm.
    """
    return int(np.floor((pitch_mm / r0_mm) ** 3))
```

```python
    if n_leaves < 1:
        raise ValueError("n_leaves must be >= 1")
    return pitch_mm / (n_leaves ** (1.0 / 3.0))
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(r_0^{\max}\) | 返回值 | mm |
| \(N_{\text{leaves}}\) | `n_leaves` | 必须是**实际**叶数 |
| pitch | `pitch_mm` | 真实格距，通常 0.9 mm |

**易错点**

- **`n_leaves` 必须是实际叶数，不能是「目标叶数」**。`grow_tree` 是遇到堆空就停，不是达到目标就停，所以按 27 个节点预算长出来的树，实际叶数可能远多于 27。传目标值会**低估** \(r_{\text{root}}\)，让 C2 在「不存在的几何」上通过。实际叶数用 `n_leaves_of(edges)`（L105–119）取：判据是「从没当过父节点的节点数」，注意不是 `len(children)`。
- 这个约束**不能反向用来选叶数**。项目自己那棵 61 叶树在 0.9 mm 格距上 \(r_{\text{root}} = 1.6661\) mm（`generator.py` L86 的原话），本身就违反 C2；若拿 C2 去卡叶数，任何固定 \(r_0\) 的设计都会被判不可行。它的正确用法是**给定叶数、反解 \(r_0\)**。
- \(r_0^{\max}\) 随 \(N^{1/3}\) 下降，很慢。叶数从 61 增到 400，\(r_0\) 只降到原来的 \((61/400)^{1/3} \approx 0.53\) 倍；而半径分布里绝大多数节点就是 \(r_0\)，所以**叶数翻 6 倍，毛细管只细一半**。

## 12. coolant_flow_m3s：功率换算体积流量 {#coolant-flow-m3s}

**职责**：给定要带走的热功率和允许的进出口温差，算需要多大的体积流量。

**公式**

$$\dot V = \frac{P}{\rho c_p \Delta T_c}$$

代入默认值：

$$\dot V = \frac{P}{997 \times 4182 \times 5.0} \approx 4.80 \times 10^{-8}\, P \quad \left[\text{m}^3/\text{s}\right]$$

**代码**（`calibrate.py` L259–261）

```python
def coolant_flow_m3s(power_w: float, dT_c: float = 5.0) -> float:
    """Volumetric flow to carry `power_w` with a dT_c coolant rise."""
    return power_w / (RHO_WATER * CP_WATER * dT_c)
```

**符号对照**

| 公式 | 代码 | 含义 |
| --- | --- | --- |
| \(P\) | `power_w` | 需带走的热功率 W |
| \(\Delta T_c\) | `dT_c = 5.0` | 允许的冷却液温升 K |
| \(\rho c_p\) | `RHO_WATER * CP_WATER` | 997 × 4182 J/(m³·K) |
| \(\dot V\) | 返回值 | m³/s（不是 L/min） |

**易错点**

- **\(P\) 是「要带走的热量」，不是「芯片总功耗」**。若芯片 100 W 里有 30 W 通过 PCB 和封装散走，进入液冷回路的是 70 W，用 100 W 会把流量算大。
- \(\Delta T_c = 5\) 是**选定的设计值，不是实测值**。它直接决定流量，进而决定泵的选型；把它当物理常数用，就会得出「流量由物理决定」的错误结论。换一个 \(\Delta T_c\)，流量线性反比变化。
- 单位是 m³/s。工程上常写 L/min，换算要乘 \(6\times10^{4}\)：上面的系数 \(4.80\times10^{-8}\) m³/(s·W) 等于 \(2.88\times10^{-3}\) L/(min·W)，即 100 W 需要约 0.29 L/min。

## 读这一页时要知道的三件事

1. **公式和代码不是一一对应的装饰关系**。`assign_radii` 是一行，`_solve_poisson` 是三十行，但两者在论文里都是「一个公式」。看代码时以代码为准，看公式时问「它省略了哪些离散化细节」。
2. **凡是「自己生成、自己检验」的链条，都只能证明实现没写错**。`check_murray` 是典型：输入由 \(r = r_0 N^{1/3}\) 生成，再验 \(r^3\) 的和，必然通过。
3. **无量纲量不能当物理量报**。`MU = 1.0`、`PITCH_MM = 1.0`、`poiseuille_dp` 的默认口径，三个都是 a.u.。

## 相关

- 半径公式的陷阱 → [Murray 定律与它的恒等式陷阱](/notes/murray-law/)
- 温度场怎么来 → [热场求解](/notes/thermal-field/)
- 树怎么长出来 → [贪心生长](/notes/greedy-growth/)
- 压降的两种口径 → [FM-2 压降](/notes/fm-2-dp/)
- 无量纲与真实单位 → [两把尺子](/notes/two-calibers/)
- 需求为什么不能在内部节点重复计 → [FM-4 守恒记账](/notes/fm-4-conservation/)
