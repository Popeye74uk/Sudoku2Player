# ⚔️ Sudoku Duel: 2-Player Competitive Sudoku

Welcome to **Sudoku Duel**, a premium, real-time, 2-player competitive Sudoku web application. Challenge your friends over the internet, across your local Wi-Fi network, or on the same device in a battle of speed, precision, and strategy!

![Sudoku Duel Gameplay](https://raw.githubusercontent.com/Popeye74uk/Sudoku2Player/main/screenshot.png) *(Placeholder or custom asset)*

---

## ✨ Features

- **🏆 Real-Time Competitive Scoring**: First player to correctly solve a cell claims the base points. Complete entire Rows, Columns, or 3x3 Boxes for massive completion bonuses. The player with the highest score when the board is fully solved wins!
- **🔥 Dynamic Streak Multipliers**: Toggle the optional Time Streak system! Placing correct digits in quick succession (within 10 seconds) builds up a multiplier chain ($2\times$, $3\times$, etc.). The streak timer automatically resets on errors or after 10 seconds of inactivity, dynamically syncing and updating cards in real-time.
- **📱 Responsive Glassmorphic UI**: Tailored with a state-of-the-art dark glassmorphic color palette (harmonious deep purples, neon cyans, and warm orange-red streak effects). Responsive design scaling flawlessly across Mobile, Tablet, and Laptop/Desktop.
- **📐 Concentric Grid Geometry**: A visually perfect 9x9 layout with mathematically concentric curves, ensuring cell margins and thick section borders align cleanly without overlapping.
- **✏️ Smart Notes (Pencil Marks)**: Private note-taking grid for each player. Correct solved numbers automatically clean up/erase matching pencil notes across their row, column, and 3x3 box for a seamless puzzle experience.
- **⚡ Dual Sync Protocol**:
  - **Firebase Realtime Database**: Seamless online matching using short 6-digit room codes.
  - **Zero-Config Local SSE Server**: An in-memory Node.js fallback server utilizing Server-Sent Events (SSE). Automatically binds to your local LAN/Wi-Fi IP, serving a custom QR code for instant mobile scan-and-play without entering room codes.
- **🎮 Local Same-Device Pass & Play**: Start a game in solo/practice mode or tap status cards to handover/pass the device for offline 2-player matches.

---

## 🚀 Getting Started

### 📋 Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed (v16.0.0 or higher recommended).

### ⚙️ Quick Start (Local Network Server)

1. Clone or download this repository to your local machine.
2. Launch the server script:
   - **Windows**: Double-click `start.bat`
   - **Manual**: Run `node server.js` in your terminal.
3. The server will start on port `8080` and automatically launch your browser to `http://localhost:8080`.
4. Scan the served QR code or copy the local LAN URL to play on your mobile phone or tablet connected to the same Wi-Fi network!

---

## 🛠️ Configuration & Database Sync

### 1. Zero-Config Local HTTP + SSE (Default)
By default, the application runs fully out-of-the-box using the lightweight local Node.js static HTTP and Server-Sent Events server (`server.js`). It maintains room matchmaking and board synchronisation entirely in-memory.

### 2. Firebase Realtime Database (Optional Online Play)
To enable global online multiplayer via Google Firebase, update the credentials configuration object inside [js/multiplayer.js](file:///c:/Users/Admin/OneDrive/Documents/CodingProjects/Sudoku2Player/js/multiplayer.js):

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```
Once updated with a valid configuration, the app automatically scales and prioritizes Firebase Realtime DB matchmaking.

---

## 🧪 Testing

The codebase includes an automated unit-test suite checking candidate grids, valid placement rules, solver convergence, and streak scoring states.

To run the engine test suite:
```bash
node js/test_sudoku.js
```

---

## 🛡️ License

This project is open-source and available under the [MIT License](LICENSE).
