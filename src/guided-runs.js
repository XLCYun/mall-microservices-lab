// Each card starts from an independent snapshot, including the traffic that produced its opening frame.
function teachingGateway(nodes, batch) {
  const links = [['client', 'gateway'], ...nodes.slice(2).map(n => ['gateway', n.id])];
  const edges = links.map(([from, to]) => {
    const packets = batch.requests.filter(r => r.path.some((node, i) => node === from && r.path[i + 1] === to));
    const blocked = to === 'reject';
    return {from, to, kind: packets.length ? (blocked ? 'blocked' : 'flow') : 'idle', weight: packets.length ? 1 : 0};
  });
  return {nodes, edges, batch};
}

function routeModel(s, api) {
  const packet = s.manualBatch.requests[0];
  const all = api.stage(s).nodes;
  const product = all.find(n => n.id === packet.to && n.role === 'product') || all.find(n => n.role === 'product');
  const nodes = all.filter(n => n.role !== 'product' || n === product).map(n => {
    if (n.role === 'client') return {...n, sub: '1 笔请求'};
    if (n.role === 'gateway') return {...n, sub: '路由与鉴权'};
    if (n.role === 'reject') return {...n, label: '网关拒绝', sub: packet.to === n.id ? 'HTTP ' + packet.code : '未拦截', status: packet.to === n.id ? 'down' : 'muted'};
    return {...n, sub: packet.to === n.id ? 'HTTP ' + packet.code : '待接单', status: packet.to === n.id ? 'up' : 'muted'};
  });
  return teachingGateway(nodes, {second: s.time, requests: [packet]});
}

// Keep each map focused on the nodes that participate in its lesson.
function omitNodes(model, hidden) {
  function visibleBatch(batch) {
    if (!batch) return batch;
    const requests = batch.requests.filter(r => !r.path.some(id => hidden.includes(id)));
    return requests.length === batch.requests.length ? batch : {...batch, requests};
  }
  return {...model, nodes: model.nodes.filter(n => !hidden.includes(n.id)),
    edges: model.edges.filter(e => !hidden.includes(e.from) && !hidden.includes(e.to)),
    batch: visibleBatch(model.batch), previousBatch: visibleBatch(model.previousBatch),
    manualBatch: visibleBatch(model.manualBatch)};
}

function pageModel(s) {
  const {reads, calls, batch} = s.page;
  const nodes = [
    {id: 'client', role: 'client', label: '商城客户端', sub: calls.length + ' 次请求', status: 'up'},
    {id: 'gateway', role: 'gateway', label: 'API 网关', sub: s.aggregate ? '合并响应' : '分别转发', status: 'up'},
    ...reads.map(r => ({id: r.node, role: r.role, label: r.name, sub: '1 次读取', status: 'up'}))
  ];
  return teachingGateway(nodes, batch);
}

function startRelease({act, advance}, {rate = 20, weight = 10, byHeader = false} = {}) {
  act('meshRate', rate);
  act('taggedShare', 0);
  act('weightV2', weight);
  act('byHeader', byHeader);
  advance(1);
}

