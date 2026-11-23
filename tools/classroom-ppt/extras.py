from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from scenes import S
R=Path(__file__).parent.resolve()
uri=R.joinpath("classroom.html").as_uri()
out={}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome')
    for scene in list(S)[:5]:
        pg=b.new_page(viewport={'width':1240,'height':1050});pg.goto(uri+'#'+scene);pg.get_by_role('button',name='自由实验',exact=True).click()
        pg.locator('#scene-studio details').evaluate_all('a=>a.forEach(x=>x.open=true)')
        raw=pg.evaluate("""()=>{const d=document.querySelector('#scene-detail'),c=document.querySelector('#scene-controls').hidden?document.querySelector('#gateway-controls'):document.querySelector('#scene-controls');return {table:[...d.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(x=>x.innerText))),controls:c.innerText,inline:document.querySelector('#stage-inline-controls').innerText,details:d.innerText,code:[...d.querySelectorAll('pre')].map(x=>x.innerText),metrics:[...document.querySelectorAll('#metrics .metric')].map(m=>[m.children[0].innerText,m.children[1].innerText]),gate:c.querySelectorAll('[aria-expanded=false]').length}}""")
        out[scene]=raw;pg.close()
    b.close()
(R/'meta'/'free-extra.json').write_text(json.dumps(out,ensure_ascii=False,indent=1))
for s,v in out.items():print(s, len(v['controls']), len(v['details']), list(map(len,v['code'])),v['gate'])
