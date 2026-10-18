import json, os, sys
from eleven import tts_ts
VOICE = os.environ.get('VOICE_ID', 'XrExE9yKIg1WjnnlVkGX')  # Matilda
MODEL = os.environ.get('MODEL', 'eleven_v3'); TAG = os.environ.get('TAG', 'matilda-v3')
only = set(sys.argv[1:])
os.makedirs(f'audio/{TAG}', exist_ok=True)
path = f'audio/{TAG}/durations.json'
durs = json.load(open(path)) if os.path.exists(path) else {}
for s in json.load(open('segments.json')):
    if only and s['id'] not in only: continue
    d = tts_ts(s['text'], VOICE, f'audio/{TAG}/{s["id"]}', model=MODEL)
    durs[s['id']] = {'file': f'{TAG}/{s["id"]}.mp3', 'dur': d, 'align': f'audio/{TAG}/{s["id"]}.align.json'}
    print(s['id'], d, 's', len(s['text']), 'chars', flush=True)
json.dump(durs, open(path, 'w'))
