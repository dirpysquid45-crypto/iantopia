#!/bin/bash
# YouTube Transcript App Deployment Script for Ubuntu

set -e

echo "=== YouTube Transcript App - Ubuntu Deployment ==="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "Docker installed! Please log out and back in, then run this script again."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "Docker Compose installed!"
fi

echo "Docker version: $(docker --version)"
echo "Docker Compose version: $(docker-compose --version)"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Deploying from: $SCRIPT_DIR"
echo ""

# Pull latest code (if git repo)
if [ -d "$SCRIPT_DIR/.git" ]; then
    echo "Pulling latest code..."
    cd "$SCRIPT_DIR"
    git pull origin main || echo "Git pull failed - continuing anyway"
    echo ""
fi

# Build and start containers
echo "Building and starting Docker containers..."
cd "$SCRIPT_DIR"
docker-compose down || true
docker-compose up -d --build

echo ""
echo "=== Deployment Complete! ==="
echo ""
echo "YouTube Transcript App is now running:"
echo "  Frontend: http://$(hostname -I | awk '{print $1}'):3001"
echo "  Backend:  http://$(hostname -I | awk '{print $1}'):8001"
echo ""
echo "View logs:"
echo "  docker-compose logs -f frontend"
echo "  docker-compose logs -f backend"
echo ""
echo "Stop containers:"
echo "  docker-compose down"
