import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={'width':844,'height':390}, is_mobile=True, has_touch=True); pg = await ctx.new_page()
        await pg.add_init_script("localStorage.setItem('rustic_settings', JSON.stringify({quality:'low'})); localStorage.setItem('rustic_profile', JSON.stringify({name:'Thumbs', named:true}))")
        logs=[]; pg.on('pageerror', lambda e: logs.append('PAGEERROR: '+str(e)))
        await pg.goto('http://localhost:8765/index.html')
        for i in range(280):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate('!!window.__rl'): break
        await pg.evaluate("window.__rl.startMatch()")
        for i in range(120):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate("window.__rl.state()") == 'play': break
        cdp = await ctx.new_cdp_session(pg)
        B = {x[0]:x[1:] for x in await pg.evaluate("[...document.querySelectorAll('#touch .tb')].map(b=>{const r=b.getBoundingClientRect(); return [b.dataset.k, r.left+r.width/2, r.top+r.height/2]})")}
        held = lambda: pg.evaluate("[...document.querySelectorAll('#touch .tb.on')].map(b=>b.dataset.k).join(',') || 'none'")
        tp = lambda pts: [{'x':x,'y':y,'id':i} for i,(x,y) in pts]
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':tp([(1,B['gas'])])}); await pg.wait_for_timeout(600); print('gas down:', await held())
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':tp([(1,B['gas']),(2,B['left'])])}); await pg.wait_for_timeout(600); print('gas + left:', await held())
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':tp([(1,(400,150)),(2,B['left'])])}); await pg.wait_for_timeout(600); print('gas finger slid onto the track:', await held())
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':tp([(2,B['left'])])}); await pg.wait_for_timeout(600)
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); await pg.wait_for_timeout(600); print('all fingers up:', await held(), '| input', await pg.evaluate("JSON.stringify(window.__rl.sim.cars[0].input)"))
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':tp([(3,B['gas'])])}); await pg.wait_for_timeout(500)
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchCancel','touchPoints':[]}); await pg.wait_for_timeout(500); print('after touchcancel:', await held())
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':tp([(4,B['menu'])])}); await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); await pg.wait_for_timeout(800)
        print('menu tap paused:', await pg.evaluate("!document.getElementById('pause').classList.contains('hidden')"), '| zoom scale', await pg.evaluate("window.visualViewport ? visualViewport.scale : 1"))
        print(logs[-3:]); await b.close()
asyncio.run(main())
