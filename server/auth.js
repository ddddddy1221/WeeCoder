import { createHmac, timingSafeEqual } from 'node:crypto';

const DEMO_PASSWORD = 'demo123';
const SESSION_SECRET = 'wee-coder-local-session-secret';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function authenticateDemoUser({ userId = '', password = '' } = {}, users = []) {
  const user = users.find((item) => item.id === String(userId || '').trim());
  if (!user || String(password || '') !== DEMO_PASSWORD) {
    return null;
  }

  return user;
}

export function createSessionToken(user, { now = Date.now(), secret = SESSION_SECRET } = {}) {
  const payload = encodeSegment({
    sub: user.id,
    iat: now,
  });
  const signature = sign(payload, secret);

  return `${payload}.${signature}`;
}

export function verifySessionToken(token, users = [], { now = Date.now(), secret = SESSION_SECRET } = {}) {
  const [payloadSegment, signature] = String(token || '').split('.');
  if (!payloadSegment || !signature || !safeEqual(signature, sign(payloadSegment, secret))) {
    return null;
  }

  const payload = decodeSegment(payloadSegment);
  if (!payload?.sub || !Number.isFinite(payload.iat)) {
    return null;
  }

  if (now - payload.iat > SESSION_MAX_AGE_MS) {
    return null;
  }

  return users.find((user) => user.id === payload.sub) || null;
}

function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeSegment(segment) {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function sign(payloadSegment, secret) {
  return createHmac('sha256', secret).update(payloadSegment).digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
