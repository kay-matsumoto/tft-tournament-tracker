// Validation Utilities - TFT Tournament Tracker
// Input validation, sanitization, and data validation functions

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

export const patterns = {
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  username: /^[a-zA-Z0-9_-]{3,20}$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  numeric: /^\d+$/,
  decimal: /^\d+(\.\d+)?$/,
  url: /^https?:\/\/.+/,
  discordTag: /^.{1,32}#\d{4}$/,
  twitchUsername: /^[a-zA-Z0-9_]{4,25}$/
};

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

export const sanitize = {
  string: (value) => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[<>]/g, '');
  },
  
  number: (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  },
  
  integer: (value) => {
    const num = parseInt(value);
    return isNaN(num) ? 0 : num;
  },
  
  boolean: (value) => {
    return Boolean(value);
  },
  
  username: (value) => {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  },
  
  filename: (value) => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[^a-zA-Z0-9._-]/g, '');
  }
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return patterns.email.test(email.trim());
};

export const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  
  // At least 8 characters
  if (password.length < 8) return false;
  
  // Contains uppercase, lowercase, number, and special character
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  return hasUpper && hasLower && hasNumber && hasSpecial;
};

export const validateUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    new URL(url);
    return patterns.url.test(url);
  } catch {
    return false;
  }
};

