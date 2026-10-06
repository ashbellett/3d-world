import {
    AmbientLight,
    Color,
    DirectionalLight,
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from './config.js';

// Renderer, camera, camera controls and lights. Only renders when something has changed.
export class Graphics {
    constructor(container) {
        this.renderer = new WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.canvas.maxPixelRatio));
        this.renderer.shadowMap.enabled = true;
        // The light doesn't move, so shadows only change when objects do
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;
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
        this.addLights();

        this.needsRender = true;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    addLights() {
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
        this.scene.add(light);
    }

    resize() {
        const width = Math.min(window.innerWidth, config.canvas.maxWidth);
        const height = Math.min(window.innerHeight, config.canvas.maxHeight);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.needsRender = true;
    }

    // Renders if the scene changed or the camera or canvas changed since the last render
    render(sceneChanged) {
        if (sceneChanged) {
            this.renderer.shadowMap.needsUpdate = true;
        } else if (!this.needsRender) {
            return;
        }
        this.needsRender = false;
        this.renderer.render(this.scene, this.camera);
    }
}
