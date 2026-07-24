#!/bin/bash
# YouTube Transcript App - Production Deployment to qasim
# This script sets up Docker, Nginx, and prepares for Cloudflare Tunnel

set -e

echo "=== YouTube Transcript App - Production Deployment ==="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "Deploying from: $SCRIPT_DIR"
echo ""

# ============================================================================
# 1. CHECK & INSTALL DEPENDENCIES
# ============================================================================
echo -e "${YELLOW}Step 1: Installing dependencies...${NC}"
echo ""

if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sudo sh /tmp/get-docker.sh
    sudo usermod -aG docker $USER
    echo -e "${GREEN}Docker installed${NC}"
    echo "Please log out and back in, then run this script again"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Installing Docker Compose...${NC}"
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d'"' -f4)
    sudo curl -L "https://github.com/docker/compose/releases/download/$DOCKER_COMPOSE_VERSION/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}Docker Compose installed${NC}"
fi

echo -e "${GREEN}✓ Docker $(docker --version)${NC}"
echo -e "${GREEN}✓ Docker Compose $(docker-compose --version)${NC}"
echo ""

# ============================================================================
# 2. SETUP DIRECTORIES
# ============================================================================
echo -e "${YELLOW}Step 2: Setting up directories...${NC}"
echo ""

mkdir -p "$SCRIPT_DIR/transcripts"
mkdir -p "$SCRIPT_DIR/downloads"
mkdir -p "$SCRIPT_DIR/audio"
mkdir -p "$SCRIPT_DIR/ssl"

chmod 755 "$SCRIPT_DIR/transcripts"
chmod 755 "$SCRIPT_DIR/downloads"
chmod 755 "$SCRIPT_DIR/audio"
chmod 755 "$SCRIPT_DIR/ssl"

echo -e "${GREEN}✓ Directories ready${NC}"
echo ""

# ============================================================================
# 3. INSTALL CLOUDFLARE TUNNEL (Optional)
# ============================================================================
echo -e "${YELLOW}Step 3: Cloudflare Tunnel (optional)${NC}"
echo ""

if ! command -v cloudflared &> /dev/null; then
    read -p "Install Cloudflare Tunnel for public internet access? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Installing cloudflared...${NC}"
        curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i /tmp/cloudflared.deb
        echo -e "${GREEN}✓ Cloudflare Tunnel installed${NC}"
        echo ""
        echo "Next steps:"
        echo "1. Run: cloudflared tunnel login"
        echo "2. Follow the prompts in browser"
        echo "3. Then: cloudflared tunnel create yt-transcript"
        echo "4. See CLOUDFLARE_TUNNEL_SETUP.md for full configuration"
    fi
fi

echo ""

# ============================================================================
# 4. BUILD & START CONTAINERS
# ============================================================================
echo -e "${YELLOW}Step 4: Building Docker containers...${NC}"
echo ""

cd "$SCRIPT_DIR"

if [ -f "docker-compose.prod.yml" ]; then
    docker-compose -f docker-compose.prod.yml down || true
    echo -e "${YELLOW}Building containers (this may take 5-10 minutes)...${NC}"
    docker-compose -f docker-compose.prod.yml up -d --build

    echo ""
    echo -e "${YELLOW}Waiting for containers to be healthy...${NC}"
    sleep 10

    if docker-compose -f docker-compose.prod.yml ps | grep -q "healthy\|running"; then
        echo -e "${GREEN}✓ Containers started successfully${NC}"
    else
        echo -e "${RED}⚠ Containers may not have started properly${NC}"
        docker-compose -f docker-compose.prod.yml logs
    fi
else
    echo -e "${RED}Error: docker-compose.prod.yml not found${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo ""

# ============================================================================
# 5. CONFIGURATION SUMMARY
# ============================================================================
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo -e "${YELLOW}Current Status:${NC}"
echo ""
echo "  Containers: $(docker-compose -f docker-compose.prod.yml ps --services | wc -l) running"
echo "  Backend:    http://localhost:8000"
echo "  Frontend:   http://localhost:3000"
echo "  Nginx:      http://localhost"
echo ""

echo -e "${YELLOW}⚠️  Next Steps:${NC}"
echo ""
echo "1. ${GREEN}Set up Cloudflare Tunnel${NC} (if not done)"
echo "   - Run: cloudflared tunnel login"
echo "   - Run: cloudflared tunnel create yt-transcript"
echo "   - See: CLOUDFLARE_TUNNEL_SETUP.md"
echo ""
echo "2. ${GREEN}Add DNS record in Cloudflare${NC}"
echo "   - Name: transcripts"
echo "   - Type: CNAME"
echo "   - Content: yt-transcript.cfargotunnel.com"
echo "   - Proxied: ON (orange cloud)"
echo ""
echo "3. ${GREEN}Configure systemd service${NC} (optional but recommended)"
echo "   - See: CLOUDFLARE_TUNNEL_SETUP.md Step 6"
echo ""

echo -e "${YELLOW}Useful Commands:${NC}"
echo ""
echo "  Check status:     docker-compose -f docker-compose.prod.yml ps"
echo "  View logs:        docker-compose -f docker-compose.prod.yml logs -f"
echo "  Stop all:         docker-compose -f docker-compose.prod.yml down"
echo "  Restart:          docker-compose -f docker-compose.prod.yml restart"
echo "  Nginx test:       docker exec yt-transcript-nginx nginx -t"
echo ""

echo -e "${YELLOW}Public URLs (after Tunnel setup):${NC}"
echo ""
echo "  https://transcripts.iantopia.com"
echo ""

echo -e "${GREEN}Documentation:${NC}"
echo ""
echo "  CLOUDFLARE_TUNNEL_SETUP.md - Full tunnel configuration"
echo "  DEPLOYMENT_GUIDE.md - Architecture & troubleshooting"
echo ""
