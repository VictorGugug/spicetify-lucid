import { FragmentShader, GetShaderUniforms, VertexShader } from "@/shader/animatedBg.ts";
import loadAndProcessImage, {
  isTextureInCache,
} from "@/components/background/helper/loadAndProcessImage.ts";
import appStore from "@/store/appStore.ts";
import waitForGlobal from "@/utils/dom/waitForGlobal.ts";
import { useEffect, useRef } from "react";
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

const AnimatedBackgroundCanvas: React.FC<{ imageSrc: string | null }> = ({ imageSrc }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const uniformsRef = useRef<ReturnType<typeof GetShaderUniforms> | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<OrthographicCamera | null>(null);
  const isFocusedRef = useRef(true);
  const updateAnimationStateRef = useRef<() => void>(() => {});
  const { filter, autoStopAnimation } = useStore(appStore, useShallow((state) => state.bg.options));

  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new Scene();
    sceneRef.current = scene;
    const renderer = new WebGLRenderer({
      canvas: canvasRef.current,
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.0);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    rendererRef.current = renderer;

    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    cameraRef.current = camera;

    const geometry = new PlaneGeometry(2, 2);
    const uniforms = GetShaderUniforms();
    uniformsRef.current = uniforms;

    const UpdateDimensions = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);

      const pr = Math.min(window.devicePixelRatio || 1, 1.0);
      const scaledWidth = width * pr;
      const scaledHeight = height * pr;
      const largestAxis = scaledWidth > scaledHeight ? "X" : "Y";
      const largestAxisSize = Math.max(scaledWidth, scaledHeight);

      uniforms.BackgroundCircleOrigin.value.set(scaledWidth / 2, scaledHeight / 2);
      uniforms.BackgroundCircleRadius.value = largestAxisSize * 1.5;

      uniforms.CenterCircleOrigin.value.set(scaledWidth / 2, scaledHeight / 2);
      uniforms.CenterCircleRadius.value = largestAxisSize * (largestAxis === "X" ? 1 : 0.75);

      uniforms.LeftCircleOrigin.value.set(0, scaledHeight);
      uniforms.LeftCircleRadius.value = largestAxisSize * 0.75;

      uniforms.RightCircleOrigin.value.set(scaledWidth, 0);
      uniforms.RightCircleRadius.value = largestAxisSize * (largestAxis === "X" ? 0.65 : 0.5);

      renderer.render(scene, camera);
    };

    UpdateDimensions();

    const material = new ShaderMaterial({
      vertexShader: VertexShader,
      fragmentShader: FragmentShader,
      uniforms,
      transparent: true,
    });

    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    let frameId: number | null = null;
    let isRunning = false;
    let lastFrameTime = performance.now();
    const targetFps = 30;
    const frameInterval = 1000 / targetFps;

    const startLoop = () => {
      if (isRunning) return;
      isRunning = true;
      lastFrameTime = performance.now();
      animate();
    };

    const stopLoop = () => {
      if (!isRunning) return;
      isRunning = false;
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    };

    const animate = () => {
      if (!isRunning) return;
      const now = performance.now();
      const delta = now - lastFrameTime;

      if (delta >= frameInterval) {
        lastFrameTime = now - (delta % frameInterval);
        const time = now / 3500;
        uniforms.Time.value = time;
        renderer.render(scene, camera);
      }
      frameId = requestAnimationFrame(animate);
    };

    const updateAnimationState = () => {
      const isHidden = typeof document !== "undefined" && document.hidden;
      const shouldPause =
        isHidden || (appStore.getState().bg.options.autoStopAnimation && !isFocusedRef.current);
      if (shouldPause) {
        stopLoop();
        renderer.render(scene, camera);
      } else {
        startLoop();
      }
    };

    updateAnimationStateRef.current = updateAnimationState;

    renderer.render(scene, camera);
    updateAnimationState();

    const handleVisibility = () => {
      updateAnimationState();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("resize", UpdateDimensions);

    const onPlayPauseHandler = () => updateAnimationState();
    waitForGlobal(() => Spicetify?.Player)
      .then((player) => player?.addEventListener("onplaypause", onPlayPauseHandler))
      .catch(() => {});

    return () => {
      stopLoop();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;

      if (typeof Spicetify?.Player?.removeEventListener === "function") {
        try {
          Spicetify.Player.removeEventListener("onplaypause", onPlayPauseHandler);
        } catch {}
      }
      
      // Dispose uniform textures
      if (uniformsRef.current) {
        const u = uniformsRef.current;
        if (u.BlurredCoverArt.value && typeof u.BlurredCoverArt.value.dispose === 'function') {
          if (!isTextureInCache(u.BlurredCoverArt.value)) u.BlurredCoverArt.value.dispose();
        }
        if (u.PreviousBlurredCoverArt.value && typeof u.PreviousBlurredCoverArt.value.dispose === 'function') {
          if (!isTextureInCache(u.PreviousBlurredCoverArt.value)) u.PreviousBlurredCoverArt.value.dispose();
        }
      }

      window.removeEventListener("resize", UpdateDimensions);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      isFocusedRef.current = true;
      updateAnimationStateRef.current();
    };

    const handleBlur = () => {
      isFocusedRef.current = false;
      updateAnimationStateRef.current();
    };

    waitForGlobal<any>(() => window?._spicy_lyrics?.fullscreen)
      .then((fullscreen) => fullscreen?.onopen?.(handleBlur))
      .catch(() => {});
    waitForGlobal<any>(() => window?._spicy_lyrics?.fullscreen)
      .then((fullscreen) => fullscreen?.onclose?.(handleFocus))
      .catch(() => {});

    if (autoStopAnimation) {
      window.addEventListener("focus", handleFocus);
      window.addEventListener("blur", handleBlur);
    }

    updateAnimationStateRef.current();

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, [autoStopAnimation]);

  useEffect(() => {
    if (!imageSrc || !uniformsRef.current) return;

    const uniforms = uniformsRef.current;
    const prevTexture = uniforms.BlurredCoverArt.value;

    uniforms.PreviousBlurredCoverArt.value = prevTexture;
    uniforms.TextureFade.value = 0;

    let cancelled = false;
    let fadeFrameId: number | null = null;

    loadAndProcessImage(imageSrc, filter).then((newTexture) => {
      if (!newTexture) return;

      if (cancelled || !uniformsRef.current) {
        if (!isTextureInCache(newTexture)) {
          newTexture.dispose();
        }
        return;
      }

      uniforms.BlurredCoverArt.value = newTexture;
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      const start = performance.now();
      const duration = 500;

      const fade = () => {
        if (cancelled || !uniformsRef.current) return;

        const elapsed = performance.now() - start;
        const t = Math.min(elapsed / duration, 1);
        uniformsRef.current.TextureFade.value = t;

        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }

        if (t < 1) {
          fadeFrameId = requestAnimationFrame(fade);
        } else {
          if (
            prevTexture &&
            prevTexture !== uniformsRef.current.BlurredCoverArt.value &&
            !isTextureInCache(prevTexture)
          ) {
            prevTexture.dispose();
          }
        }
      };

      fade();
    });

    return () => {
      cancelled = true;
      if (fadeFrameId) {
        cancelAnimationFrame(fadeFrameId);
      }
    };
  }, [imageSrc, filter]);

  return (
    <canvas
      ref={canvasRef}
      className="animated-bg-canvas"
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        opacity: `${filter.opacity ?? 100}%`,
      }}
    />
  );
};

export default AnimatedBackgroundCanvas;
