# 生成插图

本目录为项目实际使用的生成插图，使用内置 `image_gen` 工具制作，共 12 张场景与 1 张呼吸圆环。完整提示词见 [generation.json](generation.json)。无外链图片、无人物肖像、无烟草或点火线索。

| 文件名 | 场景 | 用途 |
| --- | --- | --- |
| mist-lake | 湖上有雾 | 默认首页与抽后继续 |
| morning-coast | 海边清晨 | 场景库与首页入口 |
| bamboo-light | 竹间微光 | 场景库与手部练习 |
| cloud-mountain | 山间云开 | 场景库与可选首页 |
| rainy-window | 窗边听雨 | 场景库与可选首页 |
| forest-path | 林间慢走 | 离开工位练习 |
| quiet-night | 晚风与星 | 场景库与可选首页 |
| river-stones | 溪水与石 | 回到当下练习 |
| tea-notebook | 给自己留白 | 写下下一步练习 |
| water-break | 喝一口水 | 仍有烟瘾时的支持 |
| new-leaf | 新叶 | 空记录、帮助页 |
| paper-boat | 继续往前 | 练习后的支持 |
| breath-ring | 水彩呼吸圆环 | 呼吸与手部互动 |

场景文件为 1200px 宽 WebP，另有 360px 宽 `-thumb.webp`，圆环为 640px 宽。仅做格式转换和尺寸优化，没有程序重绘生成画面。原始 PNG 保留在生成工具的原始目录；站点消费的全部素材都已复制为本目录内的独立文件。

需要重新准备文件时，给 `scripts/prepare-art.mjs` 传入一个包含 `id` 和本地 PNG `source` 的 JSON 数组。不要把个人原始文件路径或记录写入公开仓库。
