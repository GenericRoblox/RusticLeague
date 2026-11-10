import asyncio, time
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
async def page(b, name, mobile):
    kw = dict(viewport={'width':844,'height':390}, is_mobile=True, has_touch=True) if mobile else dict(viewport={'width':900,'height':500})
    ctx = await b.new_context(**kw); pg = await ctx.new_page()
    await pg.add_init_script("localStorage.setItem('rustic_settings', JSON.stringify({quality:'low', teamSize:1})); localStorage.setItem('rustic_profile', JSON.stringify({name:'%s', named:true}))" % name)
    await pg.goto('http://localhost:8790/index.html'); return pg
async def ready(pg):
    for i in range(400):
        await pg.wait_for_timeout(1000)
        if await pg.evaluate('!!window.__rl'): return
async def code(pg):
    for i in range(30):
        await pg.wait_for_timeout(1000)
        c = await pg.evaluate("document.getElementById('lobCode').textContent")
        if '-' not in c: return c
lst = lambda pg: pg.evaluate("document.getElementById('lanList').innerText.replace(/\\n/g,' ')")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await page(b, 'Desk', False); M = await page(b, 'Phone', True)
        await ready(A); await ready(M)
        await M.evaluate("document.querySelector('[data-act=lan]').click()"); await M.wait_for_timeout(600); await M.evaluate("document.getElementById('hostBtn').click()"); await code(M)
        await A.evaluate("document.querySelector('[data-act=lan]').click()"); await A.wait_for_timeout(4000); print('desk sees:', await lst(A), flush=True)
        await M.evaluate("document.getElementById('lobLeave').click()"); await A.wait_for_timeout(4500); print('4.5 s after the phone host left:', await lst(A), flush=True)
        await A.wait_for_timeout(12000); print('16 s after:', await lst(A), flush=True)
        await A.evaluate("document.getElementById('hostBtn').click()"); await code(A)
        await M.evaluate("document.querySelector('[data-act=lan]').click()"); await M.wait_for_timeout(4500)
        await M.evaluate("document.querySelector('.lanitem') && document.querySelector('.lanitem').click()"); await M.wait_for_timeout(300); await M.evaluate("document.getElementById('hostBtn').click()")
        for i in range(60):
            await M.wait_for_timeout(1000)
            if await M.evaluate("!document.getElementById('lobby').classList.contains('hidden')"): break
        await A.wait_for_timeout(2000); await A.evaluate("document.getElementById('lobStart').click()")
        seen=[]; t0=time.time()
        for i in range(400):
            await A.wait_for_timeout(400)
            sa = await A.evaluate("window.__rl.state()"); sm = await M.evaluate("window.__rl.state()")
            if not seen or seen[-1] != (sa, sm): seen.append((sa, sm)); print(f'  t+{time.time()-t0:5.1f}s host={sa:9s} phone={sm}', flush=True)
            if sa == 'play' and sm == 'play': break
        cam = await M.evaluate("(()=>{const s=window.__rl.sim, cp=window.__rl.camera.position; let best=-1,bd=1e9; s.cars.forEach((c,i)=>{const d=Math.hypot(c.pos.x-cp.x,c.pos.z-cp.z); if(d<bd){bd=d;best=i;}}); return best+' at '+bd.toFixed(1)+' m';})()")
        print('phone camera nearest car:', cam, '| touch controls up:', await M.evaluate("!document.getElementById('touch').classList.contains('hidden')"), flush=True)
        await b.close()
asyncio.run(main())
