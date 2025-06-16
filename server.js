const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// MIME types for static file serving
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// Server configuration
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SITES_FILE = path.join(__dirname, 'sites.json');

// In-memory store
let sitesData = { sites: [] };
let isWriting = false;

// Load initial data
try {
  sitesData = JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'));
  console.log('Loaded sites data:', sitesData.sites.length, 'sites');
} catch (err) {
  console.error('Error loading sites:', err);
}

// Create HTTP server
const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // Handle API requests
  if (req.url?.startsWith('/api/')) {
    handleApiRequest(req, res);
    return;
  }

  // Serve static files
  serveStaticFile(req, res);
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  // Send initial sites data
  ws.send(JSON.stringify({
    type: 'INIT_SITES',
    data: sitesData.sites
  }));
  
  ws.on('message', (data) => {
    handleWebSocketMessage(ws, data);
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// API request handler
function handleApiRequest(req, res) {
  const endpoint = req.url.split('/')[2];

  if (endpoint === 'sites') {
    if (req.method === 'GET') {
      try {
        const sitesData = fs.readFileSync('sites.json', 'utf8');
        sendJsonResponse(res, 200, JSON.parse(sitesData));
      } catch (error) {
        sendJsonResponse(res, 500, { error: 'Failed to read sites data' });
      }
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const newSite = JSON.parse(body);
          
          // Validate required fields
          if (!newSite.name || !newSite.source || !newSite.destination) {
            sendJsonResponse(res, 400, { error: 'Missing required fields' });
            return;
          }

          // Read existing sites
          const sitesData = JSON.parse(fs.readFileSync('sites.json', 'utf8'));
          
          // Check for duplicate site name
          if (sitesData.sites.some(site => site.name === newSite.name)) {
            sendJsonResponse(res, 400, { error: 'Site with this name already exists' });
            return;
          }

          // Add new site
          sitesData.sites.push(newSite);
          
          // Save updated sites
          fs.writeFileSync('sites.json', JSON.stringify(sitesData, null, 2));
          
          sendJsonResponse(res, 201, newSite);
          
          // Notify connected clients
          broadcastToClients(JSON.stringify({
            type: 'siteAdded',
            data: newSite
          }));
        } catch (error) {
          sendJsonResponse(res, 500, { error: 'Failed to add site' });
        }
      });
    } else if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const updatedSite = JSON.parse(body);
          
          // Validate required fields
          if (!updatedSite.name || !updatedSite.source || !updatedSite.destination) {
            sendJsonResponse(res, 400, { error: 'Missing required fields' });
            return;
          }

          // Read existing sites
          const sitesData = JSON.parse(fs.readFileSync('sites.json', 'utf8'));
          
          // Find and update the site
          const siteIndex = sitesData.sites.findIndex(site => site.name === updatedSite.name);
          if (siteIndex === -1) {
            sendJsonResponse(res, 404, { error: 'Site not found' });
            return;
          }

          sitesData.sites[siteIndex] = updatedSite;
          
          // Save updated sites
          fs.writeFileSync('sites.json', JSON.stringify(sitesData, null, 2));
          
          sendJsonResponse(res, 200, updatedSite);
          
          // Notify connected clients
          broadcastToClients(JSON.stringify({
            type: 'siteUpdated',
            data: updatedSite
          }));
        } catch (error) {
          sendJsonResponse(res, 500, { error: 'Failed to update site' });
        }
      });
    } else if (req.method === 'DELETE') {
      // Extract site name from URL
      const siteName = decodeURIComponent(req.url.split('/')[3]);
      
      if (!siteName) {
        sendJsonResponse(res, 400, { error: 'Site name is required' });
        return;
      }

      try {
        // Read existing sites
        const sitesData = JSON.parse(fs.readFileSync('sites.json', 'utf8'));
        
        // Find the site index
        const siteIndex = sitesData.sites.findIndex(site => site.name === siteName);
        if (siteIndex === -1) {
          sendJsonResponse(res, 404, { error: 'Site not found' });
          return;
        }

        // Remove the site
        const deletedSite = sitesData.sites.splice(siteIndex, 1)[0];
        
        // Save updated sites
        fs.writeFileSync('sites.json', JSON.stringify(sitesData, null, 2));
        
        sendJsonResponse(res, 200, deletedSite);
        
        // Notify connected clients
        broadcastToClients(JSON.stringify({
          type: 'SITE_DELETED',
          data: deletedSite
        }));
      } catch (error) {
        sendJsonResponse(res, 500, { error: 'Failed to delete site' });
      }
    } else {
      sendJsonResponse(res, 405, { error: 'Method not allowed' });
    }
  } else if (endpoint === 'operations') {
    const operations = {
        cleanup: {
            name: "Cleanup",
            description: "Delete existing content",
            modules: {
                analysts: {
                    name: "Analysts",
                    description: "Delete existing analysts"
                },
                downloads: {
                    name: "Downloads",
                    description: "Delete existing downloads"
                },
                faq: {
                    name: "FAQ",
                    description: "Delete existing FAQ entries"
                },
                personList: {
                    name: "Person List",
                    description: "Delete existing person list"
                }
            }
        },
        scrape: {
            name: "Scrape",
            description: "Scrape content from source site",
            modules: {
                analysts: {
                    name: "Analysts",
                    description: "Scrape analysts from source site"
                },
                downloads: {
                    name: "Downloads",
                    description: "Scrape downloads from source site"
                },
                faq: {
                    name: "FAQ",
                    description: "Scrape FAQ entries from source site"
                },
                personList: {
                    name: "Person List",
                    description: "Scrape person list from source site"
                }
            }
        },
        create: {
            name: "Create",
            description: "Create content in destination site",
            modules: {
                analysts: {
                    name: "Analysts",
                    description: "Create analysts in destination site"
                },
                downloads: {
                    name: "Downloads",
                    description: "Create downloads in destination site"
                },
                faq: {
                    name: "FAQ",
                    description: "Create FAQ entries in destination site"
                },
                personList: {
                    name: "Person List",
                    description: "Create person list in destination site"
                }
            }
        }
    };
    sendJsonResponse(res, 200, operations);
    return;
  } else {
    sendJsonResponse(res, 404, { error: 'Endpoint not found' });
  }
}

// Save to file with debouncing
function scheduleSave() {
  return new Promise((resolve, reject) => {
    if (!isWriting) {
      isWriting = true;
      setTimeout(() => {
        fs.writeFile(
          SITES_FILE,
          JSON.stringify(sitesData, null, 2),
          'utf8',
          (err) => {
            isWriting = false;
            if (err) {
              console.error('Error saving sites:', err);
              reject(err);
            } else {
              console.log('Sites saved successfully');
              resolve();
            }
          }
        );
      }, 1000);
    }
  });
}

// Broadcast to all connected WebSocket clients
function broadcastToClients(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// WebSocket message handler
function handleWebSocketMessage(ws, data) {
  try {
    const message = JSON.parse(data);
    
    switch (message.type) {
      case 'REQUEST_SITES':
        ws.send(JSON.stringify({
          type: 'SITES_DATA',
          data: sitesData.sites
        }));
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  } catch (err) {
    console.error('Error handling WebSocket message:', err);
  }
}

// Helper function to send JSON responses
function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Static file server
function serveStaticFile(req, res) {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  const extname = path.extname(filePath);
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
}); 