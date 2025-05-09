/**
 * GNSS Module - Main entry point
 * 
 * This module provides a JavaScript interface for connecting to GNSS RTK rovers
 * via Web Bluetooth or Web Serial, parsing NMEA data, and managing NTRIP correction data.
 */
import { EventEmitter } from './event-emitter.js';
import { NmeaParser } from './nmea-parser.js';
import { NtripClient } from './ntrip-client.js';
import { Settings } from './settings.js';
import { ConnectionManager } from './connection/connection-manager.js';
import { BluetoothHandler } from './connection/bluetooth-handler.js';
import { SerialHandler } from './connection/serial-handler.js';
import { RtkSettings } from './ui/rtk-settings.js'; 
import { RtkStatus } from './ui/rtk-status.js';
import { DeviceSettings } from './ui/device-settings.js';
import { EVENTS, BLE_SERVICES } from './constants.js';

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
    this.events.on(EVENTS.POSITION_UPDATE, (position) => {
      this.currentPosition = position;
      // Forward position update using the public API event name
      this.events.emit(EVENTS.POSITION, position);
    });
    
    // Listen for satellite updates from NMEA parser
    this.events.on(EVENTS.SATELLITES_UPDATE, (satellites) => {
      this.satellites = satellites;
      // Forward satellites update using the public API event name
      this.events.emit(EVENTS.SATELLITES, satellites);
    });
    
    // Forward RTCM data to device when connected
    this.events.on(EVENTS.NTRIP_DATA, (rtcmData) => {
      if (this.connectionManager.isConnected()) {
        this.connectionManager.sendData(rtcmData.data);
      }
    });
    
    // Handle device settings application request
    this.events.on(EVENTS.DEVICE_CONFIGURING, (settings) => {
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
        // Only listen for the standardized device:data event
        this.events.on(EVENTS.DATA_RECEIVED, (data) => {
          this.nmeaParser.parse(data);
        });
      }
      
      return connected;
    } catch (error) {
      this.events.emit(EVENTS.CONNECTION_ERROR, { message: error.message });
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
        optionalServices: [
          // Use service UUIDs from constants
          BLE_SERVICES.NORDIC_UART,
          BLE_SERVICES.UART_ALTERNATIVE,
          BLE_SERVICES.HM_MODULE,
          BLE_SERVICES.HC_MODULE,
          BLE_SERVICES.GENERIC_ACCESS,
          BLE_SERVICES.GENERIC_ATTRIBUTE,
          BLE_SERVICES.SPARKFUN_CUSTOM,
          BLE_SERVICES.SPP,
          BLE_SERVICES.HEART_RATE,
          BLE_SERVICES.DEVICE_INFO
        ]
      };
      
      // Cannot have both acceptAllDevices and filters
      if (!options.filters) {
        Object.assign(requestOptions, {acceptAllDevices: true});
      } else {
        Object.assign(requestOptions, {filters: options.filters});
      }
      
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
        this.events.emit(EVENTS.CONNECTION_ERROR, { message: 'No device selected' });
        return false;
      }
      
      this.events.emit(EVENTS.CONNECTION_ERROR, { message: error.message });
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
      this.events.emit(EVENTS.NTRIP_ERROR, { message: error.message });
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
export { NmeaParser };
export { NtripClient };
export { Settings };
export { ConnectionManager };
export { BluetoothHandler };
export { SerialHandler };
export { RtkSettings };
export { RtkStatus };
export { DeviceSettings };

// Export constants for advanced usage
export { EVENTS, BLE_SERVICES, BLE_CHARACTERISTICS } from './constants.js';

// Export default GnssModule as the primary entry point
export default GnssModule;