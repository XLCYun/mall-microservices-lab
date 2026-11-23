# 课堂备用 PPT 制作源码

这套脚本将七个课堂实验编排成 82 页 PowerPoint，其中 30 页内嵌地图演示视频。课件取材于网页提交 `7a5ee83`。该版契约测试演示订单和商品服务如何验证库存接口。后续加入的 Pact Broker 流程可在同一发布页的离线 HTML 中查看。[下载课件和离线 HTML](https://github.com/XLCYun/mall-microservices-lab/releases/tag/classroom-2026-11-24)

| 要修改的内容 | 对应文件 |
| --- | --- |
| 逐页文案、版式、目录和讲者备注 | `content.cjs`、`build.cjs` |
| 每段录屏的时长、操作顺序和字幕 | `scenes.py`、`scenes.json` |
| 网页取材、地图录制和视频压缩 | `sources.py`、`extras.py`、`record.py`、`renderer.js`、`testing_dashboard.js`、`limited.py` |
| 视频点击播放、字体嵌入和成品校验 | `media_timing.py`、`font_embed.py`、`audit_media.py`、`render_audit.py` |

## 取材与录屏

从仓库根目录进入本目录。制作环境使用 Node.js、PptxGenJS 4.0.1、Python 3、桌面版 Chrome 和 FFmpeg（含 ffprobe）。Python 依赖包括 `playwright`、`Pillow`、`python-pptx`、`lxml` 和 `fonttools`。导出 PDF 核对版式时还会用到 LibreOffice 和 `PyMuPDF`。

```sh
cd tools/classroom-ppt
git show 7a5ee83:dist/index.html > classroom.html
mkdir -p meta visual poster clips clips-limited out qa/fonts
python3 sources.py
python3 extras.py
python3 record.py
python3 limited.py
```

单独重录一段可运行 `python3 record.py phone-stage`。录制器会跳过已有 MP4 和记录的片段，重录时先移走该片段在 `clips/` 和 `meta/` 中的同名文件。修改 `scenes.py` 后，运行下面的命令同步排版脚本读取的分镜配置。

```sh
python3 -c 'import json, scenes; print(json.dumps(scenes.S, ensure_ascii=False, indent=2))' > scenes.json
```

## 生成 PowerPoint

录制器将视频封面写入 `poster/`。排版使用 JPEG 封面，课件首页还会用到多实例地图的裁切图。

```python
from pathlib import Path
from PIL import Image

for path in Path("poster").glob("*.png"):
    with Image.open(path) as frame:
        rgb = frame.convert("RGB")
        rgb.save(path.with_suffix(".jpg"), quality=90)
        if path.stem == "registry-join":
            rgb.crop((0, 0, 1152, 540)).save("poster/registry-join-map.jpg", quality=90)
```

将 Noto Sans SC 的可变 TTF 字体保存为 `qa/font-variable.ttf`。字体许可随源码保存为 `OFL-NotoSansSC.txt`。[字体下载页](https://github.com/google/fonts/blob/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf)

```sh
node build.cjs
python3 media_timing.py
python3 font_embed.py out/classroom.pptx out/complete.pptx
python3 audit_media.py
```

成品路径为 `out/complete.pptx`。要核对版式，可将成品导出为 `qa/portable/complete.pdf`，再运行 `python3 render_audit.py` 检查各页文字、图片和边界。
