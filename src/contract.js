(() => {
  'use strict';

  const Lab = window.Lab;
  const people = ['order', 'product'];
  const stubPath = ['consumer', 'stub'];
  const replayPath = ['verifier', 'inventory'];
  const roles = {
    order: { name: '订单服务', field: 'stock', type: 'number', expects: '读取可下单的库存数量' },
    product: { name: '商品服务', field: 'available', type: 'boolean', expects: '显示商品是否有货' }
  };
  const versions = [
    ['original', '原始实现'],
    ['rename', '字段改名 · stock → quantity'],
    ['extra', '新增字段 · warehouse'],
    ['type', '类型变化 · stock 变为字符串'],
    ['status', '状态码变化 · 200 → 202']
  ];
  const versionNames = Object.fromEntries(versions);
  const modes = [['consumer', '消费者驱动'], ['provider', '提供者驱动']];
  const modeNames = Object.fromEntries(modes);
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const emptyMap = () => Object.create(null);
  const kind = value => value === null ? 'null' : typeof value;
  const show = value => value === undefined ? '缺失' : JSON.stringify(value);

  function makeYaml(id) {
    const fields = id === 'shared' ? people : [id];
    return [
      'request:',
      '  method: POST',
      '  url: /inventory/check',
      '  headers:',
      '    Content-Type: application/json',
      '  body:',
      '    sku: SKU-042',
      '  matchers:',
      '    body:',
      '      - path: $.sku',
      '        type: by_regex',
      "        value: 'SKU-[0-9]{3}'",
      'response:',
      '  status: 200',
      '  headers:',
      '    Content-Type: application/json',
      '  body:',
      ...fields.map(person => person === 'order' ? '    stock: 12' : '    available: true'),
      '  matchers:',
      '    body:',
      ...fields.flatMap(person => ['      - path: $.' + roles[person].field, '        type: by_type'])
    ].join('\n');
  }

  function fail(line, message) {
    throw new Error((line ? '第 ' + line + ' 行，' : '') + message);
  }

  function stripComment(line) {
    let quote = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote === '"' && c === '\\') { i++; continue; }
      if (quote && c === quote) {
        if (quote === "'" && line[i + 1] === "'") { i++; continue; }
        quote = '';
      } else if (!quote && (c === "'" || c === '"')) {
        quote = c;
      } else if (!quote && c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
        return line.slice(0, i).trimEnd();
      }
    }
    return line.trimEnd();
  }

  function scalar(raw, line) {
    if (!raw) fail(line, '请填写一个值。空字符串可以写成两个引号。');
    if (raw.length > 256) fail(line, '单个值最多 256 个字符。');
    if (raw[0] === '"') {
      try { return JSON.parse(raw); } catch { fail(line, '双引号字符串有误。正则中的反斜线可以放在单引号内。'); }
    }
    if (raw[0] === "'") {
      if (!/^'(?:[^']|'')*'$/.test(raw)) fail(line, '请检查单引号字符串。');
      return raw.slice(1, -1).replace(/''/g, "'");
    }
    if (raw === 'true' || raw === 'false') return raw === 'true';
    if (raw === 'null') return null;
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) {
      const number = Number(raw);
      if (!Number.isFinite(number)) fail(line, '数字超出可表示范围。');
      return number;
    }
    if (/^[{[&*!|>@%]/.test(raw) || /:(?:\s|$)/.test(raw) || /\s\/\//.test(raw) || /^[-?:](?:\s|$)/.test(raw)) {
      fail(line, '此处支持单行标量。特殊字符请加引号，注释请用 #。');
    }
    return raw;
  }

  function pair(text, line) {
    const match = /^("[^"\\]+"|'[^']+'|[A-Za-z_][A-Za-z0-9_.-]*)\s*:(?:[ ]+(.*))?$/.exec(text);
    if (!match) fail(line, '请使用“键: 值”，冒号后留一个空格。');
    const key = match[1].replace(/^['"]|['"]$/g, '');
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) {
      fail(line, '字段名可使用字母、数字、下划线、连字符和点，并以字母或下划线开头。');
    }
    return [key, match[2] || ''];
  }

  function add(map, key, value, line) {
    if (has(map, key)) fail(line, '键 ' + key + ' 重复了。');
    map[key] = value;
  }

  // The matcher uses bounded dynamic programming. Student input never becomes a JavaScript RegExp.
  function regexMatcher(pattern, line) {
    const error = message => fail(line, 'by_regex 匹配规则有误。' + message);
    if (typeof pattern !== 'string' || !pattern.length || pattern.length > 96) error('请写 1–96 个字符的正则字符串。');
    let i = pattern[0] === '^' ? 1 : 0;
    let end = pattern.length;
    if (pattern.endsWith('$')) {
      let backslashes = 0;
      for (let pos = end - 2; pos >= 0 && pattern[pos] === '\\'; pos--) backslashes++;
      if (backslashes % 2 === 0) end--;
    }
    const atoms = [];
    while (i < end) {
      const c = pattern[i++];
      let accepts;
      if (c === '[') {
        const close = pattern.indexOf(']', i);
        if (close < i || close >= end) error('字符组缺少 ]。');
        const chars = pattern.slice(i, close);
        if (!/^[A-Za-z0-9 _.-]+$/.test(chars)) error('字符组支持字母、数字、空格、点、下划线和连字符。');
        const ranges = [];
        for (let j = 0; j < chars.length;) {
          const from = chars.charCodeAt(j++);
          let to = from;
          if (chars[j] === '-' && j + 1 < chars.length) {
            to = chars.charCodeAt(j + 1);
            j += 2;
            if (to < from) error('字符组的范围应从小到大。');
          }
          ranges.push([from, to]);
        }
        accepts = char => ranges.some(range => char.charCodeAt(0) >= range[0] && char.charCodeAt(0) <= range[1]);
        i = close + 1;
      } else if (c === '\\') {
        if (i >= end) error('反斜线后缺少字符。');
        const literal = pattern[i++];
        if (literal === 'd') accepts = char => /[0-9]/.test(char);
        else if (literal === 'w') accepts = char => /[A-Za-z0-9_]/.test(char);
        else if (literal === 's') accepts = char => /\s/.test(char);
        else if ('\\.[]{}^$?*+-()|'.includes(literal)) accepts = char => char === literal;
        else error('支持 \\d、\\w、\\s 和转义标点。');
      } else if (c === '.') {
        accepts = char => char !== '\n' && char !== '\r';
      } else {
        if ('()|{}[]?*+^$'.includes(c)) error('此练习支持字符组和重复次数，暂不支持分组、分支或此位置的符号。');
        accepts = char => char === c;
      }
      let min = 1;
      let max = 1;
      const repeat = pattern[i];
      if (i < end && ['?', '+', '*'].includes(repeat)) {
        min = repeat === '+' ? 1 : 0;
        max = repeat === '?' ? 1 : 128;
        i++;
      } else if (i < end && repeat === '{') {
        const amount = /^\{(\d{1,3})(?:,(\d{0,3}))?\}/.exec(pattern.slice(i, end));
        if (!amount) error('重复次数可写成 {3} 或 {1,4}。');
        min = Number(amount[1]);
        max = amount[2] === undefined ? min : amount[2] === '' ? 128 : Number(amount[2]);
        if (min > max || max > 128) error('重复次数须在 0–128 之间，且下界不大于上界。');
        i += amount[0].length;
      }
      atoms.push({ accepts, min, max });
      if (atoms.length > 64) error('最多支持 64 个字符单元。');
    }
    if (!atoms.length) error('缺少匹配内容。');
    return value => {
      if (typeof value !== 'string' || value.length > 128) return false;
      let previous = new Uint8Array(value.length + 1);
      previous[0] = 1;
      for (const atom of atoms) {
        const prefix = new Uint16Array(value.length + 2);
        for (let pos = 0; pos <= value.length; pos++) prefix[pos + 1] = prefix[pos] + previous[pos];
        const next = new Uint8Array(value.length + 1);
        let run = 0;
        for (let pos = 0; pos <= value.length; pos++) {
          run = pos && atom.accepts(value[pos - 1]) ? run + 1 : 0;
          const low = Math.max(0, pos - run, pos - atom.max);
          const high = pos - atom.min;
          if (high >= low && prefix[high + 1] > prefix[low]) next[pos] = 1;
        }
        previous = next;
      }
      return previous[value.length] === 1;
    };
  }

  function compile(source) {
    if (source.length > 8192) fail(0, '每份契约最多 8,192 个字符。');
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    if (lines.length > 160) fail(0, '每份契约最多 160 行。');
    const doc = emptyMap();
    let side = '';
    let section = '';
    let list = null;
    let item = null;
    for (let index = 0; index < lines.length; index++) {
      const line = index + 1;
      const raw = stripComment(lines[index]);
      if (!raw.trim()) continue;
      const prefix = raw.match(/^\s*/)[0];
      if (/[^ ]/.test(prefix)) fail(line, '缩进请用半角空格，每层两个。');
      const depth = prefix.length;
      const text = raw.slice(depth);
      if (depth === 0) {
        const [key, value] = pair(text, line);
        if (!['request', 'response'].includes(key) || value) fail(line, '顶层支持 request: 和 response: 两个区块。');
        add(doc, key, emptyMap(), line);
        side = key;
        section = '';
        list = item = null;
      } else if (depth === 2 && side) {
        const [key, value] = pair(text, line);
        const scalars = side === 'request' ? ['url', 'method'] : ['status'];
        if (scalars.includes(key)) {
          add(doc[side], key, scalar(value, line), line);
          section = '';
        } else if (['headers', 'body', 'matchers'].includes(key)) {
          if (value && value !== '{}') fail(line, key + ' 请分行缩进，空对象可写作 {}。');
          add(doc[side], key, emptyMap(), line);
          section = value ? '' : key;
        } else {
          fail(line, side + ' 不支持 ' + key + '。');
        }
        list = item = null;
      } else if (depth === 4 && (section === 'headers' || section === 'body')) {
        const [key, rawValue] = pair(text, line);
        const value = scalar(rawValue, line);
        const map = doc[side][section];
        if (Object.keys(map).length >= 32) fail(line, '每个区块最多 32 个字段。');
        if (section === 'headers') {
          if (typeof value !== 'string') fail(line, 'HTTP 头的值应为字符串，数字请加引号。');
          if (Object.keys(map).some(name => name.toLowerCase() === key.toLowerCase())) fail(line, 'HTTP 头 ' + key + ' 重复了。');
        }
        add(map, key, value, line);
      } else if (depth === 4 && section === 'matchers') {
        const [key, value] = pair(text, line);
        if (key !== 'body' || (value && value !== '[]')) fail(line, 'matchers 支持 body 列表，空列表可写作 []。');
        const entries = [];
        add(doc[side].matchers, 'body', entries, line);
        list = value ? null : entries;
        item = null;
      } else if (list && (depth === 6 || depth === 8)) {
        let entry = text;
        if (depth === 6) {
          if (!/^-(?: |$)/.test(text)) fail(line, '每条匹配规则以“- ”开头。');
          if (list.length >= 32) fail(line, '每组最多 32 条匹配规则。');
          item = { line, fields: emptyMap() };
          list.push(item);
          entry = text.slice(1).trimStart();
          if (!entry) continue;
        }
        if (!item) fail(line, '请先使用“- ”开始一条匹配规则。');
        const [key, value] = pair(entry, line);
        if (!['path', 'type', 'value'].includes(key)) fail(line, '匹配规则不支持 ' + key + '。');
        add(item.fields, key, scalar(value, line), line);
      } else {
        fail(line, '请检查缩进。body 和 headers 支持一层字段，matchers.body 使用列表。');
      }
    }
    if (!doc.request || !doc.response) fail(0, '请同时定义 request 和 response。');
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(doc.request.method)) fail(0, 'request.method 需要大写 HTTP 方法，例如 POST。');
    if (typeof doc.request.url !== 'string' || !/^\/[^\s]*$/.test(doc.request.url)) fail(0, 'request.url 需要以 / 开头的路径。');
    if (!Number.isInteger(doc.response.status) || doc.response.status < 100 || doc.response.status > 599) fail(0, 'response.status 需要 100–599 之间的整数。');
    if (!doc.response.body) fail(0, '请定义 response.body。空响应体可以写作 body: {}。');
    for (const part of [doc.request, doc.response]) {
      part.body = part.body || emptyMap();
      part.headers = part.headers || emptyMap();
      part.rules = emptyMap();
      for (const { line, fields } of (part.matchers?.body || [])) {
        const path = typeof fields.path === 'string' && /^(?:\$\.([A-Za-z_][\w-]*)|\$\.?\['([A-Za-z_][\w.-]*)'\]|\$\.?\["([A-Za-z_][\w.-]*)"\])$/.exec(fields.path);
        if (!path) fail(line, 'path 可以写成 $.stock，也可以用方括号引用带点的字段名。');
        const key = path[1] || path[2] || path[3];
        if (!has(part.body, key)) fail(line, '匹配路径 ' + fields.path + ' 在对应的 body 中没有示例值。');
        if (!['by_type', 'by_regex'].includes(fields.type)) fail(line, 'type 可选 by_type 或 by_regex。');
        if (fields.type === 'by_type' && has(fields, 'value')) fail(line, 'by_type 会读取示例的类型，请移除 value。');
        const test = fields.type === 'by_regex' ? regexMatcher(fields.value, line) : null;
        if (test && !test(part.body[key])) fail(line, 'body 的示例值没有匹配 ' + fields.value + '。by_regex 匹配完整字符串。');
        add(part.rules, key, { type: fields.type, value: fields.value, test }, line);
      }
    }
    return doc;
  }

  function standardRequest() {
    return {
      method: 'POST', url: '/inventory/check',
      headers: { 'Content-Type': 'application/json' }, body: { sku: 'SKU-042' }
    };
  }

  function header(headers, name) {
    const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : headers[key];
  }

  function response(status, body) {
    return { status, headers: { 'Content-Type': 'application/json' }, body };
  }

  function inventory(request, version) {
    if (request.url !== '/inventory/check') return response(404, { error: 'unknown_route' });
    if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });
    if ((header(request.headers, 'Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      return response(415, { error: 'unsupported_media_type' });
    }
    const sku = request.body.sku;
    if (typeof sku !== 'string') return response(400, { error: 'missing_sku' });
    const catalog = { 'SKU-042': 12, 'SKU-007': 0 };
    if (!has(catalog, sku)) return response(404, { error: 'unknown_sku' });
    const stock = catalog[sku];
    const body = { sku };
    body[version === 'rename' ? 'quantity' : 'stock'] = version === 'type' ? String(stock) : stock;
    body.available = stock > 0;
    if (version === 'extra') body.warehouse = 'SH-01';
    return response(version === 'status' ? 202 : 200, body);
  }

  function compare(expected, actual, side) {
    const misses = [];
    for (const key of side === 'request' ? ['method', 'url'] : ['status']) {
      if (expected[key] !== actual[key]) misses.push(key + ' 预期 ' + show(expected[key]) + '，实际 ' + show(actual[key]) + '。');
    }
    for (const [key, value] of Object.entries(expected.headers)) {
      const actualValue = header(actual.headers, key);
      if (actualValue !== value) misses.push('HTTP 头 ' + key + ' 预期 ' + show(value) + '，实际' + (actualValue === undefined ? '缺失' : '为 ' + show(actualValue)) + '。');
    }
    for (const [key, value] of Object.entries(expected.body)) {
      const rule = expected.rules[key];
      const path = 'body.' + key;
      const received = actual.body[key];
      if (!has(actual.body, key)) {
        misses.push('缺少 ' + path + '。');
      } else if (rule?.type === 'by_type') {
        if (kind(value) !== kind(received)) misses.push(path + ' 需要 ' + kind(value) + '，实际为 ' + kind(received) + '。');
      } else if (rule?.type === 'by_regex') {
        if (!rule.test(received)) misses.push(path + ' 的值 ' + show(received) + ' 未匹配 ' + rule.value + '。');
      } else if (value !== received) {
        misses.push(path + ' 预期 ' + show(value) + '，实际为 ' + show(received) + '。');
      }
    }
    return misses;
  }

  function result(issues, success) {
    return { status: issues.length ? 'fail' : 'pass', note: issues[0] || success, issues };
  }

  const blocked = note => ({ status: 'blocked', note, issues: [] });
  const invalid = error => ({ status: 'invalid', note: error, issues: [] });

  function consume(person, actual) {
    const { field } = roles[person];
    if (actual.status !== 200) return result(['消费代码需要 HTTP 200，收到 ' + actual.status + '。']);
    if ((header(actual.headers, 'Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      return result(['消费代码需要 application/json 响应。']);
    }
    if (!has(actual.body, field)) return result(['读取不到 ' + field + '。']);
    const value = actual.body[field];
    if (person === 'order') {
      if (!Number.isInteger(value) || value < 0) return result(['stock 需要非负整数，读到 ' + show(value) + '（' + kind(value) + '）。']);
      return result([], 'stock = ' + value + (value > 0 ? '，允许下单。' : '，提示库存不足。'));
    }
    if (typeof value !== 'boolean') return result(['available 需要布尔值，读到 ' + show(value) + '。']);
    return result([], 'available = ' + value + (value ? '，显示有货。' : '，显示缺货。'));
  }

  function ownTest(version, actual) {
    const quantityField = version === 'rename' ? 'quantity' : 'stock';
    const expected = version === 'type' ? '12' : 12;
    const checks = [
      { pass: actual.status === 200, note: 'HTTP ' + actual.status + '（预期 200）' },
      { pass: actual.body.sku === 'SKU-042', note: 'sku = ' + show(actual.body.sku) },
      { pass: actual.body[quantityField] === expected, note: quantityField + ' = ' + show(actual.body[quantityField]) }
    ];
    return {
      status: checks.every(check => check.pass) ? 'pass' : 'fail',
      count: checks.filter(check => check.pass).length,
      note: checks.map(check => check.note).join('，'),
      issues: checks.filter(check => !check.pass).map(check => check.note)
    };
  }

  const docIds = s => s.mode === 'consumer' ? people : ['shared'];
  const activeDoc = s => s.mode === 'consumer' ? s.tab : 'shared';
  const docName = id => id === 'shared' ? '公开契约' : roles[id].name + '契约';

  function parseFor(s, id) {
    try {
      const doc = compile(s.drafts[id]);
      delete s.errors[id];
      return doc;
    } catch (error) {
      s.errors[id] = error.message;
      return null;
    }
  }

  function clearResults(s) {
    s.phase = 0;
    s.own = null;
    s.providerChecks = {};
    s.consumerChecks = {};
    s.liveChecks = {};
    s.stubSource = '';
    s.manual = '';
    s.manualBatch = null;
    s.batch = null;
    Lab.flow.begin(s, s.time);
  }

  function init() {
    const s = {
      time: 0, mode: 'consumer', version: 'original', tab: 'order',
      drafts: { order: makeYaml('order'), product: makeYaml('product'), shared: makeYaml('shared') },
      errors: {}
    };
    clearResults(s);
    return s;
  }

  function recordCall(batch, path, checked, details) {
    // A complete consumer-driven run fits four actual calls into one simulation second.
    const at = batch.requests.length * 0.24;
    Lab.flow.add(batch, at, path, [checked.status === 'pass' ? 'pass' : 'stop'], {
      ...details, assertion: checked.status, note: checked.note
    });
  }

  function runProvider(s, batch, recordedOnly = false) {
    const actual = inventory(standardRequest(), s.version);
    s.own = ownTest(s.version, actual);
    for (const person of people) s.liveChecks[person] = consume(person, actual);
    for (const id of docIds(s)) {
      const doc = parseFor(s, id);
      if (!doc) {
        s.providerChecks[id] = invalid(s.errors[id]);
        continue;
      }
      if (recordedOnly && s.consumerChecks[id]?.status !== 'pass') {
        s.providerChecks[id] = blocked('该消费者的 Stub 测试尚未通过，没有可重放的记录。');
        continue;
      }
      const { method, url, headers, body } = doc.request;
      const request = { method, url, headers, body };
      const replay = inventory(request, s.version);
      const checked = result(compare(doc.response, replay, 'response'), 'HTTP ' + replay.status + '、约定的头和正文字段均匹配。');
      s.providerChecks[id] = { ...checked, request, actual: replay };
      recordCall(batch, replayPath, checked, {
        operation: 'replay', contractId: id, label: docName(id) + '重放', method, url, httpStatus: replay.status
      });
    }
  }

  function runConsumers(s, batch, publishedOnly = false) {
    s.stubSource = publishedOnly ? (s.providerChecks.shared?.status === 'pass' ? '已发布 Stub' : '等待发布 Stub') : '草稿 Stub';
    for (const person of people) {
      if (publishedOnly && s.providerChecks.shared?.status !== 'pass') {
        s.consumerChecks[person] = blocked('公开契约未通过提供者验证，尚无已发布的 Stub。');
        continue;
      }
      const id = s.mode === 'consumer' ? person : 'shared';
      const doc = parseFor(s, id);
      if (!doc) {
        s.consumerChecks[person] = invalid(s.errors[id]);
        continue;
      }
      const request = standardRequest();
      const misses = compare(doc.request, request, 'request');
      // Matching requests receive the contract example. Unmatched requests still reached the stub.
      const checked = misses.length ? result(misses.map(note => 'Stub 未匹配调用请求。' + note)) : consume(person, doc.response);
      s.consumerChecks[person] = checked;
      recordCall(batch, stubPath, checked, {
        operation: 'stub', contractId: id, consumer: person, label: roles[person].name + '调用 Stub',
        method: request.method, url: request.url, httpStatus: misses.length ? null : doc.response.status
      });
    }
  }

  function step(s, batch) {
    if (s.phase >= 3) return;
    s.manual = '';
    s.phase++;
    if (s.phase === 1) {
      for (const id of docIds(s)) parseFor(s, id);
    } else if (s.phase === 2) {
      if (s.mode === 'consumer') runConsumers(s, batch);
      else runProvider(s, batch);
    } else if (s.mode === 'consumer') {
      runProvider(s, batch, true);
    } else {
      runConsumers(s, batch, true);
    }
  }

  function tick(s) {
    step(s, Lab.flow.begin(s, s.time));
  }

  function act(s, key, value, target, ctx) {
    switch (key) {
      case 'contract-mode':
        if (has(modeNames, value) && s.mode !== value) { s.mode = value; clearResults(s); }
        break;
      case 'contract-version':
        if (has(versionNames, value) && s.version !== value) { s.version = value; clearResults(s); }
        break;
      case 'contract-doc':
        if (people.includes(value)) s.tab = value;
        break;
      case 'contract-yaml':
      case 'contract-restore': {
        const id = value?.id ?? activeDoc(s);
        if (!docIds(s).includes(id)) break;
        if (s.mode === 'consumer') s.tab = id;
        if (key === 'contract-restore') {
          s.drafts[id] = makeYaml(id);
          delete s.errors[id];
          ctx?.notify('已恢复' + docName(id) + '的示例');
        } else {
          const yaml = value?.yaml ?? value;
          if (typeof yaml !== 'string' || s.drafts[id] === yaml) break;
          s.drafts[id] = yaml;
          parseFor(s, id);
        }
        clearResults(s);
        break;
      }
      case 'contract-next':
        if (s.phase === 3) clearResults(s);
        step(s, Lab.flow.manual(s));
        break;
      case 'contract-run': {
        clearResults(s);
        const batch = Lab.flow.manual(s);
        while (s.phase < 3) step(s, batch);
        ctx?.notify('本轮契约验证已结束');
        break;
      }
      case 'contract-test-consumer':
        s.phase = 0;
        s.manual = 'consumer';
        runConsumers(s, Lab.flow.manual(s));
        ctx?.notify('已用当前草稿生成 Stub 并验证消费代码');
        break;
      case 'contract-test-provider':
        s.phase = 0;
        s.manual = 'provider';
        runProvider(s, Lab.flow.manual(s));
        ctx?.notify('已重放契约请求并核对库存服务的响应');
        break;
    }
  }

  function responsePreview(s) {
    const replay = s.providerChecks[activeDoc(s)];
    if (replay?.actual) return { request: replay.request, actual: replay.actual, replayed: true };
    const request = standardRequest();
    return { request, actual: inventory(request, s.version), replayed: false };
  }

  function calledChecks(checks, pending) {
    const calls = Object.values(checks).filter(check => check.status === 'pass' || check.status === 'fail');
    return calls.length ? calls.filter(check => check.status === 'pass').length + '/' + calls.length + ' 通过' : pending;
  }

  function stage(s) {
    const stubStatus = s.stubSource === '等待发布 Stub' ? '等待发布' : '等待调用';
    return {
      nodes: [
        {id: 'consumer', role: 'client', label: '消费者', sub: '订单 / 商品'},
        {id: 'stub', role: 'product', label: '契约 Stub', sub: calledChecks(s.consumerChecks, stubStatus)},
        {id: 'verifier', role: 'control', label: '契约验证器', sub: calledChecks(s.providerChecks, '等待重放')},
        {id: 'inventory', role: 'inventory', label: '库存服务', sub: versionNames[s.version].split(' · ')[0]}
      ],
      edges: [stubPath, replayPath].map(([from, to]) => ({from, to, kind: 'flow', weight: 1})),
      ...Lab.flow.batches(s),
      legend: {pass: '验证通过', stop: '验证失败'}
    };
  }

  function passCount(results, total) {
    const rows = Object.values(results);
    return rows.length ? rows.filter(row => row.status === 'pass').length + '/' + total : '—';
  }

  function impacted(s) {
    return people.filter(person => s.liveChecks[person]?.status === 'fail');
  }

  function stats(s) {
    return [
      ['提供者契约通过', passCount(s.providerChecks, docIds(s).length), '份'],
      ['Stub 测试通过', passCount(s.consumerChecks, people.length), '个'],
      ['受影响消费者', s.own ? impacted(s).length : '—', '个']
    ];
  }

  Lab.scenes.contract = {
    init, tick, act, stage, stats, responsePreview, impacted,
    people, roles, versions, modes, activeDoc, docName
  };
})();
