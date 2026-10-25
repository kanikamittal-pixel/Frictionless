"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Animated topographic contour field (as on piergorelli.com): isolines of a
// slowly drifting noise height-map, a bold index contour every few lines, and
// a blue gradient hill that rises wherever the pointer is. WebGL2 fragment
// shader; pauses off-screen and stays still for reduced-motion users.

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;   // px, origin top-left
uniform float uLift;   // 0..1.4, eased
uniform float uDpr;
uniform vec3 uInk;
uniform vec3 uAccent;
uniform float uScale;
uniform float uFade;   // 1 = fade lines toward the left (behind headline text)
uniform float uSeed;
uniform float uInt;    // overall line strength
uniform float uEdge;   // 1 = fade out toward the bottom edge

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p + uSeed) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash(i), f), dot(hash(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(hash(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.55;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int k = 0; k < 4; k++) { v += a * noise(p); p = r * p * 2.03 + 11.7; a *= 0.48; }
  return v;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr; // css px, top-left origin
  vec2 res = uRes / uDpr;
  vec2 uv = frag / 820.0; // fixed feature size, whatever the band height
  float t = uTime * 0.012;

  // Height: slowly drifting, domain-warped fbm plus a gaussian hill under the pointer.
  vec2 q = uv * uScale + vec2(t, -t * 0.6);
  float h = fbm(q + 0.3 * vec2(fbm(q * 0.7 + t), fbm(q * 0.7 - t + 3.1)));
  float d = length((frag - uMouse) / 820.0);
  float hill = uLift * exp(-d * d / 0.05);
  h += hill * 0.5;

  float levels = 9.0;
  float f = h * levels;
  float w = max(fwidth(f), 1e-4);
  // hairline minor contours
  float line = 1.0 - smoothstep(0.35, 1.05, abs(fract(f + 0.5) - 0.5) / w);
  // one bold index contour at a single height, meandering through the field
  float index = 1.0 - smoothstep(0.75, 1.6, abs((h - 0.06) * levels) / w);

  float lifted = smoothstep(0.03, 0.3, hill);
  float a = line * mix(0.16, 0.5, lifted) + index * 0.78;

  // calmer behind the headline (left) and the lede (bottom-left)
  float xf = smoothstep(0.12, 0.82, frag.x / res.x);
  float yf = smoothstep(0.62, 1.0, frag.y / res.y) * (1.0 - xf);
  float fade = mix(1.0, mix(0.32, 1.0, xf) * (1.0 - 0.45 * yf), uFade);
  a *= mix(fade, 1.0, lifted * 0.7);

  a *= uInt;
  a *= mix(1.0, 1.0 - smoothstep(0.55, 1.0, frag.y / res.y), uEdge);
  vec3 col = mix(uInk, uAccent, lifted);
  float fill = hill * 0.09 * mix(1.0, 1.0 - smoothstep(0.55, 1.0, frag.y / res.y), uEdge);
  vec3 rgb = col * a + uAccent * fill;
  o = vec4(rgb, clamp(a + fill, 0.0, 1.0));
}`;

function hexToRgb(s: string): [number, number, number] {
  const h = s.trim().replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const v = parseInt(n, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export default function Terrain({ children, className, scale = 1.35, fade = true, crosshair = true, seed = 0, intensity = 1, edge = false, style }: { children?: ReactNode; className?: string; scale?: number; fade?: boolean; crosshair?: boolean; seed?: number; intensity?: number; edge?: boolean; style?: React.CSSProperties }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    const cv = canvas.current!;
    const host = wrap.current!;
    const gl = cv.getContext("webgl2", { premultipliedAlpha: true, antialias: true, alpha: true });
    if (!gl) {
      setOk(false);
      return;
    }
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    } catch {
      setOk(false);
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const u = { res: U("uRes"), time: U("uTime"), mouse: U("uMouse"), lift: U("uLift"), dpr: U("uDpr"), ink: U("uInk"), accent: U("uAccent"), scale: U("uScale"), fade: U("uFade"), seed: U("uSeed"), int: U("uInt"), edge: U("uEdge") };

    const colors = () => {
      const cs = getComputedStyle(document.documentElement);
      gl.uniform3fv(u.ink, hexToRgb(cs.getPropertyValue("--ink") || "#0e0e0d"));
      gl.uniform3fv(u.accent, hexToRgb(cs.getPropertyValue("--accent") || "#2f5bff"));
    };
    colors();
    const themeObs = new MutationObserver(colors);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const r = host.getBoundingClientRect();
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      gl.viewport(0, 0, cv.width, cv.height);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let mouse = { x: -9999, y: -9999 };
    let target = 0;
    let lift = 0;
    let pressed = false;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(host);

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
      if (inside) {
        mouse = { x, y };
        target = pressed ? 1.4 : 0.85;
        if (crosshair) setPt({ x, y });
      } else {
        target = 0;
        if (crosshair) setPt(null);
      }
    };
    const onDown = () => {
      pressed = true;
      if (target > 0) target = 1.4;
    };
    const onUp = () => {
      pressed = false;
      if (target > 0) target = 0.85;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    gl.uniform1f(u.scale, scale);
    gl.uniform1f(u.fade, fade ? 1 : 0);
    gl.uniform1f(u.seed, seed);
    gl.uniform1f(u.int, intensity);
    gl.uniform1f(u.edge, edge ? 1 : 0);
    const t0 = performance.now() - Math.random() * 20000;
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      if (now - last < 1000 / 45) return; // ~45 fps is plenty for a slow drift
      last = now;
      lift += (target - lift) * 0.06;
      gl.uniform2f(u.res, cv.width, cv.height);
      gl.uniform1f(u.time, reduce ? 40 : (now - t0) / 1000);
      gl.uniform2f(u.mouse, mouse.x, mouse.y);
      gl.uniform1f(u.lift, lift);
      gl.uniform1f(u.dpr, dpr);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      themeObs.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scale, fade, crosshair, seed, intensity, edge]);

  return (
    <div ref={wrap} className={`terrain ${className ?? ""}`} style={style}>
      <canvas ref={canvas} className={`terrain-gl${ok ? " is-on" : ""}`} aria-hidden />
      {crosshair && pt && (
        <div className="xhair" aria-hidden>
          <i className="xh-h" style={{ top: pt.y }} />
          <i className="xh-v" style={{ left: pt.x }} />
          <b style={{ left: pt.x, top: pt.y }} />
          <span style={{ left: pt.x + 14, top: pt.y + 12 }}>
            X {String(Math.round(pt.x)).padStart(4, "0")} · Y {String(Math.round(pt.y)).padStart(4, "0")}
          </span>
        </div>
      )}
      <div className="terrain-content">{children}</div>
    </div>
  );
}
