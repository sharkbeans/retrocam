/**
 * CAPTURE.JS - Live camera capture with getUserMedia and Y2K overlay
 * Handles video stream, canvas rendering, and photo capture with metadata overlay
 */

class CameraCapture {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.stream = null;
        this.isStreaming = false;
        this.photoCount = 0;
        this.batteryLevel = 85;

        this.initElements();
        this.initCamera();
    }

    initElements() {
        // Create hidden video element for camera stream
        this.video = document.createElement('video');
        this.video.setAttribute('playsinline', 'true');
        this.video.style.display = 'none';

        // Create canvas for rendering
        this.canvas = document.createElement('canvas');
        this.canvas.width = 480;
        this.canvas.height = 360;
        this.ctx = this.canvas.getContext('2d');

        document.body.appendChild(this.video);
    }

    async initCamera() {
        try {
            // Use back camera on mobile, front camera on desktop
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const facingMode = isMobile ? 'environment' : 'user';

            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: facingMode
                },
                audio: false
            });

            this.video.srcObject = this.stream;
            this.video.play();

            this.video.onloadedmetadata = () => {
                this.isStreaming = true;
                this.startLiveView();
            };
        } catch (error) {
            console.error('Camera access error:', error);
            this.drawFallbackFrame();
        }
    }

    startLiveView() {
        const liveViewContainer = document.querySelector('.live-view');
        if (!liveViewContainer) return;

        // Create a single img element to reuse
        let liveViewImg = document.createElement('img');
        liveViewImg.style.width = '100%';
        liveViewImg.style.height = '100%';
        liveViewImg.style.objectFit = 'cover';
        liveViewContainer.appendChild(liveViewImg);

        let frameCount = 0;
        const renderFrame = () => {
            if (this.isStreaming) {
                // Draw video frame to canvas
                this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

                // Only update image every 2 frames to reduce flickering
                if (frameCount % 2 === 0) {
                    liveViewImg.src = this.canvas.toDataURL('image/jpeg');
                }
                frameCount++;
            }
            requestAnimationFrame(renderFrame);
        };

        renderFrame();
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

        // Top-Left: Timer display
        this.ctx.textAlign = 'left';
        drawOutlinedText('000000', 8, 18, 'bold 14px monospace', '#ffffff');

        // Top-Right: Storage display
        this.ctx.textAlign = 'right';
        drawOutlinedText('100M', 472, 18, 'bold 11px monospace', '#ffffff');
        this.ctx.textAlign = 'left';

        // Bottom-Left: Timestamp
        const now = new Date();
        const timestamp = this.formatTimestamp(now);
        drawOutlinedText(timestamp, 8, 348, '10px monospace', '#ffffff');

        // Bottom-Right: Battery indicator and recording dot
        this.drawBatteryIcon(420, 338);
        drawOutlinedText(this.batteryLevel.toFixed(0) + '%', 445, 348, '10px monospace', '#ffffff');

        // Recording indicator (red square)
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillRect(465, 340, 8, 8);
    }

    drawBatteryIcon(x, y) {
        const width = 18;
        const height = 8;

        // Battery outline in white
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, width, height);

        // Battery terminal
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(x + width, y + 2, 2, 4);

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
        if (!this.isStreaming) {
            console.error('Camera not streaming');
            return null;
        }

        // Draw current frame
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

        // Draw Y2K camcorder overlay (timer, storage, timestamp, battery)
        this.drawOverlay();

        // Draw capture effects (grain for Y2K aesthetic)
        this.drawCaptureOverlay();

        // Convert to base64
        return {
            data: this.canvas.toDataURL('image/jpeg'),
            number: String(this.photoCount).padStart(5, '0'),
            timestamp: this.formatTimestamp(new Date())
        };
    }

    drawCaptureOverlay() {
        // Add subtle grain effect
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = Math.random() * 20 - 10;
            data[i] += noise;
            data[i + 1] += noise;
            data[i + 2] += noise;
        }
        this.ctx.putImageData(imageData, 0, 0);
    }

    incrementPhotoCount() {
        this.photoCount++;
    }

    decreaseBattery() {
        if (this.batteryLevel > 0) {
            this.batteryLevel -= 0.5;
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

    stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.isStreaming = false;
            console.log('✓ Camera stream stopped');
        }
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

        document.body.appendChild(thumbnail);

        // Remove the element after animation completes
        setTimeout(() => {
            thumbnail.remove();
        }, 600);
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