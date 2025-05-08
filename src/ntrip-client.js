/**
 * NtripClient - Handles connections to NTRIP casters for RTK corrections
 * with multiple connection approaches (direct, proxy, WebSocket)
 */
class NtripClient {
  /**
   * Create a new NTRIP client
   * @param {Object} eventEmitter - Event emitter for communication
   * @param {Object} options - Configuration options
   */
  constructor(eventEmitter, options = {}) {
    this.eventEmitter = eventEmitter;
    this.debug = options.debug || {};
    this.isConnected = false;
    this.isConnecting = false;
    this.autoReconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds initial reconnect delay
    
    // Default configuration
    this.config = {
      // Basic NTRIP configuration
      casterHost: 'rtk2go.com',
      casterPort: 2101,
      mountpoint: 'RTCM3_IMAX',
      username: '',
      password: '',
      sendGga: true,
      
      // Connection options
      connectionMode: 'auto', // 'auto', 'direct', 'proxy', 'websocket'
      proxyUrl: 'http://localhost:3000',  // URL to proxy server (relative or absolute)
      websocketUrl: 'ws://localhost:3000/ws', // WebSocket endpoint
      
      // Advanced settings
      ggaUpdateInterval: 10 // Seconds between GGA updates
    };
    
    // Connection handling
    this.abortController = null;  // For direct fetch
    this.reader = null;           // For direct fetch
    this.webSocket = null;        // For WebSocket
    this.activeMode = null;       // Which connection mode is active
    
    // GGA handling
    this.ggaInterval = null;
    this.lastGga = null;  // Last GGA sentence sent
    this.lastPosition = null; // Last position data for generating GGA
    
    // RTCM statistics
    this.rtcmStats = {
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      lastMessageTime: null,
      correctionAge: null
    };
    
    // Device manager for sending corrections
    this.deviceManager = null;
    this.rtcmQueue = [];
    
    // Bind methods
    this.handleSocketMessage = this.handleSocketMessage.bind(this);
    this.handleSocketClose = this.handleSocketClose.bind(this);
    this.handleSocketError = this.handleSocketError.bind(this);
  }

  /**
   * Set the device manager for sending corrections
   * @param {Object} deviceManager - ConnectionManager or BluetoothManager
   */
  setDeviceManager(deviceManager) {
    this.deviceManager = deviceManager;
    
    // If this is a legacy BluetothManager reference, keep it for backward compatibility
    if (deviceManager && deviceManager.name === 'bluetooth') {
      this.bluetoothManager = deviceManager;
    }
  }

  /**
   * Connect to NTRIP caster using the configured method
   * @param {Object} config - Connection configuration
   * @returns {Promise<boolean>} Whether connection was successful
   */
  async connect(config = {}) {
    if (this.isConnected) {
      console.log('Already connected to NTRIP caster');
      return true;
    }
    
    if (this.isConnecting) {
      console.log('Already connecting to NTRIP caster');
      return false;
    }
    
    // Update configuration with provided options
    this.config = { 
      ...this.config, 
      ...config 
    };
    
    // Validate configuration
    console.log('Validating NTRIP config:', {
      casterHost: this.config.casterHost, 
      mountpoint: this.config.mountpoint,
      connectionMode: this.config.connectionMode
    });
    
    if (!this.config.casterHost || this.config.casterHost === '') {
      console.error('NTRIP caster host is missing or empty');
      this.eventEmitter.emit('ntrip:error', {
        message: 'Invalid NTRIP configuration. Host is required.'
      });
      return false;
    }
    
    if (!this.config.mountpoint || this.config.mountpoint === '') {
      console.error('NTRIP mountpoint is missing or empty');
      this.eventEmitter.emit('ntrip:error', {
        message: 'Invalid NTRIP configuration. Mountpoint is required.'
      });
      return false;
    }
    
    this.isConnecting = true;
    this.eventEmitter.emit('ntrip:connecting', { 
      casterHost: this.config.casterHost,
      mountpoint: this.config.mountpoint
    });
    
    // Determine connection mode
    const connectionMode = this.config.connectionMode;
    
    // Auto mode - try WebSocket first, then direct, then proxy
    if (connectionMode === 'auto') {
      // Try WebSocket first
      try {
        const wsSuccess = await this.connectWebSocket();
        if (wsSuccess) {
          this.activeMode = 'websocket';
          return true;
        }
      } catch (wsError) {
        console.log('WebSocket connection failed, falling back to direct:', wsError);
      }
      
      // Try direct connection
      try {
        const directSuccess = await this.connectDirect();
        if (directSuccess) {
          this.activeMode = 'direct';
          return true;
        }
      } catch (directError) {
        console.log('Direct connection failed, falling back to proxy:', directError);
      }
      
      // Try proxy as last resort
      try {
        const proxySuccess = await this.connectProxy();
        if (proxySuccess) {
          this.activeMode = 'proxy';
          return true;
        }
      } catch (proxyError) {
        this.isConnecting = false;
        this.eventEmitter.emit('ntrip:error', {
          message: 'All connection methods failed',
          error: proxyError
        });
        return false;
      }
    } 
    // Specific connection modes
    else if (connectionMode === 'websocket') {
      try {
        const success = await this.connectWebSocket();
        if (success) {
          this.activeMode = 'websocket';
          return true;
        }
      } catch (error) {
        this.isConnecting = false;
        this.eventEmitter.emit('ntrip:error', {
          message: 'WebSocket connection failed',
          error
        });
        return false;
      }
    }
    else if (connectionMode === 'direct') {
      try {
        const success = await this.connectDirect();
        if (success) {
          this.activeMode = 'direct';
          return true;
        }
      } catch (error) {
        this.isConnecting = false;
        this.eventEmitter.emit('ntrip:error', {
          message: 'Direct connection failed',
          error
        });
        return false;
      }
    }
    else if (connectionMode === 'proxy') {
      try {
        const success = await this.connectProxy();
        if (success) {
          this.activeMode = 'proxy';
          return true;
        }
      } catch (error) {
        this.isConnecting = false;
        this.eventEmitter.emit('ntrip:error', {
          message: 'Proxy connection failed',
          error
        });
        return false;
      }
    }
    
    // If we reach here, all connection attempts failed
    this.isConnecting = false;
    this.eventEmitter.emit('ntrip:error', {
      message: 'All connection methods failed'
    });
    return false;
  }
  
