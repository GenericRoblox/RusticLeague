import asyncio, sys, json
from playwright.async_api import async_playwright
DEV = {'phone': dict(viewport={'width':844,'height':390}, device_scale_factor=1, is_mobile=True, has_touch=True),
       'tablet': dict(viewport={'width':1180,'height':820}, device_scale_factor=1, is_mobile=True, has_touch=True)}
async def main(dev, layout):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        ctx = await b.new_context(**DEV[dev]); pg = await ctx.new_page()
        await pg.add_init_script("localStorage.setItem('rustic_settings', JSON.stringify({quality:'low', touchLayout:'%s'}))" % layout)
        logs=[]; pg.on('pageerror', lambda e: logs.append('PAGEERROR: '+str(e)))
        await pg.goto('http://localhost:8765/index.html')
        for i in range(280):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate('!!window.__rl'): break
        await pg.wait_for_timeout(1500)
        print(dev, layout, 'name prompt shown:', await pg.evaluate("!document.getElementById('namePrompt').classList.contains('hidden')"))
        await pg.screenshot(path=f'/tmp/m_{dev}_name.png', timeout=120000)
        await pg.fill('#nameFirst', 'Thumbs'); await pg.evaluate("document.getElementById('nameGo').click()"); await pg.wait_for_timeout(800)
        await pg.screenshot(path=f'/tmp/m_{dev}_menu.png', timeout=120000)
        await pg.evaluate("window.__rl.startMatch()")
        for i in range(120):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate("window.__rl.state()") == 'play': break
        btns = await pg.evaluate("[...document.querySelectorAll('#touch .tb')].map(b=>{const r=b.getBoundingClientRect(); return [b.dataset.k, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]})")
        print('touch visible:', await pg.evaluate("!document.getElementById('touch').classList.contains('hidden')"), 'buttons:', btns)
        await pg.screenshot(path=f'/tmp/m_{dev}_{layout}.png', timeout=120000)
        gas = next(x for x in btns if x[0] in ('gas','w'))
        z0 = await pg.evaluate("window.__rl.sim.cars[0].pos.z")
        cx, cy = gas[1]+gas[3]//2, gas[2]+gas[4]//2
        await pg.evaluate(f"document.getElementById('touch').dispatchEvent(new PointerEvent('pointerdown', {{pointerId: 7, clientX: {cx}, clientY: {cy}, bubbles: true, pointerType: 'touch'}}))")
        await pg.wait_for_timeout(6000)
        on = await pg.evaluate("[...document.querySelectorAll('#touch .tb.on')].map(b=>b.dataset.k)")
        await pg.evaluate(f"document.getElementById('touch').dispatchEvent(new PointerEvent('pointerup', {{pointerId: 7, clientX: {cx}, clientY: {cy}, bubbles: true, pointerType: 'touch'}}))")
        z1 = await pg.evaluate("window.__rl.sim.cars[0].pos.z")
        print('held', on, 'car moved', round(z1-z0,1), 'm forward')
        print(logs[-4:])
        await b.close()
asyncio.run(main(sys.argv[1], sys.argv[2]))
