// ====== Palettes ======
const PALETTE_BASIC_HEX = [
  "#000000","#202020","#404040","#606060","#808080","#A0A0A0","#C0C0C0","#FFFFFF",
  "#800000","#FF0000","#FF8000","#FFFF00",
  "#808000","#008000","#00FF00","#80FF80",
  "#008080","#00FFFF","#0080FF","#0000FF",
  "#800080","#FF00FF","#FF0080","#804000",
  "#C08040","#C0C000","#80C080","#40C0C0",
  "#80A0FF","#8080FF","#A080C0","#C080C0"
];
const PALETTE_EXTENDED_HEX = [
  "#000000","#1A1A1A","#333333","#4D4D4D","#666666","#808080","#999999","#B3B3B3",
  "#CCCCCC","#E6E6E6","#FFFFFF","#FFCCCC","#FF9999","#FF6666","#FF3333","#CC0000",
  "#CC3300","#FF6600","#FF9900","#FFCC00","#CCCC00","#99CC00","#66CC00","#33CC00",
  "#00CC00","#00CC33","#00CC66","#00CC99","#00CCCC","#0099CC","#0066CC","#0033CC",
  "#0000CC","#3300CC","#6600CC","#9900CC","#CC00CC","#CC0099","#CC0066","#CC0033",
  "#990000","#994C00","#999900","#4C9900","#009900","#00994C","#009999","#004C99",
  "#000099","#4C0099","#990099","#994C99","#996699","#99664C","#999966","#669966",
  "#669999","#6680CC","#80A0FF","#80C0FF","#80FFC0","#C0FF80","#FFC080","#FFA080",
  "#FF80A0","#C080FF","#A080FF","#8080FF"
];

// ====== UI ======
const fileInput    = document.getElementById("fileInput");
const processBtn   = document.getElementById("processBtn");
const downloadBtn  = document.getElementById("downloadBtn");
const canvas       = document.getElementById("canvas");
const metaEl       = document.getElementById("meta");
const ctx          = canvas.getContext("2d", { willReadFrequently: true });

const scaleInput   = document.getElementById("scaleFactor");
const gridColorEl  = document.getElementById("gridColor");
const enlargeToggle= document.getElementById("enlargeToggle");

const helpBtn   = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const helpClose = document.getElementById("helpClose");
const helpBackdrop = document.getElementById("helpBackdrop");
const canvasWrap = document.querySelector(".canvas-wrap");


let sourceImageBitmap = null;
let lastOutputBlobUrl = null;

