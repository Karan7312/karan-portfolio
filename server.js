const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

// Create uploads directory
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'videos');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for video uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /mp4|webm|ogg|mov|avi|mkv/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only video files are allowed!'));
    }
});

// SQLite Database using sql.js
const initSqlJs = require('sql.js');
let db;

async function initDatabase() {
    const SQL = await initSqlJs();
    const dbPath = path.join(__dirname, 'database.db');

    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            videoPath TEXT NOT NULL,
            thumbnail TEXT,
            duration TEXT,
            description TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS experiences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company TEXT NOT NULL,
            role TEXT NOT NULL,
            duration TEXT NOT NULL,
            description TEXT,
            isCurrent INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS skills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            proficiency INTEGER DEFAULT 50,
            icon TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS inquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            projectType TEXT,
            budget TEXT,
            message TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'new'
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    `);

    // Create default admin if not exists
    const adminExists = db.exec("SELECT * FROM admin WHERE username = 'admin'");
    if (adminExists.length === 0) {
        const hashedPassword = bcrypt.hashSync('karan123', 10);
        db.run("INSERT INTO admin (username, password) VALUES (?, ?)", ['admin', hashedPassword]);
    }

    saveDatabase();
    console.log('Database initialized');
}

function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(path.join(__dirname, 'database.db'), buffer);
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use(session({
    secret: 'karan-portfolio-secret-key',
    resave: false,
    saveUninitialized: false
}));

// ==================== PUBLIC API ROUTES ====================

// Get all videos
app.get('/api/videos', (req, res) => {
    const stmt = db.prepare('SELECT * FROM videos ORDER BY createdAt DESC');
    const videos = [];
    while (stmt.step()) {
        videos.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(videos);
});

// Get all experiences
app.get('/api/experiences', (req, res) => {
    const stmt = db.prepare('SELECT * FROM experiences ORDER BY isCurrent DESC, id DESC');
    const experiences = [];
    while (stmt.step()) {
        experiences.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(experiences);
});

// Get all skills
app.get('/api/skills', (req, res) => {
    const stmt = db.prepare('SELECT * FROM skills ORDER BY category, proficiency DESC');
    const skills = [];
    while (stmt.step()) {
        skills.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(skills);
});

// Submit contact form (public)
app.post('/api/inquiries', (req, res) => {
    const { name, email, projectType, budget, message } = req.body;
    db.run("INSERT INTO inquiries (name, email, projectType, budget, message) VALUES (?, ?, ?, ?, ?)",
        [name, email, projectType, budget, message]);
    saveDatabase();
    res.json({ message: 'Inquiry submitted successfully!' });
});

// ==================== ADMIN API ROUTES ====================

// Middleware to check admin auth
function requireAdmin(req, res, next) {
    if (!req.session.adminId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Admin login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const stmt = db.prepare('SELECT * FROM admin WHERE username = ?');
    stmt.bind([username]);

    if (stmt.step()) {
        const admin = stmt.getAsObject();
        stmt.free();

        if (bcrypt.compareSync(password, admin.password)) {
            req.session.adminId = admin.id;
            res.json({ message: 'Login successful' });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } else {
        stmt.free();
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out successfully' });
});

// Check admin status
app.get('/api/admin/check', (req, res) => {
    res.json({ authenticated: !!req.session.adminId });
});

// ==================== ADMIN VIDEO ROUTES ====================

// Add video with file upload
app.post('/api/admin/videos', requireAdmin, upload.single('video'), (req, res) => {
    try {
        const { title, category, duration, description } = req.body;
        const videoPath = req.file ? '/uploads/videos/' + req.file.filename : '';

        db.run("INSERT INTO videos (title, category, videoPath, duration, description) VALUES (?, ?, ?, ?, ?)",
            [title, category, videoPath, duration, description]);
        saveDatabase();

        res.json({ message: 'Video uploaded successfully!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add video with URL (YouTube/Vimeo)
app.post('/api/admin/videos/url', requireAdmin, (req, res) => {
    const { title, category, videoUrl, duration, description } = req.body;

    db.run("INSERT INTO videos (title, category, videoPath, duration, description) VALUES (?, ?, ?, ?, ?)",
        [title, category, videoUrl, duration, description]);
    saveDatabase();

    res.json({ message: 'Video added successfully!' });
});

// Delete video
app.delete('/api/admin/videos/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);

    // Get video path first
    const stmt = db.prepare('SELECT videoPath FROM videos WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) {
        const video = stmt.getAsObject();
        stmt.free();

        // Delete file if local
        if (video.videoPath && !video.videoPath.includes('http')) {
            const filePath = path.join(__dirname, 'public', video.videoPath);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        db.run('DELETE FROM videos WHERE id = ?', [id]);
        saveDatabase();
        res.json({ message: 'Video deleted successfully' });
    } else {
        stmt.free();
        res.status(404).json({ error: 'Video not found' });
    }
});

// ==================== ADMIN EXPERIENCE ROUTES ====================

app.post('/api/admin/experiences', requireAdmin, (req, res) => {
    const { company, role, duration, description, isCurrent } = req.body;
    db.run("INSERT INTO experiences (company, role, duration, description, isCurrent) VALUES (?, ?, ?, ?, ?)",
        [company, role, duration, description, isCurrent ? 1 : 0]);
    saveDatabase();
    res.json({ message: 'Experience added successfully!' });
});

app.delete('/api/admin/experiences/:id', requireAdmin, (req, res) => {
    db.run('DELETE FROM experiences WHERE id = ?', [parseInt(req.params.id)]);
    saveDatabase();
    res.json({ message: 'Experience deleted successfully' });
});

// ==================== ADMIN SKILLS ROUTES ====================

app.post('/api/admin/skills', requireAdmin, (req, res) => {
    const { name, category, proficiency, icon } = req.body;
    db.run("INSERT INTO skills (name, category, proficiency, icon) VALUES (?, ?, ?, ?)",
        [name, category, proficiency, icon]);
    saveDatabase();
    res.json({ message: 'Skill added successfully!' });
});

app.delete('/api/admin/skills/:id', requireAdmin, (req, res) => {
    db.run('DELETE FROM skills WHERE id = ?', [parseInt(req.params.id)]);
    saveDatabase();
    res.json({ message: 'Skill deleted successfully' });
});

// ==================== ADMIN INQUIRIES ROUTES ====================

app.get('/api/admin/inquiries', requireAdmin, (req, res) => {
    const stmt = db.prepare('SELECT * FROM inquiries ORDER BY createdAt DESC');
    const inquiries = [];
    while (stmt.step()) {
        inquiries.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(inquiries);
});

app.patch('/api/admin/inquiries/:id/status', requireAdmin, (req, res) => {
    const { status } = req.body;
    db.run('UPDATE inquiries SET status = ? WHERE id = ?', [status, parseInt(req.params.id)]);
    saveDatabase();
    res.json({ message: 'Status updated successfully' });
});

// ==================== PAGE ROUTES ====================

// Main portfolio page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Separate admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Admin panel at http://localhost:${PORT}/admin`);
    });
}).catch(err => {
    console.error('Database initialization failed:', err);
});
