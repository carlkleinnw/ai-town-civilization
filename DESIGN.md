---
name: "AI 人类文明演化模拟器"
description: "沿用像素游戏风格的本地文明观察与操作界面"
colors:
  civ-ground: "#251f29"
  civ-panel: "#342832"
  civ-inset: "#29222b"
  civ-line: "#68504f"
  civ-text: "#f0e4d0"
  civ-muted: "#c6b4a6"
  civ-gold: "#f2cd83"
  civ-green: "#9bceb6"
  control-bg: "#49363e"
  control-border: "#92726a"
  control-hover: "#62464a"
  primary-ink: "#30252c"
  primary-hover: "#ffe1a6"
  field-label: "#e3d4c3"
  field-placeholder: "#b09b91"
  map-frame: "#78574e"
  map-heading: "#413039"
  map-ground: "#314833"
  map-legend: "#302a2c"
  forest-legend: "#9ab36a"
  water-legend: "#689bac"
  fog-legend: "#1e2e27"
  fog-border: "#6c7b69"
  progress-track: "#574246"
  status-bg: "#5a4544"
  completed-text: "#bbe9cb"
  completed-bg: "#3b5447"
  failed-text: "#ffcfb9"
  failed-bg: "#684337"
  executing-text: "#f5deb8"
  executing-bg: "#69523a"
typography:
  display:
    fontFamily: "'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "0.015em"
  display-en:
    fontFamily: "'Upheaval Pro', sans-serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.015em"
  headline:
    fontFamily: "'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.5
  title:
    fontFamily: "'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.65
  body:
    fontFamily: "'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.65
  metric:
    fontFamily: "'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "25px"
    fontWeight: 650
    lineHeight: 1.6
rounded:
  square: "0px"
spacing:
  compact: "6px"
  control-gap: "8px"
  small: "12px"
  medium: "16px"
  section: "20px"
  large: "24px"
  page: "28px"
components:
  button-primary:
    backgroundColor: "{colors.civ-gold}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.square}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.primary-ink}"
  button-secondary:
    backgroundColor: "{colors.control-bg}"
    textColor: "{colors.civ-text}"
    rounded: "{rounded.square}"
    padding: "9px 14px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.civ-gold}"
    padding: "2px 4px"
  field:
    backgroundColor: "{colors.civ-inset}"
    textColor: "{colors.civ-text}"
    rounded: "{rounded.square}"
    padding: "9px 11px"
    width: "100%"
  tab-current:
    backgroundColor: "{colors.civ-panel}"
    textColor: "{colors.civ-gold}"
    padding: "14px 20px"
  status:
    backgroundColor: "{colors.status-bg}"
    textColor: "{colors.civ-gold}"
    padding: "2px 7px"
  inspector:
    backgroundColor: "{colors.civ-panel}"
    textColor: "{colors.civ-text}"
    padding: "22px"
  map-heading:
    backgroundColor: "{colors.map-heading}"
    textColor: "{colors.civ-gold}"
    padding: "10px 15px"
---

# Design System: AI 人类文明演化模拟器

## Overview

现有视觉方向：**沿用原项目像素游戏风格。** 这是已确认的风格边界，不另设品牌隐喻。本记录依据 `src/civilization/` 当前代码，覆盖全屏文明观察（Experience）和创建、设置与工作台操作（Operate）。原聊天小镇仍保留自己的像素边框资源与样式，不能据此文档批量改色。

深梅色底承载密集但可追溯的数据；暖金色突出行动、时间、标题和当前选择。文明地图以专属像素几何绘制地形和建筑，复用原项目植物素材与人物精灵；周围操作区采用方角边框和清晰中文系统字体。像素感来自地图、轮廓和现有英文标题字体，不要求把中文正文像素化。

**Key Characteristics:**

- 梅色背景、金色操作、浅暖文字。
- 方角、细线分区与清晰的悬浮操作。
- 像素地图与可读的中文数据面板并存。
- 以真实状态、文字标签和记录解释模拟结果。

## Colors

前置 YAML 是复用颜色的规范值；实际 CSS 变量定义在 `.civ-app`，没有提升到全局 `:root`。这里抽取的是复用界面颜色，未把每个地图染色、图表线色或一次性警告色提升为公共 token。

### Primary

- **暖金色（civ-gold）**：主按钮、标题、链接、当前导航、时间与键盘焦点。
- **浅金悬停色（primary-hover）**：主按钮悬停反馈；主按钮文字保留深梅色。

### Secondary

- **浅鼠尾草绿（civ-green）**：运行中状态、进度条、知识积累和统计补充信息，不代替主要操作色。
- **地形图例色**：林地、水域、迷雾分别使用已有的绿、蓝和深绿色；施工图例采用金色空心方框。

