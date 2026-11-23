import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {deploymentFrames} from './src/registry-deployment.js';
import {lessonRecords} from './src/guided-runs.js';
import { phonePath, verifyPhone } from './src/phone-endpoint.js';

const host = vm.createContext({ console });
host.window = host;
for (const file of ['core', 'request-flow', 'story', 'traffic', 'registry-frames', 'resilience', 'phone', 'contract', 'request-balls']) {
  const source = await readFile(new URL('./src/' + file + '.js', import.meta.url), 'utf8');
  vm.runInContext(source, host, { filename: file + '.js' });
}
const { scenes, story, workloads, requestBalls } = host.Lab;
const phoneUrl = 'http://localhost/' + phonePath;
const postPhone = body => verifyPhone(new Request(phoneUrl, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body
}));
host.Lab.phoneClient = { send: postPhone };
assert.deepEqual(Array.from(host.Lab.topics, group => [group.label, Array.from(group.scenes, scene => scene.id)]), [
  ['微服务治理', ['registry','gateway','scale','resilience','mesh']], ['微服务测试', ['phone','contract']]
]);
assert.equal(new Set(story.map(scene => scene.id)).size, 7);

const context = { notify() {} };
const advance = (scene, state, seconds = 1) => {
  for (let i = 0; i < seconds; i++) {
    state.time++;
    scene.tick(state);
  }
};
const change = (scene, state, key, value) => scene.act(state, key, value, null, context);
const business = batch => batch.requests.filter(request => request.channel === 'request');
function verifyPaths(model) {
  const paths = new Map(model.nodes.map(node => [node.id, new Set()]));
  assert.equal(paths.size, model.nodes.length, '节点标识应唯一');
  for (const {from, to} of model.edges) {
    assert.ok(paths.has(from) && paths.has(to), '连线需有起点和终点');
    paths.get(from).add(to);
    paths.get(to).add(from);
  }
  for (const batch of [model.batch, model.manualBatch].filter(Boolean)) {
    for (const event of batch.requests) {
      assert.ok(Number.isFinite(event.at) && event.at >= 0);
      assert.equal(event.path.length, event.tones.length + 1);
      assert.ok(event.tones.length > 0);
      event.tones.forEach((tone, i) => {
        assert.ok(['neutral', 'pass', 'stop', 'control'].includes(tone));
        assert.ok(paths.get(event.path[i])?.has(event.path[i + 1]), '小球路径必须连接图中已有节点');
      });
    }
  }
}
function straightGeometry(model) {
  const items = new Map(model.nodes.map(node => [node.id, {node, size: 1}]));
  const connections = new Map(model.nodes.map(node => [node.id, new Map()]));
  for (const {from, to} of model.edges) {
    connections.get(from).set(to, {from: items.get(from), to: items.get(to), length: 100});
  }
  return {unit: 1, connections, pointAt: (_route, t) => [100 * t, 40]};
}
for (const { id } of story) {
  const scene = scenes[id],
    first = scene.init();
  first.time = 0;
  const baseline = JSON.stringify(first);
  const restored = JSON.parse(baseline);
  for (const state of [first, restored]) {
    for (let i = 0; i < 12; i++) {
      state.time++;
      await scene.tick(state);
    }
  }
  assert.equal(JSON.stringify(first), JSON.stringify(restored), id + ' 重放应一致');
  assert.equal(scene.stats(first).length, 3);
  verifyPaths(scene.stage(first));
}
const registry = scenes.registry.init();
const pushes = batch => batch.requests.filter(r => r.operation === 'push');
const heartbeatSources = batch => batch.requests.filter(r => r.operation === 'heartbeat').map(r => r.path[0]).join();
assert.equal(registry.heartbeat, 1);
assert.equal(registry.expire, 2);
assert.equal(heartbeatSources(registry.batch), '', '注册消息与定期心跳单独记录');
assert.equal(business(registry.batch).length, 6);
change(scenes.registry, registry, 'retry', true);
change(scenes.registry, registry, 'instance');
advance(scenes.registry, registry);
const retries = business(registry.batch).filter(r => r.attempts.length === 2);
assert.equal(retries.length, registry.window.recovered);
assert.ok(retries.length > 0 && retries.every(r => r.tones.join('/') === 'neutral/stop/stop/pass'));
verifyPaths(scenes.registry.stage(registry));
assert.equal(heartbeatSources(registry.batch), 'product-1', '掉线的 02 不再发送心跳');
assert.equal(registry.instances[1].missed, 1);
assert.equal(registry.cache.length, 2, '只漏收一次心跳时保留原名单');
advance(scenes.registry, registry);
assert.equal(registry.instances.filter(node => node.registered).length, 1);
assert.equal(registry.cache.length, 1);
assert.equal(pushes(registry.batch).length, 1);
assert.equal(pushes(registry.batch)[0].path.join('/'), 'registry/gateway');
assert.ok(business(registry.batch).every(request => request.to === 'product-1'));
change(scenes.registry, registry, 'instance');
assert.equal(registry.cache.join(), '1,2', '02 重新注册时，暂停中的网关也会立即收到变更');
assert.equal(pushes(registry.manualBatch).length, 1);
for (let i = 0; i < 8; i++) {
  advance(scenes.registry, registry);
  assert.equal(heartbeatSources(registry.batch), 'product-1,product-2');
  assert.ok(registry.batch.requests.every(r => r.operation !== 'lookup' && r.operation !== 'push'),
    '正常心跳不触发查表或重复推送');
}
const healthyStage = scenes.registry.stage(registry);
const healthyGeometry = straightGeometry(healthyStage);
const markersAt = elapsed => requestBalls.atTime(healthyGeometry, healthyStage, registry.time + elapsed);
const moving = markersAt(0.25);
assert.equal(moving.filter(p => p.isHeartbeat).length, 2);
assert.ok(moving.every(p => p.isHeartbeat === (p.request.operation === 'heartbeat')));
assert.ok(moving.filter(p => p.isHeartbeat).every(p => p.request.channel === 'control' && p.request.path[1] === 'registry'));
const firstHeartAt = t => markersAt(t).find(p => p.request.operation === 'heartbeat' && p.request.path[0] === 'product-1');
assert.ok(firstHeartAt(0.25).radius > firstHeartAt(0.02).radius, '飞行中的红心随模拟时间跳动');
assert.ok(markersAt(0.8).every(p => !p.isHeartbeat), '心跳到达后红心消失');
change(scenes.registry, registry, 'add');
assert.equal(registry.cache.join(), '1,2,3', '新增实例立即进入网关名单');

