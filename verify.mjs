import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const host = vm.createContext({ console });
host.window = host;
for (const file of ['core', 'story', 'traffic', 'resilience', 'phone', 'contract']) {
  const source = await readFile(new URL('./src/' + file + '.js', import.meta.url), 'utf8');
  vm.runInContext(source, host, { filename: file + '.js' });
}
const { scenes, story } = host.Lab;
const context = { notify() {} };
const advance = (scene, state, seconds = 1) => {
  for (let i = 0; i < seconds; i++) {
    state.time++;
    scene.tick(state);
  }
};
const change = (scene, state, key, value) => scene.act(state, key, value, null, context);
for (const { id } of story) {
  const scene = scenes[id],
    first = scene.init();
  first.time = 0;
  const baseline = JSON.stringify(first);
  const restored = JSON.parse(baseline);
  advance(scene, first, 12);
  advance(scene, restored, 12);
  assert.equal(JSON.stringify(first), JSON.stringify(restored), id + ' 重放应一致');
  assert.equal(scene.stats(first).length, 3);
  if (scene.stage) {
    const { nodes, edges } = scene.stage(first);
    const ids = new Set(nodes.map((node) => node.id));
    assert.equal(ids.size, nodes.length, id + ' 节点标识应唯一');
    assert.ok(
      edges.every((edge) => ids.has(edge.from) && ids.has(edge.to)),
      id + ' 连线需有起点和终点'
    );
  }
}
const registry = scenes.registry.init();
change(scenes.registry, registry, 'instance');
advance(scenes.registry, registry, 5);
assert.equal(registry.instances.filter((node) => node.registered).length, 1);
assert.equal(registry.cache.length, 2);
advance(scenes.registry, registry, 3);
assert.equal(registry.cache.length, 1);

const gateway = scenes.gateway.init();
for (const limit of [80, 40, 0, 120]) {
  change(scenes.gateway, gateway, 'limit', limit);
  const frame = gateway.window;
  assert.equal(frame.offered, 100);
  assert.equal(frame.passed, Math.min(limit, 100));
  assert.equal(frame.passed + frame.blocked, frame.offered);
  assert.equal(
    frame.hits.reduce((a, b) => a + b, 0),
    frame.passed
  );
}
const scale = scenes.scale.init();
change(scenes.scale, scale, 'profile', 'rush');
advance(scenes.scale, scale, 12);
const ready = scale.instances
  .filter((instance) => instance.status === 'ready')
  .map((instance) => instance.id);
assert.ok(ready.length > 2);
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
const phone = scenes.phone.init();
change(scenes.phone, phone, 'phone-add-preset');
change(scenes.phone, phone, 'phone-all');
assert.equal(scenes.phone.stats(phone)[2][1], 2);
for (const version of ['rename', 'extra']) {
  const state = scenes.contract.init();
  change(scenes.contract, state, 'contract-version', version);
  change(scenes.contract, state, 'contract-run');
  assert.equal(state.own.count, 3);
  const failed = Object.values(state.liveChecks).filter((check) => check.status === 'fail');
  assert.equal(failed.length, version === 'rename' ? 1 : 0);
}
console.log('七幕快照可重复，服务发现、限流守恒、扩容交接、降级配置、手机号和契约用例均通过。');
