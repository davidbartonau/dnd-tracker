import { initializeFirebase } from '../lib/firebase.ts';
import { getRoom, subscribeToRoom } from '../lib/firestore.ts';
import { decodeQRCode, extractRoomIdFromUrl } from '../lib/qr.ts';
import { initGoogleAuth, signInWithGoogle, signOutUser, onAuthStateChange, type AuthUser } from '../lib/auth.ts';
import { Room, Creature } from '../lib/types.ts';

// App state
let currentRoom: Room | null = null;
let currentUser: AuthUser | null = null;
let scannerStream: MediaStream | null = null;
let scannerAnimationId: number | null = null;
let timerInterval: number | null = null;

// DOM Elements
const loadingScreen = document.getElementById('loading') as HTMLDivElement;
const joinScreen = document.getElementById('join-screen') as HTMLDivElement;
const trackerScreen = document.getElementById('tracker-screen') as HTMLDivElement;
const scannerVideo = document.getElementById('scanner-video') as HTMLVideoElement;
const roomCodeInput = document.getElementById('room-code-input') as HTMLInputElement;
const joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
const roomBadge = document.getElementById('room-badge') as HTMLElement;
const initiativeList = document.getElementById('initiative-list') as HTMLDivElement;
const combatStatus = document.getElementById('combat-status') as HTMLDivElement;

// Timer elements
const roundNumberEl = document.getElementById('round-number') as HTMLElement;
const turnTimeEl = document.getElementById('turn-time') as HTMLElement;

// Auth elements
const googleSigninBtn = document.getElementById('google-signin-btn') as HTMLButtonElement;
const userInfo = document.getElementById('user-info') as HTMLDivElement;
const userAvatar = document.getElementById('user-avatar') as HTMLImageElement;
const userNameEl = document.getElementById('user-name') as HTMLElement;
const signoutBtn = document.getElementById('signout-btn') as HTMLButtonElement;

// Initialize app
async function init() {
  try {
    // Initialize Firebase first
    initializeFirebase();

    // Initialize Google Auth
    await initGoogleAuth();

    // Listen for auth state changes
    onAuthStateChange((user) => {
      currentUser = user;
      updateAuthUI();
    });

    // Check if room ID is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoomId = urlParams.get('room');

    if (urlRoomId) {
      await joinRoom(urlRoomId);
    } else {
      showScreen('join');
      startScanner();
    }

    setupEventListeners();
  } catch (error) {
    console.error('Failed to initialize:', error);
    loadingScreen.innerHTML = '<p>Failed to initialize. Please refresh.</p>';
  }
}

// Show a specific screen
function showScreen(screen: 'loading' | 'join' | 'tracker') {
  loadingScreen.classList.remove('active');
  joinScreen.classList.remove('active');
  trackerScreen.classList.remove('active');

  switch (screen) {
    case 'loading':
      loadingScreen.classList.add('active');
      break;
    case 'join':
      joinScreen.classList.add('active');
      break;
    case 'tracker':
      trackerScreen.classList.add('active');
      break;
  }
}

