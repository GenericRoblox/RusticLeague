# Car close-up contact sheets via studioShot views (serve the test build on :8765). usage: python3 test/carshots.py out_prefix [coupe van buggy]  (VIEWS env: json of {name: {yaw, el, dist, look}})
# render cars from several angles into contact sheets: python3 carshots.py out_prefix [types...] ; views from VIEWS env (json) or default set
import asyncio, base64, json, sys, os, io
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
DEF = {
 'front34': dict(yaw=0.7, el=0.25), 'rear34': dict(yaw=2.5, el=0.25), 'side': dict(yaw=1.5708, el=0.05), 'rear': dict(yaw=3.1416, el=0.1),
 'front': dict(yaw=0.0, el=0.1), 'under': dict(yaw=0.6, el=-1.1), 'top': dict(yaw=0.3, el=1.2), 'rearlow': dict(yaw=2.8, el=-0.15)}
async def main():
    out = sys.argv[1]; types = sys.argv[2:] or ['coupe', 'van', 'buggy']
    views = json.loads(os.environ['VIEWS']) if os.environ.get('VIEWS') else DEF
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={'width':320,'height':180})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("localStorage.setItem('rustic_settings', JSON.stringify({quality: 'low'}))")
        await pg.goto('http://localhost:8765/index.html')
        for i in range(400):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate('!!window.__rl'): break
        for ty in types:
            tiles = []
            for name, v in views.items():
                v = dict(v); v.setdefault('w', 480); v.setdefault('h', 300)
                url = await pg.evaluate("(async()=>window.__rl.studioShot('%s', window.__rl.PAINTS[Object.keys(window.__rl.PAINTS)[0]][0], %s))()" % (ty, json.dumps(v)))
                im = Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGBA')
                bg = Image.new('RGBA', im.size, (120, 130, 140, 255)); bg.alpha_composite(im); d = ImageDraw.Draw(bg); d.text((6, 4), f'{ty} {name}', fill=(255, 255, 255, 255))
                tiles.append(bg.convert('RGB'))
            cols = 4 if len(tiles) > 3 else len(tiles); rows = (len(tiles) + cols - 1) // cols
            sheet = Image.new('RGB', (cols * tiles[0].width, rows * tiles[0].height), (0, 0, 0))
            for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * t.width, (i // cols) * t.height))
            sheet.save(f'{out}_{ty}.png'); print('saved', f'{out}_{ty}.png', flush=True)
        if errs: print('PAGE ERRORS', errs[:3])
        await b.close()
asyncio.run(main())
