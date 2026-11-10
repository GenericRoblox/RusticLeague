# Bakes the loading-screen title ("Rustic League" in Rubik Distressed, filled with the generated rust texture) into a
# WebP embedded by build.py at <!--LOADLOGO-->, so the loading screen shows it, textured, on the first frame.
# Also writes /tmp/emblem_preview.png and /tmp/wordmark_preview.png for checking.
# Needs: the test build served on :8765 (python3 build.py test; babylon.js next to it) and the font at test/rd.woff2
#   (npm pack @fontsource/rubik-distressed; files/rubik-distressed-latin-400-normal.woff2).
# usage: python3 tools/bakelogo.py [--no-write]
import asyncio, base64, io, re, sys
from PIL import Image
from playwright.async_api import async_playwright
CSS = open('src/index.html').read()
FONT = 'data:font/woff2;base64,' + base64.b64encode(open('test/rd.woff2', 'rb').read()).decode()  # inline: a blank page may not fetch fonts cross-origin
wm = re.search(r'\n(\.wordmark\{[^}]*\})', CSS).group(1)  # the game's own wordmark rule (not '#loading .wordmark')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        g = await b.new_page(viewport={'width':320,'height':180})
        await g.add_init_script("localStorage.setItem('rustic_settings', JSON.stringify({quality: 'low'}))")
        await g.goto('http://localhost:8765/index.html')
        for i in range(400):
            await g.wait_for_timeout(1000)
            if await g.evaluate('!!window.__rl'): break
        rust = await g.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--rustimg').trim()")
        emblem = await g.evaluate("document.querySelector('#emblemSlot svg').outerHTML")
        await g.close()
        pg = await b.new_page(viewport={'width':1400,'height':1400}, device_scale_factor=1)
        await pg.set_content(f"""<html><head><style>@font-face{{font-family:'Rubik Distressed';src:url({FONT}) format('woff2')}}
          :root{{--display:"Rubik Distressed";--rustimg:{rust}}} body{{margin:0;background:transparent}} {wm}
          #w{{display:inline-block;padding:30px 40px 40px}} #w .wordmark{{font-size:150px;white-space:nowrap}} #e{{display:inline-block;padding:10px}} #e svg{{width:520px;height:520px}}</style></head>
          <body><div id="w"><h1 class="wordmark">Rustic League</h1></div><div id="e">{emblem}</div></body></html>""")
        await pg.evaluate("document.fonts.load('150px \"Rubik Distressed\"')"); await pg.wait_for_timeout(800)
        assert await pg.evaluate("document.fonts.check('150px \"Rubik Distressed\"')"), 'font not loaded'
        bw = await pg.locator('#w').bounding_box(); be = await pg.locator('#e').bounding_box()
        await pg.screenshot(path='/tmp/wordmark_preview.png', clip=bw, omit_background=True)
        await pg.screenshot(path='/tmp/emblem_preview.png', clip=be, omit_background=True)
        await b.close()
    im = Image.open('/tmp/wordmark_preview.png').convert('RGBA'); im = im.crop(im.getbbox())  # trim to the drawn pixels
    im.thumbnail((900, 300)); buf = io.BytesIO(); im.save(buf, 'WEBP', quality=86, method=6)
    data = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
    print('wordmark', im.size, len(buf.getvalue()) // 1024, 'KB')
    if '--no-write' not in sys.argv: open('src/loadlogo.txt', 'w').write(data); print('wrote src/loadlogo.txt')
asyncio.run(main())
