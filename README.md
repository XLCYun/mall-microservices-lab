# 商城大促值班夜 · 微服务演练场

一套面向电脑课堂演示和投影的中文微服务模拟。治理部分沿着商城的商品查询展开，从服务发现讲到灰度发布。测试部分用手机号校验和订单、库存接口演示两种测试方法。

课堂演示从微服务发现开始。[打开在线演练](https://xlcyun.github.io/mall-microservices-lab/#registry) · [课堂使用说明](课堂使用说明.md)

## 课堂操作

- 页头有“微服务治理”和“微服务测试”两个入口，各自从 01 编号。首次切入打开本组第一幕，再次切入会回到上次操作的章节。页底的“上一幕”和“下一幕”在当前组内翻页。网关、扩缩容等场景支持暂停、单步和变速。测试场景的单步分别推进一条用例或一步契约验证。
- 第一幕共八组情景页和模拟地图，按顺序向下滚动即可。前三张地图从 NGINX 只配一个地址开始，接着演示两个地址轮询，最后对照扩缩容前后的在线实例和固定名单。[查看双机配置](https://xlcyun.github.io/mall-microservices-lab/?story=nginx#registry)
- 后五张地图依次演示两台实例注册、02 掉线、心跳超时剔除、02 重新注册，以及逐步扩到六台。可以对照早期部署和服务发现，用同一组地址比较新实例从什么时候开始接单。[打开多实例地图](https://xlcyun.github.io/mall-microservices-lab/?map=join#registry)
- 各图都能独立播放、暂停、推进一秒和重置，支持 0.1 倍、0.25 倍、0.5 倍和原速。引入注册中心后，红心表示一次心跳，默认每秒发送。展开的心跳设置允许把剔除时间调到 2–15 秒，默认 2 秒。从最近一次注册或心跳算起，到期仍未上报，注册中心就移除地址并立即通知网关。
- 每幕首次进入时保存一份开场快照。从扩缩容顺接到容错时，已就绪的商品实例会进入下一幕。直接打开容错场景则从两台商品实例开始。
- 切幕会暂停播放，返回时可以接着演练。“重置本幕”会恢复入场时的状态。刷新页面会开始一场新演练。
- 手机号测试台支持编辑用例、逐行比对和 CSV 导入导出。全站使用浏览器本地的模拟数据。

## 治理课堂地图

以下四幕都先展示情景卡片，再展示模拟地图。右侧图表会随下方地图更新。每张地图起初暂停，网关分流默认以 0.1 倍速播放，其余三幕默认以 0.25 倍速播放。点击“重置本段”可以重新演示这一组，“自由实验”可打开该幕的完整参数面板。

| 幕 | 按课堂顺序打开模拟地图 |
| --- | --- |
| 02 网关分流 | [路由与鉴权](https://xlcyun.github.io/mall-microservices-lab/?map=routes#gateway) · [接口限流](https://xlcyun.github.io/mall-microservices-lab/?map=limit#gateway) · [负载均衡](https://xlcyun.github.io/mall-microservices-lab/?map=balance#gateway) · [网关聚合](https://xlcyun.github.io/mall-microservices-lab/?map=aggregate#gateway) |
| 03 弹性扩容 | [容量与负载](https://xlcyun.github.io/mall-microservices-lab/?map=baseline#scale) · [扩容与就绪](https://xlcyun.github.io/mall-microservices-lab/?map=scale-out#scale) · [稳定窗口与缩容](https://xlcyun.github.io/mall-microservices-lab/?map=scale-in#scale) |
| 04 容错降级 | [超时与兜底](https://xlcyun.github.io/mall-microservices-lab/?map=timeout#resilience) · [配置降级](https://xlcyun.github.io/mall-microservices-lab/?map=config#resilience) · [自动熔断](https://xlcyun.github.io/mall-microservices-lab/?map=breaker#resilience) · [多层重试](https://xlcyun.github.io/mall-microservices-lab/?map=retry#resilience) |
| 05 灰度发布 | [内测分流](https://xlcyun.github.io/mall-microservices-lab/?map=preview#mesh) · [按权重放量](https://xlcyun.github.io/mall-microservices-lab/?map=weights#mesh) · [网关与 Istio](https://xlcyun.github.io/mall-microservices-lab/?map=executor#mesh) · [流量回滚](https://xlcyun.github.io/mall-microservices-lab/?map=rollback#mesh) |

也可以在地图左侧右键复制“本图地址”。把这些地址里的 `?map=` 换成 `?story=` 即可从地图上方的情景卡开始。首次从 03 进入 04 时，容错演示会接着使用刚才操作的扩容地图或自由实验中已经就绪的商品实例。

## 从源码本地预览

在项目目录运行下列命令以安装依赖并启动开发服务器。浏览器会分别加载 HTML、CSS 与脚本。esbuild 在内存中编译 React 控件，修改后刷新即可预览。

```sh
npm ci
npm run dev
```

治理组使用 `#registry`、`#gateway`、`#scale`、`#resilience` 和 `#mesh`，测试组使用 `#phone` 和 `#contract`。直接访问章节地址会自动选中所属分组。开发服务器启动后，也可以直接进入对应的场景。[本地限流演练](http://127.0.0.1:59011/#gateway) · [本地手机号测试台](http://127.0.0.1:59011/#phone)

七幕共用同一套请求动画。各场景在选定实例、决定重试或完成测试断言时，用 `Lab.flow.add` 记下这笔调用经过的节点和结果。`src/request-balls.js` 按记录计算小球的位置、弹跳和颜色，`src/stage.js` 将小球和机器模型按前后顺序绘制。调整课堂 QPS 可以从 `src/request-flow.js` 中的 `Lab.workloads` 入手。

## 验证与单文件构建

使用 Node.js 20 或更新版本运行 `node verify.mjs`，可核对场景重置、请求去向和测试结果。课堂演示效果确认后，运行 `node build.mjs`，它会按源码入口的顺序将脚本与样式内联到 `dist/index.html`。React 和 React DOM 随站点一起打包，浏览器无需访问外部 CDN。

## 发布到 GitHub Pages

发布后可以在线演示，也可以下载 HTML 离线打开。[在线演练](https://xlcyun.github.io/mall-microservices-lab/) · [离线文件](dist/index.html)

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
