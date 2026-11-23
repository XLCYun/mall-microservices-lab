from lxml import etree as E
from zipfile import ZipFile, ZIP_DEFLATED
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset
from io import BytesIO
from struct import pack,unpack_from
import re,sys,copy
P='{http://schemas.openxmlformats.org/presentationml/2006/main}';D='{http://schemas.openxmlformats.org/drawingml/2006/main}';R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}';REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
def eot(tdata):
    f=TTFont(BytesIO(tdata));o=f['OS/2'];assert o.fsType==0
    pan=o.panose
    fields=['bFamilyType','bSerifStyle','bWeight','bProportion','bContrast','bStrokeVariation','bArmStyle','bLetterForm','bMidline','bXHeight']
    pbytes=bytes(getattr(pan,v) for v in fields)
    hdr=pack('<4I10sBBIHH7I4I',0,len(tdata),0x20001,0,pbytes,1,0,o.usWeightClass,o.fsType,0x504c,*[getattr(o,'ulUnicodeRange'+str(i)) for i in (1,2,3,4)],o.ulCodePageRange1,o.ulCodePageRange2,f['head'].checkSumAdjustment,0,0,0,0)
    for nid in (1,2,5,4):
        nm=f['name'].getName(nid,3,1,1033).toUnicode().encode('utf-16le');hdr+=pack('<HH',0,len(nm))+nm
    hdr+=pack('<HH',0,0)
    return pack('<I',len(hdr)+len(tdata))+hdr[4:]+tdata
def build_fonts(z):
    text=''.join(''.join(E.fromstring(z.read(n)).itertext()) for n in z.namelist() if re.fullmatch(r'ppt/(?:slides/slide|notesSlides/notesSlide|charts/chart)[0-9]+\.xml',n))+' '+''.join(chr(i) for i in range(32,127))
    f=TTFont('qa/font-variable.ttf');opt=subset.Options();opt.name_IDs=['*'];opt.name_languages=['*'];opt.layout_features=['*']; sub=subset.Subsetter(options=opt);sub.populate(text=text);sub.subset(f)
    files={}
    for weight,style in [(400,'Regular'),(700,'Bold')]:
        font=instantiateVariableFont(f,{'wght':weight},inplace=False,updateFontNames=True)
        for rec in font['name'].names:
            val={1:'Noto Sans SC',2:style,4:'Noto Sans SC '+style,6:'NotoSansSC-'+style,16:'Noto Sans SC',17:style}.get(rec.nameID)
            if val:rec.string=val.encode(rec.getEncoding(),errors='replace')
        if style=='Bold':
            font['OS/2'].fsSelection=(font['OS/2'].fsSelection|32)&~64;font['head'].macStyle|=1
        font['name'].setName(Path(__file__).with_name("OFL-NotoSansSC.txt").read_text(encoding="utf-8"),13,3,1,1033)
        b=BytesIO();font.save(b);out=b.getvalue();files[style]=eot(out)
        Path('qa/fonts/NotoSansSC-'+style+'-Subset.ttf').write_bytes(out)
        print(style,font['maxp'].numGlyphs,'glyphs,',len(files[style]),'bytes',flush=True)
    return files
if __name__=='__main__':
    src,dst=map(Path,sys.argv[1:])
    with ZipFile(src) as z:
        fonts=build_fonts(z);prs=E.fromstring(z.read('ppt/presentation.xml'));rel=E.fromstring(z.read('ppt/_rels/presentation.xml.rels'));ct=E.fromstring(z.read('[Content_Types].xml'))
        prs.set('embedTrueTypeFonts','1');prs.set('saveSubsetFonts','1')
        ix=prs.index(prs.find(P+'defaultTextStyle'));fl=E.Element(P+'embeddedFontLst');prs.insert(ix,fl);embed=E.SubElement(fl,P+'embeddedFont');E.SubElement(embed,P+'font',typeface='Noto Sans SC',pitchFamily='34',charset='-122')
        rid=1+max(int(re.sub('[^0-9]','',e.get('Id'))) for e in rel)
        binary={}
        for i,style in enumerate(fonts,1):
            fontrel='rId'+str(rid+i-1);part='fonts/font'+str(i)+'.fntdata'
            E.SubElement(embed,P+style.lower(),{R+'id':fontrel})
            E.SubElement(rel,rel[0].tag,Id=fontrel,Type=REL+'font',Target=part)
            binary['ppt/'+part]=fonts[style]
        E.SubElement(ct,ct.tag.replace('Types','Default'),Extension='fntdata',ContentType='application/x-fontdata')
        prefer={'ppt/presentation.xml':prs,'ppt/_rels/presentation.xml.rels':rel,'[Content_Types].xml':ct}
        with ZipFile(dst,'w',compression=ZIP_DEFLATED,compresslevel=6) as output:
            for info in z.infolist():
                data=E.tostring(prefer[info.filename],encoding='UTF-8',xml_declaration=True,standalone=True) if info.filename in prefer else z.read(info.filename)
                output.writestr(info,data)
            for name,content in binary.items():output.writestr(name,content)
