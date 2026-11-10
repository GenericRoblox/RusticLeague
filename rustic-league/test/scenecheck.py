# Arena and lighting checks: renders scene views with a chosen lighting preset, plus car views. usage: python3 test/scenecheck.py out.png <json list of shots>
import asyncio, base64, io, json, sys
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
SHOTS = json.loads(sys.argv[2]); OUT = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={'width':320,'height':180}); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("localStorage.setItem('rustic_settings', JSON.stringify({quality: 'low'}))")
        await pg.goto('http://localhost:8765/index.html')
        for i in range(400):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate('!!window.__rl'): break
        tiles=[]
        for sh in SHOTS:
            if sh['kind'] == 'car':
                url = await pg.evaluate("(async()=>window.__rl.studioShot('%s', window.__rl.PAINTS[Object.keys(window.__rl.PAINTS)[0]][0], %s))()" % (sh['car'], json.dumps(sh['view'])))
            else:
                url = await pg.evaluate("""(async()=>{ const R = window.__rl, B = BABYLON; if (R.settings) { R.settings.lighting = '%s'; R.settings.flood = 'auto'; } R.applyLighting();
                  const cam = new B.UniversalCamera('chk', new B.Vector3(...%s), R.scene); cam.setTarget(new B.Vector3(...%s)); cam.fov = %s; cam.maxZ = 2000;
                  const ipc = R.scene.imageProcessingConfiguration, L = { night: 1.75, sunset: 1.3, day: 1.0, overcast: 1.18 }['%s'] || 1.3; ipc.applyByPostProcess = false; ipc.toneMappingEnabled = true; ipc.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES; ipc.exposure = L; ipc.contrast = 1.18;
                  for (let k = 0; k < 3; k++) R.scene.render();
                  const u = await B.Tools.CreateScreenshotUsingRenderTargetAsync(R.engine, cam, { width: 560, height: 330 }, 'image/png', 1, true); cam.dispose(); return u; })()""" % (sh['light'], json.dumps(sh['pos']), json.dumps(sh['look']), sh.get('fov', 0.9), sh['light']))
            im = Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGBA'); bg = Image.new('RGBA', im.size, (120,130,140,255)); bg.alpha_composite(im)
            im = bg.convert('RGB').resize((560, 330)); ImageDraw.Draw(im).text((6,4), sh['name'], fill=(255,255,0)); tiles.append(im); print('shot', sh['name'], flush=True)
        cols = 2; rows = (len(tiles)+1)//2; sheet = Image.new('RGB', (cols*560, rows*330))
        for i,t in enumerate(tiles): sheet.paste(t, ((i%cols)*560, (i//cols)*330))
        sheet.save(OUT); print('errors', errs[:3])
        await b.close()
asyncio.run(main())
