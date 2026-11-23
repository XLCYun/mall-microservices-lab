export const playbackRates = [0.1, 0.25, 0.5, 1];

export function createPlayback(sceneId, records, defaultSpeed) {
  const cards = records.map(record => ({
    simulation: record.createRun(), time: record.stillTime, phase: 'still',
    speed: defaultSpeed, custom: false, canvas: null, replay: null
  }));
  const listeners = new Set();
  let selected = 0;
  let playing = -1;
  let animation = null;
  let previousWall = 0;
  let revision = 0;

  function publish() {
    revision++;
    for (const listener of listeners) listener();
  }

  function draw(index) {
    const {simulation, time, canvas, replay} = cards[index];
    if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return;
    const {model, second} = simulation.frame();
    const manual = cards[index].manual;
    const flights = manual ? [{batch: manual.batch, elapsed: time - manual.start}] : [];
    const visibleModel = replay && model.previousBatch ? {...model, previousBatch: null} : model;
    window.Lab.drawStage(canvas, sceneId, visibleModel, replay ? second + replay.elapsed : time, flights);
  }

  function sample(now) {
    if (playing < 0) return;
    const index = playing;
    const card = cards[index];
    const before = Math.floor(card.time);
    const end = card.custom ? Infinity : records[index].end;
    const elapsed = Math.min(250, Math.max(0, now - previousWall));
    const delta = elapsed * card.speed / 1000;
    previousWall = now;
    if (card.replay) {
      const replay = card.replay;
      replay.elapsed = Math.min(replay.end, replay.elapsed + delta);
      draw(index);
      if (replay.elapsed >= replay.end) {
        card.phase = 'paused';
        playing = -1;
        publish();
      }
      return;
    }
    card.time = Math.min(end, card.time + delta);
    card.simulation.advanceTo(card.time);
    if (card.time >= end) {
      card.phase = 'ended';
      playing = -1;
    }
    draw(index);
    if (before !== Math.floor(card.time) || card.phase === 'ended') publish();
  }

  function animate(now) {
    animation = null;
    sample(now);
    if (playing >= 0) animation = requestAnimationFrame(animate);
  }

  function cancelAnimation() {
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
  }

  function pause() {
    if (playing < 0) return;
    cancelAnimation();
    sample(performance.now());
    if (playing < 0) return;
    cards[playing].phase = 'paused';
    playing = -1;
    publish();
  }

  function choose(index) {
    if (selected === index) return;
    pause();
    selected = index;
    publish();
  }

  function play(index = selected) {
    const wasPlaying = index === playing;
    pause();
    selected = index;
    if (wasPlaying) return;
    const card = cards[index];
    if (card.replay && card.replay.elapsed >= card.replay.end) card.replay = null;
    if (card.phase === 'still' || card.phase === 'ended') {
      card.time = records[index].start;
      card.simulation = records[index].createRun(card.time);
      card.manual = null;
    }
    card.phase = 'playing';
    playing = index;
    previousWall = performance.now();
    draw(index);
    publish();
    animation = requestAnimationFrame(animate);
  }

  function step(index = selected) {
    pause();
    selected = index;
    const card = cards[index];
    const record = records[index];
    card.replay = null;
    const landing = record.stillTime - record.keySecond;
    card.time = Math.floor(card.time) + 1 + landing;
    card.simulation.advanceTo(card.time);
    card.custom = true;
    card.phase = 'paused';
    draw(index);
    publish();
  }

  function configure(index, key, value) {
    if (playing === index) sample(performance.now());
    selected = index;
    const card = cards[index];
    if (card.replay) {
      pause();
      card.replay = null;
    }
    const previousManual = card.simulation.frame().model.manualBatch;
    const second = card.simulation.configure(key, value);
    if (second > card.time) card.time = second + (records[index].stillTime - records[index].keySecond);
    const batch = card.simulation.frame().model.manualBatch;
    if (batch !== previousManual) card.manual = batch ? {batch, start: card.time} : null;
    card.custom = true;
    if (playing !== index) card.phase = 'paused';
    draw(index);
    publish();
  }

  function replaySecond(index) {
    pause();
    const card = cards[index];
    if (card.simulation.frame().model.focus) card.simulation.configure('endTrace');
    card.replay = {elapsed: 0, end: window.Lab.requestBalls.batchEnd(card.simulation.frame().model.batch)};
    card.manual = null;
    card.phase = 'playing';
    card.custom = true;
    selected = playing = index;
    previousWall = performance.now();
    draw(index);
    publish();
    animation = requestAnimationFrame(animate);
  }

  function setSpeed(index, rate) {
    if (playing === index) sample(performance.now());
    selected = index;
    cards[index].speed = rate;
    publish();
  }

  function resetCard(index) {
    if (index === playing) {
      cancelAnimation();
      playing = -1;
    }
    const card = cards[index];
    card.simulation = records[index].createRun();
    card.manual = null;
    card.replay = null;
    card.time = records[index].stillTime;
    card.speed = defaultSpeed;
    card.phase = 'still';
    card.custom = false;
    draw(index);
  }

  function resetOne(index) {
    selected = index;
    resetCard(index);
    publish();
  }

  function revisit(index, second) {
    if (playing === index) pause();
    selected = index;
    const card = cards[index];
    const record = records[index];
    card.time = second;
    card.replay = null;
    card.manual = null;
    card.simulation = record.createRun(card.time, card.simulation.frame());
    card.phase = 'paused';
    card.custom = true;
    draw(index);
    publish();
  }

  function reset() {
    selected = 0;
    cards.forEach((_, index) => resetCard(index));
    publish();
  }

  function attach(index, canvas) {
    cards[index].canvas = canvas;
    const repaint = () => draw(index);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(repaint) : null;
    if (observer) observer.observe(canvas);
    else window.addEventListener('resize', repaint);
    repaint();
    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', repaint);
      cards[index].canvas = null;
    };
  }

  return {
    sceneId, records, choose, play, pause, step, reset, resetOne, revisit, replaySecond,
    selectedFrame: () => cards[selected].simulation.frame(), attach, configure, setSpeed,
    view(index) {
      const {simulation, phase, speed, custom} = cards[index];
      return {frame: simulation.frame(), phase, speed, custom, selected: selected === index};
    },
    snapshot: () => revision,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
