from pathlib import Path
import fitz, json, re
from PIL import Image,ImageDraw
from zipfile import ZipFile
from lxml import etree as E
from collections import Counter
import unicodedata as U
d=fitz.open('qa/portable/complete.pdf');manifest=json.load(open('meta/slide-manifest.json'));assert len(d)==len(manifest)
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
def norm(s):return ''.join(c for c in U.normalize('NFKC',s) if not c.isspace() and c not in '\u00ad\u200b\ufeff\u2028')
missing=[];sparse=[];outside=[]
with ZipFile('out/complete.pptx') as z:
 for m,pg in zip(manifest,d):
    n=m['n'];x=E.fromstring(z.read('ppt/slides/slide%d.xml'%n));boxes=pg.get_text('dict',flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)['blocks'];raw=pg.get_text('text'); actual=norm(raw)
    if len(actual)<38:sparse.append((n,raw[:45]))
    avail=Counter(actual)
    if m['kind']=='movie':
        assert len(pg.get_images())>=1,('missing key frame in exported presentation',n)
    full=''.join(x.xpath('.//p:sp/p:txBody//a:t/text()|.//a:tc/a:txBody//a:t/text()',namespaces=ns));bad=Counter(norm(full))-avail
    # Some font encodings convert a dash to an ASCII minus in PDF.
    if sum(bad.values())>0:missing.append((n,sum(bad.values()),str(bad)[:170]))
    for b in boxes:
      for l in b.get('lines',[]):
        for sp in l['spans']:
          r=fitz.Rect(sp['bbox']);t=sp['text'].strip()
          if t and (r.x0<0 or r.y0<0 or r.x1>pg.rect.width+1 or r.y1>pg.rect.height+.6):outside.append((n,t[:28],str(r)))
    if n in [1,2,5,15,26,33,35,37,42,43,48,55,59,66,67,69,70,73,75,79,82]:
      pg.get_pixmap(matrix=fitz.Matrix(1.0,1.0),alpha=False).save('qa/slide-%02d.png'%n)
    if n in [1,2,26,35,48,75,82]:Path('qa/text-%02d.txt'%n).write_text(raw)
for tag,sel in [('teaching',[m for m in manifest if m['kind']=='story']),('experiments',[m for m in manifest if m['kind'] in ['control','result','hpa','curve','istio']]),('testing',[m for m in manifest if m['chapter'] in ['phone','contract']]),('movies',[m for m in manifest if m['kind']=='movie'])]:
 for start in range(0,len(sel),12):
    sub=sel[start:start+12];cols=3;ww,hh=410,231;out=Image.new('RGB',(cols*ww,((len(sub)+cols-1)//cols)*(hh+21)), '#dedbe3');dr=ImageDraw.Draw(out)
    for i,m in enumerate(sub):
      pg=d[m['n']-1];pm=pg.get_pixmap(matrix=fitz.Matrix(ww/pg.rect.width,ww/pg.rect.width),alpha=False);im=Image.frombytes('RGB',(pm.width,pm.height),pm.samples);px=i%3*ww;py=i//3*(hh+21);out.paste(im,(px,py));dr.text((px+6,py+hh+2),str(m['n'])+'  '+m['chapter']+'  '+(m['id'] or m['kind']),fill='#34303e')
    out.save('qa/contact-'+tag+'-'+str(start//12+1)+'.jpg',quality=87)
print('pages:',len(d),'insufficient text:',sparse,'text outside slide:',outside)
print('character differences:',missing)
