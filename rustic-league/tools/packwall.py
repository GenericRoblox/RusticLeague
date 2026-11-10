import json, base64, io, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
m = json.load(open('assets/wall_meta.json')); W, H, PX, ROWH, ROWLEN = m['W'], m['H'], m['PX'], m['ROWH'], m['ROWLEN']
alb = np.frombuffer(open('assets/wall_albedo.raw','rb').read(), np.uint8).reshape(H, W, 3).astype(np.float32)
orm = np.frombuffer(open('assets/wall_orm.raw','rb').read(), np.uint8).reshape(H, W, 3).astype(np.float32)
nrm = Image.frombuffer('RGB', (W, H), open('assets/wall_normal.raw','rb').read(), 'raw', 'RGB', 0, 1)
rng = np.random.default_rng(7)
fontp = '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
signs = [  # (metres along the wall, metres up the profile, text, letter height m, colour)
  (14, 11.6, 'RUSTIC LEAGUE', 2.1, (232, 222, 196)), (62, 7.4, "HAYES FEED & SEED", 1.5, (210, 70, 50)), (97, 12.2, 'EST. 1958', 1.6, (236, 200, 90)),
  (138, 8.0, 'COUNTY JUNCTION 9', 1.3, (232, 222, 196)), (176, 12.0, "DEL'S SALVAGE", 1.9, (236, 200, 90)), (229, 7.6, 'NO DOGS ON THE PITCH', 1.1, (232, 222, 196)),
  (262, 12.3, 'GO MUDHENS', 2.2, (210, 70, 50)), (318, 8.2, 'PARTS - REPAIRS - TOWING', 1.2, (232, 222, 196)), (360, 11.8, 'FRESH EGGS', 1.8, (236, 200, 90)),
  (402, 7.0, 'SECTION C', 1.6, (232, 222, 196)), (447, 12.1, 'RUSTIC LEAGUE', 2.1, (232, 222, 196)), (490, 8.0, 'HOME OF THE HARVEST CUP', 1.2, (210, 70, 50)),
  (540, 12.0, 'EST. 1958', 1.6, (232, 222, 196)), (576, 7.5, 'MOW YOUR OWN LAWN', 1.2, (236, 200, 90)), (612, 12.0, 'SECTION F', 1.6, (232, 222, 196))]
layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for s, ym, text, lh, col in signs:
    row = int(s // ROWLEN); x0 = (s - row * ROWLEN) * PX
    f = ImageFont.truetype(fontp, int(lh * PX * 1.35))
    tw = int(f.getlength(text)) + 20; th = int(lh * PX * 1.9)
    tmp = Image.new('RGBA', (tw, th), (0, 0, 0, 0)); ImageDraw.Draw(tmp).text((10, 0), text, font=f, fill=col + (255,))
    tmp = tmp.transpose(Image.FLIP_TOP_BOTTOM)  # v increases up the wall, so flip to read upright
    if x0 + tw > W: x0 = W - tw - 4
    y0 = int(row * ROWH + ym * PX - th / 2)
    layer.alpha_composite(tmp, (int(x0), y0))
a = np.asarray(layer).astype(np.float32)
# weather the paint: blotchy breakup, worse where the steel underneath is rustier (darker)
n = rng.random((H // 8, W // 8)).astype(np.float32); n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))).astype(np.float32) / 255
grain = rng.random((H, W)).astype(np.float32)
lum = alb.mean(axis=2) / 255
keep = np.clip((n - 0.32) * 3, 0, 1) * np.clip((lum - 0.06) * 6, 0.25, 1) * (grain > 0.18)
al = a[..., 3:4] / 255 * 0.78 * keep[..., None]
alb = alb * (1 - al) + a[..., :3] * al
orm[..., 1:2] = orm[..., 1:2] * (1 - al) + 150 * al; orm[..., 2:3] = orm[..., 2:3] * (1 - al)
def enc(img, q):
    b = io.BytesIO(); img.save(b, 'WEBP', quality=q, method=6); return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
ia = Image.fromarray(alb.clip(0, 255).astype(np.uint8)); io_ = Image.fromarray(orm.clip(0, 255).astype(np.uint8)).resize((W // 2, H // 2), Image.BILINEAR)
ia.resize((1024, 560)).save('/tmp/wall_preview.png')
d = {'albedo': enc(ia, 80), 'normal': enc(nrm.resize((W // 2, H // 2), Image.BILINEAR), 72), 'orm': enc(io_, 78), 'meta': m}
open('src/walltex.js', 'w').write('// Pre-baked, non-repeating arena wall texture (generated offline by tests/genwall.js + packwall.py)\nwindow.RL_WALL = ' + json.dumps(d) + ';\n')
print({k: len(v) // 1024 for k, v in d.items() if k != 'meta'}, 'KB')
