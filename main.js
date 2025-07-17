import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ===== 📷 攝影機背景控制 =====
let currentFacingMode = 'user';
let currentStream = null;
const video = document.getElementById('camera-feed');

async function startCameraBackground(facingMode = 'user') {
  if (currentStream) currentStream.getTracks().forEach(track => track.stop());

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
    video.srcObject = stream;
    video.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
    currentFacingMode = facingMode;
    currentStream = stream;
  } catch (err) {
    console.error('無法開啟攝影機:', err);
  }
}
startCameraBackground();

document.getElementById('toggle-camera-btn').addEventListener('click', () => {
  const next = currentFacingMode === 'user' ? 'environment' : 'user';
  startCameraBackground(next);
});

// ===== 🎧 音訊載入與初始化 =====
let audioListener = new THREE.AudioListener();
let backgroundSound = new THREE.Audio(audioListener);
const audioLoader = new THREE.AudioLoader();
audioLoader.load('public/Awe_Osaka.mp3', (buffer) => {
  backgroundSound.setBuffer(buffer);
  backgroundSound.setLoop(true);
  backgroundSound.setVolume(1.0);
});

// ===== 🌍 Three.js 初始化 =====
const scene = new THREE.Scene();
const clock = new THREE.Clock();
let mixer = null;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// === 環境光與投影光源 ===
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

const spotLight = new THREE.SpotLight(0xffffff, 10000, 100, 0.22, 1);
spotLight.position.set(0, 50, 50);
spotLight.castShadow = true;
spotLight.shadow.bias = -0.0001;
scene.add(spotLight);

// === 相機與控制器 ===
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.set(4, 5, 11);
camera.add(audioListener); // 🔊 加入 audio listener

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 20;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;
controls.autoRotate = false;
controls.target.set(0, 1, 0);
controls.update();

// ===== 📦 載入 GLB 模型 =====
let targetModel = null;
const loader = new GLTFLoader().setPath('public/');
loader.load('Awe_1.glb', (gltf) => {
  const mesh = gltf.scene;

  mesh.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  mesh.position.set(0, 0, 0);
  mesh.scale.set(0.1, 0.1, 0.1);
  scene.add(mesh);
  targetModel = mesh;

  // === 播放動畫
  if (gltf.animations?.length) {
    mixer = new THREE.AnimationMixer(mesh);
    gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    if (!backgroundSound.isPlaying) backgroundSound.play(); // 🔊 播放背景音樂
  }

  document.getElementById('progress-container').style.display = 'none';

  // === 說明 UI
  const instructions = document.createElement('div');
  instructions.style.cssText = `
    position: absolute; top: 10px; left: 10px; z-index: 1000;
    color: white; font-size: 14px; font-family: Arial;
    background: rgba(0,0,0,0.7); padding: 10px; border-radius: 5px;
    pointer-events: none;
  `;
  instructions.innerHTML = `
    <strong>雙指控制：</strong><br>
    雙指拖曳：XY 平面移動模型<br>
    雙指長按拖曳：精確移動至手指位置
  `;
  document.body.appendChild(instructions);
}, (xhr) => {
  document.getElementById('progress').textContent = `Loading... ${Math.round(xhr.loaded / xhr.total * 100)}%`;
}, (err) => {
  document.getElementById('progress').textContent = '載入失敗！';
  console.error('GLB load error:', err);
});

// ===== 🌀 畫面更新 =====
function animate() {
  requestAnimationFrame(animate);
  if (mixer) mixer.update(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ===== 🤲 手勢控制邏輯（雙指拖曳 / 長按）=====
let isTwoFingerDragging = false;
let prevMidpoint = null;
let touchStartTime = 0;
let isLongPress = false;

function getMidpoint(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

renderer.domElement.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    isTwoFingerDragging = true;
    touchStartTime = Date.now();
    prevMidpoint = getMidpoint(e.touches[0], e.touches[1]);
    e.preventDefault();
  }
});

renderer.domElement.addEventListener('touchmove', (e) => {
  if (!isTwoFingerDragging || e.touches.length !== 2 || !targetModel) return;

  const currentMidpoint = getMidpoint(e.touches[0], e.touches[1]);
  const duration = Date.now() - touchStartTime;
  isLongPress = duration > 500;

  if (isLongPress) {
    const mouse = new THREE.Vector2(
      (currentMidpoint.x / window.innerWidth) * 2 - 1,
      -(currentMidpoint.y / window.innerHeight) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -targetModel.position.z);
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersection)) {
      const moveSpeed = 0.3;
      targetModel.position.x += (intersection.x - targetModel.position.x) * moveSpeed;
      targetModel.position.y += (intersection.y - targetModel.position.y) * moveSpeed;
    }
  } else {
    const dx = currentMidpoint.x - prevMidpoint.x;
    const dy = currentMidpoint.y - prevMidpoint.y;
    targetModel.position.x += dx * 0.02;
    targetModel.position.y -= dy * 0.02;
  }

  prevMidpoint = currentMidpoint;
  e.preventDefault();
});

renderer.domElement.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) {
    isTwoFingerDragging = false;
    isLongPress = false;
    prevMidpoint = null;
    touchStartTime = 0;
  }
});

// ===== 🖥️ Resize 響應 =====
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
