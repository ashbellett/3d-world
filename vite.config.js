import { defineConfig } from 'vite';

export default defineConfig({
    // Relative URLs, so the build works under the GitHub Pages project path (/3d-world/)
    base: './',
    build: {
        // three.js is most of the bundle, and doesn't split usefully
        chunkSizeWarningLimit: 700,
    },
});
