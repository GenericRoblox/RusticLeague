import sys, asyncio, time, json
from playwright.async_api import async_playwright
SHOTS = json.loads(open(sys.argv[1]).read())
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={'width':960,'height':540})
        await pg.add_init_script("localStorage.setItem('rustic_settings', JSON.stringify({quality: '%s'}))" % sys.argv[2])
        logs=[]; pg.on('pageerror', lambda e: logs.append('PAGEERROR: '+str(e))); pg.on('console', lambda m: logs.append(m.text) if m.type=='error' else None)
        await pg.goto('http://localhost:8765/index.html')
        for i in range(300):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate('!!window.__rl'): break
        await pg.evaluate("document.querySelectorAll('.layer').forEach(e=>e.style.display='none')")
        for s in SHOTS:
            if 'js' in s: await pg.evaluate(s['js'])
            await pg.evaluate("window.__rl.debugCam=%s" % json.dumps(s['cam']))
            await pg.wait_for_timeout(s.get('wait',2500))
            await pg.screenshot(timeout=180000, path='/tmp/'+s['name']+'.png')
        for l in logs[-10:]: print(l[:300])
        await b.close()
asyncio.run(main())