export const validatePlayerData = (data) => {
  const errors = [];
  
  // Required fields
  if (!data.username || typeof data.username !== 'string') {
    errors.push('Username is required');
  } else if (!patterns.username.test(data.username)) {
    errors.push('Username must be 3-20 characters and contain only letters, numbers, hyphens, and underscores');
  }
  
  if (!data.display_name || typeof data.display_name !== 'string') {
    errors.push('Display name is required');
  } else if (data.display_name.trim().length < 2 || data.display_name.trim().length > 50) {
    errors.push('Display name must be 2-50 characters');
  }
  
  if (!data.region || typeof data.region !== 'string') {
    errors.push('Region is required');
  } else {
    const validRegions = ['NA', 'EU', 'APAC', 'KR', 'CN', 'BR', 'LAN', 'LAS', 'OCE', 'JP', 'RU', 'TR'];
    if (!validRegions.includes(data.region)) {
      errors.push('Invalid region');
    }
  }
  
  // Optional fields validation
  if (data.country && (typeof data.country !== 'string' || data.country.length > 50)) {
    errors.push('Country must be a string with maximum 50 characters');
  }
  
  if (data.twitch_username && !patterns.twitchUsername.test(data.twitch_username)) {
    errors.push('Invalid Twitch username format');
  }
  
  if (data.discord_tag && !patterns.discordTag.test(data.discord_tag)) {
    errors.push('Invalid Discord tag format (should be username#1234)');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
};

export const validateTournamentData = (data) => {
  const errors = [];
  
  // Required fields
  if (!data.name || typeof data.name !== 'string') {
    errors.push('Tournament name is required');
  } else if (data.name.trim().length < 3 || data.name.trim().length > 100) {
    errors.push('Tournament name must be 3-100 characters');
  }
  
  if (!data.league_type || !['pro', 'ladder'].includes(data.league_type)) {
    errors.push('League type must be either "pro" or "ladder"');
  }
  
  if (!data.tournament_format || !['checkmate_20', 'highest_points'].includes(data.tournament_format)) {
    errors.push('Tournament format must be either "checkmate_20" or "highest_points"');
  }
  
  if (!data.start_date) {
    errors.push('Start date is required');
  } else {
    const startDate = new Date(data.start_date);
    if (isNaN(startDate.getTime())) {
      errors.push('Invalid start date format');
    }
  }
  
  // Optional fields validation
  if (data.total_days !== undefined) {
    const days = parseInt(data.total_days);
    if (isNaN(days) || days < 1 || days > 7) {
      errors.push('Total days must be between 1 and 7');
    }
  }
  
  if (data.games_per_day !== undefined) {
    const games = parseInt(data.games_per_day);
    if (isNaN(games) || games < 1 || games > 10) {
      errors.push('Games per day must be between 1 and 10');
    }
  }
  
  if (data.max_lobbies !== undefined) {
    const lobbies = parseInt(data.max_lobbies);
    if (isNaN(lobbies) || lobbies < 1 || lobbies > 50) {
      errors.push('Max lobbies must be between 1 and 50');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
};

export const validateGameResult = (data) => {
  const errors = [];
  
  if (!data.tournament_id || !Number.isInteger(data.tournament_id)) {
    errors.push('Tournament ID is required and must be an integer');
  }
  
  if (!data.player_id || !Number.isInteger(data.player_id)) {
    errors.push('Player ID is required and must be an integer');
  }
  
  if (!data.placement || !Number.isInteger(data.placement) || data.placement < 1 || data.placement > 8) {
    errors.push('Placement must be an integer between 1 and 8');
  }
  
  if (!data.day_number || !Number.isInteger(data.day_number) || data.day_number < 1) {
    errors.push('Day number is required and must be a positive integer');
  }
  
  if (!data.game_number || !Number.isInteger(data.game_number) || data.game_number < 1) {
    errors.push('Game number is required and must be a positive integer');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
};

// ============================================================================
// OBJECT VALIDATION
// ============================================================================

export const validateObject = (obj, schema) => {
  const errors = [];
  
  for (const [key, rules] of Object.entries(schema)) {
    const value = obj[key];
    
    // Check required fields
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${key} is required`);
      continue;
    }
    
    // Skip validation if field is not required and not present
    if (!rules.required && (value === undefined || value === null)) {
      continue;
    }
    
    // Type validation
    if (rules.type && typeof value !== rules.type) {
      errors.push(`${key} must be of type ${rules.type}`);
      continue;
    }
    
    // Length validation for strings
    if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
      errors.push(`${key} must be at least ${rules.minLength} characters`);
    }
    
    if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
      errors.push(`${key} must be no more than ${rules.maxLength} characters`);
    }
    
    // Range validation for numbers
    if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
      errors.push(`${key} must be at least ${rules.min}`);
    }
    
    if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
      errors.push(`${key} must be no more than ${rules.max}`);
    }
    
    // Pattern validation
    if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
      errors.push(`${key} format is invalid`);
    }
    
    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${key} must be one of: ${rules.enum.join(', ')}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
};

export const validateArray = (arr, itemValidator) => {
  if (!Array.isArray(arr)) {
    return {
      valid: false,
      errors: ['Must be an array']
    };
  }
  
  const errors = [];
  const results = [];
  
  arr.forEach((item, index) => {
    const result = itemValidator(item);
    results.push(result);
    
    if (!result.valid) {
      errors.push(`Item ${index + 1}: ${result.errors.join(', ')}`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors: errors,
    results: results
  };
};

// ============================================================================
// REQUEST VALIDATION SCHEMAS
// ============================================================================

export const schemas = {
  loginSchema: {
    username: { required: true, type: 'string', minLength: 3 },
    password: { required: true, type: 'string', minLength: 6 }
  },
  
  createPlayerSchema: {
    username: { required: true, type: 'string', pattern: patterns.username },
    display_name: { required: true, type: 'string', minLength: 2, maxLength: 50 },
    region: { required: true, type: 'string', enum: ['NA', 'EU', 'APAC', 'KR', 'CN', 'BR', 'LAN', 'LAS', 'OCE', 'JP', 'RU', 'TR'] },
    country: { required: false, type: 'string', maxLength: 50 },
    twitch_username: { required: false, type: 'string', pattern: patterns.twitchUsername },
    discord_tag: { required: false, type: 'string', pattern: patterns.discordTag }
  },
  
  createTournamentSchema: {
    name: { required: true, type: 'string', minLength: 3, maxLength: 100 },
    league_type: { required: true, type: 'string', enum: ['pro', 'ladder'] },
    tournament_format: { required: true, type: 'string', enum: ['checkmate_20', 'highest_points'] },
    start_date: { required: true, type: 'string' },
    total_days: { required: false, type: 'number', min: 1, max: 7 },
    games_per_day: { required: false, type: 'number', min: 1, max: 10 }
  },
  
  gameResultsSchema: {
    tournament_id: { required: true, type: 'number' },
    day_number: { required: true, type: 'number', min: 1 },
    game_number: { required: true, type: 'number', min: 1 },
    results: { required: true, type: 'object' }
  }
};

export default {
  patterns,
  sanitize,
  validateEmail,
  validatePassword,
  validateUrl,
  validatePlayerData,
  validateTournamentData,
  validateGameResult,
  validateObject,
  validateArray,
  schemas
};