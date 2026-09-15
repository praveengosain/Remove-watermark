let cvReady = false;
let originalMat = null;
let currentMat = null;
let imageLoaded = false;
let drawing = false;
let eraseMode = false;
let lastPoint = null;
let imageScale = 1;

const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const emptyUpload = document.getElementById("emptyUpload");
const imageCanvas = document.getElementById("imageCanvas");
const maskCanvas = document.getElementById("maskCanvas");
const canvasWrap = document.getElementById("canvasWrap");
const emptyState = document.getElementById("emptyState");
const removeBtn = document.getElementById("removeBtn");
const resetBtn = document.getElementById("resetBtn");
const downloadBtn = document.getElementById("downloadBtn");
const status = document.getElementById("status");
const brushSize = document.getElementById("brushSize");
const brushValue = document.getElementById("brushValue");
const radius = document.getElementById("radius");
const radiusValue = document.getElementById("radiusValue");
const brushBtn = document.getElementById("brushBtn");
const eraseBtn = document.getElementById("eraseBtn");
const method = document.getElementById("method");

function setStatus(text) { status.textContent = text; }

window.Module = window.Module || {};
const waitForCV = setInterval(() => {
  if (window.cv && typeof cv.Mat === "function") {
    cvReady = true;
    clearInterval(waitForCV);
    setStatus(imageLoaded ? "Ready. Paint over the watermark." : "Open an image to begin.");
  }
}, 100);

uploadBtn.onclick = emptyUpload.onclick = () => fileInput.click();

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) loadImage(file);
});

brushSize.addEventListener("input", () => brushValue.textContent = `${brushSize.value} px`);
radius.addEventListener("input", () => radiusValue.textContent = radius.value);

brushBtn.onclick = () => {
  eraseMode = false;
  brushBtn.classList.add("active");
  eraseBtn.classList.remove("active");
};
eraseBtn.onclick = () => {
  eraseMode = true;
  eraseBtn.classList.add("active");
  brushBtn.classList.remove("active");
};

function loadImage(file) {
  if (!file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);

    // Keep processing memory reasonable for GitHub Pages/browser use.
    const maxSide = 2400;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    imageScale = scale;

    imageCanvas.width = Math.round(img.naturalWidth * scale);
    imageCanvas.height = Math.round(img.naturalHeight * scale);
    const ctx = imageCanvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    ctx.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);

    maskCanvas.width = imageCanvas.width;
    maskCanvas.height = imageCanvas.height;
    maskCanvas.style.width = `${imageCanvas.clientWidth}px`;
    maskCanvas.style.height = `${imageCanvas.clientHeight}px`;
    maskCanvas.style.display = "block";

    emptyState.style.display = "none";
    canvasWrap.classList.remove("empty");
    imageLoaded = true;

    if (originalMat) originalMat.delete();
    if (currentMat) currentMat.delete();
    originalMat = cv.imread(imageCanvas);
    currentMat = originalMat.clone();

    clearMask();
    [removeBtn, resetBtn, downloadBtn].forEach(b => b.disabled = false);
    setStatus(`Loaded ${img.naturalWidth} × ${img.naturalHeight}. Paint over the watermark, then click Remove Selected Area.`);
  };
  img.src = url;
}

function syncMaskSize() {
  if (!imageLoaded) return;
  const rect = imageCanvas.getBoundingClientRect();
  maskCanvas.style.left = `${imageCanvas.offsetLeft}px`;
  maskCanvas.style.top = `${imageCanvas.offsetTop}px`;
  maskCanvas.style.width = `${rect.width}px`;
  maskCanvas.style.height = `${rect.height}px`;
}
window.addEventListener("resize", syncMaskSize);

function clearMask() {
  const ctx = maskCanvas.getContext("2d");
  ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  syncMaskSize();
}

function canvasPoint(e) {
  const rect = maskCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * maskCanvas.width / rect.width,
    y: (e.clientY - rect.top) * maskCanvas.height / rect.height
  };
}

maskCanvas.addEventListener("pointerdown", e => {
  if (!imageLoaded) return;
  drawing = true;
  maskCanvas.setPointerCapture(e.pointerId);
  lastPoint = canvasPoint(e);
  drawStroke(lastPoint, lastPoint);
});
maskCanvas.addEventListener("pointermove", e => {
  if (!drawing) return;
  const p = canvasPoint(e);
  drawStroke(lastPoint, p);
  lastPoint = p;
});
maskCanvas.addEventListener("pointerup", () => { drawing = false; lastPoint = null; });
maskCanvas.addEventListener("pointercancel", () => { drawing = false; lastPoint = null; });

function drawStroke(a, b) {
  const ctx = maskCanvas.getContext("2d");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Number(brushSize.value);
  ctx.strokeStyle = eraseMode ? "rgba(0,0,0,0)" : "rgba(255,70,70,.55)";
  if (eraseMode) {
    ctx.globalCompositeOperation = "destination-out";
  } else {
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

removeBtn.onclick = () => {
  if (!cvReady || !imageLoaded) return;
  const ctx = maskCanvas.getContext("2d");
  const data = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  const mask = new cv.Mat(maskCanvas.height, maskCanvas.width, cv.CV_8UC1);
  const rgba = new cv.Mat(maskCanvas.height, maskCanvas.width, cv.CV_8UC4);
  rgba.data.set(data.data);
  cv.cvtColor(rgba, mask, cv.COLOR_RGBA2GRAY);
  rgba.delete();

  // Any painted pixel becomes part of the inpaint mask.
  cv.threshold(mask, mask, 8, 255, cv.THRESH_BINARY);

  if (cv.countNonZero(mask) === 0) {
    mask.delete();
    setStatus("Paint over the watermark first.");
    return;
  }

  setStatus("Removing selected area…");
  removeBtn.disabled = true;

  setTimeout(() => {
    try {
      const dst = new cv.Mat();
      const flag = method.value === "ns" ? cv.INPAINT_NS : cv.INPAINT_TELEA;
      cv.inpaint(currentMat, mask, Number(radius.value), dst, flag);
      currentMat.delete();
      currentMat = dst;
      cv.imshow(imageCanvas, currentMat);
      clearMask();
      setStatus("Done. You can paint another area and run removal again.");
    } catch (err) {
      console.error(err);
      setStatus("Could not process this image. Try a smaller selection.");
    } finally {
      mask.delete();
      removeBtn.disabled = false;
    }
  }, 30);
};

resetBtn.onclick = () => {
  if (!originalMat) return;
  currentMat.delete();
  currentMat = originalMat.clone();
  cv.imshow(imageCanvas, currentMat);
  clearMask();
  setStatus("Image reset to the original.");
};

downloadBtn.onclick = () => {
  if (!imageLoaded) return;
  const link = document.createElement("a");
  link.download = "edited-image.png";
  link.href = imageCanvas.toDataURL("image/png");
  link.click();
};

window.addEventListener("load", syncMaskSize);
