// server.cjs - Enhanced Local Proxy Server with Detailed Logging
// Run with: node server.cjs

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY;
const WORKER_URL = process.env.WORKER_URL || 'https://prus-api3.burgas275.workers.dev';

// Check if API_KEY is configured
if (!API_KEY) {
    console.error('❌ ERROR: API_KEY not found in .env file!');
    process.exit(1);
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`🚀 PROPERTY MANAGER - LOCAL PROXY SERVER`);
console.log(`${'═'.repeat(60)}`);
console.log(`📋 Configuration:`);
console.log(`   PORT: ${PORT}`);
console.log(`   WORKER_URL: ${WORKER_URL}`);
console.log(`   API_KEY: ${API_KEY.substring(0, 10)}... (${API_KEY.length} chars)`);
console.log(`${'═'.repeat(60)}\n`);

// ============================================
// CORS Configuration
// ============================================
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization', 'X-API-Key']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'temp_uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log(`📁 Created temp directory: ${uploadDir}`);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = uniqueSuffix + path.extname(file.originalname);
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}. Only images are allowed.`));
        }
    }
});

// ============================================
// Health Check Endpoint
// ============================================
app.get('/health', (req, res) => {
    console.log(`[${new Date().toISOString()}] HEALTH CHECK - OK`);
    res.json({ 
        success: true,
        status: 'ok', 
        timestamp: new Date().toISOString(),
        server: 'property-manager-proxy',
        version: '1.0.0',
        uptime: process.uptime(),
        workerUrl: WORKER_URL
    });
});

// ============================================
// Status Endpoint
// ============================================
app.get('/status', (req, res) => {
    res.json({
        success: true,
        status: 'running',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        config: {
            workerUrl: WORKER_URL,
            hasApiKey: !!API_KEY
        },
        endpoints: {
            health: 'GET /health',
            proxy: 'GET /proxy?url=...',
            upload: 'POST /upload',
            uploadBatch: 'POST /upload-batch',
            status: 'GET /status'
        }
    });
});

// ============================================
// PROXY ENDPOINT - Download image from statusm.me
// ============================================
app.get('/proxy', async (req, res) => {
    const startTime = Date.now();
    const targetUrl = req.query.url;
    const requestId = Math.random().toString(36).substring(2, 8);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${requestId}] [${new Date().toISOString()}] 📥 PROXY REQUEST`);
    console.log(`[${requestId}] URL: ${targetUrl}`);
    console.log(`[${requestId}] Client IP: ${req.ip || req.socket.remoteAddress}`);

    if (!targetUrl) {
        console.log(`[${requestId}] ❌ ERROR: Missing url parameter`);
        return res.status(400).json({ error: 'url parameter is required' });
    }

    // Security: Only allow statusm.me domain
    if (!targetUrl.includes('statusm.me')) {
        console.log(`[${requestId}] ❌ BLOCKED: Only statusm.me domain is allowed (got: ${targetUrl})`);
        return res.status(403).json({ error: 'Only statusm.me domain is allowed' });
    }

    try {
        console.log(`[${requestId}] 🔄 Fetching from statusm.me...`);
        
        const response = await axios({
            method: 'GET',
            url: targetUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://statusm.me/',
            },
            timeout: 30000,
            responseType: 'stream'
        });

        const contentType = response.headers['content-type'];
        const contentLength = response.headers['content-length'];

        console.log(`[${requestId}] ✅ STATUS: ${response.status}`);
        console.log(`[${requestId}] 📦 Content-Type: ${contentType}`);
        console.log(`[${requestId}] 📏 Size: ${contentLength ? (parseInt(contentLength) / 1024).toFixed(2) + ' KB' : 'unknown'}`);
        console.log(`[${requestId}] ⏱️  Request time: ${Date.now() - startTime}ms`);

        // Set response headers
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=300');
        res.set('X-Proxy-Status', 'success');
        res.set('X-Request-ID', requestId);

        // Pipe the image data
        response.data.pipe(res);

        // Log when streaming completes
        response.data.on('end', () => {
            console.log(`[${requestId}] ✅ Stream completed. Total time: ${Date.now() - startTime}ms`);
            console.log(`${'─'.repeat(60)}`);
        });

        response.data.on('error', (err) => {
            console.log(`[${requestId}] ❌ Stream error: ${err.message}`);
        });

    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.log(`[${requestId}] ❌ PROXY ERROR after ${errorTime}ms`);
        
        if (error.response) {
            console.log(`[${requestId}]    Status: ${error.response.status}`);
            console.log(`[${requestId}]    Status Text: ${error.response.statusText}`);
        } else if (error.request) {
            console.log(`[${requestId}]    No response received from statusm.me`);
            console.log(`[${requestId}]    Error: ${error.message}`);
        } else {
            console.log(`[${requestId}]    Error: ${error.message}`);
        }
        
        console.log(`${'─'.repeat(60)}`);
        
        res.status(500).json({ 
            error: error.message,
            requestId: requestId
        });
    }
});