// ====== Utils ======
function hexToRgb(hex) {
  const s = hex.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map(c => c+c).join("") : s, 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
function buildPalette(hexList){ return hexList.map(hexToRgb); }

function dist2(r,g,b, pr,pg,pb) {
  const dr=r-pr, dg=g-pg, db=b-pb;
  return dr*dr + dg*dg + db*db;
}
function nearestPaletteIndex(r,g,b, palette) {
  let best=0, bestD=Infinity;
  for (let i=0;i<palette.length;i++){
    const p=palette[i];
    const d=dist2(r,g,b, p[0],p[1],p[2]);
    if (d<bestD){ bestD=d; best=i; }
  }
  return best;
}

// 8×8 Bayer matrix for ordered dithering
const BAYER8 = [
  [0,48,12,60,3,51,15,63],
  [32,16,44,28,35,19,47,31],
  [8,56,4,52,11,59,7,55],
  [40,24,36,20,43,27,39,23],
  [2,50,14,62,1,49,13,61],
  [34,18,46,30,33,17,45,29],
  [10,58,6,54,9,57,5,53],
  [42,26,38,22,41,25,37,21]
].map(row => row.map(v => (v+0.5)/64));

function clamp255(v){ return v<0?0:v>255?255:v; }

// ====== Manual resamplers for first resize ======
function sampleRGBA(srcData, sw, sh, x, y){
  const xi = x < 0 ? 0 : x >= sw ? sw-1 : x|0;
  const yi = y < 0 ? 0 : y >= sh ? sh-1 : y|0;
  const idx = (yi*sw + xi) * 4;
  return [srcData[idx], srcData[idx+1], srcData[idx+2], srcData[idx+3]];
}

function resizeBilinear(srcImgData, dstW, dstH){
  const sw = srcImgData.width, sh = srcImgData.height;
  const src = srcImgData.data;
  const out = new ImageData(dstW, dstH);
  const dst = out.data;
  const scaleX = sw / dstW;
  const scaleY = sh / dstH;

  for (let y=0; y<dstH; y++){
    const sy = (y + 0.5) * scaleY - 0.5;
    const y0 = Math.floor(sy), y1 = y0 + 1, fy = sy - y0;
    for (let x=0; x<dstW; x++){
      const sx = (x + 0.5) * scaleX - 0.5;
      const x0 = Math.floor(sx), x1 = x0 + 1, fx = sx - x0;
      const c00 = sampleRGBA(src, sw, sh, x0, y0);
      const c10 = sampleRGBA(src, sw, sh, x1, y0);
      const c01 = sampleRGBA(src, sw, sh, x0, y1);
      const c11 = sampleRGBA(src, sw, sh, x1, y1);
      const idx = (y*dstW + x)*4;
      for (let k=0;k<4;k++){
        const v0 = c00[k]*(1-fx) + c10[k]*fx;
        const v1 = c01[k]*(1-fx) + c11[k]*fx;
        dst[idx+k] = clamp255(v0*(1-fy) + v1*fy);
      }
    }
  }
  return out;
}

// Bicubic: separable Mitchell–Netravali (B=1/3, C=1/3)
function mitchellNetravali(t){
  const B = 1/3, C = 1/3;
  const at = Math.abs(t), at2 = at*at, at3 = at2*at;
  if (at < 1){
    return ((12 - 9*B - 6*C)*at3 + (-18 + 12*B + 6*C)*at2 + (6 - 2*B)) / 6;
  } else if (at < 2){
    return ((-B - 6*C)*at3 + (6*B + 30*C)*at2 + (-12*B - 48*C)*at + (8*B - 24*C)) / 6 + (48*C)/6;
  } else return 0;
}
// Correct the Mitchell polynomial (expanded safely)
function mitchellNetravali(t){
  const B = 1/3, C = 1/3;
  const x = Math.abs(t);
  const x2 = x*x, x3 = x2*x;
  if (x < 1) {
    return ((12 - 9*B - 6*C)*x3 + (-18 + 12*B + 6*C)*x2 + (6 - 2*B)) / 6;
  } else if (x < 2) {
    return ((-B - 6*C)*x3 + (6*B + 30*C)*x2 + (-12*B - 48*C)*x + (8*B + 24*C)) / 6;
  }
  return 0;
}

function resizeBicubic(srcImgData, dstW, dstH){
  const sw = srcImgData.width, sh = srcImgData.height;
  const src = srcImgData.data;

  const tmp = new Float32Array(dstW * sh * 4);
  const scaleX = sw / dstW;

  for (let y=0; y<sh; y++){
    for (let x=0; x<dstW; x++){
      const sx = (x + 0.5)*scaleX - 0.5;
      const ix = Math.floor(sx);
      const wts = new Float32Array(4);
      const xs = new Int32Array(4);
      let sumW = 0;
      for (let k=-1; k<=2; k++){
        const xx = ix + k;
        xs[k+1] = xx;
        const w = mitchellNetravali(sx - xx);
        wts[k+1] = w; sumW += w;
      }
      if (sumW !== 0){ for (let i=0;i<4;i++) wts[i] /= sumW; }

      let r=0,g=0,b=0,a=0;
      for (let t=0; t<4; t++){
        const sxx = xs[t] < 0 ? 0 : xs[t] >= sw ? sw-1 : xs[t];
        const idx = (y*sw + sxx)*4;
        const wt = wts[t];
        r += src[idx]   * wt;
        g += src[idx+1] * wt;
        b += src[idx+2] * wt;
        a += src[idx+3] * wt;
      }
      const oidx = (y*dstW + x)*4;
      tmp[oidx]   = r; tmp[oidx+1] = g; tmp[oidx+2] = b; tmp[oidx+3] = a;
    }
  }

  const out = new ImageData(dstW, dstH);
  const dst = out.data;
  const scaleY = sh / dstH;

  for (let y=0; y<dstH; y++){
    const sy = (y + 0.5)*scaleY - 0.5;
    const iy = Math.floor(sy);
    const wts = new Float32Array(4);
    const ys = new Int32Array(4);
    let sumW = 0;
    for (let k=-1; k<=2; k++){
      const yy = iy + k;
      ys[k+1] = yy;
      const w = mitchellNetravali(sy - yy);
      wts[k+1] = w; sumW += w;
    }
    if (sumW !== 0){ for (let i=0;i<4;i++) wts[i] /= sumW; }

    for (let x=0; x<dstW; x++){
      let r=0,g=0,b=0,a=0;
      for (let t=0;t<4;t++){
        const syy = ys[t] < 0 ? 0 : ys[t] >= sh ? sh-1 : ys[t];
        const idx = (syy*dstW + x)*4;
        const wt = wts[t];
        r += tmp[idx]   * wt;
        g += tmp[idx+1] * wt;
        b += tmp[idx+2] * wt;
        a += tmp[idx+3] * wt;
      }
      const oidx = (y*dstW + x)*4;
      dst[oidx]   = clamp255(r);
      dst[oidx+1] = clamp255(g);
      dst[oidx+2] = clamp255(b);
      dst[oidx+3] = clamp255(a);
    }
  }
  return out;
}

// ====== Dithering / Quantization ======
function quantizeNone(img, out, palette) {
  const s = img.data, d = out.data;
  for (let i=0;i<s.length;i+=4){
    const r=s[i], g=s[i+1], b=s[i+2], a=s[i+3];
    const pi = nearestPaletteIndex(r,g,b, palette);
    const p = palette[pi];
    d[i]=p[0]; d[i+1]=p[1]; d[i+2]=p[2]; d[i+3]=a;
  }
}

function quantizeOrdered(img, out, palette) {
  const s = img.data, d = out.data;
  const w = img.width, h = img.height;
  const amp = 24;
  for (let y=0;y<h;y++){
    for (let x=0;x<w;x++){
      const idx = (y*w + x)*4;
      const a = s[idx+3];
      const t = (BAYER8[y & 7][x & 7] - 0.5)*2;
      let r = s[idx]   + amp*t;
      let g = s[idx+1] + amp*t;
      let b = s[idx+2] + amp*t;
      r = r<0?0:r>255?255:r|0;
      g = g<0?0:g>255?255:g|0;
      b = b<0?0:b>255?255:b|0;

      const pi = nearestPaletteIndex(r,g,b, palette);
      const p = palette[pi];
      d[idx]=p[0]; d[idx+1]=p[1]; d[idx+2]=p[2]; d[idx+3]=a;
    }
  }
}

function diffuse(buf, w, h, x, y, er,eg,eb, k){
  if (x<0||x>=w||y<0||y>=h) return;
  const i4=(y*w+x)*4;
  buf[i4]   = clamp255(buf[i4]   + er*k);
  buf[i4+1] = clamp255(buf[i4+1] + eg*k);
  buf[i4+2] = clamp255(buf[i4+2] + eb*k);
}
function quantizeErrorDiffusion(img, out, palette) {
  const w=img.width, h=img.height;
  const s=img.data;
  const d=out.data;
  const buf = new Float32Array(s.length);
  for (let i=0;i<s.length;i++) buf[i]=s[i];

  for (let y=0;y<h;y++){
    for (let x=0;x<w;x++){
      const i4=(y*w+x)*4;
      const r0=buf[i4], g0=buf[i4+1], b0=buf[i4+2], a0=buf[i4+3];
      const pi = nearestPaletteIndex(r0,g0,b0, palette);
      const p = palette[pi];
      d[i4]=p[0]; d[i4+1]=p[1]; d[i4+2]=p[2]; d[i4+3]=a0;

      const er=r0-p[0], eg=g0-p[1], eb=b0-p[2];
      diffuse(buf,w,h, x+1,y,   er,eg,eb, 7/16);
      diffuse(buf,w,h, x-1,y+1, er,eg,eb, 3/16);
      diffuse(buf,w,h, x,  y+1, er,eg,eb, 5/16);
      diffuse(buf,w,h, x+1,y+1, er,eg,eb, 1/16);
    }
  }
}

// ====== I/O and pipeline ======
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file){
    sourceImageBitmap=null;
    processBtn.disabled=true;
    downloadBtn.disabled=true;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    metaEl.textContent="";
	
	// pulse back to Browse
	fileInput.classList.add("pulse");
	processBtn.classList.remove("pulse");
	downloadBtn.classList.remove("pulse");
    return;
  }
  canvasWrap.classList.add("no-placeholder");

  const blobURL = URL.createObjectURL(file);
  try {
    sourceImageBitmap = await createImageBitmap(await fetch(blobURL).then(r=>r.blob()));
  } finally {
    URL.revokeObjectURL(blobURL);
  }
  processBtn.disabled=false;
  downloadBtn.disabled=true;
  fileInput.classList.remove("pulse");
  processBtn.classList.add("pulse");
  downloadBtn.classList.remove("pulse");

  metaEl.textContent = `Loaded ${file.name} (${sourceImageBitmap.width}×${sourceImageBitmap.height})`;
});

