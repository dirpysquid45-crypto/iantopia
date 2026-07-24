#!/bin/bash
# YouTube Transcript App - Linux Server Deployment Script
# Run this on the qasim server after cloning the repo

set -e

echo "=== YouTube Transcript App - Linux Server Deployment ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Deploying from: $SCRIPT_DIR"
echo ""

# Check if running with appropriate permissions
if [ "$EUID" -ne 0 ] && ! groups $USER | grep -q docker; then
    echo -e "${YELLOW}Warning: You may need sudo or docker group permissions.${NC}"
fi

# ============================================================================
# 1. CHECK & INSTALL DEPENDENCIES
# ============================================================================
echo -e "${YELLOW}Step 1: Checking dependencies...${NC}"
echo ""

if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sudo sh /tmp/get-docker.sh
    sudo usermod -aG docker $USER
    echo -e "${GREEN}Docker installed!${NC}"
    echo "Please log out and back in, then run this script again."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Installing Docker Compose...${NC}"
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d'"' -f4)
    sudo curl -L "https://github.com/docker/compose/releases/download/$DOCKER_COMPOSE_VERSION/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}Docker Compose installed!${NC}"
fi

echo -e "${GREEN}Docker $(docker --version)${NC}"
echo -e "${GREEN}Docker Compose $(docker-compose --version)${NC}"
echo ""

# ============================================================================
# 2. SETUP DIRECTORY STRUCTURE & PERMISSIONS
# ============================================================================
echo -e "${YELLOW}Step 2: Setting up directories...${NC}"
echo ""

mkdir -p "$SCRIPT_DIR/transcripts"
mkdir -p "$SCRIPT_DIR/downloads"
mkdir -p "$SCRIPT_DIR/audio"

# Ensure proper permissions
chmod 755 "$SCRIPT_DIR/transcripts"
chmod 755 "$SCRIPT_DIR/downloads"
chmod 755 "$SCRIPT_DIR/audio"

echo -e "${GREEN}Directories ready${NC}"
echo ""

# ============================================================================
# 3. BUILD & START CONTAINERS
# ============================================================================
echo -e "${YELLOW}Step 3: Building and starting Docker containers...${NC}"
echo ""

cd "$SCRIPT_DIR"

# Use Linux-specific docker-compose file
if [ -f "docker-compose.linux.yml" ]; then
    docker-compose -f docker-compose.linux.yml down || true
    docker-compose -f docker-compose.linux.yml up -d --build
else
    echo -e "${RED}Error: docker-compose.linux.yml not found!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo ""

# ============================================================================
# 4. DISPLAY CONNECTION INFO
# ============================================================================
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo -e "${YELLOW}YouTube Transcript App is running locally:${NC}"
echo ""
echo -e "  Frontend: ${GREEN}http://localhost:3001${NC}"
echo -e "  Backend:  ${GREEN}http://localhost:8001${NC}"
echo ""

echo -e "${YELLOW}⚠️  SECURITY NOTE:${NC}"
echo "  • Ports are bound to 127.0.0.1 (localhost only)"
echo "  • NOT accessible from your home network IP ($LOCAL_IP)"
echo "  • Access from other machines requires SSH tunnel"
echo ""

echo -e "${YELLOW}To access from another machine on your home network:${NC}"
echo "  SSH Port Forward:"
echo "  ssh -L 3001:localhost:3001 -L 8001:localhost:8001 $USER@qasim"
echo ""

echo -e "${YELLOW}Useful commands:${NC}"
echo "  View logs:        docker-compose -f docker-compose.linux.yml logs -f"
echo "  Stop containers:  docker-compose -f docker-compose.linux.yml down"
echo "  Restart:          docker-compose -f docker-compose.linux.yml restart"
echo "  Check status:     docker-compose -f docker-compose.linux.yml ps"
echo ""

# ============================================================================
# 5. OPTIONAL: SETUP NGINX REVERSE PROXY (commented out)
# ============================================================================
echo -e "${YELLOW}Optional: To access from your home network securely:${NC}"
echo ""
echo "1. Install Nginx on qasim:"
echo "   sudo apt-get install -y nginx"
echo ""
echo "2. Create /etc/nginx/sites-available/yt-transcript:"
echo "   See DEPLOYMENT_GUIDE.md for configuration"
echo ""
echo "3. Enable the site and restart Nginx:"
echo "   sudo ln -s /etc/nginx/sites-available/yt-transcript /etc/nginx/sites-enabled/"
echo "   sudo systemctl restart nginx"
echo ""
echo "See DEPLOYMENT_GUIDE.md for complete setup instructions"
echo ""
