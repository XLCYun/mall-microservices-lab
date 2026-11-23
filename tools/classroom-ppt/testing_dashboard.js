  function testingResults() {
    const x=34,top=HMAP+10;
    ctx.fillStyle='#222238';ctx.fillRect(0,HMAP,W,540-HMAP);
    const word=(s,x,y,font=18,color='#f6f3fb',bold=false)=>{
      ctx.font=(bold?'600 ':'400 ')+font+'px "PingFang SC",sans-serif';
      ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle=color;ctx.fillText(String(s),x,y);
    };
    const rule=y=>{ctx.fillStyle='#45425a';ctx.fillRect(31,y,W-62,1);};
    const label='#c1b9d9',green='#92e2bf',red='#ffad9d',amber='#f9c77d';
    if(scene==='phone'){
      const rows=base.rows;
      word('手机号格式校验',x,top+17,22,'#ffffff',true);
      const [a,b,c]=api.stats(base);
      word('已运行 '+a[1]+' / '+rows.length+' 条     通过 '+b[1]+' 条',710,top+17,18,green,true);
      const cols=[37,287,610,790,985];
      ['用例','输入 phone','预期','实际 valid','断言'].forEach((t,i)=>word(t,cols[i],top+54,16,label,true));
      rule(top+72);
      rows.forEach((row,i)=>{
        const yy=top+94+i*35, done=Boolean(row.exchange),pass=done&&row.actual===row.expected&&!row.error;
        if(done&&row.id===base.selectedId){ctx.fillStyle='#38334c';ctx.fillRect(31,yy-16,W-62,33);}
        word(String(i+1).padStart(2,'0')+'   '+row.name,cols[0],yy,18);
        word(JSON.stringify(row.phone),cols[1],yy,18);
        word(String(row.expected),cols[2],yy,18,label);
        word(done?String(row.actual):'—',cols[3],yy,18,done?'#eeeaf8':label);
        word(done?(pass?'通过':'不符'):'待运行',cols[4],yy,18,done?(pass?green:red):label,done);
      });
    }else{
      const display=c=>c?.status==='pass'?'通过':c?.status==='fail'?'失败':c?.status==='invalid'?'契约有误':c?.status==='blocked'?'未执行':'待验证';
      const verdictColor=c=>c?.status==='pass'?green:c?.status==='fail'?red:label;
      const current=api.versions.find(([v])=>v===base.version)[1].split(' · ')[0];
      word('库存接口验证',x,top+17,22,'#ffffff',true);
      word(current,218,top+17,19,amber,true);
      const cols=[36,238,377,523];
      ['调用方','测试桩','契约重放','实际接入'].forEach((t,i)=>word(t,cols[i],top+64,16,label,true));
      ctx.fillStyle='#45425a';ctx.fillRect(32,top+83,630,1);ctx.fillRect(684,top+41,1,196);
      ['order','product'].forEach((id,i)=>{
        const yy=top+118+i*55,v=[base.consumerChecks[id],base.providerChecks[id],base.liveChecks[id]];
        word(api.roles[id].name,cols[0],yy,20,'#eeeaf8',true);
        v.forEach((c,j)=>word(j===2?(c?.status==='pass'?'可用':c?.status==='fail'?'受影响':display(c)):display(c),cols[j+1],yy,18,verdictColor(c)));
      });
      word('库存接口响应',720,top+59,17,label,true);
      const resp=api.responsePreview(base).actual;
      word('HTTP '+resp.status,720,top+95,18,'#f6f3fb',true);
      const entries=Object.entries(resp.body);
      entries.forEach(([key,v],i)=>word(key+'  '+JSON.stringify(v),720,top+127+i*30,18,key==='quantity'?amber:'#e7e2ef'));
    }
  }
