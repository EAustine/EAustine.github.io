import json, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from PIL import Image, ImageDraw, ImageFont

SP="/tmp/claude-0/-home-claude/22a17a97-6ada-5c1d-9cfb-893f580dfd9e/scratchpad"
S=json.load(open(SP+"/sole.json")); PTS=S['pts']; ASP=S['aspect']
INK=(20,24,26); PAPER=(243,245,242); BLOOD=(107,34,48)
SERIFB="/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
out="assets/brand/"

# ---------- glyph outline for the vector mark ----------
ft=TTFont(SERIFB); gs=ft.getGlyphSet(); upm=ft['head'].unitsPerEm
gname=ft.getBestCmap()[ord('M')]
bp=BoundsPen(gs); gs[gname].draw(bp); x0,y0,x1,y1=bp.bounds
pen=SVGPathPen(gs); gs[gname].draw(pen); raw=pen.getCommands()

gw,gh=x1-x0,y1-y0
TARGET=0.52                      # cap height as a fraction of the tile
k=TARGET/gh
tx=0.5-(x0+gw/2)*k
ty=0.5+(y0+gh/2)*k               # svg y runs down, glyph y runs up
transform='translate(%.5f %.5f) scale(%.6f %.6f)'%(tx,ty,k,-k)

def tile_svg():
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">'
            '<rect width="1" height="1" rx="0.22" fill="#14181A"/>'
            '<g transform="%s"><path d="%s" fill="#F3F5F2"/></g>'
            '</svg>')%(transform,raw)
open(out+"favicon.svg","w").write(tile_svg())

# ---------- raster tiles ----------
def tile(size, cap=0.52, radius=0.22, bg=INK, fg=PAPER, square=True):
    SS=8; P=size*SS
    im=Image.new('RGBA',(P,P),(0,0,0,0)); d=ImageDraw.Draw(im)
    if square: d.rounded_rectangle([0,0,P-1,P-1],radius=int(P*radius),fill=bg)
    # size the font so the M cap height lands exactly on `cap`
    probe=ImageFont.truetype(SERIFB,200)
    bb=probe.getbbox("M"); ch=bb[3]-bb[1]
    fs=int(200*(P*cap)/ch)
    f=ImageFont.truetype(SERIFB,fs)
    bb=f.getbbox("M")
    d.text(((P-(bb[2]-bb[0]))/2-bb[0], (P-(bb[3]-bb[1]))/2-bb[1]),"M",font=f,fill=fg)
    return im.resize((size,size),Image.LANCZOS)

for n,s,c in [("favicon-16.png",16,0.60),("favicon-32.png",32,0.56),("favicon-48.png",48,0.54),
              ("apple-touch-icon.png",180,0.50),("icon-192.png",192,0.50),("icon-512.png",512,0.50)]:
    tile(s,cap=c).save(out+n)
tile(512,cap=0.34,radius=0.50).save(out+"icon-maskable-512.png")
ims=[tile(s,cap=(0.60 if s<24 else 0.56)) for s in (16,24,32,48,64)]
ims[0].save(out+"favicon.ico",format='ICO',sizes=[(s,s) for s in (16,24,32,48,64)],append_images=ims[1:])

# ---------- sole device, kept for large formats ----------
def sole(cx,cy,h,flip=False):
    w=h/ASP; p=[]
    for px,py in PTS:
        p.append((cx+(py-0.5)*w, cy+((0.5-px) if not flip else (px-0.5))*h))
    return p

# ---------- social card ----------
W,H=1200,630
og=Image.new('RGB',(W,H)); d=ImageDraw.Draw(og)
for y in range(H):
    t=(y/H)**1.35
    d.line([(0,y),(W,y)],fill=(int(243+(197-243)*t),int(245+(203-245)*t),int(242+(196-242)*t)))
ghost=Image.new('RGBA',(W,H),(0,0,0,0))
ImageDraw.Draw(ghost).polygon(sole(962,315,520),fill=(20,24,26,26))
og=Image.alpha_composite(og.convert('RGBA'),ghost).convert('RGB'); d=ImageDraw.Draw(og)
m=tile(132); og.paste(m,(96,86),m)
d.text((96,300),"Marlowe",font=ImageFont.truetype(SERIFB,96),fill=INK)
d.text((101,430),"The Ashwell Oxford",font=ImageFont.truetype(SANS,32),fill=(92,99,96))
d.text((101,482),"A made-to-order oxford, configured in 3D in the browser",
       font=ImageFont.truetype(SANS,24),fill=(122,129,125))
d.line([(101,545),(249,545)],fill=BLOOD,width=3)
og.save(out+"og-image.png",optimize=True)

# contact sheet
sheet=Image.new('RGB',(620,230),(255,255,255))
x=26
for n,s in [("favicon-16.png",16),("favicon-32.png",32),("favicon-48.png",48),("apple-touch-icon.png",180)]:
    im=Image.open(out+n).convert('RGBA'); sheet.paste(im,(x,30),im)
    b=im.resize((min(s*7,140),min(s*7,140)),Image.NEAREST); sheet.paste(b,(x,80),b)
    x+=150
sheet.save("/tmp/icons_sheet.png")
print("done")
