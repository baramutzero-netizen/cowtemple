"""Build the single-file client: subset the Galmuri fonts to the characters used, embed the pixel images,
and write the server address. Usage: python3 tools/build.py [https://cowtemple.<you>.workers.dev]"""
import base64, subprocess, os, sys, json
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, '..')
src = open(os.path.join(root, 'client', 'game.src.html'), encoding='utf-8').read()
src = src.replace('/*__KK__*/', open(os.path.join(root, 'assets', 'sutra_geumgang.txt'), encoding='utf-8').read().strip())
server = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('COWTEMPLE_SERVER', '')
imgs = {}
for k in ['monk', 'moktak'] + ['cow_' + c for c in ['hanwoo', 'holstein', 'heuku', 'chik', 'white']]:
    imgs[k] = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(root, 'assets', k + '.png'), 'rb').read()).decode()
extra = ''.join(open(f, encoding='utf-8').read() for f in os.environ.get('EXTRA_CHARS', '').split(os.pathsep) if f)
chars = set(src) | set(extra) | set('0123456789,.+%~!?…·():음메응Zzz') | set(''.join(chr(c) for c in range(0x20, 0x7f)))
tmp = os.path.join(here, '_chars.txt'); open(tmp, 'w', encoding='utf-8').write(''.join(sorted(chars)))
FONTDIR = os.environ.get('GALMURI', '/home/claude/sogwi/package/dist')
css = ''
for fam in ('Galmuri14', 'Galmuri11'):
    out = os.path.join(here, f'_{fam}.woff2')
    subprocess.run(['pyftsubset', f'{FONTDIR}/{fam}.ttf', f'--text-file={tmp}', '--flavor=woff2', f'--output-file={out}'], check=True)
    css += f"@font-face{{font-family:'{fam}';src:url(data:font/woff2;base64,{base64.b64encode(open(out, 'rb').read()).decode()}) format('woff2');font-display:block}}\n"; os.remove(out)
os.remove(tmp)
sounds = open(os.path.join(root, 'assets', 'moktak_sounds.json'), encoding='utf-8').read()
html = src.replace('/*__FONTS__*/', css).replace('/*__SOUNDS__*/{}', sounds).replace('/*__IMAGES__*/{}', json.dumps(imgs)).replace("'/*__SERVER__*/'", json.dumps(server))
open(os.environ.get('OUT') or os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(html)
print('built index.html', len(html) // 1024, 'KB', 'server =', server or '(none: practice mode)')
