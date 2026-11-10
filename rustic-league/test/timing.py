import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={'width':320,'height':180})
        await pg.add_init_script("localStorage.setItem('rustic_settings', JSON.stringify({quality: 'medium'}))")
        await pg.goto('http://localhost:8765/index.html')
        for i in range(290):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate('!!window.__rl'): break
        print('workers', await pg.evaluate('window.__poolN')); log = await pg.evaluate('window.__tlog'); prev=0
        for l in log:
            n,t = l.rsplit(' ',1); t=int(t); print(f'{t-prev:6d} ms  {n}'); prev=t
        print('thumb src set:', await pg.evaluate("[...document.querySelectorAll('.thumb img')].map(i=>!!i.src)"))
        await b.close()
asyncio.run(main())
