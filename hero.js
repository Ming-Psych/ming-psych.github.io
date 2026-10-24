/* Vita hero: a small boat on a wide winter river (after the spirit of Ma Yuan 寒江独钓).
   Scene painted once; water taps leave sparse calligraphic ink strokes (not rings).
   Press force shapes each mark: light = short pale waves, hard = longer fuller arcs.
   ?demo=1 seeds marks; ?demo=pressure&levels=3 (or &level=light|mid|hard); &freeze=1 holds. */
(() => {
'use strict';
/* ---------------- parameters ---------------- */
const P = {
  horizon: 0.40,          // minimum horizon, fraction of viewport height (sky above stays still)
  horizonSoft: 70,        // css px soft band below horizon (legacy layout aid)
  boatX: 0.72, boatY: 0.80,  // boat waterline centre (fraction of viewport)
  boatLenFrac: 0.115,     // boat length relative to width
  maxRipples: 4,          // few simultaneous mark-groups — 留白 over busyness
  spawnMinMs: 280,        // throttle between click marks
  tapSlop: 10, tapMs: 500, // touch: only a short, still tap makes a mark
  boatTilt: 0.45, boatBob: 0.7, boatRing: 1.8, // max deg / px; response duration (s)
  fishNear: 380,           // css px: click/tap within this of the boat starts reel/cast
  reelDur: 0.85, holdDur: 0.28, castDur: 1.05, // fishing easter-egg timing (s)
  clickAmp: 1.3,
  decay: 1.8,             // s, ink dissolving into paper
  life: 3.6,              // s, mark removed after this
  flatten: 0.40,          // vertical squash used by boat kick distance
  skyGap: 44,             // css px of calm sky kept between the page text and the horizon
  boatAboveFooter: 64,    // css px between the boat's waterline and the footer
  kickSpeed: 160,         // css px / s — how a nearby mark gently reaches the boat
};
const params = new URLSearchParams(location.search);
const DEMO_MODE = params.get('demo');
const DEMO = params.has('demo'), FREEZE = params.has('freeze'), DEMO_CAST = DEMO_MODE === 'cast';
const DEMO_PRESSURE = DEMO_MODE === 'pressure';
const FORCE_2D = params.get('gl') === '0'; // kept for URL compat; marks are always ink-2D
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = reduceMQ.matches && !DEMO;

const hero = document.getElementById('hero');
if (!hero) return;
const mast = document.querySelector('.masthead');
const setMH = () => document.documentElement.style.setProperty('--mh', (mast ? mast.offsetHeight : 54) + 'px');
setMH();
const cv = hero.querySelector('canvas.water');
const boatCv = hero.querySelector('canvas.boat');

/* ---------------- seeded noise ---------------- */
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function noise1(r){ const v = Array.from({length:256}, r); return x => { const i = Math.floor(x), f = x - i, a = v[i & 255], b = v[(i + 1) & 255], s = f*f*(3-2*f); return a + (b - a) * s; }; }

/* ---------------- brush ---------------- */
// catmull-rom resample
function resample(pts, step){
  const out = [];
  for (let i = 0; i < pts.length - 1; i++){
    const p0 = pts[Math.max(i-1,0)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(i+2, pts.length-1)];
    const seg = Math.hypot(p2[0]-p1[0], p2[1]-p1[1]);
    const n = Math.max(2, Math.ceil(seg / step));
    for (let k = 0; k < n; k++){
      const t = k / n, t2 = t*t, t3 = t2*t;
      const f = (a,b,c,d) => 0.5*((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t2 + (-a+3*b-3*c+d)*t3);
      out.push([f(p0[0],p1[0],p2[0],p3[0]), f(p0[1],p1[1],p2[1],p3[1])]);
    }
  }
  out.push(pts[pts.length-1]);
  return out;
}
// tapered dry-brush stroke: bristles laid across the stroke, gaps appear toward the dry tail
let layer = null;
function brush(ctx, pts, o){
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!layer || layer.width !== W || layer.height !== H){ layer = document.createElement('canvas'); layer.width = W; layer.height = H; }
  const L = layer.getContext('2d');
  L.setTransform(1,0,0,1,0,0); L.clearRect(0,0,W,H);
  L.setTransform(ctx.getTransform());
  const r = rng(o.seed || 1), nz = noise1(r);
  const d = resample(pts, o.step || 0.5);
  const nb = o.bristles || 6;
  const br = Array.from({length:nb}, (_,j) => ({ off: (j/(nb-1||1) - 0.5) + (r()-0.5)*0.15, ph: r()*100, len: 0.75 + r()*0.25 }));
  const dry = o.dry ?? 0.35, w0 = o.width, head = o.head ?? 0.12, tail = o.tail ?? 0.35;
  L.fillStyle = o.color || '#1e1e1c';
  for (let i = 0; i < d.length; i++){
    const s = i / (d.length - 1);
    const a = d[Math.max(i-1,0)], b = d[Math.min(i+1,d.length-1)];
    let tx = b[0]-a[0], ty = b[1]-a[1]; const tl = Math.hypot(tx,ty) || 1; tx/=tl; ty/=tl;
    const nx = -ty, ny = tx;
    let prof = Math.min(1, s/head) ** 0.6 * Math.min(1, (1-s)/tail) ** 0.8;
    prof *= 0.85 + 0.3*nz(s*6 + 3);           // pressure wobble
    const w = w0 * Math.max(prof, 0.04);
    for (const q of br){
      if (s > q.len && q.off*q.off > 0.04) continue;     // outer bristles run out first
      const gap = nz(q.ph + s * (o.gapFreq || 18));
      if (gap < dry * (0.3 + s)) continue;                 // dry-brush breaks
      const rr = Math.max(0.35, w / nb * 0.95);
      L.beginPath(); L.arc(a[0] + nx*q.off*w + (b[0]-a[0])*0.5, a[1] + ny*q.off*w + (b[1]-a[1])*0.5, rr, 0, 6.2832); L.fill();
    }
  }
  ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha = o.alpha ?? 1; ctx.drawImage(layer, 0, 0); ctx.restore();
}
function wash(ctx, poly, color, alpha, blur){
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; if (blur) ctx.filter = `blur(${blur}px)`;
  ctx.beginPath(); const d = resample(poly, 1); ctx.moveTo(d[0][0], d[0][1]); for (const p of d) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill(); ctx.restore();
}

/* ---------------- boat + angler (local units, waterline y=0, boat ~200 long) ---------------- */
const BOX = { x0:-150, x1:115, y0:-100, y1:22 };
function drawBoat(ctx, u){
  const ink = '#1e1e1c';
  const sw = v => v / u;  // keep a minimum visual thickness in px
  // hull wash (body of the skiff)
  const gun = [[-101,-15],[-84,-8],[-45,-5],[10,-4.5],[58,-6],[96,-13]];
  const bot = [[93,-10],[74,0.5],[30,3.6],[-30,3.6],[-74,0],[-99,-12]];
  wash(ctx, gun.concat(bot), '#3a3a37', 0.42, 0.6*u);
  wash(ctx, [[-96,-13],[-80,-7.5],[-40,-4.5],[20,-4],[70,-7],[92,-11],[70,-3],[0,-1.5],[-70,-3.5]], ink, 0.35, 0.4*u);
  // gunwale: a confident stroke, heavier in the middle
  brush(ctx, gun, { width:3.4, alpha:0.92, seed:11, dry:0.18, bristles:7, head:0.05, tail:0.12, color:ink });
  // keel line, drier
  brush(ctx, bot.slice().reverse(), { width:2.4, alpha:0.75, seed:12, dry:0.42, bristles:6, head:0.08, tail:0.2, color:ink });
  // stern transom and bow tip
  brush(ctx, [[96,-13],[94.5,-8],[92.5,-4]], { width:2.4, alpha:0.85, seed:13, dry:0.2, bristles:5, color:ink });
  brush(ctx, [[-101,-15],[-104,-17.5]], { width:1.6, alpha:0.8, seed:14, dry:0.1, bristles:4, color:ink });
  // a faint plank seam
  brush(ctx, [[-82,-2.6],[-30,-1.2],[40,-1.0],[82,-3]], { width:0.9, alpha:0.35, seed:15, dry:0.55, bristles:3, color:ink });
  // two thwarts / ribs
  brush(ctx, [[-20,-4.6],[-21,-0.5]], { width:1.1, alpha:0.45, seed:16, dry:0.2, bristles:3, color:ink });
  brush(ctx, [[-60,-5.6],[-61,-2]], { width:1.0, alpha:0.4, seed:17, dry:0.2, bristles:3, color:ink });

  // angler in straw cape, hunched, facing the bow
  const body = [[26,-5],[25,-11],[29,-17],[35,-23],[42,-27.5],[50,-27],[56,-21],[60,-12],[62,-5]];
  wash(ctx, body, '#2b2b29', 0.78, 0.5*u);
  // straw-cape texture: short dry strokes falling downward
  const r = rng(77);
  for (let i = 0; i < 9; i++){
    const x = 36 + i*2.8 + r()*1.5, y = -25 + Math.abs(i-4)*0.6;
    brush(ctx, [[x,y],[x+1.5+r(),y+9+r()*6]], { width:1.1, alpha:0.55, seed:30+i, dry:0.35, bristles:3, color:ink });
  }
  // back contour
  brush(ctx, [[42,-27.5],[51,-26.5],[57,-20],[61,-11],[63,-5]], { width:2.0, alpha:0.85, seed:41, dry:0.3, bristles:5, color:ink });
  // arms reaching forward to the rod
  brush(ctx, [[37,-21],[31,-18],[25.5,-16.8]], { width:2.2, alpha:0.85, seed:42, dry:0.15, bristles:5, color:ink });
  // head
  wash(ctx, [[36,-28],[37.5,-31.5],[41,-32],[42.5,-29],[40,-27]], ink, 0.85, 0.3*u);
  // conical bamboo hat (笠)
  wash(ctx, [[29,-30.3],[36,-35],[40.5,-37.6],[45.5,-34.5],[52,-30.6],[46,-31.6],[40,-32],[34,-31.6]], ink, 0.92, 0.25*u);
  brush(ctx, [[28.5,-30.2],[37,-35.5],[40.5,-37.8],[45,-35],[52.5,-30.4]], { width:1.5, alpha:0.9, seed:43, dry:0.15, bristles:4, color:ink });

}
let lastRod = { progress: 0, castArc: 0 };
/* progress 0 = fully cast, 1 = fully reeled. castArc lifts the tip during the cast. */
function rodPose(progress, castArc){
  const t = Math.max(0, Math.min(1, progress));
  const ease = t*t*(3 - 2*t);
  const tipX = -122 + (18 - (-122)) * ease;
  const tipY = -56 + (-22 - (-56)) * ease - (castArc || 0) * 28 * Math.sin(Math.PI * (1 - ease));
  const mid1 = [-15 + (22 - (-15)) * ease * 0.7, -36 + (-20 - (-36)) * ease];
  const mid2 = [-62 + (20 - (-62)) * ease * 0.85, -51 + (-21 - (-51)) * ease];
  const mid3 = [-100 + (19 - (-100)) * ease * 0.95, -57 + (-21.5 - (-57)) * ease];
  const tip = [tipX, tipY];
  const entry = [-117 + (tipX + 4 - (-117)) * ease, 1.5 + (tipY + 4 - 1.5) * ease * 0.15];
  const lineLen = 1 - ease;
  return { tip, mid1, mid2, mid3, entry, lineLen };
}
function drawRod(ctx, u, progress, castArc){
  const ink = '#1e1e1c';
  const p = rodPose(progress, castArc || 0);
  brush(ctx, [[27,-17], p.mid1, p.mid2, p.mid3, p.tip], { width:1.5, alpha:0.85, seed:51, dry:0.12, bristles:3, head:0.02, tail:0.7, step:0.4, color:ink });
  if (p.lineLen > 0.04){
    ctx.save(); ctx.strokeStyle = `rgba(30,30,28,${0.42 * Math.min(1, p.lineLen * 1.4)})`;
    ctx.lineWidth = 0.5; ctx.lineCap = 'round';
    ctx.beginPath();
    const tip = p.tip, ent = p.entry;
    ctx.moveTo(tip[0], tip[1]);
    ctx.bezierCurveTo(tip[0] - 1, tip[1] + 20 * p.lineLen, ent[0] - 2, tip[1] + (ent[1] - tip[1]) * 0.55, ent[0], ent[1]);
    ctx.stroke(); ctx.restore();
  }
  return p;
}
function renderBoatCanvas(scale, dpr, progress, castArc){
  const c = document.createElement('canvas');
  c.width = Math.ceil((BOX.x1 - BOX.x0) * scale * dpr); c.height = Math.ceil((BOX.y1 - BOX.y0) * scale * dpr);
  const g = c.getContext('2d');
  g.setTransform(scale*dpr, 0, 0, scale*dpr, -BOX.x0*scale*dpr, -BOX.y0*scale*dpr);
  drawBoat(g, scale*dpr);
  drawRod(g, scale*dpr, progress || 0, castArc || 0);
  return c;
}
function paintBoat(progress, castArc){
  if (!geo.scale) return;
  const bc = renderBoatCanvas(geo.scale, DPR, progress, castArc);
  boatCv.width = bc.width; boatCv.height = bc.height;
  boatCv.getContext('2d').drawImage(bc, 0, 0);
  lastRod = { progress, castArc: castArc || 0 };
}

/* ---------------- scene (paper, sky, water, faint strokes, reflection) ---------------- */
let W = 0, H = 0, DPR = 1, geo = {};
function buildScene(){
  const c = document.createElement('canvas'); c.width = Math.round(W*DPR); c.height = Math.round(H*DPR);
  const g = c.getContext('2d');
  const hy = geo.hy * DPR;
  // sky to water: warm white, a breath of mist at the horizon, faint blue-gray deepening toward the viewer
  const grd = g.createLinearGradient(0,0,0,c.height);
  grd.addColorStop(0, '#F6F3EC'); grd.addColorStop(geo.hy/H*0.85, '#F5F2EB');
  grd.addColorStop(geo.hy/H, '#F2F1EB'); grd.addColorStop(Math.min(1,geo.hy/H+0.08), '#F1F0EA');
  grd.addColorStop(1, '#E9EBE7');
  g.fillStyle = grd; g.fillRect(0,0,c.width,c.height);
  // very soft horizon mist band (no mountains)
  const mist = g.createLinearGradient(0, hy-90*DPR, 0, hy+70*DPR);
  mist.addColorStop(0,'rgba(120,130,135,0)'); mist.addColorStop(0.55,'rgba(120,130,135,0.018)'); mist.addColorStop(1,'rgba(120,130,135,0)');
  g.fillStyle = mist; g.fillRect(0, hy-90*DPR, c.width, 160*DPR);

  const S = geo.scale, bx = geo.bx*DPR, by = geo.by*DPR, u = S*DPR;
  // reflection of the boat, softened and squashed
  const refl = renderBoatCanvas(S, DPR, 0, 0);
  g.save(); g.globalAlpha = 0.07; g.filter = `blur(${1.6*DPR}px)`;
  g.translate(bx, by + 2*u); g.scale(1, -0.62);
  g.drawImage(refl, BOX.x0*u, BOX.y0*u); g.restore();

  // sparse dry-brush water strokes, only near the boat
  g.save(); g.setTransform(u, 0, 0, u, bx, by);
  const wc = '#5d6366';
  brush(g, [[-120,7],[-60,6],[10,7.5],[70,6.5],[118,8]], { width:1.6, alpha:0.20, seed:101, dry:0.5, bristles:5, head:0.2, tail:0.4, color:wc });
  brush(g, [[60,14],[110,13],[175,15]], { width:1.4, alpha:0.15, seed:102, dry:0.55, bristles:4, head:0.15, tail:0.5, color:wc });
  brush(g, [[-210,15],[-170,14],[-120,15.5]], { width:1.2, alpha:0.12, seed:103, dry:0.6, bristles:4, head:0.2, tail:0.5, color:wc });
  brush(g, [[-40,22],[20,21],[75,22.5]], { width:1.1, alpha:0.10, seed:104, dry:0.6, bristles:4, color:wc });
  brush(g, [[140,-1],[190,-1.5],[240,0]], { width:0.9, alpha:0.09, seed:105, dry:0.65, bristles:3, color:wc });
  brush(g, [[-300,-6],[-250,-6.5],[-215,-5.5]], { width:0.8, alpha:0.07, seed:106, dry:0.65, bristles:3, color:wc });
  // where the line meets the water: the smallest disturbance
  g.strokeStyle = 'rgba(60,66,70,0.18)'; g.lineWidth = 0.5;
  g.beginPath(); g.ellipse(-117, 2, 6, 1.4, 0, 0, 6.2832); g.stroke();
  g.strokeStyle = 'rgba(60,66,70,0.09)';
  g.beginPath(); g.ellipse(-117, 2, 12, 2.6, 0, 0, 6.2832); g.stroke();
  g.restore();

  // paper grain + faint vignette
  const img = g.getImageData(0,0,c.width,c.height), px = img.data, r = rng(7);
  for (let i = 0; i < px.length; i += 4){ const n = (r() - 0.5) * 5; px[i]+=n; px[i+1]+=n; px[i+2]+=n; }
  g.putImageData(img,0,0);
  const vg = g.createRadialGradient(c.width*0.5, c.height*0.45, Math.min(c.width,c.height)*0.4, c.width*0.5, c.height*0.5, Math.max(c.width,c.height)*0.8);
  vg.addColorStop(0,'rgba(90,85,75,0)'); vg.addColorStop(1,'rgba(90,85,75,0.06)');
  g.fillStyle = vg; g.fillRect(0,0,c.width,c.height);
  return c;
}

/* ---------------- layout ---------------- */
function layout(){
  W = hero.clientWidth; H = hero.clientHeight; DPR = Math.min(window.devicePixelRatio || 1, 2);
  const len = Math.max(110, Math.min(210, W * P.boatLenFrac));
  const narrow = W < 700;
  // the scene is the page background: keep the text in calm sky, the boat in the water above the footer
  let textBottom = 0;
  for (const el of document.querySelectorAll('.sidebar, .content > :last-child')) textBottom = Math.max(textBottom, el.getBoundingClientRect().bottom + scrollY);
  const foot = document.querySelector('.footer'), footH = foot ? foot.offsetHeight : 60;
  const by = Math.min(H * (narrow ? 0.80 : P.boatY), H - footH - P.boatAboveFooter * (narrow ? 0.8 : 1));
  const hy = Math.min(Math.max(H * P.horizon, textBottom + P.skyGap), by - (narrow ? 90 : 140));
  geo = { hy, scale: len / 200, bx: W * (narrow ? 0.66 : P.boatX), by };
  const S = geo.scale;
  paintBoat(lastRod.progress || 0, lastRod.castArc || 0);
  boatCv.style.width = (boatCv.width / DPR) + 'px'; boatCv.style.height = (boatCv.height / DPR) + 'px';
  boatCv.style.left = (geo.bx + BOX.x0 * S) + 'px'; boatCv.style.top = (geo.by + BOX.y0 * S) + 'px';
  boatCv.style.transformOrigin = `${-BOX.x0*S}px ${-BOX.y0*S}px`;   // pivot at the waterline, mid-hull
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  renderer.setScene(buildScene());
  requestFrame();
}

/* ---------------- water marks (Ma Yuan–style sparse ink strokes) ---------------- */
const ripples = []; // mark groups {x,y,t0,amp,strokes,wash}
const kicks = [];   // boat responses {ta, amp, side}
function now(){ return performance.now() / 1000; }
function onWater(x, y){ return !!geo.hy && y >= geo.hy + 6; }
function onBoat(x, y){
  if (!geo.scale) return false;
  const S = geo.scale;
  const L = geo.bx + BOX.x0 * S - 8, R = geo.bx + BOX.x1 * S + 8;
  const T = geo.by + BOX.y0 * S - 4, B = geo.by + BOX.y1 * S + 10;
  return x >= L && x <= R && y >= T && y <= B;
}
/* Narrow/phone water is small — shrink mark geometry so 波纹 don't dominate.
   Desktop stays 1; mobile ~0.62, with a touch more shrink on hard presses (~0.56). */
function markScale(p){
  const narrow = W <= 640 || (W <= 720 && (typeof matchMedia === 'function')
    && matchMedia('(pointer: coarse)').matches);
  if (!narrow) return 1;
  const press = Math.max(0, Math.min(1, p || 0));
  return 0.62 * (1 - 0.1 * press);
}
/* Pressure → amp (≈0.5 light … 1.5 hard). Build 1–3 parallel wave arcs —
   traditional 水纹 / 波纹: longer/darker/fuller when pressed harder; never rings. */
function buildStrokes(x, y, amp, seed0){
  const r = rng((seed0 | 0) || 1);
  const a = Math.max(0.35, Math.min(1.55, amp || 1));
  // normalize 0..1 across light→hard for shape knobs
  const p = Math.max(0, Math.min(1, (a - 0.45) / 1.05));
  const ms = markScale(p);                     // viewport size scale (mobile < 1)
  // 1–2 light, 2–3 hard (count unchanged — only geometry scales)
  let n;
  if (p < 0.35) n = r() < 0.55 ? 1 : 2;
  else if (p < 0.7) n = r() < 0.65 ? 2 : 3;
  else n = r() < 0.45 ? 3 : 2;
  const strokes = [];
  // light = short tight waves; hard = longer wider arcs (light still readable)
  const baseLen = (88 + p * 90 + r() * (22 + p * 30)) * (0.88 + 0.18 * Math.min(1.2, a / 1.3)) * ms;
  const spacing = (6 + p * 4 + r() * (3 + p * 2)) * ms;
  const sign = r() < 0.5 ? 1 : -1;
  const phase0 = (r() - 0.5) * 0.35;
  for (let i = 0; i < n; i++){
    const len = baseLen * (0.72 + i * 0.2 + r() * 0.06);
    const yOff = y + (i - (n - 1) * 0.5) * spacing + (r() - 0.5) * 1.2 * ms;
    const x0 = x - len * 0.5 + (r() - 0.5) * (10 + p * 8) * ms + i * (r() - 0.5) * 5 * ms;
    // arc amplitude grows with press
    const bow = sign * (3.8 + p * 5.2 + r() * (2.5 + p * 2.5) + i * 0.7) * ms;
    const undulate = (0.9 + r() * (1.2 + p * 0.8)) * ms;
    const tilt = (r() - 0.5) * (0.02 + p * 0.02);
    const pts = [];
    const steps = 10 + (p * 4 | 0);              // a touch smoother when long
    for (let s = 0; s <= steps; s++){
      const u = s / steps;
      const px = x0 + u * len;
      const wave = Math.sin(Math.PI * u + phase0) * bow
                 + Math.sin(Math.PI * 2 * u + phase0 * 2) * undulate * 0.35;
      const py = yOff + tilt * (u - 0.5) * len + wave + (r() - 0.5) * 0.35 * ms;
      pts.push([px, py]);
    }
    // dry / lifted ends — keep middle more continuous
    if (r() < 0.5) pts.splice(0, 1 + (r() * 2 | 0));
    if (r() < 0.5) pts.splice(-(1 + (r() * 2 | 0)));
    if (pts.length < 4) continue;
    // light = pale thin but visible; hard = darker fuller
    const wScale = 0.7 + p * 0.75;
    const aScale = 0.7 + p * 0.55;
    strokes.push({
      pts,
      width: (0.55 + r() * 0.75) * wScale * (1 - i * 0.08) * ms,
      dry: 0.26 + r() * 0.26 - p * 0.05,       // slightly wetter when hard
      alpha0: (0.22 + r() * 0.14) * aScale * Math.min(1.2, a) * (1 - i * 0.06),
      seed: (r() * 9999) | 0,
      bristles: 3 + (p > 0.55 ? 1 : 0) + (r() * 2 | 0),
      delay: i * (0.06 + r() * 0.05),
      head: 0.12 + r() * 0.1,
      tail: 0.3 + r() * 0.25,
    });
  }
  const wash = {
    x: x + (r() - 0.5) * 8 * ms,
    y: y + (r() - 0.5) * 3 * ms,
    rx: ((26 + p * 34) + r() * (22 + p * 22)) * ms,
    ry: ((4 + p * 3) + r() * (3 + p * 3)) * ms,
    a: (0.025 + p * 0.032 + r() * 0.02) * Math.min(1.15, a),
  };
  return { strokes, wash };
}
function markFade(age, delay){
  const a = age - (delay || 0);
  if (a < 0) return 0;
  const appear = Math.min(1, a / 0.4);
  const ease = appear * appear * (3 - 2 * appear);
  const dissolve = 1 - Math.max(0, (a - P.life * 0.35) / (P.life * 0.65));
  return ease * Math.max(0, dissolve) * Math.exp(-a / P.decay);
}
/* Pointer pressure → 0..1. Mouse without force → mid; touch may use contact size. */
function pressureOf(e){
  const raw = typeof e.pressure === 'number' ? e.pressure : 0;
  // real force (pen / 3D Touch / some stylus) — trust non-zero readings
  if (raw > 0.02) return Math.min(1, Math.max(0.05, raw));
  // mouse: most desktop browsers report 0 or 0.5; treat as a mid default
  if (e.pointerType === 'mouse') return 0.45;
  // touch without force: estimate from contact ellipse if the UA exposes it
  const w = e.width || 0, h = e.height || 0;
  if (w > 1 && h > 1){
    const r = Math.sqrt(w * h);
    // typical fingertip ~12–40 CSS px; map into a gentle 0.2–0.95 band
    return Math.min(0.95, Math.max(0.18, (r - 10) / 36));
  }
  return 0.45;
}
/* Map press 0..1 → amp used by buildStrokes / fish gate (~0.5 light … ~1.5 hard). */
function ampFromPressure(p){
  const x = Math.max(0, Math.min(1, p));
  return 0.45 + x * 1.05;
}
let lastSpawnT = 0;
function spawn(x, y, amp, t0 = now()){
  if (reduced) return;
  if (!onWater(x, y)) return;
  if (t0 - lastSpawnT < P.spawnMinMs / 1000 && amp < P.clickAmp) return;
  lastSpawnT = t0;
  if (ripples.length >= P.maxRipples) ripples.shift();
  const built = buildStrokes(x, y, amp, (x * 17 + y * 31 + t0 * 1000) | 0);
  const r = { x, y, t0, amp, strokes: built.strokes, wash: built.wash };
  ripples.push(r);
  boatKick(r);
  if (amp >= P.clickAmp * 0.85) startFish(x, y, amp);
  requestFrame();
}
function interact(x, y, amp){
  if (reduced) return;
  if (onBoat(x, y)){
    if (amp >= P.clickAmp * 0.85){
      startFish(x, y, amp);
      kicks.push({ ta: now(), amp: 0.7, side: Math.sign(x - geo.bx) || 1 });
      requestFrame();
    }
    return;
  }
  if (onWater(x, y)) spawn(x, y, amp);
}
/* No mouse-move trails — busy wakes fight 留白. Click/tap only; pressure read on the tap. */
let tap = null;
addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse'){
    if (e.button === 0) interact(e.clientX, e.clientY, ampFromPressure(pressureOf(e)));
    return;
  }
  tap = { x:e.clientX, y:e.clientY, t:performance.now(), id:e.pointerId, pressure: pressureOf(e) };
});
addEventListener('pointermove', e => {
  if (!tap || e.pointerId !== tap.id) return;
  // some devices ramp force after contact — keep the peak for this tap
  tap.pressure = Math.max(tap.pressure, pressureOf(e));
}, { passive:true });
addEventListener('pointerup', e => {
  if (!tap || e.pointerId !== tap.id) return;
  const press = Math.max(tap.pressure, pressureOf(e));
  const ok = Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < P.tapSlop && performance.now() - tap.t < P.tapMs;
  tap = null;
  if (ok) interact(e.clientX, e.clientY, ampFromPressure(press));
});
addEventListener('pointercancel', () => { tap = null; });
addEventListener('scroll', () => { tap = null; }, { passive:true });

