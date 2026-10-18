// Generates index.html (the HyperFrames composition) from segments.json + audio/durations.json.
// Scene timings are anchored to words in the narration, so swapping the voice re-times everything.
import { readFileSync, writeFileSync } from 'node:fs';
const segs = JSON.parse(readFileSync('segments.json', 'utf8'));
const durs = JSON.parse(readFileSync(process.env.DURS ?? 'audio/durations.json', 'utf8'));
const LEAD = 0.2, TAIL = 0.3, END_TAIL = 1.7, TAILS = { s2: 0.9, s6: 2.2 };
let t = 0;
const scenes = segs.map((s) => {
  const d = durs[s.id].dur;
  const align = durs[s.id].align ? JSON.parse(readFileSync(durs[s.id].align, 'utf8')) : null;
  const sc = { align, id: s.id, file: durs[s.id].file, start: +t.toFixed(2), audioStart: +(t + LEAD).toFixed(2), dur: +(d + LEAD + (s.id === segs[segs.length - 1].id ? END_TAIL : TAILS[s.id] ?? TAIL)).toFixed(2), audioDur: d, text: s.text };
  t += sc.dur;
  return sc;
});
const TOTAL = +t.toFixed(2);
const S = Object.fromEntries(scenes.map((s) => [s.id, s]));
/** time (s) at which `phrase` is spoken in scene s */
const kw = (s, phrase, off = -0.15) => {
  const i = s.text.indexOf(phrase);
  if (i < 0) throw new Error(`"${phrase}" not in ${s.id}`);
  const at = s.align && s.align.characters.length === s.text.length ? s.align.character_start_times_seconds[i] : (s.audioDur * i) / s.text.length;
  return +(s.audioStart + at + off).toFixed(2);
};

const tl = [];
const T = (n) => (+n).toFixed(2);
const fade = (sel, t0, d = 0.5) => tl.push(`tl.fromTo('${sel}',{opacity:0},{opacity:1,duration:${d}},${T(t0)});`);
const out = (sel, t0, d = 0.4) => tl.push(`tl.to('${sel}',{opacity:0,duration:${d}},${T(t0)});`);
const rise = (sel, t0, d = 0.6, y = 40) => tl.push(`tl.fromTo('${sel}',{opacity:0,y:${y}},{opacity:1,y:0,duration:${d},ease:'power3.out'},${T(t0)});`);
const pop = (sel, t0, d = 0.6) => tl.push(`tl.fromTo('${sel}',{opacity:0,scale:0.92},{opacity:1,scale:1,duration:${d},ease:'power3.out'},${T(t0)});`);
for (const s of scenes) { fade(`#${s.id}`, s.start, 0.35); if (s.id === segs[segs.length - 1].id) out(`#${s.id}`, s.start + s.dur - 1.2, 1.2); else out(`#${s.id}`, s.start + s.dur - 0.35, 0.35); }

// S1 hook
{ const s = S.s1;
  tl.push(`tl.fromTo('#feed',{y:0},{y:-2600,duration:${s.dur},ease:'none'},${s.start});`);
  fade('#clock-a', s.start + 0.3, 0.3); const two = kw(s, 'Two hours later');
  out('#clock-a', two, 0.3); fade('#clock-b', two + 0.2, 0.3);
  rise('#s1 .l1', kw(s, 'one tab', -0.4)); rise('#s1 .l2', two);
  tl.push(`tl.fromTo('#focusfill',{width:520},{width:40,duration:${(s.start + s.dur - two - 0.5).toFixed(2)},ease:'power1.in'},${T(two)});`);
  fade('#s1 .focus', s.start + 0.5, 0.4); }
