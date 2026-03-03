const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();

// Supabase Configuration
const supabaseUrl = 'https://hcaccdvvnjhnypuhgqqc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjYWNjZHZ2bmhobnlwdWhnZ3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY2NzIwMDAsImV4cCI6MjA1MjI0ODAwMH0.sb_publishable_SpmtA6LdDYE8PtVJd8BViw_gmEt9dNk';

const supabase = createClient(supabaseUrl, supabaseKey);

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
app.get('/api/videos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all experiences
app.get('/api/experiences', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('experiences')
            .select('*')
            .order('is_current', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all skills
app.get('/api/skills', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('skills')
            .select('*')
            .order('proficiency', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Submit contact form (public)
app.post('/api/inquiries', async (req, res) => {
    try {
        const { name, email, projectType, budget, message } = req.body;
        const { data, error } = await supabase
            .from('inquiries')
            .insert([{ name, email, project_type: projectType, budget, message, status: 'new' }])
            .select();
        if (error) throw error;
        res.json({ message: 'Inquiry submitted successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== ADMIN API ROUTES ====================

function requireAdmin(req, res, next) {
    if (!req.session.adminId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Admin login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const { data, error } = await supabase
            .from('admin')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !data) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (bcrypt.compareSync(password, data.password)) {
            req.session.adminId = data.id;
            res.json({ message: 'Login successful' });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
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

app.post('/api/admin/videos/url', requireAdmin, async (req, res) => {
    try {
        const { title, category, videoUrl, duration, description } = req.body;
        const { data, error } = await supabase
            .from('videos')
            .insert([{
                title,
                category,
                video_path: videoUrl,
                duration,
                description
            }])
            .select();
        if (error) throw error;
        res.json({ message: 'Video added successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/videos/:id', requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('videos')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ message: 'Video deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== ADMIN EXPERIENCE ROUTES ====================

app.post('/api/admin/experiences', requireAdmin, async (req, res) => {
    try {
        const { company, role, duration, description, isCurrent } = req.body;
        const { data, error } = await supabase
            .from('experiences')
            .insert([{
                company,
                role,
                duration,
                description,
                is_current: isCurrent || false
            }])
            .select();
        if (error) throw error;
        res.json({ message: 'Experience added successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/experiences/:id', requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('experiences')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ message: 'Experience deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== ADMIN SKILLS ROUTES ====================

app.post('/api/admin/skills', requireAdmin, async (req, res) => {
    try {
        const { name, category, proficiency, icon } = req.body;
        const { data, error } = await supabase
            .from('skills')
            .insert([{ name, category, proficiency, icon }])
            .select();
        if (error) throw error;
        res.json({ message: 'Skill added successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/skills/:id', requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('skills')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ message: 'Skill deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== ADMIN INQUIRIES ROUTES ====================

app.get('/api/admin/inquiries', requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('inquiries')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/admin/inquiries/:id/status', requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const { error } = await supabase
            .from('inquiries')
            .update({ status })
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ message: 'Status updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== PAGE ROUTES ====================

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
