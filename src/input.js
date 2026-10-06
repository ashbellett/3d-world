import { config } from './config.js';

// Calls onClick(x, y), in normalised device coordinates, when the canvas is clicked or tapped,
// but not at the end of a camera drag or pinch
export function onCanvasClick(canvas, onClick) {
    let pressed = false;
    let startX = 0;
    let startY = 0;
    canvas.addEventListener('pointerdown', (event) => {
        // A second finger or another button cancels the click
        pressed = event.isPrimary && event.button === 0;
        startX = event.clientX;
        startY = event.clientY;
    });
    canvas.addEventListener('pointerup', (event) => {
        if (!event.isPrimary || !pressed) return;
        pressed = false;
        const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
        if (distance > config.input.maxClickDistance) return;
        const rect = canvas.getBoundingClientRect();
        onClick(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
    });
}
