# 大肥鱼 Plus

![](./docs/name.png)

这是在 Coopanion 桌宠 **0.2.9 或更高版本** 里使用的形象包。从内置的 DeepSeek 大肥鱼形象包复制而来，包含其所有配色和形象。

特点：把以前靠「窗口能力包」补丁加进去的**飞行、游泳、站窗口顶、抱窗边爬、翻上窗口顶、趴窗口看**，全部改成由形象包自己实现。

## 怎么使用

**导入这个形象包：**

1. 下载本项目的文件夹，或者[点击把源代码下载为 zip 压缩包](https://github.com/xuejianxianzun/Coopanion-DeepSeek-Whale-Plus/archive/refs/heads/main.zip)。
2. 打开 Coopanion 设置界面，点击「装扮」页面；
3. 把本项目的文件夹或压缩包拖拽进去；也可以点击「形象」一行最后的「导入」按钮来导入；
4. Coopanion 会显示一个确认窗口，点击「导入」按钮，就添加了这个形象包；
5. 手动切换到这个形象包即可使用。

当本形象包发布了新版本之后，你需要重新下载、导入，以升级本地的这个形象包。

**飞行或游泳：**

可以通过对话发送命令让她飞行或游泳。想让她一直飞的话，说 `自由飞翔`（或 `一直飞`），她会一直在天上换落点飞；想让她一直游的话说 `自由泳`（或 `一直游`）。只说 `飞` / `游泳` 而不加 `自由` / `一直`，则只飞一小段、游一会儿就自己落下 / 上岸。要叫她下来，说 `降落`（游泳时说 `上岸`）。

**爬窗口：**

在你打开了非最大化的窗口之后，她会跑过去并抱住窗口边缘往上爬；也可以把它拎起来甩到窗口边缘，她会自动抱住边缘。

如果窗口顶部有足够空间，她爬到顶部之后会翻上去，在窗口顶部行走。你也可以直接把她拎到窗口顶部，但也需要有足够空间。

## 预览动作

攀爬：

https://github.com/user-attachments/assets/669cac02-a9ce-4881-835e-4e7c2ded2801

飞行：

https://github.com/user-attachments/assets/cb310c8f-1485-4426-a5a6-ba4737926336

游泳：

https://github.com/user-attachments/assets/02bd0c4f-3c94-430f-8670-762fda87d127

大肥鱼在飞行、游泳过程中会自己改变方向、角度、速度。

不过由于桌宠只有正面视角，所以游泳动作有点抽象，意思到了就行（doge）。

## 多出的能力

| 类别 | 词 |
| --- | --- |
| 飞行（13） | `fly` 悬停、`soarhold` 一直飞（`自由飞翔`）、`soar` 飞一小段、`soarleft` `soarright` `soarup` `soardown`、`soarfast` `soarslow` `soarauto`、`soarfastleft` `soarfastright`、`soarstop` 降落 |
| 游泳（9） | `swim` 短游、`swimhold` 一直游、`swimstop` 叫停、`swimleft` `swimright` `swimup` `swimdown`、`swimfast` `swimslow` |
| 窗口顶（1） | `perch` 站到最近一扇窗口的上沿；`pet_move_to` 的目标 `windowtop` 是同一件事 |
| 窗口侧边（7） | `climb` 抱住窗边往上爬、`climbup` 继续往上、`climbdown` 往下、`cling` 抓住不动、`letgo` 松手落地、`mantle` 翻上窗口顶、`peek` 趴窗看 |

所有词都是 `pet_act` 的动作词，中文、英文和动作名都认（比如「自由泳」/ freestyle / `swimhold`，
「翻上去」/ vaultup / `mantle`）。

窗口能力来自形象包清单：

```json
"needs": ["windows"],
"moves": [{ "id": "windowtop", "name": { "zh": "站到窗口上", "en": "stand on a window" }, "about": { ... } }]
```

声明 `needs: ["windows"]` 之后，页面每 0.7 秒把桌面上可见的窗口交给形象包：

- `bounds().ledges`：每条窗口顶边里**没被前面的窗口挡住**的那些段，`[{ x0, x1, y }]`；
- `bounds().windows`：整扇窗，前到后，`[{ id, x0, y0, x1, y1, active }]`（被挡住的、超出舞台的部分也在里面）。

`figure.js` 每帧把两样都过一遍：`ledges` 直接换成 `perch-physics` 的窗台面；`windows` 交给
`window-edges.js` 裁出**能抱的竖边**，再喂给 `climb-physics`。所以窗口被拖走时她跟着走，
窗口关掉会松手落地。

---

## 形象包信息

- 包 id：`deepseek-whale-plus`
- 名字：大肥鱼 Plus
- 形象包的版本：1.1.8（= 上游 0.2.15 的形象包 + 本包自己的飞行/游泳/窗口/作息功能）
- 依赖：Coopanion 0.2.9 及以上的形象包接口（`manifest: 2`、`api: 2`，窗口矩形随 `needs: ["windows"]` 下发）

## 同步上游

从内置 `web/whale/` 复制之后，官方每次改形象都会同步进这个包（只搬素材和与动作无关的改动，
自己的飞行/游泳/窗口代码不动）。

复查方法：把 `web/whale/` 与本包逐目录比一次（`tex` `schemes` `outfits` `feat` `thumbs` `model.json`
，以及 `web/kit/` 的 `rig.js`），`figure.js` 因为带了功能补丁不能直接比，改成先看上游两个 tag 的
`diff`，再把新出现的 hunk 手工贴进来。

最近一次同步：**0.2.12 → 0.2.15**（2026-10-29），内容是 0.2.14 的「大肥鱼的眼睛高光会动」（#258）
和 0.2.15 对它的修正（#504：虹膜形状与位置改回原样，只把高光从贴图里拿掉）。搬过来的东西：

- 新增 `feat/eyeL_hl.png`、`feat/eyeR_hl.png`：两只眼的高光各成一张贴图；
- 换掉 `feat/eyeL_iris.png`、`feat/eyeR_iris.png`（原版配色的虹膜，去掉烘在里面的高光）；
- `model.json`：`feat.eyes.eyeL/eyeR` 各多一个 `hl` 框，`schemes[0]`（原版配色）多一个
  `eyeHighlights: true` —— **只有原版配色开**，其他 7 套配色的眼睛与旧版一样；
- `figure.js`：高光单独画（`paintOpenEye` 里那段），跟着视线与转头弹一下（`hlX`/`hlY` 弹簧）、
  眨眼开合时被眼皮压住、并按表情变大小与抖动（`HL_MOOD`：难过/担心/害羞放大颤动，生气/认真缩小，
  睡意/满足时变淡）。

再往前一次：**0.2.9 → 0.2.12**（2026-10-27），内容是 0.2.12 的「大肥鱼的裙影」（#388）——
被拎起或走动时，腿上不再有一条跟着腿走的暗带。搬过来的东西：

- 新增部件 `skirt_shadow`（`tex/skirt_shadow.png`、`outfits/crew/skirt_shadow.png`），
  `parent: "skirt"`、`blend: "multiply"`，坐下时随 `skirt` 一起淡出；
- 重画 `leg_back` / `leg_front`：本体、`schemes/` 里 7 套配色、`outfits/crew/` 各一对；
- `model.json` 的两段部件定义（女仆装本体 + 店員装）；
- `kit/rig.js` 新增 `blend: 'multiply'` 支持（`blendFuncSeparate(DST_COLOR, ONE_MINUS_SRC_ALPHA)`）；
- `figure.js` 里 `st.alpha.skirt_shadow = 1 - sitIn` 这一处。

**`rig.js` 要跟着同步的理由**：0.2.9–0.2.11 的应用里没有 multiply 混合，裙影会被当成普通贴图叠上去，
在她轮廓外留下一块灰。所以这个包不再借应用 kit 的 `createRig`，改用自己的 `rig.js`
（`figure.js` 里那一行），老版本应用上也画得一样。

## 文件

| 文件 | 作用 |
| --- | --- |
| `figure.json` | 形象包清单：名字、配色/服装、67 个词、`needs` 与 `moves` |
| `figure.js` | 鲸鱼的画法（原来的 `web/whale/figure.js`），入口 `createWhaleBody`，并把窗口数据喂给身体 |
| `body.js` | 从桌宠包 `web/kit/body.js` 复制并扩展：飞行、游泳、站窗台、抱窗边 |
| `perch-physics.js` | 窗台物理（窗口顶边） |
| `climb-physics.js` | 窗边物理（抱、爬、跟窗移动、边没了就松手） |
| `window-edges.js` | 把整扇窗裁成能抱的竖边（遮挡、贴边、太短都处理掉） |
| `rig.js` | 骨骼绘制（`figure.js` 的依赖）：应用 0.2.12 的 `web/kit/rig.js`，带 `multiply` 混合 |
| `model.json` `tex/` `schemes/` `outfits/` `feat/` `thumbs/` | 原形象的素材 |

## 攀爬参数

都在 `window-edges.js` 顶上，可自己调。

官方给的是整扇窗，哪些边真的能抱、能抱多长，得包里自己算。`windowEdges(windows, { width, floor })`：

| 参数 | 默认 | 含义 |
| --- | --- | --- |
| `gutter` | 56 | 框线外侧要留出的舞台宽度：她挂在框**外**，贴屏幕边的竖线会被丢掉 |
| `margin` | 8 | 窗口上下各留出的余量，不让她抓光秃秃的角 |
| `minRun` | 140 | 一段边短于这个就不值得抱（含被前面的窗口切剩下的碎段） |
| `max` | 96 | 一次最多报多少段 |

算法（和旧补丁 `climb-geometry.cjs` 同一套）：按 front → back 遍历，每扇窗贡献左右两条线；
前面的窗只要横跨这条线，就按它的上下沿把线切开；切完按 `minRun` 过滤、按 `top` 排序；
一段以上的编号 `#0/#1`，`roof` 只在「这段顶端就是窗口自己的顶边」时为真——
被前面的窗从上面切断的那段，爬到顶也不能翻上屋顶，否则会从半空翻到不存在的窗沿上。

每条边的字段：`id`（`窗口id:l/r`）、`x`、`top`、`bottom`、`side`（+1 左框、-1 右框）、
`headY`（窗口真顶边）、`roof`、`origin`（窗口左沿，用来跟窗横移）、`reach`、`width`、`active`。

`body.js` 里的攀爬本身来自旧补丁的 `climb-physics.js`：抱着时她的中线落在框外约 45px，
`TURN_GAP = 2` 的转向冷却、`climbPace` 的爬速也都还在。

## 和原包的区别

- `id` 改成 `deepseek-whale-plus`（内置的 `whale` 不能被覆盖）；
- `name` 改成「大肥鱼 Plus」（`Whale Plus`），`about` 补了会飞会游泳会爬窗的说明；
- `vocab` 从 37 个词扩到 67 个（原 37 + 飞行 13 + 游泳 9 + 窗口顶 1 + 窗口侧边 7）；
- 新增 `needs: ["windows"]` 与 `moves: [windowtop]`；
- `figure.js` 改用包内自带的 `body.js` / `rig.js`，不再依赖应用里的 `kit`（`rig.js` 是 0.2.12 的
  `web/kit/rig.js`，比老版本应用多一个 `multiply` 混合，裙影靠它）；
- `figure.js` 补上了游泳 / 飞行 / 攀爬的姿态（`swimK`、`swimPhase`、`climbK`、`GROUP` 里的
  `swimming` / `flying`，手脚和尾巴的动作），不会竖直站着游 / 飞，抱着窗边也不是站姿；
- 配色（8 套）、服装（3 套）、表情、动作、贴图都和原版一致；上游 0.2.12 的裙影（`skirt_shadow` 部件）
  和 0.2.14/0.2.15 的眼高光（`eye*_hl` 贴图 + `eyeHighlights`）也是原样搬过来的。

## 打盹与作息的修改

以前她打盹太勤（实测空闲 10 分钟里坐 19 次、睡 7 次），而且 `sit` / `sleep` 两个词是「一直保持」的：
模型夜里叫一次 `sleep` 就睡到天亮，白天叫一次 `sit` 就坐一下午。现在按作息分了白天和夜里：

| | 白天（07:00–23:00） | 夜里（23:00–07:00） |
| --- | --- | --- |
| 自己坐下 | 8–12 秒，只是歇一下，**不会再睡过去** | 90–180 秒的**打盹**（闭眼、到点自己起身） |
| 「坐下」权重 | 9（原来 16） | 12 |
| 两次自主打盹之间 | 至少 **4 分钟** | 至少 **8 分钟** |
| 说「坐下」(`sit`) | 最多坐 **90 秒** | 最多坐 **180 秒** |
| 说「睡觉」(`sleep`) | 最多睡 **3 分钟** | 最多睡 **8 分钟** |

- 到点都是 `wake`（起身/打哈欠），不会一直不动；开着对话框也照起（旧版这时会一直睡下去）。
- 被戳、被拖、新指令仍然立刻打断，和以前一样。
- 想改回来或调松，用 `set({ tune })`（整份替换）：

```js
tune: {
  nightFrom: 23, nightTo: 7,          // 作息分界（可带小数，比如 22.5）
  napCool: [240, 480],                // [白天, 夜里] 两次自主坐下/打盹的最短间隔
  napLen: [90, 180],                  // 夜里一次打盹的时长区间
  sitWeight: [9, 12],                 // 自主「坐下」的权重
  sitMax: [90, 180],                  // 说「坐下」最多坐多久，0 = 一直坐
  sleepMax: [180, 480],               // 说「睡觉」最多睡多久，0 = 一直睡
}
```

词表里 `sit` / `sleep` 的说明也改成了「歇一会儿就自己起来 / 打盹几分钟就醒」，
模型读到的就是这句，不会再指望她整夜不动。

## 已知限制

- **窗口数据 0.7 秒一次。** 拖窗口拖得很快时，她的跟手会有一点点滞后；窗口关掉后约 0.6 秒松手。
- **主副屏缩放不一样时，副屏上的窗口坐标会偏（Coopanion 0.2.10 的问题，已在应用侧）**：
  应用给的 `windows` 矩形用的是系统 DPI 的逻辑坐标，而原点用的是每个屏自己的 DIP，
  只在不同缩放（比如主屏 125%、副屏 175%）时对不上 —— 表现是她在副屏上「贴着窗口中间往上爬」，
  站窗沿也会偏。两屏缩放相同就正常。详细数据和修法见 `docs/bug-windows-multidpi.md`。
- **到顶自己翻上去的时机（v1.1.4）**：脚踩到「头顶齐窗口上沿」的那一刻（`4 × S` 容差）立刻掷第一次；
  掷中后再停 **0.5 秒**（像在掂量）才起跳。没掷中就**在顶上接着掷**，每 1.2 秒一次、一趟最多 3 次
  （3 次都不中约 2.7%），所以基本不会再出现「爬到顶又白爬下来」。三次都没中才往下滑，
  滑下来后 12 秒内不会被自动送上去。
  到顶那一刻能不能翻，还取决于窗口上方够不够高：窗沿要离屏幕顶 `250 × S` 以上，否则她只冒个「?」不跳
  （2 倍体型时这个门槛是 210px，默认体型 105px）。
- **窗顶太低的不站。** `perch` / `mantle` 要求窗沿在 `250 × S` 像素以下（默认约 105px），
  否则她的头会顶出屏幕——这是旧补丁就有的规矩。
- **太靠屏幕边的竖边抱不了。** 左边线到屏幕左沿不足 `gutter`（56px）就丢掉，因为她挂在框外。
- **只能看见窗口的边框。** 形象包在沙箱里跑，读不到窗口标题、进程名或窗口里的内容；
  「趴窗口看」是姿态，不是真的读到了什么。
- 没有窗口可站时，`perch` / `windowtop` 会回 `false` 或 `interrupted`，她留在地面。
- **她也会自己去看。** 你在一个窗口里连续操作约 5 秒，她可能自己爬上来守着看（旧补丁的行为）。
  不想要的话，在 `body.js` 里搜 `tune.autonomy === false`，把 `tune` 的默认值改成 `{ autonomy: false }`，
  或让 World 调 `set({ tune: { autonomy: false } })`。
- macOS / Linux 未实测；macOS 的窗口数据没有 `active`，所以「守着你正在用的那扇窗」在那边不会触发。
