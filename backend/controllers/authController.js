const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { getXpWithLevel } = require('../utils/xp');
const { sendMail } = require('../utils/mailer');
const { loadTemplate } = require('../utils/emailService');

const APP_BASE_URL = process.env.BACKEND_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// Helper function to generate JWT token
const generateToken = (userId, remember = false) => {
  const expiresIn = remember 
    ? process.env.JWT_REMEMBER_EXPIRES_IN 
    : process.env.JWT_EXPIRES_IN;

  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

// Helper to generate short-lived email verification token
const generateEmailVerifyToken = (userId) => {
  const expiresIn = process.env.JWT_EMAIL_VERIFY_EXPIRES_IN || '1h';
  const secret = process.env.JWT_EMAIL_VERIFY_SECRET || process.env.JWT_SECRET;
  return jwt.sign({ id: userId, purpose: 'verify_email' }, secret, { expiresIn });
};

// Register a new user
exports.register = async (req, res) => {
  try {
  const { firstName, lastName, email, password } = req.body;

    // Validate input
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide all required fields'
      });
    }

    // Check if user already exists
    const [existingUsers] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Email already in use'
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate username from first name and last name
    const username = `${firstName.toLowerCase()}_${lastName.toLowerCase()}${Math.floor(Math.random() * 100)}`;

    // Insert new user
    const [result] = await db.query(
      'INSERT INTO users (username, email, password_hash, email_verified) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, 0]
    );

    const userId = result.insertId;

    // Create user profile
    await db.query(
      'INSERT INTO user_profiles (user_id) VALUES (?)',
      [userId]
    );

    // Send email verification link
    try {
      const verifyToken = generateEmailVerifyToken(userId);
      const verifyUrl = `${APP_BASE_URL}/api/auth/verify?token=${encodeURIComponent(verifyToken)}`;
      const html = loadTemplate('verify_account.html', {
        firstName: firstName || username,
        verifyUrl
      });
      await sendMail({
        to: email,
        subject: 'Verify your CarbonPlay account',
        html
      });
    } catch (mailErr) {
      console.error('Failed to send verification email:', mailErr);
      // Do not block registration if email fails; client can request resend
    }

    res.status(201).json({
      status: 'success',
      message: 'Registration successful. Please check your email to verify your account.',
      data: {
        id: userId,
        username,
        email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred during registration'
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password, remember = false } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email and password'
      });
    }

    // Find user
    const [users] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    const user = users[0];

    // Check if password matches
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        status: 'error',
        message: 'Your account has been deactivated'
      });
    }

    // Require verified email
    if (user.email_verified === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'Please verify your email. Check your inbox for the verification link or request a new one.'
      });
    }

    // Generate token
    const token = generateToken(user.id, remember);

    res.status(200).json({
      status: 'success',
      token,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred during login'
    });
  }
};

// Verify email via token link
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send('Verification token is missing.');
    }

    const secret = process.env.JWT_EMAIL_VERIFY_SECRET || process.env.JWT_SECRET;
    const payload = jwt.verify(token, secret);
    if (!payload || payload.purpose !== 'verify_email' || !payload.id) {
      return res.status(400).send('Invalid verification token.');
    }

    const userId = payload.id;
    await db.query('UPDATE users SET email_verified = 1 WHERE id = ?', [userId]);

    // Redirect to login page with success flag
    return res.redirect('/login.html?verified=1');
  } catch (error) {
    console.error('Email verification error:', error);
    // Token could be expired or invalid
    return res.status(400).send('Verification link is invalid or has expired. Please request a new verification email.');
  }
};

