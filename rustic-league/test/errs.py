import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={'width':400,'height':240})
        await pg.add_init_script("localStorage.setItem('rustic_settings', JSON.stringify({quality: 'low'}))")
        logs=[]; pg.on('pageerror', lambda e: logs.append('PAGEERROR: '+str(e))); pg.on('console', lambda m: logs.append(m.type+': '+m.text) if m.type in ('error','warning') else None)
        await pg.goto('http://localhost:8765/index.html')
        for i in range(270):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate('!!window.__rl'): break
        print('ready', await pg.evaluate('!!window.__rl'), await pg.evaluate("document.getElementById('loadMsg').textContent"))
        for l in logs:
            if 'GL Driver' in l or 'GPU stall' in l or 'ERR_NAME' in l: continue
            print(l[:300])
        await b.close()
asyncio.run(main())
