#!/usr/bin/env python3
"""Download public-domain / free-licensed classical recordings from Wikimedia Commons,
convert them to MP3 and write music/tracks.json + music/CREDITS.md.
Only files whose Commons licence is Public domain, CC0, CC BY or CC BY-SA are accepted.
Run on a machine with internet and ffmpeg:  python3 scripts/fetch-music.py"""
import json, os, re, subprocess, sys, urllib.parse, urllib.request, html

API = 'https://commons.wikimedia.org/w/api.php'
UA = {'User-Agent': 'BeeTris music fetcher (https://hiveb3.github.io/beetris/)'}
OUT = os.path.join(os.path.dirname(__file__), '..', 'music')
PIECES = [
  ('Franz Liszt', 'La Campanella', 'campanella liszt', ['campanella']),
  ('Nikolai Rimsky-Korsakov', 'Flight of the Bumblebee', 'flight of the bumblebee', ['bumble']),
  ('Edvard Grieg', 'In the Hall of the Mountain King', 'hall of the mountain king grieg', ['mountain king', 'bergkongens', 'dovregubbens']),
  ('Ludwig van Beethoven', 'Symphony No. 5 – I. Allegro con brio', 'beethoven symphony 5 allegro con brio', ['5', 'brio']),
  ('Antonio Vivaldi', 'The Four Seasons – Spring (Allegro)', 'vivaldi spring la primavera allegro', ['spring', 'primavera']),
  ('Wolfgang Amadeus Mozart', 'Eine kleine Nachtmusik – I. Allegro', 'eine kleine nachtmusik', ['nachtmusik']),
  ('Antonín Dvořák', 'Symphony No. 9 "From the New World" – IV', 'dvorak new world symphony allegro con fuoco', ['new world', 'fuoco']),
  ('Gioachino Rossini', 'William Tell Overture – Finale', 'william tell overture rossini', ['tell', 'tell']),
  ('Richard Wagner', 'Ride of the Valkyries', 'ride of the valkyries walkürenritt', ['valkyr', 'walk']),
  ('Johann Sebastian Bach', 'Toccata and Fugue in D minor', 'toccata and fugue in d minor bwv 565', ['565', 'toccata']),
  ('Frédéric Chopin', 'Revolutionary Étude, Op. 10 No. 12', 'chopin revolutionary etude op 10 no 12', ['revolution', '10 no. 12', '10-12', '10 12']),
  ('Modest Mussorgsky', 'Night on Bald Mountain', 'night on bald mountain mussorgsky', ['bald mountain', 'lysoy', 'bald']),
]
OK_LIC = re.compile(r'(public domain|^pd|cc0|cc[- ]by(?![- ]?nc)(?![- ]?nd))', re.I)

def api(params):
    params.update({'format': 'json'})
    req = urllib.request.Request(API + '?' + urllib.parse.urlencode(params), headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=30))

def strip(v): return html.unescape(re.sub('<[^>]+>', '', v or '')).strip()

os.makedirs(OUT, exist_ok=True)
tracks, used = [], set()
for composer, title, query, keys in PIECES:
    res = api({'action': 'query', 'generator': 'search', 'gsrsearch': query + ' filetype:audio', 'gsrnamespace': 6,
               'gsrlimit': 15, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|mediatype|size'})
    pages = sorted((res.get('query') or {}).get('pages', {}).values(), key=lambda p: p.get('index', 99))
    pick = None
    for p in pages:
        name = p['title'].lower()
        if not any(k in name for k in keys) or p['title'] in used: continue
        ii = (p.get('imageinfo') or [{}])[0]; md = ii.get('extmetadata', {})
        lic = strip(md.get('LicenseShortName', {}).get('value'))
        if not OK_LIC.search(lic): continue
        if not re.search(r'\.(ogg|oga|opus|flac|wav|mp3)$', name): continue
        pick = (p, ii, md, lic); break
    if not pick: print('SKIP (no free recording found):', title); continue
    p, ii, md, lic = pick
    used.add(p['title'])
    slug = re.sub(r'[^a-z0-9]+', '-', (composer.split()[-1] + ' ' + title).lower()).strip('-')[:60]
    src = os.path.join(OUT, 'src-' + slug); dst = os.path.join(OUT, slug + '.mp3')
    print('GET', p['title'], '|', lic)
    req = urllib.request.Request(ii['url'], headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r, open(src, 'wb') as f: f.write(r.read())
    # cap each track at 6 minutes, 96 kbps stereo MP3 to keep the site light
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-t', '360', '-vn', '-ac', '2', '-b:a', '96k', dst], check=True)
    os.remove(src)
    performer = strip(md.get('Artist', {}).get('value'))[:120]
    tracks.append({'file': os.path.basename(dst), 'composer': composer, 'title': title, 'performer': performer,
                   'license': lic, 'source': ii.get('descriptionurl', '')})

with open(os.path.join(OUT, 'tracks.json'), 'w') as f: json.dump(tracks, f, ensure_ascii=False, indent=1)
with open(os.path.join(OUT, 'CREDITS.md'), 'w') as f:
    f.write('# BeeTris music credits\n\nClassical recordings from Wikimedia Commons, public domain or free licences.\n\n')
    for t in tracks:
        f.write(f"- **{t['composer']} – {t['title']}**. Performer: {t['performer'] or 'unknown'}. Licence: {t['license']}. Source: {t['source']}\n")
print(f'{len(tracks)} tracks written to music/')
