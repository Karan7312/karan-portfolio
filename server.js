const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// For file uploads, we'll use the built-in parser for URL-encoded data
// For Vercel deployment, we handle uploads differently

const app = express();
const DATA_FILE = path.join(__dirname, 'data.json');

// Initialize data file
if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
        videos: [],
        experiences: [],
        skills: [],
        inquiries: [],
        admin: [{ username: 'admin', password: bcrypt.hashSync('karan123', 10) }]
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

function loadData() {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'karan-portfolio-secret-key',
    resave: false,
    saveUninitialized: false
}));

// ==================== PUBLIC API ROUTES ====================

// Get all videos
app.get('/api/videos', (req, res) => {
    const data = loadData();
    res.json(data.videos);
});

// Get all experiences
app.get('/api/experiences', (req, res) => {
    const data = loadData();
    res.json(data.experiences);
});

// Get all skills
app.get('/api/skills', (req, res) => {
    const data = loadData();
    res.json(data.skills);
});

// Submit contact form
app.post('/api/inquiries', (req, res) => {
    const data = loadData();
    const { name, email, projectType, budget, message } = req.body;
    const newInquiry = {
        id: Date.now(),
        name,
        email,
        projectType,
        budget,
        message,
        createdAt: new Date().toISOString(),
        status: 'new'
    };
    data.inquiries.unshift(newInquiry);
    saveData(data);
    res.json({ message: 'Inquiry submitted successfully!' });
});

// ==================== ADMIN API ROUTES ====================

function requireAdmin(req, res, next) {
    if (!req.session.adminId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

app.post('/api/admin/login', (req, res) => {
    const data = loadData();
    const { username, password } = req.body;
    const admin = data.admin.find(a => a.username === username);

    if (admin && bcrypt.compareSync(password, admin.password)) {
        req.session.adminId = admin.id;
        res.json({ message: 'Login successful' });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out successfully' });
});

app.get('/api/admin/check', (req, res) => {
    res.json({ authenticated: !!req.session.adminId });
});

// Videos - Add via JSON (for URL-based videos)
app.post('/api/admin/videos', requireAdmin, (req, res) => {
    const data = loadData();
    const { title, category, videoUrl, duration, description } = req.body;
    const newVideo = {
        id: Date.now(),
        title,
        category,
        videoUrl: videoUrl,
        duration,
        description,
        createdAt: new Date().toISOString()
    };
    data.videos.unshift(newVideo);
    saveData(data);
    res.json({ message: 'Video added successfully!' });
});

// Videos - Add via URL (YouTube/Vimeo)
app.post('/api/admin/videos/url', requireAdmin, (req, res) => {
    const data = loadData();
    const { title, category, videoUrl, duration, description } = req.body;
    const newVideo = {
        id: Date.now(),
        title,
        category,
        videoUrl: videoUrl,
        duration,
        description,
        createdAt: new Date().toISOString()
    };
    data.videos.unshift(newVideo);
    saveData(data);
    res.json({ message: 'Video added successfully!' });
});

app.delete('/api/admin/videos/:id', requireAdmin, (req, res) => {
    const data = loadData();
    data.videos = data.videos.filter(v => v.id != req.params.id);
    saveData(data);
    res.json({ message: 'Video deleted successfully' });
});

// Experiences
app.post('/api/admin/experiences', requireAdmin, (req, res) => {
    const data = loadData();
    const { company, role, duration, description, isCurrent } = req.body;
    const newExp = {
        id: Date.now(),
        company,
        role,
        duration,
        description,
        isCurrent
    };
    data.experiences.unshift(newExp);
    saveData(data);
    res.json({ message: 'Experience added successfully!' });
});

app.delete('/api/admin/experiences/:id', requireAdmin, (req, res) => {
    const data = loadData();
    data.experiences = data.experiences.filter(e => e.id != req.params.id);
    saveData(data);
    res.json({ message: 'Experience deleted successfully' });
});

// Skills
app.post('/api/admin/skills', requireAdmin, (req, res) => {
    const data = loadData();
    const { name, category, proficiency, icon } = req.body;
    const newSkill = {
        id: Date.now(),
        name,
        category,
        proficiency,
        icon
    };
    data.skills.push(newSkill);
    saveData(data);
    res.json({ message: 'Skill added successfully!' });
});

app.delete('/api/admin/skills/:id', requireAdmin, (req, res) => {
    const data = loadData();
    data.skills = data.skills.filter(s => s.id != req.params.id);
    saveData(data);
    res.json({ message: 'Skill deleted successfully' });
});

// Inquiries
app.get('/api/admin/inquiries', requireAdmin, (req, res) => {
    const data = loadData();
    res.json(data.inquiries);
});

app.patch('/api/admin/inquiries/:id/status', requireAdmin, (req, res) => {
    const data = loadData();
    const inquiry = data.inquiries.find(i => i.id == req.params.id);
    if (inquiry) {
        inquiry.status = req.body.status;
        saveData(data);
    }
    res.json({ message: 'Status updated successfully' });
});

// Pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
