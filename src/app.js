(() => {
  'use strict';
  // Capture the pristine page before adding a running simulation to the DOM.
  const isSourcePreview = Boolean(document.currentScript?.src);
  const offlineSource = isSourcePreview ? null : '<!doctype html>\n' + document.documentElement.outerHTML;
  const { escape, icon } = Lab.ui;
  const topics = Lab.topics;
  const ids = Lab.story.map(scene => scene.id);
  const lastSceneByTopic = new Map();
  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#topology');
  const slots = new Map(),
    runs = new Map();
  const appliedRanges = new WeakMap();
  const seenManualBatches = new WeakSet();
  let manualFlights = [], previewFrame = 0, stepPreview = null, flowScope;
  const players = new Map(), freeChapters = new Set();
  let guidePlayer = null;
  const clone = (data) => JSON.parse(JSON.stringify(data));
  let id, index, topic, scene, module, run;
  let playing = false,
    speed = 1,
    fraction = 0,
    raf = 0,
    previous = 0,
    lastPaint = 0,
    toastTimer = 0;
  let pointerDown = false,
    pressedButton = null,
    pointerRelease = 0,
    refreshFrame = 0,
    choosing = null;
  const pad = (value) => String(value).padStart(2, '0');
  const clock = (total) => pad(Math.floor(total / 60)) + ':' + pad(total % 60);
  const openingSpeed = (sceneId) => Lab.scenes[sceneId].defaultSpeed ?? 1;
  const numerals = ['一', '二', '三', '四', '五'];
  const editing = (element) =>
    element &&
    element.matches(
      'textarea,input:not([type=button]):not([type=checkbox]):not([type=radio]),select,[contenteditable=true]'
    );
  const guideLegends = {
    registry: [['waiting','入站'],['passed','接单'],['rejected','连接失败'],['heartbeat','心跳'],['control-ball','注册与名单更新']],
    gateway: [['waiting','入站'],['passed','放行'],['rejected','网关拒绝']],
    scale: [['waiting','入站'],['passed','接单'],['control-ball','伸缩与注册']],
    resilience: [['waiting','入站'],['passed','调用成功'],['rejected','调用失败'],['control-ball','配置下发']],
    mesh: [['waiting','入站'],['passed','转发到 v1'],['canary','转发到 v2'],['control-ball','规则下发']]
  };
  function legendMarkup(items) {
    return items.map(([kind, label]) => '<span>' +
      (kind === 'heartbeat' ? icon('heartbeat', 18) : '<i class="ball ' + kind + '"></i>') +
      escape(label) + '</span>').join('');
  }
  function showingGuide() {
    return Lab.guides.supports(id) && !freeChapters.has(id);
  }
  function updateSceneLayout() {
    const supported = Lab.guides.supports(id);
    const guided = showingGuide();
    const host = $('#walkthrough-host');
    document.body.classList.toggle('registry-scene', id === 'registry');
    $('#lesson-toolbar').hidden = !supported;
    $('#guide-tools').hidden = !guided;
    $('[data-shell="show-guide"]').setAttribute('aria-pressed', String(guided));
    $('[data-shell="show-free"]').setAttribute('aria-pressed', String(supported && !guided));
    if (guided) {
      $('#guide-legend').innerHTML = legendMarkup(guideLegends[id]);
      if (!players.has(id)) players.set(id, Lab.guides.create(id, run.base));
    }
    guidePlayer = guided ? players.get(id) : null;
    host.hidden = !guided;
    $('#scene-studio').hidden = guided;
    Lab.guides.render(host, guidePlayer);
  }
  function setGuideMode(free) {
    if (!Lab.guides.supports(id) || freeChapters.has(id) === free) return;
    const rail = $('#chapter-rail');
    const belowRail = rail.getBoundingClientRect().bottom < 0;
    pause();
    if (free) freeChapters.add(id);
    else freeChapters.delete(id);
    updateSceneLayout();
    render(true);
    if (belowRail) rail.scrollIntoView({block: 'start'});
  }
  function notify(message) {
    const toast = $('#toast');
    toast.textContent = String(message);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }
  function download(name, contents, mime = 'text/plain') {
    const a = document.createElement('a');
    const url = URL.createObjectURL(
      contents instanceof Blob ? contents : new Blob([contents], { type: mime })
    );
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function freshRun(nextId, previousId) {
    const api = Lab.scenes[nextId];
    const s = api.init();
    s.time = 0;
    if (nextId === 'resilience' && previousId === 'scale' && api.syncInstances) {
      const capacity = (!freeChapters.has('scale') && players.get('scale')?.selectedFrame().state) || runs.get('scale')?.state;
      const replicas = capacity?.instances.filter(item => item.status === 'ready').map(item => item.id);
      if (replicas?.length) api.syncInstances(s, replicas);
    }
    return { base: clone(s), state: s, speed: openingSpeed(nextId), fraction: 0, replay: null };
  }
  function fragment(el, html, force = false) {
    html = String(html ?? '');
    if (!force && slots.get(el) === html) return;
    const focused = document.activeElement;
    const drafting = focused?.matches('textarea,input[type=text],input:not([type]),[contenteditable=true]');
    if (!force && (pointerDown || (el.contains(focused) && (drafting || choosing === focused)))) return;
    const oldOpen = force ? [] : Array.from(el.querySelectorAll('details')).map((d) => d.open);
    const focusKey =
      !force && el.contains(focused)
        ? [focused.dataset.act, focused.dataset.key, focused.dataset.value]
        : null;
    el.innerHTML = html;
    slots.set(el, html);
    el.querySelectorAll('details').forEach((item, i) => {
      if (oldOpen[i] !== undefined) item.open = oldOpen[i];
    });
    if (focusKey?.some((key) => key !== undefined)) {
      const match = Array.from(el.querySelectorAll('[data-act],[data-key]')).find(
        (item) =>
          item.dataset.act === focusKey[0] &&
          item.dataset.key === focusKey[1] &&
          item.dataset.value === focusKey[2]
      );
      if (match) match.focus({ preventScroll: true });
    }
  }
  function renderRail() {
    for (const button of $('#topic-nav').children) {
      button.setAttribute('aria-pressed', String(button.dataset.topic === topic.id));
    }
    $('#chapter-rail').setAttribute('aria-label', topic.label + '章节');
    $('#chapter-rail').innerHTML = topic.scenes
      .map((item, i) => {
        return (
          '<button type="button" data-scene="' +
          item.id +
          '" ' +
          (item.id === id ? 'aria-current="step"' : '') +
          ' aria-label="' +
          escape('第' + numerals[i] + '幕 ' + item.short) +
          '"><span class="chapter-no">' +
          pad(i + 1) +
          '</span><span>' +
          escape(item.short) +
          '</span></button>'
        );
      })
      .join('');
    const rail = $('#chapter-rail'),
      active = rail.querySelector('[aria-current=step]');
    if (active && rail.scrollWidth > rail.clientWidth)
      rail.scrollLeft +=
        active.getBoundingClientRect().left -
        rail.getBoundingClientRect().left -
        (rail.clientWidth - active.clientWidth) / 2;
  }
  function previewElapsed(preview, now) {
    return Math.min(preview.end, (now - preview.start) * preview.speed / 1000);
  }
  const manualSpeed = () => Math.min(speed, 0.42);
  function animatePreview() {
    if (!previewFrame && !playing) {
      previewFrame = requestAnimationFrame(() => {
        previewFrame = 0;
        drawNow();
      });
    }
  }
  function syncPreviews(model, entering) {
    const batch = model.manualBatch;
    const scope = model.flowScope || id;
    if (entering || scope !== flowScope || !batch) manualFlights = [];
    if (entering || scope !== flowScope || model.focus || stepPreview?.batch !== model.batch) stepPreview = null;
    flowScope = scope;
    if (!batch || seenManualBatches.has(batch)) return;
    seenManualBatches.add(batch);
    if (!entering && batch.requests.length) {
      manualFlights.push({batch, start: performance.now(), end: Lab.requestBalls.batchEnd(batch), speed: manualSpeed()});
    }
  }
  function drawNow() {
    if (!module?.stage || !Lab.drawStage || !canvas.clientWidth) return;
    const model = run.model || module.stage(run.state);
    const now = performance.now();
    const stepped = stepPreview ? previewElapsed(stepPreview, now) : null;
    const time = run.state.time + (run.replay?.elapsed ?? stepped ?? fraction);
    manualFlights = manualFlights.filter(flight => previewElapsed(flight, now) < flight.end);
    const manual = manualFlights.map(flight => ({batch: flight.batch, elapsed: previewElapsed(flight, now)}));
    Lab.drawStage(canvas, id, model, time, manual);
    if (manual.length || (stepPreview && stepped < stepPreview.end)) animatePreview();
  }
  function setSpeed(value) {
    speed = Number(value) || 1;
    run.speed = speed;
    const now = performance.now();
    function retime(preview, rate) {
      const elapsed = previewElapsed(preview, now);
      preview.start = now - elapsed * 1000 / rate;
      preview.speed = rate;
    }
    for (const flight of manualFlights) retime(flight, manualSpeed());
    if (stepPreview) retime(stepPreview, module.workspace ? manualSpeed() : speed);
    transport();
  }
  function transport() {
    if (!run || showingGuide()) return;
    const replay = run.replay;
    const finished = replay && replay.elapsed >= replay.end;
    const status = playing ? (replay ? '重放中' : '运行中') : finished ? '本批已播完' : '已暂停';
    $('#stage-status').textContent = status;
    $('#stage-status').parentElement.classList.toggle('live', playing);
    Lab.gatewayUI.render({
      transport: $('#transport'),
      inline: $('#stage-inline-controls'),
      side: $('#gateway-controls'),
      state: id === 'gateway' ? run.state : null,
      playing, speed, timeText: clock(run.state.time),
      onAction: action,
      onShell: (command) => shell[command]?.(),
      onSpeed: setSpeed,
    });
  }
  function render(force = false) {
    if (showingGuide()) return;
    const s = run.state;
    const work = Boolean(module.workspace);
    $('#stage-card').classList.toggle('workbench', work);
    $('#canvas-box').hidden = !module.stage;
    $('#workspace').hidden = !work;
    if (work) fragment($('#workspace'), module.workspace(s), force);
    if (module.stage) {
      run.model = module.stage(s);
      syncPreviews(run.model, force);
      const legend = run.model.legend || {};
      const hasControl = run.model.edges.some(edge => edge.kind === 'control');
      const items = id === 'mesh' ? guideLegends.mesh : [
        ...(id === 'contract' ? [] : [['waiting', work ? '提交' : '入站']]),
        ['passed', legend.pass || (id === 'gateway' ? '放行' : '转发')],
        ['rejected', legend.stop || (id === 'gateway' || id === 'scale' ? '拦截' : '调用失败')],
        ...(id === 'registry' ? [['heartbeat','心跳']] : []),
        ...(hasControl ? [['control-ball', id === 'registry' ? '注册与名单更新' : '控制消息']] : [])
      ];
      fragment($('#legend'), '<strong>' + (work ? '1 球 = 1 次验证调用' : '1 球 = 1 个请求') + '</strong>' + legendMarkup(items));
      canvas.setAttribute(
        'aria-label',
        scene.stage +
          '。' +
          run.model.nodes.map((node) => node.label + (node.sub ? '，' + node.sub : '')).join('。')
      );
      drawNow();
    }
    const gateway = id === 'gateway';
    $('#stage-inline-controls').hidden = !gateway;
    $('#gateway-controls').hidden = !gateway;
    $('#scene-controls').hidden = gateway;
    if (!gateway) fragment($('#scene-controls'), module.controls(s), force);
    const detail = module.detail?.(s) || '';
    $('#detail-card').hidden = !detail.trim();
    fragment($('#scene-detail'), detail, force);
    const stats = module.stats(s) || [];
    const measures = stats
      .map(
        ([label, value, unit]) =>
          '<div class="metric"><div class="metric-label"><i></i>' +
          escape(label) +
          '</div><div class="metric-value"><strong class="' +
          (/[\u3400-\u9fff]/u.test(String(value)) ? 'word' : '') +
          '">' +
          escape(value) +
          '</strong><small>' +
          escape(unit || '') +
          '</small></div></div>'
      )
      .join('');
    if (slots.get($('#metrics')) !== measures) {
      $('#metrics').innerHTML = measures;
      slots.set($('#metrics'), measures);
    }
    transport();
  }
  function tick() {
    run.state.time++;
    module.tick?.(run.state);
    render();
  }
  function animation(now) {
    if (!playing) return;
    const delta = Math.min(260, Math.max(0, now - previous));
    previous = now;
    const advance = (delta * speed) / 1000;
    if (run.replay) {
      run.replay.elapsed = Math.min(run.replay.end, run.replay.elapsed + advance);
      if (run.replay.elapsed >= run.replay.end) {
        drawNow();
        pause();
        return;
      }
    } else {
      fraction += advance;
      while (fraction >= 1) {
        fraction--;
        tick();
      }
    }
    if (now - lastPaint >= 32) {
      drawNow();
      lastPaint = now;
    }
    raf = requestAnimationFrame(animation);
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    if (showingGuide()) guidePlayer?.pause();
    transport();
  }
  function play() {
    if (showingGuide()) {
      guidePlayer.play();
      return;
    }
    if (playing) {
      pause();
      return;
    }
    if (run.replay && run.replay.elapsed >= run.replay.end) {
      run.replay = null;
      fraction = 0;
    }
    if (stepPreview) {
      fraction = Math.min(1, previewElapsed(stepPreview, performance.now()));
      stepPreview = null;
    }
    playing = true;
    previous = performance.now();
    lastPaint = 0;
    transport();
    raf = requestAnimationFrame(animation);
  }
  function enter(nextId, scroll) {
    if (!ids.includes(nextId)) nextId = ids[0];
    if (id === nextId) return;
    const old = id;
    pause();
    if (run) run.fraction = fraction;
    id = nextId;
    topic = topics.find(group => group.scenes.some(item => item.id === id));
    index = topic.scenes.findIndex(item => item.id === id);
    scene = topic.scenes[index];
    lastSceneByTopic.set(topic.id, id);
    module = Lab.scenes[id];
    if (Lab.guides.supports(id) && /[?&](?:map|story)=/.test(location.search)) freeChapters.delete(id);
    if (!runs.has(id)) runs.set(id, freshRun(id, old));
    run = runs.get(id);
    fraction = run.fraction;
    speed = run.speed;
    document.body.classList.toggle('gateway-scene', id === 'gateway');
    updateSceneLayout();
    slots.clear();
    pointerDown = false;
    choosing = null;
    document.title = scene.short + ' · 微服务演练场';
    $('#scene-heading').textContent = scene.short;
    $('#mission').textContent = scene.task;
    $('#stage-title').textContent = scene.stage;
    $('#lesson-pages').textContent = '对应课件　' + scene.pages;
    $('[data-shell="prev"]').disabled = index === 0;
    const nextScene = topic.scenes[index + 1];
    const nextButton = $('#next-button');
    nextButton.hidden = !nextScene;
    if (nextScene) nextButton.textContent = '下一幕 · ' + nextScene.short;
    transport();
    renderRail();
    render(true);
    if (scroll) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      $('#scene-heading').focus({ preventScroll: true });
    }
  }
  function go(nextId) {
    if (!ids.includes(nextId)) return;
    if (id !== nextId) {
      const url = new URL(location.href);
      url.searchParams.delete('map');
      url.searchParams.delete('story');
      url.hash = nextId;
      if (location.protocol === 'file:') location.hash = nextId;
      else history.pushState(null, '', url);
      enter(nextId, true);
    }
  }
  function reset() {
    pause();
    players.get(id)?.reset();
    fraction = 0;
    pointerDown = false;
    run.fraction = 0;
    speed = openingSpeed(id);
    run.speed = speed;
    run.replay = null;
    run.state = clone(run.base);
    run.model = null;
    renderRail();
    render(true);
    notify('已恢复本幕开场状态');
  }
  async function fullscreen() {
    const root = document.documentElement;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else if (root.requestFullscreen || root.webkitRequestFullscreen) {
        await (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      } else {
        document.body.classList.toggle('focus-view');
        $('#fullscreen-label').textContent = document.body.classList.contains('focus-view')
          ? '退出专注'
          : '全屏演示';
        notify(document.body.classList.contains('focus-view') ? '已进入专注演示' : '已恢复标准视图');
      }
    } catch {
      notify('当前浏览器未开放全屏，可继续使用演练控件');
    }
  }
  function syncFullscreen() {
    const full = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    $('#fullscreen-label').textContent = full ? '退出全屏' : '全屏演示';
    $('[data-shell=fullscreen] [data-icon]').innerHTML = icon(full ? 'shrink' : 'expand');
  }
  const shell = {
    play,
    step() {
      if (showingGuide()) {
        guidePlayer.step();
        return;
      }
      pause();
      run.replay = null;
      fraction = 0;
      tick();
      // Show this second's recorded traffic without advancing the simulation another tick.
      const {batch, previousBatch, focus} = run.model;
      if (batch && !focus) {
        const tail = previousBatch ? Lab.requestBalls.batchEnd(previousBatch) - 1 : 0;
        const end = Math.min(1, Math.max(tail, Lab.requestBalls.batchEnd(batch)));
        if (end > 0) {
          stepPreview = {batch, start: performance.now(), end, speed: module.workspace ? manualSpeed() : speed};
          drawNow();
        }
      }
    },
    reset,
    'show-guide': () => setGuideMode(false),
    'show-free': () => setGuideMode(true),
    fullscreen,
    next() {
      if (index + 1 < topic.scenes.length) go(topic.scenes[index + 1].id);
    },
    prev() {
      if (index > 0) go(topic.scenes[index - 1].id);
    },
  };
  async function action(key, value, target) {
    const activeRun = run,
      state = run.state;
    if (id === 'gateway' && ['tracePass', 'trace429', 'traceNext', 'replay'].includes(key)) {
      pause();
      fraction = 0;
    }
    if (id === 'gateway' && ['tracePass', 'trace429', 'traceNext', 'endTrace', 'sendProbe', 'sendOrder', 'replay'].includes(key)) {
      run.replay = null;
    }
    const ctx = {
      notify: (message) => {
        if (run === activeRun && run.state === state) notify(message);
      },
      download,
      sceneTime: state.time + fraction,
      refresh: () => {
        if (run === activeRun && run.state === state) render();
      },
    };
    try {
      await module.act?.(state, key, value, target, ctx);
    } catch (error) {
      ctx.notify('这次操作未完成：' + (error?.message || '请重试'));
      console.error(error);
    }
    if (run !== activeRun || run.state !== state) return;
    if (id === 'gateway' && key === 'replay') {
      run.replay = { elapsed: 0, end: Lab.requestBalls.batchEnd(state.batch) };
      play();
    }
    render();
  }
  function scheduleRefresh() {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      if (run) render();
    });
  }
  document.addEventListener(
    'pointerdown',
    (event) => {
      clearTimeout(pointerRelease);
      pointerDown = true;
      choosing = event.target.closest('select');
      pressedButton = event.target.closest('button,[data-act],[data-shell],[data-scene]');
    },
    true
  );
  function releasePointer(delay = 0) {
    clearTimeout(pointerRelease);
    pointerRelease = setTimeout(() => {
      pointerDown = false;
      pressedButton = null;
      scheduleRefresh();
    }, delay);
  }
  // A touch browser may dispatch click after blur/change and the next paint.
  // Keep the pressed button in the DOM until its click is delivered.
  document.addEventListener('pointerup', () => releasePointer(pressedButton ? 650 : 0), true);
  document.addEventListener('pointercancel', () => releasePointer(), true);
  document.addEventListener('focusout', (event) => {
    if (choosing === event.target) choosing = null;
    scheduleRefresh();
  });
  window.addEventListener('blur', () => releasePointer());
  document.addEventListener('click', (event) => {
    releasePointer();
    if (event.target.closest('[data-gateway-ui]')) return;
    const target = event.target.closest('button,[data-shell],[data-act],[data-scene]');
    if (!target || target.disabled) return;
    if (target.dataset.topic) {
      const nextTopic = topics.find(group => group.id === target.dataset.topic);
      if (nextTopic) go(lastSceneByTopic.get(nextTopic.id) || nextTopic.scenes[0].id);
      return;
    }
    if (target.hasAttribute('data-scene')) {
      go(target.dataset.scene);
      return;
    }
    if (target.dataset.shell) {
      shell[target.dataset.shell]?.();
      return;
    }
    if (target.hasAttribute('data-act')) {
      action(target.dataset.act, target.dataset.value ?? '', target);
    }
  });
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target.closest('[data-gateway-ui]')) return;
    if (choosing === target) choosing = null;
    if (target.type === 'range' && appliedRanges.get(target) === target.value) {
      appliedRanges.delete(target);
      return;
    }
    if (target.hasAttribute('data-key'))
      action(target.dataset.key, target.type === 'checkbox' ? target.checked : target.value, target);
  });
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.closest('[data-gateway-ui]')) return;
    if (target.matches('input[type=range]')) {
      target.style.setProperty(
        '--range-fill',
        (100 * (Number(target.value) - Number(target.min))) / (Number(target.max) - Number(target.min) || 1) +
          '%'
      );
      const output = target.closest('label')?.querySelector('output');
      if (output)
        output.innerHTML = escape(target.value) + '<small>' + escape(target.dataset.unit || '') + '</small>';
      // Touch WebKit can finish a slider gesture without a change event.
      if (target.dataset.key && appliedRanges.get(target) !== target.value) {
        appliedRanges.set(target, target.value);
        action(target.dataset.key, target.value, target);
      }
    }
  });
  $('.skip-link').addEventListener('click', (event) => {
    event.preventDefault();
    $('#scene-heading').focus();
  });
  document.addEventListener('keydown', (event) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      editing(event.target) ||
      event.target.closest('.registry-story-slide') ||
      event.target.closest('button,a,summary,input')
    )
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      play();
    } else if (event.key === '.') {
      event.preventDefault();
      shell.step();
    }
  });
  window.addEventListener('hashchange', () => {
    const next = location.hash.slice(1);
    enter(ids.includes(next) ? next : ids[0], true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (playing || showingGuide())) pause();
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);
  document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
  if (isSourcePreview) $('#offline').hidden = true;
  else $('#offline').href = URL.createObjectURL(new Blob([offlineSource], { type: 'text/html;charset=utf-8' }));
  for (const group of topics) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.topic = group.id;
    button.setAttribute('aria-controls', 'chapter-rail');
    button.textContent = group.label;
    $('#topic-nav').append(button);
  }
  const first = location.hash.slice(1);
  enter(ids.includes(first) ? first : ids[0], false);
  if (isSourcePreview && new URLSearchParams(location.search).get('play') === '1') play();
  if ('ResizeObserver' in window) new ResizeObserver(drawNow).observe(canvas);
  else window.addEventListener('resize', drawNow);
})();
