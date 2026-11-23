(() => {
  'use strict';
  const {scenes, ui, flow, workloads} = window.Lab;
  const {batches} = flow;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
  const product = id => '商品服务器 ' + String(id).padStart(2, '0');
  const pid = id => 'product-' + id;
  const node = (id, role, label, sub, status = 'up') => ({id, role, label, sub, status});
  const edge = (from, to, kind, weight) => ({from, to, kind, weight: clamp(weight, 0, 1)});
  const note = text => '<p class="panel-note">' + ui.escape(text) + '</p>';
  const group = (...controls) => '<div class="control-group">' + controls.join('') + '</div>';
  const notify = (ctx, text) => { if (ctx && ctx.notify) ctx.notify(text); };
  function controlMessage(batch, at, path, operation) {
    return flow.add(batch, at, path, path.slice(1).map(() => 'control'), {operation});
  }
  function routedRequest(batch, at, destination, code, details = {}) {
    return flow.add(batch, at, ['client', 'gateway', destination], ['neutral', code >= 400 ? 'stop' : 'pass'],
      {to: destination, code, ...details});
  }
  // One permit is replenished every 1/rate seconds; each arrival belongs to an integer slot.
  function hasPermit(index, incoming, rate) {
    return rate > 0 && (index === 0 || Math.floor(index * rate / incoming) > Math.floor((index - 1) * rate / incoming));
  }
  function extra(s, title, controls) {
    return '<button type="button" class="control-button advanced-button" data-act="advanced" aria-expanded="' +
      s.advanced + '">' + ui.escape(title) + (s.advanced ? ' ▴' : ' ▾') + '</button>' +
      (s.advanced ? '<div class="advanced-controls">' + controls + '</div>' : '');
  }
  function table(headers, rows) {
    return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      headers.map(h => '<th scope="col">' + ui.escape(h) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(row => '<tr>' + row.map((v, i) => i === 0
        ? '<th scope="row">' + ui.escape(v) + '</th>'
        : '<td>' + ui.escape(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }
  function timeline(events) {
    return events.length === 1 ? note('最近事件　T+' + events[0].time + ' 秒　' + events[0].message) :
      '<ul class="detail-list">' + events.map(e =>
        '<li>T+' + ui.escape(e.time) + ' 秒　' + ui.escape(e.message) + '</li>').join('') + '</ul>';
  }

  const discoveryModes = [
    ['client', '客户端发现'], ['server', '服务端发现'], ['platform', '平台层发现']
  ];
  const discoverer = {client: '商城网关', server: '负载均衡器', platform: '平台代理'};
  const modeText = {
    client: '商城网关订阅商品服务的地址名单，收到变更通知后按新名单轮询。',
    server: '商城网关把选择实例的工作交给负载均衡器。本例的均衡器每次请求前查看注册表。',
    platform: '商城网关访问稳定的 Service 地址。平台控制器维护就绪端点，代理同步端点后转发。'
  };
  const registryServer = id => '商品服务器 ' + String(id).padStart(2, '0');
  const productService = {
    name: 'product', port: 8080,
    ip: id => '10.0.0.' + (10 + Number(id)),
    endpoint: id => productService.ip(id) + ':' + productService.port
  };
  const maxInstances = 6;
  const nextServerId = s => s.instances.length < maxInstances ? s.instances.length + 1 : null;
  const primary = s => s.instances.filter(p => p.registered).map(p => p.id);
  const listing = ids => ids.length ? ids.map(id => registryServer(id) + '（' + productService.endpoint(id) + '）').join('、') : '空';
  function registryEvent(s, message) {
    s.events.unshift({time: s.time, message});
    s.events.length = Math.min(s.events.length, 4);
  }
  function publishMembership(s, batch) {
    s.replication.push({due: s.time + 3, ids: primary(s)});
    if (s.reader === 'primary') syncDirectory(s, batch, 0, 'push');
  }
  function syncDirectory(s, batch, at, operation) {
    const addresses = s.reader === 'primary' ? primary(s) : s.mirror;
    if (operation === 'push') {
      if (s.mode === 'server' || (s.cache.length === addresses.length && s.cache.every((id, i) => id === addresses[i]))) return;
      controlMessage(batch, at, ['registry', 'gateway'], 'push');
      registryEvent(s, discoverer[s.mode] + ' 收到名单变更，后续请求按新名单转发。');
    } else {
      controlMessage(batch, at, ['gateway', 'registry', 'gateway'], 'lookup');
    }
    s.cache = addresses.slice();
    s.directoryAt = s.time;
  }
  function registryRoute(s, batch, at, probing = false) {
    if (s.mode === 'server') syncDirectory(s, batch, at, 'lookup');
    const path = ['client', 'gateway'], tones = ['neutral'];
    const attempts = [];
    if (s.cache.length) {
      const first = s.next % s.cache.length;
      s.next = (first + 1) % s.cache.length;
      const limit = Math.min(s.retry ? 2 : 1, s.cache.length);
      for (let i = 0; i < limit; i++) {
        if (i) { path.push('gateway'); tones.push('stop'); }
        const id = s.cache[(first + i) % s.cache.length];
        const live = s.instances.some(p => p.id === id && p.live);
        attempts.push({id, live});
        path.push(pid(id));
        tones.push(live ? 'pass' : 'stop');
        if (live) break;
      }
    } else {
      path.push('reject');
      tones.push('stop');
    }
    const ok = Boolean(attempts.length && attempts[attempts.length - 1].live);
    flow.add(batch, at, path, tones, {to: path[path.length - 1], code: ok ? 200 : 503,
      attempts, ...(probing ? {emphasis: 'probe'} : {})});
    const trace = attempts.length ? attempts.map(a => registryServer(a.id) + (a.live ? ' 接单' : ' 连接失败')).join(' → 重试 ') +
      (ok ? ' → HTTP 200' : ' → HTTP 503') : '发现列表为空，网关返回 503。';
    return {attempts, ok, trace};
  }
  function registryTraffic(s, batch) {
    const window = {total: 6, failed: 0, recovered: 0, firstMiss: 0, byId: {}, trace: '',
      startingCursor: s.next, controlCount: batch.requests.length};
    for (let n = 0; n < window.total; n++) {
      const result = registryRoute(s, batch, n / window.total);
      if (!result.ok) window.failed++;
      if (result.attempts.length && !result.attempts[0].live) window.firstMiss++;
      if (result.ok && result.attempts.length === 2) window.recovered++;
      for (const hit of result.attempts) {
        const count = window.byId[hit.id] || (window.byId[hit.id] = {ok: 0, fail: 0});
        if (hit.live) count.ok++; else count.fail++;
      }
      if (n === 0 || result.attempts.some(a => !a.live)) window.trace = result.trace;
    }
    s.window = window;
  }
  const heartbeatPolicy = {initial: 1, min: 1, max: 8};
  const expiryPolicy = {initial: 2, min: 2, max: 15};
  const expiryNote = s => s.expire < s.heartbeat
    ? '剔除时间短于心跳周期，在线实例也可能在两次心跳之间被移除。'
    : '从最近一次注册或心跳开始计时，到期仍未上报就移除地址。';
  function evictExpired(s) {
    let changed = false;
    for (const server of s.instances) {
      const silence = s.time - server.lastReport.at;
      if (!server.registered || silence < s.expire) continue;
      server.registered = false;
      changed = true;
      registryEvent(s, registryServer(server.id) + ' 已有 ' + silence + ' 秒未上报，注册中心已移除它的地址。');
    }
    return changed;
  }
  function newAddress(id, time, heartbeat) {
    return {id, live: true, registered: true, lastReport: {kind: 'register', at: time}, nextBeat: time + heartbeat, missed: 0};
  }
  function setServerOnline(s, server, live, batch) {
    if (!server || server.live === live) return;
    const message = registryServer(server.id) + (live ? ' 已启动并注册。' : ' 突然掉线，心跳停止。');
    registryEvent(s, message);
    server.live = live;
    if (live) {
      const isNewAddress = !server.registered;
      server.registered = true;
      server.lastReport = {kind: 'register', at: s.time};
      server.nextBeat = s.time + s.heartbeat;
      server.missed = 0;
      controlMessage(batch, 0, [pid(server.id), 'registry'], 'register');
      if (isNewAddress) publishMembership(s, batch);
    }
    s.probe = '';
    return message;
  }
  const registry = {
    defaultSpeed: 0.25,
    service: productService, heartbeatPolicy, expiryPolicy, expiryNote, nextServerId, maxInstances,
    init() {
      const s = {
        time: 0, instances: [1, 2].map(id => newAddress(id, 0, heartbeatPolicy.initial)), selected: 2,
        heartbeat: heartbeatPolicy.initial, expire: expiryPolicy.initial, mode: 'client', reader: 'primary',
        cache: [], mirror: [1, 2], replication: [], directoryAt: 0,
        retry: false, next: 0, advanced: false, events: [], probe: ''
      };
      const batch = flow.begin(s, s.time);
      for (const p of s.instances) controlMessage(batch, 0, [pid(p.id), 'registry'], 'register');
      syncDirectory(s, batch, 0, 'lookup');
      registryEvent(s, registryServer(1) + ' 和' + registryServer(2) + ' 是商品服务的两个实例。它们已完成注册，网关已取得首份地址列表。');
      registryTraffic(s, batch);
      return s;
    },
    tick(s, event) {
      const batch = flow.begin(s, s.time);
      if (event) setServerOnline(s, s.instances.find(p => p.id === event.id), event.live, batch);
      let renewed = false;
      for (const p of s.instances) {
        if (s.time < p.nextBeat) continue;
        p.nextBeat = s.time + s.heartbeat;
        if (p.live) {
          p.lastReport = {kind: 'heartbeat', at: s.time};
          p.missed = 0;
          controlMessage(batch, 0, [pid(p.id), 'registry'], 'heartbeat');
          if (!p.registered) {
            p.registered = true;
            renewed = true;
            registryEvent(s, registryServer(p.id) + ' 恢复上报，注册中心重新登记了它的地址。');
          }
        } else if (p.registered) {
          p.missed++;
        }
      }
      // Reports arriving exactly at the deadline renew the address before the expiry check.
      const evicted = evictExpired(s);
      if (evicted || renewed) publishMembership(s, batch);
      const previousMirror = s.mirror;
      while (s.replication.length && s.replication[0].due <= s.time) {
        s.mirror = s.replication.shift().ids;
      }
      if (s.reader === 'replica' && previousMirror !== s.mirror) syncDirectory(s, batch, 0, 'push');
      s.probe = '';
      registryTraffic(s, batch);
    },
    act(s, key, value, target, ctx) {
      if (key === 'expire') return registry.configureCurrentSecond(s, key, value);
      const p = s.instances.find(item => item.id === s.selected);
      if (key === 'advanced') s.advanced = !s.advanced;
      if (key === 'selected' && s.instances.some(item => item.id === Number(value))) s.selected = Number(value);
      if (key === 'heartbeat') {
        const period = clamp(value, heartbeatPolicy.min, heartbeatPolicy.max);
        if (period !== s.heartbeat) {
          s.heartbeat = period;
          for (const server of s.instances) server.nextBeat = s.time + period;
        }
      }
      if (key === 'retry') s.retry = Boolean(value);
      if (key === 'mode' && discoveryModes.some(([id]) => value === id)) {
        s.mode = value;
        syncDirectory(s, flow.manual(s), 0, 'lookup');
      }
      if (key === 'reader' && ['primary', 'replica'].includes(value)) {
        s.reader = value;
        syncDirectory(s, flow.manual(s), 0, 'lookup');
      }
      if (key === 'instance' && p) {
        const message = setServerOnline(s, p, !p.live, flow.manual(s));
        notify(ctx, message);
      }
      if (key === 'add') {
        const id = nextServerId(s);
        if (id === null) return;
        s.instances.push(newAddress(id, s.time, s.heartbeat));
        const batch = flow.manual(s);
        controlMessage(batch, 0, [pid(id), 'registry'], 'register');
        s.selected = id;
        registryEvent(s, registryServer(id) + ' 启动并写入主注册表。');
        publishMembership(s, batch);
      }
      if (key === 'probe') {
        s.probe = registryRoute(s, flow.manual(s), 0, true).trace;
        notify(ctx, s.probe);
      }
    },
    // Compare settings on the same six arrivals. Keep this second's directory messages
    // and the previous second's flights, then route from the original round-robin cursor.
    configureCurrentSecond(s, key, value) {
      if (key === 'expire') {
        s.expire = clamp(value, expiryPolicy.min, expiryPolicy.max);
        if (!evictExpired(s)) return;
        s.probe = '';
      }
      const batch = {second: s.time, requests: s.batch.requests.slice(0, s.window.controlCount)};
      s.manualBatch = null;
      if (key === 'expire') {
        publishMembership(s, batch);
      } else {
        registry.act(s, key, value);
      }
      for (const message of s.manualBatch?.requests || []) {
        controlMessage(batch, message.at, message.path, message.operation);
      }
      s.manualBatch = null;
      s.next = s.window.startingCursor;
      s.batch = batch;
      registryTraffic(s, batch);
    },
    controls(s) {
      const p = s.instances.find(item => item.id === s.selected);
      const next = nextServerId(s);
      const settings = ui.select('mode', '发现方式', s.mode, discoveryModes) +
        ui.select('reader', '发现方读取', s.reader, [['primary', '主注册表'], ['replica', '从副本（延迟 3 秒）']]) +
        ui.select('selected', '选择商品服务器', s.selected, s.instances.map(item => [item.id, registryServer(item.id)])) +
        (next === null ? '' : ui.button('add', '启动' + registryServer(next)));
      return group(ui.button('instance', (p.live ? '突然关闭' : '重新启动') + registryServer(p.id), p.live ? 'danger' : ''),
        ui.range('heartbeat', '心跳周期', s.heartbeat, heartbeatPolicy.min, heartbeatPolicy.max, 1, '秒'),
        ui.range('expire', '心跳剔除时间', s.expire, expiryPolicy.min, expiryPolicy.max, 1, '秒'),
        note(expiryNote(s)),
        ui.toggle('retry', '失败后换一台重试', s.retry),
        ui.button('probe', '跟踪一次请求'), extra(s, '发现方式与注册表副本', settings));
    },
    stats(s) {
      return [['注册表实例', primary(s).length, '个'], ['发现列表', s.cache.length, '个'], ['本秒失败', s.window.failed, '次']];
    },
    entries(s) {
      return s.instances.filter(p => p.registered).map(p => ({
        id: p.id, name: registryServer(p.id), address: productService.endpoint(p.id), lastReport: p.lastReport, missed: p.missed,
        received: s.window.byId[p.id]?.ok || 0
      }));
    },
    stage(s) {
      const nodes = [node('client', 'client', s.mode === 'client' ? '商城客户端' : '商城网关', '6 请求/秒'),
        node('gateway', 'gateway', discoverer[s.mode], (s.mode === 'server' ? '可选 ' : '本地 ') + s.cache.length + ' 个地址'),
        node('registry', 'registry', s.mode === 'platform' ? '端点控制器' : '注册中心', '已登记 ' + primary(s).length + ' 个')];
      const edges = [edge('client', 'gateway', 'flow', 1),
        edge('registry', 'gateway', 'control', s.directoryAt === s.time ? 0.8 : 0)];
      for (const p of s.instances) {
        const hits = s.window.byId[p.id] || {ok: 0, fail: 0};
        const activity = p.live ? hits.ok : hits.fail;
        const status = !p.live ? 'down' : p.registered ? 'up' : 'pending';
        const sub = !p.live ? (p.registered ? '掉线 · 距剔除 ' + (s.expire - (s.time - p.lastReport.at)) + ' 秒' : '掉线 · 已剔除') :
          p.registered ? (s.cache.includes(p.id) ? hits.ok + ' 请求/秒' : '已注册 · 待发现') : '心跳未续约';
        nodes.push(node(pid(p.id), 'product', registryServer(p.id), sub, status));
        edges.push(edge('gateway', pid(p.id), activity ? (p.live ? 'flow' : 'blocked') : 'idle', activity / s.window.total),
          edge(pid(p.id), 'registry', p.live ? 'control' : 'idle', p.live && p.lastReport.at === s.time ? 0.8 : 0));
      }
      const packets = batches(s);
      if (!s.cache.length || [packets.batch, packets.previousBatch, packets.manualBatch].some(b => b?.requests.some(r => r.to === 'reject'))) {
        nodes.push(node('reject', 'reject', '无可用地址', 'HTTP 503', s.cache.length ? 'muted' : 'down'));
        edges.push(edge('gateway', 'reject', s.cache.length ? 'idle' : 'blocked', s.cache.length ? 0 : 1));
      }
      return {nodes, edges, ...packets};
    },
    detail(s) {
      const rows = s.instances.map(p => [registryServer(p.id), productService.endpoint(p.id), p.live ? '在线' : '已下线',
        p.lastReport.kind === 'heartbeat' ? (s.time - p.lastReport.at) + ' 秒前' : '尚未收到',
        p.registered ? '已登记' : '已剔除', s.cache.includes(p.id) ? '可选' : '无此地址']);
      const w = s.window;
      let html = table(['商品服务实例', 'IP 与端口', '进程', '上次心跳', '主注册表', '发现列表'], rows) +
        note('本秒 ' + w.total + ' 个请求，首次连接失败 ' + w.firstMiss + ' 次，换实例后成功 ' + w.recovered + ' 次。') +
        note('请求轨迹　' + (s.probe || w.trace)) + timeline(s.events);
      if (s.advanced) html += note(modeText[s.mode]) +
        note('主注册表　' + listing(primary(s)) + '。从副本　' + listing(s.mirror) + '。') +
        note('副本在变更后 3 秒同步。发现方在第 ' + s.directoryAt + ' 秒取得的名单为 ' + listing(s.cache) + '。');
      return html;
    }
  };
  scenes.registry = registry;

  const strategies = [
    ['round', '轮询'], ['random', '随机'], ['weighted', '加权轮询'], ['least', '最少连接']
  ];
  const strategyName = key => strategies.find(([id]) => id === key)[1];
  const requestTypes = [
    ['product', '商品请求，携带令牌'], ['no-token', '商品请求，缺少令牌'], ['order', '订单请求，携带令牌'],
    ['no-header', '商品请求，缺少活动请求头'], ['method', '商品路径，使用 POST'],
    ['path', '尚未配置的路径']
  ];
  function pickBackend(s, active) {
    const total = s.instances.length;
    if (s.strategy === 'random') {
      s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
      return Math.floor(s.seed / 4294967296 * total);
    }
    if (s.strategy === 'weighted') {
      const slot = s.next++ % (s.weight + total - 1);
      return slot < s.weight ? 0 : slot - s.weight + 1;
    }
    const start = s.next % total;
    let choice = start;
    if (s.strategy === 'least') {
      for (let i = 1; i < total; i++) {
        const j = (start + i) % total;
        if (active[j].length < active[choice].length) choice = j;
      }
    }
    s.next = (choice + 1) % total;
    return choice;
  }
  function clearGatewayProbe(s) {
    s.separateProbe = '';
    s.probeAt = null;
    s.probeTo = null;
    s.probeStatus = 0;
    s.manualBatch = null;
  }
  function gatewayWindow(s, replay) {
    const start = s.time * 1000;
    const batch = flow.begin(s, s.time);
    if (replay) {
      s.next = 0;
      s.seed = 407;
      s.connections = [];
      s.previousBatch = null;
      clearGatewayProbe(s);
    }
    const w = {offered: workloads.gateway.incoming, passed: 0, blocked: 0, latency: 0, limit: s.limit, strategy: s.strategy,
      slow: s.slow, weight: s.weight, hits: [], rt: [], firstPass: null, firstBlock: null};
    let active = s.instances.map((p, i) => s.connections[i] || []);
    for (const p of s.instances) {
      w.hits.push(0);
      w.rt.push(s.slow && p.id === 2 ? 420 : 60);
    }
    for (let i = 0; i < w.offered; i++) {
      const at = i / w.offered;
      const arrival = start + at * 1000;
      const index = i + 1;
      if (!hasPermit(i, w.offered, w.limit)) {
        w.blocked++;
        if (w.firstBlock === null) w.firstBlock = index;
        routedRequest(batch, at, 'reject', 429);
        continue;
      }
      active = active.map(ends => ends.filter(end => end > arrival));
      const j = pickBackend(s, active);
      const duration = w.rt[j];
      const id = s.instances[j].id;
      active[j].push(arrival + duration);
      if (w.firstPass === null) w.firstPass = {index, id, duration};
      routedRequest(batch, at, pid(id), 200);
      w.hits[j]++;
      w.passed++;
      w.latency += duration;
    }
    w.latency = w.passed ? Math.round(w.latency / w.passed) : 0;
    s.connections = active.map(ends => ends.filter(end => end > start + 1000));
    s.window = w;
    const signature = [s.limit, s.strategy, s.slow, s.weight].join('/');
    const sample = {signature, limit: w.limit, passed: w.passed, blocked: w.blocked, strategy: s.strategy, latency: w.latency};
    if (s.samples.length && s.samples[0].signature === signature) s.samples[0] = sample;
    else s.samples.unshift(sample);
    s.samples.length = Math.min(s.samples.length, 5);
  }
  function tracedProduct(s) {
    const w = s.window;
    if (s.trace === 'rejected') {
      return w.firstBlock === null ? '这一秒所有商品请求都已放行。' :
        '第 ' + w.firstBlock + ' 个 GET /products/42 → 鉴权通过 → 到达时没有放行名额 → 网关立即返回 HTTP 429。';
    }
    const pass = w.firstPass;
    return pass === null ? '阈值为 0，所有商品请求都收到 HTTP 429。' :
      '第 ' + pass.index + ' 个 GET /products/42 → 鉴权通过 → 取得放行名额 → ' +
      product(pass.id) + ' → HTTP 200，耗时 ' + pass.duration + ' ms。';
  }
  function startTrace(s, kind) {
    s.trace = kind;
    clearGatewayProbe(s);
    const w = s.window;
    const accepted = kind === 'passed';
    const index = accepted ? w.firstPass?.index : w.firstBlock;
    if (!index) { s.flight = null; return; }
    const sample = s.batch.requests[index - 1];
    const elapsedMs = Math.round(sample.at * 1000);
    const decision = accepted ? '此刻有一个放行名额，网关将它分给这笔请求。' :
      w.limit === 0 ? '阈值为 0，网关不发放通行名额。' : '上一个名额已被取用，下一个名额尚未补到。';
    const outcome = accepted ? product(w.firstPass.id) + ' 接到请求，' + w.firstPass.duration + ' ms 后返回 HTTP 200。' :
      '网关返回 HTTP 429，此请求在网关结束。';
    s.flight = {step: 0, destination: sample.to, path: sample.path, tones: sample.tones, accepted, index, limit: w.limit, steps: [
      '本秒开始后 ' + elapsedMs + ' ms，第 ' + index + ' 个 GET /products/42 到达网关。',
      '请求命中商品路由，访问令牌有效。', decision, outcome
    ]};
  }
  function currentHop(flight) {
    return '跟踪 #' + flight.index + ' · ' + (flight.step + 1) + '/' + flight.steps.length + '　' + flight.steps[flight.step];
  }
  function advanceTrace(s) {
    if (s.flight && s.flight.step + 1 < s.flight.steps.length) s.flight.step++;
  }
  function pageVisit(s) {
    const reads = [
      {node: 'product-1', role: 'product', name: '商品服务', path: 'GET /products/42'},
      {node: 'inventory', role: 'inventory', name: '库存服务', path: 'GET /inventory/42'},
      {node: 'review', role: 'review', name: '评论服务', path: 'GET /reviews/42'}
    ];
    const calls = s.aggregate ? ['GET /product-pages/42'] : reads.map(r => r.path);
    const batch = {second: s.time, requests: []};
    const entries = calls.map((path, i) => flow.add(batch, i * 0.09, ['client', 'gateway'], ['neutral'], {kind: 'browser', route: path}));
    reads.forEach((read, i) => {
      const parent = entries[s.aggregate ? 0 : i];
      flow.add(batch, parent.at + flow.timing.travel.neutral + 0.02, ['gateway', read.node], ['pass'],
        {kind: 'read', route: read.path, parent: parent.index});
    });
    s.page = {reads, calls, batch};
    s.pageResult = '浏览器共发 ' + calls.length + ' 次请求（' + calls.join('、') + '）。' +
      (s.aggregate ? '网关分别读取商品、库存和评论，合并为一个响应。' : '浏览器收到 3 份响应后展示详情页。');
  }
  function gatewayProbe(s, type, at) {
    const method = ['order', 'method'].includes(type) ? 'POST' : 'GET';
    const path = type === 'order' ? '/orders' : type === 'path' ? '/coupons' : '/products/42';
    const headerMatches = !s.headerRule || type !== 'no-header';
    const productRoute = method === 'GET' && path === '/products/42' && headerMatches;
    const orderRoute = method === 'POST' && path === '/orders';
    const prefix = method + ' ' + path + ' → ';
    let trace;
    let destination = 'reject';
    if (!productRoute && !orderRoute) {
      s.probeStatus = 404;
      const predicate = type === 'method' ? 'Method' : type === 'no-header' ? 'Header' : 'Path';
      trace = predicate + ' 条件未命中，网关返回 HTTP 404。';
    } else if (type === 'no-token') {
      s.probeStatus = 401;
      trace = '命中商品路由 → 缺少访问令牌，网关返回 HTTP 401。';
    } else if (orderRoute) {
      s.probeStatus = 201;
      destination = 'order';
      trace = '命中订单路由 → 鉴权通过 → 订单服务创建订单，返回 HTTP 201。商品配额未扣减。';
    } else if (s.limit === 0) {
      s.probeStatus = 429;
      trace = '命中商品路由 → 鉴权通过 → 商品配额为 0，网关返回 HTTP 429。';
    } else {
      s.probeStatus = 200;
      const fresh = {...s, next: 0, seed: 407};
      const choice = pickBackend(fresh, s.instances.map(() => []));
      destination = pid(s.instances[choice].id);
      trace = '命中商品路由 → 鉴权通过 → ' + product(s.instances[choice].id) + ' 返回 HTTP 200。';
    }
    s.flight = null;
    s.probeAt = at;
    s.probeTo = destination;
    routedRequest(flow.manual(s), 0, destination, s.probeStatus, {emphasis: 'probe'});
    s.separateProbe = prefix + trace;
    return s.separateProbe;
  }
  const gateway = {
    defaultSpeed: 0.1,
    choices: { strategies, requestTypes },
    init() {
      const s = {time: 0, instances: [{id: 1}, {id: 2}], limit: workloads.gateway.limit, strategy: 'round', weight: 3,
        slow: false, headerRule: false, aggregate: true, requestType: 'no-token',
        next: 0, seed: 407, advanced: false, trace: 'passed', flight: null, samples: [],
        separateProbe: '', probeStatus: 0, probeAt: null, probeTo: null, pageResult: ''};
      gatewayWindow(s, true);
      return s;
    },
    tick(s) { gatewayWindow(s, false); advanceTrace(s); },
    act(s, key, value, target, ctx) {
      if (key === 'advanced') s.advanced = !s.advanced;
      if (key === 'limit') s.limit = clamp(value, 0, workloads.gateway.max);
      if (key === 'strategy' && strategies.some(([id]) => id === value)) s.strategy = value;
      if (key === 'weight') s.weight = clamp(value, 1, 5);
      if (key === 'slow') s.slow = Boolean(value);
      if (key === 'headerRule') s.headerRule = Boolean(value);
      if (key === 'aggregate') { s.aggregate = Boolean(value); s.pageResult = ''; }
      if (key === 'pageVisit') { pageVisit(s); notify(ctx, s.pageResult); }
      if (key === 'requestType' && requestTypes.some(([id]) => id === value)) s.requestType = value;
      if (['limit', 'strategy', 'weight', 'slow', 'replay'].includes(key)) {
        // Compare the same arrivals immediately, even while the classroom clock is paused.
        gatewayWindow(s, true);
        s.flight = null;
        if (key === 'replay') notify(ctx, '已重放同一秒的 ' + s.window.offered + ' 个请求，放行 ' + s.window.passed + ' 个，拦截 ' + s.window.blocked + ' 个。');
      }
      if (key === 'tracePass' || key === 'trace429') {
        startTrace(s, key === 'tracePass' ? 'passed' : 'rejected');
        notify(ctx, s.flight ? currentHop(s.flight) : tracedProduct(s));
      }
      if (key === 'traceNext') { advanceTrace(s); if (s.flight) notify(ctx, currentHop(s.flight)); }
      if (key === 'endTrace') s.flight = null;
      if (key === 'sendOrder' || key === 'sendProbe') {
        notify(ctx, gatewayProbe(s, key === 'sendOrder' ? 'order' : s.requestType, ctx?.sceneTime ?? s.time));
      }
    },
    stats(s) {
      return [['商品请求到达', s.window.offered, 'QPS'], ['网关放行', s.window.passed, 'QPS'], ['限流拦截', s.window.blocked, 'QPS']];
    },
    stage(s) {
      const w = s.window;
      const nodes = [node('client', 'client', '商城客户端', w.offered + ' 请求/秒'),
        node('gateway', 'gateway', 'API 网关', '阈值 ' + w.limit + ' QPS')];
      const edges = [edge('client', 'gateway', 'flow', 1)];
      s.instances.forEach((p, i) => {
        nodes.push(node(pid(p.id), 'product', product(p.id), w.hits[i] + ' 请求/秒', w.rt[i] > 60 ? 'slow' : 'up'));
        edges.push(edge('gateway', pid(p.id), w.hits[i] ? 'flow' : 'idle', w.hits[i] / w.offered));
      });
      const probeSample = s.manualBatch?.requests[0];
      const activeProbe = probeSample && s.probeAt !== null && s.time - s.probeAt < 2 ? s.probeStatus : 0;
      const isolatedRejection = [401, 404, 429].includes(activeProbe);
      nodes.push(node('reject', 'reject', isolatedRejection ? '网关拒绝' : '限流拦截',
        isolatedRejection ? '探针 HTTP ' + s.probeStatus : w.blocked + ' × 429', w.blocked || isolatedRejection ? 'down' : 'muted'),
        node('order', 'order', '订单服务', activeProbe === 201 ? 'HTTP 201' : '独立路由', activeProbe === 201 ? 'up' : 'muted'));
      edges.push(edge('gateway', 'reject', w.blocked || isolatedRejection ? 'blocked' : 'idle', Math.max(w.blocked / w.offered, isolatedRejection ? 0.12 : 0)),
        edge('gateway', 'order', activeProbe === 201 ? 'flow' : 'idle', activeProbe === 201 ? 0.18 : 0));
      if (s.flight) {
        const f = s.flight;
        nodes[0].sub = '跟踪请求 #' + f.index;
        nodes[1].sub = ['请求到达', '路由与鉴权', '检查配额', f.accepted ? '已转发' : '返回 429'][f.step];
        for (const link of edges) {
          const arriving = f.step === 0 && link.from === 'client';
          const forwarding = f.step === 3 && link.from === 'gateway' && link.to === f.destination;
          link.kind = arriving || (forwarding && f.accepted) ? 'flow' : forwarding ? 'blocked' : 'idle';
          link.weight = arriving || forwarding ? 1 : 0;
        }
      }
      const focus = s.flight ? {index: s.flight.index, step: s.flight.step,
        to: s.flight.destination, code: s.flight.accepted ? 200 : 429, path: s.flight.path, tones: s.flight.tones} : null;
      const probe = activeProbe ? {...probeSample, at: s.probeAt} : null;
      return {nodes, edges, ...batches(s), focus, probe};
    },
    detail(s) {
      const w = s.window;
      const rows = s.instances.map((p, i) => [product(p.id), w.hits[i] + ' 次', w.rt[i] + ' ms',
        w.strategy === 'weighted' ? (i === 0 ? w.weight : 1) : '—']);
      const admission = w.limit === 0 ? '阈值为 0，所有请求都在网关返回 429。' :
        '网关按 ' + w.limit + ' QPS 匀速补充放行名额，最多保留一个。请求到达时没有名额，立即返回 429。';
      let result = table(['商品实例', '收到请求', '响应时间', '轮询权重'], rows) +
        note('商品路由　GET /products/42。每 ' + (1000 / w.offered) + ' ms 到达一个已鉴权请求。' + admission) +
        note(strategyName(w.strategy) + '分流，放行请求的平均耗时为 ' + (w.passed ? w.latency + ' ms。' : '—。')) +
        note(s.flight ? currentHop(s.flight) + ' 跟踪时的阈值为 ' + s.flight.limit + ' QPS。' :
          (s.separateProbe ? '独立探针　' : '请求轨迹　') + (s.separateProbe || tracedProduct(s)));
      if (s.samples.length > 1) {
        const before = s.samples[1];
        result += note('上一组　阈值 ' + before.limit + '，' + strategyName(before.strategy) + '放行 ' +
          before.passed + ' 个、限流 ' + before.blocked + ' 个，平均 ' + before.latency + ' ms。');
      }
      if (s.advanced) result += note('扩展探针使用独立配额。订单走 POST /orders，商品限流只对商品路由生效。');
      return result;
    }
  };
  scenes.gateway = gateway;

  const profiles = [
    ['normal', '平稳浏览 · ' + workloads.scale.normal + ' QPS'],
    ['rush', '大促涌入 · ' + workloads.scale.rush + ' QPS'],
    ['quiet', '流量回落 · ' + workloads.scale.quiet + ' QPS'],
    ['burst', '短时抢购曲线'], ['manual', '自定固定流量']
  ];
  function scaleLoad(s) {
    if (s.profile === 'manual') return s.manualLoad;
    if (s.profile === 'rush') return workloads.scale.rush;
    if (s.profile === 'quiet') return workloads.scale.quiet;
    if (s.profile === 'burst') {
      const age = s.time - s.profileSince;
      return age <= 2 ? workloads.scale.normal : age <= 8 ? workloads.scale.rush : workloads.scale.quiet;
    }
    return workloads.scale.normal;
  }
  function replica(id, status, transitionAt) {
    return {id, status, registered: status === 'ready', transitionAt, received: 0, cpu: 0};
  }
  function reconcileReplicas(s, events, batch) {
    const active = s.instances.filter(p => p.status !== 'draining');
    if (active.length < s.desired) {
      const count = Math.min(s.desired - active.length, 6 - s.instances.length);
      for (let i = 0; i < count; i++) {
        const p = replica(s.nextId++, 'starting', s.time + s.startDelay);
        s.instances.push(p);
        controlMessage(batch, 0, ['hpa', pid(p.id)], 'scale-up');
        events.push(product(p.id) + ' 开始启动');
      }
    } else if (active.length > s.desired) {
      const candidates = active.sort((a, b) => Number(b.status === 'starting') - Number(a.status === 'starting') || b.id - a.id);
      for (const p of candidates.slice(0, active.length - s.desired)) {
        p.cancelled = p.status === 'starting';
        p.status = 'draining';
        p.registered = false;
        p.transitionAt = s.time + 2;
        controlMessage(batch, 0, ['hpa', pid(p.id)], p.cancelled ? 'cancel-start' : 'scale-down');
        events.push(product(p.id) + (p.cancelled ? ' 取消启动' : ' 摘流'));
      }
    }
  }
  function scaleWindow(s) {
    const events = [];
    const initial = !s.batch;
    const batch = flow.begin(s, s.time);
    for (const p of s.instances) {
      if (p.status === 'starting' && p.transitionAt <= s.time) {
        p.status = 'ready';
        p.registered = true;
        controlMessage(batch, 0, [pid(p.id), 'gateway'], 'endpoint-ready');
        events.push(product(p.id) + ' 就绪并注册');
      } else if (p.status === 'draining' && p.transitionAt <= s.time) {
        events.push(product(p.id) + ' 退出');
      } else if (initial && p.registered) {
        controlMessage(batch, 0, [pid(p.id), 'gateway'], 'endpoint-ready');
      }
    }
    s.instances = s.instances.filter(p => p.status !== 'draining' || p.transitionAt > s.time);
    const incoming = scaleLoad(s);
    const admissions = Array.from({length: incoming}, (_, i) => hasPermit(i, incoming, s.gatewayLimit));
    const passed = admissions.filter(Boolean).length;
    const before = s.instances.filter(p => p.status === 'ready').length;
    const sampled = before ? Math.min(100, passed * 100 / (before * workloads.scale.replicaCapacity)) : 0;
    const raw = before ? Math.ceil(before * sampled / s.target) : s.min;
    const recommend = clamp(raw, s.min, s.max);
    s.recommendations = s.recommendations.filter(r => r.time > s.time - 12);
    s.recommendations.push({time: s.time, count: recommend});
    const recent = s.recommendations.filter(r => r.time > s.time - s.stabilize);
    const previous = clamp(s.desired, s.min, s.max);
    // A recent higher recommendation protects replicas during a short traffic dip.
    s.desired = recommend >= previous ? recommend : Math.min(previous, Math.max(...recent.map(r => r.count)));
    reconcileReplicas(s, events, batch);
    const ready = s.instances.filter(p => p.status === 'ready');
    for (const p of s.instances) {
      p.received = 0;
      p.cpu = 0;
    }
    for (let i = 0; i < admissions.length; i++) {
      const at = i / incoming;
      if (admissions[i]) {
        const p = ready[s.next % ready.length];
        p.received++;
        s.next = (s.next + 1) % ready.length;
        routedRequest(batch, at, pid(p.id), 200);
      } else {
        routedRequest(batch, at, 'reject', 429);
      }
    }
    for (const p of ready) p.cpu = Math.min(100, p.received * 100 / workloads.scale.replicaCapacity);
    const protectedSamples = recent.filter(r => r.count >= s.desired);
    const protecting = protectedSamples[protectedSamples.length - 1];
    const wait = recommend < s.desired && protecting ? protecting.time + s.stabilize - s.time : 0;
    const mean = ready.length ? ready.reduce((sum, p) => sum + p.cpu, 0) / ready.length : 0;
    s.window = {incoming, passed, blocked: incoming - passed, before, sampled: Math.round(sampled * 10) / 10,
      raw, recommend, wait, ready: ready.length, mean: Math.round(mean * 10) / 10, target: s.target,
      min: s.min, max: s.max, gatewayLimit: s.gatewayLimit};
    if (events.length) {
      s.events.unshift({time: s.time, message: events.join('，') + '。'});
      s.events.length = Math.min(s.events.length, 4);
    }
    s.trend.push({time: s.time, incoming, ready: ready.length, desired: s.desired, cpu: s.window.mean, target: s.target});
    if (s.trend.length > 16) s.trend.shift();
  }
  function cpuTrend(s) {
    const samples = s.trend;
    const start = samples[0].time, end = samples[samples.length - 1].time;
    const x = t => 3 + 494 * (t - start) / Math.max(1, end - start);
    const y = amount => 48 - 44 * amount / 100;
    const series = key => samples.map(t => x(t.time).toFixed(1) + ',' + y(t[key]).toFixed(1)).join(' ');
    const last = samples[samples.length - 1];
    const caption = 'CPU 走势 · T+' + start + ' 至 T+' + end + ' 秒，实线为实际值，虚线为目标值。';
    const points = series('cpu');
    return '<figure style="margin:12px 0 8px"><figcaption class="panel-note">' + ui.escape(caption) +
      '</figcaption><svg width="100%" height="56" viewBox="0 0 500 52" preserveAspectRatio="none" role="img" aria-label="' +
      ui.escape(caption + '当前 ' + last.cpu + '%，目标 ' + last.target + '%。') + '">' +
      '<path d="M3 4H497 M3 26H497 M3 48H497" stroke="#ebe8f1" stroke-width="1" fill="none"/>' +
      '<polygon points="3,48 ' + points + ' ' + x(end) + ',48" fill="#eeeafb"/>' +
      '<polyline points="' + series('target') + '" fill="none" stroke="#8a839e" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<polyline points="' + points + '" fill="none" stroke="#715bc6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + x(end) + '" cy="' + y(last.cpu) + '" r="2.8" fill="#715bc6"/></svg></figure>';
  }
  const scale = {
    init() {
      const s = {time: 0, instances: [replica(1, 'ready', 0), replica(2, 'ready', 0)], nextId: 3, next: 0,
        target: 60, min: 2, max: 6, startDelay: 3, stabilize: 5, gatewayLimit: workloads.scale.limit,
        profile: 'normal', profileSince: 0, manualLoad: workloads.scale.normal, desired: 2, recommendations: [], trend: [],
        advanced: false, events: [{time: 0, message: '两台商品实例已就绪并完成注册。'}]};
      scaleWindow(s);
      return s;
    },
    tick(s) { scaleWindow(s); },
    act(s, key, value) {
      if (key === 'advanced') s.advanced = !s.advanced;
      if (key === 'profile' && s.profile !== value && profiles.some(([id]) => id === value)) {
        s.profile = value;
        s.profileSince = s.time;
      }
      if (key === 'manualLoad') s.manualLoad = clamp(value, 0, workloads.scale.max);
      if (key === 'target') s.target = clamp(value, 30, 95);
      if (key === 'min') s.min = clamp(value, 1, s.max);
      if (key === 'max') s.max = clamp(value, s.min, 6);
      if (key === 'startDelay') s.startDelay = clamp(value, 1, 8);
      if (key === 'stabilize') s.stabilize = clamp(value, 1, 12);
      if (key === 'gatewayLimit') s.gatewayLimit = clamp(value, 0, workloads.scale.max);
    },
    controls(s) {
      const settings = ui.range('min', 'minReplicas · 最少副本', s.min, 1, s.max) +
        ui.range('max', 'maxReplicas · 最多副本', s.max, s.min, 6) +
        ui.range('startDelay', '新实例就绪耗时', s.startDelay, 1, 8, 1, '秒') +
        ui.range('stabilize', '缩容稳定窗口', s.stabilize, 1, 12, 1, '秒');
      const profileButtons = profiles.map(([id, label]) => '<button type="button" data-act="profile" data-value="' +
        ui.escape(id) + '" aria-pressed="' + (s.profile === id) + '">' + ui.escape(label) + '</button>').join('');
      return group('<div class="lesson-choice-buttons" role="group" aria-label="入站流量曲线"><span>入站流量曲线</span>' +
        profileButtons + '</div>',
        s.profile === 'manual' ? ui.range('manualLoad', '固定入站流量', s.manualLoad, 0, workloads.scale.max, 5, 'QPS') : '',
        s.profile === 'burst' ? note('先平稳 2 秒，随后 6 秒升至 ' + workloads.scale.rush + ' QPS，再回落到 ' + workloads.scale.quiet + ' QPS。') : '',
        ui.range('target', '目标 CPU 利用率', s.target, 30, 95, 5, '%'),
        ui.range('gatewayLimit', '网关 QPS 阈值', s.gatewayLimit, 0, workloads.scale.max, 5, 'QPS'),
        extra(s, '副本范围与等待时间', settings));
    },
    stats(s) {
      const w = s.window;
      return [['网关放行', w.passed, 'QPS'], ['平均 CPU', w.mean, '%'], ['就绪 / 期望', w.ready + ' / ' + s.desired, '个']];
    },
    stage(s) {
      const w = s.window;
      const nodes = [node('client', 'client', '商城客户端', w.incoming + ' 请求/秒'),
        node('gateway', 'gateway', 'API 网关', '放行 ' + w.passed + ' QPS'),
        node('hpa', 'control', 'HPA 控制器', '期望 ' + s.desired + ' 个副本')];
      const edges = [edge('client', 'gateway', w.incoming ? 'flow' : 'idle', w.incoming / workloads.scale.max)];
      for (const p of s.instances) {
        const remaining = Math.max(0, p.transitionAt - s.time);
        const sub = p.status === 'starting' ? remaining + ' 秒后就绪' :
          p.status === 'draining' ? (p.cancelled ? '已取消 · ' : '已摘流 · ') + remaining + ' 秒' : p.received + ' QPS · ' + p.cpu + '%';
        const status = p.status === 'starting' ? 'pending' : p.status === 'draining' ? 'muted' : p.cpu === 100 ? 'slow' : 'up';
        nodes.push(node(pid(p.id), 'product', product(p.id), sub, status));
        edges.push(edge('gateway', pid(p.id), p.received ? 'flow' : 'idle', p.received / Math.max(1, w.incoming)),
          edge('hpa', pid(p.id), 'control', p.status === 'ready' ? 0.08 : 0.55));
      }
      if (w.blocked || s.previousBatch?.requests.some(r => r.code === 429)) {
        nodes.push(node('reject', 'reject', '限流拦截', w.blocked + ' × 429', w.blocked ? 'down' : 'muted'));
        edges.push(edge('gateway', 'reject', w.blocked ? 'blocked' : 'idle', w.blocked / Math.max(1, w.incoming)));
      }
      return {nodes, edges, ...batches(s)};
    },
    detail(s) {
      const w = s.window;
      const rows = s.instances.map(p => [product(p.id), p.status === 'ready' ? '就绪 · 已注册' :
        p.status === 'starting' ? '启动中 · 未注册' : p.cancelled ? '已取消启动' : '退出中 · 已摘流', p.received + ' QPS', p.cpu + '%']);
      let result = table(['副本', '实例状态', '收到流量', 'CPU'], rows) + cpuTrend(s) +
        note('本轮采样　' + w.before + ' 个就绪副本 × ' + w.sampled + '% ÷ ' + w.target +
          '%，向上取整得 ' + w.raw + ' 个。按副本上下限修正后建议 ' + w.recommend + ' 个。') +
        (w.wait ? note('缩容等待　稳定窗口还保留较高的建议值。若流量维持当前水平，' + w.wait + ' 秒后可再次缩容。') : '') +
        timeline(s.events);
      if (s.advanced) {
        result += note('本例中单台收到 ' + workloads.scale.replicaCapacity + ' QPS 时 CPU 达到 100%。HPA 修改副本数，VPA 调整单个副本的资源。') +
          note('商品详情可以用副本分担读取流量。有状态服务扩容还需要处理数据分片或复制。') +
          table(['模拟秒', '到达 QPS', '平均 CPU', '就绪 / 期望'], s.trend.slice(-4).map(t =>
            ['T+' + t.time, t.incoming, t.cpu + '%', t.ready + ' / ' + t.desired]));
      }
      return result;
    }
  };
  scenes.scale = scale;
})();
