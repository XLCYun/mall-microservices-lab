# Each cue is timed against the recorded playback, with actions applied to the real classroom model.
def cue(t,text,*actions):return (t,text,list(actions))
def clip(id,title,seconds,speed,start,poster,*cues):
    return dict(id=id,title=title,seconds=seconds,speed=speed,start=start,poster=poster,cues=list(cues))
S={
'registry':[
clip('single','单实例下线后，请求会怎样？',9,.7,0,1.8,cue(0,'固定地址指向商品服务器 01'),cue(3,'下线 01，查询连接失败',('instance',None)),cue(6,'重新启动 01，查询恢复',('instance',None))),
clip('nginx','两台固定实例轮流接单',8,.60,0,5.2,cue(0,'两台服务器按相同权重轮询'),cue(3,'提高到每秒 6 笔，两台各接 3 笔',('rate',6))),
clip('elastic','新实例何时进入 NGINX 名单？',13,.58,0,6.8,cue(0,'原来的固定名单包含 01 和 02'),cue(2.5,'启动 03，固定名单尚未更新',('add',None)),cue(5.2,'写入 03 地址并重载，三台开始分担',('addAddress',3)),cue(8.2,'流量降到每秒 4 笔，移除 02 地址',('rate',4),('removeAddress',2)),cue(10.2,'02 已停止接单，可以下线',('instance',None))),
clip('normal','实例登记与网关查询',8,.45,0,1.0,cue(0,'两台实例向注册中心登记，网关查询商品服务'),cue(3.0,'网关使用本地地址列表轮询，实例定期报告心跳')),
clip('offline','实例掉线与漏收心跳',8,.32,0,4.35,cue(0,'两台商品服务器已注册'),cue(3.2,'02 掉线，网关仍向旧地址发送部分请求'),cue(6.3,'剔除时限到达，网关只向 01 转发')),
clip('evicted','从断连重试到移除失效地址',8,.34,0,4.5,cue(0,'开启一次重试，02 的剔除时限为 2 秒',('retry',True)),cue(3.1,'02 断连，失败的只读查询改发 01'),cue(6.0,'注册中心移除 02，后续请求直接到达 01')),
clip('restored','02 重新上线后恢复接单',8,.45,6.6,4.1,cue(0,'网关当前只使用 01 的地址'),cue(3.2,'第 8 秒，02 重新注册，网关收到地址变更'),cue(5.4,'两台服务器重新分担查询')),
clip('join','手动添加四台商品服务器',12,.35,9,10.5,cue(0,'01、02 在线，每台每秒接 3 笔'),cue(2,'启动并登记 03',('add',None)),cue(4,'启动并登记 04',('add',None)),cue(6,'启动并登记 05',('add',None)),cue(8,'启动并登记 06，六台各接 1 笔',('add',None))),
clip('free','自由实验 · 比较服务发现方式',10,.65,0,7.5,cue(0,'商城网关在本地选择实例'),cue(3,'服务端发现由负载均衡器选择实例',('mode','server')),cue(6.2,'平台层发现通过稳定的 Service 地址转发',('mode','platform')))],
'gateway':[
clip('routes','按路径转发与令牌校验',11,.42,None,5.0,cue(0,'携带令牌的商品查询发给商品服务'),cue(3.3,'缺少令牌，网关直接返回 401',('requestType','no-token')),cue(6.6,'订单请求携带令牌，转发到订单服务',('requestType','order'))),
clip('limit','50 笔请求如何被限流',10,.4,None,6,cue(0,'阈值为 40 QPS，50 笔请求中放行 40 笔'),cue(4.1,'阈值降到 20 QPS，30 笔返回 429',('limit',20))),
clip('balance','慢实例下的请求分配',10,.45,None,7.2,cue(0,'轮询将 50 笔请求平分给两台实例'),cue(4,'改用最少连接，慢实例收到的请求减少',('strategy','least'))),
clip('aggregate','浏览器请求与网关聚合',9,.45,None,6.4,cue(0,'浏览器分别请求商品、库存和评论'),cue(4,'网关聚合后，客户端发 1 次请求，后端仍读取 3 项',('aggregate',True))),
clip('free','自由实验 · 跟踪网关流量',10,.62,0,6.5,cue(0,'网关按当前阈值分配请求'),cue(3,'将阈值调低到 15 QPS',('limit',15)),cue(6.5,'将阈值设为 0，商品查询都返回 429',('limit',0)))],
'scale':[
clip('baseline','HPA 如何随负载调整副本数',11,.65,None,8,cue(0,'平稳期每秒 40 笔，两台就绪实例分担'),cue(3,'切换到每秒 120 笔，控制器提高期望副本数',('profile','rush')),cue(8,'新副本通过就绪检查后开始分担')),
clip('scale-out','扩容与新副本就绪',10,.6,None,6.8,cue(0,'120 QPS 由两台就绪实例处理，两台 CPU 都达到 100%'),cue(3.4,'03、04 启动期间接单为零'),cue(5.2,'四台就绪，各接 30 QPS，CPU 降至 60%')),
clip('scale-in','稳定窗口、摘流与缩容',12,.7,None,7.8,cue(0,'流量回落，稳定窗口内仍保留四台'),cue(5.8,'多余副本先摘流，停止接收新请求'),cue(8.8,'副本退出，剩下两台承接流量')),
clip('free','自由实验 · 一次完整的扩缩容',15,.95,0,7,cue(0,'从稳定流量开始'),cue(2,'将流量调到 120 QPS，观察新实例何时接单',('profile','rush')),cue(7.4,'回落到 20 QPS，等待缩容稳定窗口',('profile','quiet')),cue(13.5,'观察摘流后保留的就绪副本'))],
'resilience':[
clip('timeout','评论超时与商品详情兜底',11,.56,None,5.7,cue(0,'评论延迟 100 毫秒，详情页完整返回'),cue(3.2,'延迟升到 900 毫秒，超时后先返回商品与库存',('delay',900)),cue(7.1,'关闭超时兜底，整页返回 504',('fallback',False))),
clip('config','50 QPS 下逐台发布降级配置',13,.6,None,7.8,cue(0,'每秒 50 笔查询，商品服务仍会逐笔查评论'),cue(3,'发布“跳过评论”，实例逐台加载新配置',('draft',True),('publish',None)),cue(6.5,'两台都已生效，库存继续接单，评论调用降为零'),cue(8.8,'取消降级并再次发布，评论调用逐步恢复',('draft',False),('publish',None))),
clip('breaker','断路器打开、半开与恢复',14,.8,None,5.6,cue(0,'记录各商品实例的评论调用'),cue(2.3,'把评论变慢，观察断路器何时打开',('delay',400)),cue(6.6,'评论延迟调回 100 毫秒，等待冷却和探测',('delay',100)),cue(11,'探测成功后恢复正常调用')),
clip('retry','一次入口查询最多触发八次调用',12,.48,None,8.2,cue(0,'首次失败且没有重试，查询失败'),cue(2.7,'商品服务重试一次，短暂故障后成功',('productRetries',1)),cue(6,'持续失败时三层各重试一次，评论服务收到 8 次调用',('layerFailure',100),('gatewayRetries',1),('clientRetries',1)),cue(9.4,'恢复评论服务，首次调用即可成功',('layerFailure',0))),
clip('free','自由实验 · 配置中心逐台下发',10,.8,0,6,cue(0,'商品实例按当前配置查询评论'),cue(2.3,'发布降级配置',('draft',True),('publish',None)),cue(6,'原有实例跳过评论，新启动的实例读取当前配置',('add',None)))],
'mesh':[
clip('preview','普通请求与内测请求',10,.42,None,5.5,cue(0,'普通请求进入旧版 v1'),cue(3,'带内测标记的查询命中 v2',('taggedShare',100)),cue(6.9,'切回普通请求，再次进入 v1',('taggedShare',0))),
clip('weights','用真实查询逐步放量',10,.52,None,7.2,cue(0,'20 笔普通请求中，10% 权重给 v2 分到 2 笔'),cue(4,'权重调到 25%，v2 每秒接 5 笔',('weightV2',25))),
clip('executor','同一权重，两种执行位置',12,.48,None,8.6,cue(0,'Istio 将规则下发给 Envoy 出站代理'),cue(4,'改用网关内置 SDK，网关直接选择版本',('architecture','sdk')),cue(8,'切回代理，权重仍为 25%',('architecture','sidecar'))),
clip('rollback','权重归零后的规则生效时间',12,.56,None,9.2,cue(0,'25% 流量发往 v2'),cue(3,'暂停下发并发布 0% 权重，代理继续使用旧规则',('hold',True),('weightV2',0)),cue(7,'恢复下发，代理应用新规则',('hold',False)),cue(9.3,'此后 20 笔新请求全部回到 v1')),
clip('free','自由实验 · 调整版本权重',10,.68,0,7.8,cue(0,'使用普通请求，按版本权重分流',('taggedShare',0)),cue(2.5,'把新版 v2 权重调到 100%',('weightV2',100)),cue(6.0,'权重调回 0%，所有新请求转发至 v1',('weightV2',0)))],
'phone':[clip('stage','五条用例的请求、响应与断言',12,.68,0,9.5,cue(0,'测试程序逐行读取手机号和预期结果'),cue(3.2,'每一行发起相同的校验，再比较返回值'),cue(8.1,'标准号码和四组无效输入的断言全部通过'))],
'contract':[clip('stage','订单与商品怎样验证同一库存接口？',13,.63,0,10.4,cue(0,'运行原始实现的测试桩和契约重放'),cue(5.6,'将 stock 改名为 quantity，重新验证',('contract-version','rename')),cue(10.5,'订单读取 stock 失败，商品依赖的 available 仍可用'))]}