/* ---------------- ink renderer (2D): scene + sparse brush strokes ---------------- */
function makeInk(){
  const g = cv.getContext('2d', { alpha:false }); let scene = null;
  return {
    kind: 'ink',
    setScene(c){ scene = c; },
    draw(t){
      if (!scene) return;
      g.setTransform(1,0,0,1,0,0);
      g.drawImage(scene, 0, 0);
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (const r of ripples){
        const age = t - r.t0;
        if (age < 0 || age > P.life) continue;
        // soft diluted wash under the strokes (ink bleeding into paper)
        if (r.wash){
          const wf = markFade(age, 0) * r.wash.a / 0.04;
          if (wf > 0.01){
            const grd = g.createRadialGradient(r.wash.x, r.wash.y, 0, r.wash.x, r.wash.y, r.wash.rx);
            grd.addColorStop(0, `rgba(40,40,38,${0.045 * wf})`);
            grd.addColorStop(0.55, `rgba(40,40,38,${0.02 * wf})`);
            grd.addColorStop(1, 'rgba(40,40,38,0)');
            g.save();
            g.beginPath();
            g.ellipse(r.wash.x, r.wash.y, r.wash.rx, r.wash.ry, 0, 0, 6.2832);
            g.fillStyle = grd; g.fill();
            g.restore();
          }
        }
        for (const s of r.strokes){
          const f = markFade(age, s.delay);
          if (f < 0.02) continue;
          brush(g, s.pts, {
            width: s.width,
            alpha: s.alpha0 * f,
            seed: s.seed,
            dry: s.dry,
            bristles: s.bristles,
            head: s.head,
            tail: s.tail,
            color: '#1e1e1c',
            step: 0.55,
          });
        }
      }
    }
  };
}
let renderer = makeInk();
if (DEMO || DEMO_CAST || DEMO_PRESSURE) window.__hero = { ripples, kicks: () => kicks.length, fish: () => fish, ampFromPressure, pressureOf, markScale };
document.documentElement.dataset.renderer = renderer.kind;

