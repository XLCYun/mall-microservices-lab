export const deploymentRates = [1, 2, 4, 6];

const definitions = [
  {id: 'single', title: 'NGINX 转发到唯一实例', rate: 1, stillTime: 0.23},
  {id: 'nginx', title: 'NGINX 按固定 IP 轮询', rate: 4, stillTime: 0.23},
  {id: 'elastic', title: '固定名单遇到扩缩容', rate: 6, stillTime: 0.24}
];

const number = id => String(id).padStart(2, '0');
const productId = id => 'product-' + id;

function createRun({flow, scenes}, definition, start) {
  const single = definition.id === 'single';
  const elastic = definition.id === 'elastic';
  const service = scenes.registry.service;
  const machines = new Map(single ? [[1, true]] : [[1, true], [2, true]]);
  const unavailableUntil = new Map();
  const traffic = {};
  let configured = [...machines.keys()];
  let rate = definition.rate;
  let cursor = 0;
  let second = -1;
  let snapshot;

  function send(at) {
    const path = ['client', 'gateway'];
    const tones = ['neutral'];
    const tried = [];
    const firstSlot = cursor;
    let delivered = null;
    for (let offset = 0; offset < configured.length; offset++) {
      const slot = (firstSlot + offset) % configured.length;
      const id = configured[slot];
      if (unavailableUntil.get(id) > second + at) continue;
      if (tried.length) {
        path.push('gateway');
        tones.push('stop');
      }
      tried.push(id);
      cursor = (slot + 1) % configured.length;
      path.push(productId(id));
      if (machines.get(id)) {
        tones.push('pass');
        delivered = id;
        break;
      }
      tones.push('stop');
      // Default NGINX upstreams temporarily skip a peer after a connection error.
      if (configured.length > 1) unavailableUntil.set(id, second + at + 10);
    }
    return flow.add(traffic.batch, at, path, tones, {tried, delivered, code: delivered ? 200 : 502});
  }

  function advanceTo(clock) {
    while (second < Math.floor(clock)) {
      second++;
      flow.begin(traffic, second);
      for (let i = 0; i < rate; i++) send(i / rate);
      snapshot = null;
    }
  }

  function configure(key, value) {
    if (key === 'rate' && deploymentRates.includes(value) && rate !== value) rate = value;
    else if (key === 'instance' && (single || elastic)) {
      const id = single ? 1 : 2;
      machines.set(id, !machines.get(id));
    } else if (key === 'add' && elastic && !machines.has(3)) machines.set(3, true);
    else if (elastic && machines.has(value) && (key === 'addAddress' || key === 'removeAddress')) {
      const adding = key === 'addAddress';
      if (configured.includes(value) === adding || (!adding && configured.length === 1)) return second;
      // A manual edit and reload changes this one address, independently of power and traffic.
      configured = adding ? [...configured, value].sort((a, b) => a - b) : configured.filter(id => id !== value);
      unavailableUntil.clear();
      cursor = 0;
    } else return second;
    advanceTo(second + 1);
    return second;
  }

  function frame() {
    if (snapshot) return snapshot;
    const requests = traffic.batch.requests;
    const nodes = [
      {id: 'client', role: 'client', label: '商城客户端', sub: rate + ' 请求/秒', status: 'up'},
      {id: 'gateway', role: 'gateway', label: 'NGINX 网关', sub: configured.length + ' 个固定地址', status: 'up'}
    ];
    const edges = [{from: 'client', to: 'gateway', kind: 'flow', weight: 1}];
    const entries = [...machines].map(([id, online]) => {
      const listed = configured.includes(id);
      const received = requests.filter(request => request.delivered === id).length;
      const attempts = requests.filter(request => request.tried.includes(id)).length;
      const name = '商品服务器 ' + number(id);
      const sub = !online ? '已下线' : listed ? received + ' 请求/秒' : '在线 · 未列入配置';
      nodes.push({id: productId(id), role: 'product', label: name, sub, status: online ? 'up' : 'down'});
      if (listed) edges.push({from: 'gateway', to: productId(id),
        kind: attempts ? (online ? 'flow' : 'blocked') : 'idle', weight: attempts / rate});
      return {id, name, address: service.endpoint(id), online, listed, received};
    });
    const order = requests.map(request => request.delivered);
    const failed = order.filter(id => id === null).length;
    snapshot = {
      second, rate, entries, configured: configured.slice(), order,
      success: rate - failed, failed, recovered: requests.filter(request => request.delivered && request.tried.length > 1).length,
      model: {nodes, edges, ...flow.batches(traffic)}
    };
    return snapshot;
  }

  advanceTo(start);
  return {frame, configure, advanceTo};
}

export function deploymentFrames(lab) {
  return definitions.map(definition => ({
    ...definition, deployment: true, keySecond: 0, start: 0, end: Infinity,
    createRun: (clock = definition.stillTime) => createRun(lab, definition, clock)
  }));
}