const replica = scenes.registry.init();
change(scenes.registry, replica, 'reader', 'replica');
change(scenes.registry, replica, 'instance');
advance(scenes.registry, replica, 2);
assert.equal(replica.instances[1].registered, false);
assert.equal(replica.cache.join(), '1,2');
advance(scenes.registry, replica, 3);
assert.equal(replica.cache.join(), '1', '选择副本时，副本一收到变更就通知网关');
assert.equal(pushes(replica.batch).length, 1);

const deployments = deploymentFrames(host.Lab);
const [single, pair, fleet] = deployments.map(definition => definition.createRun());
for (const clip of deployments) {
  const {model, rate, entries} = clip.createRun().frame();
  verifyPaths(model);
  assert.equal(model.nodes.some(node => node.role === 'registry'), false);
  assert.equal(business(model.batch).length, rate);
  assert.equal(model.batch.requests.length, rate);
  assert.ok(requestBalls.atTime(straightGeometry(model), model, clip.stillTime).length > 0);
  for (const entry of entries) assert.equal(entry.address, scenes.registry.service.endpoint(entry.id));
}
assert.equal(single.frame().model.batch.requests[0].path.join(), 'client,gateway,product-1');
single.configure('instance');
single.advanceTo(3);
assert.equal(single.frame().failed, 1);
assert.equal(single.frame().model.batch.requests[0].code, 502);
single.configure('instance');
assert.equal(single.frame().success, 1);
assert.equal(pair.frame().order.join(), '1,2,1,2');
pair.configure('rate', 1);
assert.equal(pair.frame().order.join(), '1');
pair.advanceTo(2);
assert.equal(pair.frame().order.join(), '2', '轮询游标应跨秒保留');

fleet.configure('add');
assert.equal(fleet.frame().configured.join(), '1,2');
assert.equal(fleet.frame().entries[2].received, 0);
assert.ok(!fleet.frame().model.edges.some(edge => edge.to === 'product-3'));
fleet.configure('addAddress', 3);
assert.equal(fleet.frame().configured.join(), '1,2,3');
assert.equal(fleet.frame().entries.map(entry => entry.received).join(), '2,2,2');
verifyPaths(fleet.frame().model);
fleet.configure('rate', 4);
assert.equal(fleet.frame().configured.join(), '1,2,3', '流量变化不应修改固定名单');
fleet.configure('removeAddress', 2);
assert.equal(fleet.frame().configured.join(), '1,3');
assert.equal(fleet.frame().entries[1].online, true, '移除地址后服务器仍然在线');
assert.equal(fleet.frame().entries.map(entry => entry.received).join(), '2,0,2');
assert.ok(!fleet.frame().model.edges.some(edge => edge.to === 'product-2'));
assert.equal(fleet.frame().recovered, 0);
assert.equal(fleet.frame().failed, 0);
const drained = fleet.frame();
fleet.configure('removeAddress', 2);
assert.equal(fleet.frame(), drained, '重复提交相同名单不应推进模拟');
fleet.configure('instance');
assert.equal(fleet.frame().entries[1].online, false);
assert.equal(fleet.frame().configured.join(), '1,3');
assert.equal(fleet.frame().success, 4);
assert.equal(fleet.frame().recovered, 0, '按顺序缩容时，请求不需要重试');
verifyPaths(fleet.frame().model);

const staleList = deployments[2].createRun();
staleList.configure('add');
staleList.configure('instance');
assert.equal(staleList.frame().recovered, 1);
assert.equal(staleList.frame().success, 6);
assert.equal(staleList.frame().entries.map(entry => entry.received).join(), '6,0,0');
assert.equal(staleList.frame().model.batch.requests.find(r => r.tried.length === 2).path.join(),
  'client,gateway,product-2,gateway,product-1');
verifyPaths(staleList.frame().model);
staleList.advanceTo(3);
assert.equal(staleList.frame().recovered, 0, '连接失败后网关暂时跳过 02');
staleList.configure('addAddress', 3);
assert.equal(staleList.frame().configured.join(), '1,2,3', '写入 03 不应顺手移除已经下线的 02');
assert.equal(pair.frame().order.join(), '2', '每张地图维护自己的时钟和名单');
const cleanFleet = deployments[2].createRun().frame();
assert.equal(cleanFleet.configured.join(), '1,2');
assert.equal(cleanFleet.entries.map(entry => entry.received).join(), '3,3');
assert.equal(cleanFleet.second, 0);

