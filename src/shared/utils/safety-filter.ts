// Regular expressions for PII detection
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_REGEX = /(\+\d{1,3}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
const CREDIT_CARD_REGEX = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;

// Harmful content patterns
const HARMFUL_PATTERNS = [
  /\b(hack|exploit|inject|auth|password|token)\b/i,
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /{{.*}}|{%.*%}/g, // Template injection patterns
];

// Abusive language patterns - basic set, should be expanded
const ABUSIVE_PATTERNS = [/\b(stupid|idiot|moron|kill|death)\b/i];

/**
 * Validates and sanitizes user input
 * @param input - Raw user message content
 * @returns string - Sanitized message content
 * @throws Error if input is invalid or contains harmful content
 */
export function validateInput(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input: Message must be a non-empty string');
  }

  // Trim and normalize whitespace
  let sanitized = input.trim().replace(/\s+/g, ' ');

  // Length validation
  if (sanitized.length > 2000) {
    sanitized = sanitized.substring(0, 2000) + '...';
  }

  // Check for harmful content
  if (containsHarmfulContent(sanitized)) {
    throw new Error('Message contains potentially harmful content');
  }

  // Remove PII if present
  sanitized = removePII(sanitized);

  // Basic HTML/markdown sanitization
  sanitized = sanitized
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[\\`*_{}[\]()#+\-.!]/g, (match) => '\\' + match); // Escape markdown

  return sanitized;
}

/**
 * Checks if input contains harmful content
 * @param input - Message content to check
 * @returns boolean - Whether input contains harmful content
 */
export function containsHarmfulContent(input: string): boolean {
  // Check for harmful patterns
  const hasHarmfulPattern = HARMFUL_PATTERNS.some((pattern) => pattern.test(input));

  // Check for abusive language
  const hasAbusiveLanguage = ABUSIVE_PATTERNS.some((pattern) => pattern.test(input));

  // Check for potential SQL injection
  const hasSqlInjection = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)/i.test(input);

  return hasHarmfulPattern || hasAbusiveLanguage || hasSqlInjection;
}

/**
 * Removes personally identifiable information
 * @param input - Message content to sanitize
 * @returns string - Sanitized message content
 */
export function removePII(input: string): string {
  return input
    // Replace email addresses
    .replace(EMAIL_REGEX, '[EMAIL REDACTED]')
    // Replace phone numbers
    .replace(PHONE_REGEX, '[PHONE REDACTED]')
    // Replace credit card numbers
    .replace(CREDIT_CARD_REGEX, '[CREDIT CARD REDACTED]')
    // Replace potential SSN/ID numbers (9 consecutive digits)
    .replace(/\b\d{9}\b/g, '[ID REDACTED]')
    // Replace IP addresses
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP REDACTED]');
}
