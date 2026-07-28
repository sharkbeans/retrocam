/**
 * PHOTO-PREVIEW.JS - Photo preview and save functionality
 * Handles the preview screen after capture
 */

class PhotoPreview {
    constructor() {
        this.currentPhoto = null;
        this.currentPhotoNumber = null;
        this.galleryArray = [];

        this.initElements();
        this.initEventListeners();
        this.loadGalleryFromStorage();
    }

    initElements() {
        this.previewImage = document.getElementById('preview-image');
        this.previewFilename = document.querySelector('.preview-filename');
        this.previewCounter = document.querySelector('.preview-counter');
        this.previewTimestamp = document.getElementById('preview-timestamp');
        this.saveBtn = document.getElementById('btn-save-photo');
        this.backBtn = document.getElementById('btn-back-camera');
    }

    initEventListeners() {
        this.saveBtn.addEventListener('click', () => this.saveToGallery());
        this.backBtn.addEventListener('click', () => this.goBackToCamera());
    }

    setPhoto(photoData, photoNumber, timestamp) {
        this.currentPhoto = photoData;
        this.currentPhotoNumber = photoNumber;

        // Update preview screen
        this.previewImage.src = photoData;
        this.previewFilename.textContent = `PH${photoNumber}.JPG`;

        const totalPhotos = this.galleryArray.length + 1;
        this.previewCounter.textContent = `${String(totalPhotos).padStart(4, '0')}/${String(totalPhotos).padStart(4, '0')}`;

        // Use provided timestamp or generate new one
        this.previewTimestamp.textContent = timestamp || this.getTimestamp();
    }

    async saveToGallery() {
        if (!this.currentPhoto) return;

        const photoEntry = {
            data: this.currentPhoto,
            number: this.currentPhotoNumber,
            timestamp: this.getTimestamp()
        };

        this.galleryArray.push(photoEntry);
        this.saveGalleryToStorage();

        if (gallery) {
            gallery.loadGallery();
        }

        const saveResult = await this.saveImageToDevice(photoEntry);

        this.flashLED();

        if (saveResult !== 'shared') {
            alert(`Photo ${this.buildFilename(this.currentPhotoNumber)} saved!`);
        }

        this.goBackToCamera();
    }

    autoSavePhoto(photoData, photoNumber, timestamp) {
        console.log('autoSavePhoto called with:', { photoNumber, timestamp });

        // Auto-save without showing preview screen
        const photoEntry = {
            data: photoData,
            number: photoNumber,
            timestamp: timestamp
        };

        console.log('Gallery array before save:', this.galleryArray.length);
        this.galleryArray.push(photoEntry);
        console.log('Gallery array after push:', this.galleryArray.length);

        this.saveGalleryToStorage();
        console.log('✓ Photo saved to localStorage');

        // Notify gallery to refresh if it's open
        if (gallery) {
            console.log('Refreshing gallery display...');
            gallery.loadGallery();
        }
    }

    goBackToCamera() {
        camera.showScreen('ui-camera');
    }

    flashLED() {
        const ledRecord = document.querySelector('.led-record');
        ledRecord.classList.add('active');
        setTimeout(() => {
            ledRecord.classList.remove('active');
        }, 200);
    }

    saveGalleryToStorage() {
        try {
            localStorage.setItem('retroCamGallery', JSON.stringify(this.galleryArray));
            const savedData = localStorage.getItem('retroCamGallery');
            const photoCount = savedData ? JSON.parse(savedData).length : 0;
            console.log('✓ Saved to localStorage successfully. Total photos:', photoCount);
        } catch (e) {
            console.error('Failed to save gallery:', e);
        }
    }

    loadGalleryFromStorage() {
        try {
            const stored = localStorage.getItem('retroCamGallery');
            this.galleryArray = stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Failed to load gallery:', e);
            this.galleryArray = [];
        }
    }

    getTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
    }

    buildFilename(photoNumber) {
        return `PH${photoNumber}.JPG`;
    }

    async saveImageToDevice(photoEntry) {
        const filename = this.buildFilename(photoEntry.number);

        if (this.isMobileDevice() && typeof navigator.share === 'function') {
            try {
                const file = await this.createPhotoFile(photoEntry.data, filename);

                if (this.canUseNativeShare(file)) {
                    await navigator.share({
                        files: [file],
                        title: 'RetroCAM Photo',
                        text: `Check out my photo from RetroCAM: ${filename}`
                    });

                    console.log('✓ Photo shared successfully from preview');
                    return 'shared';
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('Photo share dismissed by user');
                    return 'cancelled';
                }

                console.error('Share failed from preview:', error);
            }
        }

        this.downloadPhoto(photoEntry.data, filename);
        return 'downloaded';
    }

    canUseNativeShare(file) {
        if (!this.isMobileDevice() || typeof navigator.share !== 'function') {
            return false;
        }

        if (typeof navigator.canShare !== 'function') {
            return true;
        }

        try {
            return navigator.canShare({ files: [file] });
        } catch (error) {
            console.warn('navigator.canShare check failed:', error);
            return false;
        }
    }

    isMobileDevice() {
        const hasTouch = ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            (navigator.msMaxTouchPoints > 0);
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        return hasTouch || isMobileUA;
    }

    async createPhotoFile(dataURL, filename) {
        const blob = await this.dataURLtoBlob(dataURL);
        return new File([blob], filename, { type: 'image/jpeg' });
    }

    downloadPhoto(dataURL, filename) {
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = filename;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
}

// Initialize photo preview on page load
let photoPreview;
document.addEventListener('DOMContentLoaded', () => {
    // Clear gallery on page load to avoid localStorage quota issues
    try {
        localStorage.removeItem('retroCamGallery');
        console.log('✓ Gallery cleared on page load');
    } catch (e) {
        console.error('Failed to clear gallery:', e);
    }

    photoPreview = new PhotoPreview();
});
