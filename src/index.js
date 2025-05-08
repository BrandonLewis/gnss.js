/**
 * GNSS Module - Main entry point
 * 
 * This module provides a JavaScript interface for connecting to GNSS RTK rovers
 * via Web Bluetooth or Web Serial, parsing NMEA data, and managing NTRIP correction data.
 */
import { EventEmitter } from './event-emitter.js';
import { BluetoothConnection } from './bluetooth.js'; 
import { NmeaParser } from './nmea-parser.js';
import { NtripClient } from './ntrip-client.js';
import { Settings } from './settings.js';
import { ConnectionManager } from './connection/connection-manager.js';
import { BluetoothHandler } from './connection/bluetooth-handler.js';
import { SerialHandler } from './connection/serial-handler.js';
import { RtkSettings } from './ui/rtk-settings.js'; 
import { RtkStatus } from './ui/rtk-status.js';
import { DeviceSettings } from './ui/device-settings.js';

/**
 * Main GNSS Module class
 * Manages device connections, NMEA parsing, and NTRIP client
 */
class GnssModule {
  /**
   * Create a new GNSS module instance
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    // Initialize event system
    this.events = new EventEmitter();
    
    // Initialize settings
    this.settings = new Settings(options.settings);
    
    // Initialize other properties
    this.debugSettings = options.debugSettings || {
      info: false,
      debug: false,
      errors: true,
      parsedSentences: false,
      rtcmMessages: false
    };
    
    // Initialize connection manager
    this.connectionManager = new ConnectionManager(this.events, {
      debug: this.debugSettings,
      settings: this.settings
    });
    
    // Create and register connection handlers
    this.bluetoothHandler = new BluetoothHandler(this.events, {
      debug: this.debugSettings
    });
    this.serialHandler = new SerialHandler(this.events, {
      debug: this.debugSettings
    });
    
    // Register connection handlers with the connection manager
    this.connectionManager.registerConnectionMethod(this.bluetoothHandler);
    this.connectionManager.registerConnectionMethod(this.serialHandler);
    
    // Initialize NMEA parser
    this.nmeaParser = new NmeaParser({
      events: this.events
    });
    
    // Initialize NTRIP client
    this.ntripClient = new NtripClient({
      events: this.events,
      settings: this.settings
    });
    
    // Initialize UI components if enabled
    if (options.ui !== false) {
      this.rtkSettings = new RtkSettings({
        events: this.events,
        settings: this.settings,
        selector: options.rtkSettingsSelector
      });
      
      this.rtkStatus = new RtkStatus({
        events: this.events,
        selector: options.rtkStatusSelector
      });
      
      this.deviceSettings = new DeviceSettings({
        events: this.events,
        settings: this.settings,
        selector: options.deviceSettingsSelector
      });
    }
    
    // Last known position
    this.currentPosition = null;
    
    // Setup internal event listeners
    this._setupEventListeners();
  }
  
  /**
   * Set up internal event listeners
   * @private
   */
  _setupEventListeners() {
    // Listen for position updates from NMEA parser
    this.events.on('nmea:position', (position) => {
      this.currentPosition = position;
      this.events.emit('position', position);
    });
    
    // Listen for satellite updates from NMEA parser
    this.events.on('nmea:satellites', (satellites) => {
      this.satellites = satellites;
      this.events.emit('satellites', satellites);
    });
    
    // Forward RTCM data to device when connected
    this.events.on('ntrip:rtcm', (rtcmData) => {
      if (this.connectionManager.isConnected()) {
        this.connectionManager.sendData(rtcmData.data);
      }
    });
    
    // Handle device settings application request
    this.events.on('device:apply:settings', (settings) => {
      this.configureDevice(settings);
    });
  }
  
  /**
   * Connect to a GNSS device using available methods
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>} Connection success
   */
  async connectDevice(options = {}) {
    try {
      const connected = await this.connectionManager.connect(options);
      
      if (connected) {
        // Setup data flow from device to NMEA parser
        // We need to listen for both generic and specific device data events
        this.events.on('device:data', (data) => {
          this.nmeaParser.parse(data);
        });
        
        // Also listen for bluetooth-specific data
        this.events.on('bluetooth:data', (data) => {
          this.nmeaParser.parse(data);
        });
        
        // Also listen for serial-specific data
        this.events.on('serial:data', (data) => {
          this.nmeaParser.parse(data);
        });
      }
      
      return connected;
    } catch (error) {
      this.events.emit('connection:error', { message: error.message });
      return false;
    }
  }
  
