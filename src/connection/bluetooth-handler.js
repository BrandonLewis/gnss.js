/**
 * BluetoothConnectionHandler - Implements Web Bluetooth connections
 */
import ConnectionHandler from './connection-handler.js';

class BluetoothConnectionHandler extends ConnectionHandler {
  constructor(eventEmitter, options = {}) {
    super(eventEmitter, options);
    this.name = 'bluetooth';
    this.device = null;
    this.server = null;
    this.serialService = null;
    this.rxCharacteristic = null;
    this.txCharacteristic = null;
    this.autoReconnect = false;
    this.connectionTimeout = 10000; // 10 seconds
    this.pollingEnabled = false;
    this.pollingInterval = null;
    
    // Common BLE UART/Serial service UUIDs
    // Prioritizing BLE services first since the Sparkfun Facet RTK Rover uses BLE
    this.SERVICE_UUIDS = [
      // BLE UART Services (most common)
      '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (nRF51822, very common in BLE devices)
      '0000ffe0-0000-1000-8000-00805f9b34fb', // Nordic UART Service (alternate form)
      '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Common HM-10/HM-16/HM-17 BLE Module Service
      '0000fff0-0000-1000-8000-00805f9b34fb', // Common HC-08/HC-10 BLE Service
      
      // Generic BLE services that might be useful
      '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute Service
      '00001800-0000-1000-8000-00805f9b34fb', // Generic Access Service
      
      // SparkFun RTK-specific services (if they use custom services)
      '0000fe9a-0000-1000-8000-00805f9b34fb',  // Possible custom service
      
      // Legacy Classic Bluetooth services (less likely on BLE devices)
      '00001101-0000-1000-8000-00805f9b34fb', // SPP (Serial Port Profile) - Classic Bluetooth
      
      // Testing/fallback services
      '0000180d-0000-1000-8000-00805f9b34fb'  // Heart Rate Service (for testing)
    ];
    
    // Common BLE characteristic UUIDs
    // Nordic UART (nRF UART) characteristic UUIDs - very common in BLE devices
    this.NORDIC_TX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // TX (device transmits to phone)
    this.NORDIC_RX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // RX (phone transmits to device)
    
    // Common alternate BLE characteristic UUIDs
    this.BLE_TX_UUIDS = [
      // Nordic UART variants
      '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // Nordic TX
      '0000ffe1-0000-1000-8000-00805f9b34fb', // Common BLE TX
      '0000fff1-0000-1000-8000-00805f9b34fb', // HC-08 TX
      '49535343-8841-43f4-a8d4-ecbe34729bb3', // HM-10 TX
      // SparkFun might use a custom characteristic
      '0000fe9a-0002-1000-8000-00805f9b34fb'  // Possible custom TX
    ];
    
    this.BLE_RX_UUIDS = [
      // Nordic UART variants
      '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // Nordic RX
      '0000ffe2-0000-1000-8000-00805f9b34fb', // Common BLE RX
      '0000fff2-0000-1000-8000-00805f9b34fb', // HC-08 RX
      '49535343-1e4d-4bd9-ba61-23c647249616', // HM-10 RX
      // SparkFun might use a custom characteristic
      '0000fe9a-0003-1000-8000-00805f9b34fb'  // Possible custom RX
    ];
    
    // Legacy names for backward compatibility 
    this.SPP_SERVICE_UUID = '00001101-0000-1000-8000-00805f9b34fb';
    this.SPP_RX_UUID = '00001102-0000-1000-8000-00805f9b34fb';
    this.SPP_TX_UUID = '00001103-0000-1000-8000-00805f9b34fb';
    
    // Bind methods
    this.onDisconnected = this.onDisconnected.bind(this);
  }

  /**
   * Check if Web Bluetooth API is available
   * @returns {boolean} - Whether Web Bluetooth is available
   */
  isAvailable() {
    return typeof navigator !== 'undefined' && 
           navigator.bluetooth !== undefined;
  }
  
  /**
   * Get priority level for Bluetooth connections
   * @param {Object} options - Connection options
   * @returns {number} - Priority level
   */
  getPriority(options = {}) {
    // Default priority (1-10 scale, higher = try first)
    let priority = 7; // Bluetooth is generally preferred over Serial as it's more common
    
    // Increase priority if explicitly preferred
    if (options.preferredMethod === 'bluetooth') {
      priority += 3;
    }
    
    // Increase priority if we have a last used device
    if (options.deviceId || (options.bluetooth && options.bluetooth.lastDeviceId)) {
      priority += 2;
    }
    
    // If connecting to a specific device type
    if (options.sparkfun) {
      priority += 1;
    }
    
    // Return final priority value
    return priority;
  }

