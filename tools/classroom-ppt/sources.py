from pathlib import Path
import json,sys
from playwright.sync_api import sync_playwright,expect
from scenes import S
R=Path(__file__).resolve().parent
SITE=R.joinpath("classroom.html").as_uri()
def btn(pg,name):return pg.get_by_role('button',name=name,exact=True)
with sync_playwright() as pw:
    br=pw.chromium.launch(channel='chrome')
    cx=br.new_context(viewport={'width':1240,'height':1080},device_scale_factor=1.75)
    for scene,clips in S.items():
        pg=cx.new_page()
        pg.goto(SITE+'#'+scene,wait_until='load',timeout=45000)
        pg.wait_for_selector('.registry-story-slide',timeout=15000)
        pg.add_style_tag(content='.registry-toolbar,#lesson-toolbar{position:static!important}.registry-story-visual{align-self:stretch}*:focus{outline:none!important}html{scroll-behavior:auto!important}')
        pg.evaluate('document.fonts.ready')
        cards=pg.locator('.registry-story-slide')
        data=[]
        for i in range(cards.count()):
            el=cards.nth(i);s=el.evaluate('''e=>{const t=q=>e.querySelector(q)?.innerText||'';return {ref:e.id,label:t('.registry-story-label'),title:t('h2'),lead:t('.registry-story-lead'),body:t('.registry-story-body'),items:[...e.querySelectorAll('.registry-story-copy li')].map(x=>x.innerText),board:t('.registry-story-visual'),tables:[...e.querySelectorAll('.registry-story-visual table')].map(t=>[...t.rows].map(r=>[...r.cells].map(c=>c.innerText))),code:t('.registry-story-visual pre')};}''')
            if scene not in ('phone','contract'):
                m=pg.locator('.registry-map').nth(i)
                s.update(map=m.get_attribute('data-scenario'),panel=m.locator('.registry-copy').inner_text(),settings=m.locator('.registry-settings').inner_text())
                name=scene+'-'+s['map']
            else:name=scene+'-intro'
            vis=el.locator('.registry-story-visual')
            vis.screenshot(path=str(R/'visual'/(name+'.png')),animations='disabled',timeout=25000)
            data.append(s)
        out={'stories':data}
        if scene not in ('phone','contract'):
            btn(pg,'自由实验').click()
            side=pg.locator('#gateway-controls' if scene=='gateway' else '#scene-controls')
            # Capture control groups, including expandable controls, as a reference for presenter notes.
            for control in side.locator('button[aria-expanded=false],details:not([open]) > summary').all():
                if control.is_visible():control.click()
            out['free']={'controls':side.inner_text(),'detail':pg.locator('#scene-detail').inner_text(),'metrics':pg.locator('#metrics').inner_text(),'mission':pg.locator('#mission').inner_text(),
            'fields':side.evaluate('''s=>[...s.querySelectorAll('label,div[role=group]')].map(l=>({label:l.innerText.split('\\n')[0],options:[...l.querySelectorAll('option')].map(o=>o.textContent)}))''')}
        if scene=='phone':
            btn(pg,'运行全部').click()
            expect(pg.locator('.phone-table .phone-verdict[data-state=pass]')).to_have_count(5)
            out['rows']=pg.locator('.phone-table tbody tr').evaluate_all('''rs=>rs.map(r=>[r.querySelector('.phone-number').innerText,r.querySelector('.phone-name-cell input').value,r.querySelector('.phone-raw').value,r.querySelector('select').value,r.querySelector('.phone-verdict').innerText])''')
            out['code']=pg.locator('.phone-code-grid pre').all_inner_texts()
            for sel,n in [('.phone-table','cases'),('#phone-exchange','exchange')]:
                pg.locator(sel).screenshot(path=str(R/'visual'/(scene+'-'+n+'.png')),animations='disabled')
        if scene=='contract':
            out['yaml']=pg.locator('.ct-editor textarea').evaluate_all('es=>es.map(e=>e.value)')
            out['syntax']=pg.locator('.ct-editor-guide').inner_text()
            matrix=[]
            for label in ['原始实现','字段改名','新增字段','类型变化','状态码变化']:
                btn(pg,label).click();btn(pg,'运行验证').click()
                matrix.append([label,*pg.locator('.ct-results-table tbody tr td:last-child span.ct-verdict').all_inner_texts()])
                if label=='字段改名':
                    out['response']=pg.locator('#ct-response pre').inner_text();out['log']=pg.locator('.ct-log dl > div').all_inner_texts()
                    out['result']=pg.locator('.ct-results-table tbody tr').all_inner_texts()
            out['matrix']=matrix
        (R/'meta'/(scene+'-page.json')).write_text(json.dumps(out,ensure_ascii=False,indent=1))
        print(scene, len(data),'cards captured',flush=True)
        pg.close()
    br.close()
