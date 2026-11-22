(() => {
  'use strict';
  // Capture the pristine page before any scenario, student answers or results enter the DOM.
  const offlineSource = '<!doctype html>\n' + document.documentElement.outerHTML;
  const { escape, icon } = Lab.ui;
  const scenes = Lab.story;
  const ids = scenes.map((scene) => scene.id);
  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#topology'),
    dialog = $('#dialog');
  const slots = new Map(),
    runs = new Map();
  const appliedRanges = new WeakMap();
  const clone = (data) => JSON.parse(JSON.stringify(data));
  let id, index, scene, module, run;
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
    dialogInvoker = null,
    choosing = null;
  const pad = (value) => String(value).padStart(2, '0');
  const clock = (total) => pad(Math.floor(total / 60)) + ':' + pad(total % 60);
  const numerals = ['一', '二', '三', '四', '五', '六', '七'];
  const editing = (element) =>
    element &&
    element.matches(
      'textarea,input:not([type=button]):not([type=checkbox]):not([type=radio]),select,[contenteditable=true]'
    );
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
      const replicas = runs
        .get('scale')
        ?.state.instances?.filter((item) => item.status === 'ready')
        .map((item) => item.id);
      if (replicas?.length) api.syncInstances(s, replicas);
    }
    return { base: clone(s), state: s, answer: '', card: null, recordTime: null, speed: 1 };
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
    $('#chapter-rail').innerHTML = scenes
      .map((item, i) => {
        const saved = Boolean(runs.get(item.id)?.card);
        return (
          '<button type="button" data-scene="' +
          item.id +
          '" class="' +
          (saved ? 'completed' : '') +
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
  function drawNow() {
    if (!module?.stage || !Lab.drawStage || !canvas.clientWidth) return;
    Lab.drawStage(canvas, id, run.model || module.stage(run.state), run.state.time + fraction);
  }
  function transport() {
    $('#play-button').innerHTML = icon(playing ? 'pause' : 'play', 16) + (playing ? '暂停' : '运行');
    $('#play-button').setAttribute('aria-label', playing ? '暂停模拟' : '运行模拟');
    $('#stage-status').textContent = playing ? '运行中' : '已暂停';
    $('#stage-status').parentElement.classList.toggle('live', playing);
  }
  function render(force = false) {
    const s = run.state;
    const work = Boolean(module.workspace);
    $('#stage-card').classList.toggle('workbench', work);
    $('#canvas-box').hidden = work;
    $('#workspace').hidden = !work;
    if (work) fragment($('#workspace'), module.workspace(s), force);
    else {
      run.model = module.stage(s);
      const edges = run.model.edges || [];
      const keys = new Set(edges.map((edge) => edge.kind));
      if (id === 'gateway') keys.add('blocked');
      $('#legend').innerHTML =
        '<span><i></i>业务请求</span>' +
        (keys.has('control') ? '<span><i class="control"></i>控制消息</span>' : '') +
        (keys.has('blocked') ? '<span><i class="blocked"></i>拦截或失败</span>' : '');
      canvas.setAttribute(
        'aria-label',
        scene.stage +
          '。' +
          run.model.nodes.map((node) => node.label + (node.sub ? '，' + node.sub : '')).join('。')
      );
      drawNow();
    }
    fragment($('#scene-controls'), module.controls(s), force);
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
    $('#sim-clock').textContent = clock(s.time);
    $('#record-state').textContent = run.card
      ? '本幕上一次生成结果卡时的模拟时间为 ' + clock(run.recordTime) + '。'
      : '';
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
    fraction += (delta * speed) / 1000;
    while (fraction >= 1) {
      fraction--;
      tick();
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
    transport();
  }
  function play() {
    if (playing) {
      pause();
      return;
    }
    playing = true;
    previous = performance.now();
    lastPaint = 0;
    transport();
    raf = requestAnimationFrame(animation);
  }
  function closeDialog() {
    if (dialog.open) dialog.close();
  }
  function showDialog(title, html) {
    if (!dialog.open) {
      dialogInvoker = document.activeElement;
      pause();
    }
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = html;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  function enter(nextId, scroll) {
    if (!ids.includes(nextId)) nextId = ids[0];
    if (id === nextId) return;
    const old = id;
    closeDialog();
    pause();
    fraction = 0;
    id = nextId;
    index = ids.indexOf(id);
    scene = scenes[index];
    module = Lab.scenes[id];
    if (!runs.has(id)) runs.set(id, freshRun(id, old));
    run = runs.get(id);
    speed = run.speed;
    $('#speed').value = String(speed);
    slots.clear();
    pointerDown = false;
    choosing = null;
    document.title = scene.title + ' · 商城大促值班夜';
    $('#scene-title').textContent = scene.title;
    $('#act-number').textContent = '第' + numerals[index] + '幕' + (id === 'mesh' ? ' · 选讲' : '');
    $('#story-text').textContent = scene.story;
    $('#story-clock').textContent = scene.time;
    $('#mission').textContent = scene.task;
    $('#stage-title').textContent = scene.stage;
    $('#question').textContent = scene.question;
    $('#answer').value = run.answer;
    $('#lesson-pages').textContent = '对应课件　' + scene.pages;
    $('[data-shell="prev"]').disabled = index === 0;
    $('#quick-next').textContent = index === 6 ? '结束值班' : index === 5 ? '进入选讲' : '下一幕';
    $('#next-button').textContent =
      index === 6 ? '结束值班' : index === 5 ? '进入选讲 · 灰度发布' : '下一幕 · ' + scenes[index + 1].short;
    transport();
    renderRail();
    render(true);
    if (scroll) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      $('#scene-title').focus({ preventScroll: true });
    }
  }
  function go(nextId) {
    if (!ids.includes(nextId)) return;
    closeDialog();
    if (id !== nextId) {
      if (location.hash !== '#' + nextId) location.hash = nextId;
      enter(nextId, true);
    }
  }
  function reset() {
    pause();
    fraction = 0;
    pointerDown = false;
    speed = 1;
    run.speed = 1;
    $('#speed').value = '1';
    run.state = clone(run.base);
    run.answer = '';
    run.card = null;
    run.model = null;
    run.recordTime = null;
    $('#answer').value = '';
    renderRail();
    render(true);
    notify('已恢复本幕开场状态');
  }
  function catalog(finished = false) {
    const groups = [
      ['服务治理', scenes.slice(0, 4)],
      ['服务测试', scenes.slice(4, 6)],
      ['选讲', scenes.slice(6)],
    ];
    let html =
      '<p class="dialog-intro">' +
      (finished
        ? '今晚的值班结束了。已走过 ' +
          runs.size +
          ' 幕，已生成 ' +
          Array.from(runs.values()).filter((r) => r.card).length +
          ' 张课堂结果卡。'
        : '从开售前的服务点名一直走到新版发布。可以直接进入任一幕，切换时会保留本次打开页面后的演练进度。') +
      '</p>';
    for (const [group, items] of groups) {
      html += '<h3 class="catalog-group">' + group + '</h3><div class="catalog-list">';
      for (const item of items) {
        const i = ids.indexOf(item.id);
        const record = runs.get(item.id);
        html +=
          '<button type="button" class="' +
          (item.id === id ? 'active' : '') +
          '" data-scene="' +
          item.id +
          '"><span class="cat-no">' +
          pad(i + 1) +
          '</span><strong>' +
          escape(item.title) +
          '</strong><small>' +
          item.time +
          ' · ' +
          (record?.card ? '已生成结果卡' : item.short) +
          '</small></button>';
      }
      html += '</div>';
    }
    showDialog(finished ? '大促值班回顾' : '剧情目录', html);
  }
  function record() {
    pause();
    drawNow();
    run.answer = $('#answer').value;
    run.card = Lab.makeCard({
      scene,
      elapsed: clock(run.state.time),
      metrics: module.stats(run.state),
      params: module.summary?.(run.state) || [],
      evidence: module.evidence?.(run.state) || [],
      answer: run.answer,
      topology: module.stage ? canvas : null,
    });
    run.recordTime = run.state.time;
    renderRail();
    render();
    showDialog(
      '本幕结果卡',
      '<img class="report-image" alt="包含本幕读数、运行快照和课堂回答的结果卡" src="' +
        run.card +
        '"><div class="dialog-actions"><button type="button" data-shell="close">返回演练</button><button type="button" class="primary" data-shell="save-card">' +
        icon('download', 16) +
        ' 保存 PNG</button></div>'
    );
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
      pause();
      fraction = 0;
      tick();
    },
    reset,
    catalog: () => catalog(),
    close: closeDialog,
    fullscreen,
    record,
    next() {
      if (index + 1 < scenes.length) go(ids[index + 1]);
      else catalog(true);
    },
    prev() {
      if (index > 0) go(ids[index - 1]);
    },
    'save-card'() {
      if (!run.card) return;
      const a = document.createElement('a');
      a.href = run.card;
      a.download = '值班记录-' + pad(index + 1) + '-' + scene.short + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
  };
  async function action(key, value, target) {
    const activeRun = run,
      state = run.state;
    const ctx = {
      notify: (message) => {
        if (run === activeRun && run.state === state) notify(message);
      },
      download,
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
    if (run === activeRun && run.state === state) render();
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
    const target = event.target.closest('button,[data-shell],[data-act],[data-scene]');
    if (!target || target.disabled) return;
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
    if (choosing === target) choosing = null;
    if (target.id === 'speed') {
      speed = Number(target.value) || 1;
      run.speed = speed;
      return;
    }
    if (target.type === 'range' && appliedRanges.get(target) === target.value) {
      appliedRanges.delete(target);
      return;
    }
    if (target.hasAttribute('data-key'))
      action(target.dataset.key, target.type === 'checkbox' ? target.checked : target.value, target);
  });
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'answer') {
      run.answer = target.value;
      return;
    }
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
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      closeDialog();
  });
  dialog.addEventListener('close', () => {
    if (dialogInvoker?.isConnected && dialogInvoker !== document.body)
      dialogInvoker.focus({ preventScroll: true });
    dialogInvoker = null;
  });
  document.addEventListener('keydown', (event) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      dialog.open ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      editing(event.target) ||
      event.target.closest('button,a,summary')
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
    if (document.hidden && playing) pause();
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);
  document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
  $('#offline').href = URL.createObjectURL(new Blob([offlineSource], { type: 'text/html;charset=utf-8' }));
  const first = location.hash.slice(1);
  enter(ids.includes(first) ? first : ids[0], false);
  if ('ResizeObserver' in window) new ResizeObserver(drawNow).observe(canvas);
  else window.addEventListener('resize', drawNow);
})();
