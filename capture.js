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

    drawOverlay() {
        // Helper function to draw text with black outline effect (Y2K style)
        const drawOutlinedText = (text, x, y, font, color) => {
            this.ctx.font = font;
            this.ctx.fillStyle = '#000000';

            // Draw black outline at various offsets
            const offsets = [
                [-1, -1], [1, -1], [-1, 1], [1, 1],
                [-2, 0], [2, 0], [0, -2], [0, 2]
            ];

            offsets.forEach(([ox, oy]) => {
                this.ctx.fillText(text, x + ox, y + oy);
            });

            // Draw white text on top
            this.ctx.fillStyle = color;
            this.ctx.fillText(text, x, y);
        };

        const scale = Math.min(this.canvas.width / 480, this.canvas.height / 360);
        const left = Math.round(8 * scale);
        const top = Math.round(18 * scale);
        const bottom = this.canvas.height - Math.round(12 * scale);
        const right = this.canvas.width - Math.round(8 * scale);
        const batteryX = this.canvas.width - Math.round(60 * scale);
        const batteryY = this.canvas.height - Math.round(22 * scale);
        const batteryTextX = this.canvas.width - Math.round(35 * scale);
        const recordingX = this.canvas.width - Math.round(15 * scale);
        const recordingY = this.canvas.height - Math.round(20 * scale);
        const iconSize = Math.max(6, Math.round(8 * scale));
        const timerValue = cameraUI?.timerDisplay?.textContent || (cameraUI ? cameraUI.getTimerValue() : '000000');
        const storageValue = cameraUI?.storageDisplay?.textContent || '100M';
        const timestamp = cameraUI?.timestampDisplay?.textContent || this.getOverlayTimestamp();

        // Top-Left: Timer display
        this.ctx.textAlign = 'left';
        drawOutlinedText(timerValue, left, top, `bold ${Math.max(14, Math.round(14 * scale))}px monospace`, '#ffffff');

        // Top-Right: Storage display
        this.ctx.textAlign = 'right';
        drawOutlinedText(storageValue, right, top, `bold ${Math.max(11, Math.round(11 * scale))}px monospace`, '#ffffff');
        this.ctx.textAlign = 'left';

        // Bottom-Left: Timestamp
        drawOutlinedText(timestamp, left, bottom, `${Math.max(10, Math.round(10 * scale))}px monospace`, '#ffffff');

        // Bottom-Right: Battery indicator and recording dot
        this.drawBatteryIcon(batteryX, batteryY, scale);
        drawOutlinedText(
            `${this.batteryLevel.toFixed(0)}%`,
            batteryTextX,
            bottom,
            `${Math.max(10, Math.round(10 * scale))}px monospace`,
            '#ffffff'
        );

        // Recording indicator (red square)
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillRect(recordingX, recordingY, iconSize, iconSize);
    }

    drawBatteryIcon(x, y, scale = 1) {
        const width = Math.round(18 * scale);
        const height = Math.max(6, Math.round(8 * scale));
        const terminalWidth = Math.max(2, Math.round(2 * scale));

        // Battery outline in white
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, width, height);

        // Battery terminal
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(x + width, y + Math.max(1, Math.round(2 * scale)), terminalWidth, Math.max(2, Math.round(4 * scale)));

        // Battery fill based on level - green to red gradient
        const fillWidth = (width - 2) * (this.batteryLevel / 100);
        if (this.batteryLevel > 50) {
            this.ctx.fillStyle = '#00ff00';
        } else if (this.batteryLevel > 20) {
            this.ctx.fillStyle = '#ffff00';
        } else {
            this.ctx.fillStyle = '#ff0000';
        }
        this.ctx.fillRect(x + 1, y + 1, fillWidth, height - 2);
    }

    drawFallbackFrame() {
        // Draw gradient fallback when camera is not available
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, '#1a3a52');
        gradient.addColorStop(1, '#0a2a3a');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = '#4db8ff';
        this.ctx.font = 'bold 14px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('CAMERA NOT AVAILABLE', this.canvas.width / 2, this.canvas.height / 2);
    }

    capturePhoto() {
        const rendered = this.renderCameraFrame();
        if (!rendered) {
            console.error('No camera frame available');
            return null;
        }

        // Draw Y2K camcorder overlay (timer, storage, timestamp, battery)
        this.drawOverlay();

        // Legacy capture grain disabled so ProCCD is the only image-processing effect.
        // this.drawCaptureOverlay(this.isCCDActive());

        // Convert to base64
        return {
            data: this.canvas.toDataURL('image/jpeg'),
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

    renderCameraFrame() {
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
                return true;
            } catch (error) {
                console.error('CCD render failed, falling back to raw camera frames:', error);
                this.ccdFilter = null;
                this.scaledCCDParams = null;
            }
        }

        this.drawOutputFrame(this.sourceCanvas, this.isFrontCamera);
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
        if (cameraFrame) {
            cameraFrame.appendChild(thumbnail);
        } else {
            document.body.appendChild(thumbnail);
        }

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
