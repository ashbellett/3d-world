import { defineConfig } from 'vite';

export default defineConfig({
    // Relative URLs, so the build works under the GitHub Pages project path (/3d-world/)
    base: './',
    build: {
        // Rapier, in its own chunk, inlines its WebAssembly as about 4.3 MB of base64, and
        // three.js, which doesn't split usefully, is most of the rest
        chunkSizeWarningLimit: 4500,
    },
});
