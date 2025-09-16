-- Charity Tracker D1 Database Schema
-- Optimized for Cloudflare D1 (SQLite)

-- Users table with license management
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    license_type TEXT DEFAULT 'free' CHECK (license_type IN ('free', 'paid')),
    license_expires_at DATETIME,
    donation_limit INTEGER DEFAULT 2,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT TRUE
);

-- Charities table
CREATE TABLE charities (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    ein TEXT UNIQUE,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_date DATETIME,
    verified_by TEXT REFERENCES users(id),
    metadata TEXT, -- JSON: {address, website, phone, description}
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Donations table with JSON metadata for flexibility
CREATE TABLE donations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    charity_id TEXT NOT NULL REFERENCES charities(id),
    type TEXT NOT NULL CHECK (type IN ('money', 'items', 'mileage', 'stock', 'crypto')),
    date DATE NOT NULL,
    tax_deductible_amount DECIMAL(10,2) NOT NULL,
    fair_market_value DECIMAL(10,2),
    cost_basis DECIMAL(10,2),
    capital_gains_avoided DECIMAL(10,2),
    description TEXT,
    metadata TEXT, -- JSON for type-specific fields
    receipt_file_id TEXT, -- R2 file reference
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Item valuations for donation assistance
CREATE TABLE item_valuations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    category TEXT NOT NULL,
    item_name TEXT NOT NULL,
    condition_good DECIMAL(6,2),
    condition_fair DECIMAL(6,2),
    condition_poor DECIMAL(6,2),
    last_updated DATE NOT NULL,
    source TEXT NOT NULL, -- 'goodwill', 'salvation_army', 'manual'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, item_name, source)
);

-- User sessions for authentication
CREATE TABLE user_sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at DATETIME NOT NULL,
    csrf_token TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Payment transactions for license management
CREATE TABLE payment_transactions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    stripe_payment_intent_id TEXT UNIQUE,
    amount DECIMAL(8,2) NOT NULL,
    currency TEXT DEFAULT 'usd',
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    license_type TEXT NOT NULL,
    license_duration_months INTEGER NOT NULL,
    metadata TEXT, -- JSON for additional payment data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- Audit logs for compliance and debugging
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    old_values TEXT, -- JSON
    new_values TEXT, -- JSON
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- File storage references
CREATE TABLE file_uploads (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    donation_id TEXT REFERENCES donations(id),
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    r2_key TEXT NOT NULL UNIQUE, -- R2 object key
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin-editable content (tooltips, help text, etc.)
CREATE TABLE admin_content (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    content_key TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('tooltip', 'help', 'guide')),
    is_active BOOLEAN DEFAULT TRUE,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_donations_user_date ON donations(user_id, date DESC);
CREATE INDEX idx_donations_type ON donations(type);
CREATE INDEX idx_sessions_user_expires ON user_sessions(user_id, expires_at);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_charities_verified ON charities(is_verified);
CREATE INDEX idx_charities_name ON charities(name);
CREATE INDEX idx_item_valuations_category ON item_valuations(category);
CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_payments_user_status ON payment_transactions(user_id, status);

-- Sample data for development
INSERT INTO charities (name, ein, is_verified, metadata) VALUES
    ('American Red Cross', '53-0196605', TRUE, '{"address": "2025 E St NW, Washington, DC 20006", "website": "https://redcross.org", "phone": "(202) 303-5000"}'),
    ('Salvation Army', '13-1623228', TRUE, '{"address": "440 West Nyack Road, West Nyack, NY 10994", "website": "https://salvationarmyusa.org", "phone": "(845) 620-7200"}'),
    ('Goodwill Industries', '53-0196517', TRUE, '{"address": "15810 Indianola Dr, Rockville, MD 20855", "website": "https://goodwill.org", "phone": "(301) 838-4000"}'),
    ('United Way', '13-5562162', TRUE, '{"address": "1331 Pennsylvania Ave NW, Washington, DC 20004", "website": "https://unitedway.org", "phone": "(703) 836-7112"}');

-- Sample item valuations
INSERT INTO item_valuations (category, item_name, condition_good, condition_fair, condition_poor, source, last_updated) VALUES
    ('Clothing', 'Men''s Shirt', 8.00, 4.00, 2.00, 'goodwill', date('now')),
    ('Clothing', 'Women''s Dress', 12.00, 6.00, 3.00, 'goodwill', date('now')),
    ('Clothing', 'Pants/Slacks', 10.00, 5.00, 2.50, 'goodwill', date('now')),
    ('Household', 'Coffee Maker', 15.00, 8.00, 4.00, 'goodwill', date('now')),
    ('Household', 'Microwave', 50.00, 25.00, 12.00, 'goodwill', date('now')),
    ('Electronics', 'Television (32" or less)', 75.00, 40.00, 20.00, 'goodwill', date('now')),
    ('Electronics', 'Computer Monitor', 60.00, 30.00, 15.00, 'goodwill', date('now')),
    ('Books', 'Hardcover Book', 3.00, 1.50, 0.75, 'goodwill', date('now')),
    ('Books', 'Paperback Book', 1.50, 0.75, 0.35, 'goodwill', date('now'));

-- Admin content for tooltips and help
INSERT INTO admin_content (content_key, title, content, content_type, created_by) VALUES
    ('donation_fmv_help', 'Fair Market Value', 'The price a willing buyer would pay a willing seller for your donated items. Use our valuation guide or get a professional appraisal for items over $5,000.', 'tooltip', '1'),
    ('crypto_tax_benefits', 'Cryptocurrency Tax Benefits', 'Donating appreciated cryptocurrency avoids capital gains tax and provides a tax deduction for the full fair market value. This can be more tax-efficient than selling crypto and donating cash.', 'help', '1'),
    ('mileage_rate', 'IRS Mileage Rate', 'For 2024, the IRS allows 14 cents per mile for charitable driving. Keep records of your trips including date, destination, and purpose.', 'tooltip', '1');