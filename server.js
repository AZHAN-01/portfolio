const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();
console.log("SMTP_USER exists:", !!process.env.SMTP_USER);
console.log("SMTP_PASS exists:", !!process.env.SMTP_PASS);
// Setup Multer Storage
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

const app = express();
const PORT = process.env.PORT || 3000;

// Admin authentication configs
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_SESSION_TOKEN = process.env.ADMIN_SESSION_TOKEN || 'azhan-super-secret-session-token';

app.use(cors());
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
  database: process.env.MYSQLDATABASE
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

// Middleware to authenticate admin
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.split(' ')[1] === ADMIN_SESSION_TOKEN) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized. Admin access required.' });
  }
}

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
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM admin_users');
    if (rows[0].count > 0) {
      return res.status(403).json({ success: false, message: 'Admin account already exists.' });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [email, hash]);
    res.json({ success: true, token: ADMIN_SESSION_TOKEN });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Login
app.post('/api/auth/login', async (req, res) => {
  const { password } = req.body;
  try {
    const [rows] = await pool.query('SELECT password_hash FROM admin_users LIMIT 1');
    if (rows.length === 0) return res.status(401).json({ success: false, message: 'No admin configured. Please register first.' });
    
    const match = await bcrypt.compare(password, rows[0].password_hash);
    if (match) {
      res.json({ success: true, token: ADMIN_SESSION_TOKEN });
    } else {
      res.status(401).json({ success: false, message: 'Invalid Admin Password.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE email = ? LIMIT 1', [email]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Email not found.' });

    // Generate 4-digit code
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await pool.query('UPDATE admin_users SET reset_code = ?, reset_expires = ? WHERE id = ?', [code, expires, rows[0].id]);

    // Send email
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error("SMTP credentials missing in .env. Reset code is:", code);
        // Fallback for local testing if SMTP is not configured.
        return res.json({ success: true, message: 'Verification code sent (check server console since SMTP is missing).' });
    }

    const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});
try {
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Admin Password Reset Code',
    text: `Your password reset code is: ${code}`
  });

  console.log("EMAIL SENT SUCCESSFULLY");
} catch (err) {
  console.error("EMAIL ERROR:", err);
}

    res.json({ success: true, message: 'Verification code sent.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Verify Code
app.post('/api/auth/verify-code', async (req, res) => {
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
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE email = ? AND reset_code = ? AND reset_expires > NOW() LIMIT 1', [email, code]);
    if (rows.length === 0) return res.status(400).json({ success: false, message: 'Invalid or expired session.' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE admin_users SET password_hash = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?', [hash, rows[0].id]);
    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Auth Check
app.get('/api/auth/check', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.split(' ')[1] === ADMIN_SESSION_TOKEN) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
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
app.post('/api/projects', authenticateAdmin, upload.single('image'), async (req, res) => {
  const { title, description, web_link, github_link, tech_stack } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;
  
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
app.post('/api/settings/profile-pic', authenticateAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image uploaded.' });
  }
  const image_url = `/uploads/${req.file.filename}`;
  try {
    const query = `
      INSERT INTO settings (setting_key, setting_value) 
      VALUES ('profile_pic_url', ?) 
      ON DUPLICATE KEY UPDATE setting_value = ?
    `;
    await pool.query(query, [image_url, image_url]);
    res.json({ success: true, url: image_url, message: 'Profile picture updated.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
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
});
