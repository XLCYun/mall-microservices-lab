(() => {
  'use strict';

  const Lab = window.Lab;
  Lab.workloads = {
    gateway: {incoming: 50, limit: 40, compare: 20, max: 60},
    scale: {normal: 40, rush: 120, quiet: 20, max: 160, limit: 150, replicaCapacity: 50},
    mesh: {initial: 50, max: 100},
  };

  // Animation time is in simulation seconds. Service response times stay in the scene metrics.
  const travel = {neutral: 0.145, pass: 0.174, stop: 0.145, control: 0.29};
  const decisionTime = 0.021;
  const settleTime = 0.027;
  function landing(tones) {
    return tones.reduce((sum, tone) => sum + travel[tone], 0) + decisionTime * (tones.length - 1);
  }

  // Store decisions alongside the simulation state so reset, step and replay use the same requests.
  function begin(owner, second) {
    owner.previousBatch = owner.batch?.second === second - 1 ? owner.batch : null;
    owner.batch = {second, requests: []};
    return owner.batch;
  }

  function manual(owner) {
    owner.manualBatch = {requests: []};
    return owner.manualBatch;
  }

  function add(batch, at, path, tones, details = {}) {
    const channel = tones[0] === 'control' ? 'control' : 'request';
    const request = {index: batch.requests.length + 1, at, path, tones, channel, ...details};
    batch.requests.push(request);
    return request;
  }

  function batches(owner, flowScope) {
    return {batch: owner.batch || null, previousBatch: owner.previousBatch || null,
      manualBatch: owner.manualBatch || null, flowScope};
  }

  Lab.flow = {begin, manual, add, batches, timing: {travel, decisionTime, settleTime, landing}};
})();
