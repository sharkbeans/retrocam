/**
 * GALLERY.JS - Gallery viewer and localStorage management
 * Handles displaying and navigating saved photos
 */

class Gallery {
    constructor() {
        this.galleryArray = [];
        this.currentIndex = 0;

        this.initElements();
        this.initEventListeners();
        this.loadGallery();
    }

    initElements() {
        this.galleryImage = document.getElementById('gallery-image');
        this.galleryEmpty = document.getElementById('gallery-empty');
    }

    initEventListeners() {
        // Navigation and actions are handled by camera.js physical buttons
    }

    loadGallery() {
        try {
            const stored = localStorage.getItem('retroCamGallery');
            this.galleryArray = stored ? JSON.parse(stored) : [];
            console.log('✓ Gallery loaded from localStorage:', this.galleryArray.length, 'photos');
        } catch (e) {
            console.error('Failed to load gallery:', e);
            this.galleryArray = [];
        }

        this.currentIndex = 0;
        this.updateDisplay();
    }

    updateDisplay() {
        if (this.galleryArray.length === 0) {
            this.galleryImage.style.display = 'none';
            this.galleryEmpty.classList.add('show');
        } else {
            this.galleryImage.style.display = 'block';
            this.galleryEmpty.classList.remove('show');

            const photo = this.galleryArray[this.currentIndex];
            this.galleryImage.src = photo.data;
        }
    }

    nextPhoto() {
        if (this.galleryArray.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.galleryArray.length;
        this.updateDisplay();
        this.flashLED();
    }

    previousPhoto() {
        if (this.galleryArray.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.galleryArray.length) % this.galleryArray.length;
        this.updateDisplay();
        this.flashLED();
    }

    downloadCurrentPhoto() {
        if (this.galleryArray.length === 0) return;

        const photo = this.galleryArray[this.currentIndex];
        const link = document.createElement('a');

        // Create filename from photo number
        const filename = `PH${photo.number}.JPG`;

        // Set download attributes
        link.href = photo.data;
        link.download = filename;

        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Flash LED to indicate download
        this.flashLED();
    }

    async saveOrShareCurrentPhoto() {
        if (this.galleryArray.length === 0) return;

        const photo = this.galleryArray[this.currentIndex];
        const filename = `PH${photo.number}.JPG`;

        // Check if Web Share API is available and on mobile
        if (navigator.share && this.isMobileDevice()) {
            try {
                // Convert data URL to Blob
                const blob = await this.dataURLtoBlob(photo.data);
                const file = new File([blob], filename, { type: 'image/jpeg' });

                // Use Web Share API
                await navigator.share({
                    files: [file],
                    title: 'RetroCAM Photo',
                    text: `Check out my photo from RetroCAM: ${filename}`
                });

                console.log('✓ Photo shared successfully');
                this.flashLED();
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Share failed:', error);
                    // Fallback to download
                    this.downloadCurrentPhoto();
                }
            }
        } else {
            // Desktop or no Share API: use download
            this.downloadCurrentPhoto();
        }
    }

    isMobileDevice() {
        // Check for touch support and mobile user agents
        const hasTouch = () => {
            return (('ontouchstart' in window) ||
                    (navigator.maxTouchPoints > 0) ||
                    (navigator.msMaxTouchPoints > 0));
        };

        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        return hasTouch() || isMobileUA;
    }

    async dataURLtoBlob(dataURL) {
        const parts = dataURL.split(',');
        const bstr = atob(parts[1]);
        const n = bstr.length;
        const u8arr = new Uint8Array(n);

        for (let i = 0; i < n; i++) {
            u8arr[i] = bstr.charCodeAt(i);
        }

        return new Blob([u8arr], { type: 'image/jpeg' });
    }

    flashLED() {
        const ledRecord = document.querySelector('.led-record');
        ledRecord.classList.add('active');
        setTimeout(() => {
            ledRecord.classList.remove('active');
        }, 150);
    }
}

// Initialize gallery on page load
let gallery;
document.addEventListener('DOMContentLoaded', () => {
    gallery = new Gallery();
});