  /**
   * Connect to NTRIP caster using WebSocket to proxy
   * @returns {Promise<boolean>} Whether connection was successful
   */
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        // Determine WebSocket URL
        let wsUrl = this.config.websocketUrl;
        
        // If it's a relative URL, make it absolute
        if (wsUrl.startsWith('/')) {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${protocol}//${window.location.host}${wsUrl}`;
        }
        
        // Handle mixed content issue - enforce WSS if we're connecting from HTTPS
        if (window.location.protocol === 'https:' && 
            wsUrl.startsWith('ws:') && 
            (wsUrl.includes('192.168.') || 
             wsUrl.includes('127.0.0.1') || 
             wsUrl.includes('localhost'))) {
          console.log('Adjusting WebSocket URL protocol to match page protocol (WSS)');
          wsUrl = wsUrl.replace('ws:', 'wss:');
        }
        
        console.log(`Connecting to NTRIP via WebSocket at ${wsUrl}`, {
          casterHost: this.config.casterHost,
          mountpoint: this.config.mountpoint,
          connectionMode: this.config.connectionMode
        });
        this.webSocket = new WebSocket(wsUrl);
        
        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.webSocket && this.webSocket.readyState !== WebSocket.OPEN) {
            this.webSocket.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000); // 10 second timeout
        
        // Set up event handlers
        this.webSocket.onopen = () => {
          clearTimeout(connectionTimeout);
          
          console.log('WebSocket connected to proxy, sending NTRIP connection request');
          
          // Send connection request to proxy
          this.webSocket.send(JSON.stringify({
            command: 'connect',
            config: {
              casterHost: this.config.casterHost,
              casterPort: this.config.casterPort,
              mountpoint: this.config.mountpoint,
              username: this.config.username,
              password: this.config.password
            }
          }));
        };
        
        // Connection status handler
        this.webSocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle connection status message
            if (data.type === 'status') {
              if (data.connected) {
                // Successfully connected
                this.isConnected = true;
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                
                // Setup regular message handler
                this.webSocket.onmessage = this.handleSocketMessage;
                
                // Setup other event handlers
                this.webSocket.onclose = this.handleSocketClose;
                this.webSocket.onerror = this.handleSocketError;
                
                // Start GGA updates if enabled
                if (this.config.sendGga && this.lastGga) {
                  this.startGgaUpdates();
                }
                
                // Emit connected event
                this.eventEmitter.emit('ntrip:connected', {
                  casterHost: this.config.casterHost,
                  mountpoint: this.config.mountpoint,
                  mode: 'websocket'
                });
                
                resolve(true);
              } else {
                // Connection failed
                reject(new Error(data.message || 'WebSocket connection failed'));
              }
            } else if (data.type === 'error') {
              reject(new Error(data.message || 'WebSocket connection error'));
            }
          } catch (e) {
            // Not JSON, unexpected during connection phase
            reject(new Error('Unexpected binary data during WebSocket connection'));
          }
        };
        
        // Initial error handler just for connection phase
        this.webSocket.onerror = (error) => {
          clearTimeout(connectionTimeout);
          reject(new Error('WebSocket connection error'));
        };
        
        // Initial close handler just for connection phase
        this.webSocket.onclose = (event) => {
          clearTimeout(connectionTimeout);
          reject(new Error(`WebSocket closed: ${event.code} - ${event.reason}`));
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Connect directly to NTRIP caster
   * @returns {Promise<boolean>} Whether connection was successful
   */
  async connectDirect() {
    try {
      // Determine if we're on an HTTPS page
      const isHttpsPage = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
      
      // Create URL for NTRIP connection
      const protocol = this.config.casterPort === 443 ? 'https' : 'http';
      
      // Check for mixed content scenario - HTTPS page trying to access HTTP NTRIP caster
      if (isHttpsPage && protocol === 'http') {
        console.log('Mixed content issue detected:', {
          isHttpsPage,
          protocol,
          casterHost: this.config.casterHost,
          mountpoint: this.config.mountpoint,
          connectionMode: this.config.connectionMode
        });
        
        this.eventEmitter.emit('ntrip:info', { 
          message: 'Mixed content detected - HTTPS page trying to access HTTP NTRIP. Switching to proxy/WebSocket.'
        });
        
        // Try WebSocket first if auto mode
        if (this.config.connectionMode === 'auto' || this.config.connectionMode === 'websocket') {
          try {
            return await this.connectWebSocket();
          } catch (wsError) {
            this.eventEmitter.emit('ntrip:info', { 
              message: 'WebSocket connection failed after mixed content detection, trying proxy'
            });
          }
        }
        
        // Fall back to proxy connection instead of direct
        return await this.connectProxy();
      }
      
      const url = `${protocol}://${this.config.casterHost}:${this.config.casterPort}/${this.config.mountpoint}`;
      
      // Prepare authentication headers if needed
      const headers = new Headers({
        'Accept': 'application/octet-stream',
        'User-Agent': 'NTRIP WebGNSS Client'
      });
      
      if (this.config.username && this.config.password) {
        const auth = btoa(`${this.config.username}:${this.config.password}`);
        headers.append('Authorization', `Basic ${auth}`);
      }
      
      // Create abort controller for clean disconnection
      this.abortController = new AbortController();
      
      // Make the request
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: this.abortController.signal
      });
      
      // Check if connection was successful
      if (!response.ok) {
        throw new Error(`NTRIP server error: ${response.status} ${response.statusText}`);
      }
      
      // Get a reader for the response body
      const contentType = response.headers.get('content-type');
      
      // For debugging - log content type
      this.eventEmitter.emit('ntrip:info', { 
        message: `Direct NTRIP connection established, content type: ${contentType}`
      });
      
      // Start reading from the response stream
      this.reader = response.body.getReader();
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      
      // Emit connected event
      this.eventEmitter.emit('ntrip:connected', {
        casterHost: this.config.casterHost,
        mountpoint: this.config.mountpoint,
        mode: 'direct'
      });
      
      // If we have a GGA message or position, start sending it periodically
      if (this.config.sendGga && (this.lastGga || this.lastPosition)) {
        this.startGgaUpdates();
      }
      
      // Start processing the stream
      this.readStream();
      
      return true;
    } catch (error) {
      console.error('Direct connection error:', error);
      throw error;
    }
  }
  
  /**
   * Connect to NTRIP caster via HTTP proxy
   * @returns {Promise<boolean>} Whether connection was successful
   */
  async connectProxy() {
    try {
      // Determine proxy URL
      let proxyUrl = this.config.proxyUrl;
      
      // If it's a relative URL, make it absolute
      if (proxyUrl.startsWith('/')) {
        const protocol = window.location.protocol;
        proxyUrl = `${protocol}//${window.location.host}${proxyUrl}`;
      }
      
      // Handle mixed content issue - enforce HTTP if we're connecting to a local IP
      // This avoids HTTPS to HTTP mixed content blocking
      if (window.location.protocol === 'https:' && 
          proxyUrl.startsWith('http:') && 
          (proxyUrl.includes('192.168.') || 
           proxyUrl.includes('127.0.0.1') || 
           proxyUrl.includes('localhost'))) {
        console.log('Adjusting proxy URL protocol to match page protocol (HTTPS)');
        proxyUrl = proxyUrl.replace('http:', 'https:');
      }
      
      // Add mountpoint and parameters
      proxyUrl = `${proxyUrl}/${this.config.mountpoint}`;
      const params = new URLSearchParams({
        host: this.config.casterHost,
        port: this.config.casterPort.toString()
      });
      
      if (this.config.username && this.config.password) {
        params.append('user', this.config.username);
        params.append('password', this.config.password);
      }
      
      proxyUrl += `?${params.toString()}`;
      
      // Create abort controller for clean disconnection
      this.abortController = new AbortController();
      
      // Make the request to the proxy
      const response = await fetch(proxyUrl, {
        method: 'GET',
        signal: this.abortController.signal
      });
      
      // Check if connection was successful
      if (!response.ok) {
        throw new Error(`Proxy server error: ${response.status} ${response.statusText}`);
      }
      
      // Start reading from the response stream
      this.reader = response.body.getReader();
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      
      // Emit connected event
      this.eventEmitter.emit('ntrip:connected', {
        casterHost: this.config.casterHost,
        mountpoint: this.config.mountpoint,
        mode: 'proxy'
      });
      
      // If we have a GGA message, start sending it periodically via proxy
      if (this.config.sendGga && (this.lastGga || this.lastPosition)) {
        this.startGgaUpdates();
      }
      
      // Start processing the stream
      this.readStream();
      
      return true;
    } catch (error) {
      console.error('Proxy connection error:', error);
      throw error;
    }
  }

  /**
   * Read and process the response stream from the NTRIP caster (for direct/proxy mode)
   */
  async readStream() {
    try {
      // Loop until disconnected or error occurs
      while (this.isConnected) {
        const { value, done } = await this.reader.read();
        
        // If stream is closed, exit the loop
        if (done) {
          this.handleDisconnect({ reason: 'Stream closed' });
          break;
        }
        
        // Process the chunk of binary data
        if (value) {
          // Update stats
          this.rtcmStats.messagesReceived++;
          this.rtcmStats.lastMessageTime = new Date();
          this.rtcmStats.bytesReceived += value.length;
          
          // Convert to ArrayBuffer and emit correction event
          this.eventEmitter.emit('ntrip:rtcm', {
            data: value.buffer,
            stats: { ...this.rtcmStats }
          });
          
          // Forward to device if available
          this.forwardRtcmToDevice(value.buffer);
        }
      }
    } catch (error) {
      // Only emit error if it's not an abort error (which happens during normal disconnect)
      if (error.name !== 'AbortError') {
        this.eventEmitter.emit('ntrip:error', {
          message: 'Error reading NTRIP stream',
          error
        });
      }
      this.handleDisconnect({ reason: error.message });
    }
  }

  /**
   * Handle WebSocket message (for WebSocket mode)
   * @param {MessageEvent} event - WebSocket message event
   */
  handleSocketMessage(event) {
    try {
      // Try to parse as JSON first (for control messages)
      const data = JSON.parse(event.data);
      
      // Handle status messages
      if (data.type === 'status') {
        if (!data.connected && this.isConnected) {
          this.handleDisconnect({ reason: data.message || 'Connection closed by server' });
        }
        return;
      }
      
      // Handle error messages
      if (data.type === 'error') {
        this.eventEmitter.emit('ntrip:error', {
          message: data.message || 'Unknown error'
        });
        return;
      }
      
      // Handle info messages
      if (data.type === 'info') {
        this.eventEmitter.emit('ntrip:info', {
          message: data.message
        });
        return;
      }
      
      // Handle ping messages (keep alive)
      if (data.type === 'ping') {
        // Just acknowledge the ping silently, no need to log or emit an event
        // Optionally could respond with a pong message if the server expects it
        return;
      }
      
      // Unknown JSON message
      console.warn('Unknown NTRIP message type:', data.type);
    } catch (e) {
      // Not JSON, treat as binary RTCM data
      this.handleRtcmData(event.data);
    }
  }
  
  /**
   * Handle WebSocket close event
   * @param {CloseEvent} event - WebSocket close event
   */
  handleSocketClose(event) {
    console.log(`WebSocket closed: ${event.code} - ${event.reason}`);
    this.handleDisconnect({
      reason: `WebSocket closed: ${event.code} - ${event.reason}`
    });
  }
  
  /**
   * Handle WebSocket error event
   * @param {Event} event - WebSocket error event
   */
  handleSocketError(event) {
    console.error('WebSocket error:', event);
    this.eventEmitter.emit('ntrip:error', {
      message: 'WebSocket error',
      error: event
    });
  }
  
  /**
   * Handle binary RTCM data from WebSocket
   * @param {ArrayBuffer|Blob} data - RTCM data
   */
  async handleRtcmData(data) {
    try {
      // Convert data to ArrayBuffer if it's a Blob
      let binaryData;
      if (data instanceof Blob) {
        binaryData = await data.arrayBuffer();
      } else if (data instanceof ArrayBuffer) {
        binaryData = data;
      } else {
        console.warn('Received RTCM data in unknown format:', typeof data);
        return;
      }
      
      // Verify if data is really RTCM3 format (should start with 0xD3 preamble)
      const isRtcm = this.isValidRtcmData(binaryData);
      
      // Update stats
      this.rtcmStats.messagesReceived++;
      this.rtcmStats.lastMessageTime = new Date();
      this.rtcmStats.bytesReceived += binaryData.byteLength;
      this.updateCorrectionAge();
      
      // If it's not valid RTCM, check if it might be a sourcetable
      if (!isRtcm) {
        try {
          const textDecoder = new TextDecoder();
          const dataString = textDecoder.decode(binaryData);
          
          // Check if it looks like a sourcetable response
          if (dataString.includes('SOURCETABLE') || dataString.includes('STR;')) {
            // Likely we received a sourcetable instead of RTCM data
            // This often happens when the caster is waiting for a GGA position
            this.eventEmitter.emit('ntrip:info', { 
              message: 'Received sourcetable from NTRIP caster. The mountpoint requires GGA position data.'
            });
            
            // Try to send GGA data immediately
            if (this.config.sendGga && (this.lastGga || this.lastPosition)) {
              if (this.lastGga) {
                this.sendGGA(this.lastGga);
              } else if (this.lastPosition) {
                const gga = this.createGgaSentence(this.lastPosition);
                this.sendGGA(gga);
              }
            }
            
            // Don't forward sourcetable data to the device
            return;
          }
        } catch (err) {
          // Ignore errors in text decoding, it might still be binary data
          // just not valid RTCM3
        }
      }
      
      // Emit RTCM data event regardless of validation
      this.eventEmitter.emit('ntrip:rtcm', {
        data: binaryData,
        isValidRtcm: isRtcm,
        stats: { ...this.rtcmStats }
      });
      
      // Only forward valid RTCM data to the device
      if (isRtcm) {
        this.forwardRtcmToDevice(binaryData);
      }
    } catch (error) {
      console.error('Error handling RTCM data:', error);
    }
  }
  
  /**
   * Validate if the data is in RTCM3 format
   * @param {ArrayBuffer} data - Binary data to validate
   * @returns {boolean} Whether the data appears to be valid RTCM3
   */
  isValidRtcmData(data) {
    if (!data || data.byteLength === 0) {
      return false;
    }
    
    try {
      // RTCM3 messages must start with 0xD3 preamble
      const dataView = new DataView(data);
      const firstByte = dataView.getUint8(0);
      
      if (firstByte !== 0xD3) {
        // Data doesn't start with 0xD3, likely not valid RTCM3
        // Log first few bytes for debugging
        if (this.debug?.errors || this.debug?.rtcmMessages) {
          const bytes = new Uint8Array(data.slice(0, Math.min(10, data.byteLength)));
          console.error('Invalid RTCM data - missing preamble 0xD3, instead got:', 
            Array.from(bytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        }
        return false;
      }
      
      // Optionally decode more of the RTCM3 header for validation
      if (data.byteLength >= 3) {
        // Extract message length from RTCM3 header
        const msgLength = ((dataView.getUint8(1) & 0x03) << 8) + dataView.getUint8(2);
        
        // Basic length validation (should at least be 6 bytes for header + CRC)
        if (msgLength < 3 || msgLength > 1023) {
          if (this.debug?.errors) {
            console.error(`RTCM3 message has invalid length: ${msgLength}`);
          }
          return false;
        }
        
        // If we have enough data, extract the message type
        if (data.byteLength >= 6) {
          const msgType = ((dataView.getUint8(3) & 0xFF) << 4) + ((dataView.getUint8(4) & 0xF0) >> 4);
          
          // Track message type in stats
          if (!this.rtcmStats.messageTypes) {
            this.rtcmStats.messageTypes = {};
          }
          
          const typeStr = msgType.toString();
          this.rtcmStats.messageTypes[typeStr] = (this.rtcmStats.messageTypes[typeStr] || 0) + 1;
          
          if (this.debug?.rtcmMessages) {
            console.log(`RTCM3 message type: ${msgType}, length: ${msgLength}`);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error validating RTCM data:', error);
      return false;
    }
  }
  
  /**
   * Forward RTCM data to connected device
   * @param {ArrayBuffer} data - RTCM binary data to forward
   */
  forwardRtcmToDevice(data) {
    try {
      // Check if we have a deviceManager property set by the GNSS module
      if ((this.deviceManager && this.deviceManager.isDeviceConnected()) || 
          (this.bluetoothManager && this.bluetoothManager.isConnected)) {
        
        // Verify RTCM data format - RTCM3 messages should start with 0xD3 preamble
        const dataView = new DataView(data);
        const firstByte = dataView.getUint8(0);
        
        // Check for the RTCM3 preamble (0xD3)
        if (firstByte === 0xD3) {
          if (this.debug?.debug || this.debug?.rtcmMessages) {
            const msgLength = ((dataView.getUint8(1) & 0x03) << 8) + dataView.getUint8(2);
            const msgType = ((dataView.getUint8(3) & 0xFF) << 4) + ((dataView.getUint8(4) & 0xF0) >> 4);
            
            console.log(`Forwarding RTCM message type ${msgType}, length ${msgLength} (${data.byteLength} bytes) to device`);
            
            // Log the first 10 bytes for debugging (hex format)
            if (this.debug?.debug) {
              const bytes = new Uint8Array(data.slice(0, Math.min(10, data.byteLength)));
              console.log('RTCM header bytes:', Array.from(bytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            }
          }
          
          // Send the intact binary data to the device - CRITICAL: do not modify the data
          // Use ConnectionManager if available, fall back to BluetoothManager for backward compatibility
          if (this.deviceManager && this.deviceManager.isDeviceConnected()) {
            this.deviceManager.sendData(data);
            return true;
          } else if (this.bluetoothManager && this.bluetoothManager.isConnected) {
            this.bluetoothManager.sendData(data);
            return true;
          }
        } else {
          if (this.debug?.errors) {
            console.error(`Invalid RTCM data - missing preamble 0xD3, instead got 0x${firstByte.toString(16)}`);
            
            // Log the first 10 bytes for debugging (hex format)
            const bytes = new Uint8Array(data.slice(0, Math.min(10, data.byteLength)));
            console.error('Invalid RTCM bytes:', Array.from(bytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
          }
          return false;
        }
      } else if (this.debug?.debug) {
        console.log('No device connected, cannot forward RTCM data');
      }
      return false;
    } catch (error) {
      console.error('Error forwarding RTCM data to device:', error);
      return false;
    }
  }

  /**
   * Disconnect from NTRIP caster
   */
  disconnect() {
    if (!this.isConnected && !this.isConnecting) {
      return;
    }
    
    try {
      // Stop GGA updates
      this.stopGgaUpdates();
      
      // WebSocket mode
      if (this.activeMode === 'websocket' && this.webSocket) {
        // Send disconnect command to proxy
        if (this.webSocket.readyState === WebSocket.OPEN) {
          this.webSocket.send(JSON.stringify({
            command: 'disconnect'
          }));
        }
        
        // Close WebSocket
        this.webSocket.close();
        this.webSocket = null;
      }
      // Direct or proxy mode
      else if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
        this.reader = null;
      }
      
      this.handleDisconnect({ reason: 'User disconnected' });
    } catch (error) {
      console.error('Error during disconnect:', error);
      this.isConnected = false;
      this.isConnecting = false;
    }
  }

  /**
   * Handle disconnection (either manual or due to error)
   * @param {Object} event - Disconnection event info
   */
  handleDisconnect(event) {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.isConnecting = false;
    
    // Reset connection resources
    this.webSocket = null;
    this.reader = null;
    this.abortController = null;
    
    // Stop GGA updates
    this.stopGgaUpdates();
    
    if (wasConnected) {
      this.eventEmitter.emit('ntrip:disconnected', {
        reason: event.reason || 'Unknown reason'
      });
    }
    
    // Attempt reconnection if enabled
    if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  scheduleReconnect() {
    // Exponential backoff with jitter
    const delay = Math.min(30000, this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts)) 
      * (0.9 + Math.random() * 0.2); // Add 10% jitter
      
    console.log(`Scheduling reconnection attempt in ${Math.round(delay / 1000)} seconds`);
    
    setTimeout(() => {
      if (!this.isConnected && !this.isConnecting) {
        console.log(`Attempting to reconnect (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        this.reconnectAttempts++;
        this.connect(this.config);
      }
    }, delay);
  }

  /**
   * Process the queue of RTCM messages
   */
  async processRtcmQueue() {
    while (this.rtcmQueue.length > 0) {
      try {
        const rtcmData = this.rtcmQueue[0];
        
        // Send to device
        if (this.deviceManager.isDeviceConnected()) {
          const result = await this.deviceManager.sendData(rtcmData);
          
          if (result) {
            this.rtcmStats.bytesSent += rtcmData.byteLength;
          } else {
            console.warn('Failed to send RTCM to device');
          }
        }
        
        // Remove from queue regardless of success
        // This prevents getting stuck on a problematic message
        this.rtcmQueue.shift();
        
        // Small delay between messages to avoid overwhelming the device
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error('Error processing RTCM queue:', error);
        
        // Remove problematic message from queue
        this.rtcmQueue.shift();
        
        // Longer delay after error
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  /**
   * Start periodically sending GGA updates to the NTRIP caster
   */
  startGgaUpdates() {
    // Stop existing interval if any
    this.stopGgaUpdates();
    
    // Send initial update immediately - this is critical for NTRIP casters
    // that require GGA before sending RTCM data
    let initialGgaSent = false;
    
    if (this.isConnected) {
      if (this.lastGga) {
        initialGgaSent = this.sendGGA(this.lastGga);
      } else if (this.lastPosition) {
        const gga = this.createGgaSentence(this.lastPosition);
        initialGgaSent = this.sendGGA(gga);
      } else {
        // If we don't have a position, generate a default one
        // This is necessary because many casters require a GGA
        // to start streaming data, even if it's not accurate
        try {
          // Create a default position close to the equator (to be in range of most casters)
          const defaultPosition = {
            latitude: 0.1,
            longitude: 0.1,
            quality: 1,
            satellites: 8,
            hdop: 1.0
          };
          
          const gga = this.createGgaSentence(defaultPosition);
          initialGgaSent = this.sendGGA(gga);
          
          // Log that we're using a fallback position
          console.warn('No position available, sending default GGA position to NTRIP caster');
          this.eventEmitter.emit('ntrip:info', { 
            message: 'Using default position for NTRIP. Corrections may not be optimal.'
          });
        } catch (error) {
          console.error('Failed to send default GGA position:', error);
        }
      }
    }
    
    // Start regular interval for updates
    this.ggaInterval = setInterval(() => {
      if (this.isConnected) {
        if (this.lastGga) {
          this.sendGGA(this.lastGga);
        } else if (this.lastPosition) {
          const gga = this.createGgaSentence(this.lastPosition);
          this.sendGGA(gga);
        }
      }
    }, this.config.ggaUpdateInterval * 1000);
    
    // If we didn't send the initial GGA and the caster might be waiting,
    // try sending GGA messages with progressively shorter intervals initially
    if (this.isConnected && !initialGgaSent) {
      // Try again after 1 second
      setTimeout(() => {
        if (this.isConnected && (this.lastGga || this.lastPosition)) {
          const gga = this.lastGga || this.createGgaSentence(this.lastPosition);
          this.sendGGA(gga);
        }
      }, 1000);
      
      // And again after 3 seconds
      setTimeout(() => {
        if (this.isConnected && (this.lastGga || this.lastPosition)) {
          const gga = this.lastGga || this.createGgaSentence(this.lastPosition);
          this.sendGGA(gga);
        }
      }, 3000);
    }
  }

  /**
   * Stop sending GGA updates
   */
  stopGgaUpdates() {
    if (this.ggaInterval) {
      clearInterval(this.ggaInterval);
      this.ggaInterval = null;
    }
  }

  /**
   * Set the GGA update interval
   * @param {number} seconds - Update interval in seconds
   */
  setGgaUpdateInterval(seconds) {
    // Validate input
    const interval = parseInt(seconds);
    if (isNaN(interval) || interval <= 0) {
      console.warn('Invalid GGA update interval, using default:', this.config.ggaUpdateInterval);
      return;
    }
    
    // Update config
    this.config.ggaUpdateInterval = interval;
    console.log(`NTRIP GGA update interval set to ${interval} seconds`);
    
    // Restart interval if already running
    if (this.ggaInterval) {
      this.startGgaUpdates(); // This will stop and restart with new interval
    }
  }

  /**
   * Update the device with the latest position
   * @param {Object} position - Position data
   */
  updatePosition(position) {
    this.lastPosition = position;
    
    // If GGA updates are enabled and we're connected, create and send GGA
    if (this.config.sendGga && this.isConnected && !this.lastGga) {
      const gga = this.createGgaSentence(position);
      this.sendGGA(gga);
    }
  }

  /**
   * Send NMEA GGA sentence to NTRIP caster
   * @param {string} gga - NMEA GGA sentence
   * @returns {Promise<boolean>} Whether message was sent successfully
   */
  async sendGGA(gga) {
    if (!this.isConnected) {
      return false;
    }
    
    try {
      // Store the GGA for periodic updates
      this.lastGga = gga;
      
      // Choose method based on active mode
      if (this.activeMode === 'websocket') {
        return this.sendGGAWebSocket(gga);
      } else if (this.activeMode === 'direct') {
        return this.sendGGADirect(gga);
      } else if (this.activeMode === 'proxy') {
        return this.sendGGAProxy(gga);
      }
      
      return false;
    } catch (error) {
      console.error('Error sending GGA:', error);
      return false;
    }
  }
  
  /**
   * Send GGA via WebSocket
   * @param {string} gga - NMEA GGA sentence
   * @returns {Promise<boolean>} Whether message was sent successfully
   */
  async sendGGAWebSocket(gga) {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
      return false;
    }
    
    try {
      this.webSocket.send(JSON.stringify({
        command: 'gga',
        data: gga
      }));
      
      return true;
    } catch (error) {
      console.error('Error sending GGA via WebSocket:', error);
      return false;
    }
  }
  
  /**
   * Send GGA directly to NTRIP caster
   * @param {string} gga - NMEA GGA sentence
   * @returns {Promise<boolean>} Whether message was sent successfully
   */
  async sendGGADirect(gga) {
    try {
      // Create POST request URL
      const protocol = this.config.casterPort === 443 ? 'https' : 'http';
      const url = `${protocol}://${this.config.casterHost}:${this.config.casterPort}/${this.config.mountpoint}`;
      
      // Create headers with authentication if needed
      const headers = new Headers({
        'Content-Type': 'text/plain',
        'User-Agent': 'NTRIP WebGNSS Client'
      });
      
      if (this.config.username && this.config.password) {
        const auth = btoa(`${this.config.username}:${this.config.password}`);
        headers.append('Authorization', `Basic ${auth}`);
      }
      
      // Send request - don't await the response as it's fire-and-forget
      fetch(url, {
        method: 'POST',
        headers,
        body: gga
      }).catch(error => {
        console.warn('Error sending GGA directly:', error);
      });
      
      return true;
    } catch (error) {
      console.error('Error sending GGA directly:', error);
      return false;
    }
  }
  
  /**
   * Send GGA via proxy
   * @param {string} gga - NMEA GGA sentence
   * @returns {Promise<boolean>} Whether message was sent successfully
   */
  async sendGGAProxy(gga) {
    try {
      // Determine proxy URL
      let proxyUrl = this.config.proxyUrl;
      
      // If it's a relative URL, make it absolute
      if (proxyUrl.startsWith('/')) {
        const protocol = window.location.protocol;
        proxyUrl = `${protocol}//${window.location.host}${proxyUrl}`;
      }
      
      // Add GGA endpoint
      proxyUrl = `${proxyUrl}/${this.config.mountpoint}/gga`;
      
      // Add parameters
      const params = new URLSearchParams({
        host: this.config.casterHost,
        port: this.config.casterPort.toString()
      });
      
      if (this.config.username && this.config.password) {
        params.append('user', this.config.username);
        params.append('password', this.config.password);
      }
      
      proxyUrl += `?${params.toString()}`;
      
      // Send request - don't await the response as it's fire-and-forget
      fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: gga
      }).catch(error => {
        console.warn('Error sending GGA via proxy:', error);
      });
      
      return true;
    } catch (error) {
      console.error('Error sending GGA via proxy:', error);
      return false;
    }
  }

  /**
   * Create NMEA GGA sentence from position data
   * @param {Object} position - Position data
   * @returns {string} GGA sentence
   */
  createGgaSentence(position) {
    try {
      // Validate position
      if (!position || typeof position.latitude !== 'number' || typeof position.longitude !== 'number') {
        throw new Error('Invalid position data');
      }
      
      // Get time in UTC
      const now = new Date();
      const hours = now.getUTCHours().toString().padStart(2, '0');
      const minutes = now.getUTCMinutes().toString().padStart(2, '0');
      const seconds = now.getUTCSeconds().toString().padStart(2, '0');
      const milliseconds = now.getUTCMilliseconds().toString().padStart(3, '0');
      const timeStr = `${hours}${minutes}${seconds}.${milliseconds}`;
      
      // Format latitude - IMPORTANT: This must follow NMEA spec exactly
      // Format: DDMM.MMMMM (degrees and decimal minutes)
      const latDeg = Math.floor(Math.abs(position.latitude));
      const latMin = (Math.abs(position.latitude) - latDeg) * 60;
      const latStr = `${latDeg.toString().padStart(2, '0')}${latMin.toFixed(7)}`;
      const latDir = position.latitude >= 0 ? 'N' : 'S';
      
      // Format longitude - IMPORTANT: This must follow NMEA spec exactly
      // Format: DDDMM.MMMMM (degrees and decimal minutes)
      const lonDeg = Math.floor(Math.abs(position.longitude));
      const lonMin = (Math.abs(position.longitude) - lonDeg) * 60;
      const lonStr = `${lonDeg.toString().padStart(3, '0')}${lonMin.toFixed(7)}`;
      const lonDir = position.longitude >= 0 ? 'E' : 'W';
      
      // Quality indicator
      // 0 = No fix, 1 = GPS fix, 2 = DGPS, 4 = RTK fixed, 5 = RTK float
      const quality = position.quality || 1;
      
      // Number of satellites
      const satellites = position.satellites || 8; // Default to 8 satellites to indicate strong signal
      
      // HDOP
      const hdop = position.hdop || 1.0;
      
      // Altitude
      const altitude = position.altitude || 0.0;
      
      // Geoid separation (set to 0 if not available)
      const geoidSep = position.geoidSeparation || 0.0;
      
      // Age of differential corrections (set to empty if not available)
      const diffAge = position.diffAge || '';
      
      // Differential reference station ID (empty if not available)
      const diffStationId = position.diffStationId || '';
      
      // Construct GGA sentence
      const ggaFields = [
        'GPGGA',         // Message ID
        timeStr,         // UTC Time
        latStr,          // Latitude
        latDir,          // N/S indicator
        lonStr,          // Longitude
        lonDir,          // E/W indicator
        quality,         // Quality indicator
        satellites,      // Number of satellites
        hdop.toFixed(1), // HDOP
        altitude.toFixed(1), // Altitude
        'M',             // Altitude units (meters)
        geoidSep.toFixed(1), // Geoid separation
        'M',             // Geoid separation units (meters)
        diffAge,         // Age of differential corrections
        diffStationId    // Differential reference station ID
      ];
      
      // Join fields with commas
      const sentence = '$' + ggaFields.join(',');
      
      // Calculate checksum
      let checksum = 0;
      for (let i = 1; i < sentence.length; i++) {
        checksum ^= sentence.charCodeAt(i);
      }
      
      // Format checksum as 2-digit hex
      const checksumHex = checksum.toString(16).toUpperCase().padStart(2, '0');
      
      // Add checksum and line ending
      const fullSentence = `${sentence}*${checksumHex}\r\n`;
      
      // Validate the created sentence
      if (this.isValidGga(fullSentence)) {
        return fullSentence;
      } else {
        throw new Error('Generated GGA sentence failed validation');
      }
    } catch (error) {
      console.error('Error creating GGA sentence:', error);
      
      // Return a minimal valid GGA sentence with 0,0 coordinates
      // This is a fallback that uses a pre-computed valid GGA with checksum
      return '$GPGGA,000000.000,0000.0000,N,00000.0000,E,1,08,1.0,0.0,M,0.0,M,,*67\r\n';
    }
  }
  
  /**
   * Validate if a GGA sentence is properly formatted
   * @param {string} sentence - GGA sentence to validate
   * @returns {boolean} Whether the sentence is valid
   */
  isValidGga(sentence) {
    // Basic format check
    if (!sentence || typeof sentence !== 'string') {
      return false;
    }
    
    // Must start with $GPGGA or $GNGGA
    if (!sentence.startsWith('$GPGGA') && !sentence.startsWith('$GNGGA')) {
      return false;
    }
    
    // Must have enough fields (minimum 14 comma-separated values)
    const parts = sentence.split(',');
    if (parts.length < 14) {
      return false;
    }
    
    // Must have lat/long data
    if (!parts[2] || !parts[4]) {
      return false;
    }
    
    // Verify checksum if present
    if (sentence.includes('*')) {
      try {
        const checksumIndex = sentence.indexOf('*');
        const providedChecksum = parseInt(sentence.substring(checksumIndex + 1), 16);
        
        // Calculate checksum
        let calculatedChecksum = 0;
        for (let i = 1; i < checksumIndex; i++) {
          calculatedChecksum ^= sentence.charCodeAt(i);
        }
        
        if (providedChecksum !== calculatedChecksum) {
          console.error(`GGA checksum mismatch: provided ${providedChecksum}, calculated ${calculatedChecksum}`);
          return false;
        }
      } catch (e) {
        console.error('Error validating GGA checksum:', e);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Update correction age based on last message time
   */
  updateCorrectionAge() {
    if (this.rtcmStats.lastMessageTime) {
      const now = new Date();
      this.rtcmStats.correctionAge = (now - this.rtcmStats.lastMessageTime) / 1000;
    }
  }

  /**
   * Get RTCM statistics
   * @returns {Object} RTCM statistics
   */
  getRtcmStats() {
    // Update correction age
    this.updateCorrectionAge();
    
    return {
      ...this.rtcmStats,
      connected: this.isConnected,
      mode: this.activeMode,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Reset RTCM statistics
   */
  resetRtcmStats() {
    this.rtcmStats = {
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      lastMessageTime: null,
      correctionAge: null
    };
  }

  /**
   * Enable/disable auto-reconnect
   * @param {boolean} enabled - Whether auto-reconnect is enabled
   * @param {number} maxAttempts - Maximum reconnection attempts
   */
  setAutoReconnect(enabled, maxAttempts = 5) {
    this.autoReconnect = enabled;
    this.maxReconnectAttempts = maxAttempts;
  }
  
  /**
   * Get connection status information
   * @returns {Object} Connection status
   */
  getConnectionInfo() {
    this.updateCorrectionAge();
    
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      casterHost: this.config.casterHost,
      mountpoint: this.config.mountpoint,
      mode: this.activeMode,
      rtcmStats: { ...this.rtcmStats },
      reconnectAttempts: this.reconnectAttempts,
      autoReconnect: this.autoReconnect
    };
  }
}

export default NtripClient;