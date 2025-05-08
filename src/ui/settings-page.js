/**
 * SettingsPage - UI component for configuring GNSS module settings
 */
class SettingsPage {
  constructor(gnssModule, containerId) {
    this.gnssModule = gnssModule;
    this.containerId = containerId;
    this.container = null;
    this.activeTab = 'bluetooth';
    
    // Initialize after DOM is loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  /**
   * Initialize the settings page
   */
  init() {
    this.container = document.getElementById(this.containerId);
    
    if (!this.container) {
      console.error(`Container with ID '${this.containerId}' not found`);
      return;
    }
    
    this.render();
    this.attachEventListeners();
  }

  /**
   * Render the settings page
   */
  render() {
    this.container.innerHTML = `
      <div class="gnss-settings">
        <div class="gnss-settings-tabs">
          <button class="tab-button active" data-tab="bluetooth">Bluetooth</button>
          <button class="tab-button" data-tab="ntrip">NTRIP</button>
          <button class="tab-button" data-tab="rover">Rover</button>
          <button class="tab-button" data-tab="advanced">Advanced</button>
        </div>
        
        <div class="gnss-settings-content">
          <!-- Bluetooth Settings -->
          <div class="tab-content active" data-tab="bluetooth">
            <h3>Device Connection</h3>
            
            <div class="form-group">
              <label for="connection-method">Connection Method</label>
              <select id="connection-method" class="form-control">
                <option value="auto">Auto-detect (recommended)</option>
                <option value="bluetooth">Web Bluetooth</option>
                <option value="serial">Web Serial</option>
              </select>
            </div>
            
            <div id="bluetooth-settings" class="method-settings">
              <h4>Bluetooth Settings</h4>
              <div class="form-group">
                <button id="bt-connect" class="btn btn-primary">Connect via Bluetooth</button>
              </div>
            </div>
            
            <div id="serial-settings" class="method-settings" style="display: none;">
              <h4>Serial Settings</h4>
              <div class="form-group">
                <label for="serial-baud">Baud Rate</label>
                <select id="serial-baud" class="form-control">
                  <option value="9600">9600</option>
                  <option value="19200">19200</option>
                  <option value="38400">38400</option>
                  <option value="57600">57600</option>
                  <option value="115200">115200</option>
                </select>
              </div>
              <div class="form-group">
                <button id="serial-connect" class="btn btn-primary">Connect via Serial</button>
              </div>
            </div>
            
            <div class="form-group">
              <button id="device-disconnect" class="btn btn-danger" disabled>Disconnect</button>
            </div>
            
            <div class="form-group">
              <label>
                <input type="checkbox" id="device-auto-connect">
                Auto-connect on startup
              </label>
            </div>
            
            <div class="connection-status">
              <p>Status: <span id="connection-status">Disconnected</span></p>
              <p>Method: <span id="connection-method-display">None</span></p>
              <p>Device: <span id="connection-device">None</span></p>
            </div>
          </div>
          
          <!-- NTRIP Settings -->
          <div class="tab-content" data-tab="ntrip">
            <h3>NTRIP Configuration</h3>
            
            <div class="form-group">
              <label for="ntrip-host">Host</label>
              <input type="text" id="ntrip-host" class="form-control" placeholder="caster.example.com">
            </div>
            <div class="form-group">
              <label for="ntrip-port">Port</label>
              <input type="number" id="ntrip-port" class="form-control" value="2101">
            </div>
            <div class="form-group">
              <label for="ntrip-mountpoint">Mountpoint</label>
              <input type="text" id="ntrip-mountpoint" class="form-control" placeholder="MOUNT1">
            </div>
            <div class="form-group">
              <label for="ntrip-username">Username</label>
              <input type="text" id="ntrip-username" class="form-control">
            </div>
            <div class="form-group">
              <label for="ntrip-password">Password</label>
              <input type="password" id="ntrip-password" class="form-control">
            </div>
            
            <h4>Proxy Settings</h4>
            <div class="form-group">
              <label>
                <input type="checkbox" id="ntrip-use-proxy">
                Use Proxy Server
              </label>
              <p class="help-text">Enable if you're experiencing CORS issues connecting to the NTRIP caster</p>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="ntrip-auto-detect-cors" checked>
                Auto-detect CORS Issues
              </label>
              <p class="help-text">Automatically fall back to proxy if CORS issues are detected</p>
            </div>
            <div class="form-group">
              <label for="ntrip-proxy-url">Proxy URL</label>
              <input type="text" id="ntrip-proxy-url" class="form-control" placeholder="https://your-proxy-server.com/ntrip">
              <p class="help-text">URL of a proxy server that handles CORS for NTRIP connections</p>
            </div>
            
            <div class="form-group">
              <button id="ntrip-connect" class="btn btn-primary">Connect</button>
              <button id="ntrip-disconnect" class="btn btn-danger" disabled>Disconnect</button>
            </div>
            <div class="connection-status">
              <p>Status: <span id="ntrip-status">Disconnected</span></p>
              <p>Mode: <span id="ntrip-mode">-</span></p>
            </div>
          </div>
          
          <!-- Rover Settings -->
          <div class="tab-content" data-tab="rover">
            <h3>Rover Configuration</h3>
            <div class="form-group">
              <label for="rover-dynamic-model">Dynamic Model</label>
              <select id="rover-dynamic-model" class="form-control">
                <option value="portable">Portable</option>
                <option value="stationary">Stationary</option>
                <option value="pedestrian">Pedestrian</option>
                <option value="automotive">Automotive</option>
                <option value="sea">Sea</option>
                <option value="airborne-1g">Airborne (&lt;1g)</option>
                <option value="airborne-2g">Airborne (&lt;2g)</option>
                <option value="airborne-4g">Airborne (&lt;4g)</option>
                <option value="wrist">Wrist</option>
                <option value="bike">Bike</option>
              </select>
            </div>
            <div class="form-group">
              <label for="rover-message-rate">Message Rate (Hz)</label>
              <select id="rover-message-rate" class="form-control">
                <option value="1">1 Hz</option>
                <option value="4">4 Hz</option>
                <option value="10">10 Hz</option>
                <option value="20">20 Hz</option>
              </select>
            </div>
            <div class="form-group">
              <button id="rover-apply" class="btn btn-primary">Apply Settings</button>
            </div>
          </div>
          
          <!-- Advanced Settings -->
          <div class="tab-content" data-tab="advanced">
            <h3>Advanced Settings</h3>
            <div class="form-group">
              <label>
                <input type="checkbox" id="adv-debug-mode">
                Enable Debug Mode
              </label>
            </div>
            <div class="form-group">
              <label for="adv-coordinate-format">Coordinate Format</label>
              <select id="adv-coordinate-format" class="form-control">
                <option value="dd">Decimal Degrees</option>
                <option value="dms">Degrees Minutes Seconds</option>
                <option value="utm">UTM</option>
              </select>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="adv-auto-send-gga">
                Auto-send GGA to NTRIP caster
              </label>
            </div>
            <div class="form-group">
              <label for="adv-gga-interval">GGA Update Interval (seconds)</label>
              <select id="adv-gga-interval" class="form-control">
                <option value="1">1 second</option>
                <option value="5">5 seconds</option>
                <option value="10">10 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">60 seconds</option>
              </select>
            </div>
            <div class="form-group">
              <button id="adv-reset" class="btn btn-danger">Reset All Settings</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Add basic CSS if not already added
    if (!document.getElementById('gnss-settings-css')) {
      const style = document.createElement('style');
      style.id = 'gnss-settings-css';
      style.textContent = `
        .gnss-settings {
          font-family: sans-serif;
          max-width: 800px;
          margin: 0 auto;
        }
        
        .gnss-settings-tabs {
          display: flex;
          border-bottom: 1px solid #ccc;
          margin-bottom: 20px;
        }
        
        .tab-button {
          padding: 10px 15px;
          background: none;
          border: none;
          cursor: pointer;
        }
        
        .tab-button.active {
          font-weight: bold;
          border-bottom: 2px solid #0066cc;
        }
        
        .tab-content {
          display: none;
        }
        
        .tab-content.active {
          display: block;
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 5px;
        }
        
        .form-control {
          width: 100%;
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        
        .btn {
          padding: 8px 15px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .btn-primary {
          background-color: #0066cc;
          color: white;
        }
        
        .btn-danger {
          background-color: #cc0000;
          color: white;
        }
        
        .connection-status {
          margin-top: 20px;
          padding: 10px;
          background: #f5f5f5;
          border-radius: 4px;
        }
        
        .help-text {
          font-size: 0.8em;
          color: #666;
          margin-top: 2px;
          margin-bottom: 10px;
        }
        
        h4 {
          margin-top: 20px;
          margin-bottom: 10px;
          border-bottom: 1px solid #eee;
          padding-bottom: 5px;
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Attach event listeners to UI elements
   */
  attachEventListeners() {
    // Tab switching
    const tabButtons = this.container.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tab = button.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });
    
    // Connection method selection
    const connectionMethod = this.container.querySelector('#connection-method');
    const bluetoothSettings = this.container.querySelector('#bluetooth-settings');
    const serialSettings = this.container.querySelector('#serial-settings');
    
    if (connectionMethod) {
      connectionMethod.addEventListener('change', () => {
        const method = connectionMethod.value;
        // Save to settings
        this.gnssModule.settings.set('connection', 'preferredMethod', method);
        
        // Show/hide method-specific settings
        if (method === 'bluetooth' || method === 'auto') {
          if (bluetoothSettings) bluetoothSettings.style.display = 'block';
        } else {
          if (bluetoothSettings) bluetoothSettings.style.display = 'none';
        }
        
        if (method === 'serial') {
          if (serialSettings) serialSettings.style.display = 'block';
        } else {
          if (serialSettings) serialSettings.style.display = 'none';
        }
      });
    }
    
    // Bluetooth connection
    const btConnect = this.container.querySelector('#bt-connect');
    if (btConnect) {
      btConnect.addEventListener('click', () => this.connectBluetooth());
    }
    
    // Serial connection
    const serialConnect = this.container.querySelector('#serial-connect');
    const serialBaud = this.container.querySelector('#serial-baud');
    
    if (serialConnect) {
      serialConnect.addEventListener('click', () => this.connectSerial());
    }
    
    if (serialBaud) {
      serialBaud.addEventListener('change', () => {
        const baudRate = parseInt(serialBaud.value);
        this.gnssModule.settings.set('connection', 'serial', {
          ...this.gnssModule.settings.get('connection', 'serial'),
          baudRate
        });
      });
    }
    
    // Generic device disconnect
    const deviceDisconnect = this.container.querySelector('#device-disconnect');
    if (deviceDisconnect) {
      deviceDisconnect.addEventListener('click', () => this.disconnectDevice());
    }
    
    // Auto-connect setting
    const deviceAutoConnect = this.container.querySelector('#device-auto-connect');
    if (deviceAutoConnect) {
      deviceAutoConnect.addEventListener('change', () => {
        this.gnssModule.settings.set('connection', 'autoConnect', deviceAutoConnect.checked);
      });
    }
    
    // NTRIP connection
    const ntripConnect = this.container.querySelector('#ntrip-connect');
    const ntripDisconnect = this.container.querySelector('#ntrip-disconnect');
    const ntripUseProxy = this.container.querySelector('#ntrip-use-proxy');
    const ntripAutoDetectCors = this.container.querySelector('#ntrip-auto-detect-cors');
    const ntripProxyUrl = this.container.querySelector('#ntrip-proxy-url');
    
    if (ntripConnect) {
      ntripConnect.addEventListener('click', () => this.connectNtrip());
    }
    
    if (ntripDisconnect) {
      ntripDisconnect.addEventListener('click', () => this.disconnectNtrip());
    }
    
    // Proxy settings
    if (ntripUseProxy) {
      ntripUseProxy.addEventListener('change', () => {
        this.gnssModule.settings.set('ntrip', 'useProxy', ntripUseProxy.checked);
      });
    }
    
    if (ntripAutoDetectCors) {
      ntripAutoDetectCors.addEventListener('change', () => {
        this.gnssModule.settings.set('ntrip', 'autoDetectCors', ntripAutoDetectCors.checked);
      });
    }
    
    if (ntripProxyUrl) {
      ntripProxyUrl.addEventListener('change', () => {
        this.gnssModule.settings.set('ntrip', 'proxyUrl', ntripProxyUrl.value);
      });
      
      // Also add blur event to save when focus is lost
      ntripProxyUrl.addEventListener('blur', () => {
        this.gnssModule.settings.set('ntrip', 'proxyUrl', ntripProxyUrl.value);
      });
    }
    
    // Rover settings
    const roverApply = this.container.querySelector('#rover-apply');
    
    if (roverApply) {
      roverApply.addEventListener('click', () => this.applyRoverSettings());
    }
    
    // Advanced settings
    const advDebugMode = this.container.querySelector('#adv-debug-mode');
    const advReset = this.container.querySelector('#adv-reset');
    const advAutoSendGga = this.container.querySelector('#adv-auto-send-gga');
    const advGgaInterval = this.container.querySelector('#adv-gga-interval');
    
    if (advDebugMode) {
      advDebugMode.addEventListener('change', () => {
        this.gnssModule.settings.set('ui', 'showDebugInfo', advDebugMode.checked);
        this.gnssModule.events.setDebug(advDebugMode.checked);
      });
    }
    
    if (advAutoSendGga) {
      advAutoSendGga.addEventListener('change', () => {
        this.gnssModule.settings.set('ntrip', 'autoSendGga', advAutoSendGga.checked);
      });
    }
    
    if (advGgaInterval) {
      advGgaInterval.addEventListener('change', () => {
        const seconds = parseInt(advGgaInterval.value);
        this.gnssModule.settings.set('ntrip', 'ggaUpdateInterval', seconds);
        
        // Update the NTRIP client if it exists
        if (this.gnssModule.ntripClient) {
          this.gnssModule.ntripClient.setGgaUpdateInterval(seconds);
        }
      });
    }
    
    if (advReset) {
      advReset.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all settings? This cannot be undone.')) {
          this.gnssModule.settings.reset().then(() => {
            this.loadSettings();
          });
        }
      });
    }
    
    // Load current settings
    this.loadSettings();
    
    // Set up event listeners for gnssModule events
    this.setupModuleEventListeners();
  }

