import { initializeFirebase } from './firebase.ts';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Attack } from './types.ts';

export interface ScannedMonster {
  name: string;
  icon: string;
  initiative: number | null;
  maxHp: number;
  ac: number;
  isPlayer: boolean;
  attacks: Attack[];
}

export interface ScanResult {
  monsters: ScannedMonster[];
  error?: string;
}

let functions: ReturnType<typeof getFunctions> | null = null;

function getFirebaseFunctions() {
  if (!functions) {
    const app = initializeFirebase();
    // Explicitly specify us-central1 region to match deployed function
    functions = getFunctions(app, 'us-central1');
  }
  return functions;
}

/**
 * Convert an image file to base64
 */
export async function imageToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Capture image from camera
 */
export async function captureFromCamera(): Promise<{ base64: string; mimeType: string } | null> {
  return new Promise((resolve) => {
    // Create canvas element for capture
    const canvas = document.createElement('canvas');

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'camera-overlay';
    overlay.innerHTML = `
      <div class="camera-container">
        <video autoplay playsinline></video>
        <div class="camera-controls">
          <button class="btn btn-secondary" id="cancel-capture">Cancel</button>
          <button class="btn btn-primary" id="capture-btn">Capture</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const videoEl = overlay.querySelector('video') as HTMLVideoElement;
    const captureBtn = overlay.querySelector('#capture-btn') as HTMLButtonElement;
    const cancelBtn = overlay.querySelector('#cancel-capture') as HTMLButtonElement;

    let stream: MediaStream | null = null;

    const cleanup = () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      overlay.remove();
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };

    captureBtn.onclick = () => {
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(videoEl, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            cleanup();
            resolve({ base64, mimeType: 'image/jpeg' });
          };
          reader.readAsDataURL(blob);
        } else {
          cleanup();
          resolve(null);
        }
      }, 'image/jpeg', 0.9);
    };

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    })
      .then((mediaStream) => {
        stream = mediaStream;
        videoEl.srcObject = stream;
      })
      .catch((err) => {
        console.error('Camera access error:', err);
        cleanup();
        resolve(null);
      });
  });
}

/**
 * Scan a monster image using AI
 */
export async function scanMonsterImage(imageBase64: string, mimeType: string): Promise<ScanResult> {
  const funcs = getFirebaseFunctions();
  const scanFn = httpsCallable<
    { imageBase64: string; mimeType: string },
    ScanResult
  >(funcs, 'scanMonsterImage');

  try {
    const result = await scanFn({ imageBase64, mimeType });
    return result.data;
  } catch (error) {
    console.error('AI scan error:', error);
    throw error;
  }
}