/* ---------------- loop: runs only while ripples are alive ---------------- */
let raf = 0, frozenT = null;
function requestFrame(){ if (!raf) raf = requestAnimationFrame(frame); }
/* boat is still at rest; a passing ring gives a tiny damped nudge.
   a nearby click/tap also starts the reel → hold → cast easter egg. */
let fish = null; // { t0, splashDone } | null
function boatKick(r){
  const persp = Math.min(1, Math.max(0.18, (r.y - geo.hy) / (H - geo.hy))) * 1.15;
  const dx = (geo.bx - r.x) / persp, dy = (geo.by - r.y) / persp / P.flatten;
  const d = Math.max(0, Math.hypot(dx, dy) - 60);
  const ta = d / P.kickSpeed;
  if (ta > P.life * 0.75) return;
  const amp = r.amp * Math.exp(-ta / P.decay) / (1 + d / 140);
  if (amp < 0.03) return;
  kicks.push({ ta: r.t0 + ta, amp: Math.min(1.4, amp), side: Math.sign(r.x - geo.bx) || 1 });
}
function startFish(x, y, amp){
  if (reduced || fish) return;
  const d = Math.hypot(x - geo.bx, y - geo.by);
  if (d > P.fishNear && amp < P.clickAmp * 0.9) return;
  if (d > P.fishNear * 1.6) return;
  fish = { t0: now(), splashDone: false };
  kicks.push({ ta: now(), amp: 0.95, side: Math.sign(x - geo.bx) || 1 });
  requestFrame();
}
function fishPhase(t){
  if (!fish) return { progress: 0, castArc: 0, done: true };
  const a = t - fish.t0;
  const R = P.reelDur, Hld = P.holdDur, C = P.castDur, total = R + Hld + C;
  if (a < 0) return { progress: 0, castArc: 0, done: false };
  if (a < R){
    const u = a / R; return { progress: u*u*(3-2*u), castArc: 0, done: false };
  }
  if (a < R + Hld) return { progress: 1, castArc: 0, done: false };
  if (a < total){
    const u = (a - R - Hld) / C;
    const e = u*u*(3-2*u);
    return { progress: 1 - e, castArc: Math.sin(Math.PI * e), done: false, casting: true, castU: e };
  }
  return { progress: 0, castArc: 0, done: true };
}
function boatPose(t){
  let tilt = 0, bob = 0;
  for (let i = kicks.length - 1; i >= 0; i--){
    const a = t - kicks[i].ta;
    if (a > P.boatRing) { kicks.splice(i, 1); continue; }
    if (a < 0) continue;
    const e = Math.exp(-a / (P.boatRing * 0.32)) * Math.sin(Math.PI * 2 * a / 1.15) * Math.min(1, a / 0.12);
    tilt += kicks[i].side * kicks[i].amp * e; bob += kicks[i].amp * e;
  }
  if (fish){
    const a = t - fish.t0, total = P.reelDur + P.holdDur + P.castDur;
    if (a >= 0 && a < total){
      const env = Math.sin(Math.PI * Math.min(1, a / total)) * 0.55;
      tilt += Math.sin(a * 4.2) * env; bob += Math.sin(a * 5.1 + 0.4) * env * 0.7;
    }
  }
  const c = (v, m) => Math.max(-m, Math.min(m, v));
  return [c(tilt * P.boatTilt, P.boatTilt), c(bob * P.boatBob, P.boatBob)];
}
let posed = false;
function frame(){
  raf = 0;
  const t = frozenT ?? now();
  while (ripples.length && t - ripples[0].t0 > P.life) ripples.shift();
  renderer.draw(t);
  let fishing = false;
  if (fish){
    const ph = fishPhase(t);
    fishing = !ph.done;
    if (ph.progress !== lastRod.progress || ph.castArc !== lastRod.castArc) paintBoat(ph.progress, ph.castArc);
    if (ph.casting && ph.castU >= 0.92 && !fish.splashDone){
      fish.splashDone = true;
      // splash where the line meets the water
      const ent = rodPose(ph.progress, ph.castArc).entry;
      spawn(geo.bx + ent[0] * geo.scale, geo.by + ent[1] * geo.scale + 1, 0.55, t);
    }
    if (ph.done){ fish = null; paintBoat(0, 0); }
  }
  if (kicks.length || fishing){
    const [tilt, bob] = boatPose(t);
    boatCv.style.transform = `translate3d(0,${bob.toFixed(3)}px,0) rotate(${tilt.toFixed(4)}deg)`; posed = true;
  } else if (posed) { boatCv.style.transform = ''; posed = false; }
  if ((ripples.length || kicks.length || fish) && frozenT === null) requestFrame();
}
reduceMQ.addEventListener?.('change', e => {
  reduced = e.matches;
  if (reduced) { ripples.length = 0; kicks.length = 0; fish = null; if (geo.scale) paintBoat(0, 0); }
  requestFrame();
});
let rl = 0; const relayout = () => { setMH(); if (!rl) rl = requestAnimationFrame(() => { rl = 0; if (hero.clientWidth !== W || hero.clientHeight !== H) layout(); }); };
new ResizeObserver(relayout).observe(hero); addEventListener('resize', relayout);

