#!/bin/bash
# =============================================================================
# TeamSpeak to Discord Bridge - Linux Installation Script
# =============================================================================
# This script automates the installation on Linux systems
# Run with: curl -fsSL https://raw.githubusercontent.com/3bdelrahmanashraf/Team-Speak-To-Discord/main/scripts/install.sh | bash
# Or download and run: chmod +x install.sh && ./install.sh
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord.git"
INSTALL_DIR="${HOME}/teamspeak-discord-bridge"
BRANCH="main"
NODE_VERSION="20"

# Functions
print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  TeamSpeak to Discord Bridge - Linux Installer              ║
║  Version 0.1.0                                               ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

print_step() {
    echo -e "\n${BLUE}[${1}/${2}]${NC} ${BOLD}${3}${NC}"
    echo -e "${DIM}────────────────────────────────────────${NC}"
}

print_success() { echo -e "  ${GREEN}✓${NC} $1"; }
print_error() { echo -e "  ${RED}✗${NC} $1"; }
print_warning() { echo -e "  ${YELLOW}⚠${NC} $1"; }
print_info() { echo -e "  ${CYAN}ℹ${NC} $1"; }

detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        VER=$VERSION_ID
    elif [[ -f /etc/lsb-release ]]; then
        . /etc/lsb-release
        OS=$DISTRIB_ID
        VER=$DISTRIB_RELEASE
    else
        OS=$(uname -s)
        VER=$(uname -r)
    fi
    echo "${OS,,}"
}

install_nodejs() {
    print_info "Installing Node.js ${NODE_VERSION}..."

    # Check if nvm is available
    if command -v nvm &> /dev/null; then
        nvm install ${NODE_VERSION}
        nvm use ${NODE_VERSION}
        return
    fi

    # Check if fnm is available
    if command -v fnm &> /dev/null; then
        fnm install ${NODE_VERSION}
        fnm use ${NODE_VERSION}
        return
    fi

    # Install via NodeSource
    OS=$(detect_os)
    case $OS in
        ubuntu|debian)
            curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        fedora|rhel|centos|rocky|almalinux)
            curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | sudo bash -
            sudo dnf install -y nodejs npm
            ;;
        arch|manjaro)
            sudo pacman -S --noconfirm nodejs npm
            ;;
        alpine)
            sudo apk add nodejs npm
            ;;
        *)
            print_error "Unsupported distribution: $OS"
            print_info "Please install Node.js ${NODE_VERSION}+ manually from https://nodejs.org/"
            exit 1
            ;;
    esac
}

check_command() {
    command -v "$1" &> /dev/null
}

