import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={'width':1000,'height':600})
        await pg.add_init_script("localStorage.setItem('rustic_settings', JSON.stringify({quality: 'low', teamSize: 2})); localStorage.setItem('rustic_profile', JSON.stringify({name:'T', named:true}))")
        logs=[]; pg.on('pageerror', lambda e: logs.append('PAGEERROR: '+str(e)))
        await pg.goto('http://localhost:8765/index.html')
        for i in range(280):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate('!!window.__rl'): break
        await pg.evaluate("document.querySelector('[data-act=play]').click()"); await pg.wait_for_timeout(1500)
        await pg.evaluate("document.getElementById('kickoffBtn').click()")
        for i in range(120):
            await pg.wait_for_timeout(1000)
            st = await pg.evaluate("window.__rl.state()")
            if st in ('countdown','play'): break
        print('after clicking KICK OFF:', st, '| toast:', await pg.evaluate("document.getElementById('touchNote').classList.contains('hidden') ? 'none' : document.getElementById('touchNote').textContent"), '| cars', await pg.evaluate("window.__rl.sim.cars.length"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1000); await pg.evaluate("document.getElementById('restartBtn').click()")
        for i in range(120):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate("window.__rl.state()") in ('countdown','play') and await pg.evaluate("document.getElementById('loading').classList.contains('hidden')"): break
        t0 = await pg.evaluate('window.__rl.sim.time'); await pg.wait_for_timeout(15000); t1 = await pg.evaluate('window.__rl.sim.time')
        print('sim advancing after restart (no Esc):', round(t1-t0,2), 's of game time; state', await pg.evaluate('window.__rl.state()'))
        print('after RESTART MATCH:', await pg.evaluate("window.__rl.state()"), '| toast:', await pg.evaluate("document.getElementById('touchNote').classList.contains('hidden') ? 'none' : document.getElementById('touchNote').textContent"))
        print(logs[-5:])
        await b.close()
asyncio.run(main())
