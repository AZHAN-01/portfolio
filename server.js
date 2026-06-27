const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set in environment variables. Server cannot start securely.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '2h'; // Tokens expire after 2 hours

// Helper: generate a signed JWT for admin
function generateToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Helper: verify a JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

console.log("SMTP_USER exists:", !!process.env.SMTP_USER);
console.log("SMTP_PASS exists:", !!process.env.SMTP_PASS);
// Setup Multer Storage
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
let storage;
let isCloudinaryConfigured = !!process.env.CLOUDINARY_API_KEY;
console.log("Cloudinary configured:", isCloudinaryConfigured);
console.log("API key exists:", !!process.env.CLOUDINARY_API_KEY);
if (isCloudinaryConfigured) {
  require('./cloudinary'); // Ensure configuration is applied
  const cloudinaryBase = require('cloudinary'); // Get base object, not .v2
  const CloudinaryStorage = require('multer-storage-cloudinary');
  storage = new CloudinaryStorage({
    cloudinary: cloudinaryBase,
    params: {
      folder: 'portfolio',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
    }
  });
} else {
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
    }
  });
}

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: function (req, file, cb) {
    // Check MIME type
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'), false);
    }
    // Check file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return cb(new Error('Only image files are allowed.'), false);
    }
    cb(null, true);
  }
});

// Middleware: validate uploaded file's magic bytes (real file signature)
const IMAGE_SIGNATURES = {
  'ffd8ff': 'image/jpeg',       // JPEG
  '89504e47': 'image/png',      // PNG
  '47494638': 'image/gif',      // GIF
  '52494646': 'image/webp',     // WebP (RIFF header)
};

function validateImageMagicBytes(req, res, next) {
  // Skip if no file uploaded or if using Cloudinary (Cloudinary validates server-side)
  if (!req.file || isCloudinaryConfigured) return next();

  const filePath = req.file.path;
  try {
    const buffer = fs.readFileSync(filePath);
    const hex = buffer.toString('hex', 0, 4);
    const isValid = Object.keys(IMAGE_SIGNATURES).some(sig => hex.startsWith(sig));

    if (!isValid) {
      // Delete the spoofed file immediately
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: 'Invalid image file. File content does not match an image format.' });
    }
  } catch (err) {
    console.error('Magic bytes validation error:', err.message);
  }
  next();
}

function getImageUrl(file) {
  if (!file) return null;
  return isCloudinaryConfigured ? (file.secure_url || file.url || file.path) : '/uploads/' + file.filename;
}


// Admin authentication configs (password fallback for legacy; JWT handles session)

const app = express();
const PORT = process.env.PORT || 3000;

// SEC-04 FIX: Strict CORS – only allow specific production and local origins
const allowedOrigins = [
  "https://azhandevportfolio.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow server-to-server requests (no origin header)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Database pool variable
let pool;
// Initialize MySQL database and tables
async function initDB() {
  try {
   const dbConfig = {
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  port: Number(process.env.MYSQLPORT),
  database: process.env.MYSQLDATABASE,
  ssl: { rejectUnauthorized: false }
};
console.log("MYSQLHOST =", process.env.MYSQLHOST);
console.log("MYSQLUSER =", process.env.MYSQLUSER);
console.log("MYSQLPORT =", process.env.MYSQLPORT);
console.log("MYSQLDATABASE =", process.env.MYSQLDATABASE);
console.log("MYSQLPASSWORD exists =", !!process.env.MYSQLPASSWORD);
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    const connection = await pool.getConnection();
    connection.release();

    // Create certificates table
    const createCertificatesTableQuery = `
      CREATE TABLE IF NOT EXISTS certificates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        issuer VARCHAR(255),
        image_url VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await pool.query(createCertificatesTableQuery);

    // Create projects table
     
      const createTableQuery = `
  CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    web_link VARCHAR(512),
    github_link VARCHAR(512),
    tech_stack VARCHAR(255),
    image_url VARCHAR(512),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;
    await pool.query(createTableQuery);

    try {
      await pool.query('ALTER TABLE projects ADD COLUMN image_url VARCHAR(512)');
    } catch (e) {
      // Ignore error if column already exists
    }

    // Create admin_users table
    const createAdminTableQuery = `
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        reset_code VARCHAR(10),
        reset_expires DATETIME
      )
    `;
    await pool.query(createAdminTableQuery);

    // Create settings table
    const createSettingsTableQuery = `
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value TEXT
      )
    `;
    await pool.query(createSettingsTableQuery);

    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Database initialization failed:', error);
    console.log('Check Railway database connection variables.');
  }
}

// SEC-01 FIX: JWT-based admin authentication middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Admin access required.' });
  }
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (decoded && decoded.role === 'admin') {
    req.adminUser = decoded;
    next();
  } else {
    res.status(401).json({ success: false, message: 'Session expired or invalid. Please log in again.' });
  }
}

