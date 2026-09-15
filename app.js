let cvReady = false;
let originalMat = null;
let currentMat = null;
let imageLoaded = false;
let drawing = false;
let eraseMode = false;
let lastPoint = null;

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

function setStatus(text) {
  status.textContent = text;
}

// Wait until OpenCV.js has finished loading.
const cvTimer = setInterval(() => {
  if (window.cv && typeof cv.Mat === "function" && cv.imread) {
    cvReady = true;
    clearInterval(cvTimer);
    setStatus(imageLoaded ? "Ready. Paint over the watermark." : "Open an image to begin.");
  }
}, 100);

uploadBtn.onclick = emptyUpload.onclick = () => fileInput.click();

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) loadImage(file);
});

brushSize.addEventListener("input", () => {
  brushValue.textContent = `${brushSize.value} px`;
});

radius.addEventListener("input", () => {
  radiusValue.textContent = radius.value;
});

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

    // Limit huge images to keep browser memory manageable.
    const maxSide = 2200;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));

    imageCanvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    imageCanvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

    const ctx = imageCanvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    ctx.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);

    maskCanvas.width = imageCanvas.width;
    maskCanvas.height = imageCanvas.height;

    emptyState.style.display = "none";
    canvasWrap.classList.remove("empty");
    imageLoaded = true;

    if (originalMat) originalMat.delete();
    if (currentMat) currentMat.delete();

    // IMPORTANT:
    // cv.imread(canvas) returns a 4-channel RGBA Mat.
    // cv.inpaint() expects an 8-bit 1-channel or 3-channel source.
    // Convert RGBA -> RGB before inpainting.
    const rgba = cv.imread(imageCanvas);
    originalMat = new cv.Mat();
    cv.cvtColor(rgba, originalMat, cv.COLOR_RGBA2RGB);
    rgba.delete();

    currentMat = originalMat.clone();

    clearMask();

    removeBtn.disabled = false;
    resetBtn.disabled = false;
    downloadBtn.disabled = false;

    syncMaskSize();

    const scaledText = scale < 1
      ? ` Image was resized to ${imageCanvas.width} × ${imageCanvas.height} for browser processing.`
      : "";

    setStatus(
      `Loaded ${img.naturalWidth} × ${img.naturalHeight}.${scaledText} ` +
      `Paint over the watermark, then click Remove Selected Area.`
    );
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("Could not open this image.");
  };

  img.src = url;
}

function syncMaskSize() {
  if (!imageLoaded) return;

  const rect = imageCanvas.getBoundingClientRect();

  // Position the mask exactly over the displayed image.
  maskCanvas.style.width = `${rect.width}px`;
  maskCanvas.style.height = `${rect.height}px`;
  maskCanvas.style.left = `${imageCanvas.offsetLeft}px`;
  maskCanvas.style.top = `${imageCanvas.offsetTop}px`;
}

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

maskCanvas.addEventListener("pointerdown", (e) => {
  if (!imageLoaded) return;

  drawing = true;
  maskCanvas.setPointerCapture(e.pointerId);

  lastPoint = canvasPoint(e);
  drawStroke(lastPoint, lastPoint);
});

maskCanvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;

  const point = canvasPoint(e);
  drawStroke(lastPoint, point);
  lastPoint = point;
});

function stopDrawing() {
  drawing = false;
  lastPoint = null;
}

maskCanvas.addEventListener("pointerup", stopDrawing);
maskCanvas.addEventListener("pointercancel", stopDrawing);
maskCanvas.addEventListener("pointerleave", (e) => {
  if (e.buttons === 0) stopDrawing();
});

function drawStroke(a, b) {
  const ctx = maskCanvas.getContext("2d");

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Number(brushSize.value);

  if (eraseMode) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(255,70,70,0.55)";
  }

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.globalCompositeOperation = "source-over";
}

removeBtn.onclick = () => {
  if (!imageLoaded) return;

  if (!cvReady) {
    setStatus("OpenCV is still loading. Please wait a moment and try again.");
    return;
  }

  if (!currentMat || currentMat.empty()) {
    setStatus("Please upload an image first.");
    return;
  }

  // Build a clean 8-bit, single-channel mask from the painted canvas.
  const mask = new cv.Mat(
    maskCanvas.height,
    maskCanvas.width,
    cv.CV_8UC1,
    new cv.Scalar(0)
  );

  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const pixels = maskCtx.getImageData(
    0,
    0,
    maskCanvas.width,
    maskCanvas.height
  ).data;

  // Alpha channel is enough because brush strokes are visible/opaque.
  for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
    mask.data[j] = pixels[i + 3] > 10 ? 255 : 0;
  }

  if (cv.countNonZero(mask) === 0) {
    mask.delete();
    setStatus("Paint over the watermark first.");
    return;
  }

  setStatus("Removing selected area…");
  removeBtn.disabled = true;

  // Let the browser update the status before doing the heavier operation.
  setTimeout(() => {
    try {
      const result = new cv.Mat();

      const inpaintMethod =
        method.value === "ns" ? cv.INPAINT_NS : cv.INPAINT_TELEA;

      cv.inpaint(
        currentMat,
        mask,
        Number(radius.value),
        result,
        inpaintMethod
      );

      if (currentMat) currentMat.delete();
      currentMat = result;

      cv.imshow(imageCanvas, currentMat);

      clearMask();

      setStatus(
        "Done. Paint another watermark area if needed, then remove it again."
      );
    } catch (error) {
      console.error("Inpainting error:", error);

      setStatus(
        "Could not process this selection. Try a smaller painted area or a smaller image."
      );
    } finally {
      mask.delete();
      removeBtn.disabled = false;
    }
  }, 50);
};

resetBtn.onclick = () => {
  if (!originalMat) return;

  if (currentMat) currentMat.delete();
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

window.addEventListener("resize", syncMaskSize);
window.addEventListener("load", syncMaskSize);
