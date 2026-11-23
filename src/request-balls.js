(() => {
  'use strict';

  const {travel, decisionTime, settleTime, landing} = window.Lab.flow.timing;
  // A heartbeat has a single hop. Give its pulse time to read between successive reports.
  const heartbeatTravel = 0.58;
  let heartOutline;
  const font = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  const mono = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
  const bounded = (n, a, b) => Math.min(b, Math.max(a, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const unitInterval = t => bounded(t, 0, 1);
  const schemes = {
    neutral: ['#ffffff', '#e0e0f5', '#afaed6', '#706f9a', '#43445e'],
    pass: ['#f4fff1', '#a9f7d4', '#60d9ae', '#328f80', '#20534f'],
    canary: ['#fffbe0', '#ffe6a4', '#f0be62', '#b98738', '#795730'],
    stop: ['#fff3d8', '#ffbaa4', '#ff8f7a', '#c45959', '#713e43'],
    control: ['#f9efff', '#d7baff', '#af7eef', '#835ac2', '#514271']
  };

  function capsule(ctx, x, y, w, h, r, fill, stroke, lineWidth = 1) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 1) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  function line(ctx, points, color, width = 1) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function write(ctx, text, x, y, size, color, weight = 550, align = 'center', family = font) {
    ctx.font = weight + ' ' + size + 'px ' + family;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  const arc = t => 4 * t * (1 - t);

  function bounce(t, peak, secondary) {
    if (t < 0.69) return peak * arc(t / 0.69);
    return secondary * arc((t - 0.69) / 0.31);
  }

  function deckHeight(route, t) {
    // Ground paths rise onto a machine's plinth at each end.
    const lift = (item, distance) => {
      const height = item.node.role === 'gateway' ? 13 : 7.5;
      return height * item.size * Math.max(0, 1 - distance / (31 * item.size));
    };
    return Math.max(lift(route.from, t * route.length), lift(route.to, (1 - t) * route.length));
  }

  function duration(request) {
    const transit = request.operation === 'heartbeat' ? heartbeatTravel : landing(request.tones);
    return transit + settleTime;
  }

  function batchEnd(batch) {
    let end = 0;
    for (const request of batch.requests) end = Math.max(end, request.at + duration(request));
    return end;
  }

  function connection(geometry, from, to) {
    return geometry?.connections.get(from)?.get(to);
  }

  function pose(scene, request, age, emphasis, prior) {
    if (age < -0.000001 || age > duration(request) + 0.000001) return null;
    const {path, tones, index} = request;
    let leg = 0;
    while (leg < tones.length - 1 && age >= travel[tones[leg]] + decisionTime) {
      age -= travel[tones[leg]] + decisionTime;
      leg++;
    }
    const from = path[leg], to = path[leg + 1];
    let route = connection(scene, from, to) || connection(scene, to, from);
    if (!route) route = connection(prior, from, to) || connection(prior, to, from);
    if (!route) return null;

    const tint = tones[leg];
    const isHeartbeat = request.operation === 'heartbeat';
    const t = unitInterval(age / (isHeartbeat ? heartbeatTravel : travel[tint]));
    const s = bounded(scene.unit, scene.bench ? 1.02 : 0.76, 1.35);
    const spread = emphasis ? 1 : 0.84 + (index % 4) * 0.095;
    const peak = tint === 'neutral' ? 16 : tint === 'control' ? 12 : tint === 'stop' ? 23.5 : 21.5;
    const z = bounce(t, peak * s * spread, 5.8 * s);
    const along = route.from.node.id === from ? t : 1 - t;
    const [x, floorY] = scene.pointAt(route, along);
    const depth = floorY + ((index % 3) - 1) * 1.65 * s * Math.sin(Math.PI * t);
    const radius = isHeartbeat ? (8.3 + 1.9 * Math.sin(Math.PI * t)) * s :
      (emphasis === 'focus' ? 9.4 : emphasis === 'probe' ? 6.9 : tint === 'control' ? 4.1 : 5.5) * s;
    const color = request.destination === 'v2' && to === 'v2' ? 'canary' : tint;
    return {x, y: depth - deckHeight(route, along), depth, z, radius, tint: color, request, emphasis, isHeartbeat};
  }

  function focusPose(scene, focus, seconds) {
    // A gateway trace pauses at arrival, authentication, admission and delivery.
    const t = unitInterval(seconds - Math.floor(seconds));
    const incoming = travel[focus.tones[0]];
    const forwarding = travel[focus.tones[1]];
    const start = incoming + decisionTime;
    const ages = [
      incoming * mix(0.04, 0.62, t),
      incoming * mix(0.62, 1, t),
      t < 0.30 ? incoming + decisionTime * (t / 0.30) : start + forwarding * ((t - 0.30) / 0.70),
      start + forwarding + settleTime * Math.min(1, t * 3)
    ];
    return pose(scene, focus, ages[bounded(focus.step, 0, 3)], 'focus');
  }

  function atTime(scene, model, seconds, manual = [], history) {
    if (model.focus) {
      const ball = focusPose(scene, model.focus, seconds);
      return ball ? [ball] : [];
    }
    const balls = [];
    function collect(batch, elapsed) {
      if (!batch || elapsed < 0) return;
      const prior = history?.get(batch);
      for (const request of batch.requests) {
        const age = elapsed - request.at;
        if (age < -0.000001) continue;
        const ball = pose(scene, request, age, request.emphasis, prior);
        if (ball) balls.push(ball);
      }
    }
    if (model.previousBatch) collect(model.previousBatch, seconds - model.previousBatch.second);
    if (model.batch) collect(model.batch, seconds - model.batch.second);
    for (const {batch, elapsed} of manual) collect(batch, elapsed);
    return balls.sort((a, b) => (a.depth - b.depth) || (a.z - b.z));
  }

  function shadow(ctx, ball) {
    const {x, y, radius: r, z} = ball;
    const lift = Math.min(1, z / (r * 5.5));
    const center = x + z * 0.11 + r * 0.16;
    const shade = 0.42 * (1 - 0.64 * lift);
    ellipse(ctx, center, y + r * 0.14, r * (0.93 + lift * 0.37), r * (0.34 + lift * 0.14),
      'rgba(6,8,19,' + shade + ')');
    if (lift < 0.3) ellipse(ctx, center, y + r * 0.12, r * 0.55, r * 0.20, '#17162460');
  }

  function sphere(ctx, ball) {
    const {x, y, radius: r, z} = ball;
    const cy = y - z - r * 0.93;
    const material = schemes[ball.tint];
    const glaze = ctx.createRadialGradient(x - r * 0.36, cy - r * 0.48, r * 0.045,
      x - r * 0.1, cy - r * 0.32, r * 1.38);
    for (const [at, v] of [[0, 0], [0.20, 1], [0.53, 2], [0.84, 3], [1, 4]]) glaze.addColorStop(at, material[v]);
    ellipse(ctx, x, cy, r, r, glaze, '#25273b', Math.max(0.62, r * 0.155));
    ellipse(ctx, x - r * 0.32, cy - r * 0.42, r * 0.25, r * 0.145, '#fffdf4cf');
    if (r > 5) {
      ctx.beginPath();
      ctx.arc(x - r * 0.04, cy, r * 0.78, Math.PI * 0.17, Math.PI * 0.50);
      ctx.strokeStyle = material[1];
      ctx.lineWidth = Math.max(0.5, r * 0.073);
      ctx.stroke();
    }
  }

  function heart(ctx, packet) {
    if (!heartOutline) heartOutline = new Path2D(window.Lab.ui.heartbeatPath);
    const {x, y, z, radius} = packet;
    ctx.save();
    ctx.translate(x, y - z - radius * 0.95);
    ctx.scale(radius / 10, radius / 10);
    ctx.translate(-12, -12);
    const glaze = ctx.createLinearGradient(7, 4, 16, 21);
    glaze.addColorStop(0, '#ff8b9b');
    glaze.addColorStop(0.45, '#f63b59');
    glaze.addColorStop(1, '#ab173b');
    ctx.fillStyle = glaze;
    ctx.fill(heartOutline);
    ctx.strokeStyle = '#ffbac7';
    ctx.lineWidth = 0.85;
    ctx.lineJoin = 'round';
    ctx.stroke(heartOutline);
    ctx.beginPath();
    ctx.moveTo(4.9, 8.9);
    ctx.quadraticCurveTo(5.0, 6.4, 7.2, 6.0);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#fff2f2';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function tag(ctx, scene, ball) {
    const probe = ball.emphasis === 'probe';
    const caption = (probe ? '探针' : '#' + ball.request.index) +
      (ball.tint === 'neutral' || !ball.request.code ? '' : ' · ' + ball.request.code);
    const s = bounded(scene.unit, 0.8, 1.25);
    const size = bounded((probe ? 11 : 12.5) * s, 10, 15);
    const r = ball.radius, cy = ball.y - ball.z - r * 0.93;
    ctx.font = '650 ' + size + 'px ' + (probe ? font : mono);
    const w = ctx.measureText(caption).width + 12 * s, h = size + 6 * s;
    const near = scene.items.find(item =>
      Math.abs(ball.x - item.x) < 40 * item.size && Math.abs(ball.depth - item.y) < 25 * item.size);
    const dx = near ? (ball.x < near.x ? -1 : 1) * (w / 2 + 11 * s) : 0;
    const cx = bounded(ball.x + dx, w / 2 + 3, scene.width - w / 2 - 3);
    const above = cy - r - h - 7 * s > 2;
    const y = bounded(above ? cy - r - h - 7 * s : cy + r + 7 * s, 2, scene.height - h - 2);
    const tone = ball.tint === 'stop' ? '#ffb4a2' : ball.tint === 'pass' ? '#a4ebcc' : '#d6d1f5';
    line(ctx, [[cx, above ? y + h : y], [ball.x, above ? cy - r : cy + r]], tone, 0.8 * s);
    capsule(ctx, cx - w / 2, y, w, h, h * 0.35, '#282b41', tone, 0.8 * s);
    write(ctx, caption, cx, y + h / 2 + 0.3 * s, size, tone, 630, 'center', probe ? font : mono);
  }

  window.Lab.requestBalls = {atTime, batchEnd, shadow, sphere, heart, tag};
})();
