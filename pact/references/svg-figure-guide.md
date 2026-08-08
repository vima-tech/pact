# SVG 图源绘制规范（agent 用）

> 创建日期: 2026-08-02
>
> `pact-book.sh` 构建时会扫描真源里的**流程图/结构图块**（mermaid 块，或含框线/箭头字符的文本块），
> 在交付 HTML 里用 `figures/<id>.svg` 替换成真正的图。**SVG 由 agent 绘制**，本文是绘制规范。
> 触发时机：`pact-book.sh` 输出「图形化待办」清单时（/pact-new S8、/pact-change 第六步）。

## 铁律

1. **忠实转写，不增删信息**。图是真源图块的可视化，不是再创作：节点、连线、标注文字
   必须与文本源一一对应——多画一个框、漏画一条线都算漂移（真源唯一原则）。
   交付 HTML 会在图下附「查看文本源」折叠对照，读者可逐字核对。
2. **首行 hash 注释必写**：`<!-- pact:src-hash=<hash> -->`，hash 值抄构建输出里给出的
   `src-hash`。真源图块一变 hash 就变——旧 SVG 会被 `--check` 判漂移，必须重绘。
3. **只用文档 CSS 变量着色**（SVG 内联进 HTML 后继承页面变量，自动适配明暗主题）：
   - 文字：`var(--fg)` 主体 / `var(--fg-dim)` 次要 / `var(--fg-faint)` 注解
   - 线框：`var(--line)` 边框 / `var(--fg-faint)` 连线与箭头
   - 面：`var(--panel)` 节点底 / `var(--bg-soft)` 分区底 / `var(--accent-soft)` 强调底
   - 强调：`var(--accent)`；★/警示：`var(--star)`
   **禁止裸 hex**——写死颜色在暗色主题下会瞎。
4. **文件位置与命名**：`<物料目录>/figures/<id>.svg`，`<id>` 由构建输出给定
   （`<章节锚点>-<块序号>`，如 `A3-1`）。figures/ 是**物料**（agent 产出、随 git 管理），
   不是生成物——不会被 `--build` 覆盖。

## 模板与技法

```svg
<!-- pact:src-hash=xxxxxxxxxxxx -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 400" font-family="inherit" font-size="13">
  <defs>
    <marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0,0 L8,4 L0,8 z" fill="var(--fg-faint)"/>
    </marker>
  </defs>
  <!-- 分区（如 内网 / DMZ）：底色块 + 左上角标签 -->
  <rect x="8" y="8" width="500" height="380" rx="10" fill="var(--bg-soft)" stroke="var(--line)"/>
  <text x="24" y="32" fill="var(--fg-faint)" font-size="12" letter-spacing="2">县医院内网</text>
  <!-- 节点：圆角矩形 + 居中文字 -->
  <rect x="40" y="60" width="150" height="44" rx="8" fill="var(--panel)" stroke="var(--line)"/>
  <text x="115" y="86" text-anchor="middle" fill="var(--fg)">hcp-core</text>
  <!-- 连线：带箭头，标注写线中点上方 -->
  <path d="M190,82 H300" stroke="var(--fg-faint)" stroke-width="1.4" fill="none" marker-end="url(#ar)"/>
  <text x="245" y="74" text-anchor="middle" fill="var(--fg-dim)" font-size="12">HTTPS</text>
</svg>
```

- **viewBox 定尺寸，不写 width/height**（页面 CSS 控制 `max-width:100%`，自动缩放）。
  宽度以 860 为基准（正文栏宽）；高度按内容，行高留足（节点高 ≥40，纵向间距 ≥28）。
- **字号**：正文 13，注解 11–12；`font-family="inherit"` 继承页面字体（含中文字形）。
- **布局对应文本源的语义**：树 → 纵向缩进或自上而下分层；泳道/角色流程 → 每角色一列，
  步骤自上而下；部署拓扑 → 分区块 + 区内节点 + 跨区连线（网闸/防火墙画在分界上）。
- 文字必须可读：节点框宽随文字撑开（估中文字符 13px/字），宁可图大不可截断。
- 复查：重跑 `pact-book.sh <物料目录>`——「图形化待办」清单消失、无过期告警即完成；
  在浏览器里明暗两个主题各看一眼。

## 什么算图块（构建的判定规则，写图前先对号）

- ```` ```mermaid ```` 块：一律要图。
- 无语言（或 text/txt/ascii）代码块，含 **≥2 行**框线/箭头字符
  （`─│┌┐└┘├┤┬┴┼═║╔╗╚╝▲▼◀▶←→↔⇄` 或 `-->`）：判为 ASCII 图，要图。
- 其他代码块（接口示例、SQL、配置等）：不是图，保持代码呈现。
