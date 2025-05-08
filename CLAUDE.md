# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build Commands

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run development mode with auto-reload
npm run dev

# Lint the codebase
npm run lint

# Generate documentation
npm run docs
```

## Project Architecture

### Core Concepts

gnss.js is a JavaScript module for GNSS (Global Navigation Satellite System) device connections, NMEA parsing, and NTRIP client functionality. It's designed to work in browser environments with Web Bluetooth and Web Serial APIs.

The main components are:

1. **GnssModule** (`src/index.js`): The main entry point and public API. Manages device connections, NMEA parsing, and NTRIP client.

2. **Connection Management**:
   - `ConnectionManager` (`src/connection/connection-manager.js`): Manages different connection methods for GNSS devices
   - `BluetoothHandler` (`src/connection/bluetooth-handler.js`): Handles Web Bluetooth connections
   - `SerialHandler` (`src/connection/serial-handler.js`): Handles Web Serial connections

3. **NMEA Parser** (`src/nmea-parser.js`): Parses NMEA sentences from GNSS receivers
   - Supports GGA, GSA, GSV, RMC, GST, VTG sentences
   - Tracks position and satellite information

4. **NTRIP Client** (`src/ntrip-client.js`): Handles connections to NTRIP casters for RTK corrections
   - Supports multiple connection methods: direct, proxy, WebSocket
   - Handles GGA position updates to the caster
   - Forwards RTCM correction data to the GNSS device

5. **Event System** (`src/event-emitter.js`): Simple pub/sub event system for component communication

### Data Flow

1. User connects to a GNSS device via Bluetooth or Serial
2. Device sends NMEA sentences which are parsed by the NmeaParser
3. Position data is extracted and emitted as events
4. User can connect to an NTRIP service for RTK corrections
5. NTRIP corrections are forwarded to the device
6. Position updates with improved accuracy are received and parsed

### Dependency Structure

```
GnssModule
├── EventEmitter
├── ConnectionManager
│   ├── BluetoothHandler
│   └── SerialHandler
├── NmeaParser
└── NtripClient
```

## Coding Standards

- This project uses ES modules (`type: "module"` in package.json)
- ESLint is configured with basic rules (2-space indentation, single quotes, etc.)
- JSDocs are used for API documentation
- The code is designed to be browser-compatible

## Development Notes

- The library is built using Rollup with UMD and ESM output formats
- Web Bluetooth requires a secure context (HTTPS) in production
- NTRIP connections are implemented with multiple fallback methods to handle browser security restrictions