// S2 problem + product
{ const s = S.s2;
  const feed = kw(s, 'a feed built', -0.3), thou = kw(s, 'thousands', -0.2), apps = kw(s, 'Screen-time apps', -0.1), dmg = kw(s, 'just report', 0), prod = kw(s, 'Doomscroll Autopsy, a Chrome', -0.3);
  rise('#s2 .wp', s.start + 0.4, 0.9, 30);
  tl.push(`tl.fromTo('#s2 .wpfill',{width:420},{width:60,duration:${Math.max(1, apps - s.start - 1.6).toFixed(2)},ease:'power1.in'},${T(feed)});`);
  rise('#s2 .vs', feed - 0.1, 0.6, 0); rise('#s2 .fd', feed, 1.0, 40); rise('#s2 .eng', thou, 0.7, 20);
  // A -> B: slow crossfade starting as "Screen-time apps" is spoken
  out('#s2 .a', apps, 1.1);
  rise('#s2 .rep', apps + 0.2, 1.1, 40); [1, 2, 3, 4, 5, 6, 7].forEach((i) => rise(`#s2 .rb${i}`, apps + 1.0 + i * 0.14, 0.6, 30));
  pop('#s2 .late', dmg + 0.7, 0.6);
  // B -> product: B stays until the product name is spoken, then a slow crossfade
  out('#s2 .b', prod + 0.2, 1.1);
  pop('#s2 .logo', prod + 0.4, 1.0); rise('#s2 .pb h1', prod + 0.7, 1.0); rise('#s2 .pb .tag', kw(s, 'sees the rabbit hole', -0.1), 0.9, 24); rise('#s2 .pchips', kw(s, 'before it costs', -0.2), 0.8, 20); }
// S3 reads
{ const s = S.s3;
  rise('#s3 .item', s.start + 0.6, 0.6, 30);
  const vec = kw(s, 'vector:'), emb = kw(s, "That's EmbeddingGemma", -0.1), cook = kw(s, 'Cooking videos');
  rise('#s3 .arrow1', vec - 0.3, 0.4, 0); rise('#s3 .vec', vec, 0.6, 20);
  rise('#s3 .arrow2', emb - 0.1, 0.4, 0); pop('#s3 .model', emb, 0.7);
  pop('#s3 .space', cook - 0.2, 0.7);
  rise('#s3 .cl1', cook, 0.5, 14); rise('#s3 .cl2', kw(s, 'Python docs', -0.1), 0.5, 14); }
// S4 map
{ const s = S.s4;
  rise('#s4 .h', s.start + 0.5, 0.6, 20); pop('#s4 .mapcard', s.start + 1.0, 0.8);
  const d0 = kw(s, 'Deep work.', -0.1); rise('#s4 .p1', d0, 0.6, 14); rise('#s4 .p2', d0 + 0.6, 0.6, 14); rise('#s4 .p3', kw(s, 'Shallow work', -0.1), 0.6, 14); rise('#s4 .p4', kw(s, 'the drains', -0.1), 0.6, 14);
  rise('#s4 .note', kw(s, 'Built from what', -0.2), 0.5, 14); }
// S5 signals + drift gauge + ladder
{ const s = S.s5;
  rise('#s5 .h', s.start + 0.4, 0.6, 20);
  const sig = [['#s5 .r1', 'how fast you scroll'], ['#s5 .r2', 'where you just came from'], ['#s5 .r3', "how long you've stayed"], ['#s5 .r4', 'whether you just left']];
  sig.forEach(([sel, ph], i) => { const t0 = kw(s, ph, -0.2); rise(sel, t0, 0.5, 20); tl.push(`tl.fromTo('${sel} .mask',{width:0},{width:300,duration:0.9,ease:'none'},${T(t0 + 0.2)});`); tl.push(`tl.to('#gfill',{width:${[150, 300, 450, 600][i]},duration:0.8,ease:'power2.out'},${T(t0 + 0.9)});`); });
  const add = kw(s, 'When they add up', -0.1);
  rise('#s5 .gauge', kw(s, 'whether you just left', -0.6), 0.5, 20); tl.push(`tl.to('#gfill',{background:'#ff7a5c',duration:0.5},${T(add)});`); pop('#s5 .alert', add + 0.3, 0.5);
  rise('#s5 .n1', kw(s, 'A banner.', -0.1), 0.9, 40); rise('#s5 .n2', kw(s, 'Then a blur', -0.1), 0.9, 40); rise('#s5 .n3', kw(s, 'Then a thirty', -0.1), 0.9, 40);
  tl.push(`tl.fromTo('#s5 .ring',{scale:0.55},{scale:1,duration:2.4,ease:'sine.inOut'},${T(kw(s, 'Then a thirty', 0.8))});`); }