// Enable/disable scale inputs based on toggle
function refreshScaleInputs() {
  const on = !!enlargeToggle.checked;
  scaleInput.disabled = !on;
  gridColorEl.disabled = !on;
  enlargeToggle.title = on
    ? "Nearest-neighbor enlarge and 1px grid will be applied."
    : "Leave off for Blue Marble (no enlarge/grid).";
}
enlargeToggle.addEventListener("change", refreshScaleInputs);
refreshScaleInputs();

// Cue the first action (browse) on load
fileInput.classList.add("pulse");


// Help modal wiring
function openHelp(){ helpModal.setAttribute("aria-hidden","false"); }
function closeHelp(){ helpModal.setAttribute("aria-hidden","true"); }
helpBtn.addEventListener("click", openHelp);
helpClose.addEventListener("click", closeHelp);
helpBackdrop.addEventListener("click", closeHelp);
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeHelp(); });

document.getElementById("processBtn").addEventListener("click", () => {
  if (!sourceImageBitmap) return;

  const maxXStr = document.getElementById("maxX").value.trim();
  const maxYStr = document.getElementById("maxY").value.trim();
  const maxX = maxXStr ? Math.max(1, Math.floor(+maxXStr)) : null;
  const maxY = maxYStr ? Math.max(1, Math.floor(+maxYStr)) : null;

  const paletteChoice = document.querySelector('input[name="palette"]:checked').value;
  const ditherChoice  = document.querySelector('input[name="dither"]:checked').value;
  const resampleChoice= document.querySelector('input[name="resample"]:checked').value;
  const doEnlarge     = !!enlargeToggle.checked;
  const scaleFactor   = Math.max(1, Math.floor(+scaleInput.value || 5));
  const gridColor     = gridColorEl.value || "#000000";

  const palette = buildPalette(paletteChoice==="basic" ? PALETTE_BASIC_HEX : PALETTE_EXTENDED_HEX);

  const srcW = sourceImageBitmap.width;
  const srcH = sourceImageBitmap.height;

  let dstW, dstH;
  if (maxX && maxY) {
    dstW = maxX; dstH = maxY;                // forced non-proportional
  } else if (maxX) {
    dstW = maxX; dstH = Math.max(1, Math.round(srcH * (maxX / srcW)));
  } else if (maxY) {
    dstH = maxY; dstW = Math.max(1, Math.round(srcW * (maxY / srcH)));
  } else {
    dstW = 512; dstH = Math.max(1, Math.round(srcH * (512 / srcW)));
  }

  // Read original pixels
  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = srcW; tmpCanvas.height = srcH;
  const tctx = tmpCanvas.getContext("2d", { willReadFrequently: true });
  tctx.drawImage(sourceImageBitmap, 0, 0);
  const srcImgData = tctx.getImageData(0, 0, srcW, srcH);

  // Manual resample to target size
  const resized = resampleChoice === "bicubic"
    ? resizeBicubic(srcImgData, dstW, dstH)
    : resizeBilinear(srcImgData, dstW, dstH);

  // Quantize + dither to palette
  const quantized = new ImageData(dstW, dstH);
  switch (ditherChoice) {
    case "none":      quantizeNone(resized, quantized, palette); break;
    case "ordered":   quantizeOrdered(resized, quantized, palette); break;
    case "diffusion": quantizeErrorDiffusion(resized, quantized, palette); break;
  }
  
  // Draw result, optionally enlarge + grid
  if (!doEnlarge) {
    canvas.width = dstW; canvas.height = dstH;
    ctx.putImageData(quantized, 0, 0);
  } else {
    const upW = dstW * scaleFactor;
    const upH = dstH * scaleFactor;

    // place quantized on small offscreen
    const smallCanvas = document.createElement("canvas");
    smallCanvas.width = dstW; smallCanvas.height = dstH;
    smallCanvas.getContext("2d").putImageData(quantized, 0, 0);

    // upscale NN and draw to visible canvas
    canvas.width = upW; canvas.height = upH;
    ctx.clearRect(0,0,upW,upH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(smallCanvas, 0, 0, upW, upH);

    // grid overlay
    drawGrid(ctx, upW, upH, scaleFactor, gridColor);
  }

  downloadBtn.disabled = false;

  // Move pulsing cue to Download
  processBtn.classList.remove("pulse");
  downloadBtn.classList.add("pulse");

  metaEl.textContent =
    `Output ${dstW}×${dstH}${doEnlarge ? ` → upscaled ×${scaleFactor}` : ""}, `
    + `resample=${resampleChoice}, palette=${paletteChoice} (${palette.length}), `
    + `dither=${ditherChoice}${doEnlarge ? `, grid step=${scaleFactor}` : ""}`;
});

function drawGrid(ctx, w, h, step, color){
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1.0;

  // Vertical lines
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);     // 0.5 for crisp 1px lines
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  // Horizontal lines
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

// ====== Download ======
downloadBtn.addEventListener("click", () => {
  if (!canvas.width || !canvas.height) return;

  // Stop pulsing once download is invoked
  downloadBtn.classList.remove("pulse");

  if (lastOutputBlobUrl){ URL.revokeObjectURL(lastOutputBlobUrl); lastOutputBlobUrl=null; }
  canvas.toBlob((blob)=>{
    if (!blob) return;
    lastOutputBlobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = "quantized.png";
    a.href = lastOutputBlobUrl;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, "image/png");
});
