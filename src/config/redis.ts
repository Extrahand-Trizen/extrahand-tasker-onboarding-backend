import { Redis } from 'ioredis';
import logger from './logger';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const config: any = {};
  let connectionInfo: { type: 'url' | 'config'; value: string | any } | null = null;

  // Option 1: Use REDIS_URL if provided
  if (process.env.REDIS_URL) {
    let redisUrl = process.env.REDIS_URL;
    
    // Fix common mistakes: replace https:// with redis://
    if (redisUrl.startsWith('https://')) {
      redisUrl = redisUrl.replace('https://', 'redis://');
      logger.warn('Redis URL had https://, converted to redis://', { originalUrl: process.env.REDIS_URL });
    }
    
    // Ensure it starts with redis:// or rediss://
    if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
      redisUrl = `redis://${redisUrl}`;
    }
    
    connectionInfo = { type: 'url', value: redisUrl };
    
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      connectTimeout: 10000,
    });
  } 
  // Option 2: Use individual config (REDIS_HOST, REDIS_PORT, etc.)
  else if (process.env.REDIS_HOST) {
    config.host = process.env.REDIS_HOST;
    config.port = parseInt(process.env.REDIS_PORT || '6379');
    
    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }

    connectionInfo = { type: 'config', value: config };

    redisClient = new Redis(config, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      connectTimeout: 15000, // Increased to 15 seconds
      lazyConnect: false, // Connect immediately
      enableReadyCheck: true,
      enableOfflineQueue: false, // Don't queue commands when offline
    });
  } else {
    throw new Error('Redis configuration not found. Set REDIS_URL or REDIS_HOST in environment variables.');
  }

  redisClient.on('connect', () => {
    logger.info('✅ Redis connected successfully');
  });

  redisClient.on('error', (err: any) => {
    const hostname = err.hostname || (connectionInfo?.type === 'config' ? connectionInfo.value.host : 'from URL');
    const port = connectionInfo?.type === 'config' ? connectionInfo.value.port : 'from URL';
    
    logger.error('Redis connection error:', {
      message: err.message,
      code: err.code,
      hostname,
      port,
    });
    
    // Provide helpful error messages
    if (err.code === 'ENOTFOUND' && err.hostname) {
      if (err.hostname.startsWith('srv-captain--')) {
        logger.error('💡 TROUBLESHOOTING: Internal service name not found', {
          attempted: err.hostname,
          suggestion: '1. Check Redis app name in CapRover matches this service name',
          suggestion2: '2. Verify Redis app is running in CapRover',
          suggestion3: '3. Try using external URL: REDIS_URL=redis://:Extrahand123@taskeronboardingredis.apps.extrahand.in:6379',
          suggestion4: '4. Or use external hostname: REDIS_HOST=taskeronboardingredis.apps.extrahand.in REDIS_PORT=6379',
        });
      } else {
        logger.error('💡 TROUBLESHOOTING: Hostname not found', {
          attempted: err.hostname,
          suggestion: 'Verify the hostname is correct and accessible',
        });
      }
    }
    
    // Handle timeout errors
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      logger.error('💡 TROUBLESHOOTING: Connection timeout or refused', {
        host: hostname,
        port: port,
        errorCode: err.code,
        suggestion1: '1. Verify Redis is running and accessible',
        suggestion2: '2. Redis cannot be accessed through HTTP/nginx - it uses its own binary protocol',
        suggestion3: '3. Redis must be accessible on port 6379 directly (not through nginx)',
        suggestion4: '4. If running on CapRover, use internal service name: REDIS_HOST=srv-captain--<redis-app-name> REDIS_PORT=6379',
        suggestion5: '5. If running locally, Redis must be exposed externally on port 6379 (not 80)',
        suggestion6: '6. Check if Redis is configured to allow external connections',
      });
    }
    
    // Handle protocol errors (HTTP response instead of Redis protocol)
    if (err.message && err.message.includes('Protocol error') && err.message.includes('got "H"')) {
      logger.error('💡 CRITICAL: Redis protocol error - received HTTP response instead of Redis protocol', {
        host: hostname,
        port: port,
        problem: 'You are trying to access Redis through HTTP/nginx, but Redis uses its own binary protocol',
        solution1: 'Redis CANNOT be accessed through CapRover nginx on port 80',
        solution2: 'Redis must be accessible on port 6379 directly (not through HTTP)',
        solution3: 'If running on CapRover, use internal service name: REDIS_HOST=srv-captain--<redis-app-name> REDIS_PORT=6379',
        solution4: 'If running locally, ensure Redis is exposed externally on port 6379, not through nginx',
        solution5: 'Alternative: Disable CSV queue functionality if Redis is not available',
        note: 'Port 80 is for HTTP traffic. Redis protocol is binary and cannot go through HTTP proxy.',
      });
    }
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', () => {
    logger.info('Redis reconnecting...');
  });

  return redisClient;
}

