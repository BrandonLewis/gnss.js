# gnss.js

[![npm version](https://img.shields.io/npm/v/gnss.js.svg)](https://www.npmjs.com/package/gnss.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/yourusername/gnss.js/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/gnss.js/actions/workflows/ci.yml)

A JavaScript module for GNSS device connections, NMEA parsing, and NTRIP client functionality.

## Features

- **Device Connectivity**: Connect to GNSS receivers via Web Bluetooth or Web Serial APIs
- **NMEA Parsing**: Parse standard NMEA sentences (GGA, GSA, GSV, RMC, GST, VTG)
- **NTRIP Client**: Connect to NTRIP casters for RTK correction data with multiple connection modes
- **RTK Support**: Forward correction data to connected devices
- **Event-Based API**: Simple, event-driven architecture for real-time data handling
- **Browser Support**: Works in modern browsers with no server dependencies

## Installation

### npm / yarn

```bash
# Using npm
npm install gnss.js

# Using yarn
yarn add gnss.js
```

### Browser (CDN)

#### Using unpkg

```html
<!-- UMD build (development) -->
<script src="https://unpkg.com/gnss.js/dist/gnss.js"></script>

<!-- UMD build (production, minified) -->
<script src="https://unpkg.com/gnss.js/dist/gnss.min.js"></script>

<!-- ESM build for modern browsers -->
<script type="module">
  import { GnssModule } from 'https://unpkg.com/gnss.js/dist/gnss.esm.js';
</script>
```

#### Using jsDelivr (GitHub)

```html
<!-- Latest version (development) -->
<script src="https://cdn.jsdelivr.net/gh/BrandonLewis/gnss.js@cdn-dist/dist/gnss.js"></script>

<!-- Latest version (production, minified) -->
<script src="https://cdn.jsdelivr.net/gh/BrandonLewis/gnss.js@cdn-dist/dist/gnss.min.js"></script>

<!-- Specific version (recommended for production) -->
<script src="https://cdn.jsdelivr.net/gh/BrandonLewis/gnss.js@0.1.0/dist/gnss.min.js"></script>

<!-- ESM build for modern browsers -->
<script type="module">
  import { GnssModule } from 'https://cdn.jsdelivr.net/gh/BrandonLewis/gnss.js@cdn-dist/dist/gnss.esm.js';
</script>
```

## Usage

### Basic Usage

```javascript
import { GnssModule } from 'gnss.js';

// Create a new GNSS module instance
const gnss = new GnssModule();

// Connect to a GNSS device using the best available method
gnss.connectDevice().then(() => {
  console.log('Connected to GNSS device');
});

// Listen for position updates
gnss.on('position', (position) => {
  console.log('Position update:', position);
  // Example position object:
  // {
  //   latitude: 37.7749,
  //   longitude: -122.4194,
  //   altitude: 15.2,
  //   quality: 2,
  //   satellites: 9,
  //   hdop: 0.9,
  //   timestamp: Date
  // }
});
```

### Connecting via Bluetooth

```javascript
// Connect specifically via Bluetooth
gnss.connectBluetooth().then((success) => {
  if (success) {
    console.log('Connected via Bluetooth');
  } else {
    console.error('Failed to connect via Bluetooth');
  }
});
```

### Connecting via Serial Port

```javascript
// Connect specifically via Serial port
gnss.connectSerial().then((success) => {
  if (success) {
    console.log('Connected via Serial port');
  } else {
    console.error('Failed to connect via Serial port');
  }
});
```

### Using NTRIP for RTK Corrections

```javascript
// Connect to NTRIP service
gnss.connectNtrip({
  host: 'rtk2go.com',
  port: 2101,
  mountpoint: 'YOUR_MOUNTPOINT',
  username: 'user',  // Optional
  password: 'pass',  // Optional
  sendGga: true,     // Send position to caster (required by some services)
  connectionMode: 'auto' // auto, direct, proxy, or websocket
}).then((success) => {
  if (success) {
    console.log('Connected to NTRIP service');
  } else {
    console.error('Failed to connect to NTRIP service');
  }
});

// Listen for RTCM correction data
gnss.on('ntrip:rtcm', (rtcmData) => {
  console.log('Received RTCM data:', rtcmData.data.byteLength, 'bytes');
});
```

### Event Handling

```javascript
// Connection events
gnss.on('connection:connected', (info) => {
  console.log('Device connected via:', info.method);
});

gnss.on('connection:disconnected', () => {
  console.log('Device disconnected');
});

gnss.on('connection:error', (error) => {
  console.error('Connection error:', error.message);
});

// NTRIP events
gnss.on('ntrip:connected', (info) => {
  console.log('NTRIP connected to:', info.casterHost, info.mountpoint);
});

gnss.on('ntrip:disconnected', () => {
  console.log('NTRIP disconnected');
});

// Satellite data
gnss.on('satellites', (satellites) => {
  console.log('Satellite count:', satellites.length);
});
```

## Browser Compatibility

- Chrome 78+ (Desktop & Android)
- Edge 79+
- Opera 65+
- Samsung Internet 12.0+

**Features Requiring Secure Context (HTTPS):**
- Web Bluetooth API
- Web Serial API

## API Documentation

Detailed API documentation is available at [https://yourusername.github.io/gnss.js](https://yourusername.github.io/gnss.js).

## Examples

Check out the [examples directory](https://github.com/yourusername/gnss.js/tree/master/examples) for complete usage examples, including:

- Basic usage example
- RTK positioning with NTRIP
- Satellite tracking
- Custom UI components

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.