check_dependencies() {
    print_step 1 5 "Checking Dependencies"

    local missing=()
    local warnings=()

    # Node.js
    if check_command node; then
        local version=$(node --version | sed 's/v//')
        local major=$(echo $version | cut -d. -f1)
        if [[ $major -ge 20 ]]; then
            print_success "Node.js $version found"
        else
            warnings+=("Node.js $version found. Version 20+ recommended.")
        fi
    else
        missing+=("Node.js 20+")
    fi

    # npm
    if check_command npm; then
        print_success "npm found"
    else
        missing+=("npm")
    fi

    # Docker (optional)
    if check_command docker; then
        print_success "Docker found"
    else
        warnings+=("Docker not found. Container deployment unavailable.")
    fi

    # Docker Compose (optional)
    if check_command docker-compose || docker compose version &> /dev/null; then
        print_success "Docker Compose found"
    else
        warnings+=("Docker Compose not found. Multi-container deployment unavailable.")
    fi

    # Build tools
    if check_command gcc && check_command make && check_command python3; then
        print_success "Build tools found"
    else
        warnings+=("Build tools (gcc, make, python3) not found. Native modules may fail to compile.")
    fi

    # PostgreSQL client
    if check_command psql; then
        print_success "PostgreSQL client found"
    else
        warnings+=("PostgreSQL client (psql) not found.")
    fi

    # Redis CLI
    if check_command redis-cli; then
        print_success "Redis CLI found"
    else
        warnings+=("Redis CLI not found.")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        print_error "Missing required dependencies:"
        for dep in "${missing[@]}"; do
            echo -e "    ${RED}✗${NC} $dep"
        done
        echo
        read -p "Install missing dependencies automatically? (Y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            install_nodejs
        else
            print_info "Please install missing dependencies and run the script again."
            exit 1
        fi
    fi

    if [[ ${#warnings[@]} -gt 0 ]]; then
        print_warning "Warnings:"
        for warn in "${warnings[@]}"; do
            echo -e "    ${YELLOW}⚠${NC} $warn"
        done
    fi
}

create_directories() {
    print_step 2 5 "Creating Directories"

    mkdir -p "${INSTALL_DIR}/data" "${INSTALL_DIR}/logs" "${INSTALL_DIR}/config"
    print_success "Directories created at ${INSTALL_DIR}"
}

clone_repository() {
    print_step 3 5 "Cloning Repository"

    if [[ -d "${INSTALL_DIR}/.git" ]]; then
        print_info "Repository already exists, updating..."
        cd "${INSTALL_DIR}"
        git fetch origin
        git checkout ${BRANCH}
        git pull origin ${BRANCH}
    else
        print_info "Cloning from ${REPO_URL}..."
        git clone -b ${BRANCH} ${REPO_URL} "${INSTALL_DIR}"
        cd "${INSTALL_DIR}"
    fi
    print_success "Repository ready"
}

setup_configuration() {
    print_step 4 5 "Configuration Setup"

    if [[ -f "${INSTALL_DIR}/.env" ]]; then
        read -p "Configuration file exists. Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Skipping configuration setup."
            return
        fi
    fi

    echo -e "${MAGENTA}Discord Bot Configuration${NC}"
    read -p "Discord Bot Token: " DISCORD_TOKEN
    read -p "Discord Client ID: " DISCORD_CLIENT_ID
    read -p "Discord Guild ID: " DISCORD_GUILD_ID

    echo -e "\n${MAGENTA}TeamSpeak Server Configuration${NC}"
    read -p "TeamSpeak Host/IP: " TS_HOST
    read -p "TeamSpeak Query Port [10011]: " TS_QUERY_PORT
    TS_QUERY_PORT=${TS_QUERY_PORT:-10011}
    read -p "TeamSpeak Query Username [serveradmin]: " TS_USERNAME
    TS_USERNAME=${TS_USERNAME:-serveradmin}
    read -s -p "TeamSpeak Query Password: " TS_PASSWORD
    echo
    read -p "TeamSpeak Virtual Server ID [1]: " TS_SERVER_ID
    TS_SERVER_ID=${TS_SERVER_ID:-1}

    echo -e "\n${MAGENTA}Audio Configuration${NC}"
    echo "Select audio quality:"
    echo "  1. low (24kbps)"
    echo "  2. medium (48kbps)"
    echo "  3. high (64kbps) [default]"
    echo "  4. ultra (128kbps)"
    read -p "Choice [3]: " AUDIO_CHOICE
    AUDIO_CHOICE=${AUDIO_CHOICE:-3}
    case $AUDIO_CHOICE in
        1) AUDIO_QUALITY="low" ;;
        2) AUDIO_QUALITY="medium" ;;
        3) AUDIO_QUALITY="high" ;;
        4) AUDIO_QUALITY="ultra" ;;
        *) AUDIO_QUALITY="high" ;;
    esac

    echo -e "\n${MAGENTA}Database Configuration${NC}"
    read -p "Use Docker for PostgreSQL/Redis? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        DATABASE_URL="postgresql://bridge:password@localhost:5432/teamspeak_discord_bridge"
        REDIS_URL="redis://localhost:6379"
        USE_DOCKER=true
    else
        read -p "PostgreSQL Host [localhost]: " DB_HOST
        DB_HOST=${DB_HOST:-localhost}
        read -p "PostgreSQL Port [5432]: " DB_PORT
        DB_PORT=${DB_PORT:-5432}
        read -p "PostgreSQL Username [bridge]: " DB_USER
        DB_USER=${DB_USER:-bridge}
        read -s -p "PostgreSQL Password: " DB_PASSWORD
        echo
        read -p "PostgreSQL Database [teamspeak_discord_bridge]: " DB_NAME
        DB_NAME=${DB_NAME:-teamspeak_discord_bridge}
        DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

        read -p "Redis Host [localhost]: " REDIS_HOST
        REDIS_HOST=${REDIS_HOST:-localhost}
        read -p "Redis Port [6379]: " REDIS_PORT
        REDIS_PORT=${REDIS_PORT:-6379}
        REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}"
        USE_DOCKER=false
    fi

    echo -e "\n${MAGENTA}Web Dashboard${NC}"
    read -p "Enable Web Dashboard? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        WEB_DASHBOARD_ENABLED="true"
        read -p "Dashboard Port [3000]: " WEB_DASHBOARD_PORT
        WEB_DASHBOARD_PORT=${WEB_DASHBOARD_PORT:-3000}
    else
        WEB_DASHBOARD_ENABLED="false"
        WEB_DASHBOARD_PORT="3000"
    fi

    # Generate .env
    cat > "${INSTALL_DIR}/.env" << EOF
# TeamSpeak to Discord Bridge Configuration
# Generated by install.sh on $(date -Iseconds)

