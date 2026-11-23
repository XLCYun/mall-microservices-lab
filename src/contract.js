(() => {
  'use strict';

  const Lab = window.Lab;
  const people = ['order', 'product'];
  const roles = {
    order: { name: '订单服务', field: 'stock', type: '整数' },
    product: { name: '商品服务', field: 'available', type: '布尔值' }
  };
  const versions = {
    original: '原始实现', rename: '字段改名', extra: '新增字段', type: '类型变化', status: '状态码变化'
  };
  const cases = { 'SKU-042': 12, 'SKU-007': 0 };
  const pactFilename = 'order-inventory.json';
  const consumerBuilds = { order: 'order-17', product: 'product-8' };
  const inventoryBuilds = { original: 'inventory-41', rename: 'inventory-42', extra: 'inventory-43', type: 'inventory-44', status: 'inventory-45' };
  const jsonHeaders = { 'Content-Type': 'application/json' };
  const mockPath = ['consumer', 'stub'];
  const providerPath = ['verifier', 'inventory'];
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const response = (status, body) => ({ status, headers: { ...jsonHeaders }, body });

  // The consumer declares an interaction before it exercises its own client.
  function interactionFor(person, sku) {
    const { name, field } = roles[person];
    const order = person === 'order';
    const units = cases[sku];
    return {
      description: name + '查询' + (order ? '库存数量' : '是否有货'),
      given: sku + ' 有 ' + units + ' 件库存',
      request: { method: 'POST', path: '/inventory/check', headers: { ...jsonHeaders }, body: { sku } },
      response: {
        status: 200,
        body: { [field]: { example: order ? units : units > 0, match: order ? 'integer' : 'type' } }
      }
    };
  }

  // This is the inventory implementation that the verifier calls. The mock never uses it.
  function inventory(request, version) {
    if (request.path !== '/inventory/check') return response(404, { error: 'unknown_route' });
    if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });
    if (request.headers['Content-Type'] !== 'application/json') return response(415, { error: 'unsupported_media_type' });
    const sku = request.body.sku;
    if (!has(cases, sku)) return response(404, { error: 'unknown_sku' });
    const stock = cases[sku];
    const field = version === 'rename' ? 'quantity' : 'stock';
    const body = { sku, [field]: version === 'type' ? String(stock) : stock, available: stock > 0 };
    if (version === 'extra') body.warehouse = 'SH-01';
    return response(version === 'status' ? 202 : 200, body);
  }

  function inventoryClient(person, sku, send) {
    const actual = send({ method: 'POST', path: '/inventory/check', headers: { ...jsonHeaders }, body: { sku } });
    if (actual.status !== 200) throw new Error('库存查询返回 HTTP ' + actual.status + '。');
    const value = actual.body[roles[person].field];
    if (person === 'order' && !(Number.isInteger(value) && value >= 0)) throw new Error('订单服务需要非负整数 stock。');
    if (person === 'product' && typeof value !== 'boolean') throw new Error('商品服务需要布尔值 available。');
    return value;
  }

  function testConsumer(person, sku) {
    const interaction = interactionFor(person, sku);
    const expected = interaction.request;
    const field = roles[person].field;
    const example = interaction.response.body[field].example;
    const receipt = { interaction, request: null, actual: null, passed: false };
    function mockInventory(request) {
      receipt.request = request;
      if (request.method !== expected.method || request.path !== expected.path ||
          request.headers['Content-Type'] !== expected.headers['Content-Type'] ||
          JSON.stringify(request.body) !== JSON.stringify(expected.body)) {
        throw new Error('调用代码发出的请求与测试约定不符。');
      }
      receipt.actual = response(interaction.response.status, { [field]: example });
      return receipt.actual;
    }
    try {
      receipt.value = inventoryClient(person, sku, mockInventory);
      if (receipt.value !== example) throw new Error('调用代码读取的值与示例响应不符。');
      receipt.passed = true;
    } catch (error) {
      receipt.issue = error.message;
    }
    return receipt;
  }

  // Keep small objects on one line so the complete JSON is readable on a classroom projector.
  function formatJson(value, depth = 0) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    const array = Array.isArray(value);
    const [open, close] = array ? ['[', ']'] : ['{', '}'];
    const parts = Object.entries(value).map(([key, child]) =>
      (array ? '' : JSON.stringify(key) + ': ') + formatJson(child, depth + 1));
    const inline = open + parts.join(', ') + close;
    if (!inline.includes('\n') && depth * 2 + inline.length <= 62) return inline;
    const indent = '  '.repeat(depth);
    return open + '\n' + indent + '  ' + parts.join(',\n' + indent + '  ') + '\n' + indent + close;
  }

  function generatePact(person, receipt) {
    if (!receipt.passed) return null;
    const { description, given, request, response: expected } = receipt.interaction;
    const bodyRules = Object.fromEntries(Object.entries(expected.body).map(([field, rule]) =>
      ['$.' + field, { matchers: [{ match: rule.match }] }]));
    return formatJson({
      consumer: { name: roles[person].name }, provider: { name: '库存服务' },
      interactions: [{
        description, providerStates: [{ name: given }], request,
        response: { ...receipt.actual, matchingRules: { body: bodyRules } }
      }],
      metadata: { pactSpecification: { version: '3.0.0' } }
    });
  }

  // The independent product consumer's passing test supplies the reference pact for the final comparison.
  const productPacts = Object.fromEntries(Object.keys(cases).map(sku => [sku, generatePact('product', testConsumer('product', sku))]));

  function verifyPact(file, version) {
    const [interaction] = JSON.parse(file).interactions;
    const { request, response: expected } = interaction;
    const actual = inventory(request, version);
    const issues = [];
    if (actual.status !== expected.status) issues.push('期望 HTTP ' + expected.status + '，实际为 HTTP ' + actual.status + '。');
    for (const [name, value] of Object.entries(expected.headers)) {
      if (actual.headers[name] !== value) issues.push('响应头 ' + name + ' 与契约不符。');
    }
    for (const [field, example] of Object.entries(expected.body)) {
      const value = actual.body[field];
      const rule = expected.matchingRules?.body?.['$.' + field]?.matchers[0]?.match;
      if (!has(actual.body, field)) issues.push('缺少 ' + field + '。');
      else if (rule === 'integer' && !Number.isInteger(value)) issues.push(field + ' 应为整数，实际为 ' + JSON.stringify(value) + '。');
      else if (rule === 'type' && typeof value !== typeof example) issues.push(field + ' 与契约示例的类型不同。');
      else if (!rule && value !== example) issues.push(field + ' 的值与约定不符。');
    }
    return { version, request, actual, issues, passed: !issues.length };
  }

  // The teaching cards show worked examples without advancing the live experiment.
  function exampleFor(sku) {
    const order = testConsumer('order', sku);
    const file = generatePact('order', order);
    return {
      order, pact: JSON.parse(file),
      original: verifyPact(file, 'original'), renamed: verifyPact(file, 'rename')
    };
  }

  function init(sku = 'SKU-042') {
    return {
      time: 0, sku, orderTest: null, pact: null, fetched: null, baseline: null, comparison: null, route: null,
      broker: {
        publications: { product: { consumerVersion: consumerBuilds.product, file: productPacts[sku] } },
        results: {}
      }
    };
  }

  function phase(s) {
    if (!s.orderTest?.passed) return 1;
    if (!s.pact) return 2;
    if (!s.broker.publications.order) return 3;
    if (!s.fetched) return 4;
    if (!s.baseline) return 5;
    if (!s.broker.results.original) return 6;
    if (!s.comparison) return 7;
    return 8;
  }

  function recordCall(batch, path, check, person, operation) {
    Lab.flow.add(batch, batch.requests.length * 0.2, path, [check.passed ? 'pass' : 'stop'], {
      operation, consumer: person, method: check.request.method, url: check.request.path,
      httpStatus: check.actual?.status, assertion: check.passed ? 'pass' : 'fail'
    });
  }

  function runOrderTest(s, batch) {
    const receipt = testConsumer('order', s.sku);
    s.orderTest = receipt;
    s.route = 'mock';
    recordCall(batch, mockPath, receipt, 'order', 'stub');
  }

  function transfer(batch, from, to, operation) {
    Lab.flow.add(batch, batch.requests.length * 0.2, [from, to], ['control'], { operation });
  }

  function publish(s, batch) {
    s.broker.publications.order = { consumerVersion: consumerBuilds.order, file: s.pact };
    s.route = 'publish';
    transfer(batch, 'consumer', 'broker', 'publish-pact');
  }

  function fetchContracts(s, consumers, batch) {
    // A provider build uses the snapshot it pulled, independently of the local consumer file.
    s.fetched = Object.fromEntries(consumers.map(person => [person, { ...s.broker.publications[person] }]));
    s.route = 'fetch';
    transfer(batch, 'broker', 'verifier', 'fetch-pacts');
  }

  function reportResults(s, version, checks, batch) {
    s.broker.results[version] = Object.entries(checks).map(([person, check]) => ({
      person, consumerVersion: s.fetched[person].consumerVersion, providerVersion: inventoryBuilds[version],
      passed: check.passed, issues: check.issues.slice()
    }));
    s.route = 'report';
    transfer(batch, 'verifier', 'broker', 'publish-results');
  }

  function verifyOriginal(s, batch) {
    s.baseline = verifyPact(s.fetched.order.file, 'original');
    s.route = 'provider';
    recordCall(batch, providerPath, s.baseline, 'order', 'replay');
  }

  function compareVersion(s, version, batch) {
    fetchContracts(s, people, batch);
    const order = verifyPact(s.fetched.order.file, version);
    const product = verifyPact(s.fetched.product.file, version);
    s.comparison = { version, order, product };
    for (const person of people) recordCall(batch, providerPath, s.comparison[person], person, 'replay');
    reportResults(s, version, { order, product }, batch);
    s.route = 'compare';
  }

  function tick(s) {
    const batch = Lab.flow.begin(s, s.time);
    switch (phase(s)) {
      case 1: runOrderTest(s, batch); break;
      case 2: s.pact = generatePact('order', s.orderTest); s.route = 'generate'; break;
      case 3: publish(s, batch); break;
      case 4: fetchContracts(s, ['order'], batch); break;
      case 5: verifyOriginal(s, batch); break;
      case 6: reportResults(s, 'original', { order: s.baseline }, batch); break;
      case 7: compareVersion(s, 'rename', batch); break;
    }
  }

  function manualBatch(s) {
    // Manual replays replace the timed request still on the map.
    s.batch = s.previousBatch = null;
    return Lab.flow.manual(s);
  }

  function act(s, key, value, target, ctx) {
    switch (key) {
      case 'contract-sku':
        if (phase(s) === 1 && has(cases, value)) {
          s.sku = value;
          s.broker.publications.product.file = productPacts[value];
        }
        break;
      case 'contract-order-test':
        if (phase(s) === 1) runOrderTest(s, manualBatch(s));
        break;
      case 'contract-verify-original':
        if (phase(s) === 5) verifyOriginal(s, manualBatch(s));
        break;
      case 'contract-compare':
        if (s.broker.results.original && has(versions, value) && value !== 'original' && (s.comparison || value === 'rename')) {
          compareVersion(s, value, manualBatch(s));
        }
        break;
      case 'contract-download':
        if (s.pact) ctx?.download?.(pactFilename, s.pact, 'application/json');
        break;
    }
  }

  function stage(s) {
    const active = (...routes) => routes.includes(s.route);
    const latest = s.comparison?.order || s.baseline;
    const reports = Object.values(s.broker.results).flat().length;
    return {
      nodes: [
        { id: 'stub', role: 'product', label: '模拟库存服务', sub: s.orderTest?.actual ? '示例 stock = ' + s.orderTest.value : '等待订单请求' },
        { id: 'consumer', role: 'client', label: '订单 CI', sub: s.broker.publications.order ? '订单契约已发布' : s.pact ? '订单契约已生成' : '运行订单客户端' },
        { id: 'broker', role: 'registry', label: 'Pact Broker', sub: reports ? '已收 ' + reports + ' 份验证结果' : s.broker.publications.order ? '已收到订单契约' : '等待订单契约' },
        { id: 'verifier', role: 'control', label: '库存 CI 验证器', sub: s.fetched ? '已取回契约' : '等待取回契约' },
        { id: 'inventory', role: 'inventory', label: '库存服务', sub: latest ? versions[latest.version] + ' · HTTP ' + latest.actual.status : '等待验证' }
      ],
      edges: [
        { from: 'consumer', to: 'stub', kind: 'flow', weight: +active('mock') },
        { from: 'consumer', to: 'broker', kind: 'control', weight: +active('publish') },
        { from: 'broker', to: 'verifier', kind: 'control', weight: +active('fetch', 'compare') },
        { from: 'verifier', to: 'inventory', kind: 'flow', weight: +active('provider', 'compare') },
        { from: 'verifier', to: 'broker', kind: 'control', weight: +active('report', 'compare') }
      ],
      ...Lab.flow.batches(s, 'contract-' + (s.comparison?.version || s.route || 'ready')),
      legend: { pass: '验证通过', stop: '验证失败', control: '契约与验证结果', unit: '1 球 = 1 次调用或交接' }
    };
  }

  function stats(s) {
    return [
      ['订单测试', s.orderTest ? (s.orderTest.passed ? '通过' : '失败') : '待运行', ''],
      ['生成订单契约', s.pact ? 1 : 0, '份'],
      ['变更后通过', s.comparison ? people.filter(id => s.comparison[id].passed).length : '—', '份']
    ];
  }

  Lab.scenes.contract = { init, tick, act, stage, stats, phase, finished: s => Boolean(s.comparison),
    interactionFor, exampleFor, pactFilename, consumerBuilds, inventoryBuilds, cases, roles, people, versions };
})();