### Neutral

- **深梅底（civ-ground）**、**梅色面板（civ-panel）**、**内嵌暗底（civ-inset）**：分别用于页面、统计/详情/工作台内容区、输入与图表底。
- **暖浅文字（civ-text）**与**柔灰文字（civ-muted）**：区分主要信息、注释与标签。
- **棕梅分割线（civ-line）**和**地图棕边（map-frame）**：划分信息层级；地图棕边是原内嵌地图框的保留色，不用于当前全屏画布。
- 完成、失败、执行中徽标保留各自背景和文字色，同时显示状态文字。

**The State Text Rule.** 状态必须同时用文字表达；运行点、进度色和徽标颜色不能成为唯一依据。

## Typography

**Display Font:** 工作台中文沿用已安装的 Microsoft YaHei UI / Microsoft YaHei / system-ui；工作台英文主标题使用项目已有的 Upheaval Pro，资源由 `src/index.css` 注册。世界悬浮标题的两种语言均采用（19px）的 Microsoft YaHei / system-ui。

**Body Font:** 文明操作界面两种语言的正文均使用中文可读的系统 sans-serif 栈。原聊天小镇的 VCR OSD Mono 不是文明正文的字体。

### Hierarchy

- **Display**：工作台主标题采用 `display`；工作台英文标题切换 `display-en`。窄屏中文标题降至（19px）；世界悬浮标题两种语言固定为（19px）。
- **Headline**：章节标题采用 `headline`；详情标题局部为（18px），文明时钟标题为（23px）。
- **Title**：金色小节标题采用 `title`，以额外上边距分组。
- **Body**：正文采用 `body`，段落行高提高至（1.8），最大宽度（75ch），允许长文本换行。
- **Label**：表单标签采用 `label`；注释通常为（12px），事件类型与状态徽标为（11px）。
- **Metric**：统计值采用 `metric`；全界面使用等宽数字排列（tabular-nums）。

创建世界的引导标题是已有局部样式（34px / 1.7），在窄屏降至（27px）；不要把它套给所有章节。

**The Readable Chinese Rule.** 中文正文与操作标签保持系统字体；只对工作台英文主标题使用 Upheaval Pro，不下载新字体。

## Layout

本轮把观察与管理分成两页，沿用已有颜色、字体、间距、方角和像素资产。

- **世界页 `/ai-town/`（Experience）**：画布占满 `100dvh`。顶部距边（16px）的实体色悬浮条显示世界名、日期、小时、时代、运行与倍率、工作台入口。地图默认按覆盖视口的比例缩放，适合观察人物；全图按钮提供总览。左下是地图操作，右下是人物/建筑/工地定位，底部只显示少量状态和原小镇入口。
- **详情**：桌面右侧宽（340px），顶部（115px），最大高度 `calc(100dvh - 190px)`，独立滚动。手机改为贴底面板，最大高（54dvh）；打开详情时隐藏底部定位、镜头、摘要及待决策入口，关闭后恢复。定位与跟随按 HUD 与详情之外的可见地图区域计算中心，避免实体被遮挡；HUD 或详情尺寸改变时重新定位。
- **工作台 `/ai-town/workbench/`（Operate）**：保留（28px）页边、世界选择、时间、统计、导航与管理面板；移除原内嵌地图。实体详情按选择出现，最大高（450px）。详细表单、长日志、家谱、存档、比较均在此。
- **窄屏（max-width: 800px）**：世界 HUD 距边（8px）并换行，标题保持（19px）的中文系统字体，英文也使用同样可读尺度；定位选择最大宽（140px）。工作台保持（16px）页边、三列统计和单列主要表单区域。表格及标签导航各自横向滚动，文档不横向溢出。
- **紧凑桌面（max-width: 1100px）**与宽屏（min-width: 1800px）的原工作台间距、统计与页边调整继续生效；不把这些页面留白套给全屏世界。

地图逻辑范围为 24×16 保存地块，画面为（1536×1024）、每格（64px），不改写旧坐标。文明专属渲染器绘制地形、资源及五类建筑，只复用原项目人物与植物像素素材，不加载原聊天小镇的固定地图。由 Pixi viewport 处理拖动、双指、滚轮与缩放。首次默认缩放不低于 1，避免手机上把人物缩成小点；这不是手动缩放下限，全图和手动缩放仍可缩小，已有有效镜头优先恢复。新镜头另存为 v3 本机设置，不删除旧镜头。创建表单继续使用原两栏与窄屏单栏布局。

## Elevation & Depth

文明界面没有阴影、玻璃模糊或渐变层。深度来自暗底、梅色面板、内嵌输入底、细线与实体色悬浮条；不要把原聊天小镇的标题投影和图像边框误记为此界面的通用样式。

