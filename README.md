# D&D Initiative Tracker

A real-time D&D combat initiative tracker with a public display and DM control interface, synchronized via Firebase.

## Features

- **Two-Device Setup**: Public display (tablet/screen) and DM control (phone/tablet)
- **QR Code Connection**: DM scans QR code to connect to room
- **Initiative Tracking**: Automatic sorting by initiative, manual reordering within same initiative
- **Combat Timer**: Total time, round time, and turn time tracking
- **Creature Management**:
  - Add creatures with initiative, HP, AC, and attacks
  - Clone creatures with auto-suffixes (A, B, C) or custom names
  - Track HP with heal/damage/set options
  - Toggle conditions: Active, Unconscious, Dead
- **Status Effects**: 20+ predefined statuses with icons and colors
  - Set duration in rounds or indefinite
  - Auto-decrement at end of round
- **Round Management**: Automatic round tracking with end-of-round overlay

## Quick Start

```bash
# Install dependencies
npm install

# Configure Firebase (see INSTALL.md)

# Start development server
npm run dev
```

## URLs

- **Public Display**: http://localhost:3000/public/
- **DM Control**: http://localhost:3000/dm/

## Documentation

See [INSTALL.md](./INSTALL.md) for detailed setup instructions including Firebase configuration.

## Tech Stack

- TypeScript
- Vite
- Firebase Firestore (real-time sync)
- QR Code generation/scanning

## License

MIT