# Discord
DISCORD_TOKEN=${DISCORD_TOKEN}
DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
DISCORD_GUILD_ID=${DISCORD_GUILD_ID}

# TeamSpeak
TS_HOST=${TS_HOST}
TS_QUERY_PORT=${TS_QUERY_PORT}
TS_USERNAME=${TS_USERNAME}
TS_PASSWORD=${TS_PASSWORD}
TS_SERVER_ID=${TS_SERVER_ID}

# Audio
AUDIO_QUALITY=${AUDIO_QUALITY}
AUDIO_VAD_ENABLED=true
AUDIO_NOISE_SUPPRESSION_ENABLED=true

# Database
DATABASE_URL=${DATABASE_URL}

# Redis
REDIS_URL=${REDIS_URL}

# Web Dashboard
WEB_DASHBOARD_ENABLED=${WEB_DASHBOARD_ENABLED}
WEB_DASHBOARD_PORT=${WEB_DASHBOARD_PORT}

# Environment
NODE_ENV=development
EOF

    print_success "Configuration saved to .env"
}

install_dependencies() {
    print_step 5 5 "Installing Dependencies"

    cd "${INSTALL_DIR}"

    print_info "Installing npm packages..."
    if npm ci; then
        print_success "Dependencies installed"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi

    print_info "Generating Prisma client..."
    if npx prisma generate; then
        print_success "Prisma client generated"
    else
        print_warning "Prisma client generation failed"
    fi

    # Build project
    print_info "Building TypeScript project..."
    if npm run build; then
        print_success "Project built successfully"
    else
        print_error "Build failed"
        exit 1
    fi
}

setup_docker() {
    if [[ "$USE_DOCKER" == "true" ]]; then
        print_info "Starting database services with Docker Compose..."
        cd "${INSTALL_DIR}"
        if docker compose up -d postgres redis; then
            print_success "Database services started"
            sleep 5
            print_info "Running database migrations..."
            if npx prisma migrate deploy; then
                print_success "Database migrations applied"
            else
                print_warning "Migrations failed. Run manually: npx prisma migrate deploy"
            fi
        else
            print_error "Failed to start database services"
        fi
    fi
}

create_startup_script() {
    cat > "${INSTALL_DIR}/start.sh" << 'EOF'
#!/bin/bash
echo "Starting TeamSpeak to Discord Bridge..."
cd "$(dirname "$0")"
npm run start
EOF
    chmod +x "${INSTALL_DIR}/start.sh"
    print_success "Created start.sh"
}

print_completion() {
    echo -e "\n${GREEN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  Installation Complete!                                      ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    echo -e "${BOLD}Next Steps:${NC}"
    echo -e "  1. Review configuration: ${CYAN}${INSTALL_DIR}/.env${NC}"
    echo -e "  2. Start the bridge:"
    echo -e "     ${CYAN}cd ${INSTALL_DIR} && ./start.sh${NC}        # Direct startup"
    echo -e "     ${CYAN}cd ${INSTALL_DIR} && npm run dev${NC}       # Development mode"
    echo -e "     ${CYAN}cd ${INSTALL_DIR} && docker compose up -d${NC}  # Docker deployment"
    echo
    echo -e "  3. Access Web Dashboard: ${CYAN}http://localhost:3000${NC}"
    echo
    echo -e "${BOLD}Useful Commands:${NC}"
    echo -e "  ${CYAN}npm run dev${NC}           # Development mode"
    echo -e "  ${CYAN}npm run build${NC}         # Production build"
    echo -e "  ${CYAN}npm run test${NC}          # Run tests"
    echo -e "  ${CYAN}npm run lint${NC}          # Check code style"
    echo -e "  ${CYAN}docker compose logs -f${NC} # View Docker logs"
    echo
    echo -e "${BOLD}Documentation:${NC}"
    echo -e "  ${CYAN}README.md${NC}             # Full documentation"
    echo -e "  ${CYAN}docs/${NC}                 # Additional guides"
}

main() {
    print_banner

    print_info "Installing TeamSpeak to Discord Bridge to ${INSTALL_DIR}"
    print_info "Repository: ${REPO_URL} (branch: ${BRANCH})"

    check_dependencies
    create_directories
    clone_repository
    setup_configuration
    install_dependencies
    setup_docker
    create_startup_script
    print_completion
}

# Handle arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --branch)
            BRANCH="$2"
            shift 2
            ;;
        --no-docker)
            USE_DOCKER=false
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --dir DIR       Installation directory (default: ~/teamspeak-discord-bridge)"
            echo "  --branch BRANCH Git branch to install (default: main)"
            echo "  --no-docker     Skip Docker database setup"
            echo "  --help          Show this help"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

main