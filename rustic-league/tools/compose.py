import sys, glob, base64, io, json, os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
def compose(path):
    car = Image.open(path).convert('RGBA'); W,H = car.size
    y = np.linspace(0,1,H)[:,None]; x = np.linspace(-1,1,W)[None,:]
    top = np.array([0.24,0.16,0.20]); bot = np.array([0.09,0.06,0.07])
    g = top*(1-y[...,None]) + bot*y[...,None]; g = np.broadcast_to(g,(H,W,3)).copy()
    glow = np.exp(-((x*0.9)**2 + ((y-0.55)*2.2)**2))[...,None]*np.array([0.42,0.22,0.12]); g = np.clip(g + glow*0.55, 0, 1)
    bg = Image.fromarray((g*255).astype(np.uint8)).convert('RGBA')
    a = np.asarray(car)[...,3]; ys,xs = np.nonzero(a>8)
    sh = Image.new('L',(W,H),0); d = ImageDraw.Draw(sh); by=ys.max()
    d.ellipse([xs.min()+10, by-18, xs.max()-10, by+14], fill=150); sh = sh.filter(ImageFilter.GaussianBlur(14))
    bg = Image.composite(Image.new('RGBA',(W,H),(0,0,0,255)), bg, sh)
    bg.alpha_composite(car); return bg.convert('RGB').resize((384,216), Image.LANCZOS)
if __name__ == '__main__':
    out = {}
    for f in sorted(glob.glob('/home/claude/rl/assets/thumb_*.png')):
        ty, pk = os.path.basename(f)[6:-4].split('_', 1); im = compose(f); b = io.BytesIO(); im.save(b, 'WEBP', quality=82, method=6)
        out.setdefault(ty, {})[pk] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
    open('/home/claude/rl/src/thumbs.js','w').write('// Pre-rendered garage photos: every car in every paint (test/studio.py + tests/compose.py)\nwindow.RL_THUMBS = ' + json.dumps(out) + ';\n')
    print({t: len(v) for t, v in out.items()}, sum(len(x) for v in out.values() for x in v.values())//1024, 'KB')
    if len(sys.argv) > 1: 
        ims=[compose(f'/home/claude/rl/assets/thumb_{t}_maroon.png') for t in ['coupe','van','buggy']]; W=Image.new('RGB',(1152,216)); [W.paste(m,(i*384,0)) for i,m in enumerate(ims)]; W.save('/tmp/thumbs3.png')