  /**
   * Connect to a GNSS receiver via Bluetooth
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>} Whether connection was successful
   */
  async connect(options = {}) {
    if (this.isConnected) {
      return true;
    }
    
    if (this.isConnecting) {
      return false;
    }
    
    this.isConnecting = true;
    this.eventEmitter.emit('bluetooth:connecting', {});
    
    try {
      // Browser compatibility check
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth API is not supported in this browser');
      }
      
      // Check if this is a SparkFun device connection
      if (options.sparkfun) {
        // Use our special SparkFun connection method
        return this.connectToSparkFunFacet(options);
      }
      
      // Request device with optional filters
      const requestOptions = {
        acceptAllDevices: !options.filters,
        filters: options.filters || [],
        optionalServices: [this.SPP_SERVICE_UUID]
      };
      
      // Try to get device ID from options or Bluetooth section
      const deviceId = options.deviceId || 
                      (options.bluetooth && options.bluetooth.lastDeviceId);
      
      // Allow connecting to last device
      if (deviceId) {
        try {
          this.device = await navigator.bluetooth.getDevices()
            .then(devices => devices.find(d => d.id === deviceId));
            
          if (!this.device) {
            throw new Error('Device not found');
          }
        } catch (error) {
          this.logger.debug('Failed to reconnect to known device:', error);
          // Fall back to device picker
          this.device = await navigator.bluetooth.requestDevice(requestOptions);
        }
      } else {
        // Show the device picker
        this.device = await navigator.bluetooth.requestDevice(requestOptions);
      }
      
      if (!this.device) {
        throw new Error('No device selected');
      }
      
      // Set up disconnection listener
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
      
      // Connect to GATT server
      this.eventEmitter.emit('bluetooth:connecting', { step: 'gatt' });
      this.server = await this.device.gatt.connect();
      
      // Get a suitable UART/Serial service
      this.eventEmitter.emit('bluetooth:connecting', { step: 'service' });
      
      // First, get all services to see what's available
      const allServices = await this.server.getPrimaryServices();
      this.logger.debug('All available services:', allServices.map(s => s.uuid));
      
      if (allServices.length === 0) {
        throw new Error('No Bluetooth services found on this device');
      }
      
      // Then try to find one of our known UART services
      let foundService = null;
      let serviceUUID = '';
      
      // Try each of our known service UUIDs
      // BLE devices sometimes use shortened 16-bit UUIDs
      for (const uuid of this.SERVICE_UUIDS) {
        try {
          this.logger.debug(`Trying to connect to service: ${uuid}`);
          const service = await this.server.getPrimaryService(uuid);
          if (service) {
            foundService = service;
            serviceUUID = uuid;
            this.logger.debug(`Successfully connected to service: ${uuid}`);
            break;
          }
        } catch (e) {
          this.logger.debug(`Service ${uuid} not found on device`);
          
          // Try to convert to 16-bit UUID if it might be a standard BLE UUID
          try {
            // For standard 16-bit UUIDs, like "180d" for Heart Rate
            // Extract the 16-bit part if it's a full UUID
            if (uuid.includes('-')) {
              const shortUuid = uuid.split('-')[0].replace('0000', '');
              if (shortUuid.length === 4) {
                this.logger.debug(`Trying 16-bit service UUID: ${shortUuid}`);
                const service = await this.server.getPrimaryService(shortUuid);
                if (service) {
                  foundService = service;
                  serviceUUID = shortUuid;
                  this.logger.debug(`Successfully connected to 16-bit service: ${shortUuid}`);
                  break;
                }
              }
            }
          } catch (e2) {
            this.logger.debug(`16-bit service ID not found either`);
          }
          // Continue to next service UUID
        }
      }
      
      // If we couldn't find a known service, try to use any available service that has characteristics
      if (!foundService) {
        this.logger.warn('Could not find any known UART/Serial services');
        
        // Try each service to find one with suitable characteristics
        for (const service of allServices) {
          try {
            const characteristics = await service.getCharacteristics();
            this.logger.debug(`Service ${service.uuid} has ${characteristics.length} characteristics`);
            
            if (characteristics.length > 0) {
              foundService = service;
              serviceUUID = service.uuid;
              this.logger.debug(`Using service ${service.uuid} with ${characteristics.length} characteristics`);
              break;
            }
          } catch (e) {
            this.logger.debug(`Could not get characteristics for service ${service.uuid}`);
          }
        }
      }
      
      if (!foundService) {
        throw new Error('Could not find a suitable Bluetooth service for communication');
      }
      
      this.serialService = foundService;
      this.logger.debug(`Using service: ${serviceUUID}`);
      this.eventEmitter.emit('bluetooth:connecting', { step: 'service-found', serviceUUID });
      
      // Get characteristics
      this.eventEmitter.emit('bluetooth:connecting', { step: 'characteristics' });
      
      // Try to get TX and RX characteristics using a more flexible approach
      // First, get all characteristics from the service
      this.logger.debug('Getting characteristics from service:', this.serialService.uuid);
      let characteristics = [];
      try {
        characteristics = await this.serialService.getCharacteristics();
        this.logger.debug('All characteristics:', characteristics.map(c => ({
          uuid: c.uuid,
          properties: Object.keys(c.properties).filter(p => c.properties[p])
        })));
      } catch (error) {
        this.logger.error(`Error getting characteristics: ${error.message}`);
        this.eventEmitter.emit('bluetooth:error', {
          message: `Failed to get characteristics: ${error.message}`,
          error
        });
        throw error;
      }
      
      if (characteristics.length === 0) {
        throw new Error('No characteristics found in the selected service');
      }
      
      // Try with known BLE characteristic pairs first
      // Creating all possible combinations of TX and RX characteristics
      const knownCharacteristicPairs = [];
      
      // Nordic UART pair (most common for BLE UART)
      knownCharacteristicPairs.push({ 
        rx: this.NORDIC_TX_UUID, // The TX characteristic from device
        tx: this.NORDIC_RX_UUID  // The RX characteristic to device
      });
      
      // Try all combinations of TX/RX pairs from our lists
      for (const txUuid of this.BLE_TX_UUIDS) {
        for (const rxUuid of this.BLE_RX_UUIDS) {
          // Skip if it's the same as Nordic pair we already added
          if (txUuid === this.NORDIC_TX_UUID && rxUuid === this.NORDIC_RX_UUID) {
            continue;
          }
          knownCharacteristicPairs.push({ rx: txUuid, tx: rxUuid });
        }
      }
      
      // Some devices use the same characteristic for both TX and RX
      for (const txUuid of this.BLE_TX_UUIDS) {
        knownCharacteristicPairs.push({ rx: txUuid, tx: txUuid });
      }
      
      // Add legacy SPP pair at the end
      knownCharacteristicPairs.push({ rx: this.SPP_RX_UUID, tx: this.SPP_TX_UUID });
      
      // Try each known pair
      for (const pair of knownCharacteristicPairs) {
        try {
          this.logger.debug(`Trying RX=${pair.rx}, TX=${pair.tx}`);
          const rx = await this.serialService.getCharacteristic(pair.rx);
          const tx = await this.serialService.getCharacteristic(pair.tx);
          
          if (rx && tx) {
            this.rxCharacteristic = rx;
            this.txCharacteristic = tx;
            this.logger.debug(`Found matching RX/TX pair: RX=${pair.rx}, TX=${pair.tx}`);
            break;
          }
        } catch (e) {
          this.logger.debug(`Characteristic pair not found: ${e.message}`);
          // Continue to next pair
        }
      }
      
      // If we couldn't find a known pair, try to detect based on properties
      if (!this.rxCharacteristic || !this.txCharacteristic) {
        this.logger.debug('No known characteristic pair found, detecting based on properties');
        
        // Look for characteristics with the right properties for RX/TX
        // RX: needs notify (for receiving data from device)
        // TX: needs write (for sending data to device)
        const notifyChars = characteristics.filter(char => char.properties.notify);
        const writeChars = characteristics.filter(char => char.properties.write || char.properties.writeWithoutResponse);
        
        this.logger.debug(`Found ${notifyChars.length} notify characteristics and ${writeChars.length} write characteristics`);
        
        if (notifyChars.length > 0) {
          this.rxCharacteristic = notifyChars[0];
          this.logger.debug(`Using RX characteristic with UUID: ${this.rxCharacteristic.uuid}`);
        } else if (characteristics.length > 0) {
          // Fallback to first characteristic if no notify characteristics
          this.rxCharacteristic = characteristics[0];
          this.logger.debug(`Using fallback RX characteristic with UUID: ${this.rxCharacteristic.uuid}`);
        }
        
        if (writeChars.length > 0) {
          this.txCharacteristic = writeChars[0];
          this.logger.debug(`Using TX characteristic with UUID: ${this.txCharacteristic.uuid}`);
        } else if (characteristics.length > 1) {
          // Fallback to second characteristic if no write characteristics
          this.txCharacteristic = characteristics[1] || characteristics[0];
          this.logger.debug(`Using fallback TX characteristic with UUID: ${this.txCharacteristic.uuid}`);
        } else if (characteristics.length === 1) {
          // If only one characteristic, use it for both TX and RX
          this.txCharacteristic = characteristics[0];
          this.logger.debug(`Using single characteristic for both RX and TX: ${this.txCharacteristic.uuid}`);
        }
      }
      
      // Verify we have both characteristics
      if (!this.rxCharacteristic) {
        throw new Error('Could not find a suitable RX characteristic');
      }
      
      if (!this.txCharacteristic) {
        throw new Error('Could not find a suitable TX characteristic');
      }
      
      // Try to start notifications for incoming data
      // But make this optional - some devices might use a polling approach instead
      try {
        this.logger.debug(`Starting notifications on RX characteristic: ${this.rxCharacteristic.uuid}`);
        this.logger.debug(`RX characteristic properties:`, Object.keys(this.rxCharacteristic.properties).filter(p => this.rxCharacteristic.properties[p]));
        
        // Only attempt to start notifications if the characteristic supports it
        if (this.rxCharacteristic.properties.notify) {
          await this.rxCharacteristic.startNotifications();
          this.rxCharacteristic.addEventListener('characteristicvaluechanged', 
            (event) => this.handleIncomingData(event));
          this.logger.debug('Notifications started successfully');
        } else {
          this.logger.debug('RX characteristic does not support notifications, will use polling instead');
          // Set up polling for devices that don't support notifications
          this.pollingEnabled = true;
          this.pollingInterval = setInterval(async () => {
            try {
              // Read the characteristic value manually
              if (this.isConnected && this.rxCharacteristic) {
                const value = await this.rxCharacteristic.readValue();
                // Only process if there's actual data
                if (value && value.byteLength > 0) {
                  this.handleIncomingData({ target: { value } });
                }
              }
            } catch (e) {
              this.logger.warn('Error polling characteristic:', e);
            }
          }, 500); // Poll every 500ms
        }
      } catch (error) {
        this.logger.error(`Error setting up data reception: ${error.message}`);
        // This is not a fatal error, we can try a different approach
        this.eventEmitter.emit('bluetooth:warning', {
          message: `Could not set up data reception: ${error.message}, will try polling`,
          error
        });
        
        // Set up polling as a fallback
        this.pollingEnabled = true;
        this.pollingInterval = setInterval(async () => {
          try {
            // Read the characteristic value manually
            if (this.isConnected && this.rxCharacteristic) {
              const value = await this.rxCharacteristic.readValue();
              // Only process if there's actual data
              if (value && value.byteLength > 0) {
                this.handleIncomingData({ target: { value } });
              }
            }
          } catch (e) {
            this.logger.warn('Error polling characteristic:', e);
          }
        }, 500); // Poll every 500ms
      }
      
      this.isConnected = true;
      this.isConnecting = false;
      this.autoReconnect = options.autoReconnect || false;
      
      this.eventEmitter.emit('bluetooth:connected', {
        deviceId: this.device.id,
        deviceName: this.device.name
      });
      
      // Also emit generic connection event for the connection manager
      this.eventEmitter.emit('device:connected', {
        method: 'bluetooth',
        deviceId: this.device.id,
        deviceName: this.device.name
      });
      
      return true;
    } catch (error) {
      this.isConnecting = false;
      this.eventEmitter.emit('bluetooth:error', {
        message: error.message,
        error
      });
      
      return false;
    }
  }

  /**
   * Disconnect from the device
   */
  async disconnect() {
    if (!this.isConnected || !this.device) {
      return;
    }
    
    try {
      this.autoReconnect = false;
      
      // Clean up notifications or polling
      if (this.rxCharacteristic && this.rxCharacteristic.properties.notify) {
        await this.rxCharacteristic.stopNotifications();
      }
      
      // Clear polling interval if it was used
      if (this.pollingEnabled && this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
        this.pollingEnabled = false;
      }
      
      if (this.device.gatt.connected) {
        await this.device.gatt.disconnect();
      }
      
      this.isConnected = false;
      this.eventEmitter.emit('bluetooth:disconnected', {
        deviceId: this.device.id,
        deviceName: this.device.name
      });
      
      // Also emit generic disconnection event for the connection manager
      this.eventEmitter.emit('device:disconnected', {
        method: 'bluetooth',
        deviceId: this.device.id,
        deviceName: this.device.name
      });
    } catch (error) {
      this.logger.error('Error during disconnect:', error);
      this.eventEmitter.emit('bluetooth:error', {
        message: 'Failed to disconnect properly',
        error
      });
    }
  }

  /**
   * Handle device disconnection
   */
  async onDisconnected() {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    
    // Clear polling interval if it was used
    if (this.pollingEnabled && this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.pollingEnabled = false;
    }
    
    this.server = null;
    this.serialService = null;
    this.rxCharacteristic = null;
    this.txCharacteristic = null;
    
    if (wasConnected) {
      this.eventEmitter.emit('bluetooth:disconnected', {
        deviceId: this.device?.id,
        deviceName: this.device?.name
      });
      
      // Also emit generic disconnection event for the connection manager
      this.eventEmitter.emit('device:disconnected', {
        method: 'bluetooth',
        deviceId: this.device?.id,
        deviceName: this.device?.name
      });
      
      // Attempt automatic reconnection if enabled
      if (this.autoReconnect && this.device) {
        setTimeout(() => {
          this.connect({ deviceId: this.device.id, autoReconnect: true });
        }, 1000);
      }
    }
  }

  /**
   * Handle incoming data from the device
   * @param {Event} event - Characteristic value changed event
   */
  handleIncomingData(event) {
    try {
      const value = event.target.value;
      const data = value.buffer;
      
      // Convert ArrayBuffer to string for debugging
      const textDecoder = new TextDecoder('utf-8');
      const dataString = textDecoder.decode(new Uint8Array(data));
      
      // Generate a hex representation for debugging
      const hexValues = Array.from(new Uint8Array(data))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      
      // Check for empty or extremely short data
      if (dataString.length < 3) {
        this.logger.debug(`Received very short data (${dataString.length} bytes), likely not NMEA. Skipping.`);
        return;
      }
      
      if (this.debugSettings.debug) {
        this.logger.debug('Received data:', dataString);
        this.logger.debug('Hex representation:', hexValues);
      }
      
      // More comprehensive detection of NMEA data
      const isNmea = dataString.includes('$');
      const containsCrLf = dataString.includes('\r\n');
      const hasNmeaSentence = /\$(GP|GL|GA|GB|GN)[A-Z]{3},/.test(dataString);
      
      // Skip data processing if:
      // 1. This appears to be just the device name repeating
      // 2. The device name has already been reported many times
      if (this.lastDataString === dataString && !isNmea) {
        this.logger.debug('Skipping duplicate data (device name)');
        return;
      }
      
      // Remember the last string to detect repeats
      this.lastDataString = dataString;
      
      // Handle potential configuration messages (responses to our PUBX commands)
      if (dataString.includes('PUBX') && !this.configurationResponded) {
        this.logger.debug('Detected configuration response from device:', dataString);
        this.configurationResponded = true;
        
        // Try to enable GGA messages again immediately after receiving a response
        setTimeout(async () => {
          try {
            await this.sendData('$PUBX,40,GGA,1,1,1,1,1,0*5A\r\n');
            this.logger.debug('Resent GGA enable command after receiving PUBX response');
          } catch (e) {
            this.logger.warn('Failed to send follow-up command:', e);
          }
        }, 300);
        
        // Try to detect if this includes error information
        if (dataString.toLowerCase().includes('error') || dataString.includes('ERR')) {
          this.logger.warn('Device responded with error to configuration commands');
        } else {
          this.logger.debug('Device appears to have accepted configuration');
        }
      }
      
      // Look for UBX binary protocol responses
      if (hexValues.startsWith('b5 62')) {
        this.logger.debug('Detected UBX binary protocol response');
        
        // Parse UBX message class and ID
        if (hexValues.length >= 10) {
          const msgClass = parseInt(hexValues.split(' ')[2], 16);
          const msgId = parseInt(hexValues.split(' ')[3], 16);
          this.logger.debug(`UBX message class: 0x${msgClass.toString(16)}, ID: 0x${msgId.toString(16)}`);
        }
      }
      
      // Sometimes RMC/GGA sentences are actually present but in unusual format
      // Try to extract them even if not perfectly formatted
      if (isNmea && !hasNmeaSentence) {
        // Look for position data with regex pattern matching
        const extractedPosition = dataString.match(/(\d{2})(\d{2}\.\d+),([NS]),(\d{3})(\d{2}\.\d+),([EW])/);
        if (extractedPosition) {
          this.logger.debug('Found position data in non-standard format:', extractedPosition[0]);
          // Consider constructing a valid NMEA sentence here if needed
        }
      }
      
      // Emit a raw data event with the string, before any parsing
      this.eventEmitter.emit('bluetooth:raw-data', dataString);
      
      // Only emit for parsing if this looks like NMEA data
      if (isNmea) {
        // Emit the binary data for parsing using both bluetooth-specific and device-generic events
        this.eventEmitter.emit('bluetooth:data', data);
        this.eventEmitter.emit('device:data', data);
      }
    } catch (error) {
      this.logger.error('Error handling incoming data:', error);
    }
  }

  /**
   * Send data to the device
   * @param {string|ArrayBuffer} data - Data to send
   * @returns {Promise<boolean>} Whether send was successful
   */
  async sendData(data) {
    if (!this.isConnected || !this.txCharacteristic) {
      this.logger.error('Cannot send data: device not connected or TX characteristic not available');
      return false;
    }
    
    try {
      // Convert string to ArrayBuffer if needed
      let buffer;
      if (typeof data === 'string') {
        if (this.debugSettings.debug) {
          this.logger.debug('Sending string data:', data);
        }
        buffer = new TextEncoder().encode(data);
      } else if (data instanceof ArrayBuffer) {
        const textDecoder = new TextDecoder('utf-8');
        const dataString = textDecoder.decode(new Uint8Array(data));
        if (this.debugSettings.debug) {
          this.logger.debug('Sending binary data:', dataString);
        }
        buffer = data;
      } else {
        throw new Error('Invalid data type. Expected string or ArrayBuffer');
      }
      
      // When using Nordic UART Service (which is typical for many GNSS devices):
      // The write characteristic might need writeWithoutResponse
      if (this.txCharacteristic.uuid === '6e400002-b5a3-f393-e0a9-e50e24dcca9e') {
        if (this.debugSettings.debug) {
          this.logger.debug('Using writeWithoutResponse for Nordic UART TX');
        }
        
        // Break data into smaller chunks (20 bytes max) to avoid overflow
        const MAX_CHUNK_SIZE = 20;
        const dataArray = new Uint8Array(buffer);
        
        for (let i = 0; i < dataArray.length; i += MAX_CHUNK_SIZE) {
          const chunk = dataArray.slice(i, Math.min(i + MAX_CHUNK_SIZE, dataArray.length));
          // Use writeValueWithoutResponse for Nordic UART
          await this.txCharacteristic.writeValueWithoutResponse(chunk);
          
          // Small delay between chunks
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } 
      // Otherwise try standard methods
      else {
        // Determine the write type based on the characteristic properties
        let writeOptions = {};
        if (this.txCharacteristic.properties.writeWithoutResponse) {
          if (this.debugSettings.debug) {
            this.logger.debug('Using writeWithoutResponse');
          }
          writeOptions = { type: 'writeWithoutResponse' };
        } else {
          if (this.debugSettings.debug) {
            this.logger.debug('Using standard write');
          }
        }
        
        await this.txCharacteristic.writeValue(buffer, writeOptions);
      }
      
      this.logger.debug('Data sent successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to send data:', error);
      this.eventEmitter.emit('bluetooth:warning', {
        message: `Failed to send data: ${error.message} - continuing operation`,
        error
      });
      // Return true even if sending fails - we want to continue trying to receive data
      // This helps if the device is in a mode where it's sending but not receiving
      return true; 
    }
  }

  /**
   * Send a command to configure the device
   * @param {string} command - Command string
   * @returns {Promise<boolean>} Whether command was sent successfully
   */
  async sendCommand(command) {
    // Ensure command ends with proper line ending
    if (!command.endsWith('\r\n')) {
      command += '\r\n';
    }
    
    return this.sendData(command);
  }

  /**
   * Special connection method for SparkFun Facet RTK Rover
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>} Whether connection was successful
   */
  async connectToSparkFunFacet(options = {}) {
    if (this.isConnected) {
      return true;
    }
    
    if (this.isConnecting) {
      return false;
    }
    
    this.isConnecting = true;
    this.eventEmitter.emit('bluetooth:connecting', { type: 'sparkfun' });
    
    try {
      // Browser compatibility check
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth API is not supported in this browser');
      }
      
      // Create a broader list of optionalServices to improve our chances
      // of finding the correct one for the SparkFun device
      
      // Create a comprehensive list of possible BLE UART services - use only full UUIDs
      const allPossibleServices = [
        // The specific known SparkFun service (this may vary by device model)
        '0000ffe0-0000-1000-8000-00805f9b34fb', // Common for HC-05/06/08 modules
        
        // Common UART services in priority order
        '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
        '49535343-fe7d-4ae5-8fa9-9fafd205e455', // HM-10 Service
        '0000fff0-0000-1000-8000-00805f9b34fb', // Alternative UART Service
        
        // Generic services
        '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
        '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
        
        // Add all other service UUIDs we know about
        ...this.SERVICE_UUIDS,
        
        // Try some common UUID patterns with different bases
        '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
        '00001809-0000-1000-8000-00805f9b34fb', // Health Thermometer
        '0000180d-0000-1000-8000-00805f9b34fb', // Heart Rate
        '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
        '0000181a-0000-1000-8000-00805f9b34fb'  // Environmental Sensing
      ];
      
      // Request device with Facet specific filters
      const requestOptions = {
        filters: [
          { namePrefix: 'Facet' },
          { namePrefix: 'SparkFun' },
          { namePrefix: 'RTK' }
        ],
        optionalServices: allPossibleServices
      };
      
      // Show device picker
      this.logger.debug('Requesting SparkFun Facet RTK device...');
      this.device = await navigator.bluetooth.requestDevice(requestOptions);
      
      if (!this.device) {
        throw new Error('No device selected');
      }
      
      // Set up disconnection listener
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
      
      // Connect to GATT server
      this.logger.debug('Connecting to GATT server...');
      this.server = await this.device.gatt.connect();
      
      // Get all available services
      this.logger.debug('Getting all services...');
      const allServices = await this.server.getPrimaryServices();
      
      if (allServices.length === 0) {
        throw new Error('No services found on device');
      }
      
      this.logger.debug('Available services:', allServices.map(s => s.uuid));
      
      // Find a service we can use for communication
      // Create a priority list of services to try - use only full UUIDs
      const priorityServices = [
        // First priority: Known UART/Serial services
        '0000ffe0-0000-1000-8000-00805f9b34fb', // BLE UART (HC-05/06/08)
        '0000ffe5-0000-1000-8000-00805f9b34fb', // BLE Data Service
        '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
        '49535343-fe7d-4ae5-8fa9-9fafd205e455', // HM-10/16/17
        '0000fff0-0000-1000-8000-00805f9b34fb', // HC-08/10 Alternative
        
        // Generic services - lowest priority
        '00001800-0000-1000-8000-00805f9b34fb', // Generic Access 
        '00001801-0000-1000-8000-00805f9b34fb'  // Generic Attribute
      ];
      
      // Log all available services for debugging
      this.logger.debug('Available services on device:');
      allServices.forEach(service => {
        this.logger.debug(`- ${service.uuid}`);
      });
      
      // Try each service in priority order
      for (const serviceId of priorityServices) {
        const service = allServices.find(s => s.uuid === serviceId);
        if (service) {
          this.logger.debug(`Found priority service: ${serviceId}`);
          this.serialService = service;
          break;
        }
      }
      
      // If we still don't have a service, try all services
      if (!this.serialService) {
        this.logger.debug('No priority service found, trying all services...');
        
        // Try each service and see if it has suitable characteristics
        for (const service of allServices) {
          try {
            const chars = await service.getCharacteristics();
            this.logger.debug(`Service ${service.uuid} has ${chars.length} characteristics`);
            
            // Look for characteristics with read property (needed for data reception)
            const readChar = chars.find(c => c.properties.read);
            if (readChar) {
              this.logger.debug(`Found service with readable characteristic: ${service.uuid}`);
              this.serialService = service;
              break;
            }
          } catch (e) {
            this.logger.warn(`Error checking characteristics for service ${service.uuid}:`, e);
          }
        }
        
        // Last resort: use the first service
        if (!this.serialService && allServices.length > 0) {
          this.logger.debug('Using first available service as last resort');
          this.serialService = allServices[0];
        }
      }
      
      if (!this.serialService) {
        throw new Error('Could not find a suitable service');
      }
      
      this.logger.debug('Using service:', this.serialService.uuid);
      
      // Get all characteristics from this service
      this.logger.debug('Getting characteristics...');
      const characteristics = await this.serialService.getCharacteristics();
      
      if (characteristics.length === 0) {
        throw new Error('No characteristics found');
      }
      
      this.logger.debug('Available characteristics:', characteristics.map(c => ({
        uuid: c.uuid,
        properties: Object.keys(c.properties).filter(p => c.properties[p])
      })));
      
      // For SparkFun devices, we'll prioritize characteristics with read/write permissions
      this.rxCharacteristic = characteristics.find(char => char.properties.read);
      this.txCharacteristic = characteristics.find(char => char.properties.write || char.properties.writeWithoutResponse);
      
      // If we couldn't find a read characteristic, use the first available
      if (!this.rxCharacteristic && characteristics.length > 0) {
        this.rxCharacteristic = characteristics[0];
      }
      
      // If we couldn't find a write characteristic, use the second available or the first one
      if (!this.txCharacteristic && characteristics.length > 1) {
        this.txCharacteristic = characteristics[1];
      } else if (!this.txCharacteristic) {
        this.txCharacteristic = characteristics[0];
      }
      
      this.logger.debug('Using RX characteristic:', this.rxCharacteristic.uuid);
      this.logger.debug('Using TX characteristic:', this.txCharacteristic.uuid);
      
      // Set up enhanced polling for SparkFun device with better error recovery
      this.logger.debug('Setting up enhanced polling for SparkFun device...');
      this.pollingEnabled = true;
      
      // For some devices, we need to try multiple characteristics
      // Get all characteristics from this service
      let allCharacteristics = [];
      try {
        // Get all characteristics for potential polling targets
        allCharacteristics = await this.serialService.getCharacteristics();
        this.logger.debug(`Found ${allCharacteristics.length} characteristics to potentially poll`);
      } catch (e) {
        this.logger.warn('Error getting all characteristics:', e);
      }
      
      // Track failure count to potentially switch characteristics
      let failureCount = 0;
      const MAX_FAILURES = 3;
      let currentCharIndex = 0;
      let dataReceived = false;
      let startupDelay = true;
      
      // Give device time to initialize before starting polling
      setTimeout(() => {
        startupDelay = false;
        this.logger.debug('Starting data polling after initialization delay');
      }, 3000);
      
      // Use a more robust polling approach with two methods
      this.pollingInterval = setInterval(async () => {
        // Skip polling during startup delay
        if (startupDelay) {
          return;
        }
        
        try {
          // Try notification method first (preferred)
          if (this.isConnected && this.rxCharacteristic && this.rxCharacteristic.properties.notify) {
            if (!this.rxCharacteristic._hasStartedNotifications) {
              try {
                await this.rxCharacteristic.startNotifications();
                this.rxCharacteristic._hasStartedNotifications = true;
                this.logger.debug('Successfully started notifications on characteristic');
                
                // Add event listener for notifications
                this.rxCharacteristic.addEventListener('characteristicvaluechanged', 
                  (event) => this.handleIncomingData(event));
              } catch (notifyError) {
                this.logger.warn('Failed to start notifications, falling back to polling:', notifyError);
              }
            }
          }
          
          // Also use direct readValue as backup or alternative
          if (this.isConnected && this.rxCharacteristic) {
            const value = await this.rxCharacteristic.readValue();
            // Only process if there's actual data
            if (value && value.byteLength > 0) {
              this.handleIncomingData({ target: { value } });
              
              // Track successful data receipt
              if (!dataReceived) {
                dataReceived = true;
                this.logger.debug('Successfully receiving data from device');
              }
              
              failureCount = 0; // Reset failure count on success
            } else {
              // Empty value could be a soft failure
              failureCount++;
            }
          }
        } catch (e) {
          this.logger.warn('Error polling primary characteristic:', e);
          failureCount++;
          
          // If we've had multiple failures, try switching to another characteristic
          if (failureCount >= MAX_FAILURES && allCharacteristics.length > 1) {
            failureCount = 0;
            currentCharIndex = (currentCharIndex + 1) % allCharacteristics.length;
            
            // Try using a different characteristic
            const nextChar = allCharacteristics[currentCharIndex];
            if (nextChar && nextChar !== this.rxCharacteristic) {
              this.logger.debug(`Switching to alternative characteristic: ${nextChar.uuid}`);
              this.rxCharacteristic = nextChar;
              
              // Reset notification tracking for this characteristic
              this.rxCharacteristic._hasStartedNotifications = false;
              
              // Try to start notifications for the new characteristic
              try {
                await this.rxCharacteristic.startNotifications();
                this.rxCharacteristic._hasStartedNotifications = true;
                this.logger.debug('Successfully started notifications on new characteristic');
                
                // Add event listener for notifications on the new characteristic
                this.rxCharacteristic.addEventListener('characteristicvaluechanged', 
                  (event) => this.handleIncomingData(event));
                
                // Try to enable GGA messages again with the new characteristic
                setTimeout(async () => {
                  try {
                    // Send specific command with this new characteristic
                    await this.sendData('$PUBX,40,GGA,1,1,1,1,1,0*5A\r\n');
                    this.logger.debug('Resent GGA enable command on new characteristic');
                  } catch (e) {
                    this.logger.warn('Failed to send command on new characteristic:', e);
                  }
                }, 500);
              } catch (notifyError) {
                this.logger.warn('Failed to start notifications on new characteristic, continuing with polling');
              }
            }
          }
        }
      }, 250); // Poll more frequently (250ms) for better responsiveness
      
      // Device is now connected
      this.isConnected = true;
      this.isConnecting = false;
      this.autoReconnect = options.autoReconnect || false;
      
      // Nordic UART commands - specifically for SparkFun device
      // Since we know we're already receiving GSA sentences, we'll just try to enable GGA
      setTimeout(async () => {
        try {
          this.logger.debug('Sending NMEA configuration commands for Nordic UART (SparkFun)...');
          
          // First wait a full 2 seconds for the device to stabilize its connection
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          this.logger.debug('Connection stabilized, beginning command sequence');
          
          // First send some line breaks to wake it up - important for some modules
          await this.sendData('\r\n\r\n');
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Send reset command - try to start from a clean state
          // This will revert settings to defaults but ensure consistent behavior
          await this.sendData('$PUBX,40,ZDA,0,0,0,0,0,0*45\r\n');
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Send the configuration commands in the exact order used by other applications
          // GGA sentence - position data (must be first and with higher rate)
          await this.sendData('$PUBX,40,GGA,0,1,0,0,0,0*5A\r\n');
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // GGA sentence again with different parameters - matches working app's sequence
          await this.sendData('$PUBX,40,GGA,1,1,1,1,1,0*5A\r\n');
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // RMC sentence - minimum navigation info
          await this.sendData('$PUBX,40,RMC,1,1,1,1,1,0*47\r\n');
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // GSA sentence - satellite data
          await this.sendData('$PUBX,40,GSA,1,1,1,1,1,0*4E\r\n');
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // GST sentence - error statistics 
          await this.sendData('$PUBX,40,GST,1,1,1,1,1,0*5B\r\n');
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // VTG sentence - course and speed
          await this.sendData('$PUBX,40,VTG,1,1,1,1,1,0*5E\r\n');
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Save configuration to persist changes
          await this.sendData('$PUBX,00*33\r\n');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Query current configuration to trigger response
          await this.sendData('$PUBX,00*33\r\n');
          await new Promise(resolve => setTimeout(resolve, 300));
          
          this.logger.debug('Complete NMEA configuration commands sent');
        } catch (e) {
          this.logger.warn('Error sending NMEA configuration - device may be in read-only mode:', e);
          this.logger.debug('Continuing with available data');
        }
      }, 1000);
      
      this.eventEmitter.emit('bluetooth:connected', {
        deviceId: this.device.id,
        deviceName: this.device.name,
        type: 'sparkfun'
      });
      
      // Also emit generic connection event for the connection manager
      this.eventEmitter.emit('device:connected', {
        method: 'bluetooth',
        deviceId: this.device.id,
        deviceName: this.device.name,
        deviceType: 'sparkfun'
      });
      
      return true;
    } catch (error) {
      this.isConnecting = false;
      this.eventEmitter.emit('bluetooth:error', {
        message: error.message,
        error,
        type: 'sparkfun'
      });
      
      return false;
    }
  }

  /**
   * Get information about the connected device
   * @returns {Object} - Device information
   */
  getDeviceInfo() {
    if (!this.isConnected) {
      return null;
    }
    
    return {
      type: 'bluetooth',
      id: this.device?.id,
      name: this.device?.name
    };
  }
}

export default BluetoothConnectionHandler;