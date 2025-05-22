/**
 * Settings - Manages and persists module settings
 */
import { DEFAULT_CONNECTION_SETTINGS, DEFAULT_NTRIP_SETTINGS } from './constants.js';

export class Settings {
  constructor() {
    this.dbName = 'gnss-module-db';
    this.storeName = 'settings';
    this.db = null;
    this.settings = {
      // Connection settings
      connection: {
        preferredMethod: DEFAULT_CONNECTION_SETTINGS.preferredMethod,
        lastMethod: null,
        autoConnect: false,
        connectionTimeout: DEFAULT_CONNECTION_SETTINGS.connectionTimeout,
        
        // Method-specific settings
        bluetooth: {
          lastDeviceId: null,
          preferBLE: DEFAULT_CONNECTION_SETTINGS.bluetooth.preferBLE,
          filters: []
        },
        serial: {
          baudRate: DEFAULT_CONNECTION_SETTINGS.serial.baudRate,
          dataBits: DEFAULT_CONNECTION_SETTINGS.serial.dataBits,
          stopBits: DEFAULT_CONNECTION_SETTINGS.serial.stopBits,
          parity: DEFAULT_CONNECTION_SETTINGS.serial.parity,
          flowControl: DEFAULT_CONNECTION_SETTINGS.serial.flowControl,
          lastPort: null
        }
      },
      
      // NTRIP settings
      ntrip: {
        host: '',
        port: DEFAULT_NTRIP_SETTINGS.port,
        mountpoint: '',
        username: '',
        password: '',
        autoConnect: DEFAULT_NTRIP_SETTINGS.autoConnect,
        proxyUrl: 'http://localhost:3000',
        useProxy: DEFAULT_NTRIP_SETTINGS.useProxy,
        autoDetectCors: DEFAULT_NTRIP_SETTINGS.autoDetectCors,
        ggaUpdateInterval: DEFAULT_NTRIP_SETTINGS.ggaUpdateInterval,
        autoSendGga: DEFAULT_NTRIP_SETTINGS.autoSendGga,
      },
      
      // UI settings
      ui: {
        showDebugInfo: false,
        unitSystem: 'metric', // or 'imperial'
        coordinateFormat: 'dd', // decimal degrees, 'dms', or 'utm'
      },
      
      // Rover settings
      rover: {
        messageRate: 4, // Hz
        dynamicModel: 'pedestrian', // automotive, pedestrian, etc.
        altitudeOffset: 0, // meters for altitude correction when using pole or tripod
        antennaOffset: 0, // meters for antenna offset (this is specific to the device used)
      }
    };
    
    // Initialize the database
    this.initDb();
  }

  /**
   * Initialize IndexedDB
   */
  async initDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = (event) => {
        console.error('IndexedDB error:', event);
        reject(event);
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.loadSettings().then(resolve);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Load settings from IndexedDB
   */
  async loadSettings() {
    if (!this.db) {
      return;
    }
    
    return new Promise((resolve) => {
      const transaction = this.db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get('user-settings');
      
      request.onsuccess = (event) => {
        if (event.target.result) {
          // Merge with defaults for any new settings
          const savedSettings = event.target.result.value;
          
          // Deep merge the settings
          this.deepMerge(this.settings, savedSettings);
        }
        resolve();
      };
      
      request.onerror = () => {
        resolve(); // Use defaults if error
      };
    });
  }

  /**
   * Deep merge objects (helper function)
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        // Check if the source value is an object and not null
        if (source[key] !== null && typeof source[key] === 'object' && key in target && target[key] !== null) {
          // Initialize target[key] if it's null but source[key] is an object
          if (target[key] === null) {
            target[key] = Array.isArray(source[key]) ? [] : {};
          }
          this.deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
    return target;
  }

  /**
   * Save settings to IndexedDB
   */
  async saveSettings() {
    if (!this.db) {
      return;
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put({
        id: 'user-settings',
        value: this.settings
      });
      
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event);
    });
  }

  /**
   * Get a setting value
   * @param {string} section - Settings section (connection, bluetooth, ntrip, ui, rover)
   * @param {string} key - Setting key
   * @returns {*} Setting value
   */
  get(section, key) {
    if (this.settings[section] && key in this.settings[section]) {
      return this.settings[section][key];
    }
    return null;
  }

  /**
   * Set a setting value
   * @param {string} section - Settings section
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   */
  async set(section, key, value) {
    if (!this.settings[section]) {
      this.settings[section] = {};
    }
    
    this.settings[section][key] = value;
    
    await this.saveSettings();
    return value;
  }

  /**
   * Update multiple settings at once
   * @param {string} section - Settings section
   * @param {Object} values - Object with key/value pairs
   */
  async update(section, values) {
    if (!this.settings[section]) {
      this.settings[section] = {};
    }
    
    this.settings[section] = {
      ...this.settings[section],
      ...values
    };
    
    await this.saveSettings();
    return this.settings[section];
  }

  /**
   * Get all settings for a section
   * @param {string} section - Settings section
   * @returns {Object} Section settings
   */
  getSection(section) {
    return this.settings[section] || {};
  }

  /**
   * Get all settings
   * @returns {Object} All settings
   */
  getAll() {
    return this.settings;
  }

  /**
   * Clear all settings and reset to defaults
   */
  async reset() {
    this.settings = {
      connection: {
        preferredMethod: DEFAULT_CONNECTION_SETTINGS.preferredMethod,
        lastMethod: null,
        autoConnect: false,
        connectionTimeout: DEFAULT_CONNECTION_SETTINGS.connectionTimeout,
        
        bluetooth: {
          lastDeviceId: null,
          preferBLE: DEFAULT_CONNECTION_SETTINGS.bluetooth.preferBLE,
          filters: []
        },
        serial: {
          baudRate: DEFAULT_CONNECTION_SETTINGS.serial.baudRate,
          dataBits: DEFAULT_CONNECTION_SETTINGS.serial.dataBits,
          stopBits: DEFAULT_CONNECTION_SETTINGS.serial.stopBits,
          parity: DEFAULT_CONNECTION_SETTINGS.serial.parity,
          flowControl: DEFAULT_CONNECTION_SETTINGS.serial.flowControl,
          lastPort: null
        }
      },
      
      ntrip: {
        host: '',
        port: DEFAULT_NTRIP_SETTINGS.port,
        mountpoint: '',
        username: '',
        password: '',
        autoConnect: DEFAULT_NTRIP_SETTINGS.autoConnect,
        proxyUrl: 'http://localhost:3000',
        useProxy: DEFAULT_NTRIP_SETTINGS.useProxy,
        autoDetectCors: DEFAULT_NTRIP_SETTINGS.autoDetectCors,
        ggaUpdateInterval: DEFAULT_NTRIP_SETTINGS.ggaUpdateInterval,
        autoSendGga: DEFAULT_NTRIP_SETTINGS.autoSendGga,
      },
      
      ui: {
        showDebugInfo: false,
        unitSystem: 'metric',
        coordinateFormat: 'dd',
      },
      
      rover: {
        messageRate: 4,
        dynamicModel: 'pedestrian',
        altitudeOffset: 0,
        antennaOffset: 0,
      }
    };
    
    await this.saveSettings();
  }
}

export default Settings;