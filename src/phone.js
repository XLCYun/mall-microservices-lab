(function () {
  'use strict';

  const Lab = window.Lab;
  const validationPath = ['phone-input', 'phone-validator', 'phone-assertion'];
  const initialCases = [
    { name: '标准号码', phone: '13800000000', expected: true },
    { name: '少一位数字', phone: '1380000000', expected: false },
    { name: '多一位数字', phone: '138000000001', expected: false },
    { name: '含有字母', phone: '1380000000A', expected: false },
    { name: '空字符串', phone: '', expected: false }
  ];
  const samples = [
    { key: 'long', name: '多一位数字', raw: '138000000001', expected: false },
    { key: 'first', name: '首位为 0', raw: '03800000000', expected: false },
    { key: 'second', name: '第二位为 2', raw: '12800000000', expected: false },
    { key: 'empty', name: '空字符串', raw: '', expected: false },
    { key: 'leading-space', name: '开头有空格', raw: ' 13800000000', expected: false },
    { key: 'trailing-space', name: '末尾有空格', raw: '13800000000 ', expected: false },
    { key: 'wide', name: '包含全角数字', raw: '１３８００００００００', expected: false }
  ];
  const headers = {
    name: ['用例', '用例名称', '示例用例', '名称', 'name', 'case', 'case_name'],
    raw: ['输入原文', '输入', '原始输入', '手机号', '手机号码', 'input', 'phone', 'raw'],
    expected: ['预期校验结果', '预期结果', '预期', '期望结果', '期望', 'expected', 'expect']
  };


  function makeRow(id, name, phone, expected) {
    return { id, name, phone, expected, actual: null, exchange: null, error: '' };
  }

  function init() {
    const state = {
      time: 0, manualBatch: null, selectedId: 1, sendingId: null, busy: false,
      rows: initialCases.map(({ name, phone, expected }, index) => makeRow(index + 1, name, phone, expected)),
      nextId: initialCases.length + 1, preset: 'first', importNote: '', importError: false
    };
    Lab.flow.begin(state, state.time);
    return state;
  }

  function validity(value) { return value ? '有效' : '无效'; }

  function verdict(row) {
    if (row.error) return '请求出错';
    if (row.actual === null) return '待运行';
    return row.expected === row.actual ? '通过' : '不符';
  }

  function counts(s) {
    let passed = 0, failed = 0, errors = 0;
    for (const row of s.rows) {
      if (row.error) errors++;
      else if (row.actual !== null) {
        if (row.actual === row.expected) passed++;
        else failed++;
      }
    }
    return { passed, failed, errors, finished: passed + failed + errors };
  }

  function append(s, name, raw, expected) {
    const row = makeRow(s.nextId++, name, raw, expected);
    s.rows.push(row);
    return row;
  }

  function caseData({ phone, expected }) { return { phone, expected }; }
  function requestBody({ phone }) { return JSON.stringify({ phone }); }

  async function runRows(s, rows, ctx = {}) {
    if (s.busy || !rows.length) return;
    s.busy = true;
    const batch = { requests: [] };
    try {
      for (const row of rows) {
        if (ctx.current && !ctx.current()) break;
        s.sendingId = row.id;
        const exchange = { body: requestBody(row), status: null, text: '' };
        row.exchange = exchange;
        row.actual = null;
        row.error = '';
        ctx.refresh?.();
        try {
          const response = await Lab.phoneClient.send(exchange.body);
          exchange.status = response.status;
          exchange.text = await response.text();
          const data = JSON.parse(exchange.text);
          if (!response.ok) throw new Error(data?.error || '接口返回 HTTP ' + response.status);
          if (typeof data?.valid !== 'boolean') throw new Error('响应缺少布尔值 valid。');
          row.actual = data.valid;
        } catch (error) {
          row.error = error instanceof SyntaxError ? '响应不是有效的 JSON。' : String(error.message || error);
        }
        const passed = row.actual !== null && row.actual === row.expected;
        const at = rows.length > 1 ? 0.8 * batch.requests.length / (rows.length - 1) : 0;
        Lab.flow.add(batch, at, validationPath, ['neutral', passed ? 'pass' : 'stop'], {
          rowId: row.id, raw: row.phone, expected: row.expected, actual: row.actual
        });
      }
    } finally {
      s.sendingId = null;
      s.busy = false;
      if (batch.requests.length) s.manualBatch = batch;
      ctx.refresh?.();
    }
  }

  function tick(s) {
    Lab.flow.begin(s, s.time);
    if (s.busy) return;
    const next = s.rows.find(row => !row.exchange);
    if (!next) return;
    s.selectedId = next.id;
    return runRows(s, [next]);
  }

  function readRecords(source) {
    const csv = String(source).replace(/^\uFEFF/, '');
    const records = [];
    let record = [];
    let field = '';
    let quoted = false;
    let closedQuote = false;
    let started = false;

    function endField() {
      record.push(field);
      field = '';
      closedQuote = false;
    }

    function endRecord() {
      if (started) {
        endField();
        records.push(record);
      }
      record = [];
      started = false;
    }

    for (let i = 0; i < csv.length; i++) {
      const char = csv[i];
      if (quoted) {
        if (char !== '"') field += char;
        else if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else if (char === ',') {
        started = true;
        endField();
      } else if (char === '\r' || char === '\n') {
        endRecord();
        if (char === '\r' && csv[i + 1] === '\n') i++;
      } else {
        started = true;
        if (closedQuote) throw new Error('结束引号后需要逗号或换行。');
        if (char === '"') {
          if (field) throw new Error('字段里的引号需要写成两个双引号，并给整个字段加引号。');
          quoted = true;
        } else field += char;
      }
    }
    if (quoted) throw new Error('有一个带引号的字段缺少结束引号。');
    endRecord();
    return records;
  }

  function importedExpectation(value, recordNumber) {
    const normalized = value.trim().toLowerCase();
    if (['有效', '合法', 'valid', 'true', '1'].includes(normalized)) return true;
    if (['无效', '不合法', 'invalid', 'false', '0'].includes(normalized)) return false;
    throw new Error('第 ' + recordNumber + ' 条记录的预期请填“有效”或“无效”。');
  }

  function importRecords(text) {
    const [first, ...records] = readRecords(text);
    if (!first) throw new Error('文件是空的。');
    const columns = first.map(cell => cell.trim().toLowerCase());
    const locate = key => columns.findIndex(column => headers[key].includes(column));
    const name = locate('name');
    const raw = locate('raw');
    const expected = locate('expected');
    if (raw < 0 || expected < 0) throw new Error('表头需要包含“输入原文”和“预期校验结果”。');
    if (records.length === 0) throw new Error('表头下面还没有测试用例。');
    return records.map((record, i) => {
      const number = i + 2;
      if (raw >= record.length || expected >= record.length) {
        throw new Error('第 ' + number + ' 条记录缺少输入或预期列。');
      }
      return {
        name: name >= 0 && name < record.length ? record[name] : '导入用例 ' + (i + 1),
        raw: record[raw],
        expected: importedExpectation(record[expected], number)
      };
    });
  }

  function csvFor(s) {
    const fields = [['用例', '输入原文', '预期校验结果', '实际校验结果', '用例结果']];
    for (const row of s.rows) {
      fields.push([row.name, row.phone, validity(row.expected),
        row.actual === null ? '' : validity(row.actual), verdict(row)]);
    }
    const quote = value => '"' + value.replace(/"/g, '""') + '"';
    return '\uFEFF' + fields.map(record => record.map(quote).join(',')).join('\r\n') + '\r\n';
  }

  function fileText(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('读取文件时发生错误，请重新选择文件。'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  async function importFile(s, target, ctx) {
    const file = target && target.files && target.files[0];
    if (!file) return;
    try {
      const records = importRecords(await fileText(file));
      if (ctx.current && !ctx.current()) return;
      for (const row of records) append(s, row.name, row.raw, row.expected);
      if (s.selectedId === null) s.selectedId = s.rows[0].id;
      s.importNote = '已追加 ' + records.length + ' 条用例，等待运行。';
      s.importError = false;
    } catch (error) {
      s.importNote = '导入失败。' + error.message;
      s.importError = true;
    }
    target.value = '';
    ctx.notify(s.importNote);
  }

  function act(s, key, value, target, ctx = {}) {
    if (key === 'phone-select') {
      if (s.rows.some(row => row.id === Number(value))) s.selectedId = Number(value);
      return;
    }
    if (key === 'phone-export') {
      ctx.download('商城手机号测试用例.csv', csvFor(s), 'text/csv;charset=utf-8');
      return;
    }
    if (s.busy) return;
    const edit = /^phone-(raw|name|expected)-(\d+)$/.exec(key);
    if (edit) {
      const row = s.rows.find(item => item.id === Number(edit[2]));
      if (!row) return;
      s.selectedId = row.id;
      if (edit[1] === 'name') row.name = String(value);
      if (edit[1] === 'expected') row.expected = value === 'valid';
      if (edit[1] === 'raw' && row.phone !== value) {
        row.phone = String(value);
        row.actual = null;
        row.exchange = null;
        row.error = '';
      }
      return;
    }
    switch (key) {
      case 'phone-all':
        return runRows(s, [...s.rows], ctx);
      case 'phone-run': {
        const row = s.rows.find(item => item.id === Number(value));
        if (!row) return;
        s.selectedId = row.id;
        return runRows(s, [row], ctx);
      }
      case 'phone-add':
        s.selectedId = append(s, '自定义用例', '', false).id;
        break;
      case 'phone-remove': {
        const i = s.rows.findIndex(row => row.id === Number(value));
        if (i < 0) return;
        s.rows.splice(i, 1);
        if (s.selectedId === Number(value)) s.selectedId = (s.rows[i] || s.rows[i - 1])?.id ?? null;
        break;
      }
      case 'phone-preset':
        s.preset = String(value);
        break;
      case 'phone-add-preset': {
        const sample = samples.find(item => item.key === s.preset);
        if (sample) s.selectedId = append(s, sample.name, sample.raw, sample.expected).id;
        break;
      }
      case 'phone-import':
        return importFile(s, target, ctx);
    }
  }

  function stats(s) {
    const { finished, passed, failed, errors } = counts(s);
    return [['已运行', finished, '例'], ['通过', passed, '例'], ['未通过', failed + errors, '例']];
  }

  function stage(s) {
    const { passed, failed, errors } = counts(s);
    const [input, validator, assertion] = validationPath;
    return {
      nodes: [
        { id: input, role: 'client', label: '测试用例', sub: s.rows.length + ' 条用例' },
        { id: validator, role: 'product', label: '手机号接口', sub: '已运行 ' + (passed + failed + errors) + ' 条' },
        { id: assertion, role: 'control', label: '响应断言', sub: passed + ' 通过 / ' + (failed + errors) + ' 未通过' }
      ],
      edges: [
        { from: input, to: validator, kind: 'flow', weight: 1 },
        { from: validator, to: assertion, kind: 'flow', weight: 1 }
      ],
      ...Lab.flow.batches(s),
      legend: { pass: '断言通过', stop: '断言失败' }
    };
  }

  Lab.scenes.phone = { init, tick, act, stage, stats, counts, initialCases, samples, caseData, requestBody, verdict };
})();
