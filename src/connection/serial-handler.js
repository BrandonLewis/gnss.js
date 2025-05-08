/**
 * SerialHandler - Implements Web Serial API connections
 */
import { ConnectionHandler } from './connection-handler.js';

export class SerialHandler extends ConnectionHandler {
  constructor(eventEmitter, options = {}) {
    super(eventEmitter, options);
    this.name = 'serial';
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readInProgress = false;
    this.writeInProgress = false;
    this.keepReading = false;
    this.dataProcessor = null;
    this.autoReconnect = false;
    this.deviceInfo = {
      usbVendorId: null,
      usbProductId: null,
      portName: null
    };
  }
  
  /**
   * Check if Web Serial API is available
   * @returns {boolean} - Whether Web Serial is available
   */
  isAvailable() {
    return typeof navigator !== 'undefined' && 
           navigator.serial !== undefined;
  }
  
  /**
   * Get priority level for serial connections
   * @param {Object} options - Connection options
   * @returns {number} - Priority level
   */
  getPriority(options = {}) {
    // Default priority (1-10 scale, higher = try first)
    let priority = 5;
    
    // Increase priority if explicitly preferred
    if (options.preferredMethod === 'serial') {
      priority += 5;
    }
    
    // Increase priority if we have a last used port
    if (options.lastPort || (options.serial && options.serial.lastPort)) {
      priority += 2;
    }
    
    // Return final priority value
    return priority;
  }
  
  /**
   * Connect to a serial device
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>} - Whether connection was successful
   */
  async connect(options = {}) {
    if (this.isConnected) {
      return true;
    }
    
    if (this.isConnecting) {
      return false;
    }
    
    this.isConnecting = true;
    this.eventEmitter.emit('serial:connecting', {});
    
    try {
      // Check if Serial API is available
      if (!this.isAvailable()) {
        throw new Error('Web Serial API is not supported in this browser');
      }
      
      // Get last port info from options
      const lastPort = options.lastPort || 
                      (options.serial && options.serial.lastPort);
      
      // Try to get existing port if we have a last one
      if (lastPort) {
        try {
          const ports = await navigator.serial.getPorts();
          this.port = ports.find(port => {
            const info = port.getInfo();
            return info.usbVendorId === lastPort.usbVendorId && 
                   info.usbProductId === lastPort.usbProductId;
          });
          
          if (this.port) {
            this.logger.info('Reconnecting to last used port');
          }
        } catch (e) {
          this.logger.warn('Failed to reuse last port:', e);
        }
      }
      
      // Request a port if we don't have one
      if (!this.port) {
        // Configure filters based on options
        const filters = [];
        
        // Add filters for known GNSS device vendors if available
        if (options.knownDevices) {
          options.knownDevices.forEach(device => {
            if (device.usbVendorId) {
              filters.push({ usbVendorId: device.usbVendorId });
            }
          });
        }
        
        // Add filters for common GNSS vendors
        // u-blox USB vendor ID
        if (!filters.some(f => f.usbVendorId === 0x1546)) {
          filters.push({ usbVendorId: 0x1546 }); // u-blox
        }
        
        // FTDI (commonly used in GPS modules)
        if (!filters.some(f => f.usbVendorId === 0x0403)) {
          filters.push({ usbVendorId: 0x0403 }); // FTDI
        }
        
        // Silicon Labs CP210x (used in many GPS modules)
        if (!filters.some(f => f.usbVendorId === 0x10C4)) {
          filters.push({ usbVendorId: 0x10C4 }); // Silicon Labs
        }
        
        // Prolific (PL2303)
        if (!filters.some(f => f.usbVendorId === 0x067B)) {
          filters.push({ usbVendorId: 0x067B }); // Prolific
        }
        
        // Determine if we should use filters or show all devices
        const useFilters = options.useSerialFilters !== false; // Default to using filters unless explicitly disabled
        
        if (useFilters) {
          this.logger.debug('Requesting serial port with filters:', filters);
        } else {
          this.logger.debug('Requesting serial port with no filters (showing all devices)');
        }
        
        // Show port picker to user
        try {
          this.port = await navigator.serial.requestPort({
            // Only apply filters if useFilters is true and we have filters
            filters: useFilters && filters.length > 0 ? filters : undefined
          });
        } catch (e) {
          if (e.name === 'NotFoundError') {
            throw new Error('No matching serial devices found');
          } else if (e.name === 'SecurityError') {
            throw new Error('Serial port access denied by user or browser');
          } else {
            throw e;
          }
        }
        
        if (!this.port) {
          throw new Error('No port selected');
        }
      }
      
      // Determine port info for later reference
      const portInfo = this.port.getInfo();
      this.deviceInfo = {
        usbVendorId: portInfo.usbVendorId,
        usbProductId: portInfo.usbProductId,
        portName: null // Not provided by the API
      };
      
      // Configure port settings
      const baudRate = options.baudRate || 
                       (options.serial && options.serial.baudRate) || 
                       9600;
      const dataBits = options.dataBits || 
                       (options.serial && options.serial.dataBits) || 
                       8;
      const stopBits = options.stopBits || 
                       (options.serial && options.serial.stopBits) || 
                       1;
      const parity = options.parity || 
                     (options.serial && options.serial.parity) || 
                     'none';
      const flowControl = options.flowControl || 
                          (options.serial && options.serial.flowControl) || 
                          'none';
      
      // Open the port
      this.logger.info(`Opening serial port with baud rate ${baudRate}`);
      await this.port.open({
        baudRate,
        dataBits,
        stopBits,
        parity,
        flowControl
      });
      
      // Start reading from the port
      this.startReading();
      
      // Configure auto-reconnect
      this.autoReconnect = options.autoReconnect || false;
      
      // Update state
      this.isConnected = true;
      this.isConnecting = false;
      
      // Emit connected event
      this.eventEmitter.emit('serial:connected', {
        deviceInfo: this.deviceInfo,
        baudRate
      });
      
      // Also emit generic connection event for the connection manager
      this.eventEmitter.emit('device:connected', {
        method: 'serial',
        deviceInfo: this.deviceInfo
      });
      
      return true;
    } catch (error) {
      this.logger.error('Serial connection error:', error);
      this.isConnecting = false;
      this.eventEmitter.emit('serial:error', {
        message: error.message,
        error
      });
      
      return false;
    }
  }
  
