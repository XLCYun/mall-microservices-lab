# 商城大促值班夜 · 微服务演练场

一套可在课堂投影、电脑和手机上操作的中文微服务模拟。晚八点大促开售，学生从商品服务点名出发，依次处理网关流量、容量、慢评论和两项测试，最后可以尝试灰度发布。

**[打开在线演练](https://xlcyun.github.io/mall-microservices-lab/)**，或下载后直接打开 [dist/index.html](dist/index.html)。 这一个文件包含所有脚本、样式和拓扑绘制代码，可以离线分发。助教可参阅[课堂使用说明](课堂使用说明.md)。

## 课堂操作

- 用顶部场景栏、“剧情目录”或“下一幕”切换。网关、扩缩容等场景支持暂停、单步和变速。测试场景的单步分别推进一条用例或一步契约验证。
- 每幕首次进入时保存一份开场快照。从扩缩容顺接到容错时，已就绪的商品实例会进入下一幕。直接打开容错场景则从两台商品实例开始。
- 切幕会暂停播放并保存这一幕的现场。“重置本幕”恢复该幕的开场快照，清空本幕回答和结果卡。其他幕的现场保留在本次打开的页面中。刷新会开始一场新演练。
- 学生可填写“课堂记录”，生成并下载结果卡 PNG。手机号用例支持 CSV 导入、导出。全站使用浏览器本地的模拟数据。

## 构建与验证

需要 Node.js 20 或更新版本，构建和验证均使用 Node.js 标准库。

```sh
node verify.mjs
node build.mjs
```

源文件位于 `src/`，完整可发布站点位于 `dist/`。如果需要本地 HTTP 预览，可运行下列命令并打开终端显示的地址。

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

## 发布到 GitHub Pages

仓库的 `main` 分支保存源码和构建产物。`gh-pages` 分支只包含 `dist/` 的内容，Pages 从该分支的根目录发布。在本地构建并提交后，可用以下命令更新站点。

```sh
git push origin main
git subtree push --prefix dist origin gh-pages
gh api 'repos/{owner}/{repo}/pages' --jq '.html_url'
```

首次启用 Pages 时，在已推送 `gh-pages` 的仓库中运行一次：

```sh
gh api --method POST 'repos/{owner}/{repo}/pages' -f 'source[branch]=gh-pages' -f 'source[path]=/'
```

场景有独立的地址片段，包括 `#registry`、`#gateway`、`#scale`、`#resilience`、`#phone`、`#contract`、`#mesh`。示例可直接进入[限流现场](dist/index.html#gateway)或[手机号测试台](dist/index.html#phone)。
