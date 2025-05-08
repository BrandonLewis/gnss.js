import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SSL certificate options
const options = {
  key: fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem'))
};

// MIME types for different file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json'
};

// Create HTTPS server
const server = https.createServer(options, (req, res) => {
  console.log(`${req.method} ${req.url}`);
  
  // Parse the URL to get the filepath
  let filepath = req.url;
  
  // Handle root requests
  if (filepath === '/') {
    // Serve an index page that links to both examples
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>gnss.js Examples</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.5;
          }
          h1, h2 {
            color: #333;
          }
          .card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          a.button {
            display: inline-block;
            background-color: #4CAF50;
            color: white;
            text-decoration: none;
            padding: 10px 20px;
            border-radius: 4px;
            margin-top: 10px;
          }
          a.button:hover {
            background-color: #45a049;
          }
        </style>
      </head>
      <body>
        <h1>gnss.js Examples</h1>
        <p>Select one of the examples below to get started:</p>
        
        <div class="card">
          <h2>Basic Usage</h2>
          <p>This example demonstrates the basic functionality of connecting to GNSS devices via Bluetooth or Serial, receiving position data, and connecting to NTRIP services.</p>
          <a href="/examples/basic-usage.html" class="button">Open Basic Example</a>
        </div>
        
        <div class="card">
          <h2>Connection Diagnostics</h2>
          <p>A comprehensive tool for troubleshooting Bluetooth and Serial connections. This tool helps examine available services, characteristics, and test data communication.</p>
          <a href="/examples/connection-diagnostics.html" class="button">Open Diagnostic Tool</a>
        </div>
        
        <div class="card">
          <h2>Device Settings</h2>
          <p>A tool for configuring device-specific parameters and saving them for future use. Supports common device presets and custom configurations.</p>
          <a href="/examples/device-settings.html" class="button">Open Device Settings</a>
        </div>
        
        <div class="card">
          <h2>NMEA Parser Test</h2>
          <p>A testing utility for the NMEA parser. You can test parsing of NMEA sentences and see the parsed results.</p>
          <a href="/examples/nmea-parser-test.html" class="button">Open NMEA Parser Test</a>
        </div>
        
        <p><small>Note: You will need to accept the self-signed certificate warning in your browser.</small></p>
      </body>
      </html>
    `);
    return;
  }
  
  // Get the full path to the file
  const fullPath = path.join(__dirname, filepath);
  
  // Check if file exists
  fs.access(fullPath, fs.constants.F_OK, (err) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    
    // Get file extension to determine MIME type
    const extname = path.extname(fullPath);
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    // Read and serve the file
    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Server Error');
        return;
      }
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
});

// Server port
const PORT = process.env.PORT || 8443;

// Start server
server.listen(PORT, () => {
  console.log(`HTTPS Server running at https://localhost:${PORT}/`);
  console.log(`Access the basic example at https://localhost:${PORT}/`);
  console.log('Note: You will need to accept the self-signed certificate warning in your browser');
});