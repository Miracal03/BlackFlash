const video = document.querySelector('#capture');
const canvas = document.querySelector('#stage');
const controls = document.querySelector('#controls');
const status = document.querySelector('#status');
const errorBox = document.querySelector('#error');
const params = { intensity: 0.82, monochrome: 0.86, edge: 1.05, threshold: 0.48, pulse: 0.35, flash: 0.24 };

const vertexSource = `#version 300 es
in vec2 position;
out vec2 uv;
void main() {
  vec2 textureUv = position * .5 + .5;
  uv = vec2(textureUv.x, 1. - textureUv.y);
  gl_Position = vec4(position, 0., 1.);
}`;

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D frame;
uniform vec2 texel;
uniform float time;
uniform float intensity;
uniform float monochrome;
uniform float edgeStrength;
uniform float threshold;
uniform float pulseRate;
uniform float flashStrength;
in vec2 uv;
out vec4 outColor;

float lum(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1.,0.)), f.x),
             mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), f.x), f.y);
}
float sampleL(vec2 o, float scale) { return lum(texture(frame, uv + o * texel * scale).rgb); }
float sobel(float scale) {
  float gx = -sampleL(vec2(-1.,-1.), scale) - 2.*sampleL(vec2(-1.,0.), scale) - sampleL(vec2(-1.,1.), scale)
             + sampleL(vec2(1.,-1.), scale) + 2.*sampleL(vec2(1.,0.), scale) + sampleL(vec2(1.,1.), scale);
  float gy = -sampleL(vec2(-1.,-1.), scale) - 2.*sampleL(vec2(0.,-1.), scale) - sampleL(vec2(1.,-1.), scale)
             + sampleL(vec2(-1.,1.), scale) + 2.*sampleL(vec2(0.,1.), scale) + sampleL(vec2(1.,1.), scale);
  return length(vec2(gx, gy));
}
void main() {
  vec3 source = texture(frame, uv).rgb;
  float l = lum(source);
  vec2 pixel = uv / texel;
  float fiber = noise(pixel * vec2(.075, .018)) * .65 + noise(pixel * .19) * .35;

  // Gooch-style two-ended shading: graphite shadow against a cool white field.
  vec3 albedo = vec3(l);
  vec3 kCool = vec3(.055, .062, .068) + .10 * albedo;
  vec3 kWarm = vec3(.965, .975, .985) + .015 * albedo;
  float diffuse = smoothstep(threshold - .30, threshold + .30, l);
  diffuse = floor(diffuse * 4. + fiber * .28) / 4.;
  vec3 inkWash = mix(kCool, kWarm, diffuse);

  // A broad broken stroke under a crisp core creates brush-like variable weight.
  float fine = sobel(1.0);
  float broad = max(sobel(2.35), sobel(3.8) * .72);
  float dryBrush = smoothstep(.20, .82, fiber + noise(pixel * vec2(.032, .22)) * .32);
  float broadStroke = smoothstep(.025, .19, broad * edgeStrength) * mix(.58, 1., dryBrush);
  float coreStroke = smoothstep(.055, .30, fine * edgeStrength);
  float outline = clamp(broadStroke * .72 + coreStroke, 0., 1.);

  float shadowInk = 1. - smoothstep(threshold - .32, threshold + .05, l);
  shadowInk *= .28 + .24 * noise(pixel * .055);
  float wave = pulseRate > 0. ? .5 + .5 * sin(time * pulseRate * 6.28318) : 0.;
  float breathing = .86 + .14 * wave;
  vec3 whiteInk = vec3(.995, .998, 1.);
  vec3 painted = mix(inkWash, whiteInk, clamp(outline * breathing + shadowInk, 0., 1.));
  painted += (fiber - .5) * .035;
  vec3 color = mix(source, painted, intensity);
  // A restrained white pulse keeps the desktop legible between flashes.
  color = mix(color, whiteInk, wave * flashStrength);
  float finalLuma = lum(color);
  color = mix(color, vec3(finalLuma), monochrome);
  outColor = vec4(color, 1.);
}`;

function shader(gl, type, source) {
  const item = gl.createShader(type); gl.shaderSource(item, source); gl.compileShader(item);
  if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
  return item;
}

function setupGL() {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) throw new Error('此显卡或驱动不支持 WebGL 2。');
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const uniform = (name) => gl.getUniformLocation(program, name);
  const started = performance.now();
  function render() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(innerWidth * dpr), height = Math.round(innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height); }
    if (video.readyState >= 2) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      gl.uniform2f(uniform('texel'), 1 / video.videoWidth, 1 / video.videoHeight);
      gl.uniform1f(uniform('time'), (performance.now() - started) / 1000);
      gl.uniform1f(uniform('intensity'), params.intensity);
      gl.uniform1f(uniform('monochrome'), params.monochrome);
      gl.uniform1f(uniform('edgeStrength'), params.edge);
      gl.uniform1f(uniform('threshold'), params.threshold);
      gl.uniform1f(uniform('pulseRate'), params.pulse);
      gl.uniform1f(uniform('flashStrength'), params.flash);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(render);
  }
  render();
}

async function start() {
  try {
    const query = new URLSearchParams(location.search);
    if (query.get('primary') !== 'true') controls.classList.add('hidden');
    const sourceId = await window.blackFlash.getSourceId(query.get('displayId'));
    if (!sourceId) throw new Error('没有找到可捕获的显示器。');
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxFrameRate: 60 } }
    });
    await video.play();
    setupGL();
    status.textContent = `${video.videoWidth} × ${video.videoHeight} · 实时`;
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = `无法启动屏幕滤镜：${error.message}`;
  }
}

for (const id of ['intensity', 'monochrome', 'edge', 'threshold', 'pulse', 'flash']) {
  const input = document.querySelector(`#${id}`), output = document.querySelector(`#${id}Out`);
  input.addEventListener('input', () => {
    params[id] = Number(input.value);
    output.value = id === 'pulse' ? `${params[id].toFixed(1)} Hz` : `${Math.round(params[id] * 100)}%`;
  });
}
document.querySelector('#quit').addEventListener('click', () => window.blackFlash.quit());
document.querySelector('#passthrough').addEventListener('click', () => window.blackFlash.setPassthrough(true));
window.blackFlash.onControlsVisible((visible) => controls.classList.toggle('hidden', !visible));
window.blackFlash.onPassthrough((value) => document.querySelector('#passthrough').classList.toggle('active', value));
start();
