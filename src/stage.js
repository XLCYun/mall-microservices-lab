(() => {
  'use strict';

  const stages = new WeakMap();
  const TAU = 2 * Math.PI;
  const slope = 0.46;
  const fontFamily = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  const palette = {
    client: '#7de9c5', gateway: '#ff9a7c', product: '#b6a1ff', registry: '#aab4ff',
    reject: '#ff836a', order: '#91c9e9', control: '#a9b9ff', config: '#9ebfff',
    review: '#d4a6e9', inventory: '#87d7c6', v1: '#b7a6fd', v2: '#ecabe7', sidecar: '#84dce2'
  };
  const edgeTones = {flow: '#83efd0', blocked: '#ff967d', control: '#b7aeff', idle: '#767895'};
  const statusTones = {up: '#77e8b9', down: '#ff8979', slow: '#ffc37e', pending: '#f6ce8a', muted: '#9594ab'};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const project = (x, y, z = 0) => [(x - y) * 0.89, (x + y) * 0.89 * slope - z];

  function tint(hex, opacity) {
    const value = parseInt(hex.slice(1), 16);
    return 'rgba(' + (value >> 16) + ',' + (value >> 8 & 255) + ',' + (value & 255) + ',' + opacity + ')';
  }

  function lit(hex, amount) {
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
    return 'rgb(' + channels.map(c => Math.round(mix(c, amount > 0 ? 255 : 0, Math.abs(amount)))).join(',') + ')';
  }

  function hash(key) {
    let value = 2166136261;
    for (const character of String(key)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
    return (value >>> 0) / 4294967296;
  }

  function gradient(ctx, x1, y1, x2, y2, start, end) {
    const brush = ctx.createLinearGradient(x1, y1, x2, y2);
    brush.addColorStop(0, start);
    brush.addColorStop(1, end);
    return brush;
  }

  function path(ctx, points, close = false) {
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    if (close) ctx.closePath();
  }

  function stroke(ctx, points, color, width = 1) {
    path(ctx, points);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function polygon(ctx, points, fill, border, width = 0.7) {
    path(ctx, points, true);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  function ellipse(ctx, x, y, rx, ry, fill, border, width = 0.8) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  function glow(ctx, x, y, rx, ry, color, amount) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const light = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    light.addColorStop(0, tint(color, amount));
    light.addColorStop(0.48, tint(color, amount * 0.53));
    light.addColorStop(1, tint(color, 0));
    ctx.fillStyle = light;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  const line3 = (ctx, points, color, width) => stroke(ctx, points.map(p => project(...p)), color, width);
  const poly3 = (ctx, points, color, border, width) => polygon(ctx, points.map(p => project(...p)), color, border, width);

  function cutRect(x1, y1, x2, y2, cut) {
    return [[x1 + cut, y1], [x2 - cut, y1], [x2, y1 + cut], [x2, y2 - cut],
      [x2 - cut, y2], [x1 + cut, y2], [x1, y2 - cut], [x1, y1 + cut]];
  }

  // A chamfered footprint, extruded vertically. Only its camera-facing walls are visible.
  function slab(ctx, footprint, bottom, top, colors, rim) {
    footprint.forEach((a, i) => {
      const b = footprint[(i + 1) % footprint.length];
      const facing = (b[1] - a[1]) - (b[0] - a[0]);
      if (facing <= 0) return;
      const alongX = Math.abs(b[0] - a[0]);
      const alongY = Math.abs(b[1] - a[1]);
      const fill = alongX > alongY ? colors[1] : alongX < alongY ? colors[2] : (colors[3] || colors[1]);
      const wall = [[...a, bottom], [...b, bottom], [...b, top], [...a, top]];
      let skin = fill;
      if (top - bottom > 3.2 && /^#[a-f0-9]{6}$/i.test(fill)) {
        const [x, y] = project((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, top);
        skin = gradient(ctx, x, y - 0.8, x, y + top - bottom, lit(fill, 0.08), lit(fill, -0.13));
      }
      poly3(ctx, wall, skin, fill, 0.45);
    });
    poly3(ctx, footprint.map(([x, y]) => [x, y, top]), colors[0], rim, 0.65);
  }

  function box(ctx, x1, y1, x2, y2, bottom, top, colors, cut = 1.7, rim) {
    slab(ctx, cutRect(x1, y1, x2, y2, cut), bottom, top, colors, rim);
  }

  function frontPanel(ctx, x1, x2, y, z1, z2, fill, frame) {
    poly3(ctx, [[x1, y, z1], [x2, y, z1], [x2, y, z2], [x1, y, z2]], fill, frame);
  }

  function sidePanel(ctx, y1, y2, x, z1, z2, fill, frame) {
    poly3(ctx, [[x, y1, z1], [x, y2, z1], [x, y2, z2], [x, y1, z2]], fill, frame);
  }

  function plate(ctx, accent) {
    const large = cutRect(-32, -27, 32, 27, 7);
    slab(ctx, large, -3, 1.5, ['#35394f', '#282b41', '#1d2035', '#323349']);
    slab(ctx, large, 1.6, 3, [tint(accent, 0.65), tint(accent, 0.55), tint(accent, 0.33), tint(accent, 0.6)]);
    slab(ctx, large, 3.1, 7, [gradient(ctx, -36, -22, 30, 25, '#53556b', '#303449'), '#36384f', '#292d43', '#44475a'], '#66687c');
    const inset = cutRect(-29, -24, 29, 24, 6);
    poly3(ctx, inset.map(([x, y]) => [x, y, 7.1]), '#303448', tint(accent, 0.40), 0.7);
    for (const [x, y] of [[-25, -19], [25, -19], [25, 19], [-25, 19]]) {
      const [sx, sy] = project(x, y, 7.4);
      ellipse(ctx, sx, sy, 1.5, 0.8, '#171b2b', '#76778b', 0.5);
    }
    for (let x = -13; x <= -1; x += 3.2) {
      line3(ctx, [[x, 25.6, 7.3], [x + 0.9, 23, 7.3]], tint(accent, 0.62), 0.8);
    }
    line3(ctx, [[11, 27.05, 4.4], [20, 27.05, 4.4]], accent, 1.2);
  }

  const rackMaterials = {
    product: ['#d5c7ff', '#a58fdf', '#7864b3', '#8e79c5', '#453b66'],
    v1: ['#d5caff', '#a697df', '#786db9', '#9181c9', '#443b67'],
    v2: ['#f2caf2', '#cc95d2', '#996da9', '#b981c0', '#553d61']
  };

  function rack(ctx, role, node, lamp) {
    const [lid, face, side, bevel, dark] = rackMaterials[role] || rackMaterials.product;
    box(ctx, -20, -15, 20, 16, 7.5, 12, [bevel, dark, '#373348'], 2);
    for (let index = 0; index < 3; index++) {
      const z = 12 + index * 14.8;
      box(ctx, -19.5, -15, 20, 16, z, z + 2.2, ['#6d618c', '#3c354f', '#353045'], 2);
      box(ctx, -21, -16.5, 21, 17.5, z + 2, z + 13.3, [lid, face, side, bevel], 2.2, tint(lid, 0.7));
      frontPanel(ctx, -16.6, 16.9, 17.65, z + 4.2, z + 10.9, dark, '#766b94');
      frontPanel(ctx, -13.4, 3.5, 17.78, z + 6, z + 9, '#2a263d');
      line3(ctx, [[-13, 17.9, z + 9.1], [3.4, 17.9, z + 9.1]], '#897da4', 0.65);
      for (let x = -11.8; x < 3; x += 2.8) {
        line3(ctx, [[x, 18, z + 6.2], [x + 0.75, 18, z + 8.6]], '#8a7d9e', 0.65);
      }
      for (const x of [8.2, 11.8]) {
        const [sx, sy] = project(x, 18, z + 7.5);
        ellipse(ctx, sx, sy, 1.05, 0.8, x < 10 ? lamp : '#b4a6db');
      }
      line3(ctx, [[16.3, 17.7, z + 5], [16.3, 17.7, z + 10.5]], lid, 1);
      for (let y = -11; y <= 10; y += 3.5) {
        line3(ctx, [[21.1, y, z + 5], [21.1, y, z + 9.5]], dark, 1.05);
      }
    }
    box(ctx, -21.4, -16.8, 21.5, 18, 55.5, 59.5, [lid, face, bevel, face], 3, '#e7dcff');
    const roof = cutRect(-16, -12, 16, 12, 2.4);
    poly3(ctx, roof.map(([x, y]) => [x, y, 59.7]), '#b7a5d7', '#e1d3f6', 0.7);
    for (let x = -10; x <= 5; x += 3.4) {
      line3(ctx, [[x, -6.5, 60], [x, 6.5, 60]], '#75678e', 1.25);
      line3(ctx, [[x + 0.9, -6.5, 60], [x + 0.9, 6.5, 60]], '#dbcaee', 0.6);
    }
    const [lx, ly] = project(10, 3, 60);
    ellipse(ctx, lx, ly, 3, 1.45, '#554d6c', '#e7d9fa', 0.55);
    ellipse(ctx, lx, ly, 1.6, 0.8, lamp);
  }

  // A solid arch with an open centre. The front and rear profiles are joined in depth.
  function gateway(ctx, lamp) {
    box(ctx, -27, -13, 27, 14, 7.4, 9.6, ['#674e50', '#534147', '#473c45'], 3);
    for (const y of [-11, -2, 7, 16]) {
      line3(ctx, [[-3.4, y - 1, 9.8], [0, y + 1.5, 9.8], [3.4, y - 1, 9.8]], '#e6af91', 0.92);
    }
    for (const x of [-22, 22]) {
      box(ctx, x - 5.7, -8.3, x + 5.7, 9.3, 9, 13, ['#c59283', '#9a716c', '#795657'], 1.6);
    }
    const profile = [[-28, 12], [-28, 46], [-27, 51], [-24, 56], [-19.5, 60], [-14, 62],
      [14, 62], [19.5, 60], [24, 56], [27, 51], [28, 46], [28, 12], [17.8, 12],
      [17.8, 44], [17.2, 47], [15.3, 50], [12.3, 51.7], [-12.3, 51.7], [-15.3, 50],
      [-17.2, 47], [-17.8, 44], [-17.8, 12]];
    const profileAt = (y) => profile.map(([x, z]) => project(x, y, z));
    const front = 7.8, rear = -7.8;
    polygon(ctx, profileAt(rear), '#995951', '#bc7265');
    profile.forEach(([x1, z1], i) => {
      const [x2, z2] = profile[(i + 1) % profile.length];
      const nx = z1 - z2;
      const nz = x2 - x1;
      if (nx + 0.82 * nz <= 0) return;
      const strength = nz / (Math.abs(nz) + Math.abs(nx) || 1);
      let fill = '#c16b59';
      if (i >= 12) fill = strength < 0 ? '#78474a' : '#a1645b';
      else if (strength > 0.74) fill = '#ffd0aa';
      else if (strength > 0.37) fill = '#f8b38e';
      else if (strength > 0) fill = '#e89576';
      poly3(ctx, [[x1, rear, z1], [x2, rear, z2], [x2, front, z2], [x1, front, z1]], fill, fill, 0.65);
    });
    polygon(ctx, profileAt(front), gradient(ctx, -35, -52, 18, -12, '#ffb69b', '#ed8069'), '#ffc4a8', 0.85);
    const inside = [[-20.2, 16], [-20.2, 44], [-19.5, 48.3], [-17.3, 51.8], [-13.1, 54.2],
      [13.1, 54.2], [17.3, 51.8], [19.5, 48.3], [20.2, 44], [20.2, 16]];
    stroke(ctx, inside.map(([x, z]) => project(x, front + 0.1, z)), '#985c50', 1.65);
    stroke(ctx, inside.map(([x, z]) => project(x, front + 0.2, z + 0.55)), '#ffebca', 0.78);
    for (const x of [-23.3, 23.3]) {
      frontPanel(ctx, x - 1.8, x + 1.8, front + 0.2, 18, 24.7, '#844d49', '#ffbca5');
      line3(ctx, [[x, front + 0.3, 19.2], [x, front + 0.3, 23.5]], lamp, 1.15);
    }
    for (let x = -8; x <= 8; x += 4) {
      line3(ctx, [[x, -4.4, 62.2], [x, -0.1, 62.2]], '#c88b73', 1.1);
    }
    sidePanel(ctx, -4, 4.1, 28.15, 15.8, 26.9, '#9c645a', '#d99a80');
    for (const z of [18.4, 21.0, 23.6]) {
      line3(ctx, [[28.3, -1.8, z], [28.3, 2.3, z]], '#d49e87', 0.8);
    }
  }

  function terminal(ctx, lamp) {
    box(ctx, -12, -10, 12, 5, 7.4, 10.4, ['#8abeb8', '#567e7d', '#496e72'], 2.4);
    box(ctx, -4, -7, 4, 0, 10, 24, ['#b2ded0', '#89b6ad', '#537e7b'], 1.4);
    const shell = [[-23.8, 22], [-23.8, 47.5], [-21, 50], [21, 50], [23.8, 47.5],
      [23.8, 22], [21, 19.5], [-21, 19.5]];
    const display = (x, z, depth = 0) => project(x, -1 - (z - 20) * 0.15 + depth, z);
    const outline = (points, d) => points.map(([x, z]) => display(x, z, d));
    polygon(ctx, outline(shell, -4), '#579c94', '#9adac9');
    shell.forEach(([x1, z1], i) => {
      const [x2, z2] = shell[(i + 1) % shell.length];
      const fill = z2 >= z1 && x2 > x1 ? '#d4fae9' : '#8dcdbb';
      polygon(ctx, [display(x1, z1, -4), display(x2, z2, -4), display(x2, z2), display(x1, z1)], fill, fill, 0.55);
    });
    polygon(ctx, outline(shell, 0), '#a2e6cb', '#d4f7e7', 1);
    const glass = [[-20.6, 24], [-20.6, 45], [-19.3, 46.7], [19.3, 46.7],
      [20.6, 45], [20.6, 24], [19, 22.5], [-19, 22.5]];
    polygon(ctx, outline(glass, 0.2), gradient(ctx, -16, -54, 15, -12, '#163c42', '#28665f'), '#547b75', 0.8);
    polygon(ctx, outline([[-20, 44], [-20, 46], [1, 46], [-18, 25], [-20, 25]], 0.25), '#ffffff0d');
    const bag = [[-14, 27], [-13, 36], [-2.5, 36], [-1.5, 27]];
    polygon(ctx, outline(bag, 0.4), '#70dcb8', '#aff8d5', 0.7);
    stroke(ctx, outline([[-11, 35.7], [-11, 38], [-10, 40], [-8, 40.8], [-6, 40], [-5.5, 38], [-5.5, 35.7]], 0.45), '#a3f5cf', 1.1);
    for (const [z, xEnd] of [[38.9, 14], [35.3, 11], [30.4, 14]]) {
      stroke(ctx, outline([[3, z], [xEnd, z]], 0.4), z < 31 ? '#91dcbf' : '#589b92', z < 31 ? 1.65 : 1);
    }
    const [lx, ly] = display(15, 21, 0.4);
    ellipse(ctx, lx, ly, 1, 0.6, lamp);
    box(ctx, -19, 7, 13, 20, 7.3, 9.8, ['#a6ccbe', '#70988f', '#61877e'], 1.9, '#b6e1cf');
    for (let y = 10; y <= 16; y += 2.9) {
      for (let x = -15; x <= 8; x += 4.1) {
        line3(ctx, [[x, y, 10], [x + 2.55, y, 10]], '#496f6d', 0.92);
      }
    }
    line3(ctx, [[-8, 18.2, 10], [3, 18.2, 10]], '#668a7e', 1);
    box(ctx, 17, 8, 23, 16, 7.3, 10.8, ['#c3ded0', '#87a99e', '#77988e'], 2.2);
  }

  function drum(ctx, x, y, z, radius, height, cap, left, right, rim) {
    const [cx, cy] = project(x, y, z);
    const rx = radius * 1.26;
    const ry = rx * slope;
    const skin = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy);
    skin.addColorStop(0, right);
    skin.addColorStop(0.24, left);
    skin.addColorStop(0.6, left);
    skin.addColorStop(1, right);
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy - height);
    ctx.lineTo(cx - rx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(cx + rx, cy - height);
    ctx.closePath();
    ctx.fillStyle = skin;
    ctx.fill();
    ellipse(ctx, cx, cy - height, rx, ry, cap, rim, 0.85);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0.08, Math.PI - 0.08);
    ctx.strokeStyle = right;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  function registry(ctx, lamp) {
    drum(ctx, 0, 0, 7.5, 19, 4, '#747d9d', '#555f7c', '#394158', '#9da4c5');
    for (let index = 0; index < 3; index++) {
      const z = 12.2 + 11.6 * index;
      drum(ctx, 0, 0, z, 18.6, 3.2, '#6b7399', '#545d80', '#444c67', '#8993b6');
      drum(ctx, 0, 0, z + 2.7, 20.1, 8.2, '#c5d2f7', '#9aa9d3', '#626f97', '#e0e8ff');
      const y = -z - 2.5;
      for (const sx of [-10, -6, -2]) ellipse(ctx, sx, y + 7, 1.1, 0.8, sx < -8 ? lamp : '#6d7899');
      stroke(ctx, [[6, y + 6.1], [11, y + 5.2]], '#566380', 0.9);
    }
    const top = 46.3;
    ellipse(ctx, 0, -top, 19.7, 9, '#a8b7df', '#e1e8ff', 0.8);
    ellipse(ctx, 0, -top, 15, 6.9, '#abbbe6', '#7788b3', 0.75);
    const hubs = [[-7, -3], [0.5, 6.3], [7.2, -4.5]];
    line3(ctx, [hubs[0], hubs[1], hubs[2]].map(([x, y]) => [x, y, top + 0.6]), '#53648b', 1.5);
    for (const [x, y] of hubs) {
      const [sx, sy] = project(x, y, top + 0.7);
      ellipse(ctx, sx, sy, 2.5, 1.3, '#d1dff5', '#677ba5', 0.7);
    }
  }

  function consoleUnit(ctx, role, lamp) {
    const isConfig = role === 'config';
    box(ctx, -18, -15, 18, 15, 7.5, 12.5, ['#717c97', '#55617c', '#45536c'], 3);
    box(ctx, -19.5, -16.5, 19.5, 16.5, 12.3, 27, ['#a0aed1', '#8897b5', '#616e92'], 3, '#c0c9e6');
    frontPanel(ctx, -13.5, 4.5, 16.6, 17, 22.6, '#37435e', '#60708b');
    for (let x = -11.4; x <= 2; x += 3.1) {
      line3(ctx, [[x, 16.9, 18.7], [x, 16.9, 20.9]], '#8391ab', 0.75);
    }
    const [lx, ly] = project(11.5, 16.7, 20);
    ellipse(ctx, lx, ly, 1.4, 1, lamp);
    box(ctx, -20, -16.8, 20, 17.1, 26, 29, ['#bfcced', '#8997bc', '#7787aa'], 3, '#d7e0ff');
    if (isConfig) {
      // A tangible control desk: three tracks with independent physical faders.
      box(ctx, -16, -12.4, 16, 12.3, 29.2, 31, ['#697c9e', '#55627d', '#454f68'], 1.5, '#9fafd1');
      for (const [x, y] of [[-9, -3.5], [0, 3.7], [9, -1]]) {
        line3(ctx, [[x, -9, 31.3], [x, 9, 31.3]], '#2e3e59', 2.4);
        line3(ctx, [[x - 1.4, -9, 31.4], [x - 1.4, 9, 31.4]], '#9bb2d6', 0.65);
        box(ctx, x - 2.7, y - 2.2, x + 2.7, y + 2.2, 31.1, 34.3, ['#cbdff2', '#a1bbd4', '#8ca0c4'], 0.65);
      }
    } else {
      const tiers = [[-10, 10], [-2.5, 17], [5, 24]];
      for (const [x, h] of tiers) {
        box(ctx, x, -3.7, x + 5.1, 4, 29.2, 29.2 + h, ['#d0d7ff', '#acb9f0', '#8295cc'], 0.65, '#dbe0ff');
      }
      line3(ctx, [[-13, 8, 29.6], [13, 8, 29.6]], '#8797bc', 1.15);
    }
  }

  function parcel(ctx, x, y, z, w, d, height, mint) {
    const colors = mint ? ['#cae5cc', '#8abbac', '#6a9e94', '#98b9a6'] :
      ['#edcfad', '#d3ab91', '#ae8c7d', '#c6a387'];
    const left = x - w / 2;
    const far = y - d / 2;
    const right = x + w / 2;
    const near = y + d / 2;
    box(ctx, left, far, right, near, z, z + height, colors, 0.85, colors[0]);
    poly3(ctx, [[x - 2.3, far, z + height + 0.1], [x + 2.3, far, z + height + 0.1],
      [x + 2.3, near, z + height + 0.1], [x - 2.3, near, z + height + 0.1]], mint ? '#8fbaa2' : '#d6ac82');
    frontPanel(ctx, x - 2.3, x + 2.3, near + 0.05, z + height * 0.55, z + height, mint ? '#74a392' : '#b99175');
    frontPanel(ctx, left + 2.4, left + Math.min(7.8, w * 0.42), near + 0.07, z + 2.1, z + 6.2, '#eadfcb');
    for (let k = 3.2; k < 6.9; k += 1.15) line3(ctx, [[left + k, near + 0.1, z + 3], [left + k, near + 0.1, z + 5.2]], '#6e7974', 0.48);
  }

  function fulfillment(ctx, role) {
    if (role === 'inventory') {
      box(ctx, -21.5, -17.3, 21.5, 17.3, 7.2, 11.8, ['#86a89c', '#5e827a', '#4e706b'], 2.6);
      parcel(ctx, -8, -6.8, 12, 19, 17, 15, true);
      parcel(ctx, 10.2, -4, 12, 15.6, 22.2, 15, true);
      parcel(ctx, -7.8, 9, 12, 18.8, 11.8, 13, true);
      parcel(ctx, -2, -5, 27.2, 19, 13, 14.5, true);
    } else {
      box(ctx, -23, -15, 23, 15, 7.5, 12.5, ['#a4bcca', '#748e9d', '#586d80'], 2.8, '#bdcfdd');
      box(ctx, -20, -12.4, 20, 12.4, 12.4, 14.9, ['#536476', '#455462', '#3a4556'], 2);
      for (let x = -15; x <= 16; x += 5.3) line3(ctx, [[x, -10, 15.2], [x, 10, 15.2]], '#9eafba', 1.25);
      parcel(ctx, 0, -1, 15.5, 26.2, 21, 20, false);
    }
  }

  function review(ctx, lamp) {
    box(ctx, -17, -13, 17, 13, 7.4, 14, ['#b8a6c1', '#907d9a', '#75687f'], 2.5);
    box(ctx, -9, -5, 9, 5, 14, 23, ['#cab5cd', '#9d89a5', '#86718d'], 1.3);
    const bubble = [[-20, 28], [-20, 44], [-17.2, 47.8], [16.5, 47.8], [20, 44],
      [20, 28], [16.5, 24.5], [0, 24.5], [-8, 18], [-8, 24.5], [-17, 24.5]];
    polygon(ctx, bubble.map(([x, z]) => project(x, -5, z)), '#a77fbb', '#ddc1e3');
    for (let i = 0; i < bubble.length; i++) {
      const [x, z] = bubble[i];
      const [x2, z2] = bubble[(i + 1) % bubble.length];
      poly3(ctx, [[x, -5, z], [x2, -5, z2], [x2, 1, z2], [x, 1, z]], z > 44 ? '#eed2e9' : '#b797bf');
    }
    polygon(ctx, bubble.map(([x, z]) => project(x, 1, z)), '#dec0db', '#f4dbee');
    frontPanel(ctx, -15, 15, 1.15, 28.5, 42, '#78617e', '#b795b4');
    for (const x of [-8, 0, 8]) {
      const [sx, sy] = project(x, 1.3, 35.5);
      ellipse(ctx, sx, sy, 1.8, 1.55, x < 0 ? lamp : '#e1c3d5');
    }
  }

  function sidecar(ctx, lamp) {
    box(ctx, -22, -12, 22, 12, 7.4, 11.5, ['#7da0a9', '#587883', '#4c6578'], 3);
    for (const x of [-10.5, 9.5]) {
      box(ctx, x - 7.7, -9, x + 7.7, 9, 11.3, 34, ['#c1e2df', '#9ccbc5', '#709ca4'], 2.4, '#d3f4ec');
      box(ctx, x - 7.9, -9.2, x + 7.9, 9.2, 33, 36.3, ['#bfe8df', '#91bebb', '#789da7'], 2.3);
      frontPanel(ctx, x - 4.5, x + 4.5, 9.15, 18, 29, '#536e79');
      for (let z = 21; z <= 27; z += 3) line3(ctx, [[x - 2.6, 9.4, z], [x + 2.6, 9.4, z]], z > 25 ? lamp : '#9cb7c2', 1);
    }
    line3(ctx, [[-8, -10, 26], [-8, -14, 26], [8, -14, 26], [8, -10, 26]], '#a2cfce', 1.5);
  }

  function reject(ctx, lamp) {
    for (const x of [-17.5, 17.5]) {
      box(ctx, x - 3.7, -2.5, x + 3.7, 4.8, 7.3, 11, ['#a38e8a', '#7c6869', '#67575c'], 1.1);
      box(ctx, x - 2.6, -1.3, x + 2.6, 3.7, 10.8, 29, ['#c8a7a1', '#a58d86', '#77666b'], 0.8);
    }
    box(ctx, -21.5, -3, 21.5, 4.4, 22, 30, ['#efb29b', '#bd8271', '#9a6d66'], 1.3, '#eab8a7');
    for (const x of [-15.6, -4, 7.6]) {
      poly3(ctx, [[x - 2, 4.53, 22.8], [x + 2.8, 4.53, 22.8],
        [x + 6.5, 4.53, 29], [x + 1.7, 4.53, 29]], '#6b575a');
    }
    const shield = [[-8, 32], [-12, 36], [-12, 47], [-7, 52], [7, 52],
      [12, 47], [12, 36], [8, 32]];
    box(ctx, -2, -2.2, 2, 2, 27.5, 37, ['#c6aaa0', '#957f7b', '#755f63'], 0.5);
    polygon(ctx, shield.map(([x, z]) => project(x, -2, z)), '#b76e68', '#ffc4ad');
    for (let i = 0; i < shield.length; i++) {
      const [x, z] = shield[i];
      const [x2, z2] = shield[(i + 1) % shield.length];
      poly3(ctx, [[x, -2, z], [x2, -2, z2], [x2, 1.5, z2], [x, 1.5, z]], z > 47 ? '#ffc4ad' : '#c68578');
    }
    polygon(ctx, shield.map(([x, z]) => project(x, 1.5, z)), '#e89583', '#ffccb2', 0.8);
    const inner = shield.map(([x, z]) => project(x * 0.78, 1.6, 42 + (z - 42) * 0.79));
    polygon(ctx, inner, '#965a59', '#d9887a', 0.65);
    line3(ctx, [[-4.2, 1.8, 37.8], [4.2, 1.8, 46.2]], '#ffe4d3', 2);
    line3(ctx, [[-4.2, 1.8, 46.2], [4.2, 1.8, 37.8]], '#ffe4d3', 2);
    const [x, y] = project(-16, 4.7, 26);
    ellipse(ctx, x, y, 1.1, 0.82, lamp);
  }

  function machine(ctx, item) {
    const {node, x, y, size} = item;
    const role = node.role;
    const status = node.status || 'up';
    const color = palette[role] || palette.product;
    const lamp = statusTones[status] || statusTones.up;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    plate(ctx, color);
    glow(ctx, 1, -4, 36, 13, '#131522', 0.58);
    if (role === 'client') terminal(ctx, lamp);
    else if (role === 'gateway') gateway(ctx, lamp);
    else if (role === 'registry') registry(ctx, lamp);
    else if (role === 'control' || role === 'config') consoleUnit(ctx, role, lamp);
    else if (role === 'order' || role === 'inventory') fulfillment(ctx, role);
    else if (role === 'review') review(ctx, lamp);
    else if (role === 'reject') reject(ctx, lamp);
    else if (role === 'sidecar') sidecar(ctx, lamp);
    else rack(ctx, role, node, lamp);
    if ((status === 'down' && role !== 'reject') || status === 'pending' || status === 'slow') {
      const [px, py] = project(23, 7, 10);
      ellipse(ctx, px, py, 5.6, 5.6, '#262737', lamp, 1);
      if (status === 'down') {
        stroke(ctx, [[px - 2.1, py - 2.1], [px + 2.1, py + 2.1]], lamp, 1.2);
        stroke(ctx, [[px + 2.1, py - 2.1], [px - 2.1, py + 2.1]], lamp, 1.2);
      } else {
        stroke(ctx, [[px, py - 2.8], [px, py], [px + 2.2, py + 1.2]], lamp, 1.2);
      }
    }
    ctx.restore();
  }

  function arrange(nodes, scene, width, height) {
    const mobile = width < 580 || width / height < 1.45;
    const count = nodes.length;
    const crowded = count > 8;
    const dense = count > 10;
    const density = dense ? (mobile ? 0.69 : 0.78) : crowded ? 0.85 : 1;
    const base = (mobile ? Math.min(width / 465, height / 295, 1.03) :
      Math.min(width / 740, height / 312, 1.48)) * density;
    const unit = Math.max(0.17, base);
    const primary = mobile ? clamp(width / 33, 9, 12.2) : clamp(13.1 * Math.min(1.08, unit + 0.1), 10, 15);
    const secondary = mobile ? clamp(primary - 1.2, 8.2, 10.7) : primary - 1.5;
    const showSubs = !(mobile && crowded) && !(dense && height < 410);
    const edgeX = Math.min(width * 0.135, Math.max(47 * unit + 2, primary * 2.45));
    const upper = 70 * unit + 3;
    const lower = height - 24 * unit - primary * 0.76 - (showSubs ? secondary + 6 : 3);
    const placements = new Map();
    const products = nodes.filter(node => node.role === 'product');
    const find = (role) => nodes.find(node => node.role === role);
    function at(node, nx, ny) {
      if (!node || placements.has(node.id)) return;
      const size = node.role === 'gateway' ? unit * 1.065 : unit;
      placements.set(node.id, {
        node, x: mix(edgeX, width - edgeX, nx), y: mix(upper, Math.max(upper + 1, lower), ny), size,
        primary, secondary, showSubs, mobile, crowded
      });
    }
    const place = (role, nx, ny) => at(find(role), nx, ny);

    function bank(x1, x2, y1, y2, columns) {
      const n = products.length;
      if (!n) return;
      if (n === 1) { at(products[0], mix(x1, x2, 0.62), mix(y1, y2, 0.4)); return; }
      if (n === 2) {
        at(products[0], mix(x1, x2, 0.16), y1);
        at(products[1], x2, y2);
        return;
      }
      if (n === 3) {
        at(products[0], x1, y1);
        at(products[1], x2, mix(y1, y2, 0.44));
        at(products[2], mix(x1, x2, 0.18), y2);
        return;
      }
      const rows = Math.ceil(n / columns);
      const stair = mobile && rows > 2 ? 0.022 : 0.066;
      products.forEach((node, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const across = col / (columns - 1);
        const down = row / Math.max(1, rows - 1);
        at(node, mix(x1, x2, across) + (row % 2 ? 0.015 : 0), mix(y1, y2 - stair, down) + stair * across);
      });
    }

    const many = products.length >= 4;
    if (scene === 'gateway') {
      if (many) {
        place('client', 0.025, 0.54); place('gateway', 0.29, 0.44);
        place('reject', 0.29, 0.98); place('order', 0.10, 0.035);
        bank(0.63, 0.94, 0.01, 0.95, 2);
      } else {
        place('client', mobile ? 0.015 : 0.045, mobile ? 0.52 : 0.54);
        place('gateway', mobile ? 0.37 : 0.36, mobile ? 0.32 : 0.37);
        place('reject', mobile ? 0.26 : 0.50, mobile ? 0.91 : 0.92);
        place('order', mobile ? 0.73 : 0.77, 0.94);
        bank(mobile ? 0.77 : 0.69, mobile ? 0.955 : 0.94, 0.025, 0.53, 2);
      }
    } else if (scene === 'registry' || scene === 'scale') {
      place('client', mobile ? 0.015 : 0.04, 0.68);
      place('gateway', many ? 0.26 : 0.36, 0.52);
      place('registry', many ? 0.28 : 0.43, 0.04);
      place('control', many ? 0.25 : 0.42, 0.025);
      bank(many ? 0.61 : 0.70, 0.94, many ? 0.02 : 0.20, 0.90, 2);
    } else if (scene === 'resilience') {
      const basicChain = !find('config') && !find('inventory') && products.length <= 1;
      if (basicChain) {
        place('client', 0.025, 0.68); place('gateway', 0.33, 0.45);
        at(products[0], 0.62, 0.25); place('review', 0.94, 0.61);
      } else {
        place('client', mobile ? 0.003 : 0.015, many || mobile ? 0.76 : 0.67);
        place('gateway', mobile ? (many ? 0.17 : 0.28) : 0.245, many ? 0.44 : (mobile ? 0.51 : 0.48));
        place('config', many ? 0.18 : (mobile ? 0.13 : 0.385), 0.012);
        if (many) {
          const columns = products.length > 6 && !mobile ? 3 : 2;
          bank(columns === 3 ? 0.40 : 0.445, mobile ? 0.706 : 0.725, 0.018, 0.985, columns);
        } else {
          bank(mobile ? 0.55 : 0.54, 0.637, mobile ? 0.28 : 0.37, 0.955, 2);
        }
        place('inventory', mobile ? 0.963 : 0.91, 0.23);
        place('review', 0.985, 0.77);
      }
    } else if (scene === 'mesh') {
      const proxy = find('sidecar');
      place('client', 0.022, 0.69);
      place('gateway', proxy ? 0.265 : 0.34, 0.53);
      place('sidecar', 0.55, 0.59);
      place('control', proxy ? 0.46 : 0.48, 0.04);
      place('config', proxy ? 0.46 : 0.48, 0.04);
      place('v1', 0.805, 0.235); place('v2', 0.955, 0.805);
    }
    const remaining = nodes.filter(node => !placements.has(node.id));
    if (placements.size === 0) {
      const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count * width / height))));
      const rows = Math.ceil(count / cols);
      remaining.forEach((node, index) => {
        const nx = cols > 1 ? (index % cols) / (cols - 1) : 0.5;
        const ny = rows > 1 ? Math.floor(index / cols) / (rows - 1) : 0.5 - 0.14 * Math.sin(nx * Math.PI);
        at(node, nx, ny);
      });
    } else {
      // Unknown extensions occupy the roomiest unused position on the board.
      for (const node of remaining) {
        let best = [0.5, 0.5, -1];
        for (const nx of [0.05, 0.27, 0.5, 0.73, 0.95]) {
          for (const ny of [0.05, 0.48, 0.95]) {
            const x = mix(edgeX, width - edgeX, nx);
            const y = mix(upper, lower, ny);
            const clearance = Math.min(...Array.from(placements.values(), p => Math.hypot(x - p.x, (y - p.y) * 1.15)));
            if (clearance > best[2]) best = [nx, ny, clearance];
          }
        }
        at(node, best[0], best[1]);
      }
    }
    return {items: Array.from(placements.values()), byId: placements, unit, mobile, width, height};
  }

  function drawFloor(ctx, width, height, unit) {
    ctx.fillStyle = gradient(ctx, 0, 0, 0, height, '#191b2e', '#161829');
    ctx.fillRect(0, 0, width, height);
    glow(ctx, width * 0.52, height * 0.50, width * 0.62, height * 0.85, '#4f4b78', 0.38);
    glow(ctx, width * 0.32, height * 0.65, width * 0.41, height * 0.74, '#303b59', 0.17);
    const grid = ctx.createLinearGradient(0, 0, 0, height);
    grid.addColorStop(0, '#8481ad02');
    grid.addColorStop(0.16, '#8481ad13');
    grid.addColorStop(0.48, '#9692bf25');
    grid.addColorStop(0.78, '#8b88af1c');
    grid.addColorStop(1, '#8481ad02');
    const step = clamp(27 * unit, 16, 38);
    for (const direction of [-1, 1]) {
      const drift = direction * slope * width;
      ctx.beginPath();
      for (let y = -Math.abs(drift) - step; y < height + Math.abs(drift) + step; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y + drift);
      }
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = grid;
      ctx.stroke();
    }
    // Engraved alignment marks sit in the floor and have no connection to the graph.
    const marks = [[0.08, 0.23], [0.17, 0.86], [0.33, 0.12], [0.56, 0.66], [0.73, 0.86], [0.94, 0.17]];
    for (const [nx, ny] of marks) {
      const x = width * nx, y = height * ny, r = 3.1 * Math.min(unit, 1);
      stroke(ctx, [[x - r, y - r * slope], [x + r, y + r * slope]], '#9a9ab233', 0.7);
      stroke(ctx, [[x - r, y + r * slope], [x + r, y - r * slope]], '#9a9ab233', 0.7);
    }
  }

  function shadeGround(ctx, item) {
    const {node, x, y, size} = item;
    const color = palette[node.role] || palette.product;
    const muted = ['down', 'pending', 'muted'].includes(node.status);
    glow(ctx, x + 5 * size, y + 6 * size, 58 * size, 21 * size, '#050616', 0.92);
    glow(ctx, x + 11 * size, y + 5.8 * size, 54 * size, 20 * size, '#08091a', 0.65);
    glow(ctx, x - 2 * size, y + 2.8 * size, 65 * size, 27 * size, color, muted && node.role !== 'reject' ? 0.07 : 0.24);
  }

  function diameter(role) {
    if (role === 'order' || role === 'inventory') return 44;
    if (role === 'config' || role === 'sidecar') return 46;
    if (role === 'registry') return 59;
    return role === 'gateway' || role === 'product' || role === 'v1' || role === 'v2' ? 73 : 64;
  }

  function rectOverlap(a, b) {
    return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  }

  function fitText(ctx, text, limit) {
    const str = String(text == null ? '' : text);
    if (ctx.measureText(str).width <= limit) return str;
    const chars = Array.from(str);
    while (chars.length && ctx.measureText(chars.join('') + '…').width > limit) chars.pop();
    return chars.join('') + '…';
  }

  function labelNodes(ctx, geometry) {
    const {items, width, height} = geometry;
    const used = [];
    const bodies = items.map(item => {
      const z = diameter(item.node.role) * item.size;
      return {x: item.x - 43 * item.size, y: item.y - z, w: 86 * item.size, h: z + 17 * item.size};
    });
    for (const item of items) {
      const {node, size, mobile, primary, secondary, crowded} = item;
      let title = node.label || node.id;
      let sub = node.sub || '';
      if (mobile) {
        if (title === '商城客户端') title = '客户端';
        if (title === 'API 网关' && crowded) title = '网关';
        if (node.role === 'control' && String(title).startsWith('HPA')) title = 'HPA';
        sub = String(sub).replace(/请求\s*\/\s*秒/g, '次/秒');
      }
      if (!item.showSubs && node.role === 'product') {
        const version = String(sub).match(/^v\d+/);
        if (version) title = (mobile ? title.replace(/^商品\s+/, '商品') : title) + '·' + version[0];
      }
      const bodyFont = '620 ' + primary + 'px ' + fontFamily;
      const subFont = '450 ' + secondary + 'px ' + fontFamily;
      const limit = mobile ? (crowded ? Math.max(43, width / 5.7) : Math.max(59, width / 4.15)) : Math.min(167, width / (crowded ? 6.8 : 4.8));
      ctx.font = bodyFont;
      title = fitText(ctx, title, limit - 8);
      const dotWidth = mobile && crowded ? 6 : 9;
      const titleWidth = dotWidth + ctx.measureText(title).width;
      ctx.font = subFont;
      sub = item.showSubs && sub ? fitText(ctx, sub, limit) : '';
      const subWidth = sub ? ctx.measureText(sub).width : 0;
      const groupWidth = Math.max(titleWidth, subWidth);
      const lineGap = mobile ? 2 : 3;
      const bodyH = primary + (sub ? lineGap + secondary : 0);
      const y0 = item.y + 21.8 * size + (mobile ? 1.5 : 3);
      const xs = [0, -groupWidth * 0.27, groupWidth * 0.27, -groupWidth * 0.58, groupWidth * 0.58];
      let place = null;
      for (const dy of [0, -3 * size, 4 * size, 9 * size]) {
        for (const dx of xs) {
          const x = clamp(item.x + dx, groupWidth / 2 + 3, width - groupWidth / 2 - 3);
          const y = clamp(y0 + dy, 1, Math.max(1, height - bodyH - 2));
          const rect = {x: x - groupWidth / 2 - 1, y, w: groupWidth + 2, h: bodyH};
          const overlap = bodies.reduce((sum, body, i) => sum + (items[i] === item ? 0 : rectOverlap(rect, body)), 0);
          const collision = used.reduce((sum, other) => sum + rectOverlap(rect, other), 0);
          const score = 4 * overlap + 15 * collision + Math.abs(dx) * 0.6 + Math.abs(dy);
          if (!place || score < place.score) place = {x, y, rect, score};
        }
      }
      used.push(place.rect);
      const centerY = place.y + primary * 0.54;
      const left = place.x - titleWidth / 2;
      const tone = statusTones[node.status] || statusTones.up;
      ctx.save();
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#111321';
      ctx.shadowBlur = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1b1d30d9';
      ctx.lineWidth = mobile ? 2 : 3;
      ctx.font = bodyFont;
      ctx.textAlign = 'left';
      ctx.strokeText(title, left + dotWidth, centerY);
      ctx.fillStyle = (node.status === 'down' && node.role !== 'reject') || node.status === 'muted' ? '#c2c0d2' : '#f1eefb';
      ctx.fillText(title, left + dotWidth, centerY);
      ctx.shadowBlur = 0;
      const dotX = left + (mobile && crowded ? 1.7 : 2.25);
      if (node.status === 'down') {
        stroke(ctx, [[dotX - 1.7, centerY - 1.7], [dotX + 1.7, centerY + 1.7]], tone, 1.35);
        stroke(ctx, [[dotX - 1.7, centerY + 1.7], [dotX + 1.7, centerY - 1.7]], tone, 1.35);
      } else {
        ellipse(ctx, dotX, centerY, mobile && crowded ? 1.55 : 2.05, mobile && crowded ? 1.55 : 2.05, tone);
      }
      if (sub) {
        ctx.textAlign = 'center';
        ctx.font = subFont;
        const sy = place.y + primary + lineGap + secondary * 0.55;
        ctx.strokeStyle = '#1b1d30d9';
        ctx.lineWidth = mobile ? 2 : 3;
        ctx.strokeText(sub, place.x, sy);
        ctx.fillStyle = '#bcb9d0';
        ctx.fillText(sub, place.x, sy);
      }
      ctx.restore();
    }
  }

  const toAxes = ([x, y]) => [(x + y / slope) / 2, (x - y / slope) / 2];
  const fromAxes = ([u, v]) => [u + v, (u - v) * slope];
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function nearestOnSegment(x, y, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return [a[0] + dx * t, a[1] + dy * t];
  }

  function routePoints(start, finish, geometry, kind) {
    const a = [start.x, start.y];
    const b = [finish.x, finish.y];
    const [u1, v1] = toAxes(a), [u2, v2] = toAxes(b);
    const axesPaths = [[[u2, v1]], [[u1, v2]]];
    for (const fraction of [0.24, 0.5, 0.76]) {
      const u = mix(u1, u2, fraction), v = mix(v1, v2, fraction);
      axesPaths.push([[u, v1], [u, v2]], [[u1, v], [u2, v]]);
    }
    const candidates = axesPaths.map(p => [a, ...p.map(fromAxes), b]);
    // A short transverse run also lets a steep branch clear the edge of a narrow screen.
    for (const fraction of [0.28, 0.52, 0.75]) {
      const x = mix(a[0], b[0], fraction);
      candidates.push([a, [x, a[1]], [x + (b[1] - a[1]) * 0.34, b[1]], b]);
    }
    const steep = Math.abs(b[1] - a[1]) > 0.74 * Math.abs(b[0] - a[0]);
    if (steep) {
      const turn = Math.min(27 * geometry.unit, distance(a, b) * 0.16);
      const dy = Math.sign(b[1] - a[1]) * turn * slope;
      for (const sign of [-1, 1]) {
        candidates.push([a, [a[0] + sign * turn, a[1] + dy], [b[0] - sign * turn, b[1] - dy], b]);
      }
    }
    let best;
    const unit = geometry.unit;
    for (const candidate of candidates) {
      const points = candidate.filter((p, i) => !i || distance(p, candidate[i - 1]) > 1);
      if (points.length < 2) continue;
      let cost = points.length * 2.5 * unit;
      for (let i = 1; i < points.length; i++) {
        const prior = points[i - 1], next = points[i];
        cost += distance(prior, next) * 0.13;
        const outside = Math.max(0, 7 - next[0], next[0] - geometry.width + 7, 7 - next[1], next[1] - geometry.height + 7);
        cost += outside * 14;
        for (const item of geometry.items) {
          if (item === start || item === finish) continue;
          const [px, py] = nearestOnSegment(item.x, item.y, prior, next);
          const clearance = Math.hypot(item.x - px, (item.y - py) * 1.8);
          cost += Math.max(0, 52 * item.size - clearance) * 2.8;
        }
      }
      // Isometric runs remain the usual choice. Prefer the upper circuit for control traffic.
      const index = candidates.indexOf(candidate);
      if (index >= axesPaths.length) cost += (steep && index >= axesPaths.length + 3 ? 4 : 13) * unit;
      const reach = points.slice(1, -1).reduce((sum, p) => sum + (p[1] - (a[1] + b[1]) / 2), 0);
      cost += (kind === 'control' ? 0.018 : -0.009) * reach;
      if (!best || cost < best.cost) best = {points, cost};
    }
    return best ? best.points : [a, b];
  }

  function soften(points, radius) {
    const result = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1];
      const before = distance(a, b), after = distance(b, c);
      const r = Math.min(radius, before / 3, after / 3);
      if (r < 0.1) continue;
      const left = [mix(b[0], a[0], r / before), mix(b[1], a[1], r / before)];
      const right = [mix(b[0], c[0], r / after), mix(b[1], c[1], r / after)];
      result.push(left);
      for (const t of [0.25, 0.5, 0.75, 1]) {
        const s = 1 - t;
        result.push([s * s * left[0] + 2 * s * t * b[0] + t * t * right[0],
          s * s * left[1] + 2 * s * t * b[1] + t * t * right[1]]);
      }
    }
    result.push(points[points.length - 1]);
    return result;
  }

  function planEdges(edges, geometry) {
    const routes = [];
    for (const edge of edges) {
      const from = geometry.byId.get(edge.from), to = geometry.byId.get(edge.to);
      if (!from || !to || from === to) continue;
      const kind = edgeTones[edge.kind] ? edge.kind : 'flow';
      const weight = clamp(Number.isFinite(Number(edge.weight)) ? Number(edge.weight) : 0, 0, 1);
      const inactive = status => status === 'down' || (status === 'pending' && kind !== 'control') || status === 'muted';
      const isFailure = kind === 'blocked' && to.node.status === 'down';
      const active = weight > 0 && kind !== 'idle' && !inactive(from.node.status) && (!inactive(to.node.status) || isFailure);
      const points = soften(routePoints(from, to, geometry, kind), 5.5 * geometry.unit);
      const lengths = [0];
      for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
      const length = lengths[lengths.length - 1];
      if (length < 1) continue;
      const seed = hash(edge.from + '/' + edge.to + '/' + kind);
      routes.push({points, lengths, length, weight, kind, active, seed, from, to, isFailure});
    }
    return routes.sort((a, b) => (a.active - b.active) || ((b.kind === 'control') - (a.kind === 'control')));
  }

  function along(route, fraction) {
    const target = clamp(fraction, 0, 1) * route.length;
    let i = 1;
    while (i < route.lengths.length - 1 && route.lengths[i] < target) i++;
    const amount = (target - route.lengths[i - 1]) / (route.lengths[i] - route.lengths[i - 1] || 1);
    const a = route.points[i - 1], b = route.points[i];
    return [mix(a[0], b[0], amount), mix(a[1], b[1], amount)];
  }

  function endPort(route) {
    const {to} = route;
    for (let t = 0.99; t >= 0.35; t -= 0.014) {
      const [x, y] = along(route, t);
      // Slightly outside the physical node's diamond-shaped footprint.
      if (Math.abs(x - to.x) / (53 * to.size) + Math.abs(y - to.y) / (27 * to.size) > 1.13) return t;
    }
    return 0.68;
  }

  function drawRoutes(ctx, routes, unit) {
    ctx.save();
    const u = clamp(unit, 0.65, 1.4);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const route of routes) {
      const {points, kind, active, weight} = route;
      const color = edgeTones[kind];
      const control = kind === 'control';
      ctx.setLineDash([]);
      stroke(ctx, points, active ? '#141625c9' : '#212338', (control ? 2.8 : 4.5 + weight) * u);
      if (active && !control) {
        stroke(ctx, points, tint(color, 0.095 + 0.055 * weight), (5.3 + 2.8 * weight) * u);
        stroke(ctx, points, tint(color, 0.22 + 0.065 * weight), (2.55 + 1.3 * weight) * u);
      }
      if (control || !active) ctx.setLineDash((control ? [3.1, 4.1] : [2.2, 4.4]).map(d => d * u));
      stroke(ctx, points, tint(active || control || kind === 'blocked' ? color : edgeTones.idle,
        active ? (control ? 0.8 : 0.84 + 0.14 * weight) : (kind === 'blocked' ? 0.64 : 0.49)),
        (active ? (control ? 1.1 : 0.9 + weight * 0.66) : 0.8) * u);
      ctx.setLineDash([]);
      route.port = endPort(route);
      if ((!active && kind !== 'blocked') || control) continue;
      if (kind === 'blocked') {
        const [x, y] = along(route, route.port);
        const r = 3.45 * u;
        ellipse(ctx, x, y, 4.75 * u, 4.75 * u, '#332832', tint(color, 0.83), 0.75 * u);
        stroke(ctx, [[x - r / 2, y - r / 2], [x + r / 2, y + r / 2]], '#ffd5ba', 1.05 * u);
        stroke(ctx, [[x - r / 2, y + r / 2], [x + r / 2, y - r / 2]], '#ffd5ba', 1.05 * u);
      } else if (route.length > 136 * u) {
        const t = 0.46 + route.seed * 0.13;
        const [x, y] = along(route, t);
        const [nx, ny] = along(route, t + 0.01);
        const angle = Math.atan2(ny - y, nx - x);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        stroke(ctx, [[-2.2 * u, -2.2 * u], [0.9 * u, 0], [-2.2 * u, 2.2 * u]], '#c0f4df', 1 * u);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawPackets(ctx, routes, seconds, unit) {
    const u = clamp(unit, 0.64, 1.45);
    ctx.save();
    ctx.lineCap = 'round';
    for (const route of routes) {
      if (!route.active) continue;
      const {kind, weight, seed} = route;
      const control = kind === 'control';
      const duration = control ? 2.9 : 2.25;
      // A fractional emission rate preserves low weights. A 1% branch occasionally
      // receives one packet instead of showing the same permanent dot as a 100% branch.
      const rate = (control ? 0.62 : 2.02) * weight;
      const pulse = seconds * rate + seed;
      const last = Math.floor(pulse);
      const first = Math.ceil(pulse - duration * rate);
      const end = route.isFailure ? route.port : 1;
      for (let tick = first; tick <= last; tick++) {
        const progress = (pulse - tick) / (rate * duration);
        const t = clamp(progress, 0, 1) * end;
        const [x, y] = along(route, t);
        const back = along(route, Math.max(0, t - (control ? 3 : 7) * u / route.length));
        const tone = edgeTones[kind];
        const radius = (control ? 1.35 : 2.45) * u;
        stroke(ctx, [back, [x, y]], tint(tone, control ? 0.30 : 0.43), radius * 1.2);
        ellipse(ctx, x, y, radius * 1.88, radius * 1.72, tint(tone, control ? 0.15 : 0.18));
        if (kind === 'blocked') {
          polygon(ctx, [[x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]], '#ffc2a4');
        } else {
          ellipse(ctx, x, y, radius, radius, control ? '#c8c0fc' : '#9ef5d4');
          if (!control) ellipse(ctx, x - radius * 0.14, y - radius * 0.18, radius * 0.48, radius * 0.48, '#e6fff4');
        }
      }
    }
    ctx.restore();
  }

  function layer(canvas, width, height) {
    const surface = canvas.ownerDocument ? canvas.ownerDocument.createElement('canvas') : new OffscreenCanvas(width, height);
    surface.width = width;
    surface.height = height;
    return {surface, ctx: surface.getContext('2d')};
  }

  function fitLayer(target, width, height, sx, sy) {
    const ctx = target.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    return ctx;
  }

  function drawMachine(canvas, state, art, item, sx, sy) {
    const {size, node} = item;
    const key = [node.role, node.status, size].join('/');
    let sprite = state.sprites.get(key);
    if (!sprite) {
      const w = 115 * size, h = 108 * size, originX = 57.5 * size, originY = 78 * size;
      const tile = layer(canvas, Math.ceil(w * sx), Math.ceil(h * sy));
      tile.ctx.setTransform(tile.surface.width / w, 0, 0, tile.surface.height / h, 0, 0);
      machine(tile.ctx, {node, x: originX, y: originY, size});
      sprite = {surface: tile.surface, w, h, originX, originY};
      state.sprites.set(key, sprite);
    }
    art.save();
    if (node.status === 'muted') art.globalAlpha = 0.62;
    if (node.status === 'pending') art.globalAlpha = 0.76;
    if (node.status === 'down' && node.role !== 'reject') art.globalAlpha = 0.58;
    art.drawImage(sprite.surface, item.x - sprite.originX, item.y - sprite.originY, sprite.w, sprite.h);
    art.restore();
  }

  function drawStage(canvas, sceneId, model, clockSeconds) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const rect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : {};
    const width = rect.width || canvas.clientWidth || 840;
    const height = rect.height || canvas.clientHeight || 345;
    const dpr = clamp(Number(window.devicePixelRatio) || 1, 1, 2);
    const pixelW = Math.max(1, Math.round(width * dpr)), pixelH = Math.max(1, Math.round(height * dpr));
    const sx = pixelW / width, sy = pixelH / height;
    if (canvas.width !== pixelW) canvas.width = pixelW;
    if (canvas.height !== pixelH) canvas.height = pixelH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const nodes = model && Array.isArray(model.nodes) ? model.nodes : [];
    const edges = model && Array.isArray(model.edges) ? model.edges : [];
    const sizeKey = [width, height, pixelW, pixelH].join('/');
    let state = stages.get(canvas);
    if (!state || state.sizeKey !== sizeKey) {
      state = {sizeKey, ground: layer(canvas, pixelW, pixelH), glass: layer(canvas, pixelW, pixelH), sprites: new Map()};
      stages.set(canvas, state);
    }
    const nodeKey = JSON.stringify([sceneId, nodes.map(n => [n.id, n.role, n.label, n.sub, n.status])]);
    const newNodes = state.nodeKey !== nodeKey;
    if (newNodes) {
      state.nodeKey = nodeKey;
      state.geometry = arrange(nodes, sceneId, width, height);
      const art = fitLayer(state.glass, pixelW, pixelH, sx, sy);
      const backToFront = state.geometry.items.slice().sort((a, b) => a.y - b.y);
      for (const item of backToFront) drawMachine(canvas, state, art, item, sx, sy);
      labelNodes(art, state.geometry);
    }
    const edgeKey = JSON.stringify(edges.map(e => [e.from, e.to, e.kind, e.weight]));
    if (newNodes || state.edgeKey !== edgeKey) {
      state.edgeKey = edgeKey;
      const base = fitLayer(state.ground, pixelW, pixelH, sx, sy);
      const geometry = state.geometry;
      drawFloor(base, width, height, geometry.unit);
      for (const item of geometry.items) shadeGround(base, item);
      state.routes = planEdges(edges, geometry);
      drawRoutes(base, state.routes, geometry.unit);
    }
    // Artwork is cached between simulation ticks. Only the packets use the caller's clock.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(state.ground.surface, 0, 0);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    drawPackets(ctx, state.routes, Number.isFinite(clockSeconds) ? clockSeconds : 0, state.geometry.unit);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(state.glass.surface, 0, 0);
    ctx.restore();
  }

  window.Lab = window.Lab || {};
  window.Lab.drawStage = drawStage;
})();