  /**
   * Switch between settings tabs
   * @param {string} tab - Tab name
   */
  switchTab(tab) {
    // Update active tab button
    const tabButtons = this.container.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      if (button.getAttribute('data-tab') === tab) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
    
    // Update active tab content
    const tabContents = this.container.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
      if (content.getAttribute('data-tab') === tab) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
    
    this.activeTab = tab;
  }

  /**
   * Load current settings into UI
   */
  async loadSettings() {
    // Wait for settings to be loaded
    await this.gnssModule.settings.loadSettings();
    
    // Connection settings
    const connectionMethod = this.container.querySelector('#connection-method');
    const bluetoothSettings = this.container.querySelector('#bluetooth-settings');
    const serialSettings = this.container.querySelector('#serial-settings');
    const deviceAutoConnect = this.container.querySelector('#device-auto-connect');
    const serialBaud = this.container.querySelector('#serial-baud');
    
    // Set preferred connection method
    if (connectionMethod) {
      connectionMethod.value = this.gnssModule.settings.get('connection', 'preferredMethod') || 'auto';
      
      // Show/hide method-specific settings based on selected method
      const method = connectionMethod.value;
      if (method === 'bluetooth' || method === 'auto') {
        if (bluetoothSettings) bluetoothSettings.style.display = 'block';
      } else {
        if (bluetoothSettings) bluetoothSettings.style.display = 'none';
      }
      
      if (method === 'serial') {
        if (serialSettings) serialSettings.style.display = 'block';
      } else {
        if (serialSettings) serialSettings.style.display = 'none';
      }
    }
    
    // Set auto-connect setting
    if (deviceAutoConnect) {
      deviceAutoConnect.checked = this.gnssModule.settings.get('connection', 'autoConnect') || 
                                 this.gnssModule.settings.get('bluetooth', 'autoConnect') || 
                                 false;
    }
    
    // Set serial baud rate
    if (serialBaud) {
      const serialSettings = this.gnssModule.settings.get('connection', 'serial') || {};
      serialBaud.value = serialSettings.baudRate || 9600;
    }
    
    // NTRIP settings
    const ntripSettings = this.gnssModule.settings.getSection('ntrip');
    const ntripHost = this.container.querySelector('#ntrip-host');
    const ntripPort = this.container.querySelector('#ntrip-port');
    const ntripMountpoint = this.container.querySelector('#ntrip-mountpoint');
    const ntripUsername = this.container.querySelector('#ntrip-username');
    const ntripPassword = this.container.querySelector('#ntrip-password');
    const ntripUseProxy = this.container.querySelector('#ntrip-use-proxy');
    const ntripAutoDetectCors = this.container.querySelector('#ntrip-auto-detect-cors');
    const ntripProxyUrl = this.container.querySelector('#ntrip-proxy-url');
    
    // Basic settings
    if (ntripHost) ntripHost.value = ntripSettings.host || '';
    if (ntripPort) ntripPort.value = ntripSettings.port || 2101;
    if (ntripMountpoint) ntripMountpoint.value = ntripSettings.mountpoint || '';
    if (ntripUsername) ntripUsername.value = ntripSettings.username || '';
    if (ntripPassword) ntripPassword.value = ntripSettings.password || '';
    
    // Proxy settings
    if (ntripUseProxy) ntripUseProxy.checked = ntripSettings.useProxy || false;
    if (ntripAutoDetectCors) ntripAutoDetectCors.checked = ntripSettings.autoDetectCors !== false; // Default to true
    if (ntripProxyUrl) ntripProxyUrl.value = ntripSettings.proxyUrl || 'http://localhost:3000';
    
    // Rover settings
    const roverSettings = this.gnssModule.settings.getSection('rover');
    const roverDynamicModel = this.container.querySelector('#rover-dynamic-model');
    const roverMessageRate = this.container.querySelector('#rover-message-rate');
    
    if (roverDynamicModel) roverDynamicModel.value = roverSettings.dynamicModel || 'pedestrian';
    if (roverMessageRate) roverMessageRate.value = roverSettings.messageRate || 1;
    
    // Advanced settings
    const uiSettings = this.gnssModule.settings.getSection('ui');
    // const ntripSettings = this.gnssModule.settings.getSection('ntrip');
    const advDebugMode = this.container.querySelector('#adv-debug-mode');
    const advCoordinateFormat = this.container.querySelector('#adv-coordinate-format');
    const advAutoSendGga = this.container.querySelector('#adv-auto-send-gga');
    const advGgaInterval = this.container.querySelector('#adv-gga-interval');
    
    if (advDebugMode) advDebugMode.checked = uiSettings.showDebugInfo || false;
    if (advCoordinateFormat) advCoordinateFormat.value = uiSettings.coordinateFormat || 'dd';
    if (advAutoSendGga) advAutoSendGga.checked = ntripSettings.autoSendGga || false;
    if (advGgaInterval) advGgaInterval.value = ntripSettings.ggaUpdateInterval || 10;
  }

