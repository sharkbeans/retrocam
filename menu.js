/**
 * MENU.JS - Menu UI and navigation
 * Handles menu screen and navigation between different UI screens
 */

class Menu {
    constructor() {
        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        this.menuIconBtns = document.querySelectorAll('.menu-icon-btn');
    }

    initEventListeners() {
        this.menuIconBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleMenuAction(action);
            });
        });
    }

    handleMenuAction(action) {
        switch (action) {
            case 'camera':
                // Start camera and show live view
                if (cameraCapture) {
                    console.log('Starting camera mode...');
                    if (!cameraCapture.isStreaming && !cameraCapture.isInitializing) {
                        console.log('Camera not streaming, restarting stream...');
                        cameraCapture.restartStream().then(() => {
                            this.showScreen('ui-camera');
                        });
                    } else {
                        console.log('Camera already streaming or initializing');
                        this.showScreen('ui-camera');
                    }
                }
                break;
            case 'video':
                // Stub for video mode
                console.log('Video mode not available');
                break;
            case 'play':
                // Open gallery
                if (gallery) {
                    gallery.loadGallery();
                    this.showScreen('ui-gallery');
                }
                break;
            case 'gear':
                // Stub for settings
                console.log('Settings not available');
                break;
            default:
                break;
        }
    }

    showScreen(screenId) {
        document.querySelectorAll('.ui-screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }
}

// Initialize menu on page load
let menu;
document.addEventListener('DOMContentLoaded', () => {
    menu = new Menu();
});