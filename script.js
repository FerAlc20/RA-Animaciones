
AFRAME.registerComponent('animation-loader', {
    init: function () {
        this.model = null; this.mixer = null; this.actions = {}; 
        this.el.addEventListener('model-loaded', (e) => {
            const mesh = this.el.getObject3D('mesh');
            if (!mesh) return;
            this.model = mesh;
            this.mixer = new THREE.AnimationMixer(this.model);
            console.log("Modelo Ara cargado. Iniciando carga de rutinas...");
            this.loadExtraAnimations();
        });
        this.tick = (t, dt) => { if (this.mixer) this.mixer.update(dt / 1000); };
    },
    loadExtraAnimations: function () {
        const buttons = document.querySelectorAll('.anim-btn');
        const loader = new THREE.GLTFLoader();
        let loadedCount = 0;
        const totalToLoad = buttons.length;
        const loadingScreen = document.getElementById('loader');
        buttons.forEach(btn => {
            const fileName = encodeURI(btn.getAttribute('data-file')); 
            const animName = btn.getAttribute('data-name');
            loader.load(fileName, (gltf) => {
                const clip = gltf.animations[0];
                if (clip) {
                    clip.name = animName;
                    const action = this.mixer.clipAction(clip);
                    this.actions[animName] = action;
                }
                btn.addEventListener('click', () => { this.playAnimation(animName, btn); });
                loadedCount++;
                
                if(loadedCount === totalToLoad) {
                    if(loadingScreen) loadingScreen.style.display = 'none';
                    console.log("¡Todas las animaciones listas! Iniciando por defecto...");
                    // Hacemos click automático en el primer botón
                    if(buttons[0]) {
                        buttons[0].click();
                    }
                }
                // ==================================================
                
            }, undefined, (error) => { console.error("Error cargando:", fileName, error); });
        });
    },
    playAnimation: function (name, btnElement) {
        if (!this.mixer || !this.actions[name]) return;
        document.querySelectorAll('.anim-btn').forEach(b => b.classList.remove('selected'));
        btnElement.classList.add('selected');
        for (const key in this.actions) { if (key !== name) { this.actions[key].fadeOut(0.5); } }
        const newAction = this.actions[name];
        newAction.reset(); newAction.fadeIn(0.5); newAction.play();
    }
});

AFRAME.registerComponent("gesture-detector", {
    schema: { element: { default: "" } },
    init: function() {
        this.targetElement = this.data.element && document.querySelector(this.data.element);
        if (!this.targetElement) { this.targetElement = this.el; }
        this.internalState = { previousState: null };
        this.emitGestureEvent = this.emitGestureEvent.bind(this);
        this.targetElement.addEventListener("touchstart", this.emitGestureEvent);
        this.targetElement.addEventListener("touchend", this.emitGestureEvent);
        this.targetElement.addEventListener("touchmove", this.emitGestureEvent);
    },
    remove: function() {
        this.targetElement.removeEventListener("touchstart", this.emitGestureEvent);
        this.targetElement.removeEventListener("touchend", this.emitGestureEvent);
        this.targetElement.removeEventListener("touchmove", this.emitGestureEvent);
    },
    emitGestureEvent: function(event) {
        const currentState = this.getTouchState(event);
        const previousState = this.internalState.previousState;
        const gestureContinues = previousState && currentState && currentState.touchCount == previousState.touchCount;
        const gestureEnded = previousState && !gestureContinues;
        const gestureStarted = currentState && !gestureContinues;
        if (gestureEnded) {
            const eventName = this.getEventPrefix(previousState.touchCount) + "fingerend";
            this.el.emit(eventName, previousState);
            this.internalState.previousState = null;
        }
        if (gestureStarted) {
            currentState.startTime = performance.now();
            currentState.startPosition = currentState.position;
            currentState.startSpread = currentState.spread;
            const eventName = this.getEventPrefix(currentState.touchCount) + "fingerstart";
            this.el.emit(eventName, currentState);
            this.internalState.previousState = currentState;
        }
        if (gestureContinues) {
            const eventDetail = {
                positionChange: { x: currentState.position.x - previousState.position.x, y: currentState.position.y - previousState.position.y },
                spreadChange: currentState.spread - previousState.spread,
                startSpread: currentState.startSpread,
                position: currentState.position,
                spread: currentState.spread
            };
            const eventName = this.getEventPrefix(currentState.touchCount) + "fingermove";
            this.el.emit(eventName, eventDetail);
            this.internalState.previousState = currentState;
        }
    },
    getTouchState: function(event) {
        if (event.touches.length === 0) return null;
        const touchList = [];
        for (let i = 0; i < event.touches.length; i++) { touchList.push(event.touches[i]); }
        const touchState = { touchCount: touchList.length };
        const centerPosition = touchList.reduce((sum, touch) => ({ x: sum.x + touch.clientX, y: sum.y + touch.clientY }), { x: 0, y: 0 });
        touchState.position = { x: centerPosition.x / touchList.length, y: centerPosition.y / touchList.length };
        if (touchList.length >= 2) {
            const spread = Math.hypot(touchList[0].clientX - touchList[1].clientX, touchList[0].clientY - touchList[1].clientY);
            touchState.spread = spread;
        }
        return touchState;
    },
    getEventPrefix: function(touchCount) {
        const names = ["one", "two", "three", "many"];
        return names[Math.min(touchCount, 4) - 1];
    }
});

