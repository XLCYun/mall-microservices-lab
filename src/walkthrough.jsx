import React, {useLayoutEffect, useRef, useSyncExternalStore} from 'react';
import {playbackRates} from './walkthrough-player.js';

export const pad = number => String(number).padStart(2, '0');

export function ControlIcon({name}) {
  return <span aria-hidden="true" dangerouslySetInnerHTML={{__html: window.Lab.ui.icon(name, 15)}} />;
}

function LiveVisual({playback, index, record}) {
  const getFrame = () => playback.view(index).frame;
  const frame = useSyncExternalStore(playback.subscribe, getFrame, getFrame);
  return <record.Visual record={record} frame={frame} />;
}

function StoryCard({playback, index}) {
  const record = playback.records[index];
  const {slide} = record;
  const titleId = playback.sceneId + '-title-' + slide.id;
  return <section id={playback.sceneId + '-story-' + slide.id} className="registry-story-slide"
    aria-labelledby={titleId} tabIndex={-1}>
    <div className="registry-story-copy">
      <p className="registry-story-label">情景 {pad(slide.chapter ?? index + 1)}<span aria-hidden="true"> / </span>{slide.label}</p>
      <h2 id={titleId}>{slide.title}</h2>
      <p className="registry-story-lead">{slide.lead}</p>
      {slide.bullets && <ul className="registry-story-steps lesson-bullets">
        {slide.bullets.map(([term, explanation]) => <li key={term}><strong>{term}</strong> {explanation}</li>)}
      </ul>}
      <p className="registry-story-body">{slide.body}</p>
      {slide.steps && <ol className="registry-story-steps">{slide.steps.map(step => <li key={step}>{step}</li>)}</ol>}
    </div>
    <div className="registry-story-visual">
      {slide.live ? <LiveVisual playback={playback} index={index} record={record} /> : <record.Visual record={record} />}
    </div>
  </section>;
}

function MapAddress({sceneId, record}) {
  function follow(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || location.protocol === 'file:') return;
    event.preventDefault();
    const link = event.currentTarget;
    if (location.href !== link.href) history.pushState(null, '', link.href);
    link.closest('article').scrollIntoView({block: 'start'});
  }
  return <a href={'?map=' + record.id + '#' + sceneId} onClick={follow} className="lesson-map-address"
    aria-label={'地图地址 · ' + record.title} title="打开本图地址，右键可复制链接">本图地址</a>;
}

function SimulationMap({playback, index}) {
  useSyncExternalStore(playback.subscribe, playback.snapshot, playback.snapshot);
  const canvas = useRef(null);
  const record = playback.records[index];
  const {frame, phase, speed, custom, selected} = playback.view(index);
  const running = phase === 'playing';
  const action = running ? '暂停' : phase === 'ended' ? '重播' : phase === 'paused' && !custom ? '继续播放' : '播放';
  const change = (key, value) => playback.configure(index, key, value);
  const props = {record, frame, change, playback, index};
  const description = frame.model.nodes.map(n => n.label + '，' + n.sub).join('。');
  useLayoutEffect(() => playback.attach(index, canvas.current), [playback, index]);

  return <article id={playback.sceneId + '-map-' + record.id} className="registry-map"
    aria-label={record.title + '模拟地图'} tabIndex={-1} data-scenario={record.id}
    data-selected={selected} data-phase={phase} data-second={frame.second}
    onFocusCapture={() => playback.choose(index)} onPointerDown={() => playback.choose(index)}>
    <div className="registry-copy">
      <header className="registry-summary">
        <div className="registry-moment"><ControlIcon name="clock" />T+{pad(frame.second)} 秒</div>
        {playback.sceneId !== 'registry' && <MapAddress sceneId={playback.sceneId} record={record} />}
        {record.HeaderAction && <record.HeaderAction {...props} />}
      </header>
      <record.Readout {...props} />
      <div className="registry-actions">
        <button type="button" className="registry-play" aria-label={action + ' · ' + record.title}
          aria-pressed={running} onClick={() => playback.play(index)}>
          <ControlIcon name={running ? 'pause' : 'play'} />{action}</button>
        <button type="button" aria-label={'下一秒 · ' + record.title} onClick={() => playback.step(index)}>
          <ControlIcon name="step" />下一秒</button>
        <button type="button" className="registry-reset" aria-label={'重置本段 · ' + record.title}
          onClick={() => playback.resetOne(index)}><ControlIcon name="reset" />重置本段</button>
      </div>
    </div>
    <div className="registry-figure">
      <canvas ref={canvas} role="img" aria-label={record.title + '，第 ' + frame.second + ' 秒。' + description + '。'} />
      <div className="registry-speed" role="group" aria-label="播放速度">
        <span>倍速</span>
        {playbackRates.map(rate => <button type="button" key={rate} aria-label={rate + ' 倍速'}
          aria-pressed={speed === rate} onClick={() => playback.setSpeed(index, rate)}>{rate}×</button>)}
      </div>
    </div>
    <record.Settings {...props} />
  </article>;
}

export function Walkthrough({playback}) {
  useLayoutEffect(() => {
    function followAddress() {
      if (location.hash !== '#' + playback.sceneId) return;
      const link = new URLSearchParams(location.search);
      const kind = link.has('map') ? 'map' : 'story';
      const id = link.get(kind);
      if (!id) return;
      const panel = document.getElementById(playback.sceneId + '-' + kind + '-' + id);
      if (!panel) return;
      const index = playback.records.findIndex(r => (kind === 'map' ? r.id : r.slide.id) === id);
      if (index >= 0) playback.choose(index);
      panel.scrollIntoView({block: 'start'});
    }
    let pendingScroll;
    function afterHistoryRestore() {
      cancelAnimationFrame(pendingScroll);
      pendingScroll = requestAnimationFrame(followAddress);
    }
    followAddress();
    afterHistoryRestore();
    window.addEventListener('load', afterHistoryRestore, {once: true});
    window.addEventListener('popstate', afterHistoryRestore);
    return () => {
      cancelAnimationFrame(pendingScroll);
      window.removeEventListener('load', afterHistoryRestore);
      window.removeEventListener('popstate', afterHistoryRestore);
    };
  }, [playback]);

  return <section id={playback.sceneId + '-walkthrough'} className="scene-walkthrough"
    aria-label={window.Lab.story.find(s => s.id === playback.sceneId).short + '情景与模拟地图'}>
    {playback.records.map((record, index) => <React.Fragment key={record.id}>
      <StoryCard playback={playback} index={index} />
      <SimulationMap playback={playback} index={index} />
    </React.Fragment>)}
  </section>;
}
