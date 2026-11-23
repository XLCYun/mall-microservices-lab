Lab.topics = [
  {
    id: 'governance', label: '微服务治理',
    scenes: [
      {
        id: 'registry',
        short: '微服务发现',
        pages: '第 05 章 · 第 5–21 页',
        stage: '服务注册与发现',
        task: '让商品服务器 02 掉线，观察网关从哪一秒开始只把请求发给 01。再启动 02，看它重新注册后何时接到第一笔请求。',
      },
      {
        id: 'gateway',
        short: '网关分流',
        pages: '第 05 章 · 第 6、22–39、53 页',
        stage: '网关与请求流',
        task: '把商品接口的阈值从 ' + Lab.workloads.gateway.limit + ' 调到 ' + Lab.workloads.gateway.compare + '，慢放同一秒，看哪些球飞向实例、哪些在网关弹回。再各选一个请求逐跳跟踪。',
      },
      {
        id: 'scale',
        short: '弹性扩容',
        pages: '第 05 章 · 第 61–66 页',
        stage: '商品实例与扩缩容',
        task: '拉高流量，让新实例从启动走到就绪。然后降低流量，比较扩容与缩容各等了多久。',
      },
      {
        id: 'resilience',
        short: '容错降级',
        pages: '第 05 章 · 第 40–60 页',
        stage: '商品详情与评论依赖',
        task: '在配置中心发布“跳过评论”。观察各实例的配置版本和商品响应，再对比自动熔断时的调用路径。',
      },
      {
        id: 'mesh',
        short: '灰度发布',
        pages: '第 05 章 · 第 67–76 页',
        stage: '新旧版本与服务网格',
        task: '先把带内测请求头的查询送到 v2，再给新版分配普通流量。回滚时，观察新规则何时生效。',
      },
    ],
  },
  {
    id: 'testing', label: '微服务测试',
    scenes: [
      {
        id: 'phone',
        short: '数据驱动',
        pages: '第 06 章 · 第 8–11、15–17 页',
        stage: '注册手机号测试台',
        task: '先运行已有用例，再添加一个长度超出上限的号码。比较输入、预期和实际结果，找出两种不同的缺陷。',
      },
      {
        id: 'contract',
        short: '契约测试',
        pages: '第 06 章 · 第 18–25 页',
        stage: '订单与库存契约工作台',
        task: '先验证原版，再把 stock 改名为 quantity。看哪些消费者受影响，最后试试只新增一个字段。',
      },
    ],
  },
];

Lab.story = Lab.topics.flatMap(topic => topic.scenes);