  /**
   * Connect to device via Bluetooth
   */
  async connectBluetooth() {
    const btConnect = this.container.querySelector('#bt-connect');
    const deviceDisconnect = this.container.querySelector('#device-disconnect');
    const connectionStatus = this.container.querySelector('#connection-status');
    const connectionMethodDisplay = this.container.querySelector('#connection-method-display');
    
    if (btConnect) btConnect.disabled = true;
    if (connectionStatus) connectionStatus.textContent = 'Connecting...';
    if (connectionMethodDisplay) connectionMethodDisplay.textContent = 'Bluetooth';
    
    const success = await this.gnssModule.connectDevice({
      method: 'bluetooth'
    });
    
    if (btConnect) btConnect.disabled = !success;
    if (deviceDisconnect) deviceDisconnect.disabled = !success;
  }
  
  /**
   * Connect to device via Serial
   */
  async connectSerial() {
    const serialConnect = this.container.querySelector('#serial-connect');
    const serialBaud = this.container.querySelector('#serial-baud');
    const deviceDisconnect = this.container.querySelector('#device-disconnect');
    const connectionStatus = this.container.querySelector('#connection-status');
    const connectionMethodDisplay = this.container.querySelector('#connection-method-display');
    
    if (serialConnect) serialConnect.disabled = true;
    if (connectionStatus) connectionStatus.textContent = 'Connecting...';
    if (connectionMethodDisplay) connectionMethodDisplay.textContent = 'Serial';
    
    // Get baud rate
    const baudRate = serialBaud ? parseInt(serialBaud.value) : 9600;
    
    const success = await this.gnssModule.connectDevice({
      method: 'serial',
      serial: {
        baudRate
      }
    });
    
    if (serialConnect) serialConnect.disabled = !success;
    if (deviceDisconnect) deviceDisconnect.disabled = !success;
  }