地图保留离散像素轮廓。人物移动按现有渲染器插值，最高（30fps）；减少动态偏好启用时直接到位并停用行走帧切换。操作控件没有额外过渡动画。

## Shapes

按钮、输入、进度条与徽标采用方角。普通面板和输入使用（1px）边框，世界 HUD 与悬浮详情使用（2px）边框，创建容器保留（4px）边框；全屏画布不套内嵌地图框。运行提示点和图例也以方块呈现。焦点为金色实线（3px），向外偏移（3px），保留清楚可见的键盘定位。

## Components

### Buttons

主按钮金底深字、加粗；次按钮使用梅棕底与浅字。按钮默认最小高（40px），内边距见 token。次按钮悬停变浅并切换金边；主按钮悬停改浅金。禁用态透明度（0.45）且使用普通光标。图标为现有内联 SVG，通常（18px），保持方正描边。当前实现没有独立按下态视觉。

### Inputs / Fields

输入、选择和文本域使用暗内嵌底、细边框、浅文字，最小高（42px）；标签在上，间距（6px）。文本域最小高（92px）且允许纵向调整。占位符使用既有柔棕色；焦点沿用全局金色轮廓，不加发光。复选框保持原生语义与金色 accent。

### Navigation

工作台内容导航以按钮切换实际内容，当前项由 `aria-current="page"` 表示，金字与梅色面板连接。默认标签灰字、透明底、上和左右透明边框；横向空间不足时在导航内滚动。工作台中英切换另用 `aria-pressed` 和金色选中底；世界悬浮条使用显示目标语言的单按钮。

世界页用金底入口前往工作台，底部用金色文字链接进入原聊天小镇。原聊天小镇新增顶端导航条，沿用梅色底、暖浅文字与金色下划线链接，明确提供文明工作台和文明世界两个入口；窄屏（max-width: 600px）将说明文字单独成行。该导航条使用可读系统字体与金色键盘焦点，不改变原小镇其余视觉。

### Chips

状态徽标是方角、紧凑的非交互标签。基础态用金字梅棕底；完成、失败、执行中使用各自既有颜色。徽标内容必须来自实际状态，不为装饰添加随机状态。

### Cards / Containers

详情区与下方内容区共用梅色面板和细线边界；统计栏是连成一体的分栏区域，不是五个漂浮卡片。详情内部用文字、分割线、键值对与细进度条组织信息。进度和健康仪表高（6px），绿色填充、暗棕轨道。

### Pixel World Map

地图关闭抗锯齿，复用的植物和人物精灵采用 nearest 采样，画布使用 `image-rendering: pixelated`。地形、石料、食物及建筑由文明专属像素几何绘制；住所、粮仓、工坊、学校和农田各有可区分轮廓。文明世界不再套内嵌地图框，使用全屏画布与方角悬浮操作。人物、地块、建筑、施工框可选；桌面右侧与手机底部提供可关闭详情，定位选择也提供键盘可达的实体入口。

人物外观由保存的稳定 ID 确定；任务图标和携带物随真实任务及携带状态显示，选中人物时显示姓名、当前活动、已有路线和任务目标。建筑使用人数只计实际到场且处于使用阶段的人物。施工轮廓随已投入材料与劳动进度显示地基、框架、主体和封顶，并以文字和进度条辅助说明；没有投入材料时不画出已建成房屋。

地块资源量驱动植物、石料和食物显示；已被建筑或工地占用的地块将剩余资源显示为角落小标记，不用树木遮住建筑，也不暗示资源已被自动清除。选中金框、未探索遮罩、农作物阶段、低耐久裂纹和遗址同样来自模拟状态。界面不以装饰性漫游、虚构道路、生成图片或预置成熟聚落代替实际成果；建筑占地仍为（1×1）地块，不借画面暗示已有室内场景或逐人搬运建材。

## Do's and Don'ts

### Do:

- **Do** 延续梅色背景、金色操作、方角轮廓与已有像素地图。
- **Do** 使用中文可读的系统字体、等宽数字和清晰的文字状态。
- **Do** 保留可见焦点、表单标签、导航当前项与列表中的实体入口。
- **Do** 根据既有断点调整布局，在表格与导航自身处理横向滚动。

### Don't:

- **Don't** 新设品牌、下载字体或以生成效果图替代当前实现。
- **Don't** 把文明操作区改成圆角浮卡、玻璃面板或渐变发光控件。
- **Don't** 平滑或模糊像素素材，也不要将英文像素字体强套中文正文。
- **Don't** 将当前文明界面的 token 自动应用到原聊天小镇，或把模拟未发生的成果绘为已完成。
