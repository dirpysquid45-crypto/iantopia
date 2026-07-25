#!/bin/bash
set -e

echo "🚀 Starting deployment with validation..."

# Check prerequisites
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "❌ docker-compose.prod.yml not found"
    exit 1
fi

echo "✓ Found docker-compose.prod.yml"

# Stop existing containers
echo "Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down || true

# Start services
echo "Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to start
echo "⏳ Waiting 60s for services to initialize..."
sleep 60

# Validate health endpoint
echo "🏥 Checking health endpoint..."
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✓ Health endpoint: OK"
else
    echo "❌ Health endpoint: FAILED"
    echo "Logs:"
    docker-compose -f docker-compose.prod.yml logs
    docker-compose -f docker-compose.prod.yml down
    exit 1
fi

# Validate backend API
echo "🔌 Checking backend API..."
if curl -f http://localhost:8000/api/transcripts > /dev/null 2>&1; then
    echo "✓ Backend API: OK"
else
    echo "❌ Backend API: FAILED"
    echo "Logs:"
    docker-compose -f docker-compose.prod.yml logs yt-transcript-backend
    docker-compose -f docker-compose.prod.yml down
    exit 1
fi

# Validate frontend
echo "🎨 Checking frontend..."
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo "✓ Frontend: OK"
else
    echo "❌ Frontend: FAILED"
    echo "Logs:"
    docker-compose -f docker-compose.prod.yml logs yt-transcript-frontend
    docker-compose -f docker-compose.prod.yml down
    exit 1
fi

# Verify nginx is proxying correctly
echo "🔀 Checking nginx proxy..."
if curl -f http://localhost/ > /dev/null 2>&1; then
    echo "✓ Nginx proxy: OK"
else
    echo "❌ Nginx proxy: FAILED"
    echo "Logs:"
    docker-compose -f docker-compose.prod.yml logs yt-transcript-nginx
    docker-compose -f docker-compose.prod.yml down
    exit 1
fi

# Check container status
echo "📊 Verifying all containers are healthy..."
UNHEALTHY=$(docker ps --filter "status=unhealthy" --format "{{.Names}}" | wc -l)
if [ "$UNHEALTHY" -gt 0 ]; then
    echo "❌ Found unhealthy containers"
    docker ps --filter "status=unhealthy"
    docker-compose -f docker-compose.prod.yml down
    exit 1
fi

echo ""
echo "✅ Deployment successful!"
echo "   - Health endpoint: http://localhost/health"
echo "   - Backend API: http://localhost:8000"
echo "   - Frontend: http://localhost/"
echo "   - All services healthy and running"