  /**
   * Start reading data from the serial port
   */
  async startReading() {
    if (this.readInProgress || !this.port || !this.port.readable) {
      return;
    }
    
    try {
      this.readInProgress = true;
      this.keepReading = true;
      
      // Create reader
      this.reader = this.port.readable.getReader();
      
      // Read data loop
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        
        if (done) {
          // Reader has been canceled or closed
          break;
        }
        
        if (value) {
          // Process the received data
          this.processData(value.buffer);
        }
      }
      
      // Release the reader when done
      this.reader.releaseLock();
      this.reader = null;
    } catch (error) {
      this.logger.error('Error reading from serial port:', error);
      this.handleDisconnection(error);
    } finally {
      this.readInProgress = false;
      this.reader = null;
    }
  }
  
  /**
   * Process received data
   * @param {ArrayBuffer} data - Received binary data
   */
  processData(data) {
    // For debugging
    if (this.debugSettings.debug) {
      const textDecoder = new TextDecoder('utf-8');
      const dataString = textDecoder.decode(new Uint8Array(data));
      this.logger.debug('Serial data received:', dataString);
    }
    
    // Emit raw data event
    this.eventEmitter.emit('serial:data', data);
    
    // Also emit generic data event for uniform handling
    this.eventEmitter.emit('device:data', data);
  }
  
  /**
   * Disconnect from the device
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.isConnected || !this.port) {
      return;
    }
    
    try {
      // Stop reading
      this.keepReading = false;
      
      if (this.reader) {
        try {
          await this.reader.cancel();
          this.reader = null;
        } catch (e) {
          this.logger.warn('Error canceling reader:', e);
        }
      }
      
      // Close the port
      try {
        await this.port.close();
      } catch (e) {
        this.logger.warn('Error closing port:', e);
      }
      
      // Update state
      this.isConnected = false;
      this.eventEmitter.emit('serial:disconnected', {
        deviceInfo: this.deviceInfo
      });
      
      // Also emit generic disconnection event for the connection manager
      this.eventEmitter.emit('device:disconnected', {
        method: 'serial',
        deviceInfo: this.deviceInfo
      });
    } catch (error) {
      this.logger.error('Error during disconnect:', error);
      this.eventEmitter.emit('serial:error', {
        message: 'Failed to disconnect properly',
        error
      });
    }
  }
  
  /**
   * Handle unexpected disconnection
   * @param {Error} error - Disconnection error
   */
  handleDisconnection(error) {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    
    // Clean up resources
    this.reader = null;
    this.writer = null;
    
    if (wasConnected) {
      this.eventEmitter.emit('serial:disconnected', {
        deviceInfo: this.deviceInfo,
        error
      });
      
      // Also emit generic disconnection event for the connection manager
      this.eventEmitter.emit('device:disconnected', {
        method: 'serial',
        deviceInfo: this.deviceInfo,
        error
      });
      
      // Attempt to reconnect if enabled
      if (this.autoReconnect) {
        setTimeout(() => {
          this.connect({
            lastPort: this.deviceInfo,
            autoReconnect: true
          });
        }, 2000);
      }
    }
  }
  
  /**
   * Send data to the device
   * @param {string|ArrayBuffer} data - Data to send
   * @returns {Promise<boolean>} - Whether data was sent successfully
   */
  async sendData(data) {
    if (!this.isConnected || !this.port || !this.port.writable) {
      return false;
    }
    
    try {
      // Acquire writer if we don't have one
      if (!this.writer) {
        this.writer = this.port.writable.getWriter();
      }
      
      // Convert string to ArrayBuffer if needed
      let buffer;
      if (typeof data === 'string') {
        buffer = new TextEncoder().encode(data);
      } else if (data instanceof ArrayBuffer) {
        buffer = new Uint8Array(data);
      } else {
        throw new Error('Invalid data type. Expected string or ArrayBuffer');
      }
      
      // Write data
      await this.writer.write(buffer);
      
      // Release writer for other operations
      this.writer.releaseLock();
      this.writer = null;
      
      return true;
    } catch (error) {
      this.logger.error('Error sending data:', error);
      
      // Try to release writer if we have one
      if (this.writer) {
        try {
          this.writer.releaseLock();
        } catch (e) {
          // Ignore errors releasing lock
        }
        this.writer = null;
      }
      
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
      type: 'serial',
      ...this.deviceInfo
    };
  }
}

export default SerialConnectionHandler;