export const lessons = {
  gateway: [
    {id: 'routes', stillOffset: 0.22, label: '路由与鉴权', title: '商城为什么需要网关？',
      lead: '商品服务和订单服务部署在不同的服务器上。客户端分别访问时，要记住两套地址。登录令牌的校验规则一改，两个服务都要跟着改。',
      body: '商城把 API 网关设为统一入口。网关按方法和路径选服务，统一校验令牌，也能记录访问日志、统一错误响应格式。在下方分别发送带令牌和缺少令牌的商品查询，看看哪一笔能到达后端。',
      prepare({act}) { act('requestType', 'product'); act('sendProbe'); },
      afterTick({act}) { act('sendProbe'); }, model: routeModel},
    {id: 'limit', label: '接口限流', title: '商品接口每秒放行多少笔？',
      lead: '大促开售，商品接口每秒收到 50 笔查询。如果流量超过商品服务器的处理能力，请求就会积压，已经接下的查询也可能超时。',
      body: '为了让后端及时处理已接下的查询，网关先把商品接口的限额设为每秒 40 笔，超额请求直接返回 HTTP 429。把滑块调到 20，看同一秒有多少笔到达后端、多少笔在网关被拦下。', model: (s, api) => omitNodes(api.stage(s), ['order'])},
    {id: 'balance', label: '负载均衡', title: '有一台商品服务器变慢了',
      lead: '网关每秒要分配 50 笔商品查询。商品服务器 01 处理一笔要 60 毫秒，02 变慢后要 420 毫秒。',
      bullets: [
        ['轮询', '按名单顺序轮流转发，01 和 02 各接一笔，再从头开始。'],
        ['随机', '每笔请求随机选一台，两台被选中的机会相同。'],
        ['加权轮询', '按权重轮流转发。权重设为 3∶1 时，每轮 4 笔里，01 接 3 笔，02 接 1 笔。'],
        ['最少连接', '把下一笔请求交给当前活跃连接最少的服务器。']
      ],
      body: '切换策略，比较慢服务器 02 的接单数和这批查询的平均耗时。',
      prepare({act, state}) { act('limit', state.window.offered); act('slow', true); },
      model: (s, api) => omitNodes(api.stage(s), ['order','reject'])},
    {id: 'aggregate', stillOffset: 0.24, label: '网关聚合', title: '打开一次详情页，要发几次请求？',
      lead: '一页商品详情需要商品、库存和评论三份数据。浏览器可以分别请求，也可以只请求一次，由网关读齐三份数据再返回。',
      body: '打开“网关聚合”后再看地图。数一数从客户端出发的小球和从网关发出的小球，比较是哪一段调用少了。',
      prepare({act}) { act('aggregate', false); act('pageVisit'); },
      afterTick({act}) { act('pageVisit'); }, model: pageModel}
  ],
  scale: [
    {id: 'baseline', label: '容量与负载', title: '商品服务需要几个副本？',
      lead: '商城在 Kubernetes 上运行商品服务，每个 Pod 是一个副本。Pod 水平自动扩缩器（HPA）定期比较实际负载和目标值，决定需要多少个副本。',
      bullets: [
        ['选指标', 'HPA 可以看 CPU、内存，也可以接入每秒请求数等自定义指标。本例按每个 Pod 申请的 CPU 计算利用率，再取平均值。'],
        ['定规则', '平均 CPU 明显高于目标时，HPA 会建议扩容。本例限定 2 至 6 个副本。负载回落后，控制器取最近 5 个模拟秒内的最高建议来缩容。']
      ],
      body: '先把入站流量从平稳切到高峰，再改目标 CPU。对照右侧配置里的 averageUtilization 和本轮建议的副本数。'},
    {id: 'scale-out', label: '扩容与就绪', title: '新实例什么时候开始接单？',
      lead: '新副本从启动到通过就绪检查需要时间。这段时间仍由原来的两台接单，所以商城把目标 CPU 设在 60%，给流量上涨留出余量。',
      bullets: [
        ['高峰到来', '每秒 120 笔查询落在两台就绪副本上，每台分到 60 QPS，CPU 都达到 100%。'],
        ['等待就绪', 'HPA 把期望副本数从 2 调到 4。03、04 启动期间各接 0 笔，查询继续发往 01 和 02。'],
        ['四台就绪', '同样的 120 QPS 由四台平分，每台接 30 QPS，CPU 都是 60%。']
      ],
      body: '按默认设置，从第 1 秒点“下一秒”到第 4 秒，观察 03 和 04 何时接到第一笔查询。',
      prepare({act, advance}) { act('profile', 'rush'); advance(1); }},
    {id: 'scale-in', label: '稳定窗口与缩容', title: '流量回落后，哪台先退出？',
      lead: '高峰已过，新请求变少。控制器在稳定窗口内保留较高的副本建议，避免一次短暂回落就关掉机器。',
      body: '逐秒观察等待时间。窗口结束后，多余的副本先摘流，接单数降到零，再退出。调长窗口或恢复高峰，可以比较缩容时机。',
      prepare({act, advance}) { act('profile', 'rush'); advance(8); act('profile', 'quiet'); advance(1); }}
  ],
  resilience: [
    {id: 'timeout', label: '超时与兜底', title: '评论超时，详情还能打开吗？',
      lead: '如果商品服务没设超时，下游评论服务一旦失去响应，等待中的请求就会积压在商品服务里，占用连接和内存。顾客也迟迟打不开详情页。',
      body: '本例最多等评论 500 毫秒。把评论延迟调到 900 毫秒，再切换超时兜底，看顾客收到的是商品详情和库存，还是 HTTP 504。',
      prepare({act, advance}) { act('delay', 100); advance(1); },
      model: (s, api) => omitNodes(api.stage(s), ['config'])},
    {id: 'config', label: '配置降级', title: '暂停加载评论，照常查看商品和库存',
      lead: '大促期间，商城每秒收到 50 笔商品详情查询（50 QPS）。服务器压力大时，商城可以暂停加载评论，把资源留给商品详情和库存查询，优先保证核心功能可用。',
      body: '在配置中心勾选“跳过评论”并发布，运行中的实例会陆续停止查询评论。点“下一秒”，对照评论调用次数和整页响应时间。流量回落后，取消勾选并再次发布，即可恢复评论查询。',
      prepare({act, advance}) { act('rate', 50); act('delay', 900); advance(1); },
      model: (s, api) => api.stage(s, {showNamespace: false})},
    {id: 'breaker', label: '自动熔断', title: '慢调用持续时，自动暂停评论请求',
      lead: '评论服务持续变慢，商品服务要等评论，网关又要等商品服务。高峰时，积压的请求可能占满网关的连接，连原本正常的接口也会超时。这种故障沿调用链向上游扩散的现象叫级联故障。',
      bullets: [
        ['熔断怎样阻止扩散？', '每台商品实例独立统计慢调用。样本足够且慢调用占比超过阈值，就打开断路器。新的查询跳过评论，直接返回详情和库存，避免更多请求积压在上游。'],
        ['怎样恢复？', '冷却后，每台实例先放行一笔探测。响应恢复正常就重新接通，仍然很慢就再次熔断。']
      ],
      body: '把评论延迟调到 400 毫秒，播放到断路器打开。再调回 100 毫秒，观察哪一笔评论调用先恢复。',
      prepare({act, advance}) { act('mode', 'breaker'); act('delay', 100); advance(1); },
      model: (s, api) => omitNodes(api.stage(s), ['config'])},
    {id: 'retry', label: '多层重试', title: '一次请求会变成几次评论调用？',
      lead: '读取评论时偶尔会遇到短暂故障。同一笔只读查询再试一次，有机会拿到评论，让顾客看到完整的详情。',
      bullets: [
        ['短暂故障', '选“仅首次失败”，只让商品服务重试 1 次。第一次读取失败，第二次成功，这笔查询就结束了。'],
        ['持续故障', '选“持续失败”，客户端、网关和商品服务各重试 1 次。每层最多尝试 2 次，一笔查询就会产生 2 × 2 × 2 = 8 次评论调用。']
      ],
      body: '这些额外调用会挤占其他查询的处理能力，让故障更难恢复。关掉客户端和网关的重试，比较只由商品服务重试时的调用次数。',
      prepare({act, advance}) {
        act('mode', 'retry'); for (const key of ['clientRetries','gatewayRetries','productRetries']) act(key, 0);
        act('layerFailure', 'first-only');
        advance(1);
      }}
  ],
  mesh: [
    {id: 'preview', label: '内测分流', title: '先让内测人员核对新版促销价',
      lead: '新版详情页改了促销价的展示。先让运营和测试用线上商品核对价格，同一个人可以反复打开新版复现问题。即使发现标价有误，普通顾客看到的仍是旧版 v1 的价格。',
      body: '商城按内测身份分流。内测查询带上 x-canary: true，每次都到 v2。分别发送普通请求和内测请求，跟着小球看同一个商品地址的两笔查询各自去了哪里。',
      stillOffset: 0.91, stepOnChange: true,
      prepare: run => startRelease(run, {rate: 1, weight: 0, byHeader: true}),
      model: (s, api) => omitNodes(api.stage(s), ['control'])},
    {id: 'weights', stillOffset: 0.91, label: '按权重放量', title: '先让新版接 10% 的真实请求',
      lead: '内测通过后，商城先用少量真实查询观察新版的促销价是否正确、响应有没有变慢。即使新版出了问题，受影响的也只是分到 v2 的这部分查询，其余 90% 仍由旧版处理。',
      body: '确认新版表现稳定后，再逐步放量。把下方的 v2 权重从 10% 调到 25%，看看每秒 20 笔商品查询中，新版接到的请求如何从 2 笔变成 5 笔。',
      stepOnChange: true,
      prepare: startRelease,
      model: (s, api) => omitNodes(api.stage(s), ['control'])},
    {id: 'executor', stillOffset: 0.86, label: '网关与 Istio', title: '灰度分流的两种实现方式',
      lead: '要把 25% 的商品查询发给 v2，可以在商城网关分流，也可以由 Istio 管理的代理分流。',
      bullets: [
        ['商城网关分流', '网关按权重为经过入口的请求选版本。订单服务直接调用商品服务时，会绕过这条入口规则。'],
        ['Istio 代理分流', '在本例的 Sidecar 模式中，istiod 把规则下发给调用方旁的 Envoy 代理。订单服务直接查商品时，它的代理也能按权重选版本。']
      ],
      body: '切换下方的两种方式，看发往 v1 和 v2 的请求从哪个节点分开。',
      stepOnChange: true,
      prepare: run => startRelease(run, {weight: 25})},
    {id: 'rollback', stillOffset: 0.88, label: '流量回滚', title: '新版价格有误，把新请求切回 v1',
      lead: '放量到 25% 后，顾客发现有些促销商品显示了原价。旧版仍在线，商城可以先让新查询全部回到 v1，再排查新版的价格计算。',
      body: '点击“将 v2 权重降到 0%”，对照控制平面已发布的权重和代理正在使用的权重。再点“下一秒”，看新规则生效后，这 20 笔商品查询去了哪里。',
      prepare: run => startRelease(run, {weight: 25})}
  ]
};