layout();

/* ---------------- ?demo=1 | cast | pressure : seed marks / freeze ---------------- */
if (DEMO || DEMO_CAST || DEMO_PRESSURE) setTimeout(() => {
  if (hero.clientWidth !== W || hero.clientHeight !== H) layout();
  const t = now();
  if (DEMO_CAST){
    const mid = P.reelDur * 0.92; // nearly fully reeled (clearer mid-reel freeze)
    fish = { t0: t - mid, splashDone: false };
    kicks.push({ ta: t - mid, amp: 0.9, side: 1 });
    const ph = fishPhase(t);
    paintBoat(ph.progress, ph.castArc);
    if (FREEZE) frozenT = t;
  } else if (DEMO_PRESSURE){
    // light / mid / hard (or a single level=) — for visual QA of press → shape
    const level = (params.get('level') || '').toLowerCase();
    const levels = Math.max(1, Math.min(5, parseInt(params.get('levels') || '3', 10) || 3));
    const table = {
      light: { p: 0.22, x: 0.30, y: 0.76, age: 0.45 },
      mid:   { p: 0.45, x: 0.46, y: 0.80, age: 0.40 },
      hard:  { p: 0.92, x: 0.58, y: 0.72, age: 0.45 },
    };
    const order = level && table[level] ? [level]
                : levels <= 1 ? ['mid']
                : levels === 2 ? ['light', 'hard']
                : ['light', 'mid', 'hard'];
    for (const key of order){
      const L = table[key];
      spawn(W * L.x, H * L.y, ampFromPressure(L.p), t - L.age);
    }
    if (FREEZE) frozenT = t;
  } else {
    // three sparse water marks — uneven placement, like 寒江独钓's few 水纹
    spawn(W*0.26, H*0.74, P.clickAmp, t - 0.7);
    spawn(W*0.44, H*0.80, P.clickAmp * 0.9, t - 0.35);
    spawn(W*0.58, H*0.70, P.clickAmp * 0.75, t - 1.2);
    if (FREEZE) frozenT = t;
  }
  requestFrame();
}, 400);
})();
