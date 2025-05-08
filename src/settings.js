/**
 * SettingsManager - Manages and persists module settings
 */
class SettingsManager {
  constructor() {
    this.dbName = 'gnss-module-db';
    this.storeName = 'settings';
    this.db = null;
    this.settings = {
      // Connection settings
      connection: {
        preferredMethod: 'auto', // 'auto', 'bluetooth', 'serial'
        lastMethod: null,        // Last successfully used method
        autoConnect: false,      // Auto-connect on startup
        connectionTimeout: 10000, // Connection timeout in milliseconds
        
        // Method-specific settings
        bluetooth: {
          lastDeviceId: null,    // ID of last connected device
          preferBLE: true,       // Prefer BLE over classic Bluetooth
          filters: []            // Device name filters
        },
        serial: {
          baudRate: 9600,        // Default baud rate
          dataBits: 8,           // Default data bits
          stopBits: 1,           // Default stop bits
          parity: 'none',        // Default parity
          flowControl: 'none',   // Default flow control
          lastPort: null         // Last used port info
        }
      },
      
      // Legacy bluetooth settings for backward compatibility
      bluetooth: {
        lastDeviceId: null,
        autoConnect: false,
        connectionTimeout: 10000, // 10 seconds
      },
      
      // NTRIP settings
      ntrip: {
        host: '',
        port: 2101,
        mountpoint: '',
        username: '',
        password: '',
        autoConnect: false,
        proxyUrl: 'http://localhost:3000',
        useProxy: false,
        autoDetectCors: true,
        ggaUpdateInterval: 10,
        autoSendGga: true,
      },
      
      // UI settings
      ui: {
        showDebugInfo: false,
        unitSystem: 'metric', // or 'imperial'
        coordinateFormat: 'dd', // decimal degrees, 'dms', or 'utm'
      },
      
      // Rover settings
      rover: {
        messageRate: 1, // Hz
        dynamicModel: 'pedestrian', // automotive, pedestrian, etc.
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
          
          // Handle backward compatibility by copying legacy bluetooth settings to new structure
          if (savedSettings.bluetooth && !savedSettings.connection) {
            this.settings.connection.bluetooth.lastDeviceId = this.settings.bluetooth.lastDeviceId;
            this.settings.connection.autoConnect = this.settings.bluetooth.autoConnect;
          }
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
    
    // Handle backward compatibility
    if (section === 'connection' && key === 'autoConnect') {
      this.settings.bluetooth.autoConnect = value;
    } else if (section === 'connection' && key === 'bluetooth') {
      if (value && value.lastDeviceId) {
        this.settings.bluetooth.lastDeviceId = value.lastDeviceId;
      }
    }
    
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
    
    // Handle backward compatibility
    if (section === 'connection' && values.autoConnect !== undefined) {
      this.settings.bluetooth.autoConnect = values.autoConnect;
    }
    
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
        preferredMethod: 'auto',
        lastMethod: null,
        autoConnect: false,
        connectionTimeout: 10000,
        
        bluetooth: {
          lastDeviceId: null,
          preferBLE: true,
          filters: []
        },
        serial: {
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          flowControl: 'none',
          lastPort: null
        }
      },
      
      bluetooth: {
        lastDeviceId: null,
        autoConnect: false,
        connectionTimeout: 10000,
      },
      
      ntrip: {
        host: '',
        port: 2101,
        mountpoint: '',
        username: '',
        password: '',
        autoConnect: false,
        proxyUrl: 'http://localhost:3000',
        useProxy: false,
        autoDetectCors: true,
        ggaUpdateInterval: 10,
        autoSendGga: true,
      },
      
      ui: {
        showDebugInfo: false,
        unitSystem: 'metric',
        coordinateFormat: 'dd',
      },
      
      rover: {
        messageRate: 1,
        dynamicModel: 'pedestrian',
      }
    };
    
    await this.saveSettings();
  }
}

export default SettingsManager;