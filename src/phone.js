(function () {
  'use strict';

  const Lab = window.Lab;
  const servicePath = 'POST /signup/verify-phone';
  const validationPath = ['phone-input', 'phone-validator', 'phone-assertion'];
  const samples = [
    { key: 'long', name: '多一位数字', raw: '138000000001', expected: false },
    { key: 'first', name: '首位为 0', raw: '03800000000', expected: false },
    { key: 'second', name: '第二位为 2', raw: '12800000000', expected: false },
    { key: 'empty', name: '空字符串', raw: '', expected: false },
    { key: 'leading-space', name: '开头有空格', raw: ' 13800000000', expected: false },
    { key: 'trailing-space', name: '末尾有空格', raw: '13800000000 ', expected: false },
    { key: 'wide', name: '包含全角数字', raw: '１３８００００００００', expected: false }
  ];
  const defects = {
    short: '错误接受 10 位号码',
    tail: '忽略第 11 位之后的字符'
  };
  const headers = {
    name: ['用例', '用例名称', '示例用例', '名称', 'name', 'case', 'case_name'],
    raw: ['输入原文', '输入', '原始输入', '手机号', '手机号码', 'input', 'phone', 'raw'],
    expected: ['预期校验结果', '预期结果', '预期', '期望结果', '期望', 'expected', 'expect']
  };

  function makeRow(id, name, raw, expected) {
    return { id, name, raw, expected, actual: null };
  }

  function init() {
    const state = {
      time: 0,
      manualBatch: null,
      rows: [
        makeRow(1, '符合课堂规则', '13800000000', true),
        makeRow(2, '少一位数字', '1380000000', false),
        makeRow(3, '混入字母', '1380000000A', false)
      ],
      nextId: 4,
      signupRaw: '13800000000',
      signupExpected: true,
      signupLastId: null,
      preset: 'long',
      importNote: '',
      importError: false
    };
    Lab.flow.begin(state, state.time);
    return state;
  }

  function validDigits(raw) {
    return raw[0] === '1' && /[3-9]/.test(raw[1] || '') && !/[^0-9]/.test(raw);
  }

  function matchesSpec(raw) {
    return raw.length === 11 && validDigits(raw);
  }

  // The simulated registration service has two reproducible validation defects.
  // The independent classroom rule above also checks the complete, original string.
  function serviceAccepts(raw) {
    const inspected = raw.slice(0, 11);
    return inspected.length >= 10 && validDigits(inspected);
  }

  function defectFor(row) {
    if (row.actual === null || row.actual === matchesSpec(row.raw)) return '';
    return row.raw.length === 10 ? 'short' : 'tail';
  }

  function counts(s) {
    const found = new Set();
    let passed = 0;
    let failed = 0;
    for (const row of s.rows) {
      if (row.actual === null) continue;
      if (row.expected === row.actual) passed += 1;
      else failed += 1;
      const defect = defectFor(row);
      if (defect) found.add(defect);
    }
    return { found, passed, failed };
  }

  function append(s, name, raw, expected) {
    const row = makeRow(s.nextId++, name, raw, expected);
    s.rows.push(row);
    return row;
  }

  function run(row, batch, at = 0) {
    row.actual = serviceAccepts(row.raw);
    const outcome = row.actual === row.expected ? 'pass' : 'stop';
    Lab.flow.add(batch, at, validationPath, ['neutral', outcome], {
      rowId: row.id, raw: row.raw, expected: row.expected, actual: row.actual
    });
  }

  function tick(s) {
    Lab.flow.begin(s, s.time);
    const next = s.rows.find(row => row.actual === null);
    if (next) run(next, s.batch);
    return Boolean(next);
  }

  function validity(value) {
    return value ? '有效' : '无效';
  }

  function verdict(row) {
    if (row.actual === null) return '待运行';
    return row.expected === row.actual ? '通过' : '失败';
  }

  function visibleRaw(raw) {
    if (raw === '') return '空字符串';
    return raw.replace(/ /g, '␠').replace(/\t/g, '⇥').replace(/\r/g, '␍').replace(/\n/g, '↵');
  }

  function preview(text, limit) {
    const chars = Array.from(text);
    if (chars.length <= limit) return text;
    const tail = 6;
    return chars.slice(0, limit - tail).join('') + '…' + chars.slice(-tail).join('');
  }

  function escape(value) {
    return Lab.ui.escape(String(value));
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
      fields.push([row.name, row.raw, validity(row.expected),
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
      for (const row of records) append(s, row.name, row.raw, row.expected);
      s.importNote = '已追加 ' + records.length + ' 条用例，等待运行。';
      s.importError = false;
    } catch (error) {
      s.importNote = '导入失败。' + error.message;
      s.importError = true;
    }
    target.value = '';
    ctx.notify(s.importNote);
  }

  function act(s, key, value, target, ctx) {
    const edit = /^phone-(raw|name|expected)-(\d+)$/.exec(key);
    if (edit) {
      const row = s.rows.find(item => item.id === Number(edit[2]));
      if (!row) return;
      if (edit[1] === 'raw' && row.raw !== value) {
        row.raw = String(value);
        row.actual = null;
      } else if (edit[1] === 'expected') {
        row.expected = value === 'valid';
      } else if (edit[1] === 'name') row.name = String(value);
      return;
    }

    switch (key) {
      case 'phone-signup-raw':
        s.signupRaw = String(value);
        s.signupLastId = null;
        break;
      case 'phone-signup-expected':
        s.signupExpected = value === 'valid';
        s.signupLastId = null;
        break;
      case 'phone-signup':
        {
          const row = append(s, '注册表单', s.signupRaw, s.signupExpected);
          run(row, Lab.flow.manual(s));
          s.signupLastId = row.id;
        }
        break;
      case 'phone-all':
        if (s.rows.length) {
          const batch = Lab.flow.manual(s);
          const spacing = 0.8 / Math.max(1, s.rows.length - 1);
          s.rows.forEach((row, index) => run(row, batch, index * spacing));
        }
        break;
      case 'phone-add':
        append(s, '自定义用例', '', false);
        ctx.notify('已在表尾加入一条空用例，可填写名称、输入和预期。');
        break;
      case 'phone-run':
        {
          const row = s.rows.find(item => item.id === Number(value));
          if (row) run(row, Lab.flow.manual(s));
        }
        break;
      case 'phone-remove':
        s.rows = s.rows.filter(row => row.id !== Number(value));
        if (s.signupLastId === Number(value)) s.signupLastId = null;
        break;
      case 'phone-preset':
        s.preset = String(value);
        break;
      case 'phone-add-preset':
        {
          const sample = samples.find(item => item.key === s.preset);
          if (sample) {
            append(s, sample.name, sample.raw, sample.expected);
            ctx.notify('已加入“' + sample.name + '”用例。');
          }
        }
        break;
      case 'phone-import':
        return importFile(s, target, ctx);
      case 'phone-export':
        ctx.download('商城手机号测试用例.csv', csvFor(s), 'text/csv;charset=utf-8');
        break;
    }
  }

  function option(value, label, selected) {
    return '<option value="' + escape(value) + '"' + (selected ? ' selected' : '') + '>' +
      escape(label) + '</option>';
  }

  function expectation(key, expected, label) {
    return '<select class="phone-input phone-select" data-key="' + key + '" aria-label="' +
      escape(label) + '">' + option('valid', '有效', expected) + option('invalid', '无效', !expected) + '</select>';
  }

  function rawEditor(key, raw, label) {
    const attrs = ' class="phone-input phone-raw" data-key="' + key + '" aria-label="' +
      escape(label) + '" autocomplete="off" autocapitalize="off" spellcheck="false"';
    if (/[\r\n]/.test(raw)) {
      return '<textarea rows="2"' + attrs + '>\n' + escape(raw) + '</textarea>';
    }
    return '<input type="text" inputmode="text"' + attrs + ' value="' + escape(raw) +
      '" placeholder="空字符串">';
  }

  function registration(s) {
    const last = s.rows.find(row => row.id === s.signupLastId);
    const current = last && last.actual !== null && last.raw === s.signupRaw &&
      last.expected === s.signupExpected;
    const response = current
      ? '<p class="phone-signup-feedback" role="status"><strong>' +
        (last.actual ? '允许继续注册' : '已拒绝这个号码') + '</strong><span>已记入用例 #' +
        last.id + ' · ' + verdict(last) + '</span></p>'
      : '<p class="phone-signup-feedback">提交后，这次注册尝试会出现在下方测试表中。</p>';
    return '<section class="phone-signup" aria-label="商城注册表单">' +
      '<header class="phone-signup-title"><span class="phone-shop-mark" aria-hidden="true"></span>' +
      '<h3>商城注册页</h3><code>' + servicePath + '</code></header>' +
      '<p class="phone-rule">请输入 11 位半角数字，首位为 1，第二位为 3–9。空格也算输入。</p>' +
      '<div class="phone-signup-fields"><label class="phone-form-raw"><span>手机号</span>' +
      rawEditor('phone-signup-raw', s.signupRaw, '注册表单手机号原文') + '</label>' +
      '<label class="phone-form-expected"><span>我的预期</span>' +
      expectation('phone-signup-expected', s.signupExpected, '注册表单预期校验结果') + '</label>' +
      '<button type="button" class="phone-btn phone-btn-primary" data-act="phone-signup">提交校验</button></div>' +
      response + '</section>';
  }

  function rawInfo(raw) {
    const length = Array.from(raw).length;
    const whitespace = /[ \t\r\n]/.test(raw);
    const shown = whitespace ? ' · ' + escape(preview(visibleRaw(raw), 35)) : '';
    return '<span class="phone-raw-info">' + length + ' 个字符' + shown + '</span>';
  }

  function caseRow(row) {
    const id = row.id;
    const label = '用例 #' + id;
    const outcome = verdict(row);
    let note = '';
    if (row.actual !== null) {
      if (defectFor(row)) note = '接口误收';
      else if (row.expected !== matchesSpec(row.raw)) note = '请核对预期';
    }
    const state = row.actual === null ? 'pending' : row.expected === row.actual ? 'pass' : 'fail';
    const actual = row.actual === null ? '—' : validity(row.actual);
    return '<tr><td class="phone-case-data"><div class="phone-case-title">' +
      '<span class="phone-case-id" title="用例编号">#' + id + '</span>' +
      '<input type="text" class="phone-name" data-key="phone-name-' + id + '" aria-label="' + label +
      '名称" value="' + escape(row.name) + '" autocomplete="off" placeholder="用例名称"></div>' +
      rawEditor('phone-raw-' + id, row.raw, label + '输入原文') + rawInfo(row.raw) + '</td>' +
      '<td class="phone-case-expect" data-col="预期">' + expectation('phone-expected-' + id, row.expected,
        label + '预期校验结果') + '</td><td class="phone-case-actual" data-col="实际">' + actual + '</td>' +
      '<td class="phone-case-verdict" data-col="用例结果"><span class="phone-verdict phone-' + state + '">' +
      outcome + '</span>' + (note ? '<small class="phone-diagnosis">' + note + '</small>' : '') + '</td>' +
      '<td class="phone-case-actions"><button type="button" class="phone-row-btn" data-act="phone-run" ' +
      'data-value="' + id + '" aria-label="运行' + label + '">运行</button>' +
      '<button type="button" class="phone-row-btn phone-delete" data-act="phone-remove" data-value="' +
      id + '" aria-label="删除' + label + '">删除</button></td></tr>';
  }

  function table(s) {
    const body = s.rows.length ? s.rows.map(caseRow).join('')
      : '<tr><td class="phone-empty" colspan="5">测试表是空的。新增一条用例，或提交上方的注册表单。</td></tr>';
    return '<section class="phone-suite" aria-label="可编辑的手机号测试用例">' +
      '<header class="phone-suite-head"><h3>测试用例 <span>' + s.rows.length + '</span></h3>' +
      '<div class="phone-toolbar"><button type="button" class="phone-btn phone-btn-light" data-act="phone-add">' +
      '新增用例</button><button type="button" class="phone-btn phone-btn-primary" data-act="phone-all"' +
      (s.rows.length ? '' : ' disabled') + '>运行全部</button></div></header>' +
      '<div class="phone-table-wrap"><table class="phone-table"><caption class="phone-sr">每行可以修改用例名称、' +
      '输入原文和预期。实际结果与预期一致时，该用例通过。</caption>' +
      '<thead><tr><th scope="col">用例 / 输入原文</th><th scope="col">预期</th><th scope="col">实际</th>' +
      '<th scope="col">用例结果</th><th scope="col">操作</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="phone-suite-note">实际与预期一致，用例就通过。无效号码被正确拒绝也算通过。</p></section>';
  }

  function workspace(s) {
    return '<div class="phone-lab">' + registration(s) + table(s) + '</div>';
  }

  function controls(s) {
    const { found } = counts(s);
    const hint = !found.has('short') ? '把一个合法号码删去最后一位，运行后对照课堂规则。'
      : !found.has('tail') ? '在合法号码后再添一个字符。换成字母或空格，结果会怎样？'
      : '两类缺陷都已复现。试着修改用例的预期，观察通过数和缺陷数。';
    const observed = [...found].map(key => '<li>' + defects[key] + '</li>').join('');
    return '<div class="phone-tools"><section><h3>补充边界用例</h3>' +
      '<label class="phone-label">输入类型<select class="phone-input" data-key="phone-preset">' +
      samples.map(sample => option(sample.key, sample.name, s.preset === sample.key)).join('') +
      '</select></label><button type="button" class="phone-btn phone-btn-light phone-wide" ' +
      'data-act="phone-add-preset">加入测试表</button></section>' +
      '<section><h3>缺陷线索</h3><p>' + hint + '</p>' +
      (observed ? '<ul class="phone-evidence-list" aria-label="当前用例证实的实现缺陷">' + observed + '</ul>' : '') +
      '<p class="phone-tool-note">接口判断与课堂规则冲突，就记为实现缺陷。同一缺陷只算一次。</p></section>' +
      '<section><h3>CSV 用例</h3><div class="phone-file-actions">' +
      '<label class="phone-btn phone-btn-light phone-file">导入 CSV' +
      '<input type="file" data-key="phone-import" accept=".csv,text/csv,text/plain" aria-label="导入 CSV 用例">' +
      '</label><button type="button" class="phone-btn phone-btn-light" data-act="phone-export">导出 CSV</button></div>' +
      '<p class="phone-tool-note">导入会追加到表尾。表头用“输入原文”和“预期校验结果”，预期填“有效”或“无效”。</p>' +
      (s.importNote ? '<p role="status" class="phone-import-note' + (s.importError ? ' phone-import-error' : '') +
        '">' + escape(s.importNote) + '</p>' : '') + '</section></div>';
  }

  function stats(s) {
    const { passed, failed, found } = counts(s);
    return [['通过', passed, '例'], ['失败', failed, '例'], ['已发现缺陷', found.size, '类']];
  }

  function stage(s) {
    const { passed, failed } = counts(s);
    const [input, validator, assertion] = validationPath;
    return {
      nodes: [
        { id: input, role: 'client', label: '测试输入', sub: s.rows.length + ' 条用例' },
        { id: validator, role: 'product', label: '注册校验', sub: '已运行 ' + (passed + failed) + ' 条' },
        { id: assertion, role: 'control', label: '预期断言', sub: passed + ' 通过 / ' + failed + ' 失败' }
      ],
      edges: [
        { from: input, to: validator, kind: 'flow', weight: 1 },
        { from: validator, to: assertion, kind: 'flow', weight: 1 }
      ],
      ...Lab.flow.batches(s),
      legend: { pass: '断言通过', stop: '断言失败' }
    };
  }

  Lab.scenes.phone = { init, act, tick, stage, workspace, controls, stats };
})();
