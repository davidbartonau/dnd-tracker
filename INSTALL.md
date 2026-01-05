# D&D Initiative Tracker - Installation Guide

This guide walks you through setting up the D&D Initiative Tracker application from scratch, including Firebase configuration and deployment options.

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- A Google account (for Firebase)
- A modern web browser (Chrome, Firefox, Safari, Edge)

## Quick Start (Local Development)

```bash
# 1. Clone the repository
git clone <repository-url>
cd dnd-tracker

# 2. Install dependencies
npm install

# 3. Configure Firebase (see "Firebase Setup" section below)

# 4. Start development server
npm run dev
```

The app will be available at:
- Public Display: http://localhost:3000/public/
- DM Control: http://localhost:3000/dm/

## Firebase Setup

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter a project name (e.g., "dnd-initiative-tracker")
4. Disable Google Analytics (not needed) or enable if you want it
5. Click "Create project"

### Step 2: Enable Firestore

1. In your Firebase project, go to "Build" → "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" (we'll configure rules later)
4. Select a region closest to your users
5. Click "Enable"

### Step 3: Register a Web App

1. In Project Settings (gear icon), scroll to "Your apps"
2. Click the web icon (`</>`) to add a web app
3. Enter a nickname (e.g., "D&D Tracker Web")
4. Check "Also set up Firebase Hosting" if you plan to use it
5. Click "Register app"
6. Copy the Firebase configuration object

### Step 4: Configure Environment Variables

Create a `.env` file in the project root with your Firebase config:

```bash
# .env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

Or update `src/lib/firebase.ts` directly with your config values.

### Step 5: Configure Firestore Security Rules

In Firebase Console → Firestore → Rules, set up these rules:

#### Option A: Open Rules (Simple, for Trusted Environments)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to all rooms
    match /rooms/{roomId} {
      allow read, write: if true;

      // Allow read/write to commands subcollection
      match /commands/{commandId} {
        allow read, write: if true;
      }
    }
  }
}
```

#### Option B: Basic Rate Limiting (Recommended)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      // Allow reading rooms
      allow read: if true;

      // Allow creating new rooms with required fields
      allow create: if request.resource.data.keys().hasAll(['createdAt', 'title', 'state', 'controller']);

      // Allow updates only for state changes
      allow update: if request.resource.data.createdAt == resource.data.createdAt;

      // Commands subcollection
      match /commands/{commandId} {
        allow read: if true;
        allow create: if request.resource.data.keys().hasAll(['type', 'payload', 'sentAtMs', 'clientId']);
        allow delete: if true;
      }
    }
  }
}
```

Click "Publish" to apply the rules.

## Claude Code for Web Setup

If you're using Claude Code for Web, you can set up environment variables through the Claude Code environment settings:

1. Open Claude Code settings
2. Add the following environment variables:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

The session-start hook (`.claude/hooks/session-start.sh`) will automatically create the `.env` file from these environment variables when you start a new session.

## Deployment Options

### Option 1: Firebase Hosting (Recommended)

Firebase Hosting provides free SSL and fast CDN delivery.

```bash
# 1. Install Firebase CLI
npm install -g firebase-tools

# 2. Login to Firebase
firebase login

# 3. Initialize Firebase in your project
firebase init hosting

# When prompted:
# - Select your Firebase project
# - Set public directory to: dist
# - Configure as single-page app: No
# - Don't overwrite index.html

# 4. Build the project
npm run build

# 5. Deploy
firebase deploy --only hosting
```

Your app will be available at:
- `https://your-project.web.app/public/`
- `https://your-project.web.app/dm/`

### Option 2: Vercel

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Build the project
npm run build

# 3. Deploy
cd dist
vercel
```

### Option 3: Netlify

```bash
# 1. Install Netlify CLI
npm install -g netlify-cli

# 2. Build the project
npm run build

# 3. Deploy
netlify deploy --dir=dist --prod
```

### Option 4: Any Static Hosting

The built `dist/` folder contains static files that can be hosted on any static file server:

```bash
npm run build
# Upload contents of dist/ to your server
```

Ensure your server is configured to:
- Serve `public/index.html` for `/public/*` routes
- Serve `dm/index.html` for `/dm/*` routes
- Use HTTPS (required for camera access on mobile)

## HTTPS Requirement

**Important:** The DM control page requires camera access for QR scanning, which only works over HTTPS. For local development:

- `localhost` is treated as secure by browsers
- For testing on mobile devices on your local network, you'll need HTTPS

### Local HTTPS with mkcert

```bash
# Install mkcert
brew install mkcert  # macOS
# or see https://github.com/FiloSottile/mkcert for other OS

# Create local CA and certificates
mkcert -install
mkcert localhost 127.0.0.1 ::1

# Use with Vite
# Update vite.config.ts:
```

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

export default defineConfig({
  // ... existing config ...
  server: {
    https: {
      key: fs.readFileSync('./localhost+2-key.pem'),
      cert: fs.readFileSync('./localhost+2.pem'),
    },
    port: 3000,
  },
});
```

## Testing the Application

### Local Testing

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open the public display page on your tablet/laptop:
   - http://localhost:3000/public/

3. A QR code and room code will appear

4. On your phone/tablet (the DM device), either:
   - Scan the QR code with your camera
   - Open http://localhost:3000/dm/ and enter the room code

5. Test the flow:
   - Add some creatures (monsters and players)
   - Set their initiative values
   - Press "Start Combat"
   - Watch the timers count
   - Press "Next Turn" to advance
   - Test HP modifications, status effects, and cloning

### Testing Checklist

- [ ] Room creation works on public display page
- [ ] QR code displays correctly
- [ ] QR scanning works on DM control page
- [ ] Manual room code entry works
- [ ] Adding creatures works
- [ ] Initiative ordering is correct (highest first)
- [ ] Starting combat highlights first creature
- [ ] Next Turn advances to next active creature
- [ ] Timer displays update correctly
- [ ] HP modification works (set/heal/damage)
- [ ] Status effects can be added
- [ ] Cloning creatures works
- [ ] Condition toggle (active/unconscious/dead) works
- [ ] Unconscious creatures are skipped
- [ ] Round end is detected correctly

## Troubleshooting

### "Room not found" Error

- Verify Firestore is enabled in Firebase Console
- Check that your Firebase config is correct
- Ensure security rules allow read/write

### Camera Not Working (DM Control Page)

- Ensure you're using HTTPS (or localhost)
- Grant camera permission when prompted
- Try Chrome on Android (best BarcodeDetector support)
- Use manual room code entry as fallback

### Creatures Not Syncing

- Check browser console for Firestore errors
- Verify network connection
- Ensure Firebase config is correct

### Build Errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install

# Clear Vite cache
rm -rf node_modules/.vite
npm run dev
```

## Data Cleanup (Optional)

Over time, old rooms accumulate in Firestore. Options for cleanup:

### Manual Cleanup

Delete old rooms directly in Firebase Console → Firestore → rooms

### Scheduled Cleanup (Cloud Functions)

Deploy a Cloud Function to delete rooms older than X days:

```javascript
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.cleanupOldRooms = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const db = admin.firestore();
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days

    const snapshot = await db.collection('rooms')
      .where('createdAt', '<', cutoff)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`Deleted ${snapshot.size} old rooms`);
  });
```

## Support

For issues and feature requests, please open an issue on the repository.
