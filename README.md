# gnss.js

A JavaScript module for GNSS device connections, NMEA parsing, and NTRIP client functionality.

## Features

- Web Bluetooth/Serial device connections
- NMEA sentence parsing
- NTRIP correction data handling
- Position and satellite tracking
- Settings management

## Installation

```bash
npm install gnss.js
```

## Usage

```javascript
import { GnssModule } from 'gnss.js';

// Create a new GNSS module instance
const gnss = new GnssModule();

// Connect to a GNSS device
gnss.connectDevice().then(() => {
  console.log('Connected to GNSS device');
});

// Listen for position updates
gnss.on('position', (position) => {
  console.log('Position update:', position);
});

// Connect to NTRIP service
gnss.connectNtrip({
  host: 'rtk2go.com',
  mountpoint: 'EXAMPLE_MOUNTPOINT',
  username: 'user',
  password: 'pass'
});
```

## API Documentation

*Documentation to be generated*

## License

MIT