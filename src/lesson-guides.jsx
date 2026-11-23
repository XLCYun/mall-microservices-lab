import React from 'react';
import {createRoot} from 'react-dom/client';
import {Walkthrough} from './walkthrough.jsx';
import {createPlayback} from './walkthrough-player.js';
import {registryRecords} from './registry-walkthrough.jsx';
import {lessonRecords} from './guided-runs.js';
import {gatewayViews} from './gateway-lessons.jsx';
import {scaleViews} from './scale-lessons.jsx';
import {resilienceViews} from './resilience-lessons.jsx';
import {meshViews} from './mesh-lessons.jsx';

const chapters = {gateway: gatewayViews, scale: scaleViews, resilience: resilienceViews, mesh: meshViews};
let root;

export const guides = {
  supports(id) {
    return id === 'registry' || Object.hasOwn(chapters, id);
  },
  create(sceneId, opening) {
    const lab = window.Lab;
    const defaultSpeed = lab.scenes[sceneId].defaultSpeed ?? 0.25;
    if (sceneId === 'registry') return createPlayback(sceneId, registryRecords(lab), defaultSpeed);
    const {visuals, Readout, Settings} = chapters[sceneId];
    const records = lessonRecords(lab, sceneId, opening).map(record => ({
      ...record, Visual: visuals[record.id], Readout, Settings
    }));
    return createPlayback(sceneId, records, defaultSpeed);
  },
  render(host, player) {
    if (!root && !player) return;
    if (!root) root = createRoot(host);
    root.render(player ? <Walkthrough key={player.sceneId} playback={player} /> : null);
  }
};
