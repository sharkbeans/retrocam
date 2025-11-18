/**
 * CAMERA-UI.JS - Camera view UI overlays management
 * Handles timer, timestamp, and dynamic UI element updates
 */

class CameraUI {
    constructor() {
        this.recordingStartTime = null;
        this.isRecording = false;

        this.initElements();
        this.startTimestampUpdate();
    }

    initElements() {
        this.timerDisplay = document.querySelector('.timer-value');
        this.timestampDisplay = document.querySelector('.timestamp-value');
        this.storageDisplay = document.querySelector('.storage-value');
        this.recordingDot = document.querySelector('.recording-dot');
        this.sdIndicator = document.querySelector('.sd-indicator');
    }

    startTimestampUpdate() {
        // Update timestamp every second
        const updateTimestamp = () => {
            const now = new Date();
            const timestamp = this.formatTimestamp(now);
            if (this.timestampDisplay) {
                this.timestampDisplay.textContent = timestamp;
            }
        };

        // Initial update
        updateTimestamp();

        // Update every 1 second
        setInterval(updateTimestamp, 1000);
    }

    startRecording() {
        this.isRecording = true;
        this.recordingStartTime = Date.now();

        // Start timer update loop
        if (this.timerDisplay) {
            const updateTimer = () => {
                if (this.isRecording) {
                    const elapsed = Date.now() - this.recordingStartTime;
                    const seconds = Math.floor(elapsed / 1000);
                    const minutes = Math.floor(seconds / 60);
                    const hours = Math.floor(minutes / 60);

                    const displayHours = String(hours).padStart(2, '0');
                    const displayMinutes = String(minutes % 60).padStart(2, '0');
                    const displaySeconds = String(seconds % 60).padStart(2, '0');

                    this.timerDisplay.textContent = `${displayHours}${displayMinutes}${displaySeconds}`;
                    requestAnimationFrame(updateTimer);
                }
            };
            updateTimer();
        }
    }

    stopRecording() {
        this.isRecording = false;
        if (this.timerDisplay) {
            this.timerDisplay.textContent = '000000';
        }
    }

    updatePhotoCount(count) {
        // Update storage/photo count display
        if (this.storageDisplay) {
            if (count > 1000) {
                this.storageDisplay.textContent = Math.floor(count / 1000) + 'K';
            } else {
                this.storageDisplay.textContent = count + 'P';
            }
        }
    }

    setStorageCapacity(capacity) {
        // Set storage in megabytes
        if (this.storageDisplay) {
            this.storageDisplay.textContent = capacity + 'M';
        }
    }

    setSdCardStatus(available) {
        // Show/hide SD card indicator based on availability
        if (this.sdIndicator) {
            if (available) {
                this.sdIndicator.style.background = '#00ff00';
                this.sdIndicator.style.boxShadow = '0 0 3px #00ff00';
            } else {
                this.sdIndicator.style.background = '#ff4444';
                this.sdIndicator.style.boxShadow = '0 0 3px #ff4444';
            }
        }
    }

    formatTimestamp(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year} ${month} ${day} ${hours}:${minutes}:${seconds}`;
    }
}

// Initialize camera UI on page load
let cameraUI;
document.addEventListener('DOMContentLoaded', () => {
    cameraUI = new CameraUI();
});
