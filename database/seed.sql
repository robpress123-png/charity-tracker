-- Charity Tracker Seed Data
-- Test users and initial data for development

-- Insert test users with appropriate permissions
-- Passwords are hashed versions of the plaintext passwords shown in comments

-- Demo user (password: demo)
INSERT OR REPLACE INTO users (id, email, name, password_hash, role, license_type, donation_limit) VALUES
('demo-user-id-1234', 'demo@example.com', 'Demo User', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeqBl5.DW8qZJe5Ni', 'user', 'paid', 999999);

-- Admin user (password: admin123)
INSERT OR REPLACE INTO users (id, email, name, password_hash, role, license_type, donation_limit) VALUES
('admin-user-id-5678', 'admin@example.com', 'Admin User', '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 'paid', 999999);

-- Test user (password: test123)
INSERT OR REPLACE INTO users (id, email, name, password_hash, role, license_type, donation_limit) VALUES
('test-user-id-9999', 'test@example.com', 'Test User', '$2b$12$O12kKRFJ5k1i1JOQ2Z1Z8eYr7ZfLq8uYr7ZfLq8uYr7ZfLq8uYr7Z', 'user', 'paid', 999999);

-- Insert popular charities for autocomplete functionality
INSERT OR REPLACE INTO charities (id, name, ein, is_verified) VALUES
('charity-red-cross', 'American Red Cross', '530196605', true),
('charity-salvation-army', 'The Salvation Army', '135562351', true),
('charity-goodwill', 'Goodwill Industries International', '530196517', true),
('charity-united-way', 'United Way Worldwide', '131635294', true),
('charity-st-jude', 'St. Jude Children''s Research Hospital', '621386609', true),
('charity-habitat', 'Habitat for Humanity International', '311914868', true),
('charity-feeding-america', 'Feeding America', '363673599', true),
('charity-wounded-warrior', 'Wounded Warrior Project', '200370934', true),
('charity-cancer-society', 'American Cancer Society', '131788491', true),
('charity-heart-association', 'American Heart Association', '135613797', true),
('charity-diabetes-association', 'American Diabetes Association', '135599908', true),
('charity-march-of-dimes', 'March of Dimes', '135171672', true),
('charity-make-a-wish', 'Make-A-Wish Foundation of America', '861482225', true),
('charity-boys-girls-club', 'Boys & Girls Clubs of America', '131624228', true),
('charity-ymca', 'YMCA of the USA', '131624228', true),
('charity-big-brothers-sisters', 'Big Brothers Big Sisters of America', '135647704', true),
('charity-doctors-without-borders', 'Doctors Without Borders USA', '133433452', true),
('charity-oxfam', 'Oxfam America', '237069110', true),
('charity-world-vision', 'World Vision', '951922279', true),
('charity-care', 'CARE USA', '131685039', true),
('charity-unicef', 'UNICEF USA', '131760110', true),
('charity-nature-conservancy', 'The Nature Conservancy', '530242652', true),
('charity-sierra-club', 'Sierra Club Foundation', '946069890', true),
('charity-eff', 'Electronic Frontier Foundation', '043091431', true),
('charity-aclu', 'American Civil Liberties Union Foundation', '136213516', true),
('charity-planned-parenthood', 'Planned Parenthood Federation of America', '131644147', true),
('charity-humane-society', 'The Humane Society of the United States', '530225390', true),
('charity-aspca', 'American Society for Prevention of Cruelty to Animals', '131623829', true),
('charity-local-food-bank', 'Local Food Bank (Example)', '123456789', false),
('charity-local-animal-shelter', 'Local Animal Shelter (Example)', '987654321', false);

-- Insert sample item valuations for donation assistance
INSERT OR REPLACE INTO item_valuations (category, item_name, condition_good, condition_fair, condition_poor, last_updated, source) VALUES
('Clothing', 'Men''s Suit', 60.00, 40.00, 20.00, '2024-01-01', 'goodwill'),
('Clothing', 'Men''s Dress Shirt', 12.00, 8.00, 4.00, '2024-01-01', 'goodwill'),
('Clothing', 'Men''s Pants', 15.00, 10.00, 5.00, '2024-01-01', 'goodwill'),
('Clothing', 'Women''s Dress', 20.00, 12.00, 6.00, '2024-01-01', 'goodwill'),
('Clothing', 'Women''s Blouse', 12.00, 8.00, 4.00, '2024-01-01', 'goodwill'),
('Clothing', 'Children''s Outfit', 10.00, 6.00, 3.00, '2024-01-01', 'goodwill'),
('Electronics', 'Desktop Computer', 200.00, 100.00, 50.00, '2024-01-01', 'goodwill'),
('Electronics', 'Laptop Computer', 300.00, 150.00, 75.00, '2024-01-01', 'goodwill'),
('Electronics', 'Television (32")', 150.00, 100.00, 50.00, '2024-01-01', 'goodwill'),
('Electronics', 'DVD Player', 25.00, 15.00, 8.00, '2024-01-01', 'goodwill'),
('Furniture', 'Dining Table', 100.00, 60.00, 30.00, '2024-01-01', 'goodwill'),
('Furniture', 'Chair', 25.00, 15.00, 8.00, '2024-01-01', 'goodwill'),
('Furniture', 'Sofa', 150.00, 100.00, 50.00, '2024-01-01', 'goodwill'),
('Furniture', 'Bed Frame', 75.00, 50.00, 25.00, '2024-01-01', 'goodwill'),
('Books', 'Hardcover Book', 3.00, 2.00, 1.00, '2024-01-01', 'goodwill'),
('Books', 'Paperback Book', 1.00, 0.75, 0.50, '2024-01-01', 'goodwill'),
('Household', 'Kitchen Appliance (Small)', 15.00, 10.00, 5.00, '2024-01-01', 'goodwill'),
('Household', 'Cookware Set', 25.00, 15.00, 8.00, '2024-01-01', 'goodwill'),
('Sports', 'Bicycle', 75.00, 50.00, 25.00, '2024-01-01', 'goodwill'),
('Sports', 'Exercise Equipment', 50.00, 30.00, 15.00, '2024-01-01', 'goodwill');

-- Sample donations for testing (only create if users exist)
INSERT OR REPLACE INTO donations (id, user_id, charity_id, type, date, tax_deductible_amount, description) VALUES
('sample-donation-1', 'demo-user-id-1234', 'charity-red-cross', 'money', '2024-01-15', 100.00, 'Monthly donation'),
('sample-donation-2', 'demo-user-id-1234', 'charity-goodwill', 'items', '2024-02-01', 85.00, 'Clothing donation'),
('sample-donation-3', 'demo-user-id-1234', 'charity-local-food-bank', 'money', '2024-03-10', 50.00, 'Food bank support');

-- Create a sample session for demo user (expires in 7 days)
INSERT OR REPLACE INTO user_sessions (id, user_id, expires_at, csrf_token) VALUES
('demo-session-12345', 'demo-user-id-1234', datetime('now', '+7 days'), 'demo-csrf-token-67890');

PRAGMA foreign_keys = ON;