  /**
   * Disconnect from device
   */
  async disconnectDevice() {
    const btConnect = this.container.querySelector('#bt-connect');
    const serialConnect = this.container.querySelector('#serial-connect');
    const deviceDisconnect = this.container.querySelector('#device-disconnect');
    
    if (deviceDisconnect) deviceDisconnect.disabled = true;
    
    await this.gnssModule.disconnectDevice();
    
    if (btConnect) btConnect.disabled = false;
    if (serialConnect) serialConnect.disabled = false;
    if (deviceDisconnect) deviceDisconnect.disabled = true;
  }

  /**
   * Connect to NTRIP caster
   */
  async connectNtrip() {
    // Get NTRIP connection settings
    const ntripHost = this.container.querySelector('#ntrip-host').value;
    const ntripPort = parseInt(this.container.querySelector('#ntrip-port').value);
    const ntripMountpoint = this.container.querySelector('#ntrip-mountpoint').value;
    const ntripUsername = this.container.querySelector('#ntrip-username').value;
    const ntripPassword = this.container.querySelector('#ntrip-password').value;
    
    // Get proxy settings
    const ntripUseProxy = this.container.querySelector('#ntrip-use-proxy').checked;
    const ntripAutoDetectCors = this.container.querySelector('#ntrip-auto-detect-cors').checked;
    const ntripProxyUrl = this.container.querySelector('#ntrip-proxy-url').value;
    
    // Get UI elements
    const ntripConnect = this.container.querySelector('#ntrip-connect');
    const ntripDisconnect = this.container.querySelector('#ntrip-disconnect');
    const ntripStatus = this.container.querySelector('#ntrip-status');
    const ntripMode = this.container.querySelector('#ntrip-mode');
    
    // Save all settings
    await this.gnssModule.settings.update('ntrip', {
      host: ntripHost,
      port: ntripPort,
      mountpoint: ntripMountpoint,
      username: ntripUsername,
      password: ntripPassword,
      useProxy: ntripUseProxy,
      autoDetectCors: ntripAutoDetectCors,
      proxyUrl: ntripProxyUrl
    });
    
    // Update UI
    if (ntripConnect) ntripConnect.disabled = true;
    if (ntripStatus) ntripStatus.textContent = 'Connecting...';
    if (ntripMode) ntripMode.textContent = ntripUseProxy ? 'Proxy' : 'Direct (with auto-fallback)';
    
    // Attempt connection
    const success = await this.gnssModule.connectNtrip();
    
    // Update UI after connection attempt
    if (ntripConnect) ntripConnect.disabled = !success;
    if (ntripDisconnect) ntripDisconnect.disabled = !success;
    
    // Mode will be updated by the NTRIP event listeners
  }