// S6 autopsy (three held views, each held long enough to read)
{ const s = S.s6;
  pop('#s6 .gem', s.start + 0.4, 0.8);
  const a2 = kw(s, 'First, when', -0.2), a3 = kw(s, 'Then, what broke', -0.2), a4 = kw(s, 'Finally', -0.2);
  pop('#s6 .fr1', s.start + 0.7, 0.9); rise('#s6 .lb1', s.start + 1.4, 0.7, 20); out('#s6 .lb1', a2 - 0.1, 0.5); out('#s6 .fr1', a2 + 0.2, 0.7);
  pop('#s6 .fr2', a2 + 0.2, 0.9); rise('#s6 .lb2', a2 + 0.8, 0.7, 20); out('#s6 .lb2', a3 - 0.1, 0.5); rise('#s6 .lb3', a3 + 0.3, 0.7, 20); out('#s6 .lb3', a4 - 0.1, 0.5); out('#s6 .fr2', a4 + 0.2, 0.7);
  pop('#s6 .fr3', a4 + 0.2, 0.9); rise('#s6 .lb4', a4 + 0.8, 0.7, 20); }
// S7 close: privacy beats first, then the lockup
{ const s = S.s7; const tb = kw(s, 'Take back', -0.2), nm = kw(s, 'Doomscroll Autopsy.', -0.2), pr = kw(s, 'Protect the work', -0.2);
  rise('#s7 .q1', s.start + 0.3, 0.7, 30); rise('#s7 .q2', kw(s, 'No account', -0.1), 0.6, 30); rise('#s7 .q3', kw(s, 'No cloud', -0.1), 0.6, 30); rise('#s7 .q4', kw(s, 'Nothing you browse', -0.1), 0.7, 30);
  out('#s7 .p1', tb - 0.1, 0.6);
  rise('#s7 .tb', tb + 0.3, 0.8, 30); out('#s7 .tb', nm - 0.5, 0.5);
  pop('#s7 .logo', nm + 0.1, 0.8); rise('#s7 h1', nm + 0.3, 0.8); rise('#s7 .tag', pr, 0.9, 20);
  rise('#s7 .k1', pr + 0.9, 0.6, 16); rise('#s7 .k2', pr + 1.3, 0.6, 16); rise('#s7 .hashline', pr + 1.9, 0.6, 16); }

