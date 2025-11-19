/**
 * CAMERA.JS - Main camera view and shutter functionality
 * Handles live view display, power state, and photo capture
 */

class Camera {
    constructor() {
        this.isPowerOn = false;
        this.isCapturing = false;

        this.initElements();
        this.initEventListeners();
        this.initPowerOnState();
    }

    initElements() {
        this.powerBtn = document.getElementById('btn-power');
        this.shutterBtn = document.getElementById('btn-shutter');
        this.leftBtn = document.getElementById('btn-left');
        this.rightBtn = document.getElementById('btn-right');
        this.backBtn = document.getElementById('btn-back');
        this.cameraFrame = document.querySelector('.camera-frame');
        this.statusLed = document.querySelector('.status-led');

        // Debug logging
        console.log('Camera buttons initialized:', {
            powerBtn: !!this.powerBtn,
            shutterBtn: !!this.shutterBtn,
            leftBtn: !!this.leftBtn,
            rightBtn: !!this.rightBtn,
            backBtn: !!this.backBtn,
            cameraFrame: !!this.cameraFrame,
            statusLed: !!this.statusLed
        });
    }

    initEventListeners() {
        console.log('Initializing event listeners...');

        if (this.powerBtn) {
            this.powerBtn.addEventListener('click', () => this.togglePower());
            console.log('✓ Power button listener attached');
        } else {
            console.warn('✗ Power button not found');
        }

        if (this.shutterBtn) {
            this.shutterBtn.addEventListener('click', () => this.handleShutter());
            console.log('✓ Shutter button listener attached');
        } else {
            console.warn('✗ Shutter button not found');
        }

        if (this.leftBtn) {
            this.leftBtn.addEventListener('click', () => this.handleNavigateLeft());
            console.log('✓ Left button listener attached');
        } else {
            console.warn('✗ Left button not found');
        }

        if (this.rightBtn) {
            this.rightBtn.addEventListener('click', () => this.handleNavigateRight());
            console.log('✓ Right button listener attached');
        } else {
            console.warn('✗ Right button not found');
        }

        if (this.backBtn) {
            this.backBtn.addEventListener('click', () => this.handleBack());
            console.log('✓ Back button listener attached');
        } else {
            console.warn('✗ Back button not found');
        }

        // Keyboard shortcut: spacebar for shutter
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.isPowerOn) {
                e.preventDefault();
                this.handleShutter();
            }
            // Mobile volume buttons as shutter
            if ((e.key === 'VolumeUp' || e.key === 'VolumeDown') && this.isPowerOn) {
                e.preventDefault();
                this.handleShutter();
            }
        });
        console.log('Event listeners setup complete');
    }

    initPowerOnState() {
        // Start with power off
        this.isPowerOn = false;
        this.cameraFrame.style.pointerEvents = 'none';
        this.updateStatusLed();
        // Close all screens
        document.querySelectorAll('.ui-screen').forEach(screen => {
            screen.classList.remove('active');
        });
    }

    togglePower() {
        console.log('togglePower called');
        if (this.isPowerOn) {
            this.powerOff();
        } else {
            this.powerOn();
        }
    }

    powerOn() {
        this.isPowerOn = true;

        // Show camera frame
        this.cameraFrame.style.opacity = '1';
        this.cameraFrame.style.pointerEvents = 'auto';

        // Update status LED
        this.updateStatusLed();

        // Ensure camera is ready
        if (cameraCapture && !cameraCapture.isStreaming && !cameraCapture.isInitializing) {
            console.log('Power on: Warming up camera...');
            cameraCapture.restartStream();
        }

        // Show startup splash screen first
        this.showScreen('ui-startup');

        // Transition to menu after splash screen animation completes
        setTimeout(() => {
            if (this.isPowerOn) {
                this.showScreen('ui-menu');
            }
        }, 2000);
    }

    powerOff() {
        this.isPowerOn = false;

        // Stop camera stream
        if (cameraCapture) {
            cameraCapture.stopStream();
        }

        // Disable camera frame interaction but keep it visible
        this.cameraFrame.style.pointerEvents = 'none';

        // Update status LED
        this.updateStatusLed();

        // Close any open screens
        document.querySelectorAll('.ui-screen').forEach(screen => {
            screen.classList.remove('active');
        });
    }

    handleShutter() {
        console.log('handleShutter called, isPowerOn:', this.isPowerOn);
        if (!this.isPowerOn) return;

        const currentScreen = this.getCurrentScreen();
        console.log('Current screen:', currentScreen);

        // If on camera screen, take a photo
        if (currentScreen === 'ui-camera') {
            this.capturePhoto();
        }
        // If on menu screen, select the focused menu item
        else if (currentScreen === 'ui-menu') {
            this.selectMenuOption();
        }
        // If on gallery screen, open the selected photo
        else if (currentScreen === 'ui-gallery') {
            this.openGalleryPhoto();
        }
    }

    capturePhoto() {
        if (this.isCapturing || !cameraCapture) return;
        this.isCapturing = true;

        // Increment photo count and battery decrease
        cameraCapture.incrementPhotoCount();
        cameraCapture.decreaseBattery();

        // Capture photo with overlay
        const photoData = cameraCapture.capturePhoto();

        console.log('✓ Photo captured:', photoData ? 'Yes' : 'No');

        if (photoData) {
            // Auto-save to gallery
            console.log('Attempting to save photo...', photoPreview ? 'photoPreview exists' : 'photoPreview is undefined');
            if (photoPreview) {
                photoPreview.autoSavePhoto(photoData.data, photoData.number, photoData.timestamp);
                console.log('✓ Photo auto-saved to gallery');
            } else {
                console.warn('⚠ photoPreview not available, cannot auto-save');
            }

            // Play shutter animation
            cameraCapture.playShutterAnimation(photoData.data);

            // Generate new random timer value for next photo
            if (cameraUI) {
                cameraUI.generateNewRandomTimer();
            }
        }

        setTimeout(() => {
            this.isCapturing = false;
        }, 600);
    }

    handleNavigateLeft() {
        if (!this.isPowerOn) return;

        const currentScreen = this.getCurrentScreen();

        // On gallery, go to previous photo
        if (currentScreen === 'ui-gallery' && gallery) {
            gallery.previousPhoto();
        }
    }

    handleNavigateRight() {
        if (!this.isPowerOn) return;

        const currentScreen = this.getCurrentScreen();

        // On gallery, go to next photo
        if (currentScreen === 'ui-gallery' && gallery) {
            gallery.nextPhoto();
        }
    }

    handleBack() {
        console.log('handleBack called');
        if (!this.isPowerOn) {
            console.warn('Power is off, ignoring back button');
            return;
        }

        const currentScreen = this.getCurrentScreen();
        console.log('Current screen:', currentScreen);

        // From any screen, go back to menu
        if (currentScreen !== 'ui-menu') {
            console.log('Going back to menu from:', currentScreen);
            this.showScreen('ui-menu');
        } else {
            console.log('Already on menu, back button does nothing');
        }
    }

    selectMenuOption() {
        // This can be enhanced when menu navigation is implemented
        console.log('Menu option selected');
    }

    openGalleryPhoto() {
        // When shutter is pressed in gallery mode, save/share the current photo
        if (gallery) {
            console.log('Saving/sharing photo from gallery...');
            gallery.saveOrShareCurrentPhoto();
        }
    }

    showScreen(screenId) {
        if (!this.isPowerOn) return;

        document.querySelectorAll('.ui-screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    getCurrentScreen() {
        return document.querySelector('.ui-screen.active')?.id || 'ui-menu';
    }

    updateStatusLed() {
        if (this.statusLed) {
            if (this.isPowerOn) {
                this.statusLed.classList.add('active');
            } else {
                this.statusLed.classList.remove('active');
            }
        }
    }
}

// Initialize camera on page load
let camera;
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== RETROCAM DEBUG ===');
    console.log('DOM Content Loaded');

    // Check if all elements exist
    const elements = {
        'btn-power': document.getElementById('btn-power'),
        'btn-shutter': document.getElementById('btn-shutter'),
        'btn-left': document.getElementById('btn-left'),
        'btn-right': document.getElementById('btn-right'),
        'btn-back': document.getElementById('btn-back'),
        'camera-frame': document.querySelector('.camera-frame'),
        'buttons-panel': document.querySelector('.buttons-panel')
    };

    console.log('Elements check:', elements);

    camera = new Camera();

    // Add manual test click handlers
    console.log('Adding test click listeners...');
    Object.entries(elements).forEach(([name, elem]) => {
        if (elem && name.startsWith('btn-')) {
            elem.addEventListener('click', (e) => {
                console.log(`✓ BUTTON CLICKED: ${name}`, e);
            });
        }
    });
});