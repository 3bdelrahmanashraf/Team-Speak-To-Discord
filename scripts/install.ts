#!/usr/bin/env tsx
/**
 * Interactive Installation Wizard for TeamSpeak to Discord Bridge
 * Supports Windows, Linux, and macOS
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ConfigSchema } from '../config/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

interface InstallOptions {
  platform: 'win32' | 'linux' | 'darwin';
  skipDeps: boolean;
  skipConfig: boolean;
  skipDatabase: boolean;
  docker: boolean;
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function colorize(text: string, color: keyof typeof COLORS): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function printBanner(): void {
  console.log(`
${colorize('╔══════════════════════════════════════════════════════════════╗', 'cyan')}
${colorize('║', 'cyan')}  ${colorize('TeamSpeak to Discord Bridge - Installation Wizard', 'bright')}  ${colorize('║', 'cyan')}
${colorize('║', 'cyan')}  ${colorize('Version 0.1.0', 'dim')}                                            ${colorize('║', 'cyan')}
${colorize('╚══════════════════════════════════════════════════════════════╝', 'cyan')}
`);
}

function printStep(step: number, total: number, title: string): void {
  console.log(`\n${colorize(`[${step}/${total}]`, 'blue')} ${colorize(title, 'bright')}`);
  console.log(colorize('─'.repeat(60), 'dim'));
}

function printSuccess(message: string): void {
  console.log(`  ${colorize('✓', 'green')} ${message}`);
}

function printError(message: string): void {
  console.log(`  ${colorize('✗', 'red')} ${message}`);
}

function printWarning(message: string): void {
  console.log(`  ${colorize('⚠', 'yellow')} ${message}`);
}

function printInfo(message: string): void {
  console.log(`  ${colorize('ℹ', 'cyan')} ${message}`);
}

async function promptInput(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  const prompt = defaultValue ? `${question} ${colorize(`(${defaultValue})`, 'dim')}: ` : `${question}: `;
  const answer = await rl.question(prompt);
  rl.close();
  return answer.trim() || defaultValue || '';
}

async function promptSecret(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  // Note: This doesn't actually hide input in all terminals
  const answer = await rl.question(`${question}: `);
  rl.close();
  return answer.trim();
}

async function promptConfirm(question: string, defaultValue = true): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  const suffix = defaultValue ? 'Y/n' : 'y/N';
  const answer = await rl.question(`${question} [${suffix}]: `);
  rl.close();
  const normalized = answer.trim().toLowerCase();
  if (!normalized) return defaultValue;
  return normalized === 'y' || normalized === 'yes';
}

async function selectOption(question: string, options: string[]): Promise<string> {
  console.log(`  ${question}`);
  options.forEach((opt, i) => {
    console.log(`    ${colorize(`${i + 1}.`, 'cyan')} ${opt}`);
  });

  const rl = createInterface({ input: stdin, output: stdout });
  let answer: string;
  while (true) {
    answer = await rl.question('  Select option (number): ');
    const index = parseInt(answer.trim(), 10) - 1;
    if (index >= 0 && index < options.length) {
      rl.close();
      return options[index];
    }
    printError('Invalid selection. Please enter a valid number.');
  }
}

function detectPlatform(): 'win32' | 'linux' | 'darwin' {
  const platform = process.platform;
  if (platform === 'win32') return 'win32';
  if (platform === 'linux') return 'linux';
  if (platform === 'darwin') return 'darwin';
  return 'linux'; // fallback
}

function checkCommand(command: string): boolean {
  try {
    const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

async function checkDependencies(platform: 'win32' | 'linux' | 'darwin'): Promise<{ missing: string[]; warnings: string[] }> {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check Node.js
  if (!checkCommand('node')) {
    missing.push('Node.js 20+');
  } else {
    const nodeVersion = spawnSync('node', ['--version'], { encoding: 'utf-8' });
    const version = nodeVersion.stdout.trim().replace('v', '');
    const major = parseInt(version.split('.')[0], 10);
    if (major < 20) {
      warnings.push(`Node.js version ${version} detected. Version 20+ recommended.`);
    }
  }

  // Check npm
  if (!checkCommand('npm')) {
    missing.push('npm');
  }

  // Check Docker (optional)
  if (!checkCommand('docker')) {
    warnings.push('Docker not found. Container deployment will not be available.');
  }

  // Check Docker Compose (optional)
  if (!checkCommand('docker-compose') && !checkCommand('docker compose')) {
    warnings.push('Docker Compose not found. Multi-container deployment will not be available.');
  }

  // Check PostgreSQL client (optional)
  if (!checkCommand('psql')) {
    warnings.push('PostgreSQL client (psql) not found. Database management will require manual setup.');
  }

  // Check Redis CLI (optional)
  if (!checkCommand('redis-cli')) {
    warnings.push('Redis CLI not found. Cache management will require manual setup.');
  }

  // Platform-specific checks
  if (platform === 'linux') {
    // Check for build tools
    if (!checkCommand('gcc') || !checkCommand('make') || !checkCommand('python3')) {
      warnings.push('Build tools (gcc, make, python3) not found. Some native modules may fail to compile.');
    }
  } else if (platform === 'win32') {
    // Check for Windows Build Tools
    if (!checkCommand('npm') || !checkCommand('node-gyp')) {
      warnings.push('Windows Build Tools may be needed for native modules. Run: npm install -g windows-build-tools');
    }
  }

  return { missing, warnings };
}

async function setupConfiguration(): Promise<void> {
  printStep(3, 5, 'Configuration Setup');

  const exampleEnvPath = resolve(ROOT_DIR, 'config', 'example.env');
  const envPath = resolve(ROOT_DIR, '.env');

  if (!existsSync(exampleEnvPath)) {
    printError('Example configuration file not found!');
    return;
  }

  if (existsSync(envPath)) {
    const overwrite = await promptConfirm('Configuration file .env already exists. Overwrite?', false);
    if (!overwrite) {
      printInfo('Skipping configuration setup.');
      return;
    }
  }

  printInfo('Please provide the following configuration values:');
  console.log();

  // Discord Configuration
  printInfo('${colorize('Discord Bot Configuration', 'magenta')}');
  const discordToken = await promptSecret('Discord Bot Token');
  const discordClientId = await promptInput('Discord Client ID');
  const discordGuildId = await promptInput('Discord Guild (Server) ID');

  // TeamSpeak Configuration
  console.log();
  printInfo('${colorize('TeamSpeak Server Configuration', 'magenta')}');
  const tsHost = await promptInput('TeamSpeak Host/IP');
  const tsQueryPort = await promptInput('TeamSpeak Query Port', '10011');
  const tsUsername = await promptInput('TeamSpeak Query Username', 'serveradmin');
  const tsPassword = await promptSecret('TeamSpeak Query Password');
  const tsServerId = await promptInput('TeamSpeak Virtual Server ID', '1');

  // Audio Configuration
  console.log();
  printInfo('${colorize('Audio Configuration', 'magenta')}');
  const audioQuality = await selectOption('Audio Quality:', ['low (24kbps)', 'medium (48kbps)', 'high (64kbps)', 'ultra (128kbps)']);
  const qualityMap = { 'low (24kbps)': 'low', 'medium (48kbps)': 'medium', 'high (64kbps)': 'high', 'ultra (128kbps)': 'ultra' };

  // Database Configuration
  console.log();
  printInfo('${colorize('Database Configuration', 'magenta')}');
  const useDocker = await promptConfirm('Use Docker for PostgreSQL and Redis?', true);
  let databaseUrl = 'postgresql://bridge:password@localhost:5432/teamspeak_discord_bridge';
  let redisUrl = 'redis://localhost:6379';

  if (!useDocker) {
    const dbHost = await promptInput('PostgreSQL Host', 'localhost');
    const dbPort = await promptInput('PostgreSQL Port', '5432');
    const dbUser = await promptInput('PostgreSQL Username', 'bridge');
    const dbPassword = await promptSecret('PostgreSQL Password');
    const dbName = await promptInput('PostgreSQL Database', 'teamspeak_discord_bridge');
    databaseUrl = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

    const redisHost = await promptInput('Redis Host', 'localhost');
    const redisPort = await promptInput('Redis Port', '6379');
    redisUrl = `redis://${redisHost}:${redisPort}`;
  }

  // Web Dashboard
  console.log();
  printInfo('${colorize('Web Dashboard Configuration', 'magenta')}');
  const dashboardEnabled = await promptConfirm('Enable Web Dashboard?', true);
  const dashboardPort = dashboardEnabled ? await promptInput('Dashboard Port', '3000') : '3000';

  // Generate .env file
  const envContent = `# TeamSpeak to Discord Bridge Configuration
# Generated by install wizard on ${new Date().toISOString()}

# Discord
DISCORD_TOKEN=${discordToken}
DISCORD_CLIENT_ID=${discordClientId}
DISCORD_GUILD_ID=${discordGuildId}

# TeamSpeak
TS_HOST=${tsHost}
TS_QUERY_PORT=${tsQueryPort}
TS_USERNAME=${tsUsername}
TS_PASSWORD=${tsPassword}
TS_SERVER_ID=${tsServerId}

# Audio
AUDIO_QUALITY=${qualityMap[audioQuality as keyof typeof qualityMap]}
AUDIO_VAD_ENABLED=true
AUDIO_NOISE_SUPPRESSION_ENABLED=true

# Database
DATABASE_URL=${databaseUrl}

# Redis
REDIS_URL=${redisUrl}

# Web Dashboard
WEB_DASHBOARD_ENABLED=${dashboardEnabled}
WEB_DASHBOARD_PORT=${dashboardPort}

# Environment
NODE_ENV=development
`;

  writeFileSync(envPath, envContent);
  printSuccess('Configuration saved to .env');
}

async function installDependencies(platform: 'win32' | 'linux' | 'darwin'): Promise<void> {
  printStep(4, 5, 'Installing Dependencies');

  printInfo('Installing npm packages...');
  const result = spawnSync('npm', ['ci'], { cwd: ROOT_DIR, stdio: 'inherit' });

  if (result.status !== 0) {
    printError('Failed to install dependencies');
    if (platform === 'win32') {
      printInfo('Try running: npm install -g windows-build-tools');
    } else if (platform === 'linux') {
      printInfo('Ensure build tools are installed: sudo apt-get install build-essential python3');
    }
    throw new Error('Dependency installation failed');
  }

  printSuccess('Dependencies installed');

  // Generate Prisma client
  printInfo('Generating Prisma client...');
  const prismaResult = spawnSync('npx', ['prisma', 'generate'], { cwd: ROOT_DIR, stdio: 'inherit' });
  if (prismaResult.status !== 0) {
    printWarning('Prisma client generation failed. You may need to run it manually later.');
  } else {
    printSuccess('Prisma client generated');
  }
}

async function setupDatabase(): Promise<void> {
  printStep(5, 5, 'Database Setup');

  const useDocker = await promptConfirm('Start database services with Docker?', true);

  if (useDocker) {
    printInfo('Starting PostgreSQL and Redis with Docker Compose...');
    const result = spawnSync('docker', ['compose', 'up', '-d', 'postgres', 'redis'], { cwd: ROOT_DIR, stdio: 'inherit' });

    if (result.status !== 0) {
      printError('Failed to start database services');
      printInfo('You can start them manually later with: docker compose up -d postgres redis');
    } else {
      printSuccess('Database services started');

      // Wait for databases to be ready
      printInfo('Waiting for databases to be ready...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Run migrations
      printInfo('Running database migrations...');
      const migrateResult = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: ROOT_DIR, stdio: 'inherit' });
      if (migrateResult.status !== 0) {
        printWarning('Migrations failed. Run manually later with: npx prisma migrate deploy');
      } else {
        printSuccess('Database migrations applied');
      }
    }
  } else {
    printInfo('Skipping Docker database setup.');
    printInfo('Run migrations manually with: npx prisma migrate deploy');
  }
}

async function buildProject(): Promise<void> {
  printInfo('Building TypeScript project...');
  const result = spawnSync('npm', ['run', 'build'], { cwd: ROOT_DIR, stdio: 'inherit' });

  if (result.status !== 0) {
    printError('Build failed');
    throw new Error('Build failed');
  }

  printSuccess('Project built successfully');
}

async function createStartupScripts(platform: 'win32' | 'linux' | 'darwin'): Promise<void> {
  printInfo('Creating startup scripts...');

  if (platform === 'win32') {
    // Windows batch file
    const batContent = `@echo off
echo Starting TeamSpeak to Discord Bridge...
cd /d "%~dp0"
npm run start
pause
`;
    writeFileSync(resolve(ROOT_DIR, 'start.bat'), batContent);
    printSuccess('Created start.bat');
  } else {
    // Linux/macOS shell script
    const shContent = `#!/bin/bash
echo "Starting TeamSpeak to Discord Bridge..."
cd "$(dirname "$0")"
npm run start
`;
    writeFileSync(resolve(ROOT_DIR, 'start.sh'), shContent);
    spawnSync('chmod', ['+x', 'start.sh'], { cwd: ROOT_DIR });
    printSuccess('Created start.sh');
  }

  // Docker startup script
  const dockerStart = platform === 'win32'
    ? '@echo off\ndocker compose up -d\n'
    : '#!/bin/bash\ndocker compose up -d\n';
  const dockerStartName = platform === 'win32' ? 'docker-start.bat' : 'docker-start.sh';
  writeFileSync(resolve(ROOT_DIR, dockerStartName), dockerStart);
  if (platform !== 'win32') {
    spawnSync('chmod', ['+x', dockerStartName], { cwd: ROOT_DIR });
  }
  printSuccess(`Created ${dockerStartName}`);
}

function printCompletionMessage(platform: 'win32' | 'linux' | 'darwin'): void {
  console.log(`
${colorize('╔══════════════════════════════════════════════════════════════╗', 'green')}
${colorize('║', 'green')}  ${colorize('Installation Complete!', 'bright')}                                    ${colorize('║', 'green')}
${colorize('╚══════════════════════════════════════════════════════════════╝', 'green')}

${colorize('Next Steps:', 'bright')}
  1. Review and adjust configuration in ${colorize('.env', 'cyan')}
  2. Start the bridge:
${platform === 'win32' ? `     ${colorize('start.bat', 'cyan')}        # Windows startup script` : `     ${colorize('./start.sh', 'cyan')}        # Linux/macOS startup script`}
     ${colorize('npm run dev', 'cyan')}       # Development mode with hot reload
     ${colorize('docker compose up -d', 'cyan')}  # Docker deployment

  3. Access Web Dashboard (if enabled): ${colorize('http://localhost:3000', 'cyan')}

${colorize('Useful Commands:', 'bright')}
  ${colorize('npm run dev', 'cyan')}           # Development mode
  ${colorize('npm run build', 'cyan')}         # Production build
  ${colorize('npm run test', 'cyan')}          # Run tests
  ${colorize('npm run lint', 'cyan')}          # Check code style
  ${colorize('docker compose logs -f', 'cyan')} # View Docker logs

${colorize('Documentation:', 'bright')}
  ${colorize('README.md', 'cyan')}             # Full documentation
  ${colorize('docs/', 'cyan')}                 # Additional guides
`);
}

async function main(): Promise<void> {
  printBanner();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: InstallOptions = {
    platform: detectPlatform(),
    skipDeps: args.includes('--skip-deps'),
    skipConfig: args.includes('--skip-config'),
    skipDatabase: args.includes('--skip-db'),
    docker: args.includes('--docker'),
  };

  printInfo(`Detected platform: ${colorize(options.platform, 'cyan')}`);
  printInfo(`Node.js version: ${colorize(process.version, 'cyan')}`);

  // Step 1: Check dependencies
  printStep(1, 5, 'Checking Dependencies');
  const { missing, warnings } = await checkDependencies(options.platform);

  if (missing.length > 0) {
    printError('Missing required dependencies:');
    missing.forEach(dep => console.log(`    ${colorize('✗', 'red')} ${dep}`));
    console.log();
    printInfo('Please install the missing dependencies and run the installer again.');
    process.exit(1);
  } else {
    printSuccess('All required dependencies found');
  }

  if (warnings.length > 0) {
    printWarning('Warnings:');
    warnings.forEach(warn => console.log(`    ${colorize('⚠', 'yellow')} ${warn}`));
  }

  // Step 2: Create directories
  printStep(2, 5, 'Creating Directories');
  const dirs = ['data', 'logs', 'config'];
  for (const dir of dirs) {
    const fullPath = resolve(ROOT_DIR, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      printSuccess(`Created ${dir}/`);
    } else {
      printInfo(`${dir}/ already exists`);
    }
  }

  // Step 3: Configuration
  if (!options.skipConfig) {
    await setupConfiguration();
  } else {
    printStep(3, 5, 'Configuration Setup');
    printInfo('Skipped (--skip-config flag used)');
  }

  // Step 4: Install dependencies
  if (!options.skipDeps) {
    await installDependencies(options.platform);
  } else {
    printStep(4, 5, 'Installing Dependencies');
    printInfo('Skipped (--skip-deps flag used)');
  }

  // Step 5: Database setup
  if (!options.skipDatabase) {
    await setupDatabase();
  } else {
    printStep(5, 5, 'Database Setup');
    printInfo('Skipped (--skip-db flag used)');
  }

  // Build project
  await buildProject();

  // Create startup scripts
  await createStartupScripts(options.platform);

  // Completion
  printCompletionMessage(options.platform);
}

// Run the installer
main().catch(error => {
  console.error(`\n${colorize('Installation failed:', 'red')} ${error.message}`);
  process.exit(1);
});