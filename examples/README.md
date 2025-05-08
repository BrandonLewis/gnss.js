# gnss.js Examples

This directory contains example applications that demonstrate how to use the gnss.js library.

## Running the Examples

The examples require a secure context (HTTPS) to run because they use the Web Bluetooth and Web Serial APIs. To run them locally:

1. Build the library: `npm run build`
2. Start the HTTPS server: `npm run serve`
3. Open the examples in your browser: `https://localhost:8443/`

## Examples

### 1. Basic Usage (`basic-usage.html`)

This example demonstrates the basic functionality of the gnss.js library:

- Connecting to GNSS devices via Bluetooth or Serial
- Receiving and displaying position data
- Connecting to NTRIP services for RTK corrections

### 2. Connection Diagnostics (`connection-diagnostics.html`)

This is a comprehensive diagnostic tool to help troubleshoot connection issues with GNSS devices:

#### Web Serial Features
- List all available serial ports
- Request access to new ports
- Connect to ports with configurable baud rate
- View raw data with text/hex display options

#### Web Bluetooth Features
- List all paired Bluetooth devices
- Scan for new devices
- Explore all available services
- Examine each service's characteristics
- Test reading and writing to characteristics
- Monitor notifications from characteristics
- View raw data with text/hex display options

This diagnostic tool is especially helpful for:
- Debugging connection issues
- Identifying the correct services and characteristics for GNSS devices
- Understanding the data format sent by devices
- Testing different communication parameters

## Using the Diagnostic Tool

The connection-diagnostics.html example is particularly useful when troubleshooting device communication:

1. **Serial Connection Debugging**:
   - Use "List Available Ports" to see previously authorized ports
   - Use "Request New Port" to select a new device
   - Connect to the device with the appropriate baud rate
   - Review the raw data to understand the communication format

2. **Bluetooth Connection Debugging**:
   - Use "List Paired Devices" to see previously paired devices
   - Use "Scan for Devices" to discover new devices
   - Connect to the GATT server
   - Explore available services
   - Examine characteristics for each service
   - Test reading values, receiving notifications, and writing commands
   - Monitor the raw data to understand the communication format

The tool provides a complete view of a device's capabilities and communication patterns, which is essential for implementing proper support in the gnss.js library.