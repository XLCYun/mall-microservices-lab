(() => {
  'use strict';

  const {expiryPolicy} = window.Lab.scenes.registry;
  const outage = {second: 1, id: 2, live: false};
  const recovery = {second: 8, id: 2, live: true};
  const definitions = [
    {
      id: 'normal', keySecond: 0, events: [], title: '两台商品服务器上线'
    },
    {
      id: 'offline', keySecond: outage.second, events: [outage], title: '商品服务器 02 掉线'
    },
    {
      id: 'evicted', keySecond: expiryPolicy.initial, outageSecond: outage.second,
      events: [outage], title: '注册中心剔除 02'
    },
    {
      id: 'restored', keySecond: recovery.second, events: [outage, recovery], title: '商品服务器 02 恢复接单'
    },
    {
      id: 'join', keySecond: recovery.second + 1, events: [outage, recovery], allowLaunch: true,
      title: '启动多个商品服务器'
    }
  ];

  function createRun(events, start, settings) {
    const registry = window.Lab.scenes.registry;
    const state = registry.init();
    if (settings) {
      registry.act(state, 'heartbeat', settings.heartbeat);
      registry.act(state, 'expire', settings.expire);
      registry.act(state, 'retry', settings.retry);
    }
    let scheduled = events;
    let cachedFrame;

    function advanceTo(clock) {
      const target = Math.floor(clock);
      while (state.time < target) {
        state.time++;
        registry.tick(state, scheduled.find(event => event.second === state.time));
        cachedFrame = null;
      }
    }

    function configure(key, value) {
      if (key === 'add') {
        if (registry.nextServerId(state) === null) return state.time;
        // Put each launch at a new second boundary, before its six arrivals.
        advanceTo(state.time + 1);
      }
      if (key === 'instance') scheduled = [];
      registry.configureCurrentSecond(state, key, value);
      cachedFrame = null;
      return state.time;
    }

    function frame() {
      if (!cachedFrame) {
        const entries = registry.entries(state);
        cachedFrame = {
          second: state.time, model: registry.stage(state),
          entries, registry: entries.map(entry => entry.id),
          gateway: state.cache.slice(),
          success: state.window.total - state.window.failed, failed: state.window.failed,
          recovered: state.window.recovered, trace: state.window.trace, selectedServer: state.selected,
          serverOnline: state.instances.find(p => p.id === state.selected).live,
          nextServerId: registry.nextServerId(state),
          heartbeat: state.heartbeat, expire: state.expire, retry: state.retry
        };
      }
      return cachedFrame;
    }

    advanceTo(start);
    return {advanceTo, configure, frame};
  }

  window.Lab.registryFrames = function registryFrames() {
    return definitions.map(definition => {
      const {keySecond} = definition;
      // Show directory updates in flight on membership changes and manual launches.
      const offset = ['normal', 'offline'].includes(definition.id) ? 0.43 : 0.22;
      const stillTime = keySecond + offset;
      const start = definition.allowLaunch ? keySecond : Math.max(0, keySecond - 0.75);
      const end = definition.allowLaunch ? Infinity : stillTime + (keySecond === 0 ? 2 : 1);
      return {
        ...definition, start, end, stillTime,
        createRun: (clock = stillTime, settings) => createRun(definition.events, clock, settings)
      };
    });
  };
})();