export function lessonRecords(lab, sceneId, opening) {
  const api = lab.scenes[sceneId];
  return lessons[sceneId].map(lesson => {
    function driver(state) {
      const run = {state, act(key, value) {
        api.act(state, key, value, null, {sceneTime: state.time, notify() {}});
      }, advance(count) {
        for (let i = 0; i < count; i++) {
          state.time++;
          api.tick(state);
          lesson.afterTick?.(run);
        }
      }};
      return run;
    }
    const baseline = structuredClone(opening);
    lesson.prepare?.(driver(baseline));
    const stillTime = baseline.time + (lesson.stillOffset ?? 0.43);
    function createRun(clock = stillTime) {
      const state = structuredClone(baseline);
      const run = driver(state);
      let snapshot;
      function advanceTo(clock) {
        const count = Math.floor(clock) - state.time;
        if (count <= 0) return;
        run.advance(count);
        snapshot = null;
      }
      function configure(key, value) {
        run.act(key, value);
        // A new sample shows the consequence right away. A config draft or publication
        // stays at the current second so the first receiving instance can be observed separately.
        if (sceneId === 'scale' || (sceneId === 'resilience' && lesson.id !== 'config') || lesson.afterTick || lesson.stepOnChange) run.advance(1);
        snapshot = null;
        return state.time;
      }
      function frame() {
        if (!snapshot) snapshot = {second: state.time, state: structuredClone(state),
          model: lesson.model ? lesson.model(state, api) : api.stage(state)};
        return snapshot;
      }
      advanceTo(clock);
      return {advanceTo, configure, frame};
    }
    return {id: lesson.id, title: lesson.title, slide: {...lesson, live: true}, keySecond: baseline.time,
      stillTime, start: baseline.time, end: Infinity, createRun};
  });
}
