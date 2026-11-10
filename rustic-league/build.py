import sys, os
# usage: python3 build.py [test|vtest|vercel|prod]
#   test   -> test/index.html    (loads ./babylon.js next to it; download babylonjs@9.31.0/babylon.js there)
#   vtest  -> vercel/index.html  (local babylon.js, for the dev server)
#   vercel -> vercel/index.html  (Babylon from the CDN; this is what you deploy)
#   prod   -> dist/rustic-league.html (single self-contained page, Babylon from the CDN)
mode = sys.argv[1] if len(sys.argv)>1 else 'test'
src = open('src/index.html').read()
babylon = '<script src="babylon.js"></script>' if mode in ('test','vtest') else '<script src="https://cdn.jsdelivr.net/npm/babylonjs@9.31.0/babylon.js"></script>'
parts = [babylon]
for f in ['walltex.js','skytex.js','thumbs.js','net.js','sim.js','bot.js','tex.js','meshes.js','car3d.js','world.js','audio.js','game.js']:
    parts.append('<script id="src-'+f+'">\n'+open('src/'+f).read()+'\n</script>')
out = src.replace('<!--SCRIPTS-->','\n'.join(parts))
out = out.replace('<!--LOADLOGO-->', open('src/loadlogo.txt').read().strip())  # loading-screen title, baked by tools/bakelogo.py
path = {'test':'test/index.html','vtest':'vercel/index.html','vercel':'vercel/index.html'}.get(mode, 'dist/rustic-league.html')
os.makedirs(os.path.dirname(path), exist_ok=True)
open(path,'w').write(out); print(path, len(out))