const maps = host.Lab.registryFrames();
assert.equal(maps.length, 5);
assert.equal(scenes.registry.service.name, 'product');
for (const [index, [second, registered, cached, failed]] of [
  [0, '1,2', '1,2', 0], [1, '1,2', '1,2', 3], [2, '1', '1', 0], [8, '1,2', '1,2', 0], [9, '1,2', '1,2', 0],
].entries()) {
  const clip = maps[index];
  const frame = clip.createRun().frame();
  assert.equal(clip.keySecond, second);
  assert.equal(frame.second, second);
  assert.equal(frame.heartbeat, 1);
  assert.equal(frame.expire, 2);
  assert.equal(frame.registry.join(), registered);
  assert.equal(frame.entries.map(entry => entry.id).join(), registered);
  for (const entry of frame.entries) {
    assert.equal(entry.address, '10.0.0.' + (10 + entry.id) + ':8080');
    assert.equal(entry.name, '商品服务器 ' + String(entry.id).padStart(2, '0'));
  }
  assert.equal(frame.gateway.join(), cached);
  const requests = business(frame.model.batch);
  assert.equal(frame.failed, failed);
  assert.equal(requests.filter(r => r.code === 503).length, failed);
  assert.equal(frame.success, requests.length - failed);
  assert.equal(pushes(frame.model.batch).length, [2, 3].includes(index) ? 1 : 0);
  if (index === 3) {
    assert.ok(frame.model.batch.requests.some(r => r.operation === 'register' && r.path[0] === 'product-2'));
    assert.equal(requests.filter(r => r.to === 'product-2').length, 3);
  }
  assert.equal(frame.model.nodes.filter(n => n.role === 'product').map(n => n.label).join('/'),
    '商品服务器 01/商品服务器 02');
  verifyPaths(frame.model);
  const replay = clip.createRun(clip.start);
  if (index && !clip.allowLaunch) assert.equal(replay.frame().second, second - 1, '重播从变化之前开始');
  replay.advanceTo(clip.stillTime);
  assert.deepEqual(replay.frame(), frame, '重播与该图的入场快照应一致');
}

const firstMap = maps[0].createRun();
const secondMap = maps[1].createRun();
const thirdMap = maps[2].createRun();
const secondEntry = run => run.frame().entries.find(entry => entry.id === 2);
const enrollment = secondEntry(firstMap);
assert.equal(enrollment.lastReport.kind, 'register');
assert.equal(secondEntry(secondMap).missed, 1);
assert.equal(secondEntry(secondMap).lastReport.at, 0);
assert.equal(secondEntry(thirdMap), undefined, '已剔除的实例不再出现在注册表中');
const recovery = maps[3].createRun();
assert.equal(secondEntry(recovery).lastReport.kind, 'register');
assert.equal(secondEntry(recovery).lastReport.at, 8);
assert.equal(secondEntry(recovery).missed, 0);
recovery.advanceTo(9);
assert.equal(secondEntry(recovery).lastReport.kind, 'heartbeat');
assert.equal(secondEntry(recovery).lastReport.at, 9);
recovery.configure('instance');
recovery.advanceTo(10);
assert.equal(secondEntry(recovery).lastReport.at, 9, '漏收心跳不能覆盖上次实际收到的时间');
assert.equal(secondEntry(recovery).missed, 1);
recovery.advanceTo(11);
assert.equal(secondEntry(recovery), undefined);
function verifyConfiguredBatch(run) {
  const frame = run.frame();
  const requests = business(frame.model.batch);
  assert.equal(requests.length, 6, '改参数后依旧是同一秒的六笔请求');
  assert.equal(requests.filter(r => r.code === 503).length, frame.failed);
  assert.equal(requests.filter(r => r.code === 200).length, frame.success);
  assert.equal(frame.model.batch.requests.every((request, i) => request.index === i + 1), true);
  verifyPaths(frame.model);
}
secondMap.configure('retry', true);
assert.equal(secondMap.frame().second, 1);
assert.equal(secondMap.frame().recovered, 3);
assert.equal(secondMap.frame().failed, 0);
verifyConfiguredBatch(secondMap);
secondMap.configure('retry', false);
assert.equal(secondMap.frame().failed, 3);
const evictionClip = maps[2];
const outageReplay = evictionClip.createRun(evictionClip.outageSecond, thirdMap.frame());
assert.equal(outageReplay.frame().trace, '商品服务器 02 连接失败 → HTTP 503');
outageReplay.configure('retry', true);
const retriedQueries = outageReplay.frame();
assert.equal(retriedQueries.trace, '商品服务器 02 连接失败 → 重试 商品服务器 01 接单 → HTTP 200');
assert.equal(retriedQueries.success, 6);
assert.equal(retriedQueries.recovered, 3);
assert.equal(business(retriedQueries.model.batch).filter(r => r.path.join('/') === 'client/gateway/product-2/gateway/product-1').length, 3);
verifyConfiguredBatch(outageReplay);
outageReplay.advanceTo(2);
assert.equal(outageReplay.frame().trace, '商品服务器 01 接单 → HTTP 200');
assert.equal(outageReplay.frame().recovered, 0);
const extendedReplay = evictionClip.createRun(evictionClip.outageSecond, {heartbeat: 3, expire: 5, retry: true});
assert.equal(extendedReplay.frame().heartbeat, 3);
extendedReplay.advanceTo(4);
assert.equal(extendedReplay.frame().recovered, 3);
extendedReplay.advanceTo(5);
assert.equal(extendedReplay.frame().gateway.join(), '1');
assert.equal(extendedReplay.frame().recovered, 0);
const previousFlights = thirdMap.frame().model.previousBatch;
assert.equal(thirdMap.frame().gateway.join(), '1');
thirdMap.configure('instance');
assert.equal(thirdMap.frame().second, 2);
assert.equal(thirdMap.frame().model.previousBatch, previousFlights);
assert.equal(thirdMap.frame().serverOnline, true);
assert.equal(thirdMap.frame().registry.join(), '1,2');
assert.equal(thirdMap.frame().gateway.join(), '1,2');
verifyConfiguredBatch(thirdMap);
thirdMap.advanceTo(20);
assert.equal(thirdMap.frame().second, 20, '改过的地图可继续运行到原片段结束之后');
verifyConfiguredBatch(thirdMap);
firstMap.configure('expire', 5);
firstMap.configure('heartbeat', 2);
firstMap.configure('instance');
firstMap.advanceTo(2);
assert.equal(firstMap.frame().gateway.join(), '1,2');
firstMap.configure('heartbeat', 3);
firstMap.advanceTo(4);
assert.equal(firstMap.frame().gateway.join(), '1,2', '改周期后从现在起等下一次心跳');
assert.equal(secondEntry(firstMap).missed, 1);
assert.equal(enrollment.missed, 0, '重放不能修改之前显示的登记快照');
firstMap.advanceTo(5);
assert.equal(firstMap.frame().gateway.join(), '1');
const freshThird = maps[2].createRun().frame();
assert.equal(freshThird.gateway.join(), '1');
assert.equal(freshThird.failed, 0);
assert.equal(freshThird.heartbeat, 1);
assert.equal(freshThird.expire, 2);

