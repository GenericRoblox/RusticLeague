import asyncio, base64, json, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={'width':320,'height':180})
        await pg.add_init_script("localStorage.setItem('rustic_settings', JSON.stringify({quality: 'low'}))")
        await pg.goto('http://localhost:8765/index.html')
        for i in range(400):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate('!!window.__rl'): break
        paints = await pg.evaluate("Object.keys(window.__rl.PAINTS)")
        only = sys.argv[1:] 
        for ty in ['coupe','van','buggy']:
            for pk in paints:
                if only and pk not in only: continue
                import os
                if os.path.exists(f'/home/claude/rl/assets/thumb_{ty}_{pk}.png'): continue
                url = await pg.evaluate("(async()=>window.__rl.studioShot('%s', window.__rl.PAINTS['%s'][0]))()" % (ty, pk))
                open(f'/home/claude/rl/assets/thumb_{ty}_{pk}.png','wb').write(base64.b64decode(url.split(',')[1])); print(ty, pk, flush=True)
        promo = await pg.evaluate("document.getElementById('promoImg').src")
        if promo and promo.startswith('data:'): open('/home/claude/rl/assets/promo.txt','w').write(promo)
        await b.close()
asyncio.run(main())