const feedCards = Array.from({ length: 10 }, (_, i) => `<div class="fc" style="background:linear-gradient(160deg,hsl(${(i * 47) % 360} 45% 32%),hsl(${(i * 47 + 40) % 360} 50% 18%))"><div class="av"></div><div class="bar b1"></div><div class="bar b2"></div><div class="heart"></div></div>`).join('');
const pinSvg = '<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>';
const gem = (px) => `<img src="assets/brand/gemma.svg" width="${px}" height="${px}" style="display:block">`;
const dots = (cx, cy, color, n, spread, seed) => Array.from({ length: n }, (_, i) => { const a = (i * 2.399 + seed) % 6.283, r = spread * Math.sqrt((i + 1) / n); return `<i class="sd" style="left:${(cx + r * Math.cos(a)).toFixed(0)}px;top:${(cy + r * Math.sin(a)).toFixed(0)}px;background:${color}"></i>`; }).join('');
const pace = '<svg width="640" height="220" viewBox="0 0 640 220"><path d="M0 170 L80 168 L140 172 L200 160 L260 150 L320 120 L380 90 L440 62 L500 40 L560 30 L640 24" fill="none" stroke="#6e7bff" stroke-width="6" stroke-linecap="round"/></svg>';
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Doomscroll Autopsy, product video</title>
<style>
*{box-sizing:border-box;margin:0}
:root{--ink:#0f1524;--mut:#5b6478;--bg:#f6f7fb;--dark:#0b1220;--acc:#4f46e5;--deep:#0072b2;--sh:#d79a00;--dr:#cc3311}
html,body{width:1920px;height:1080px;overflow:hidden;background:#0b1220;font-family:"SF Pro Display",-apple-system,"Helvetica Neue",Arial,sans-serif}
#root{position:relative;width:1920px;height:1080px;overflow:hidden}
.scene{position:absolute;inset:0;opacity:0}
.light{background:radial-gradient(1200px 700px at 20% 0%,#eef0ff,transparent),var(--bg);color:var(--ink)}
.dark{background:radial-gradient(1100px 700px at 80% 10%,#1b2750,transparent),var(--dark);color:#e8eef7}
.logo{width:120px;height:120px;border-radius:30px;background:linear-gradient(135deg,#4f46e5,#14b8a6);display:flex;align-items:center;justify-content:center;box-shadow:0 20px 50px rgba(79,70,229,.35)}
.logo svg{width:64px;height:64px}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px}
h1{font-size:128px;letter-spacing:-3px;font-weight:800}
.tag{font-size:46px;color:var(--mut)}.dark .tag{color:#a9b4cc}
.chips{display:flex;gap:20px;margin-top:30px}
.chip{padding:18px 32px;border-radius:999px;background:#fff;border:2px solid #dfe3f0;font-size:34px;font-weight:600;box-shadow:0 8px 24px rgba(15,21,36,.06);display:flex;align-items:center;gap:14px}
.dark .chip{background:#111b36;border-color:#2a3a6b;color:#dfe7ff}
.h{position:absolute;left:0;right:0;top:90px;text-align:center;font-size:64px;font-weight:800;letter-spacing:-1.5px}
/* s1 */
.phone{position:absolute;left:1130px;top:120px;width:520px;height:840px;border-radius:56px;border:10px solid #202c4d;overflow:hidden;background:#0a0f1d;box-shadow:0 40px 100px rgba(0,0,0,.5)}
#feed{position:absolute;left:0;top:0;width:100%}
.fc{width:100%;height:700px;border-bottom:8px solid #0a0f1d;position:relative}
.av{position:absolute;left:24px;bottom:150px;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.55)}
.bar{position:absolute;left:24px;height:20px;border-radius:10px;background:rgba(255,255,255,.4)}
.b1{bottom:110px;width:260px}.b2{bottom:76px;width:180px}
.heart{position:absolute;right:28px;bottom:140px;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.35)}
.l1,.l2{position:absolute;left:150px;font-size:84px;font-weight:800;letter-spacing:-2px;width:900px;line-height:1.05}
.l1{top:330px}.l2{top:560px;color:#ff7a5c}
#clock-a,#clock-b{position:absolute;left:150px;top:190px;font-size:56px;font-weight:600;color:#9fb0d6;font-variant-numeric:tabular-nums}
.focus{position:absolute;left:150px;top:780px;font-size:30px;color:#9fb0d6;font-weight:600}
#focusbg{position:absolute;left:150px;top:830px;width:520px;height:26px;border-radius:13px;background:#1b2750}
#focusfill{position:absolute;left:150px;top:830px;width:520px;height:26px;border-radius:13px;background:linear-gradient(90deg,#0072b2,#5eead4)}
/* s2 */
.a,.b{position:absolute;inset:0}
.card2{position:absolute;width:640px;height:420px;border-radius:32px;background:#fff;border:2px solid #e3e6f2;box-shadow:0 24px 70px rgba(15,21,36,.12);padding:40px}
.card2 .cap{font-size:30px;font-weight:700;color:var(--acc);letter-spacing:1px;text-transform:uppercase}
.card2 .big2{font-size:64px;font-weight:800;letter-spacing:-1.5px;margin-top:14px;line-height:1.05}
.wp{left:150px;top:240px}.fd{left:1130px;top:240px}.dk{background:#141b33;border-color:#2a3a6b;color:#fff}.dk .cap{color:#7fd1c2}
.meter{margin-top:56px;height:34px;border-radius:17px;background:#e6e9f5;position:relative}
.wpfill{position:absolute;left:0;top:0;height:34px;width:420px;border-radius:17px;background:linear-gradient(90deg,#14b8a6,#4f46e5)}
.vs{position:absolute;left:830px;top:400px;width:260px;text-align:center;font-size:72px;font-weight:800;color:#9aa3b8}
.mini{margin-top:36px;display:flex;flex-direction:column;gap:14px}.mini i{display:block;height:34px;border-radius:17px;background:linear-gradient(90deg,#f472b6,#fbbf77)}.mini i:nth-child(2){width:80%}.mini i:nth-child(3){width:60%}
.eng{position:absolute;left:1130px;top:700px;width:640px;text-align:center;font-size:40px;font-weight:700;color:var(--ink)}
.rep{left:640px;top:230px;width:640px;height:520px}
.bars{position:absolute;left:40px;right:40px;bottom:36px;height:230px;display:flex;align-items:flex-end;gap:18px}
.bars i{display:block;flex:1;border-radius:10px 10px 0 0;background:linear-gradient(180deg,#94a3d8,#c7d0ee)}
.late{position:absolute;left:1170px;top:350px;font-size:72px;font-weight:900;color:#cc3311;border:8px solid #cc3311;border-radius:20px;padding:6px 36px;transform:rotate(-8deg);letter-spacing:2px;text-transform:uppercase}
.pb{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px}
/* s3 */
.flow{position:absolute;left:90px;top:230px;display:flex;align-items:center;gap:22px}
.item{width:380px;background:#fff;border-radius:26px;border:2px solid #e3e6f2;box-shadow:0 14px 40px rgba(15,21,36,.08);padding:20px}
.item .img{height:190px;border-radius:16px;background:linear-gradient(135deg,#fbbf77,#f472b6)}
.item .t{height:18px;border-radius:9px;background:#d9deec;margin-top:16px;width:90%}.item .t2{width:62%}
.item .cap2{font-size:26px;color:var(--mut);margin-top:16px}
.arrow1,.arrow2{font-size:60px;color:var(--acc);font-weight:700}
.vec{background:#0f1524;color:#7ee7c9;border-radius:22px;padding:26px 30px;font:600 32px/1.5 ui-monospace,Menlo,monospace;width:400px}
.vec small{display:block;color:#8b93a8;font:500 22px system-ui;margin-bottom:6px}
.model{background:#fff;border:2px solid #dfe3f0;border-radius:26px;padding:22px 28px;display:flex;align-items:center;gap:18px;box-shadow:0 14px 40px rgba(15,21,36,.08);font-size:36px;font-weight:700}
.model small{display:block;font-size:24px;color:var(--mut);font-weight:500}
.space{position:absolute;left:210px;top:640px;width:1500px;height:380px;border-radius:32px;background:#fff;border:2px solid #e3e6f2;box-shadow:0 24px 70px rgba(15,21,36,.1)}
.sd{position:absolute;width:16px;height:16px;border-radius:50%;margin:-8px 0 0 -8px}
.cl{position:absolute;font-size:36px;font-weight:700}
/* s4 */
.mapcard{position:absolute;left:1000px;top:200px;width:620px;height:760px;background:#fff;border-radius:32px;border:2px solid #e3e6f2;box-shadow:0 24px 70px rgba(15,21,36,.12);padding:24px;overflow:hidden}
.mapcard img{width:100%;display:block;border-radius:16px}
.col{position:absolute;left:170px;top:260px;width:760px;display:flex;flex-direction:column;gap:18px}
.pill{font-size:36px;font-weight:700;display:flex;align-items:center;gap:18px;background:#fff;border:2px solid #e3e6f2;border-radius:22px;padding:20px 28px;box-shadow:0 10px 30px rgba(15,21,36,.06)}
.pill small{margin-left:auto;font-size:26px;color:var(--mut);font-weight:600}
.dot{width:24px;height:24px;border-radius:50%;flex:none}
.note{position:absolute;left:170px;top:840px;width:780px;font-size:34px;line-height:1.3;font-weight:700;color:var(--acc)}
/* s5 */
.sig{position:absolute;left:80px;top:210px;width:780px;display:flex;flex-direction:column;gap:14px}
.sr{display:flex;align-items:center;gap:20px;background:#111b36;border:2px solid #2a3a6b;border-radius:20px;padding:12px 22px}
.sr .nm{width:340px;font-size:28px;font-weight:600;color:#dfe7ff}
.sr .sp{position:relative;width:300px;height:50px;overflow:hidden}
.sr .mask{position:absolute;left:0;top:0;height:50px;overflow:hidden;width:0}
.gauge{margin-top:16px}.gl{font-size:30px;font-weight:700;color:#cfe0ff;margin-bottom:10px;display:flex;justify-content:space-between}
.alert{background:#ff7a5c;color:#1a0b06;border-radius:999px;padding:4px 18px;font-size:26px;font-weight:800}
.gbg{position:relative;width:700px;height:30px;border-radius:15px;background:#1b2750}
#gfill{position:absolute;left:0;top:0;height:30px;width:0;border-radius:15px;background:linear-gradient(90deg,#0072b2,#5eead4)}
.gthr{position:absolute;left:520px;top:-6px;width:4px;height:42px;background:#ff7a5c;border-radius:2px}
.ladder{position:absolute;left:920px;right:50px;top:230px;display:flex;gap:20px}
.nstep{width:300px}
.nstep .lab{font-size:28px;color:#9fb0d6;font-weight:600;margin-bottom:14px}
.nbox{height:440px;border-radius:26px;position:relative;overflow:hidden;border:2px solid #26345f}
.banner{background:#141f2b;padding:22px;display:flex;flex-direction:column;gap:14px;justify-content:center}
.banner .kick{color:#7fd1c2;font-weight:700;font-size:24px}.banner p{font-size:25px;line-height:1.35;color:#eef3f8}
.btns{display:flex;gap:10px}.btn{padding:10px 14px;border-radius:12px;font-size:20px;font-weight:700;white-space:nowrap}
.btn.p{background:#2a9d8a;color:#04201a}.btn.s{border:2px solid #3a4a5e;color:#dfe8f1}
.blur{background:#18233a}.blur .ghost{position:absolute;inset:0;filter:blur(9px);padding:26px;display:flex;flex-direction:column;gap:16px}
.blur .ghost i{display:block;height:24px;border-radius:12px;background:#5d7fb5;opacity:.7}
.blur .msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:30px;font-size:30px;font-weight:700;background:rgba(10,16,30,.35);line-height:1.25}
.breath{background:#10192d;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;font-size:26px;color:#cfe0ff}
.ring{width:170px;height:170px;border-radius:50%;background:radial-gradient(circle,#6ee7d3,#2a9d8a);box-shadow:0 0 80px rgba(110,231,211,.5)}
/* s6 */
.gem{position:absolute;left:210px;top:56px;display:flex;align-items:center;gap:20px;font-size:40px;font-weight:800}
.gem small{display:block;font-size:26px;color:var(--mut);font-weight:600}
.frame{position:absolute;left:260px;top:170px;width:1400px;background:#fff;border-radius:24px;border:2px solid #dbe0ee;box-shadow:0 40px 100px rgba(15,21,36,.2);overflow:hidden}
.frame .bar2{height:54px;background:#eef0f7;display:flex;align-items:center;gap:10px;padding:0 20px}
.frame .bar2 i{width:16px;height:16px;border-radius:50%;background:#cfd5e6}
.frame img{width:1400px;display:block}
.lb{position:absolute;padding:16px 30px;border-radius:999px;background:var(--acc);color:#fff;font-size:34px;font-weight:700;box-shadow:0 14px 40px rgba(79,70,229,.4)}
</style></head>
<body>
<div id="root" data-composition-id="root" data-width="1920" data-height="1080" data-start="0" data-duration="${TOTAL}">

<div id="s1" class="scene dark clip" data-start="${S.s1.start}" data-duration="${S.s1.dur}">
  <div id="clock-a" style="opacity:0">11:00 AM</div><div id="clock-b" style="opacity:0">1:00 PM</div>
  <div class="l1" style="opacity:0">One tab to look something up.</div>
  <div class="l2" style="opacity:0">Two hours later…</div>
  <div class="focus" style="opacity:0">Your focus</div><div id="focusbg"></div><div id="focusfill"></div>
  <div class="phone"><div id="feed">${feedCards}</div></div>
</div>

<div id="s2" class="scene light clip" data-start="${S.s2.start}" data-duration="${S.s2.dur}">
  <div class="a">
    <div class="wp card2" style="opacity:0"><div class="cap">You</div><div class="big2">Willpower</div><div class="meter"><div class="wpfill"></div></div></div>
    <div class="vs" style="opacity:0">vs</div>
    <div class="fd card2 dk" style="opacity:0"><div class="cap">The feed</div><div class="big2">Built to keep you</div><div class="mini"><i></i><i></i><i></i></div></div>
    <div class="eng" style="opacity:0">built by thousands of engineers</div>
  </div>
  <div class="b">
    <div class="rep card2" style="opacity:0"><div class="cap">Screen-time apps</div><div class="big2" style="font-size:44px">A report, after the day is gone</div>
      <div class="bars">${[40, 62, 35, 80, 55, 90, 70].map((h, i) => `<i class="rb${i + 1}" style="height:${h * 1.6}px;opacity:0"></i>`).join('')}</div></div>
    <div class="late" style="opacity:0">Too late</div>
  </div>
  <div class="pb">
    <div class="logo" style="opacity:0">${pinSvg}</div>
    <h1 style="opacity:0">Doomscroll Autopsy</h1>
    <div class="tag" style="opacity:0">Sees the rabbit hole coming. Steps in before it costs you.</div>
    <div class="chips pchips" style="opacity:0"><div class="chip">Chrome extension</div><div class="chip">Predicts, doesn’t block</div><div class="chip">Runs on your laptop</div></div>
  </div>
</div>

<div id="s3" class="scene light clip" data-start="${S.s3.start}" data-duration="${S.s3.dur}">
  <div class="flow">
    <div class="item" style="opacity:0"><div class="img"></div><div class="t"></div><div class="t t2"></div><div class="cap2">a post, video or page</div></div>
    <div class="arrow1" style="opacity:0">→</div>
    <div class="vec" style="opacity:0"><small>a vector: its meaning as numbers</small>[ 0.12, −0.48, 0.91,<br>−0.07, 0.33, … ]</div>
    <div class="arrow2" style="opacity:0">←</div>
    <div class="model" style="opacity:0">${gem(64)}<div>EmbeddingGemma 2<small>on your GPU · ~16 ms per item</small></div></div>
  </div>
  <div class="space" style="opacity:0">
    ${dots(480, 190, '#f59e0b', 26, 120, 0.4)}${dots(1050, 180, '#0072b2', 26, 110, 2.1)}
    <div class="cl cl1" style="left:370px;top:310px;color:#b45309;opacity:0">Cooking videos</div>
    <div class="cl cl2" style="left:960px;top:300px;color:#0072b2;opacity:0">Python docs</div>
  </div>
</div>

<div id="s4" class="scene light clip" data-start="${S.s4.start}" data-duration="${S.s4.dur}">
  <div class="h" style="opacity:0;left:0;right:900px;text-align:left;padding-left:170px">A map of your attention</div>
  <div class="col" style="top:230px">
    <div class="pill p1" style="opacity:0"><i class="dot" style="background:var(--deep)"></i>AI and machine learning research<small>deep</small></div>
    <div class="pill p2" style="opacity:0"><i class="dot" style="background:var(--deep)"></i>Technical documentation and code reviews<small>deep</small></div>
    <div class="pill p3" style="opacity:0"><i class="dot" style="background:var(--sh)"></i>Discord and Quora chat<small>shallow</small></div>
    <div class="pill p4" style="opacity:0"><i class="dot" style="background:var(--dr)"></i>Short form video consumption<small>drain</small></div>
  </div>
  <div class="note" style="opacity:0">Built from what you look at, not banned sites.</div>
  <div class="mapcard" style="opacity:0"><img src="assets/ui-map.png"></div>
</div>

<div id="s5" class="scene dark clip" data-start="${S.s5.start}" data-duration="${S.s5.dur}">
  <div class="h" style="opacity:0;text-align:left;padding-left:100px;font-size:56px">Reads the signals. Nudges calmly.</div>
  <div class="sig">
    <div class="sr r1" style="opacity:0"><div class="nm">How fast you scroll</div><div class="sp"><div class="mask"><svg width="300" height="50"><path d="M0 40 L60 38 L120 30 L180 20 L240 12 L300 6" fill="none" stroke="#6e7bff" stroke-width="5" stroke-linecap="round"/></svg></div></div></div>
    <div class="sr r2" style="opacity:0"><div class="nm">Where you just came from</div><div class="sp"><div class="mask"><svg width="300" height="50"><path d="M0 40 L110 40 L120 10 L300 10" fill="none" stroke="#5eead4" stroke-width="5" stroke-linecap="round"/></svg></div></div></div>
    <div class="sr r3" style="opacity:0"><div class="nm">How long you've stayed</div><div class="sp"><div class="mask"><svg width="300" height="50"><path d="M0 44 L300 8" fill="none" stroke="#f59e0b" stroke-width="5" stroke-linecap="round"/></svg></div></div></div>
    <div class="sr r4" style="opacity:0"><div class="nm">Just left deep work</div><div class="sp"><div class="mask"><svg width="300" height="50"><path d="M0 40 L70 40 L90 6 L130 6 L150 40 L300 40" fill="none" stroke="#f472b6" stroke-width="5" stroke-linecap="round"/></svg></div></div></div>
    <div class="gauge" style="opacity:0"><div class="gl">Rabbit-hole risk<span class="alert" style="opacity:0">nudge</span></div><div class="gbg"><div id="gfill"></div><div class="gthr"></div></div></div>
  </div>
  <div class="ladder">
    <div class="nstep n1" style="opacity:0"><div class="lab">1 · Banner</div><div class="nbox banner"><div class="kick">A moment</div><p>You’ve spent 16 minutes in short form video today, past your 15. Back to deep work?</p><div class="btns"><div class="btn p">Back to it</div><div class="btn s">5 more min</div></div></div></div>
    <div class="nstep n2" style="opacity:0"><div class="lab">2 · Blur</div><div class="nbox blur"><div class="ghost"><i style="width:90%"></i><i style="width:70%"></i><i style="width:85%"></i><i style="width:60%"></i><i style="width:80%"></i><i style="width:75%"></i></div><div class="msg">Still scrolling? Your report is waiting.</div></div></div>
    <div class="nstep n3" style="opacity:0"><div class="lab">3 · 30 s breath</div><div class="nbox breath"><div class="ring"></div><div>Breathe in… and out</div></div></div>
  </div>
</div>

<div id="s6" class="scene light clip" data-start="${S.s6.start}" data-duration="${S.s6.dur}">
  <div class="gem" style="opacity:0">${gem(64)}<div>Gemma 3 · 270M<small>fine-tuned, on your laptop</small></div></div>
  <div class="frame fr1" style="opacity:0"><div class="bar2"><i></i><i></i><i></i></div><img src="assets/ui-autopsy.png"></div>
  <div class="frame fr2" style="opacity:0"><div class="bar2"><i></i><i></i><i></i></div><img src="assets/ui-top.png"></div>
  <div class="frame fr3" style="opacity:0;left:410px;width:1100px;top:290px"><div class="bar2"><i></i><i></i><i></i></div><img src="assets/ui-tomorrow.png" style="width:1100px"></div>
  <div class="lb lb1" style="opacity:0;left:560px;top:960px">The model writes your day, from your numbers</div>
  <div class="lb lb2" style="opacity:0;left:640px;top:960px">1 · When you went deep (dashed blocks)</div>
  <div class="lb lb3" style="opacity:0;left:520px;top:960px">2 · What broke it: switches, drains, nudges</div>
  <div class="lb lb4" style="opacity:0;left:640px;top:790px">3 · What to change tomorrow</div>
</div>

<div id="s7" class="scene dark clip" data-start="${S.s7.start}" data-duration="${S.s7.dur}">
  <div class="p1" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px">
    <div class="chip q1" style="opacity:0;font-size:48px;padding:22px 44px">Runs inside your browser</div>
    <div class="chip q2" style="opacity:0;font-size:48px;padding:22px 44px">No account</div>
    <div class="chip q3" style="opacity:0;font-size:48px;padding:22px 44px">No cloud</div>
    <div class="chip q4" style="opacity:0;font-size:48px;padding:22px 44px;border-color:#5eead4">Nothing you browse leaves your laptop</div>
  </div>
  <div class="tb" style="opacity:0;position:absolute;left:0;right:0;top:430px;text-align:center;font-size:120px;font-weight:800;letter-spacing:-3px">Take back your focus.</div>
  <div class="center">
    <div class="logo" style="opacity:0">${pinSvg}</div>
    <h1 style="opacity:0">Doomscroll Autopsy</h1>
    <div class="tag" style="opacity:0">Protect the work that pays you.</div>
    <div class="chips"><div class="chip k1" style="opacity:0">${gem(36)}EmbeddingGemma 2</div><div class="chip k2" style="opacity:0">${gem(36)}Gemma 3 · 270M, fine-tuned</div></div>
    <div class="hashline" style="opacity:0;font-size:36px;color:#a9b4cc">Open Gemma models · On your laptop · #hf26challenge</div>
  </div>
</div>

${process.env.SILENT ? '' : scenes.map((s) => `<audio id="vo-${s.id}" src="audio/${s.file}" data-start="${s.audioStart}" data-duration="${s.audioDur}" data-track-index="1" data-volume="1"></audio>`).join('\n')}

<script src="node_modules/gsap/dist/gsap.min.js"></script>
<script>
const tl = gsap.timeline({ paused: true });
${tl.join('\n')}
window.__timelines = window.__timelines || {};
window.__timelines['root'] = tl;
</script>
</div></body></html>`;
writeFileSync('index.html', html);
console.log('total', TOTAL, 's; scenes', scenes.map((s) => `${s.id}@${s.start}`).join(' '));
