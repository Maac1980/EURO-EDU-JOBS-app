CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT
);
INSERT OR IGNORE INTO users (email, password, name, role) VALUES 
('admin@example.com', 'admin123', 'Admin User', 'admin'),
('coordinator@example.com', 'coord123', 'Coordinator User', 'coordinator');
