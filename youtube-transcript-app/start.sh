#!/bin/bash

echo "🚀 Starting YouTube Transcript App..."
echo ""
echo "Frontend will be available at: http://localhost:3000"
echo "Backend API at: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")" || exit
docker-compose up
