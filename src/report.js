(() => {
  'use strict';
  const family = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  function wrap(ctx, text, width) {
    const lines = [];
    for (const paragraph of String(text ?? '').split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (line && ctx.measureText(line + char).width > width) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
      lines.push(line);
    }
    return lines;
  }
  Lab.makeCard = function ({ scene, elapsed, metrics, params, evidence, answer, topology }) {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    const c = canvas.getContext('2d');
    const content = [];
    let y = 176;
    function textBlock(value, opts = {}) {
      const {
        font = '24px ' + family,
        color = '#3e394d',
        left = 46,
        width = 868,
        lineHeight = 34,
        before = 0,
        after = 0,
      } = opts;
      y += before;
      c.font = font;
      for (const line of wrap(c, value, width)) {
        content.push({ line, font, color, left, y });
        y += lineHeight;
      }
      y += after;
    }
    function section(title) {
      textBlock(title, { font: 'bold 25px ' + family, color: '#5542a0', before: 19, after: 3 });
    }
    if (topology && topology.width && topology.height) {
      const h = Math.min(430, Math.round((868 * topology.height) / topology.width));
      content.push({ picture: topology, y: y - 8, h });
      y += h + 12;
    }
    section('本次读数');
    textBlock(metrics.map(([label, value, unit]) => label + '  ' + value + (unit || '')).join('    ·    '));
    if (params.length) {
      section('关键参数与结果');
      for (const [label, value] of params)
        textBlock(label + '   ' + value, { font: '22px ' + family, lineHeight: 32 });
    }
    if (evidence.length) {
      section('运行快照');
      const shown = evidence.slice(0, 10);
      for (const [label, value] of shown) {
        const compact = (value) =>
          String(value).length > 120 ? String(value).slice(0, 119) + '…' : String(value);
        textBlock(compact(label) + '   ' + compact(value), { font: '22px ' + family, lineHeight: 32 });
      }
      if (evidence.length > shown.length)
        textBlock('本次共 ' + evidence.length + ' 条，图中摘录 ' + shown.length + ' 条。', {
          font: '20px ' + family,
          lineHeight: 29,
        });
    }
    section('我的课堂记录');
    textBlock(scene.question, { font: '21px ' + family, color: '#666173', lineHeight: 31, after: 5 });
    textBlock(answer.trim() || '（未填写）', { font: '24px ' + family, lineHeight: 35 });
    canvas.height = Math.ceil(y + 40);
    c.fillStyle = '#fff';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#222237';
    c.fillRect(0, 0, 960, 141);
    c.fillStyle = '#cbbaff';
    c.fillRect(0, 0, 10, 141);
    c.font = 'bold 22px ' + family;
    c.fillStyle = '#c9c1e4';
    c.fillText('微服务演练场  /  商城大促值班夜', 46, 42);
    c.font = 'bold 39px ' + family;
    c.fillStyle = '#fff';
    c.fillText(scene.title, 46, 96);
    c.font = '19px ' + family;
    c.fillStyle = '#d1cbe3';
    c.textAlign = 'right';
    c.fillText('模拟时间 ' + elapsed, 909, 94);
    c.textAlign = 'left';
    c.textBaseline = 'top';
    for (const item of content) {
      if (item.picture) {
        c.fillStyle = '#191b30';
        c.fillRect(46, item.y, 868, item.h);
        c.drawImage(item.picture, 46, item.y, 868, item.h);
      } else {
        c.font = item.font;
        c.fillStyle = item.color;
        c.fillText(item.line, item.left, item.y);
      }
    }
    return canvas.toDataURL('image/png');
  };
})();
