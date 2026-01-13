# SmartSpec Pro - Nginx Reverse Proxy Dockerfile
# Production-ready Nginx with custom configuration

FROM nginx:1.25-alpine

LABEL maintainer="SmartSpec Team"
LABEL description="Nginx reverse proxy for SmartSpec Pro"

# Install additional tools
RUN apk add --no-cache \
    curl \
    openssl \
    tzdata

# Set timezone
ENV TZ=Asia/Bangkok

# Remove default configuration
RUN rm -rf /etc/nginx/conf.d/*

# Copy custom configuration
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/default.conf /etc/nginx/conf.d/default.conf

# Create directories
RUN mkdir -p /etc/nginx/ssl \
    && mkdir -p /var/cache/nginx \
    && mkdir -p /var/log/nginx

# Create custom error pages
RUN echo '<!DOCTYPE html><html><head><title>Service Unavailable</title><style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}div{text-align:center;padding:40px;background:white;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}h1{color:#e74c3c;margin-bottom:10px}p{color:#666}</style></head><body><div><h1>503</h1><p>Service temporarily unavailable</p><p>SmartSpec Pro is starting up...</p></div></body></html>' > /usr/share/nginx/html/50x.html

# Set proper permissions
RUN chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && chown -R nginx:nginx /etc/nginx/conf.d

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/nginx-health || exit 1

# Expose ports
EXPOSE 80 443

# Run nginx
CMD ["nginx", "-g", "daemon off;"]