export function getRedisConnection(): string | { host: string; port: number; password?: string } {
  // Return connection config for BullMQ
  if (process.env.REDIS_URL) {
    let redisUrl = process.env.REDIS_URL.trim();
    
    logger.info('Processing REDIS_URL', { 
      original: redisUrl.substring(0, 50) + '...', // Log first 50 chars only
      hasHttps: redisUrl.startsWith('https://'),
      hasHttp: redisUrl.startsWith('http://'),
    });
    
    // Fix common mistakes: replace https:// or http:// with redis://
    if (redisUrl.startsWith('https://') || redisUrl.startsWith('http://')) {
      // Extract hostname from URL and convert to redis://
      // Handle formats like: https://hostname, https://hostname:port, https://user:pass@hostname:port
      let hostname = '';
      let port = '6379';
      let password = '';
      
      // Try to parse the URL
      try {
        const url = new URL(redisUrl);
        hostname = url.hostname;
        port = url.port || '6379';
        
        // If password is in env var, use it; otherwise try to extract from URL
        if (process.env.REDIS_PASSWORD) {
          password = `:${process.env.REDIS_PASSWORD}@`;
        } else if (url.password) {
          password = `:${url.password}@`;
        }
      } catch (e) {
        // If URL parsing fails, try regex
        const urlMatch = redisUrl.match(/https?:\/\/(?:([^:]+):([^@]+)@)?([^\/:]+)(?::(\d+))?/);
        if (urlMatch) {
          const urlPassword = urlMatch[2] || process.env.REDIS_PASSWORD;
          if (urlPassword) {
            password = `:${urlPassword}@`;
          }
          hostname = urlMatch[3];
          port = urlMatch[4] || '6379';
        } else {
          // Last resort: simple string replacement
          hostname = redisUrl.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
        }
      }
      
      redisUrl = `redis://${password}${hostname}:${port}`;
      
      logger.warn('Converted HTTP/HTTPS Redis URL to Redis protocol', {
        original: process.env.REDIS_URL.substring(0, 50) + '...',
        converted: redisUrl.replace(/:[^:@]+@/, ':*****@'), // Mask password in log
        hostname,
        port,
      });
    }
    
    // Ensure it starts with redis:// or rediss://
    if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
      redisUrl = `redis://${redisUrl}`;
    }
    
    logger.info('Final Redis connection string', { 
      connection: redisUrl.replace(/:[^:@]+@/, ':*****@'), // Mask password
    });
    
    return redisUrl;
  }
  
  // Use individual config (preferred for CapRover internal services)
  // If REDIS_URL was provided but we couldn't parse it, fall back to extracting from URL
  if (process.env.REDIS_URL && !process.env.REDIS_HOST) {
    const url = process.env.REDIS_URL.trim();
    
    // If it's still an https:// URL, extract hostname and use as connection object
    if (url.startsWith('https://') || url.startsWith('http://')) {
      try {
        const parsedUrl = new URL(url);
        const config: { host: string; port: number; password?: string } = {
          host: parsedUrl.hostname,
          port: parseInt(parsedUrl.port || '6379'),
        };
        
        if (process.env.REDIS_PASSWORD) {
          config.password = process.env.REDIS_PASSWORD;
        } else if (parsedUrl.password) {
          config.password = parsedUrl.password;
        }
        
        logger.warn('Using connection object format instead of URL (better for CapRover)', {
          host: config.host,
          port: config.port,
          hasPassword: !!config.password,
        });
        
        return config;
      } catch (e) {
        // If URL parsing fails, try regex
        const match = url.match(/https?:\/\/(?:([^:]+):([^@]+)@)?([^\/:]+)(?::(\d+))?/);
        if (match) {
          const config: { host: string; port: number; password?: string } = {
            host: match[3],
            port: parseInt(match[4] || '6379'),
          };
          
          if (process.env.REDIS_PASSWORD) {
            config.password = process.env.REDIS_PASSWORD;
          } else if (match[2]) {
            config.password = match[2];
          }
          
          logger.warn('Extracted Redis config from URL using regex', {
            host: config.host,
            port: config.port,
          });
          
          return config;
        }
      }
    }
  }
  
  // Use individual config (preferred for CapRover internal services)
  const config: { host: string; port: number; password?: string } = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  };
  
  if (process.env.REDIS_PASSWORD) {
    config.password = process.env.REDIS_PASSWORD;
  }
  
  // Log connection details for debugging
  logger.info('Using Redis connection config', {
    host: config.host,
    port: config.port,
    hasPassword: !!config.password,
    isInternalService: config.host.startsWith('srv-captain--'),
    isExternalHost: config.host.includes('.apps.extrahand.in'),
  });
  
  // If using external hostname, warn about potential port issues
  if (config.host.includes('.apps.extrahand.in') && config.port === 6379) {
    logger.warn('⚠️  Using external hostname with port 6379', {
      host: config.host,
      port: config.port,
      tip: 'If connection times out, Redis might be exposed on port 80. Try setting REDIS_PORT=80',
      tip2: 'Or use internal service name when running on CapRover: srv-captain--<redis-app-name>',
    });
  }
  
  // If using internal service name and it might not resolve, suggest alternatives
  if (config.host.startsWith('srv-captain--')) {
    logger.info('Using CapRover internal service name', {
      serviceName: config.host,
      tip: 'If connection fails, verify the Redis app name in CapRover matches this service name',
    });
  }
  
  return config;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
  }
}