const extended = maps[1].createRun();
extended.configure('expire', 5);
extended.configure('heartbeat', 3);
extended.advanceTo(4);
assert.equal(extended.frame().failed, 3);
assert.equal(secondEntry(extended).lastReport.at, 0);
extended.advanceTo(5);
assert.equal(extended.frame().failed, 0, '即使本秒没有应到的心跳，静默满 5 秒也要剔除');
assert.equal(extended.frame().gateway.join(), '1');
assert.equal(pushes(extended.frame().model.batch).length, 1);
verifyConfiguredBatch(extended);

const shortened = scenes.registry.init();
change(scenes.registry, shortened, 'expire', 8);
advance(scenes.registry, shortened, 4);
change(scenes.registry, shortened, 'instance');
advance(scenes.registry, shortened, 3);
assert.equal(shortened.instances[1].lastReport.at, 4);
assert.equal(shortened.cache.join(), '1,2');
change(scenes.registry, shortened, 'expire', 3);
assert.equal(shortened.time, 7);
assert.equal(shortened.cache.join(), '1', '暂停时缩短剔除时间，按最后上报的时间立即更新名单');
assert.equal(shortened.window.failed, 0);
assert.equal(pushes(shortened.batch).length, 1);
change(scenes.registry, shortened, 'expire', 10);
assert.equal(shortened.cache.join(), '1', '延长剔除时间不会把掉线地址加回来');
assert.equal(pushes(shortened.batch).length, 1, '不重复推送相同名单');

const late = maps[0].createRun();
late.configure('heartbeat', 4);
late.advanceTo(2);
assert.equal(late.frame().registry.length, 0);
assert.equal(late.frame().gateway.length, 0);
assert.equal(late.frame().failed, 6);
verifyConfiguredBatch(late);
late.advanceTo(4);
assert.equal(late.frame().registry.join(), '1,2', '仍在线的实例发来心跳后重回名单');
assert.equal(late.frame().success, 6);
verifyConfiguredBatch(late);
const onTime = maps[0].createRun();
onTime.configure('heartbeat', 2);
onTime.advanceTo(2);
assert.equal(onTime.frame().gateway.join(), '1,2');
assert.equal(pushes(onTime.frame().model.batch).length, 0, '截止时刻到达的心跳正常续约');

const joinClip = maps[4];
const join = joinClip.createRun();
const startingJoin = join.frame();
for (let id = 3; id <= 6; id++) {
  assert.equal(join.frame().nextServerId, id);
  const previous = join.frame().model.batch;
  join.configure('add');
  const frame = join.frame();
  assert.equal(frame.second, previous.second + 1);
  assert.equal(frame.model.previousBatch, previous);
  assert.equal(frame.selectedServer, id);
  assert.equal(frame.entries.length, id);
  assert.equal(frame.gateway.join(), frame.entries.map(e => e.id).join());
  assert.equal(frame.entries.at(-1).lastReport.kind, 'register');
  assert.equal(frame.entries.at(-1).lastReport.at, frame.second);
  assert.equal(frame.model.batch.requests.filter(r => r.operation === 'register' && r.path[0] === 'product-' + id).length, 1);
  assert.equal(pushes(frame.model.batch).length, 1);
  const requests = business(frame.model.batch);
  for (const entry of frame.entries) {
    assert.equal(entry.received, requests.filter(r => r.code === 200 && r.attempts.at(-1).id === entry.id).length);
    assert.ok(entry.received >= Math.floor(6 / id) && entry.received <= Math.ceil(6 / id));
  }
  if (id === 3) assert.equal(requests.map(r => r.to).join(), 'product-1,product-2,product-3,product-1,product-2,product-3',
    '第三台加入后，六笔请求应依次轮询三台服务器');
  verifyConfiguredBatch(join);
}
assert.equal(join.frame().nextServerId, null);
const full = join.frame();
join.configure('add');
assert.equal(join.frame(), full, '达到上限时再次启动不应推进时钟或生成请求');
join.advanceTo(full.second + 1);
assert.equal(heartbeatSources(join.frame().model.batch).split(',').length, 6);
join.configure('instance');
assert.equal(join.frame().serverOnline, false);
assert.equal(join.frame().entries.find(e => e.id === 6).received, 0);
join.configure('retry', true);
assert.equal(join.frame().failed, 0);
assert.equal(join.frame().entries.reduce((sum, e) => sum + e.received, 0), 6);
assert.deepEqual(joinClip.createRun().frame(), startingJoin, '重置第五张图恢复到两台服务器');
assert.equal(maps[3].createRun().frame().entries.length, 2, '新增实例只影响第五张图');

