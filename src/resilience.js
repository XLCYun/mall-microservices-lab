(() => {
  'use strict';

  const {range, select, toggle, button, escape} = window.Lab.ui;
  const modes = [['config', '发布降级配置'], ['breaker', '自动熔断'], ['retry', '多层重试']];
  const namespaces = [['prod', '生产 prod'], ['test', '测试 test'], ['dev', '开发 dev']];
  const ruleNames = {slow: '慢调用比例', error: '异常比例'};
  const breakerNames = {CLOSED: '闭合', OPEN: '打开', HALF_OPEN: '半开'};
  const reasons = {
    full: '含评论', manual: '配置跳过评论', circuit: '断路器拦截', timeout: '评论超时',
    error: '评论出错', unavailable: '无就绪实例'
  };
  const limits = {
    delay: [20, 1600], errorRate: [0, 100], timeout: [50, 2000], retries: [0, 3],
    interval: [0, 500], maxRT: [50, 1200], threshold: [5, 95], window: [1, 20],
    minRequests: [1, 40], openSeconds: [1, 15], rate: [0, 30]
  };
  const ruleParameters = ['maxRT', 'threshold', 'window', 'minRequests', 'openSeconds'];
  const clip = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
  const percent = (part, total) => total ? Math.round(part * 1000 / total) / 10 : 0;
  const active = s => s.spaces[s.namespace];
  const copyRule = rule => ({...rule});
  const productId = number => 'product-' + String(number).padStart(2, '0');
  const productLabel = id => id.replace(/^product-(\d+)$/, '商品 $1');

  function random(holder) {
    holder.seed = (Math.imul(holder.seed, 1664525) + 1013904223) >>> 0;
    return holder.seed / 4294967296;
  }

  function addLog(space, time, message) {
    space.log.unshift({time, message});
    if (space.log.length > 8) space.log.pop();
  }

  function counters() {
    return {requests: 0, ok: 0, full: 0, degraded: 0, manual: 0, circuit: 0, inventory: 0,
      calls: 0, retries: 0, timeouts: 0, errors: 0, rt: 0};
  }

  function newBreaker() {
    return {state: 'CLOSED', until: 0, probe: null, buckets: [], trip: ''};
  }

  function currentConfig(space, id) {
    return space.overrides.find(rule => rule.id === id) || space.base;
  }

  function newInstance(space, id, readyAt = null) {
    const config = currentConfig(space, id);
    return {id, version: config.version, skip: config.skip, readyAt, appliedAt: null, pending: null,
      breaker: newBreaker(), calls: 0, hits: 0, frameCalls: 0, frameFailures: 0, frameHits: 0, last: null};
  }

  function newSpace() {
    const space = {
      version: 1, base: {version: 1, skip: false}, overrides: [], draft: false,
      scope: 'all', target: 'auto', loadMode: 'live', nextId: 3, cursor: 0,
      instances: [], frame: counters(), total: counters(), last: null, log: []
    };
    space.instances = [1, 2].map(number => newInstance(space, productId(number)));
    return space;
  }

  function retryCounts() {
    return {entrance: 0, gateway: 0, product: 0, review: 0, successes: 0};
  }

  function initResilience() {
    return {
      time: 0, mode: 'config', namespace: 'prod', spaces: {prod: newSpace(), test: newSpace(), dev: newSpace()},
      seed: 202642, rate: 6, delay: 400, errorRate: 0, timeout: 500, retries: 0, interval: 100,
      strategy: 'slow', maxRT: 250, threshold: 50, window: 5, minRequests: 6, openSeconds: 4,
      fallback: true, retry: {clientRetries: 1, gatewayRetries: 1, productRetries: 1,
        failure: 100, seed: 4217, frame: retryCounts(), total: retryCounts()}
    };
  }

  // The host can hand over the ready production replicas from the autoscaling scene.
  function syncInstances(s, ids) {
    if (!Array.isArray(ids)) return;
    const space = s.spaces.prod;
    const names = [...new Set(ids.map(id => typeof id === 'number' ? productId(id) : id)
      .filter(id => typeof id === 'string' && id.length))];
    const previous = space.instances;
    space.instances = names.map(id => previous.find(instance => instance.id === id) || newInstance(space, id));
    if (!names.includes(space.target)) space.target = 'auto';
    if (!names.includes(space.scope)) space.scope = 'all';
    const largestId = names.reduce((n, id) => Math.max(n, Number((id.match(/(\d+)$/) || [])[1]) || 0), 0);
    space.nextId = Math.max(space.nextId, largestId + 1);
  }

  function requestPublish(s) {
    const space = active(s);
    const chosen = space.scope === 'all' ? space.instances : space.instances.filter(i => i.id === space.scope);
    if (space.scope !== 'all' && !chosen.length) return;
    const rule = {version: ++space.version, skip: space.draft};
    if (space.scope === 'all') {
      space.base = rule;
      space.overrides = [];
    } else {
      space.overrides = space.overrides.filter(item => item.id !== space.scope);
      space.overrides.push({...rule, id: space.scope});
    }
    chosen.forEach((instance, index) => {
      instance.pending = {version: rule.version, at: space.loadMode === 'live' ? s.time + 1 + index : null};
    });
    const scope = space.scope === 'all' ? '全部实例' : space.scope;
    addLog(space, s.time, '向' + scope + '发布 v' + rule.version + '，' + (rule.skip ? '跳过' : '加载') + '评论。');
  }

  function refreshConfig(space, instance, time, boot) {
    const rule = currentConfig(space, instance.id);
    instance.version = rule.version;
    instance.skip = rule.skip;
    instance.pending = null;
    instance.readyAt = null;
    instance.appliedAt = time;
    addLog(space, time, instance.id + (boot ? ' 读取 v' : ' 应用 v') + rule.version
      + (boot ? ' 后开始接流量。' : (rule.skip ? '，开始跳过评论。' : '，恢复加载评论。')));
  }

  function trimWindow(s, breaker) {
    breaker.buckets = breaker.buckets.filter(bucket => bucket.time > s.time - s.window);
  }

  function windowCounts(breaker) {
    return breaker.buckets.reduce((sum, bucket) => {
      sum.samples += bucket.samples;
      sum.bad += bucket.bad;
      return sum;
    }, {samples: 0, bad: 0});
  }

  function tripBreaker(s, space, instance, why) {
    const breaker = instance.breaker;
    breaker.state = 'OPEN';
    breaker.until = s.time + s.openSeconds;
    breaker.probe = null;
    breaker.trip = why;
    addLog(space, s.time, instance.id + ' 断路器打开。' + why);
  }

  function advanceBreaker(s, space, instance) {
    const breaker = instance.breaker;
    trimWindow(s, breaker);
    if (breaker.state === 'OPEN' && s.time >= breaker.until) {
      breaker.state = 'HALF_OPEN';
      addLog(space, s.time, instance.id + ' 进入半开，等待一笔评论请求探测。');
    } else if (breaker.state === 'HALF_OPEN' && breaker.probe && s.time >= breaker.probe.at) {
      if (breaker.probe.bad) {
        const why = s.strategy === 'slow' ? '探测耗时 ' + breaker.probe.elapsed + ' ms，超过最大 RT。' : '探测仍出现评论调用异常。';
        tripBreaker(s, space, instance, why);
      } else {
        instance.breaker = newBreaker();
        addLog(space, s.time, instance.id + ' 探测通过，断路器恢复闭合。');
      }
    }
  }

  function recordAttempt(s, space, instance, elapsed, failed) {
    const breaker = instance.breaker;
    const bad = s.strategy === 'slow' ? elapsed > s.maxRT : failed;
    if (breaker.state === 'HALF_OPEN') {
      // Report the probe verdict at the next clock boundary so a single step exposes HALF_OPEN.
      breaker.probe = {at: s.time + Math.max(1, Math.ceil(elapsed / 1000)), bad, elapsed};
      return;
    }
    let bucket = breaker.buckets[breaker.buckets.length - 1];
    if (!bucket || bucket.time !== s.time) {
      bucket = {time: s.time, samples: 0, bad: 0};
      breaker.buckets.push(bucket);
    }
    bucket.samples++;
    if (bad) bucket.bad++;
    const counts = windowCounts(breaker);
    if (counts.samples >= s.minRequests && counts.bad * 100 > counts.samples * s.threshold) {
      tripBreaker(s, space, instance, '窗口内 ' + counts.samples + ' 次调用，'
        + ruleNames[s.strategy] + '为 ' + percent(counts.bad, counts.samples) + '%。');
    }
  }

  function reviewRequest(s, space, instance, result) {
    const guarded = s.mode === 'breaker';
    for (let attempt = 0; attempt <= s.retries; attempt++) {
      const breaker = instance.breaker;
      if (guarded && (breaker.state === 'OPEN' || (breaker.state === 'HALF_OPEN' && breaker.probe))) {
        result.reason = 'circuit';
        return;
      }
      if (attempt) {
        result.retries++;
        result.rt += s.interval;
      }
      const wasProbe = guarded && breaker.state === 'HALF_OPEN';
      const timeout = s.delay > s.timeout;
      const error = random(s) * 100 < s.errorRate;
      const elapsed = Math.min(s.delay, s.timeout);
      result.calls++;
      result.rt += elapsed;
      if (timeout) result.timeouts++;
      else if (error) result.errors++;
      if (guarded) recordAttempt(s, space, instance, elapsed, timeout || error);
      if (wasProbe) result.probe = true;
      result.reason = timeout ? 'timeout' : error ? 'error' : 'full';
      if (result.reason === 'full' || wasProbe) return;
    }
  }

  function responseLabel(result) {
    if (!result) return '等待请求';
    if (result.status !== 200) return 'HTTP ' + result.status + ' · ' + reasons[result.reason];
    return result.reason === 'full' ? 'HTTP 200 · 含评论' : 'HTTP 200 · 详情和库存';
  }

  function sendProduct(s, space, requestedId) {
    const ready = space.instances.filter(instance => instance.readyAt === null);
    let instance;
    if (requestedId && requestedId !== 'auto') {
      instance = ready.find(item => item.id === requestedId);
    } else if (ready.length) {
      instance = ready[space.cursor % ready.length];
      space.cursor++;
    }
    const result = {instance: instance ? instance.id : '', version: instance ? instance.version : null,
      reason: 'unavailable', status: 503, rt: instance ? 40 : 5, calls: 0, retries: 0, timeouts: 0,
      errors: 0, probe: false};
    if (instance) {
      if (instance.skip) result.reason = 'manual';
      else reviewRequest(s, space, instance, result);
      if (result.reason === 'full' || result.reason === 'manual' || s.fallback) result.status = 200;
      else if (result.reason === 'timeout') result.status = 504;
      else if (result.reason === 'error') result.status = 502;
      instance.hits++;
      instance.calls += result.calls;
      instance.frameHits++;
      instance.frameCalls += result.calls;
      instance.frameFailures += result.timeouts + result.errors;
      instance.last = result;
    }
    space.last = result;
    for (const count of [space.frame, space.total]) {
      count.requests++;
      if (instance) count.inventory++;
      if (result.status === 200) count.ok++;
      if (result.reason === 'full') count.full++;
      else if (result.status === 200) count.degraded++;
      if (result.reason === 'manual') count.manual++;
      if (result.reason === 'circuit') count.circuit++;
      for (const key of ['rt', 'calls', 'retries', 'timeouts', 'errors']) count[key] += result[key];
    }
    return result;
  }

  // Each caller retries only after its immediate downstream has exhausted its own attempts.
  function layeredRequest(retry) {
    const counts = retryCounts();
    counts.entrance = 1;
    function callReview() {
      counts.review++;
      return random(retry) * 100 >= retry.failure;
    }
    function attempt(retries, call) {
      for (let i = 0; i <= retries; i++) if (call()) return true;
      return false;
    }
    function callProduct() {
      counts.product++;
      return attempt(retry.productRetries, callReview);
    }
    function callGateway() {
      counts.gateway++;
      return attempt(retry.gatewayRetries, callProduct);
    }
    if (attempt(retry.clientRetries, callGateway)) counts.successes++;
    retry.frame = counts;
    for (const key of Object.keys(counts)) retry.total[key] += counts[key];
  }

  function tickResilience(s) {
    for (const space of Object.values(s.spaces)) {
      space.frame = counters();
      for (const instance of space.instances) {
        instance.frameHits = 0;
        instance.frameCalls = 0;
        instance.frameFailures = 0;
        if (instance.readyAt !== null && instance.readyAt <= s.time) refreshConfig(space, instance, s.time, true);
        else if (instance.pending && instance.pending.at !== null && instance.pending.at <= s.time) {
          refreshConfig(space, instance, s.time, false);
        }
        advanceBreaker(s, space, instance);
      }
    }
    if (s.mode === 'retry') layeredRequest(s.retry);
    else for (let i = 0; i < s.rate; i++) sendProduct(s, active(s));
  }

  function resetBreakers(s) {
    for (const space of Object.values(s.spaces)) {
      for (const instance of space.instances) instance.breaker = newBreaker();
    }
  }

  function actResilience(s, key, value, target, ctx) {
    const space = active(s);
    if (Object.prototype.hasOwnProperty.call(limits, key)) {
      const next = clip(value, ...limits[key]);
      if (next !== s[key] && ruleParameters.includes(key)) resetBreakers(s);
      s[key] = next;
      return;
    }
    if (key === 'mode' && modes.some(([mode]) => mode === value)) {
      if (s.mode !== value) resetBreakers(s);
      s.mode = value;
    } else if (key === 'namespace' && namespaces.some(([name]) => name === value)) {
      s.namespace = value;
    } else if (key === 'draft') {
      space.draft = Boolean(value);
    } else if (key === 'publish') {
      requestPublish(s);
      ctx.notify('已发布 v' + space.version + '。' + (space.loadMode === 'live' ? '单步查看各实例应用配置。' : '重启目标实例即可加载。'));
    } else if (key === 'scope' || key === 'target') {
      if (value === (key === 'scope' ? 'all' : 'auto') || space.instances.some(i => i.id === value)) space[key] = value;
    } else if (key === 'loadMode' && ['live', 'restart'].includes(value)) {
      space.loadMode = value;
      space.instances.forEach((item, index) => {
        if (item.pending) item.pending.at = value === 'live' ? s.time + 1 + index : null;
      });
    } else if (key === 'add') {
      if (space.instances.length >= 8) { ctx.notify('当前已有 8 个商品实例。'); return; }
      let id;
      do { id = productId(space.nextId++); } while (space.instances.some(item => item.id === id));
      const instance = newInstance(space, id, s.time + 1);
      space.instances.push(instance);
      addLog(space, s.time, id + ' 启动，先读取 v' + instance.version + '。');
      ctx.notify(id + ' 已读取 v' + instance.version + '，下一步开始接流量。');
    } else if (key === 'restart') {
      const instance = space.instances.find(i => i.id === space.target) || space.instances[0];
      if (!instance) return;
      instance.readyAt = s.time + 1;
      instance.breaker = newBreaker();
      addLog(space, s.time, instance.id + ' 重启，已暂停接流量。');
      ctx.notify(instance.id + ' 将在启动时重新读取配置。');
    } else if (key === 'request') {
      const result = sendProduct(s, space, space.target);
      ctx.notify((result.instance ? result.instance + ' · ' : '') + responseLabel(result) + ' · ' + result.rt + ' ms');
    } else if (key === 'strategy' && Object.prototype.hasOwnProperty.call(ruleNames, value)) {
      if (value !== s.strategy) resetBreakers(s);
      s.strategy = value;
    } else if (key === 'fallback') {
      s.fallback = Boolean(value);
    } else if (['clientRetries', 'gatewayRetries', 'productRetries'].includes(key)) {
      s.retry[key] = clip(value, 0, 3);
    } else if (key === 'layerFailure') {
      s.retry.failure = clip(value, 0, 100);
    } else if (key === 'layerRequest') {
      layeredRequest(s.retry);
      ctx.notify('1 笔入口请求触发了 ' + s.retry.frame.review + ' 次评论调用。');
    }
  }

  function closer(title, body) {
    return '<details><summary>' + escape(title) + '</summary>' + body + '</details>';
  }

  function actions(...items) { return '<div class="control-group">' + items.join('') + '</div>'; }
  function hint(value) { return '<p class="panel-note">' + escape(value) + '</p>'; }
  function ruleNote(s) {
    return '每个商品实例单独统计。近 ' + s.window + ' 秒至少有 ' + s.minRequests
      + ' 次评论调用，且' + ruleNames[s.strategy] + '超过 ' + s.threshold + '% 时打开断路器。';
  }

  function controlsResilience(s) {
    const mode = select('mode', '演练内容', s.mode, modes);
    if (s.mode === 'retry') {
      return mode + range('clientRetries', '客户端重试次数', s.retry.clientRetries, 0, 3, 1, '次')
        + range('gatewayRetries', '网关重试次数', s.retry.gatewayRetries, 0, 3, 1, '次')
        + range('productRetries', '商品实例重试次数', s.retry.productRetries, 0, 3, 1, '次')
        + range('layerFailure', '评论错误率', s.retry.failure, 0, 100, 5, '%')
        + button('layerRequest', '发送 1 笔请求', 'primary')
        + hint('这组请求会把评论错误逐级返回。任一层拿到成功响应后，就停止重试。');
    }
    const space = active(s);
    const ids = space.instances.map(i => [i.id, i.id]);
    const publish = toggle('draft', '暂时跳过商品评论', space.draft)
      + actions(button('publish', '发布配置', 'primary'), button('add', '增加商品实例'));
    const faults = range('delay', '评论服务延迟', s.delay, ...limits.delay, 20, 'ms')
      + range('errorRate', '评论服务错误率', s.errorRate, 0, 100, 5, '%');
    const options = select('namespace', '命名空间', s.namespace, namespaces)
      + select('scope', '配置发布范围', space.scope, [['all', '全部实例'], ...ids])
      + select('loadMode', '实例加载配置的时机', space.loadMode, [['live', '动态更新'], ['restart', '重启时加载']])
      + select('target', '单次请求发往', space.target, [['auto', '自动轮询'], ...ids])
      + actions(button('request', '请求一次'), button('restart', '重启 ' + (space.target === 'auto'
        ? (space.instances[0]?.id || '实例') : space.target)));
    const retryForm = range('timeout', '单次调用超时', s.timeout, ...limits.timeout, 50, 'ms')
      + range('retries', '最多额外重试', s.retries, ...limits.retries, 1, '次')
      + range('interval', '重试间隔', s.interval, ...limits.interval, 25, 'ms')
      + range('rate', '每秒商品请求', s.rate, ...limits.rate, 1, '笔')
      + toggle('fallback', '评论故障时返回详情和库存', s.fallback);
    if (s.mode === 'config') {
      return mode + publish + range('delay', '评论服务延迟', s.delay, ...limits.delay, 20, 'ms')
        + closer('灰度发布、命名空间与定向请求', options)
        + closer('错误率、超时与重试', range('errorRate', '评论服务错误率', s.errorRate, 0, 100, 5, '%') + retryForm);
    }
    const rule = select('strategy', '熔断策略', s.strategy, Object.entries(ruleNames))
      + (s.strategy === 'slow' ? range('maxRT', '最大 RT', s.maxRT, ...limits.maxRT, 10, 'ms') : '')
      + range('threshold', ruleNames[s.strategy] + '阈值', s.threshold, ...limits.threshold, 5, '%')
      + range('minRequests', '最小请求数', s.minRequests, ...limits.minRequests, 1, '次')
      + range('window', '统计时长', s.window, ...limits.window, 1, 's')
      + range('openSeconds', '熔断时长', s.openSeconds, ...limits.openSeconds, 1, 's');
    const skipped = space.instances.some(i => i.skip);
    return mode + faults + (skipped ? hint('部分实例正按配置跳过评论。关闭下方开关并发布后，这些实例才会产生熔断样本。') : '')
      + closer('熔断规则', rule + hint('调整熔断规则后，各实例重新统计。'))
      + closer('超时、重试与兜底', retryForm)
      + closer('配置中心与定向请求', publish + options);
  }

  function statsResilience(s) {
    if (s.mode === 'retry') {
      const f = s.retry.frame;
      return [['入口请求', f.entrance, '笔'], ['评论调用', f.review, '次'], ['下游放大倍数', f.entrance ? f.review / f.entrance : '—', '倍']];
    }
    const frame = active(s).frame;
    if (s.mode === 'config') return [['评论调用', frame.calls, '次'], ['跳过评论', frame.manual, '笔'], ['商品成功率', frame.requests ? percent(frame.ok, frame.requests) : '—', '%']];
    return [['断路器拦截', frame.circuit, '笔'], ['商品成功率', frame.requests ? percent(frame.ok, frame.requests) : '—', '%'],
      ['平均响应时间', frame.requests ? Math.round(frame.rt / frame.requests) : '—', 'ms']];
  }

  const node = (id, role, label, sub, status = 'up') => ({id, role, label, sub, status});
  function flow(from, to, count, total) {
    return {from, to, kind: count ? 'flow' : 'idle', weight: count ? Math.min(1, count / Math.max(total, 1)) : 0};
  }
  const controlEdge = (from, to, weight = 0.35) => ({from, to, kind: 'control', weight});

  function stageResilience(s) {
    if (s.mode === 'retry') {
      const f = s.retry.frame;
      const lastLeg = flow('product', 'review', f.review, f.review);
      if (f.review && !f.successes) lastLeg.kind = 'blocked';
      return {nodes: [node('client', 'client', '买家', f.entrance + ' 笔请求'), node('gateway', 'gateway', '网关', f.gateway + ' 次调用'),
        node('product', 'product', '商品服务', f.product + ' 次调用'), node('review', 'review', '评论服务', f.review + ' 次调用', s.retry.failure === 100 ? 'down' : 'up')],
      edges: [flow('client', 'gateway', f.gateway, f.review), flow('gateway', 'product', f.product, f.review), lastLeg]};
    }
    const space = active(s);
    const f = space.frame;
    const nodes = [node('client', 'client', '买家', f.requests + ' 笔请求'), node('gateway', 'gateway', '网关', '商品详情路由'),
      node('config', 'config', '配置中心', s.namespace + ' · v' + space.version),
      node('inventory', 'inventory', '库存服务', f.inventory + ' 次调用'),
      node('review', 'review', '评论服务', f.calls + ' 次调用', s.errorRate === 100 ? 'down' : s.delay > s.maxRT ? 'slow' : 'up')];
    const edges = [flow('client', 'gateway', f.requests, f.requests)];
    space.instances.forEach((i, index) => {
      const id = 'instance-' + index;
      const branching = i.skip || (s.mode === 'breaker' && i.breaker.state === 'OPEN');
      const label = i.readyAt !== null ? '启动中' : s.mode === 'breaker' ? breakerNames[i.breaker.state] : i.skip ? '跳过评论' : '加载评论';
      const status = i.readyAt !== null || i.breaker.state === 'HALF_OPEN' ? 'pending' : 'up';
      nodes.push(node(id, 'product', productLabel(i.id), 'v' + i.version + ' · ' + label, status));
      const syncing = i.readyAt !== null || (i.pending && i.pending.at !== null) || i.appliedAt === s.time;
      edges.push(controlEdge('config', id, syncing ? 0.9 : 0), flow('gateway', id, i.frameHits, f.requests),
        flow(id, 'inventory', i.frameHits, f.inventory));
      const reviewEdge = flow(id, 'review', i.frameCalls, f.calls);
      if ((i.frameCalls && i.frameFailures === i.frameCalls) || (!i.frameCalls && branching && i.readyAt === null)) {
        reviewEdge.kind = 'blocked';
      }
      edges.push(reviewEdge);
    });
    return {nodes, edges};
  }

  function table(headers, rows) {
    return '<div class="table-wrap"><table class="data-table"><thead><tr>' + headers.map(x => '<th scope="col">' + escape(x) + '</th>').join('')
      + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map((cell, index) => !index
        ? '<th scope="row">' + cell + '</th>' : '<td>' + cell + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }

  function breakerLabel(i, time) {
    const b = i.breaker;
    if (b.state === 'OPEN') return '打开 · 余 ' + Math.max(0, b.until - time) + ' s';
    if (b.state === 'HALF_OPEN') return b.probe ? '半开 · 探测中' : '半开 · 等探测';
    return '闭合';
  }

  function detailResilience(s) {
    if (s.mode === 'retry') {
      const f = s.retry.frame;
      const rows = [['买家原始请求', f.entrance], ['网关收到', f.gateway], ['商品服务收到', f.product], ['评论服务收到', f.review]];
      return '<h3>一笔请求经过了几次调用？</h3>' + table(['调用位置', '最近一笔'], rows)
        + hint('评论持续失败时，每笔最多调用评论 ' + (1 + s.retry.clientRetries) + ' × ' + (1 + s.retry.gatewayRetries)
          + ' × ' + (1 + s.retry.productRetries) + ' = ' + ((1 + s.retry.clientRetries) * (1 + s.retry.gatewayRetries) * (1 + s.retry.productRetries)) + ' 次。');
    }
    const space = active(s);
    const rows = space.instances.map(i => {
      const config = 'v' + i.version + ' · ' + (i.skip ? '跳过' : '加载') + '评论';
      let next = '';
      if (i.readyAt !== null) next = '准备接流量';
      else if (i.pending) next = 'v' + i.pending.version + (i.pending.at === null ? ' 等待重启' : ' 将于 ' + i.pending.at + ' s 生效');
      const response = i.last ? responseLabel(i.last) + '<br><small>v' + i.last.version + ' · ' + reasons[i.last.reason] + ' · ' + i.last.rt + ' ms</small>' : '等待请求';
      const fields = [escape(i.id), config + (next ? '<br><small>' + next + '</small>' : '')];
      if (s.mode === 'breaker') {
        const counts = windowCounts(i.breaker);
        fields.push(breakerLabel(i, s.time) + '<br><small>' + i.breaker.state + ' · ' + counts.bad + '/' + counts.samples + '</small>');
      }
      fields.push(i.frameCalls + ' / ' + i.calls, response);
      return fields;
    });
    const headers = ['商品实例', '生效配置'];
    if (s.mode === 'breaker') headers.push('断路器 · 窗口样本');
    headers.push('评论调用 本秒/累计', '最近商品响应');
    let html = '<h3>' + (s.mode === 'breaker' ? '各实例的断路器' : '各实例的配置与响应') + '</h3>' + table(headers, rows);
    const f = space.frame;
    html += hint('本秒共 ' + f.requests + ' 笔商品请求，' + f.full + ' 笔含评论，' + f.degraded
      + ' 笔仅返回详情和库存，' + (f.requests - f.ok) + ' 笔失败。'
      + (f.requests ? '平均响应时间 ' + Math.round(f.rt / f.requests) + ' ms。' : ''));
    if (s.mode === 'breaker') html += hint(ruleNote(s) + '半开时只放行一笔探测，下一步可见结果。');
    if (space.log.length) html += closer('最近的配置与断路器事件', '<ul>' + space.log.map(entry => '<li><strong>'
      + entry.time + ' s</strong> · ' + escape(entry.message) + '</li>').join('') + '</ul>');
    return html;
  }

  function summaryResilience(s) {
    if (s.mode === 'retry') {
      const f = s.retry.frame;
      return [['演练', '多层重试'], ['额外重试次数', '客户端 ' + s.retry.clientRetries + ' / 网关 ' + s.retry.gatewayRetries + ' / 商品 ' + s.retry.productRetries],
        ['评论错误率', s.retry.failure + '%'], ['最近一笔', '入口 ' + f.entrance + ' → 网关 ' + f.gateway + ' → 商品 ' + f.product + ' → 评论 ' + f.review],
        ['累计结果', s.retry.total.entrance + ' 笔入口请求，' + s.retry.total.review + ' 次评论调用，成功 ' + s.retry.total.successes + ' 笔']];
    }
    const space = active(s);
    const f = space.frame;
    const summary = [['演练', s.mode === 'config' ? '发布降级配置' : '自动熔断'], ['命名空间', s.namespace],
      ['配置中心', '最新 v' + space.version + '，全量 v' + space.base.version + (space.base.skip ? ' 跳过评论' : ' 加载评论')],
      ['商品实例', space.instances.map(i => i.id + ' v' + i.version + (i.skip ? ' 跳过' : ' 加载') + '，本秒调用评论 ' + i.frameCalls + ' 次').join(' / ') || '暂无实例'],
      ['当前评论与重试设置', '延迟 ' + s.delay + ' ms，错误率 ' + s.errorRate + '%，超时 ' + s.timeout + ' ms，最多重试 ' + s.retries + ' 次，间隔 ' + s.interval + ' ms']];
    if (s.mode === 'breaker') summary.push(['熔断规则', ruleNote(s) + ' 最大 RT ' + s.maxRT + ' ms，熔断 ' + s.openSeconds + ' s。'],
      ['断路器状态', space.instances.map(i => i.id + ' ' + i.breaker.state).join(' / ')]);
    summary.push(['本秒商品响应', f.requests + ' 笔请求，HTTP 200 共 ' + f.ok + ' 笔，降级 ' + f.degraded + ' 笔，平均 ' + (f.requests ? Math.round(f.rt / f.requests) : 0) + ' ms'],
      ['本秒评论调用', f.calls + ' 次，重试 ' + f.retries + ' 次，超时 ' + f.timeouts + ' 次，服务报错 ' + f.errors + ' 次']);
    if (space.last) summary.push(['最近一笔', (space.last.instance ? space.last.instance + ' · v' + space.last.version + ' · ' : '')
      + responseLabel(space.last) + '，' + reasons[space.last.reason] + '，耗时 ' + space.last.rt + ' ms']);
    return summary;
  }

  window.Lab.scenes.resilience = {init: initResilience, tick: tickResilience, act: actResilience, controls: controlsResilience,
    stats: statsResilience, stage: stageResilience, detail: detailResilience, summary: summaryResilience, syncInstances};

  function meshFrame() { return {requests: 0, v1: 0, v2: 0, header: 0, tagged: 0, weightedV1: 0, weightedV2: 0}; }

  function initMesh() {
    const initial = {version: 1, v2: 10, byHeader: false};
    return {time: 0, architecture: 'sidecar', desired: copyRule(initial), applied: copyRule(initial), due: null, appliedAt: null,
      hold: false, rate: 100, taggedShare: 20, tagCredit: 0, weightCredit: 0,
      frame: meshFrame(), total: meshFrame(), last: null};
  }

  function routeMesh(s, tagged) {
    const policy = s.applied;
    const matched = policy.byHeader && tagged;
    let destination = 'v2';
    if (!matched) {
      s.weightCredit += policy.v2;
      if (s.weightCredit >= 100) s.weightCredit -= 100;
      else destination = 'v1';
    }
    for (const f of [s.frame, s.total]) {
      f.requests++;
      f[destination]++;
      if (tagged) f.tagged++;
      if (matched) f.header++;
      else f[destination === 'v1' ? 'weightedV1' : 'weightedV2']++;
    }
    s.last = {version: policy.version, destination, matched, tagged, architecture: s.architecture};
  }

  function tickMesh(s) {
    if (!s.hold && s.due !== null && s.time >= s.due) {
      s.applied = copyRule(s.desired);
      s.appliedAt = s.time;
      s.weightCredit = 0;
      s.due = null;
    }
    s.frame = meshFrame();
    for (let i = 0; i < s.rate; i++) {
      s.tagCredit += s.taggedShare;
      const tagged = s.tagCredit >= 100;
      if (tagged) s.tagCredit -= 100;
      routeMesh(s, tagged);
    }
  }

  function editMeshRule(s, change) {
    if (Object.entries(change).every(([key, value]) => s.desired[key] === value)) return;
    s.desired = {...s.desired, ...change, version: s.desired.version + 1};
    s.due = s.time + 1;
  }

  function actMesh(s, key, value, target, ctx) {
    if (key === 'weightV2') editMeshRule(s, {v2: clip(value, 0, 100)});
    else if (key === 'weightV1') editMeshRule(s, {v2: 100 - clip(value, 0, 100)});
    else if (key === 'byHeader') editMeshRule(s, {byHeader: Boolean(value)});
    else if (key === 'architecture' && s.architecture !== value && ['sidecar', 'sdk'].includes(value)) {
      s.architecture = value;
      s.frame = meshFrame();
      s.last = null;
    }
    else if (key === 'taggedShare') s.taggedShare = clip(value, 0, 100);
    else if (key === 'meshRate') s.rate = clip(value, 0, 200);
    else if (key === 'hold') s.hold = Boolean(value);
    else if (key === 'plainRequest' || key === 'taggedRequest') {
      routeMesh(s, key === 'taggedRequest');
      ctx.notify((s.last.matched ? '命中请求头规则' : '按版本权重分配') + '，请求到达商品 ' + s.last.destination + '。');
    }
  }

  function controlsMesh(s) {
    return select('architecture', '治理逻辑放在哪里', s.architecture,
      [['sidecar', 'Sidecar · 独立代理'], ['sdk', 'SDK · 网关进程内']])
      + range('weightV1', '商品 v1 权重', 100 - s.desired.v2, 0, 100, 5, '%')
      + range('weightV2', '商品 v2 权重', s.desired.v2, 0, 100, 5, '%')
      + toggle('byHeader', '带内测请求头的流量优先去 v2', s.desired.byHeader)
      + hint(s.due === null ? '两个版本的权重合计 100%。调整规则后，单步查看新分流。'
        : '配置源已生成规则 #' + s.desired.version + '，当前转发仍使用 #' + s.applied.version + '。')
      + closer('定向发请求与配置下发', range('taggedShare', '带内测请求头的比例', s.taggedShare, 0, 100, 5, '%')
        + range('meshRate', '每秒商品请求', s.rate, 0, 200, 10, '笔') + toggle('hold', '暂停下发配置', s.hold)
        + actions(button('plainRequest', '发普通请求'), button('taggedRequest', '发内测请求')));
  }

  function statsMesh(s) {
    return [['商品 v1 收到', s.frame.v1, '笔'], ['商品 v2 收到', s.frame.v2, '笔'], ['请求头命中', s.frame.header, '笔']];
  }

  function stageMesh(s) {
    const f = s.frame;
    const sidecar = s.architecture === 'sidecar';
    const executor = sidecar ? 'sidecar' : 'gateway';
    const nodes = [node('client', 'client', '买家', f.requests + ' 笔请求'),
      node('gateway', 'gateway', '商城网关', sidecar ? '商品详情请求' : '内置路由 SDK'),
      node('control', 'control', sidecar ? 'istiod' : 'SDK 配置源', '路由规则 #' + s.desired.version, s.hold ? 'muted' : 'up'),
      node('v1', 'v1', '商品 v1', (sidecar ? '入站代理 · ' : '') + f.v1 + ' 笔'),
      node('v2', 'v2', '商品 v2', (sidecar ? '入站代理 · ' : '') + f.v2 + ' 笔')];
    const edges = [flow('client', 'gateway', f.requests, f.requests)];
    if (sidecar) {
      nodes.push(node('sidecar', 'sidecar', 'Envoy 代理', '执行规则 #' + s.applied.version));
      edges.push(flow('gateway', 'sidecar', f.requests, f.requests));
    }
    edges.push(s.hold ? {from: 'control', to: executor, kind: 'blocked', weight: 0}
      : controlEdge('control', executor, s.due !== null || s.appliedAt === s.time ? 1 : 0),
    flow(executor, 'v1', f.v1, f.requests), flow(executor, 'v2', f.v2, f.requests));
    return {nodes, edges};
  }

  function meshYaml(rule) {
    const lines = ['apiVersion: networking.istio.io/v1', 'kind: VirtualService', 'metadata:', '  name: product',
      'spec:', '  hosts: [product]', '  http:'];
    if (rule.byHeader) lines.push('  - match:', '    - headers:', '        x-canary:', '          exact: "true"',
      '    route:', '    - destination: {host: product, subset: v2}');
    lines.push('  - route:', '    - destination: {host: product, subset: v1}', '      weight: ' + (100 - rule.v2),
      '    - destination: {host: product, subset: v2}', '      weight: ' + rule.v2, '---',
      'apiVersion: networking.istio.io/v1', 'kind: DestinationRule', 'metadata:', '  name: product',
      'spec:', '  host: product', '  subsets:', '  - name: v1', '    labels: {version: v1}', '  - name: v2', '    labels: {version: v2}');
    return lines.join('\n');
  }

  function detailMesh(s) {
    const f = s.frame;
    const sidecar = s.architecture === 'sidecar';
    let html = '<h3>按规则核对流量</h3>' + table(['本秒路由依据', '商品 v1', '商品 v2'],
      [['权重分流', f.weightedV1, f.weightedV2], ['匹配 x-canary: true', 0, f.header]]);
    html += hint(sidecar ? 'istiod 将规则下发给 Envoy。网关的出站代理选择商品版本，目标实例的入站代理将请求交给服务。'
      : '网关进程内的 SDK 读取路由配置，为每笔商品请求选择版本。');
    if (s.last) html += hint('最近一笔' + (s.last.tagged ? '带 x-canary: true' : '为普通请求')
      + '，' + (s.last.architecture === 'sidecar' ? 'Envoy' : '网关 SDK') + ' 按规则 #' + s.last.version
      + (s.last.matched ? ' 匹配请求头' : ' 按权重分流') + '，发往商品 ' + s.last.destination + '。');
    return html + closer(sidecar ? '查看 VirtualService 与 DestinationRule' : '查看同一路由的 Istio 配置',
      hint('VirtualService 按顺序匹配路由。DestinationRule 用 version 标签定义 v1 和 v2 两个实例子集。')
      + '<pre><code>' + escape(meshYaml(s.desired)) + '</code></pre>');
  }

  function summaryMesh(s) {
    const f = s.frame;
    return [['治理方式', s.architecture === 'sidecar' ? 'Envoy Sidecar' : '网关进程内 SDK'],
      ['配置版本', '配置源 #' + s.desired.version + ' / 数据转发 #' + s.applied.version + (s.hold ? '，暂停下发' : '')],
      ['生效权重', 'v1 ' + (100 - s.applied.v2) + '% / v2 ' + s.applied.v2 + '%'],
      ['内测请求头', s.applied.byHeader ? 'x-canary: true 优先路由到 v2' : '按权重分配'],
      ['本秒路由', f.requests + ' 笔请求，v1 收到 ' + f.v1 + ' 笔，v2 收到 ' + f.v2 + ' 笔，命中请求头 ' + f.header + ' 笔'],
      ['累计分流', 'v1 收到 ' + s.total.v1 + ' 笔，v2 收到 ' + s.total.v2 + ' 笔']];
  }

  window.Lab.scenes.mesh = {init: initMesh, tick: tickMesh, act: actMesh, controls: controlsMesh, stats: statsMesh,
    stage: stageMesh, detail: detailMesh, summary: summaryMesh};
})();
