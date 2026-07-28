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
        this.osdCacheKey = null;

        this.initElements();
        this.initEventListeners();
        this.initCCDFilter();
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

        document.body.appendChild(this.video);
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

    drawOverlay({ forceRecOn = false } = {}) {
        const W = this.canvas.width;
        const H = this.canvas.height;

        if (this.osdCanvas.width !== W || this.osdCanvas.height !== H) {
            this.osdCanvas.width = W;
            this.osdCanvas.height = H;
            this.osdCacheKey = null;
        }

        const timerValue = cameraUI?.timerDisplay?.textContent || (cameraUI ? cameraUI.getTimerValue() : '000000');
        const storageValue = cameraUI?.storageDisplay?.textContent || '100M';
        const timestamp = cameraUI?.timestampDisplay?.textContent || this.getOverlayTimestamp();
        const batteryText = `${this.batteryLevel.toFixed(0)}%`;
        const recOn = forceRecOn || (Math.floor(performance.now() / 600) % 2 === 0);

        const cacheKey = `${timerValue}|${storageValue}|${timestamp}|${batteryText}|${recOn}|${W}|${H}`;
        if (cacheKey !== this.osdCacheKey) {
            this.renderOSD(this.osdCtx, W, H, {
                timerValue, storageValue, timestamp, batteryText, recOn
            });
            this.osdCacheKey = cacheKey;
        }

        this.ctx.drawImage(this.osdCanvas, 0, 0);
    }

    renderOSD(ctx, W, H, { timerValue, storageValue, timestamp, batteryText, recOn }) {
        ctx.clearRect(0, 0, W, H);

        const unit = Math.max(2, Math.round(H / 150));
        const margin = 4 * unit;
        const stampColor = this.ccdParams && this.ccdParams.stamp_color
            ? `rgb(${this.ccdParams.stamp_color[0]}, ${this.ccdParams.stamp_color[1]}, ${this.ccdParams.stamp_color[2]})`
            : 'rgb(255, 150, 40)';

        // Top-Left: Timer
        window.PixelFont.draw(ctx, timerValue, margin, margin, {
            unit, color: '#ffffff', align: 'left', baseline: 'top'
        });

        // Top-Right: Storage
        window.PixelFont.draw(ctx, storageValue, W - margin, margin, {
            unit, color: '#ffffff', align: 'right', baseline: 'top'
        });

        // Bottom-Left: Timestamp (amber, with glow)
        window.PixelFont.draw(ctx, timestamp, margin, H - margin, {
            unit, color: stampColor, align: 'left', baseline: 'bottom', glow: true
        });

        // Bottom-Right cluster: [REC dot] [battery icon] [battery %], bottom-aligned
        const rowBottom = H - margin;
        const gap = 2 * unit;

        let cursorRight = W - margin;
        const textW = window.PixelFont.draw(ctx, batteryText, cursorRight, rowBottom, {
            unit, color: '#ffffff', align: 'right', baseline: 'bottom'
        });
        cursorRight -= textW + gap;

        const iconW = 9 * unit;
        const iconH = 5 * unit;
        const iconX = cursorRight - iconW;
        const iconY = rowBottom - iconH;
        this.drawBatteryIcon(ctx, iconX, iconY, unit);
        cursorRight -= iconW + gap;

        if (recOn) {
            const dotSize = iconH;
            const dotX = cursorRight - dotSize;
            const dotY = rowBottom - dotSize;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(dotX, dotY, dotSize, dotSize);
        }
    }

    drawBatteryIcon(ctx, x, y, unit) {
        const bodyW = 8 * unit;
        const bodyH = 5 * unit;
        const terminalW = unit;
        const terminalH = 3 * unit;

        // Outline (1-cell-thick, pixel-snapped)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, bodyW, unit);
        ctx.fillRect(x, y + bodyH - unit, bodyW, unit);
        ctx.fillRect(x, y, unit, bodyH);
        ctx.fillRect(x + bodyW - unit, y, unit, bodyH);

        // Terminal nub
        ctx.fillRect(x + bodyW, y + (bodyH - terminalH) / 2, terminalW, terminalH);

        // Fill based on level, quantised to the unit grid
        if (this.batteryLevel > 50) {
            ctx.fillStyle = '#00ff00';
        } else if (this.batteryLevel > 20) {
            ctx.fillStyle = '#ffff00';
        } else {
            ctx.fillStyle = '#ff0000';
        }
        const innerW = bodyW - 2 * unit;
        const fillCells = Math.round((innerW / unit) * (this.batteryLevel / 100));
        ctx.fillRect(x + unit, y + unit, fillCells * unit, bodyH - 2 * unit);
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
        const rendered = this.renderCameraFrame({ forceRecOn: true });
        if (!rendered) {
            console.error('No camera frame available');
            return null;
        }

        // Legacy capture grain disabled so ProCCD is the only image-processing effect.
        // this.drawCaptureOverlay(this.isCCDActive());

        // Convert to base64 - low quality JPEG for authentic block/ring artifacts
        return {
            data: this.canvas.toDataURL('image/jpeg', 0.70),
            number: String(this.photoCount).padStart(5, '0'),
            timestamp: this.getOverlayTimestamp()
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

    renderCameraFrame({ forceRecOn = false } = {}) {
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
                this.drawOverlay({ forceRecOn });
                return true;
            } catch (error) {
                console.error('CCD render failed, falling back to raw camera frames:', error);
                this.ccdFilter = null;
                this.scaledCCDParams = null;
            }
        }

        this.drawOutputFrame(this.sourceCanvas, this.isFrontCamera);
        this.drawOverlay({ forceRecOn });
        return true;
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
