/**
 * Rate Limiting Utility for API Routes
 * 
 * Protects API endpoints from abuse by limiting the number of requests
 * per IP address within a time window.
 * 
 * Features:
 * - In-memory rate limiting (works locally and in production)
 * - Configurable limits and time windows
 * - Automatic cleanup of expired entries
 * - IP-based tracking with X-Forwarded-For support
 */

import type { NextApiRequest, NextApiResponse } from "next";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  uniqueTokenPerInterval?: number; // Max unique IPs to track
  interval: number; // Time window in milliseconds
  maxRequests: number; // Max requests per interval
}

// In-memory storage for rate limit tracking
const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Get client IP address from request
 * Handles both direct connections and proxied requests
 */
function getClientIp(req: NextApiRequest): string {
  // Check X-Forwarded-For header (used by proxies/load balancers)
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    // X-Forwarded-For can be a comma-separated list, take the first one
    const ip = typeof forwarded === "string" ? forwarded.split(",")[0] : forwarded[0];
    return ip.trim();
  }

  // Check X-Real-IP header (alternative header used by some proxies)
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return typeof realIp === "string" ? realIp : realIp[0];
  }

  // Fallback to socket remote address
  return req.socket.remoteAddress || "unknown";
}

/**
 * Clean up expired entries from the rate limit map
 * This prevents memory leaks by removing old entries
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    rateLimitMap.delete(key);
  }
}

/**
 * Rate limit middleware for Next.js API routes
 * 
 * @param config Rate limit configuration
 * @returns Middleware function that checks rate limits
 * 
 * @example
 * ```typescript
 * const limiter = rateLimit({
 *   interval: 15 * 60 * 1000, // 15 minutes
 *   maxRequests: 10,           // 10 requests per interval
 * });
 * 
 * export default async function handler(req: NextApiRequest, res: NextApiResponse) {
 *   // Check rate limit
 *   const rateLimitResult = await limiter.check(req, res);
 *   if (!rateLimitResult.success) {
 *     return res.status(429).json({ 
 *       error: "Too many requests", 
 *       retryAfter: rateLimitResult.retryAfter 
 *     });
 *   }
 *   
 *   // Handle request...
 * }
 * ```
 */
export function rateLimit(config: RateLimitConfig) {
  const { interval, maxRequests, uniqueTokenPerInterval = 500 } = config;

  return {
    /**
     * Check if the request should be rate limited
     * 
     * @returns Object with success status and optional retryAfter time
     */
    check: async (
      req: NextApiRequest,
      res: NextApiResponse
    ): Promise<{ success: boolean; retryAfter?: number }> => {
      const clientIp = getClientIp(req);
      const now = Date.now();

      // Periodic cleanup to prevent memory leaks
      if (Math.random() < 0.1) {
        // 10% chance to cleanup on each request
        cleanupExpiredEntries();
      }

      // Check if we're tracking too many unique IPs
      if (rateLimitMap.size >= uniqueTokenPerInterval) {
        // Clean up expired entries before rejecting
        cleanupExpiredEntries();

        // If still too many, reject to prevent memory issues
        if (rateLimitMap.size >= uniqueTokenPerInterval) {
          console.warn(`Rate limit map size exceeded: ${rateLimitMap.size} unique IPs`);
          return {
            success: false,
            retryAfter: Math.ceil(interval / 1000),
          };
        }
      }

      // Get or create rate limit entry for this IP
      let entry = rateLimitMap.get(clientIp);

      if (!entry || now > entry.resetTime) {
        // Create new entry or reset expired one
        entry = {
          count: 1,
          resetTime: now + interval,
        };
        rateLimitMap.set(clientIp, entry);

        // Set response headers
        res.setHeader("X-RateLimit-Limit", maxRequests.toString());
        res.setHeader("X-RateLimit-Remaining", (maxRequests - 1).toString());
        res.setHeader("X-RateLimit-Reset", entry.resetTime.toString());

        return { success: true };
      }

      // Increment request count
      entry.count += 1;

      // Calculate remaining requests
      const remaining = Math.max(0, maxRequests - entry.count);
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

      // Set response headers
      res.setHeader("X-RateLimit-Limit", maxRequests.toString());
      res.setHeader("X-RateLimit-Remaining", remaining.toString());
      res.setHeader("X-RateLimit-Reset", entry.resetTime.toString());

      // Check if limit exceeded
      if (entry.count > maxRequests) {
        res.setHeader("Retry-After", retryAfter.toString());
        
        console.warn(
          `Rate limit exceeded for IP: ${clientIp} (${entry.count}/${maxRequests} requests)`
        );

        return {
          success: false,
          retryAfter,
        };
      }

      return { success: true };
    },

    /**
     * Reset rate limit for a specific IP (useful for testing)
     */
    reset: (ip?: string): void => {
      if (ip) {
        rateLimitMap.delete(ip);
      } else {
        rateLimitMap.clear();
      }
    },

    /**
     * Get current statistics (useful for monitoring)
     */
    getStats: () => ({
      totalTrackedIPs: rateLimitMap.size,
      entries: Array.from(rateLimitMap.entries()).map(([ip, entry]) => ({
        ip: ip.substring(0, 10) + "...", // Partially hide IP for privacy
        count: entry.count,
        resetTime: new Date(entry.resetTime).toISOString(),
      })),
    }),
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  /**
   * Strict rate limiting for expensive operations
   * 5 requests per 15 minutes
   */
  strict: rateLimit({
    interval: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
  }),

  /**
   * Standard rate limiting for proof generation
   * 10 requests per 15 minutes
   */
  standard: rateLimit({
    interval: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
  }),

  /**
   * Relaxed rate limiting for testing/development
   * 20 requests per 5 minutes
   */
  relaxed: rateLimit({
    interval: 5 * 60 * 1000, // 5 minutes
    maxRequests: 20,
  }),
};

