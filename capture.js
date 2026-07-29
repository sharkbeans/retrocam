/**
 * CAPTURE.JS - Live camera capture with getUserMedia and Y2K overlay
 * Handles video stream, canvas rendering, and photo capture with metadata overlay
 */

class CameraCapture {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.glCanvas = null;
        this.sourceCanvas = null;
        this.sourceCtx = null;
        this.ccdFilter = null;
        this.ccdParams = null;
        this.scaleCCDParams = null;
        this.scaledCCDParams = null;
        this.ccdEnabled = true;
        this.ccdIntensity = 1;
        this.isFrontCamera = false;
        this.isDocumentVisible = !document.hidden;
        this.isCCDInitializing = false;
        this.renderLoopId = null;
        this.stream = null;
        this.isStreaming = false;
        this.isInitializing = false;
        this.photoCount = 0;
        this.batteryLevel = 85;
        this.osdCanvas = null;
        this.osdCtx = null;
        this.liveOsdCanvas = null;
        this.liveOsdCtx = null;
        this.osdCacheKey = null;
        this.osdFontFamily = '"Share Tech Mono", "Courier New", monospace';

        this.initElements();
        this.initEventListeners();
        this.initCCDFilter();
        this.initOSDFont();
        this.initCamera();
    }

    initElements() {
        // Create hidden video element for camera stream
        this.video = document.createElement('video');
        this.video.setAttribute('playsinline', 'true');
        this.video.style.display = 'none';

        // Create canvas for rendering - use higher res on mobile for fullscreen
        this.canvas = document.createElement('canvas');
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.canvas.width = isMobile ? 960 : 480;
        this.canvas.height = isMobile ? 720 : 360;
        this.ctx = this.canvas.getContext('2d');
        this.canvas.classList.add('live-view-canvas');

        this.sourceCanvas = document.createElement('canvas');
        this.sourceCanvas.width = this.canvas.width;
        this.sourceCanvas.height = this.canvas.height;
        this.sourceCtx = this.sourceCanvas.getContext('2d', { alpha: false });

        this.glCanvas = document.createElement('canvas');
        this.glCanvas.width = this.canvas.width;
        this.glCanvas.height = this.canvas.height;
        this.glCanvas.style.display = 'none';

        this.osdCanvas = document.createElement('canvas');
        this.osdCanvas.width = this.canvas.width;
        this.osdCanvas.height = this.canvas.height;
        this.osdCtx = this.osdCanvas.getContext('2d');

        this.liveOsdCanvas = document.createElement('canvas');
        this.liveOsdCanvas.width = this.canvas.width;
        this.liveOsdCanvas.height = this.canvas.height;
        this.liveOsdCanvas.classList.add('osd-layer');
        this.liveOsdCtx = this.liveOsdCanvas.getContext('2d');

        document.body.appendChild(this.video);
    }

    initOSDFont() {
        if (!document.fonts || !document.fonts.load) {
            return;
        }

        document.fonts.load(`600 24px ${this.osdFontFamily}`).then(() => {
            this.osdCacheKey = null;
            if (this.isStreaming) {
                this.renderCameraFrame();
            }
            if (gallery && typeof gallery.updateDisplay === 'function') {
                gallery.updateDisplay();
            }
        }).catch(() => {});
    }

    initEventListeners() {
        document.addEventListener('visibilitychange', () => {
            this.isDocumentVisible = !document.hidden;

            if (this.isDocumentVisible) {
                if (this.isStreaming) {
                    this.startLiveView();
                }
                return;
            }

            this.stopRenderLoop();
        });

        this.glCanvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            console.warn('CCD filter context lost, falling back to raw camera frames');
            this.ccdFilter = null;
            this.scaledCCDParams = null;
        });

        this.glCanvas.addEventListener('webglcontextrestored', () => {
            console.log('CCD filter context restored, reinitialising filter');
            this.initCCDFilter();
        });
    }

    async initCCDFilter() {
        if (this.isCCDInitializing) {
            return;
        }

        this.isCCDInitializing = true;

        try {
            const [
                { ProCCDFilter },
                { PARAMS, scaleParams }
            ] = await Promise.all([
                import('./filters/proccd/filter.js'),
                import('./filters/proccd/params.js')
            ]);

            this.ccdParams = PARAMS;
            this.scaleCCDParams = scaleParams;
            this.scaledCCDParams = null;

            const filter = new ProCCDFilter(this.glCanvas);
            if ('downres_short_side' in PARAMS) {
                filter.baseShort = PARAMS.downres_short_side;
            }

            filter.resize(this.canvas.width, this.canvas.height);
            this.ccdFilter = filter;
            console.log('CCD filter initialised');
        } catch (error) {
            console.error('Failed to initialise CCD filter:', error);
            this.ccdFilter = null;
            this.scaledCCDParams = null;
        } finally {
            this.isCCDInitializing = false;
        }
    }

    async initCamera() {
        this.isInitializing = true;
        try {
            // Use back camera on mobile, front camera on desktop
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const facingMode = isMobile ? 'environment' : 'user';
            this.isFrontCamera = facingMode === 'user';

            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: isMobile ? 1280 : 640 },
                    height: { ideal: isMobile ? 960 : 480 },
                    facingMode: facingMode
                },
                audio: false
            });

            this.video.srcObject = this.stream;
            const handleStreamReady = () => {
                this.isStreaming = true;
                this.isInitializing = false;
                this.syncCanvasSize();
                this.startLiveView();
            };

            await this.video.play();

            if (this.video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                handleStreamReady();
            } else {
                this.video.onloadedmetadata = handleStreamReady;
            }
        } catch (error) {
            console.error('Camera access error:', error);
            this.isInitializing = false;
            this.drawFallbackFrame();
            this.startLiveView();
        }
    }

    startLiveView() {
        const liveViewContainer = document.querySelector('.live-view');
        if (!liveViewContainer) {
            return;
        }

        this.stopRenderLoop();

        if (this.canvas.parentElement !== liveViewContainer) {
            liveViewContainer.replaceChildren();
            liveViewContainer.appendChild(this.canvas);
            liveViewContainer.appendChild(this.liveOsdCanvas);
        }

        if (!this.isStreaming || !this.isDocumentVisible) {
            return;
        }

        const renderFrame = () => {
            if (!this.isStreaming || !this.isDocumentVisible) {
                this.renderLoopId = null;
                return;
            }

            this.renderCameraFrame();
            this.renderLoopId = requestAnimationFrame(renderFrame);
        };

        this.renderCameraFrame();
        this.renderLoopId = requestAnimationFrame(renderFrame);
    }

    buildOSDState({
        forceRecOn = false,
        timerValue,
        storageValue,
        timestamp,
        batteryText,
        batteryLevel,
        recOn
    } = {}) {
        return {
            timerValue: timerValue || cameraUI?.timerDisplay?.textContent || (cameraUI ? cameraUI.getTimerValue() : '000000'),
            storageValue: storageValue || cameraUI?.storageDisplay?.textContent || '100M',
            timestamp: timestamp || cameraUI?.timestampDisplay?.textContent || this.getOverlayTimestamp(),
            batteryText: batteryText || `${Math.round(this.batteryLevel)}%`,
            batteryLevel: typeof batteryLevel === 'number' ? batteryLevel : this.batteryLevel,
            recOn: typeof recOn === 'boolean' ? recOn : (forceRecOn || (Math.floor(performance.now() / 600) % 2 === 0))
        };
    }

    ensureOverlayCache(state) {
        const W = this.canvas.width;
        const H = this.canvas.height;

        if (this.osdCanvas.width !== W || this.osdCanvas.height !== H) {
            this.osdCanvas.width = W;
            this.osdCanvas.height = H;
            this.osdCacheKey = null;
        }

        const cacheKey = `${state.timerValue}|${state.storageValue}|${state.timestamp}|${state.batteryText}|${state.recOn}|${W}|${H}`;
        if (cacheKey !== this.osdCacheKey) {
            this.renderOSD(this.osdCtx, W, H, state);
            this.osdCacheKey = cacheKey;
        }
    }

    drawOverlay({ forceRecOn = false } = {}) {
        const state = this.buildOSDState({ forceRecOn });
        this.ensureOverlayCache(state);
        this.ctx.drawImage(this.osdCanvas, 0, 0);
    }

    drawLiveOverlay({ forceRecOn = false } = {}) {
        if (!this.liveOsdCtx) {
            return;
        }

        const W = this.canvas.width;
        const H = this.canvas.height;
        if (this.liveOsdCanvas.width !== W || this.liveOsdCanvas.height !== H) {
            this.liveOsdCanvas.width = W;
            this.liveOsdCanvas.height = H;
        }

        const state = this.buildOSDState({ forceRecOn });
        this.ensureOverlayCache(state);

        this.liveOsdCtx.clearRect(0, 0, W, H);
        this.liveOsdCtx.drawImage(this.osdCanvas, 0, 0);
    }

    renderOSD(ctx, W, H, { timerValue, storageValue, timestamp, batteryText, batteryLevel, recOn }) {
        ctx.clearRect(0, 0, W, H);

        const scale = H / 360;
        const margin = Math.max(8, Math.round(10 * scale));
        const stampColor = this.ccdParams && this.ccdParams.stamp_color
            ? `rgb(${this.ccdParams.stamp_color[0]}, ${this.ccdParams.stamp_color[1]}, ${this.ccdParams.stamp_color[2]})`
            : 'rgb(255, 150, 40)';

        const timerSize = Math.max(14, Math.round(16 * scale));
        const storageSize = Math.max(12, Math.round(14 * scale));
        const stampSize = Math.max(11, Math.round(13 * scale));
        const batterySize = Math.max(12, Math.round(14 * scale));
        const rowBottom = H - margin;
        const gap = Math.max(5, Math.round(6 * scale));

        this.drawOSDText(ctx, timerValue, margin, margin, {
            fontSize: timerSize,
            color: '#f4f7fb',
            align: 'left',
            baseline: 'top'
        });

        this.drawOSDText(ctx, storageValue, W - margin, margin, {
            fontSize: storageSize,
            color: '#f4f7fb',
            align: 'right',
            baseline: 'top'
        });

        this.drawOSDText(ctx, timestamp, margin, rowBottom, {
            fontSize: stampSize,
            color: stampColor,
            align: 'left',
            baseline: 'bottom',
            glow: true
        });

        let cursorRight = W - margin;
        const batteryMetrics = this.drawOSDText(ctx, batteryText, cursorRight, rowBottom, {
            fontSize: batterySize,
            color: '#f4f7fb',
            align: 'right',
            baseline: 'bottom',
            measureOnly: true
        });
        this.drawOSDText(ctx, batteryText, cursorRight, rowBottom, {
            fontSize: batterySize,
            color: '#f4f7fb',
            align: 'right',
            baseline: 'bottom'
        });
        cursorRight -= batteryMetrics.width + gap;

        const iconW = Math.max(18, Math.round(24 * scale));
        const iconH = Math.max(10, Math.round(14 * scale));
        const iconX = cursorRight - iconW;
        const iconY = rowBottom - iconH;
        this.drawBatteryIcon(ctx, iconX, iconY, iconW, iconH, batteryLevel);
        cursorRight -= iconW + gap;

        if (recOn) {
            const dotSize = iconH;
            const dotX = cursorRight - dotSize;
            const dotY = rowBottom - dotSize;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(dotX, dotY, dotSize, dotSize);
        }
    }

    drawOSDText(ctx, text, x, y, {
        fontSize,
        color,
        align = 'left',
        baseline = 'alphabetic',
        glow = false,
        measureOnly = false
    }) {
        ctx.save();
        ctx.font = `600 ${fontSize}px ${this.osdFontFamily}`;
        ctx.textAlign = align;
        ctx.textBaseline = baseline;
        const metrics = ctx.measureText(text);

        if (measureOnly) {
            ctx.restore();
            return metrics;
        }

        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.18));
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowColor = glow ? 'rgba(255, 160, 72, 0.35)' : 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = glow ? Math.max(4, Math.round(fontSize * 0.35)) : Math.max(1, Math.round(fontSize * 0.12));
        ctx.strokeText(text, x, y);

        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        ctx.restore();

        return metrics;
    }

    drawBatteryIcon(ctx, x, y, width, height, batteryLevel = this.batteryLevel) {
        const strokeWidth = Math.max(2, Math.round(height * 0.14));
        const terminalW = Math.max(3, Math.round(width * 0.12));
        const terminalH = Math.max(4, Math.round(height * 0.45));
        const bodyW = width - terminalW - strokeWidth;

        ctx.save();
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = '#f4f7fb';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = Math.max(1, Math.round(height * 0.1));
        ctx.strokeRect(x, y, bodyW, height);
        ctx.strokeRect(x + bodyW, y + (height - terminalH) / 2, terminalW, terminalH);

        if (batteryLevel > 50) {
            ctx.fillStyle = '#00ff00';
        } else if (batteryLevel > 20) {
            ctx.fillStyle = '#ffff00';
        } else {
            ctx.fillStyle = '#ff0000';
        }
        ctx.shadowBlur = 0;
        const innerPad = strokeWidth;
        const innerW = Math.max(0, bodyW - innerPad * 2);
        const fillW = innerW * (batteryLevel / 100);
        ctx.fillRect(
            x + innerPad,
            y + innerPad,
            fillW,
            Math.max(1, height - innerPad * 2)
        );
        ctx.restore();
    }

    drawFallbackFrame() {
        // Draw gradient fallback when camera is not available
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, '#1a3a52');
        gradient.addColorStop(1, '#0a2a3a');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const unit = Math.max(2, Math.round(this.canvas.height / 150));
        const text = 'CAMERA NOT AVAILABLE';
        const w = window.PixelFont.measure(text, unit);
        window.PixelFont.draw(
            this.ctx,
            text,
            (this.canvas.width - w) / 2,
            (this.canvas.height - window.PixelFont.height(unit)) / 2,
            { unit, color: '#4db8ff', align: 'left', baseline: 'top' }
        );
    }

    capturePhoto() {
        const rendered = this.renderCameraFrame();
        if (!rendered) {
            console.error('No camera frame available');
            return null;
        }

        const osdState = this.buildOSDState({ forceRecOn: true, recOn: true });

        return {
            data: this.canvas.toDataURL('image/jpeg', 0.70),
            number: String(this.photoCount).padStart(5, '0'),
            timestamp: osdState.timestamp,
            overlay: {
                timerValue: osdState.timerValue,
                storageValue: osdState.storageValue,
                timestamp: osdState.timestamp,
                batteryText: osdState.batteryText,
                batteryLevel: osdState.batteryLevel,
                recOn: true
            }
        };
    }

    drawCaptureOverlay() {
        // Legacy capture grain disabled so ProCCD is the only image-processing effect.
    }

    incrementPhotoCount() {
        this.photoCount++;
    }

    decreaseBattery() {
        if (this.batteryLevel > 0) {
            this.batteryLevel -= 0.5;
        }

        if (cameraUI) {
            cameraUI.updateBatteryDisplay(this.batteryLevel);
        }
    }

    formatTimestamp(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
    }

    getOverlayTimestamp() {
        return cameraUI?.timestampDisplay?.textContent || this.formatOverlayTimestamp(new Date());
    }

    formatOverlayTimestamp(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year} ${month} ${day} ${hours}:${minutes}:${seconds}`;
    }

    stopRenderLoop() {
        if (this.renderLoopId !== null) {
            cancelAnimationFrame(this.renderLoopId);
            this.renderLoopId = null;
        }
    }

    syncCanvasSize() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const targetWidth = isMobile ? 960 : 480;
        const targetHeight = isMobile ? 720 : 360;

        if (this.canvas.width === targetWidth && this.canvas.height === targetHeight) {
            this.syncCCDFilterSize();
            return;
        }

        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;
        this.sourceCanvas.width = targetWidth;
        this.sourceCanvas.height = targetHeight;
        this.glCanvas.width = targetWidth;
        this.glCanvas.height = targetHeight;
        this.osdCanvas.width = targetWidth;
        this.osdCanvas.height = targetHeight;
        this.liveOsdCanvas.width = targetWidth;
        this.liveOsdCanvas.height = targetHeight;
        this.osdCacheKey = null;
        this.syncCCDFilterSize();
    }

    syncCCDFilterSize() {
        if (!this.ccdFilter) {
            return;
        }

        if (this.ccdParams && 'downres_short_side' in this.ccdParams) {
            this.ccdFilter.baseShort = this.ccdParams.downres_short_side;
        }

        this.ccdFilter.resize(this.canvas.width, this.canvas.height);
    }

    updateSourceFrame() {
        if (!this.video || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            return false;
        }

        const sourceWidth = this.video.videoWidth || this.canvas.width;
        const sourceHeight = this.video.videoHeight || this.canvas.height;
        const sourceAspect = sourceWidth / sourceHeight;
        const targetAspect = this.sourceCanvas.width / this.sourceCanvas.height;

        let sx = 0;
        let sy = 0;
        let sw = sourceWidth;
        let sh = sourceHeight;

        if (sourceAspect > targetAspect) {
            sw = sourceHeight * targetAspect;
            sx = (sourceWidth - sw) / 2;
        } else if (sourceAspect < targetAspect) {
            sh = sourceWidth / targetAspect;
            sy = (sourceHeight - sh) / 2;
        }

        this.sourceCtx.clearRect(0, 0, this.sourceCanvas.width, this.sourceCanvas.height);
        this.sourceCtx.drawImage(
            this.video,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            this.sourceCanvas.width,
            this.sourceCanvas.height
        );

        return true;
    }

    drawOutputFrame(source, flipX = false) {
        const width = this.canvas.width;
        const height = this.canvas.height;

        this.ctx.save();
        this.ctx.clearRect(0, 0, width, height);
        if (flipX) {
            this.ctx.translate(width, 0);
            this.ctx.scale(-1, 1);
        }
        this.ctx.drawImage(source, 0, 0, width, height);
        this.ctx.restore();
    }

    getScaledCCDParams() {
        if (!this.ccdParams || !this.scaleCCDParams) {
            return null;
        }

        if (this.scaledCCDParams && this.scaledCCDParams.intensity === this.ccdIntensity) {
            return this.scaledCCDParams.value;
        }

        const clampedIntensity = Math.max(0, Math.min(1.5, this.ccdIntensity));
        this.ccdIntensity = clampedIntensity;
        const value = this.scaleCCDParams(this.ccdParams, clampedIntensity);
        this.scaledCCDParams = {
            intensity: clampedIntensity,
            value
        };
        return value;
    }

    isCCDActive() {
        return Boolean(
            this.ccdEnabled &&
            this.ccdFilter &&
            this.ccdParams &&
            this.scaleCCDParams
        );
    }

    renderCameraFrame({ forceRecOn = false, drawHudToFrame = false } = {}) {
        if (
            !this.isStreaming ||
            !this.video ||
            this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
            return false;
        }

        if (!this.updateSourceFrame()) {
            return false;
        }

        let rendered = false;

        if (this.isCCDActive()) {
            const params = this.getScaledCCDParams();

            try {
                this.syncCCDFilterSize();
                this.ccdFilter.render(
                    this.sourceCanvas,
                    params,
                    performance.now() / 1000,
                    { flipX: this.isFrontCamera }
                );
                this.drawOutputFrame(this.glCanvas);
                rendered = true;
            } catch (error) {
                console.error('CCD render failed, falling back to raw camera frames:', error);
                this.ccdFilter = null;
                this.scaledCCDParams = null;
            }
        }

        if (!rendered) {
            this.drawOutputFrame(this.sourceCanvas, this.isFrontCamera);
        }

        // Kept separate from the CCD try/catch above: an OSD drawing error must never
        // be misattributed as a CCD failure (which would needlessly disable the WebGL
        // filter), and must never escape uncaught here, or it silently kills the whole
        // requestAnimationFrame loop, freezing the live view with no HUD.
        try {
            if (drawHudToFrame) {
                this.drawOverlay({ forceRecOn });
            }
            this.drawLiveOverlay({ forceRecOn });
        } catch (error) {
            console.error('OSD overlay render failed:', error);
        }

        return true;
    }

    drawPhotoToCanvas(source, targetCanvas, photoEntry = null) {
        if (!source || !targetCanvas) {
            return;
        }

        const width = source.naturalWidth || source.videoWidth || source.width || this.canvas.width;
        const height = source.naturalHeight || source.videoHeight || source.height || this.canvas.height;

        if (!width || !height) {
            return;
        }

        if (targetCanvas.width !== width || targetCanvas.height !== height) {
            targetCanvas.width = width;
            targetCanvas.height = height;
        }

        const ctx = targetCanvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(source, 0, 0, width, height);

        if (photoEntry?.overlay) {
            this.renderOSD(ctx, width, height, this.buildOSDState({
                timerValue: photoEntry.overlay.timerValue,
                storageValue: photoEntry.overlay.storageValue,
                timestamp: photoEntry.overlay.timestamp || photoEntry.timestamp,
                batteryText: photoEntry.overlay.batteryText,
                batteryLevel: photoEntry.overlay.batteryLevel,
                recOn: photoEntry.overlay.recOn
            }));
        }
    }

    async composePhotoDataURL(photoEntry) {
        if (!photoEntry?.data || !photoEntry.overlay) {
            return photoEntry?.data || '';
        }

        if (document.fonts?.ready) {
            try {
                await document.fonts.ready;
            } catch (error) {
                console.warn('OSD font readiness check failed:', error);
            }
        }

        const image = new Image();
        image.decoding = 'async';

        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = photoEntry.data;
        });

        const canvas = document.createElement('canvas');
        this.drawPhotoToCanvas(image, canvas, photoEntry);
        return canvas.toDataURL('image/jpeg', 0.70);
    }

    stopStream() {
        this.stopRenderLoop();

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        this.stream = null;
        this.video.pause();
        this.video.srcObject = null;
        this.isStreaming = false;
        this.isInitializing = false;
        console.log('✓ Camera stream stopped');
    }

    async restartStream() {
        console.log('Attempting to restart camera stream...');
        // Stop existing stream if any
        this.stopStream();

        // Reinitialize the camera
        await this.initCamera();
        console.log('✓ Camera stream restarted');
    }

    playShutterAnimation(photoDataUrl) {
        // Create a thumbnail element with the captured photo
        const thumbnail = document.createElement('img');
        thumbnail.src = photoDataUrl;
        thumbnail.className = 'capture-thumbnail';

        const cameraFrame = document.querySelector('.camera-frame');
        const container = cameraFrame || document.body;
        container.appendChild(thumbnail);

        // The end state is a fixed scale (0.25, set in the CSS keyframe) but the
        // translate distance to actually land in the corner depends on the frame's
        // rendered size, which differs a lot between desktop and fullscreen mobile.
        // Compute it here instead of hardcoding a single px offset in the keyframe.
        const frameW = container.clientWidth;
        const frameH = container.clientHeight;
        const endScale = 0.25;
        const margin = 16;
        const endW = thumbnail.offsetWidth * endScale;
        const endH = thumbnail.offsetHeight * endScale;
        const dx = (frameW - margin - endW / 2) - frameW / 2;
        const dy = (margin + endH / 2) - frameH / 2;

        thumbnail.style.setProperty('--capture-end-x', `${dx}px`);
        thumbnail.style.setProperty('--capture-end-y', `${dy}px`);

        // Remove the element after animation completes
        setTimeout(() => {
            thumbnail.remove();
        }, 1000);
    }
}

// Initialize camera on page load
let cameraCapture;
document.addEventListener('DOMContentLoaded', () => {
    // Delay initialization to ensure DOM is ready
    setTimeout(() => {
        cameraCapture = new CameraCapture();
    }, 100);
});