const gateway = scenes.gateway.init();
for (let limit = 0; limit <= workloads.gateway.max; limit++) {
  change(scenes.gateway, gateway, 'limit', limit);
  const frame = gateway.window;
  assert.equal(frame.offered, 50);
  assert.equal(frame.passed, Math.min(limit, frame.offered));
  assert.equal(frame.passed + frame.blocked, frame.offered);
  assert.equal(
    frame.hits.reduce((a, b) => a + b, 0),
    frame.passed
  );
  const { batch, previousBatch } = scenes.gateway.stage(gateway);
  assert.equal(previousBatch, null, '调整阈值后应清除上一批的动画');
  assert.equal(batch.requests.length, frame.offered);
  let passed = 0;
  for (const [offset, request] of batch.requests.entries()) {
    assert.equal(request.index, offset + 1);
    assert.equal(request.at, offset / frame.offered);
    assert.equal(request.code, request.to === 'reject' ? 429 : 200);
    if (request.code === 200) passed++;
    const expected = (offset + 1) * frame.passed / frame.offered;
    assert.ok(Math.abs(passed - expected) < 1, `${limit} QPS 时，放行名额应均匀分布在整秒内`);
  }
  assert.equal(batch.requests.filter((r) => r.to === 'reject').length, frame.blocked);
  gateway.instances.forEach((instance, i) => {
    assert.equal(batch.requests.filter((r) => r.to === 'product-' + instance.id).length, frame.hits[i]);
  });
  for (const [action, code] of [['tracePass', 200], ['trace429', 429]]) {
    change(scenes.gateway, gateway, action);
    const sample = batch.requests.find(request => request.code === code);
    assert.equal(gateway.flight?.index, sample?.index);
    assert.equal(gateway.flight?.destination, sample?.to);
  }
  change(scenes.gateway, gateway, 'replay');
  assert.deepEqual(gateway.batch.requests, batch.requests, '重放应保留每个请求的时刻、判定和去向');
  const replayed = gateway.batch;
  advance(scenes.gateway, gateway);
  assert.equal(scenes.gateway.stage(gateway).previousBatch, replayed, '跨秒的球应继续走完原来的路径');
  assert.deepEqual(gateway.batch.requests.map(r => r.code), replayed.requests.map(r => r.code),
    '均匀流量跨秒后继续按同样的节奏放行和拦截');
}
const scale = scenes.scale.init();
assert.equal(scale.window.incoming, 40);
change(scenes.scale, scale, 'profile', 'rush');
advance(scenes.scale, scale, 12);
const ready = scale.instances
  .filter((instance) => instance.status === 'ready')
  .map((instance) => instance.id);
