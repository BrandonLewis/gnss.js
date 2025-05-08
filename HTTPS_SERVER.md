# HTTPS Server for gnss.js Development

This simple HTTPS server allows you to test Web Bluetooth and Web Serial API features of gnss.js in a secure context, which is required by modern browsers.

## Prerequisites

- Node.js >= 22.0.0

## SSL Certificates

The server uses self-signed certificates located in the `certs/` directory:
- `certs/key.pem`: The private key
- `certs/cert.pem`: The public certificate

Since these are self-signed certificates, your browser will display a security warning. You'll need to click "Advanced" and "Proceed to localhost (unsafe)" to access your application.

## Running the Server

```bash
# Make sure you've built the library first
npm run build

# Start the HTTPS server
npm run serve
```

The server will start on port 8443 (default). You can access the basic example at:

https://localhost:8443/

## Accepting the Self-Signed Certificate

1. When you first visit the URL, you'll see a security warning
2. Click "Advanced" or "Details"
3. Click "Proceed to localhost (unsafe)" or a similar option
4. Your browser will now trust the certificate for this session

## Using with Web Bluetooth and Web Serial APIs

With this HTTPS server running, your browser will permit access to Web Bluetooth and Web Serial APIs, which require a secure context (HTTPS or localhost).

## Customizing the Server

You can modify `server.js` to change the port or add additional functionality as needed.

```javascript
// Change the port
const PORT = process.env.PORT || 8443;
```

## Troubleshooting

### EADDRINUSE Error

If you see an error like `Error: listen EADDRINUSE: address already in use :::8443`, it means the port is already in use. You can change the port in `server.js` or stop the other process using that port.

### Certificate Issues

If your browser refuses to accept the certificate, you can regenerate it:

```bash
cd certs
rm key.pem cert.pem
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```