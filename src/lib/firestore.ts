import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  Unsubscribe,
  DocumentReference,
} from 'firebase/firestore';
import { getDb } from './firebase.ts';
import { Room, RoomState, Command, CommandWithId, INITIAL_ROOM_STATE, Creature } from './types.ts';

// Create a new room
export async function createRoom(roomId: string, title: string = 'D&D Initiative Tracker'): Promise<void> {
  console.log('[Firestore] createRoom called with roomId:', roomId);
  const db = getDb();
  console.log('[Firestore] Got db instance');
  const roomRef = doc(db, 'rooms', roomId);
  console.log('[Firestore] Created room reference');

  const room: Room = {
    createdAt: Date.now(),
    title,
    state: INITIAL_ROOM_STATE,
    controller: {
      lastSeenAt: null,
      clientId: null,
    },
  };

  console.log('[Firestore] Attempting setDoc with room data:', JSON.stringify(room, null, 2));
  try {
    // Add timeout to detect hanging requests (usually means security rules blocking)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore write timed out after 10s - check security rules in Firebase Console')), 10000)
    );
    await Promise.race([setDoc(roomRef, room), timeoutPromise]);
    console.log('[Firestore] setDoc completed successfully');
  } catch (error) {
    console.error('[Firestore] setDoc FAILED:', error);
    throw error;
  }
}

// Get a room by ID
export async function getRoom(roomId: string): Promise<Room | null> {
  const db = getDb();
  const roomRef = doc(db, 'rooms', roomId);
  const snapshot = await getDoc(roomRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as Room;
}

// Check if a room exists
export async function roomExists(roomId: string): Promise<boolean> {
  const room = await getRoom(roomId);
  return room !== null;
}

// Subscribe to room changes
export function subscribeToRoom(
  roomId: string,
  onUpdate: (room: Room | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  console.log('[Firestore] subscribeToRoom called for roomId:', roomId);
  const db = getDb();
  const roomRef = doc(db, 'rooms', roomId);

  return onSnapshot(
    roomRef,
    (snapshot) => {
      console.log('[Firestore] Room snapshot received, exists:', snapshot.exists());
      if (snapshot.exists()) {
        console.log('[Firestore] Room data received');
        onUpdate(snapshot.data() as Room);
      } else {
        console.log('[Firestore] Room does not exist');
        onUpdate(null);
      }
    },
    (error) => {
      console.error('[Firestore] Room subscription error:', error);
      onError?.(error);
    }
  );
}

// Update room state
export async function updateRoomState(roomId: string, state: Partial<RoomState>): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, 'rooms', roomId);

  // Build update object with dot notation for nested fields
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    updates[`state.${key}`] = value;
  }

  await updateDoc(roomRef, updates);
}

// Update creatures array directly
export async function updateCreatures(roomId: string, creatures: Creature[]): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, 'rooms', roomId);

  await updateDoc(roomRef, {
    'state.creatures': creatures,
  });
}

// Update controller info
export async function updateControllerInfo(
  roomId: string,
  clientId: string
): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, 'rooms', roomId);

  await updateDoc(roomRef, {
    'controller.lastSeenAt': Date.now(),
    'controller.clientId': clientId,
  });
}

// Send a command to the room
export async function sendCommand(
  roomId: string,
  command: Omit<Command, 'sentAtMs'>
): Promise<DocumentReference> {
  const db = getDb();
  const commandsRef = collection(db, 'rooms', roomId, 'commands');

  const fullCommand: Command = {
    ...command,
    sentAtMs: Date.now(),
  };

  return addDoc(commandsRef, fullCommand);
}

// Subscribe to commands (for public display)
export function subscribeToCommands(
  roomId: string,
  onCommand: (commands: CommandWithId[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const db = getDb();
  const commandsRef = collection(db, 'rooms', roomId, 'commands');
  const q = query(commandsRef, orderBy('sentAtMs', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const commands: CommandWithId[] = [];
      snapshot.forEach((doc) => {
        commands.push({
          id: doc.id,
          ...(doc.data() as Command),
        });
      });
      onCommand(commands);
    },
    (error) => {
      console.error('Commands subscription error:', error);
      onError?.(error);
    }
  );
}

// Delete a processed command
export async function deleteCommand(roomId: string, commandId: string): Promise<void> {
  const db = getDb();
  const commandRef = doc(db, 'rooms', roomId, 'commands', commandId);
  await deleteDoc(commandRef);
}
