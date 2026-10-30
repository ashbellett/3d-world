import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
    // Relative URLs, so the build works under the GitHub Pages project path (/3d-world/)
    base: './',
    // Rapier imports its WebAssembly as a module, which browsers can't yet
    plugins: [wasm()],
    build: {
        // three.js is most of the bundle, and doesn't split usefully
        chunkSizeWarningLimit: 700,
    },
    // The tests run in Node, where Rapier needs the same treatment: its package only names an ES
    // module entry, which Vite skips for Node unless told, and Vite, not Node, has to load it so
    // the plugin handles its WebAssembly import
    ssr: {
        resolve: { mainFields: ['module'] },
    },
    test: {
        server: { deps: { inline: ['@dimforge/rapier3d-simd'] } },
    },
});
