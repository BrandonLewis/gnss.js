/**
 * Constants - Centralized constants for the GNSS.js library
 * 
 * This module contains all shared constants used throughout the library,
 * eliminating duplication and providing a single source of truth.
 */

/**
 * Bluetooth LE Service UUIDs
 */
export const BLE_SERVICES = {
  // Nordic UART Service (most common in BLE devices)
  NORDIC_UART: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  
  // Alternative UART Service form
  UART_ALTERNATIVE: '0000ffe0-0000-1000-8000-00805f9b34fb',
  
  // HM-10/HM-16/HM-17 BLE Module Service
  HM_MODULE: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  
  // HC-08/HC-10 BLE Service
  HC_MODULE: '0000fff0-0000-1000-8000-00805f9b34fb',
  
  // Generic BLE services
  GENERIC_ATTRIBUTE: '00001801-0000-1000-8000-00805f9b34fb',
  GENERIC_ACCESS: '00001800-0000-1000-8000-00805f9b34fb',
  
  // SparkFun RTK-specific custom service
  SPARKFUN_CUSTOM: '0000fe9a-0000-1000-8000-00805f9b34fb',
  
  // Classic Bluetooth SPP (Serial Port Profile)
  SPP: '00001101-0000-1000-8000-00805f9b34fb',
  
  // Testing/fallback services
  HEART_RATE: '0000180d-0000-1000-8000-00805f9b34fb',
  DEVICE_INFO: '0000180a-0000-1000-8000-00805f9b34fb'
};

/**
 * Bluetooth LE Characteristic UUIDs
 * Note: TX/RX naming is from the device's perspective
 * - TX: Device → Client (we receive from device)
 * - RX: Client → Device (we send to device)
 */
export const BLE_CHARACTERISTICS = {
  // Nordic UART characteristics
  NORDIC_TX: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // Device transmits to us (we receive)
  NORDIC_RX: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // Device receives from us (we transmit)
  
  // Common alternative BLE characteristic UUIDs for transmission (device → client)
  UART_TX: '0000ffe1-0000-1000-8000-00805f9b34fb',
  HC_TX: '0000fff1-0000-1000-8000-00805f9b34fb',
  HM10_TX: '49535343-8841-43f4-a8d4-ecbe34729bb3',
  SPARKFUN_TX: '0000fe9a-0002-1000-8000-00805f9b34fb',
  
  // Common alternative BLE characteristic UUIDs for reception (client → device)
  UART_RX: '0000ffe2-0000-1000-8000-00805f9b34fb',
  HC_RX: '0000fff2-0000-1000-8000-00805f9b34fb',
  HM10_RX: '49535343-1e4d-4bd9-ba61-23c647249616',
  SPARKFUN_RX: '0000fe9a-0003-1000-8000-00805f9b34fb',
  
  // Classic Bluetooth SPP characteristics
  SPP_TX: '00001103-0000-1000-8000-00805f9b34fb',
  SPP_RX: '00001102-0000-1000-8000-00805f9b34fb'
};

/**
 * NMEA Message Types
 */
export const NMEA_TYPES = {
  GGA: 'GGA', // Global Positioning System Fix Data
  GSA: 'GSA', // GNSS DOP and Active Satellites
  GSV: 'GSV', // GNSS Satellites in View
  RMC: 'RMC', // Recommended Minimum Specific GNSS Data
  VTG: 'VTG', // Course Over Ground and Ground Speed
  GST: 'GST', // GNSS Pseudorange Error Statistics
  GLL: 'GLL', // Geographic Position - Latitude/Longitude
  ZDA: 'ZDA'  // Time & Date
};

/**
 * Event Types
 * Standardized event names used throughout the library
 */
export const EVENTS = {
  // Connection events
  CONNECTING: 'device:connecting',
  CONNECTED: 'device:connected',
  DISCONNECTED: 'device:disconnected',
  CONNECTION_ERROR: 'device:connection:error',
  
  // Data events
  DATA_RECEIVED: 'device:data',
  DATA_SENT: 'device:data:sent',
  
  // NMEA parsing events
  NMEA_SENTENCE: 'nmea:sentence',
  POSITION_UPDATE: 'position:update',
  SATELLITES_UPDATE: 'satellites:update',
  
  // NTRIP events
  NTRIP_CONNECTING: 'ntrip:connecting',
  NTRIP_CONNECTED: 'ntrip:connected',
  NTRIP_DISCONNECTED: 'ntrip:disconnected',
  NTRIP_ERROR: 'ntrip:error',
  NTRIP_DATA: 'ntrip:rtcm',
  
  // Settings and configuration events
  SETTINGS_CHANGED: 'settings:changed',
  DEVICE_CONFIGURING: 'device:configuring',
  DEVICE_CONFIGURED: 'device:configured'
};

/**
 * Default connection settings
 */
export const DEFAULT_CONNECTION_SETTINGS = {
  preferredMethod: 'auto',
  connectionTimeout: 10000, // 10 seconds
  
  // Bluetooth-specific defaults
  bluetooth: {
    preferBLE: true, // Prefer BLE over classic Bluetooth
  },
  
  // Serial-specific defaults
  serial: {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none'
  }
};

/**
 * Default NTRIP settings
 */
export const DEFAULT_NTRIP_SETTINGS = {
  port: 2101,
  autoConnect: false,
  useProxy: false,
  autoDetectCors: true,
  ggaUpdateInterval: 10, // seconds
  autoSendGga: true
};

export default {
  BLE_SERVICES,
  BLE_CHARACTERISTICS,
  NMEA_TYPES,
  EVENTS,
  DEFAULT_CONNECTION_SETTINGS,
  DEFAULT_NTRIP_SETTINGS
};