// Resend verification email
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Email is required' });
    }

    const [users] = await db.query('SELECT id, username, email_verified FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No account found for that email' });
    }

    const user = users[0];
    if (user.email_verified === 1) {
      return res.status(200).json({ status: 'success', message: 'Email already verified. You can log in.' });
    }

    const verifyToken = generateEmailVerifyToken(user.id);
    const verifyUrl = `${APP_BASE_URL}/api/auth/verify?token=${encodeURIComponent(verifyToken)}`;
    const html = loadTemplate('verify_account.html', {
      firstName: user.username,
      verifyUrl
    });
    await sendMail({ to: email, subject: 'Verify your CarbonPlay account', html });

    return res.status(200).json({ status: 'success', message: 'Verification email sent. Please check your inbox.' });
  } catch (error) {
    console.error('Resend verification error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to send verification email' });
  }
};

// Get current user profile
exports.getMe = async (req, res) => {
  try {
    // req.user is set by the authentication middleware
    const user = req.user;

    // Get user profile
    const [profiles] = await db.query(
      'SELECT * FROM user_profiles WHERE user_id = ?',
      [user.id]
    );

    const profile = profiles.length > 0 ? profiles[0] : null;

    res.status(200).json({
      status: 'success',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        profile
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while retrieving profile'
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, country, household_size } = req.body;

    // Update username if provided
    if (username) {
      // Check if username is already taken by another user
      const [existingUsers] = await db.query(
        'SELECT * FROM users WHERE username = ? AND id != ?',
        [username, userId]
      );

      if (existingUsers.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Username already taken'
        });
      }

      await db.query(
        'UPDATE users SET username = ? WHERE id = ?',
        [username, userId]
      );
    }

    // Update profile fields if provided
    if (country !== undefined || household_size !== undefined) {
      const fields = [];
      const values = [];

      if (country !== undefined) {
        fields.push('country = ?');
        values.push(country);
      }

      if (household_size !== undefined) {
        fields.push('household_size = ?');
        values.push(household_size);
      }

      if (fields.length > 0) {
        values.push(userId);
        await db.query(
          `UPDATE user_profiles SET ${fields.join(', ')} WHERE user_id = ?`,
          values
        );
      }
    }

    // Get updated user data
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    const [profiles] = await db.query('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        id: users[0].id,
        username: users[0].username,
        email: users[0].email,
        role: users[0].role,
        profile: profiles[0] || null
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while updating profile'
    });
  }
};

// Upload profile picture
exports.uploadProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    // Get the file path relative to backend directory
    const profilePicturePath = `/uploads/profiles/${req.file.filename}`;

    // Update user profile with new picture path
    await db.query(
      'UPDATE user_profiles SET profile_picture = ? WHERE user_id = ?',
      [profilePicturePath, userId]
    );

    res.status(200).json({
      status: 'success',
      message: 'Profile picture uploaded successfully',
      data: {
        profilePicture: profilePicturePath
      }
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while uploading profile picture'
    });
  }
};

// Get current user's badges based on level
exports.getMyBadges = async (req, res) => {
  try {
    const userId = req.user.id;
    // Compute level from XP
    const xpInfo = await getXpWithLevel(userId);
    const level = xpInfo.level || 1;

    // Minimal badge catalog with level thresholds
    const badgeCatalog = [
      { key: 'sprout', name: 'Starter Seed', level_required: 1, icon: '🌱' },
      { key: 'leaf_learner', name: 'Leaf Learner', level_required: 3, icon: '🍃' },
      { key: 'green_rookie', name: 'Green Rookie', level_required: 5, icon: '🟢' },
      { key: 'eco_explorer', name: 'Eco Explorer', level_required: 10, icon: '🧭' },
      { key: 'carbon_cutter', name: 'Carbon Cutter', level_required: 15, icon: '✂️' },
      { key: 'planet_protector', name: 'Planet Protector', level_required: 20, icon: '🛡️' }
    ];

    const badges = badgeCatalog.map(b => ({
      key: b.key,
      name: b.name,
      level_required: b.level_required,
      icon: b.icon,
      earned: level >= b.level_required
    }));

    return res.status(200).json({
      status: 'success',
      data: {
        level,
        xp_total: xpInfo.xp_total,
        badges
      }
    });
  } catch (error) {
    console.error('getMyBadges error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to load badges' });
  }
};