assert.equal(ready.length, 4);
assert.equal(scale.window.incoming, 120);
const incoming = business(scale.batch);
assert.equal(incoming.length, scale.window.incoming);
for (const instance of scale.instances) {
  const balls = incoming.filter(request => request.to === 'product-' + instance.id).length;
  assert.equal(balls, instance.received);
  assert.equal(balls, 30);
}
change(scenes.scale, scale, 'gatewayLimit', 20);
advance(scenes.scale, scale);
assert.equal(business(scale.batch).filter(r => r.code === 429).length, 100);
verifyPaths(scenes.scale.stage(scale));
change(scenes.scale, scale, 'profile', 'quiet');
advance(scenes.scale, scale, 12);
assert.equal(scale.window.incoming, 20);
assert.equal(scale.window.ready, 2);
const fault = scenes.resilience.init();
scenes.resilience.syncInstances(fault, ready);
assert.equal(fault.spaces.prod.instances.length, ready.length);
change(scenes.resilience, fault, 'draft', true);
change(scenes.resilience, fault, 'publish');
advance(scenes.resilience, fault, 1);
assert.equal(fault.spaces.prod.instances.filter((instance) => instance.skip).length, 1);
advance(scenes.resilience, fault, ready.length);
assert.ok(fault.spaces.prod.instances.every((instance) => instance.skip));
assert.equal(fault.spaces.prod.frame.calls, 0);
const configured = scenes.resilience.stage(fault);
verifyPaths(configured);
assert.equal(configured.batch.requests.filter(r => r.kind === 'entry').length, 6);
assert.equal(configured.batch.requests.filter(r => r.kind === 'inventory').length, 6);
assert.equal(configured.batch.requests.filter(r => r.kind === 'review').length, 0);
assert.equal(configured.nodes.find(n => n.id === 'config').sub, 'prod · v2');
change(scenes.resilience, fault, 'namespace', 'test');
assert.equal(fault.spaces.test.version, 1);
change(scenes.resilience, fault, 'namespace', 'prod');
change(scenes.resilience, fault, 'mode', 'retry');
change(scenes.resilience, fault, 'layerRequest');
const retried = scenes.resilience.stage(fault);
verifyPaths(retried);
for (const target of ['gateway', 'product', 'review']) {
  assert.equal(retried.manualBatch.requests.filter(r => r.path.at(-1) === target).length, fault.retry.frame[target]);
}
const phone = scenes.phone.init();
await change(scenes.phone, phone, 'phone-all');
assert.equal(scenes.phone.counts(phone).passed, phone.rows.length);
assert.equal(phone.manualBatch.requests.length, phone.rows.length);
assert.ok(phone.manualBatch.requests.every(r => r.tones.at(-1) === 'pass'));
for (const row of phone.rows) {
  assert.deepEqual(JSON.parse(row.exchange.body), { phone: row.phone });
  assert.equal(row.exchange.status, 200);
  assert.deepEqual(JSON.parse(row.exchange.text), { valid: row.expected });
}
for (const raw of [' 13800000000', '13800000000 ', '13800000000\n', '１３８００００００００', '12800000000', '03800000000']) {
  const response = await postPhone(JSON.stringify({ phone: raw }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { valid: false });
}
for (const invalid of ['{', '{}', '{"phone":13800000000}']) assert.equal((await postPhone(invalid)).status, 400);
assert.equal((await verifyPhone(new Request(phoneUrl))).status, 405);
assert.equal((await verifyPhone(new Request(phoneUrl, { method: 'POST', body: 'text' }))).status, 415);
change(scenes.phone, phone, 'phone-expected-2', 'valid');
assert.equal(scenes.phone.verdict(phone.rows[1]), '不符');
change(scenes.phone, phone, 'phone-raw-2', '19900000000');
assert.equal(phone.rows[1].exchange, null);
await change(scenes.phone, phone, 'phone-run', 2);
assert.equal(phone.rows[1].actual, true);
assert.equal(scenes.phone.verdict(phone.rows[1]), '通过');
verifyPaths(scenes.phone.stage(phone));
const contract = scenes.contract;
for (const [version, affected, selfChecks] of [['original', 0, 3], ['rename', 1, 3], ['extra', 0, 3], ['type', 1, 3], ['status', 2, 2]]) {
  const state = contract.init();
  change(contract, state, 'contract-version', version);
  assert.equal(contract.responsePreview(state).replayed, false);
  change(contract, state, 'contract-run');
  assert.equal(state.own.count, selfChecks);
  const failed = Object.values(state.liveChecks).filter((check) => check.status === 'fail');
  assert.equal(failed.length, affected);
  assert.equal(contract.responsePreview(state).replayed, true);
  assert.equal(contract.responsePreview(state).actual, state.providerChecks.order.actual);
  verifyPaths(contract.stage(state));
  assert.equal(state.manualBatch.requests.length, 4);
  assert.equal(state.manualBatch.requests.filter(r => r.tones[0] === 'stop').length, failed.length);
}
// Each consumer can replay its own request. Switching the viewed contract must switch the receipt too.
const editedContract = contract.init();
change(contract, editedContract, 'contract-yaml', editedContract.drafts.order.replace('SKU-042', 'SKU-007'));
change(contract, editedContract, 'contract-run');
assert.equal(contract.responsePreview(editedContract).actual.body.stock, 0);
change(contract, editedContract, 'contract-doc', 'product');
assert.equal(contract.responsePreview(editedContract).actual.body.stock, 12);
// Both editors are on screen. Edits and restores target their own file even when the other response is selected.
const productYaml = editedContract.drafts.product;
const orderYaml = editedContract.drafts.order;
change(contract, editedContract, 'contract-doc', 'order');
change(contract, editedContract, 'contract-yaml', { id: 'product', yaml: 'invalid' });
assert.ok(editedContract.errors.product);
assert.equal(editedContract.tab, 'product');
assert.equal(editedContract.drafts.order, orderYaml);
change(contract, editedContract, 'contract-doc', 'order');
change(contract, editedContract, 'contract-restore', { id: 'product' });
assert.equal(editedContract.drafts.product, productYaml);
assert.equal(editedContract.errors.product, undefined);
assert.equal(editedContract.drafts.order, orderYaml);
change(contract, editedContract, 'contract-mode', 'provider');
change(contract, editedContract, 'contract-version', 'rename');
change(contract, editedContract, 'contract-run');
assert.equal(editedContract.providerChecks.shared.status, 'fail');
assert.equal(editedContract.consumerChecks.order.status, 'blocked');
assert.equal(editedContract.consumerChecks.product.status, 'blocked');
assert.equal(contract.responsePreview(editedContract).actual, editedContract.providerChecks.shared.actual);
const mesh = scenes.mesh.init();
assert.equal(mesh.rate, 50);
advance(scenes.mesh, mesh);
for (const architecture of ['sidecar', 'sdk']) {
  change(scenes.mesh, mesh, 'architecture', architecture);
  advance(scenes.mesh, mesh);
  verifyPaths(scenes.mesh.stage(mesh));
  const requests = business(mesh.batch);
  assert.equal(requests.length, 50);
  for (const [version, count] of [['v1', 45], ['v2', 5]]) {
    assert.equal(requests.filter(r => r.path.at(-1) === version).length, count);
    assert.equal(mesh.frame[version], count);
  }
  assert.ok(requests.every(r => r.path.includes('sidecar') === (architecture === 'sidecar')));
}
// A late downstream retry belongs to the preceding batch and is still airborne after the second changes.
const delayed = scenes.resilience.init();
for (const [key, value] of [['rate', 30], ['retries', 3], ['interval', 500], ['errorRate', 100]]) {
  change(scenes.resilience, delayed, key, value);
}
advance(scenes.resilience, delayed, 2);
const model = scenes.resilience.stage(delayed);
const previous = model.previousBatch, end = requestBalls.batchEnd(previous);
assert.ok(end > 1.8 && end < 2);
const geometry = straightGeometry(model);
const last = previous.requests.at(-1);
assert.ok(requestBalls.atTime(geometry, model, previous.second + end - 0.01).some(ball => ball.request === last));
assert.ok(!requestBalls.atTime(geometry, model, previous.second + end + 0.01).some(ball => ball.request === last));
// Exercise the same prepared snapshots, controls and map data as the guided React pages.
function chapterLessons(id, opening = scenes[id].init()) {
  const initial = JSON.stringify(opening);
  const records = lessonRecords(host.Lab, id, opening);
  for (const record of records) {
    const run = record.createRun();
    const still = run.frame();
    assert.equal(still.second, record.keySecond);
    assert.strictEqual(run.frame(), still, 'React reads a stable snapshot until a control or clock tick changes it');
    verifyPaths(still.model);
    run.advanceTo(record.keySecond + 4);
    verifyPaths(run.frame().model);
    assert.deepEqual(record.createRun().frame().state, still.state, record.id + ' restores its own opening');
  }
  assert.equal(JSON.stringify(opening), initial);
  return Object.fromEntries(records.map(record => [record.id, record.createRun()]));
}

const gateMaps = chapterLessons('gateway');
const probe = gateMaps.routes;
assert.equal(probe.frame().model.batch.requests[0].code, 200);
for (const [type, code, destination] of [['no-token',401,'reject'],['order',201,'order'],['method',404,'reject'],['path',404,'reject']]) {
  probe.configure('requestType', type);
  const [request] = probe.frame().model.batch.requests;
  assert.deepEqual([request.code, request.to], [code, destination]);
  verifyPaths(probe.frame().model);
}
probe.configure('headerRule', true);
probe.configure('requestType', 'no-header');
assert.equal(probe.frame().state.probeStatus, 404);
assert.equal(gateMaps.limit.frame().second, 0);
const limitMap = gateMaps.limit;
assert.equal(limitMap.frame().state.window.passed, 40);
limitMap.configure('limit', 20);
const limited = limitMap.frame(), arrivals = limited.model.batch.requests;
assert.equal(limited.second, 0);
assert.equal(limited.state.window.passed, 20);
assert.equal(limited.state.window.blocked, 30);
assert.deepEqual(Array.from(arrivals.slice(0, 4), p => p.code), [200,429,429,200]);
limitMap.configure('trace429');
assert.equal(limitMap.frame().model.focus.code, 429);
limitMap.configure('endTrace');
assert.deepEqual(limitMap.frame().model.batch.requests, arrivals);
assert.ok(!limitMap.frame().model.nodes.some(n => n.id === 'order'));
const balanced = gateMaps.balance;
assert.deepEqual(balanced.frame().state.window.hits, [25,25]);
const roundLatency = balanced.frame().state.window.latency;
balanced.configure('strategy', 'least');
assert.ok(balanced.frame().state.window.hits[1] < 25);
assert.ok(balanced.frame().state.window.latency < roundLatency);
const page = gateMaps.aggregate;
for (const [aggregate, count] of [[false,3],[true,1]]) {
  if (aggregate) page.configure('aggregate', true);
  const {model, state} = page.frame();
  const entries = model.batch.requests.filter(p => p.kind === 'browser');
  const reads = model.batch.requests.filter(p => p.kind === 'read');
  assert.equal(entries.length, count);
  assert.equal(state.page.calls.length, count);
  assert.equal(reads.length, 3);
  reads.forEach((read, i) => {
    const entry = entries[aggregate ? 0 : i];
    assert.equal(read.parent, entry.index);
    assert.ok(read.at >= entry.at + host.Lab.flow.timing.travel.neutral);
  });
  verifyPaths(model);
}

const capacityMaps = chapterLessons('scale');
assert.equal(capacityMaps.baseline.frame().state.window.incoming, 40);
const growing = capacityMaps['scale-out'], shrinking = capacityMaps['scale-in'];
assert.deepEqual(growing.frame().state.instances.map(i => i.status), ['ready','ready','starting','starting']);
for (const second of [1,2,3]) {
  growing.advanceTo(second);
  const peak = growing.frame().state;
  assert.deepEqual([peak.window.incoming, peak.window.ready, peak.desired], [120,2,4]);
  assert.deepEqual(peak.instances.map(i => i.received), [60,60,0,0]);
  assert.deepEqual(peak.instances.filter(i => i.status === 'ready').map(i => i.cpu), [100,100]);
}
growing.advanceTo(4);
assert.deepEqual(growing.frame().state.instances.map(i => i.received), [30,30,30,30]);
assert.deepEqual(growing.frame().state.instances.map(i => i.cpu), [60,60,60,60]);
assert.equal(shrinking.frame().second, 9);
assert.equal(shrinking.frame().state.window.wait, 4);
shrinking.advanceTo(13);
assert.deepEqual(shrinking.frame().state.instances.slice(2).map(i => [i.status,i.received]), [['draining',0],['draining',0]]);
shrinking.advanceTo(15);
assert.equal(shrinking.frame().state.instances.length, 2);

const faultMaps = chapterLessons('resilience');
const timeoutCard = faultMaps.timeout, cfg = faultMaps.config, cb = faultMaps.breaker, retryCard = faultMaps.retry;
const prod = run => run.frame().state.spaces.prod;
assert.deepEqual([prod(timeoutCard).last.reason, prod(timeoutCard).last.rt], ['full',140]);
timeoutCard.configure('delay', 900);
assert.deepEqual([prod(timeoutCard).last.status,prod(timeoutCard).last.reason,prod(timeoutCard).last.rt], [200,'timeout',540]);
timeoutCard.configure('fallback', false);
assert.equal(prod(timeoutCard).frame.ok, 0);
assert.equal(prod(timeoutCard).last.status, 504);
assert.equal(cfg.frame().model.nodes.find(n => n.id === 'config').sub, 'v1');
assert.equal(prod(cfg).frame.requests, 50);
assert.equal(prod(cfg).frame.inventory, 50);
assert.equal(prod(cfg).frame.calls, 50);
assert.equal(prod(cfg).last.rt, 540);
cfg.configure('draft', true);
assert.equal(prod(cfg).version, 1);
cfg.configure('publish');
assert.equal(prod(cfg).version, 2);
assert.deepEqual(prod(cfg).instances.map(i => i.version), [1,1]);
cfg.advanceTo(2);
assert.deepEqual(prod(cfg).instances.map(i => i.version), [2,1]);
assert.equal(prod(cfg).frame.calls, 25);
cfg.advanceTo(3);
assert.equal(prod(cfg).frame.requests, 50);
assert.equal(prod(cfg).frame.inventory, 50);
assert.equal(prod(cfg).frame.manual, 50);
assert.equal(prod(cfg).frame.calls, 0);
assert.equal(prod(cfg).last.rt, 40);
cfg.configure('add');
assert.equal(prod(cfg).instances.at(-1).version, 2);
verifyPaths(cfg.frame().model);
cb.configure('delay', 400);
cb.advanceTo(3);
assert.equal(prod(cb).instances[0].breaker.state, 'OPEN');
const probeTime = prod(cb).instances[0].breaker.until;
cb.configure('delay', 100);
cb.advanceTo(probeTime);
assert.equal(prod(cb).instances[0].breaker.state, 'HALF_OPEN');
cb.advanceTo(probeTime + 1);
assert.equal(prod(cb).instances[0].breaker.state, 'CLOSED');
const reviewResponses = () => [...retryCard.frame().model.batch.requests].filter(r => r.kind === 'review').map(r => r.code);
assert.deepEqual(reviewResponses(), [500]);
retryCard.configure('productRetries', 1);
assert.deepEqual(retryCard.frame().state.retry.frame, {entrance:1, gateway:1, product:1, review:2, successes:1});
assert.deepEqual(reviewResponses(), [500,200]);
retryCard.advanceTo(retryCard.frame().second + 1);
assert.deepEqual(reviewResponses(), [500,200]);
retryCard.configure('layerFailure', 100);
assert.deepEqual(reviewResponses(), [500,500]);
for (const key of ['clientRetries','gatewayRetries']) retryCard.configure(key, 1);
assert.deepEqual(retryCard.frame().state.retry.frame, {entrance:1, gateway:2, product:4, review:8, successes:0});
retryCard.configure('layerFailure', 0);
assert.deepEqual(retryCard.frame().state.retry.frame, {entrance:1, gateway:1, product:1, review:1, successes:1});
const inherited = scenes.resilience.init();
scenes.resilience.syncInstances(inherited, growing.frame().state.instances.filter(i => i.status === 'ready').map(i => i.id));
assert.equal(prod(chapterLessons('resilience', inherited).config).instances.length, 4);

const releases = chapterLessons('mesh');
const previewRelease = releases.preview;
assert.equal(previewRelease.frame().state.last.destination, 'v1');
previewRelease.configure('taggedShare', 100);
const internal = previewRelease.frame();
assert.equal(internal.state.frame.requests, 1);
assert.deepEqual([internal.state.last.matched, internal.state.last.destination], [true,'v2']);
const internalBalls = requestBalls.atTime(straightGeometry(internal.model), internal.model, internal.second + 0.91);
assert.ok(internalBalls.some(ball => ball.request.destination === 'v2' && ball.tint === 'canary'));
previewRelease.configure('taggedShare', 0);
assert.equal(previewRelease.frame().state.last.destination, 'v1');
const weightedRelease = releases.weights;
for (const [weight, v1, v2] of [[10,18,2],[25,15,5],[0,20,0],[100,0,20]]) {
  if (weight !== 10) weightedRelease.configure('weightV2', weight);
  const f = weightedRelease.frame();
  assert.deepEqual([f.state.frame.v1, f.state.frame.v2, f.state.frame.header], [v1, v2, 0]);
  assert.equal(business(f.model.batch).filter(packet => packet.path.at(-1) === 'v2').length, v2);
  verifyPaths(f.model);
}

const executorRelease = releases.executor;
for (const architecture of ['sidecar','sdk','sidecar']) {
  const switching = executorRelease.frame().state.architecture !== architecture;
  executorRelease.configure('architecture', architecture);
  const f = executorRelease.frame();
  assert.deepEqual([f.state.frame.v1, f.state.frame.v2], [15,5]);
  const executor = architecture === 'sidecar' ? 'sidecar' : 'gateway';
  assert.ok(business(f.model.batch).every(p => p.path.at(-2) === executor && !p.path.includes('control')));
  if (switching) {
    const delivery = f.model.batch.requests.find(p => p.kind === 'control');
    assert.deepEqual([...delivery.path], ['control',executor]);
    assert.equal(delivery.version, f.state.applied.version);
  }
  verifyPaths(f.model);
}
const rollbackRelease = releases.rollback;
let rules = rollbackRelease.frame().state;
assert.deepEqual([rules.taggedShare,rules.applied.byHeader,rules.applied.v2,rules.frame.v1,rules.frame.v2], [0,false,25,15,5]);
rollbackRelease.configure('weightV2', 0);
rules = rollbackRelease.frame().state;
assert.deepEqual([rules.desired.v2,rules.applied.v2,rules.frame.v2], [0,25,5]);
rollbackRelease.configure('hold', true);
rollbackRelease.advanceTo(3);
rules = rollbackRelease.frame().state;
assert.deepEqual([rules.desired.v2,rules.applied.v2,rules.frame.v2], [0,25,5]);
rollbackRelease.configure('hold', false);
rollbackRelease.advanceTo(4);
rules = rollbackRelease.frame().state;
assert.deepEqual([rules.applied.v2,rules.frame.v1,rules.frame.v2,rules.frame.tagged], [0,20,0,0]);
assert.ok(business(rollbackRelease.frame().model.batch).every(p => p.destination === 'v1' && !p.tagged));
assert.ok(rollbackRelease.frame().model.batch.requests.some(r => r.kind === 'control' && r.version === rules.applied.version));
assert.equal(weightedRelease.frame().state.applied.v2, 100, '回滚只改变当前地图');
console.log('七个章节通过验证，包括治理地图、手机号接口的 JSON 请求与响应、数据驱动断言和契约测试。');