  /**
   * Disconnect from NTRIP caster
   */
  async disconnectNtrip() {
    const ntripConnect = this.container.querySelector('#ntrip-connect');
    const ntripDisconnect = this.container.querySelector('#ntrip-disconnect');
    
    if (ntripDisconnect) ntripDisconnect.disabled = true;
    
    await this.gnssModule.disconnectNtrip();
    
    if (ntripConnect) ntripConnect.disabled = false;
    if (ntripDisconnect) ntripDisconnect.disabled = true;
  }

  /**
   * Apply rover settings
   */
  async applyRoverSettings() {
    const dynamicModel = this.container.querySelector('#rover-dynamic-model').value;
    const messageRate = parseInt(this.container.querySelector('#rover-message-rate').value);
    
    // Save settings
    await this.gnssModule.settings.update('rover', {
      dynamicModel,
      messageRate
    });
    
    // Apply settings to rover
    await this.gnssModule.configureRover({
      dynamicModel,
      messageRate
    });
    
    alert('Rover settings applied successfully');
  }

  /**
   * Set up event listeners for gnssModule events
   */
  setupModuleEventListeners() {
    // Generic connection events
    this.gnssModule.events.on('connection:connected', (data) => {
      const connectionStatus = this.container.querySelector('#connection-status');
      const connectionMethodDisplay = this.container.querySelector('#connection-method-display');
      const connectionDevice = this.container.querySelector('#connection-device');
      const btConnect = this.container.querySelector('#bt-connect');
      const serialConnect = this.container.querySelector('#serial-connect');
      const deviceDisconnect = this.container.querySelector('#device-disconnect');
      
      if (connectionStatus) connectionStatus.textContent = 'Connected';
      if (connectionMethodDisplay) connectionMethodDisplay.textContent = data.method || 'Unknown';
      if (connectionDevice) {
        const deviceInfo = data.deviceInfo || {};
        connectionDevice.textContent = deviceInfo.name || deviceInfo.id || 'Unknown';
      }
      
      // Disable connect buttons and enable disconnect
      if (btConnect) btConnect.disabled = true;
      if (serialConnect) serialConnect.disabled = true;
      if (deviceDisconnect) deviceDisconnect.disabled = false;
    });
    
    this.gnssModule.events.on('connection:disconnected', () => {
      const connectionStatus = this.container.querySelector('#connection-status');
      const connectionMethodDisplay = this.container.querySelector('#connection-method-display');
      const connectionDevice = this.container.querySelector('#connection-device');
      const btConnect = this.container.querySelector('#bt-connect');
      const serialConnect = this.container.querySelector('#serial-connect');
      const deviceDisconnect = this.container.querySelector('#device-disconnect');
      
      if (connectionStatus) connectionStatus.textContent = 'Disconnected';
      if (connectionMethodDisplay) connectionMethodDisplay.textContent = 'None';
      if (connectionDevice) connectionDevice.textContent = 'None';
      
      // Enable connect buttons and disable disconnect
      if (btConnect) btConnect.disabled = false;
      if (serialConnect) serialConnect.disabled = false;
      if (deviceDisconnect) deviceDisconnect.disabled = true;
    });
    
    this.gnssModule.events.on('connection:error', (data) => {
      const connectionStatus = this.container.querySelector('#connection-status');
      const btConnect = this.container.querySelector('#bt-connect');
      const serialConnect = this.container.querySelector('#serial-connect');
      
      if (connectionStatus) connectionStatus.textContent = `Error: ${data.message}`;
      if (btConnect) btConnect.disabled = false;
      if (serialConnect) serialConnect.disabled = false;
      
      console.error('Connection error:', data.error);
    });
    
    // Also listen to Bluetooth-specific events for backward compatibility
    this.gnssModule.events.on('bluetooth:connected', (data) => {
      const connectionStatus = this.container.querySelector('#connection-status');
      const connectionMethodDisplay = this.container.querySelector('#connection-method-display');
      const connectionDevice = this.container.querySelector('#connection-device');
      const btConnect = this.container.querySelector('#bt-connect');
      const serialConnect = this.container.querySelector('#serial-connect');
      const deviceDisconnect = this.container.querySelector('#device-disconnect');
      
      if (connectionStatus) connectionStatus.textContent = 'Connected';
      if (connectionMethodDisplay) connectionMethodDisplay.textContent = 'Bluetooth';
      if (connectionDevice) connectionDevice.textContent = data.deviceName || data.deviceId || 'Unknown';
      
      if (btConnect) btConnect.disabled = true;
      if (serialConnect) serialConnect.disabled = true;
      if (deviceDisconnect) deviceDisconnect.disabled = false;
    });
    
    // Serial-specific events
    this.gnssModule.events.on('serial:connected', (data) => {
      const connectionStatus = this.container.querySelector('#connection-status');
      const connectionMethodDisplay = this.container.querySelector('#connection-method-display');
      const connectionDevice = this.container.querySelector('#connection-device');
      const btConnect = this.container.querySelector('#bt-connect');
      const serialConnect = this.container.querySelector('#serial-connect');
      const deviceDisconnect = this.container.querySelector('#device-disconnect');
      
      if (connectionStatus) connectionStatus.textContent = 'Connected';
      if (connectionMethodDisplay) connectionMethodDisplay.textContent = 'Serial';
      
      // Display device info
      if (connectionDevice && data.deviceInfo) {
        const deviceInfo = data.deviceInfo;
        let displayText = 'USB Device';
        if (deviceInfo.usbVendorId) {
          displayText += ` (Vendor: 0x${deviceInfo.usbVendorId.toString(16)})`;
        }
        connectionDevice.textContent = displayText;
      }
      
      if (btConnect) btConnect.disabled = true;
      if (serialConnect) serialConnect.disabled = true;
      if (deviceDisconnect) deviceDisconnect.disabled = false;
    });
    
    // NTRIP events
    this.gnssModule.events.on('ntrip:connected', (data) => {
      const ntripStatus = this.container.querySelector('#ntrip-status');
      const ntripConnect = this.container.querySelector('#ntrip-connect');
      const ntripDisconnect = this.container.querySelector('#ntrip-disconnect');
      const ntripMode = this.container.querySelector('#ntrip-mode');
      
      if (ntripStatus) ntripStatus.textContent = 'Connected';
      if (ntripConnect) ntripConnect.disabled = true;
      if (ntripDisconnect) ntripDisconnect.disabled = false;
      
      // Show connection mode
      if (ntripMode && data.mode) {
        ntripMode.textContent = data.mode.charAt(0).toUpperCase() + data.mode.slice(1);
      }
    });
    
    this.gnssModule.events.on('ntrip:disconnected', () => {
      const ntripStatus = this.container.querySelector('#ntrip-status');
      const ntripConnect = this.container.querySelector('#ntrip-connect');
      const ntripDisconnect = this.container.querySelector('#ntrip-disconnect');
      const ntripMode = this.container.querySelector('#ntrip-mode');
      
      if (ntripStatus) ntripStatus.textContent = 'Disconnected';
      if (ntripConnect) ntripConnect.disabled = false;
      if (ntripDisconnect) ntripDisconnect.disabled = true;
      if (ntripMode) ntripMode.textContent = '-';
    });
    
    // Listen for info messages about connection mode changes
    this.gnssModule.events.on('ntrip:info', (data) => {
      const ntripMode = this.container.querySelector('#ntrip-mode');
      
      // Update mode if it's a CORS fallback message
      if (data.message && data.message.includes('CORS issue detected') && ntripMode) {
        ntripMode.textContent = 'Proxy (auto-fallback)';
      }
    });
    
    this.gnssModule.events.on('ntrip:error', (data) => {
      const ntripStatus = this.container.querySelector('#ntrip-status');
      const ntripConnect = this.container.querySelector('#ntrip-connect');
      
      if (ntripStatus) ntripStatus.textContent = `Error: ${data.message}`;
      if (ntripConnect) ntripConnect.disabled = false;
      
      console.error('NTRIP error:', data.error);
    });
  }
}

export default SettingsPage;