// Update auth UI
function updateAuthUI() {
  if (currentUser) {
    userInfo.classList.remove('hidden');
    userAvatar.src = currentUser.photoURL || '';
    userNameEl.textContent = currentUser.displayName || currentUser.email || '';
    googleSigninBtn.textContent = 'Signed in';
    googleSigninBtn.disabled = true;
  } else {
    userInfo.classList.add('hidden');
    googleSigninBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Sign in with Google
    `;
    googleSigninBtn.disabled = false;
  }
}

// Setup event listeners
function setupEventListeners() {
  // Join button
  joinBtn.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length === 6) {
      await joinRoom(code);
    }
  });

  roomCodeInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const code = roomCodeInput.value.trim().toUpperCase();
      if (code.length === 6) {
        await joinRoom(code);
      }
    }
  });

  // Google sign in
  googleSigninBtn.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  });

  // Sign out
  signoutBtn.addEventListener('click', async () => {
    try {
      await signOutUser();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  });
}

// Join a room
async function joinRoom(code: string) {
  showScreen('loading');
  stopScanner();

  try {
    const room = await getRoom(code);
    if (!room) {
      alert('Room not found');
      showScreen('join');
      startScanner();
      return;
    }

    currentRoom = room;

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    window.history.replaceState({}, '', url.toString());

    // Subscribe to room updates
    subscribeToRoom(code, handleRoomUpdate, (error) => {
      console.error('Room subscription error:', error);
    });

    roomBadge.textContent = code;
    showScreen('tracker');
    startTimerLoop();
  } catch (error) {
    console.error('Failed to join room:', error);
    alert('Failed to join room');
    showScreen('join');
    startScanner();
  }
}

// Handle room updates
function handleRoomUpdate(room: Room | null) {
  if (!room) {
    console.log('Room not found');
    return;
  }

  currentRoom = room;

  // Start or stop timer based on combat status
  if (room.state.status === 'running') {
    startTimerLoop();
  }

  updateUI(room);
}

// Update UI based on room state
function updateUI(room: Room) {
  const state = room.state;

  // Update round number
  roundNumberEl.textContent = String(state.round);

  // Update combat status
  switch (state.status) {
    case 'setup':
      combatStatus.textContent = 'Waiting to start...';
      combatStatus.classList.add('setup');
      break;
    case 'running':
      const currentCreature = state.creatures.find(c => c.id === state.currentCreatureId);
      combatStatus.textContent = currentCreature
        ? `${currentCreature.displayName || currentCreature.name}'s turn`
        : 'Combat in progress';
      combatStatus.classList.remove('setup');
      break;
    case 'paused':
      combatStatus.textContent = 'Combat paused';
      combatStatus.classList.remove('setup');
      break;
    case 'round_end':
      combatStatus.textContent = `End of Round ${state.round}`;
      combatStatus.classList.remove('setup');
      break;
  }

  // Render initiative list (limited info for players)
  renderInitiativeList(state.creatures, state.currentCreatureId);
}

// Render initiative list with limited info
function renderInitiativeList(creatures: Creature[], currentCreatureId: string | null) {
  initiativeList.innerHTML = creatures
    .map((creature) => {
      const isCurrent = creature.id === currentCreatureId;

      const statusBadges = creature.statusEffects
        .map(
          (s) => `
          <span class="status-badge" style="border-color: ${s.color}">
            <span class="status-icon">${s.icon}</span>
            <span class="status-name">${s.name}</span>
            ${s.roundsRemaining !== null ? `<span class="status-rounds">${s.roundsRemaining}</span>` : ''}
          </span>
        `
        )
        .join('');

      return `
        <div class="creature-card ${isCurrent ? 'current-turn' : ''} ${creature.isPlayer ? 'is-player' : ''} ${creature.condition}">
          <div class="creature-initiative">${creature.initiative}</div>
          <div class="creature-icon">${creature.icon}</div>
          <div class="creature-info">
            <div class="creature-name">${creature.displayName || creature.name}</div>
            ${statusBadges ? `<div class="creature-statuses">${statusBadges}</div>` : ''}
          </div>
        </div>
      `;
    })
    .join('');
}

// QR Scanner
async function startScanner() {
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    scannerVideo.srcObject = scannerStream;
    await scannerVideo.play();
    scanFrame();
  } catch (error) {
    console.error('Failed to start scanner:', error);
  }
}

function stopScanner() {
  if (scannerAnimationId) {
    cancelAnimationFrame(scannerAnimationId);
    scannerAnimationId = null;
  }
  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop());
    scannerStream = null;
  }
}

function scanFrame() {
  if (!scannerStream || !scannerVideo.videoWidth) {
    scannerAnimationId = requestAnimationFrame(scanFrame);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = scannerVideo.videoWidth;
  canvas.height = scannerVideo.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(scannerVideo, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const qrData = decodeQRCode(imageData);
  if (qrData) {
    // Try to extract room ID - could be DM URL or player URL
    let extractedRoomId = extractRoomIdFromUrl(qrData);
    if (extractedRoomId) {
      joinRoom(extractedRoomId);
      return;
    }
  }

  scannerAnimationId = requestAnimationFrame(scanFrame);
}

// Timer loop
function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = window.setInterval(() => {
    if (currentRoom) {
      updateTimers(currentRoom);
    }
  }, 100);
}

function updateTimers(room: Room) {
  const state = room.state;
  const now = Date.now();

  // Turn time
  let turnMs = 0;
  if (state.turnStartTimeMs && state.status === 'running') {
    turnMs = now - state.turnStartTimeMs;
  }
  turnTimeEl.textContent = formatTime(turnMs);
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Get current user info (for external use)
export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

// Start the app
init();