// SEC-03 FIX: Rate limiters for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window
  message: { success: false, message: 'Too many attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // 5 attempts per window (stricter for code verification)
  message: { success: false, message: 'Too many verification attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API Routes

// 1. Setup Status
app.get('/api/auth/setup-status', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM admin_users');
    res.json({ needsSetup: rows[0].count === 0 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Register Admin (First-time only)
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM admin_users');
    if (rows[0].count > 0) {
      return res.status(403).json({ success: false, message: 'Admin account already exists.' });
    }
    const hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [email, hash]);
    const token = generateToken();
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { password } = req.body;
  try {
    const [rows] = await pool.query('SELECT password_hash FROM admin_users LIMIT 1');
    if (rows.length === 0) return res.status(401).json({ success: false, message: 'No admin configured. Please register first.' });
    
    const match = await bcrypt.compare(password, rows[0].password_hash);
    if (match) {
      const token = generateToken();
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, message: 'Invalid Admin Password.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Forgot Password
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE email = ? LIMIT 1', [email]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Email not found.' });

    // Generate 6-digit code (SEC-03: harder to brute-force than 4-digit)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await pool.query('UPDATE admin_users SET reset_code = ?, reset_expires = ? WHERE id = ?', [code, expires, rows[0].id]);

    // Send email using Resend API (HTTP, port 443 - works on Render Free Tier)
    if (process.env.RESEND_API_KEY) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'onboarding@resend.dev',
            to: email,
            subject: 'Admin Password Reset Code',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
                <h2 style="color: #333;">Password Reset Code</h2>
                <p>Use the following code to reset your admin password:</p>
                <div style="background: #f4f4f4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                  <h1 style="color: #007bff; letter-spacing: 8px; margin: 0;">${code}</h1>
                </div>
                <p style="color: #666; font-size: 14px;">This code will expire in <strong>15 minutes</strong>.</p>
                <p style="color: #999; font-size: 12px;">If you did not request this, please ignore this email.</p>
              </div>
            `
          })
        });
        const resData = await response.json();
        if (response.ok) {
          console.log("EMAIL SENT SUCCESSFULLY via Resend to:", email);
          return res.json({ success: true, message: 'Verification code sent via Resend.' });
        } else {
          console.error("Resend API Error:", resData);
          throw new Error(resData.message || 'Resend API failed');
        }
      } catch (err) {
        console.error("Resend send failed, falling back to SMTP/Console:", err.message);
      }
    }

    // Try SMTP fallback
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          },
          tls: {
            rejectUnauthorized: false
          }
        });

        await transporter.sendMail({
          from: `"Portfolio Admin" <${process.env.SMTP_USER}>`,
          to: email,
          subject: 'Admin Password Reset Code',
          text: `Your password reset code is: ${code}\n\nThis code will expire in 15 minutes.`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
              <h2 style="color: #333;">Password Reset Code</h2>
              <p>Use the following code to reset your admin password:</p>
              <div style="background: #f4f4f4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <h1 style="color: #007bff; letter-spacing: 8px; margin: 0;">${code}</h1>
              </div>
              <p style="color: #666; font-size: 14px;">This code will expire in <strong>15 minutes</strong>.</p>
              <p style="color: #999; font-size: 12px;">If you did not request this, please ignore this email.</p>
            </div>
          `
        });
        console.log("EMAIL SENT SUCCESSFULLY via SMTP to:", email);
        return res.json({ success: true, message: 'Verification code sent.' });
      } catch (err) {
        console.error("SMTP EMAIL ERROR:", err.message);
        // Fallback: don't return 500 error if we can output code to console
        console.warn("SMTP failed. Fallback: Reset code is printed to console:", code);
        return res.json({
          success: true,
          message: 'Failed to send email. However, you can retrieve your reset code from the server logs.'
        });
      }
    }

    // Console-only fallback if neither is configured
    console.log("No email configuration found. Reset code is:", code);
    return res.json({
      success: true,
      message: 'Verification code generated. Please check the server logs.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Verify Code
app.post('/api/auth/verify-code', resetCodeLimiter, async (req, res) => {
  const { email, code } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE email = ? AND reset_code = ? AND reset_expires > NOW() LIMIT 1', [email, code]);
    if (rows.length === 0) return res.status(400).json({ success: false, message: 'Invalid or expired code.' });
    res.json({ success: true, message: 'Code verified.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Reset Password
app.post('/api/auth/reset-password', resetCodeLimiter, async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE email = ? AND reset_code = ? AND reset_expires > NOW() LIMIT 1', [email, code]);
    if (rows.length === 0) return res.status(400).json({ success: false, message: 'Invalid or expired session.' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE admin_users SET password_hash = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?', [hash, rows[0].id]);
    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auth Check (JWT-based)
app.get('/api/auth/check', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json({ authenticated: false });
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (decoded && decoded.role === 'admin') {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
});

// --- Certificates APIs ---

app.get('/api/certificates', async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ success: false, message: 'Database pool not initialized.' });
    const [rows] = await pool.query('SELECT * FROM certificates ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/certificates', authenticateAdmin, upload.single('image'), validateImageMagicBytes, async (req, res) => {
  const { title, issuer } = req.body;
  const image_url = getImageUrl(req.file);
  
  if (!title || !image_url) {
    return res.status(400).json({ success: false, message: 'Certificate title and image are required.' });
  }

  try {
    const query = 'INSERT INTO certificates (title, issuer, image_url) VALUES (?, ?, ?)';
    const [result] = await pool.query(query, [title, issuer, image_url]);
    res.status(201).json({ success: true, insertId: result.insertId, message: 'Certificate added successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/certificates/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM certificates WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Certificate not found.' });
    }
    res.json({ success: true, message: 'Certificate deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ success: false, message: 'Database pool not initialized.' });
    }
    const [rows] = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Add a project (Admin Only)
app.post('/api/projects', authenticateAdmin, upload.single('image'), validateImageMagicBytes, async (req, res) => {
  const { title, description, web_link, github_link, tech_stack } = req.body;
  const image_url = getImageUrl(req.file);
  
  if (!title) {
    return res.status(400).json({ success: false, message: 'Project title is required.' });
  }

  try {
    const query = 'INSERT INTO projects (title, description, web_link, github_link, tech_stack, image_url) VALUES (?, ?, ?, ?, ?, ?)';
    const [result] = await pool.query(query, [title, description, web_link, github_link, tech_stack, image_url]);
    res.status(201).json({ success: true, insertId: result.insertId, message: 'Project added successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Delete a project (Admin Only)
app.delete('/api/projects/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM projects WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    res.json({ success: true, message: 'Project deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Get Profile Picture
app.get('/api/settings/profile-pic', async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ success: false, message: 'Database not ready' });
    const [rows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['profile_pic_url']);
    if (rows.length > 0 && rows[0].setting_value) {
      res.json({ success: true, url: rows[0].setting_value });
    } else {
      res.json({ success: true, url: null });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Update Profile Picture
app.post('/api/settings/profile-pic', authenticateAdmin, upload.single('image'), validateImageMagicBytes, async (req, res) => {
  const image_url = getImageUrl(req.file);

  if (!image_url) {
    return res.status(400).json({ success: false, message: 'Profile picture image is required.' });
  }

  try {
    const query = `INSERT INTO settings (setting_key, setting_value) VALUES ('profile_pic_url', ?)
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`;
    await pool.query(query, [image_url]);
    res.json({ success: true, url: image_url, message: 'Profile picture updated successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Multer error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors (file too large, too many files, etc.)
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'File is too large. Maximum size is 5MB.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.message === 'Only image files are allowed.') {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.message === 'Request aborted') {
    // Client disconnected mid-upload — log quietly, don't crash
    console.warn('Upload aborted by client.');
    return; // response is already gone, nothing to send
  }
  // Pass other errors to Express default handler
  next(err);
});

// Fallback to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start DB then server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error("Failed to start server due to DB init error:", err);
});

