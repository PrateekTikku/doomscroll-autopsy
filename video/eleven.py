"""ElevenLabs TTS helper. Key comes from video/.env (git-ignored); every call is logged to audio/ledger.txt."""
import json, os, sys, urllib.request, time
def key():
    for l in open('.env'):
        l = l.strip().removeprefix('export ').strip()
        if l.startswith('ELEVENLABS_API_KEY'): return l.split('=',1)[1].strip().strip('"\'')
def tts(text, voice_id, out, model='eleven_multilingual_v2', stability=0.45, similarity=0.75, style=0.2, speed=1.0, prev=None, nxt=None):
    body = {'text': text, 'model_id': model, 'voice_settings': {'stability': stability, 'similarity_boost': similarity, 'style': style, 'speed': speed, 'use_speaker_boost': True}}
    if prev: body['previous_text'] = prev
    if nxt: body['next_text'] = nxt
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128', data=json.dumps(body).encode(), headers={'xi-api-key': key(), 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r: open(out, 'wb').write(r.read())
    open('audio/ledger.txt', 'a').write(f'{time.strftime("%H:%M:%S")} {len(text)} chars {model} {voice_id} -> {out}\n')
    return len(text)

def tts_ts(text, voice_id, out_base, model='eleven_v3', stability=0.5, similarity=0.75, speed=1.0):
    """TTS with per-character timings. Writes <out_base>.mp3 and <out_base>.align.json; returns duration (s)."""
    import base64, subprocess
    body = {'text': text, 'model_id': model, 'voice_settings': {'stability': stability, 'similarity_boost': similarity, 'speed': speed, 'use_speaker_boost': True}}
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128', data=json.dumps(body).encode(), headers={'xi-api-key': key(), 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r: d = json.loads(r.read())
    open(out_base + '.mp3', 'wb').write(base64.b64decode(d['audio_base64']))
    json.dump(d.get('alignment') or d.get('normalized_alignment'), open(out_base + '.align.json', 'w'))
    open('audio/ledger.txt', 'a').write(f'{time.strftime("%H:%M:%S")} {len(text)} chars {model} {voice_id} -> {out_base}.mp3\n')
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out_base + '.mp3']).decode())
    return round(dur, 2)