  /**
   * Connect specifically via Bluetooth
   * @param {Object} options - Bluetooth connection options
   * @returns {Promise<boolean>} Connection success
   */
  async connectBluetooth(options = {}) {
    try {
      // Important: This must be called directly in response to a user gesture
      // Create the options for requestDevice
      const requestOptions = {
        acceptAllDevices: !options.filters,
        filters: options.filters || [],
        optionalServices: [
          // Common UART services
          '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
          '0000ffe0-0000-1000-8000-00805f9b34fb', // Nordic UART Service (alternate)
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // HM-10/HM-16/HM-17 Service
          '0000fff0-0000-1000-8000-00805f9b34fb', // HC-08/HC-10 Service
          
          // Generic services
          '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
          '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
          
          // SparkFun specific
          '0000fe9a-0000-1000-8000-00805f9b34fb',  // Custom service
          
          // Classic Bluetooth services
          '00001101-0000-1000-8000-00805f9b34fb', // SPP
        ]
      };
      
      // Request device directly (this must happen in direct response to user gesture)
      const device = await navigator.bluetooth.requestDevice(requestOptions);
      
      // Now pass the selected device to the connection manager
      return this.connectDevice({ 
        ...options,
        method: 'bluetooth',
        deviceObj: device // Pass the selected device object
      });
    } catch (error) {
      // Handle the case where user cancels the dialog
      if (error.name === 'NotFoundError') {
        this.events.emit('connection:error', { message: 'No device selected' });
        return false;
      }
      
      this.events.emit('connection:error', { message: error.message });
      return false;
    }
  }
  
  /**
   * Connect specifically via Serial
   * @param {Object} options - Serial connection options
   * @returns {Promise<boolean>} Connection success
   */
  async connectSerial(options = {}) {
    return this.connectDevice({ 
      ...options,
      method: 'serial'
    });
  }
  
  /**
   * Connect to NTRIP caster
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>} Connection success
   */
  async connectNtrip(options = {}) {
    try {
      return await this.ntripClient.connect({
        ...options,
        position: this.currentPosition
      });
    } catch (error) {
      this.events.emit('ntrip:error', { message: error.message });
      return false;
    }
  }
  
  /**
   * Disconnect from device
   * @returns {Promise<void>}
   */
  async disconnectDevice() {
    return this.connectionManager.disconnect();
  }
  
  /**
   * Disconnect from NTRIP
   * @returns {Promise<void>}
   */
  async disconnectNtrip() {
    return this.ntripClient.disconnect();
  }
  
  /**
   * Get current position
   * @returns {Object|null} Current position
   */
  getPosition() {
    return this.currentPosition;
  }
  
  /**
   * Get satellite information
   * @returns {Array|null} Satellite information
   */
  getSatellites() {
    return this.satellites || [];
  }
  
  /**
   * Get the settings manager
   * @returns {Settings} Settings manager
   */
  getSettings() {
    return this.settings;
  }
  
  /**
   * Configure the device with specified settings
   * @param {Object} settings - Device settings to apply
   * @returns {Promise<boolean>} Success flag
   */
  async configureDevice(settings = {}) {
    try {
      // Check if connected
      if (!this.connectionManager.isConnected()) {
        this.events.emit('device:error', { message: 'Not connected to any device' });
        return false;
      }
      
      // If no settings provided, use saved device settings
      const deviceSettings = settings.gnssSystems ? 
        settings : 
        this.settings.getSection('device');
      
      // Emit event before applying settings
      this.events.emit('device:configuring', { settings: deviceSettings });
      
      // Currently this is a placeholder - in a real implementation, 
      // you would send configuration commands to the device
      // For example, with u-blox devices, you'd send UBX configuration messages
      
      // For now, we'll just simulate a successful configuration
      setTimeout(() => {
        this.events.emit('device:configured', { 
          settings: deviceSettings,
          success: true
        });
      }, 1000);
      
      return true;
    } catch (error) {
      this.events.emit('device:error', { 
        message: 'Error configuring device',
        error
      });
      return false;
    }
  }
  
  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    return this.events.on(event, callback);
  }
  
  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    this.events.off(event, callback);
  }
}

// Export the main module class
export { GnssModule };

// Export other classes for extensibility
export { EventEmitter };
export { BluetoothConnection };
export { NmeaParser };
export { NtripClient };
export { Settings };
export { ConnectionManager };
export { BluetoothHandler };
export { SerialHandler };
export { RtkSettings };
export { RtkStatus };
export { DeviceSettings };

// Export default GnssModule for backward compatibility
export default GnssModule;