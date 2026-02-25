/**
 * MENU.JS - Menu UI and navigation
 * Handles menu screen and navigation between different UI screens
 */

class Menu {
    constructor() {
        this.currentIndex = 0;
        this.menuActions = ['camera', 'video', 'play', 'gear'];
        this.menuLabels = ['사진', '비디오', '갤러리', '설정'];
        this.initElements();
        this.initEventListeners();
        this.updateMenuSelection();
    }

    initElements() {
        this.menuIconBtns = document.querySelectorAll('.menu-icon-btn');
        this.menuLabel = document.querySelector('.menu-label');
    }

    initEventListeners() {
        this.menuIconBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleMenuAction(action);
            });
        });
    }

    navigateLeft() {
        this.currentIndex = (this.currentIndex - 1 + this.menuActions.length) % this.menuActions.length;
        this.updateMenuSelection();
    }

    navigateRight() {
        this.currentIndex = (this.currentIndex + 1) % this.menuActions.length;
        this.updateMenuSelection();
    }

    selectCurrent() {
        const action = this.menuActions[this.currentIndex];
        this.handleMenuAction(action);
    }

    updateMenuSelection() {
        this.menuIconBtns.forEach((btn, index) => {
            if (index === this.currentIndex) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
        this.menuLabel.textContent = this.menuLabels[this.currentIndex];
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