from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E
from pptx.oxml import parse_xml
import re
src=Path('out/base.pptx');dst=Path('out/classroom.pptx')
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
count=0
with ZipFile(src) as s, ZipFile(dst,'w') as w:
    for part in s.infolist():
        raw=s.read(part.filename)
        if re.fullmatch(r'ppt/slides/slide[0-9]+\.xml',part.filename) and b'<a:videoFile' in raw:
            slide=parse_xml(raw)
            for pic in slide.xpath('.//p:pic'):
                if not pic.xpath('.//a:videoFile'):continue
                slide.get_or_add_childTnLst().add_video(pic.shape_id)
                count+=1
            raw=E.tostring(slide,encoding='UTF-8',xml_declaration=True,standalone=True)
        w.writestr(part,raw)
assert count==30
print(dst,count,'embedded click-to-play movies')