// ============================================
// SINGLE UPLOAD ENDPOINT
// ============================================
app.post('/upload', upload.single('image'), async (req, res) => {
    const requestId = Math.random().toString(36).substring(2, 8);
    const startTime = Date.now();
    const workerUrl = req.query.workerUrl || WORKER_URL;
    const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'] || API_KEY;
    const propertyId = req.body.propertyId;
    const imageIndex = req.body.imageIndex || 0;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${requestId}] [${new Date().toISOString()}] 📤 UPLOAD REQUEST`);
    console.log(`[${requestId}] Property ID: ${propertyId}`);
    console.log(`[${requestId}] Image Index: ${imageIndex}`);
    console.log(`[${requestId}] File: ${req.file?.originalname || 'none'}`);
    console.log(`[${requestId}] File Size: ${req.file?.size ? (req.file.size / 1024).toFixed(2) + ' KB' : 'unknown'}`);
    console.log(`[${requestId}] Target Worker: ${workerUrl}`);

    if (!apiKey) {
        console.log(`[${requestId}] ❌ ERROR: API key is required`);
        return res.status(401).json({ error: 'API key is required' });
    }

    if (!propertyId) {
        console.log(`[${requestId}] ❌ ERROR: propertyId is required`);
        return res.status(400).json({ error: 'propertyId is required' });
    }

    if (!req.file) {
        console.log(`[${requestId}] ❌ ERROR: No image file provided`);
        return res.status(400).json({ error: 'No image file provided' });
    }

    try {
        console.log(`[${requestId}] 🔄 Uploading to Cloudflare Worker...`);

        const formData = new FormData();
        formData.append('file', fs.createReadStream(req.file.path));
        formData.append('propertyId', propertyId.toString());
        formData.append('imageIndex', imageIndex.toString());
        formData.append('originalFilename', req.file.originalname);

        const response = await axios.post(`${workerUrl}/cache/upload-file`, formData, {
            headers: {
                ...formData.getHeaders(),
                'X-API-Key': apiKey
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        // Clean up temp file
        fs.unlinkSync(req.file.path);

        const totalTime = Date.now() - startTime;
        console.log(`[${requestId}] ✅ UPLOAD SUCCESS!`);
        console.log(`[${requestId}]    Cache Key: ${response.data.key}`);
        console.log(`[${requestId}]    Status: ${response.data.status}`);
        console.log(`[${requestId}]    Total Time: ${totalTime}ms`);
        console.log(`${'─'.repeat(60)}`);

        res.json(response.data);

    } catch (error) {
        console.log(`[${requestId}] ❌ UPLOAD ERROR: ${error.message}`);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        if (error.response) {
            console.log(`[${requestId}]    Response status: ${error.response.status}`);
            console.log(`[${requestId}]    Response data:`, error.response.data);
        }
        
        console.log(`${'─'.repeat(60)}`);
        
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data 
        });
    }
});

// ============================================
// BATCH UPLOAD ENDPOINT
// ============================================
app.post('/upload-batch', upload.array('images', 50), async (req, res) => {
    const requestId = Math.random().toString(36).substring(2, 8);
    const startTime = Date.now();
    const workerUrl = req.query.workerUrl || WORKER_URL;
    const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'] || API_KEY;
    const propertyId = req.body.propertyId;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${requestId}] [${new Date().toISOString()}] 📦 BATCH UPLOAD REQUEST`);
    console.log(`[${requestId}] Property ID: ${propertyId}`);
    console.log(`[${requestId}] Files count: ${req.files?.length || 0}`);

    if (!apiKey) {
        console.log(`[${requestId}] ❌ ERROR: API key is required`);
        return res.status(401).json({ error: 'API key is required' });
    }

    if (!propertyId) {
        console.log(`[${requestId}] ❌ ERROR: propertyId is required`);
        return res.status(400).json({ error: 'propertyId is required' });
    }

    if (!req.files || req.files.length === 0) {
        console.log(`[${requestId}] ❌ ERROR: No image files provided`);
        return res.status(400).json({ error: 'No image files provided' });
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    try {
        console.log(`[${requestId}] 🔄 Processing ${req.files.length} files...`);

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const fileStartTime = Date.now();
            
            console.log(`[${requestId}]   📸 [${i + 1}/${req.files.length}] ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);

            const formData = new FormData();
            formData.append('file', fs.createReadStream(file.path));
            formData.append('propertyId', propertyId.toString());
            formData.append('imageIndex', i.toString());
            formData.append('originalFilename', file.originalname);

            try {
                const response = await axios.post(`${workerUrl}/cache/upload-file`, formData, {
                    headers: {
                        ...formData.getHeaders(),
                        'X-API-Key': apiKey
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });
                
                results.push({
                    index: i,
                    filename: file.originalname,
                    status: 'success',
                    key: response.data.key,
                    timeMs: Date.now() - fileStartTime
                });
                successCount++;
                console.log(`[${requestId}]   ✅ Success: ${response.data.key} (${Date.now() - fileStartTime}ms)`);
                
            } catch (err) {
                results.push({
                    index: i,
                    filename: file.originalname,
                    status: 'failed',
                    error: err.message
                });
                failCount++;
                console.log(`[${requestId}]   ❌ Failed: ${err.message}`);
            }
            
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        }

        const totalTime = Date.now() - startTime;
        console.log(`[${requestId}] ✅ BATCH COMPLETE`);
        console.log(`[${requestId}]    Success: ${successCount}/${req.files.length}`);
        console.log(`[${requestId}]    Total Time: ${totalTime}ms`);
        console.log(`${'─'.repeat(60)}`);

        res.json({
            success: true,
            propertyId: parseInt(propertyId),
            summary: {
                total: req.files.length,
                success: successCount,
                failed: failCount,
                totalTimeMs: totalTime
            },
            results
        });

    } catch (error) {
        console.log(`[${requestId}] ❌ BATCH ERROR: ${error.message}`);
        
        req.files.forEach(file => {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        });
        
        console.log(`${'─'.repeat(60)}`);
        
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║     PROPERTY MANAGER - LOCAL PROXY SERVER                     ║
║     Version: 1.0.0                                            ║
║     Port: ${PORT}                                                  ║
║     Status: RUNNING ✅                                        ║
║     Worker URL: ${WORKER_URL}                                 ║
╠═══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                   ║
║    GET  /health          - Health check                       ║
║    GET  /proxy?url=...   - Download from statusm.me           ║
║    POST /upload          - Upload single image                ║
║    POST /upload-batch    - Upload multiple images             ║
║    GET  /status          - Server status                      ║
╚═══════════════════════════════════════════════════════════════╝

💡 Test the proxy:
   curl "http://localhost:${PORT}/proxy?url=https://statusm.me/wp-content/uploads/2025/01/status4.jpg" -o test.jpg

💡 Test health:
   curl http://localhost:${PORT}/health

`);
});