AFRAME.registerComponent("gesture-handler", {
    schema: { enabled: { default: true }, rotationFactor: { default: 5 }, minScale: { default: 0.02 }, maxScale: { default: 0.5 } },
    init: function() {
        this.handleScale = this.handleScale.bind(this);
        this.handleRotation = this.handleRotation.bind(this);
        this.isVisible = false;
        this.el.sceneEl.addEventListener("markerFound", (e) => { this.isVisible = true; });
        this.el.sceneEl.addEventListener("markerLost", (e) => { this.isVisible = false; });
    },
    update: function() {
        if (this.data.enabled) {
            this.el.sceneEl.addEventListener("onefingermove", this.handleRotation);
            this.el.sceneEl.addEventListener("twofingermove", this.handleScale);
        } else {
            this.el.sceneEl.removeEventListener("onefingermove", this.handleRotation);
            this.el.sceneEl.removeEventListener("twofingermove", this.handleScale);
        }
    },
    remove: function() {
        this.el.sceneEl.removeEventListener("onefingermove", this.handleRotation);
        this.el.sceneEl.removeEventListener("twofingermove", this.handleScale);
    },
    handleRotation: function(event) {
        if (this.isVisible) {
            const sensitivity = 0.005; 
            this.el.object3D.rotation.y += event.detail.positionChange.x * this.data.rotationFactor * sensitivity;
            this.el.object3D.rotation.x += event.detail.positionChange.y * this.data.rotationFactor * sensitivity;
        }
    },
    handleScale: function(event) {
        if (this.isVisible) {
            const scaleChange = event.detail.spreadChange;
            let scaleMultiplier = 1;
            if (scaleChange > 0) { scaleMultiplier = 1.05; } else if (scaleChange < 0) { scaleMultiplier = 0.95; }
            let currentScaleX = this.el.object3D.scale.x; let currentScaleY = this.el.object3D.scale.y; let currentScaleZ = this.el.object3D.scale.z;
            let newScaleX = currentScaleX * scaleMultiplier; let newScaleY = currentScaleY * scaleMultiplier; let newScaleZ = currentScaleZ * scaleMultiplier;
            newScaleX = Math.min(Math.max(newScaleX, this.data.minScale), this.data.maxScale);
            newScaleY = Math.min(Math.max(newScaleY, this.data.minScale), this.data.maxScale);
            newScaleZ = Math.min(Math.max(newScaleZ, this.data.minScale), this.data.maxScale);
            this.el.object3D.scale.set(newScaleX, newScaleY, newScaleZ);
        }
    }
});

AFRAME.registerComponent("screenshot-handler", {
    init: function() {
        const button = document.getElementById('snap-button');
        if(button) button.addEventListener('click', this.takeScreenshot.bind(this));
    },
    takeScreenshot: function() {
        const scene = this.el.sceneEl;
        const video = document.querySelector('video');
        const canvas = scene.canvas;
        if (!video || !canvas) { return; }
        try {
            const mergedCanvas = document.createElement('canvas');
            mergedCanvas.width = canvas.width;
            mergedCanvas.height = canvas.height;
            const ctx = mergedCanvas.getContext('2d');
            const videoAspect = video.videoWidth / video.videoHeight;
            const canvasAspect = canvas.width / canvas.height;
            let drawWidth, drawHeight, startX, startY;
            if (canvasAspect > videoAspect) {
                drawWidth = canvas.width; drawHeight = canvas.width / videoAspect;
                startX = 0; startY = (canvas.height - drawHeight) / 2;
            } else {
                drawWidth = canvas.height * videoAspect; drawHeight = canvas.height;
                startX = (canvas.width - drawWidth) / 2; startY = 0;
            }
            ctx.drawImage(video, startX, startY, drawWidth, drawHeight);
            ctx.drawImage(canvas, 0, 0);
            ctx.font = "bold 16px 'Segoe UI', Roboto, sans-serif";
            ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
            ctx.fillText("Fernanda Alcántara | AR Experience", 20, canvas.height - 30);
            const link = document.createElement('a');
            link.download = `ara-ar-${Date.now()}.png`;
            link.href = mergedCanvas.toDataURL('image/png');
            link.click();
            const btn = document.getElementById('snap-button');
            const originalText = btn.innerHTML;
            btn.innerHTML = "✅";
            setTimeout(() => { btn.innerHTML = originalText; }, 1500);
        } catch (e) { console.error(e); }
    }
});
