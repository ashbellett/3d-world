import type { DirectionalLightShadow } from 'three/webgpu';
import {
    AmbientLight,
    Color,
    DirectionalLight,
    PerspectiveCamera,
    Scene,
    WebGPURenderer,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from './config.ts';

// WebGPU, or WebGL 2 where the browser has no WebGPU or forceWebGL is set
export interface GraphicsOptions {
    forceWebGL?: boolean;
}

// Renderer, camera, camera controls and lights. Only renders when something has changed.
// Make one with Graphics.create, as the renderer starts asynchronously.
export class Graphics {
    readonly renderer: WebGPURenderer;
    readonly canvas: HTMLCanvasElement;
    readonly camera: PerspectiveCamera;
    readonly controls: OrbitControls;
    readonly scene: Scene;
    // The light's shadow, updated only when objects move, as the light doesn't
    readonly shadow: DirectionalLightShadow;
    // Whether the camera or canvas changed since the last render
    needsRender = true;

    static async create(container: HTMLElement, options: GraphicsOptions = {}): Promise<Graphics> {
        const graphics = new Graphics(container, options);
        await graphics.renderer.init();
        return graphics;
    }

    private constructor(container: HTMLElement, { forceWebGL = false }: GraphicsOptions) {
        const { maxPixelRatio, antialiasBelowPixelRatio } = config.canvas;
        const pixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio);
        this.renderer = new WebGPURenderer({
            antialias: pixelRatio < antialiasBelowPixelRatio,
            forceWebGL,
        });
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.canvas = this.renderer.domElement;
        container.appendChild(this.canvas);

        const { fov, near, far, position, target } = config.camera;
        this.camera = new PerspectiveCamera(fov, 1, near, far);
        this.camera.position.fromArray(position);
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.target.fromArray(target);
        this.controls.update();
        this.controls.addEventListener('change', () => {
            this.needsRender = true;
        });

        this.scene = new Scene();
        this.scene.background = new Color(config.background);
        this.shadow = this.addLights();

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    // Returns the directional light's shadow
    addLights(): DirectionalLightShadow {
        const { ambient, directional } = config.lights;
        this.scene.add(new AmbientLight(ambient.colour, ambient.intensity));

        const light = new DirectionalLight(directional.colour, directional.intensity);
        light.position.fromArray(directional.position);
        light.castShadow = true;
        // Half the ground's diagonal, so the shadow camera covers all of it from any angle
        const [width, , depth] = config.ground.size;
        const extent = Math.hypot(width, depth) / 2;
        const shadowCamera = light.shadow.camera;
        shadowCamera.left = -extent;
        shadowCamera.right = extent;
        shadowCamera.top = extent;
        shadowCamera.bottom = -extent;
        shadowCamera.far = directional.shadowFar;
        light.shadow.mapSize.setScalar(directional.shadowMapSize);
        light.shadow.normalBias = 0.02;
        light.shadow.autoUpdate = false;
        light.shadow.needsUpdate = true;
        this.scene.add(light);
        return light.shadow;
    }

    // Which API the renderer uses. Only known once it has started.
    get backendName(): string {
        return 'isWebGPUBackend' in this.renderer.backend ? 'WebGPU' : 'WebGL 2 (WebGPURenderer)';
    }

    resize(): void {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.needsRender = true;
    }

    // Renders if the scene changed or the camera or canvas changed since the last render
    render(sceneChanged: boolean): void {
        if (sceneChanged) {
            this.shadow.needsUpdate = true;
        } else if (!this.needsRender) {
            return;
        }
        this.needsRender = false;
        this.renderer.render(this.scene, this.camera);
    }
}
