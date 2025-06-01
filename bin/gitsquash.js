#!/usr/bin/env node

import { program } from 'commander';
import { main } from '../src/index.js';
import chalk from 'chalk';

program
  .name('gitsquash')
  .description('Interactive CLI tool to squash git commits')
  .version('0.0.1')
  .option('-n, --number <count>', 'number of recent commits to show', '10')
  .option('-m, --message <message>', 'preset commit message (skips the prompt)')
  .option('--dry-run', 'show what commits would be squashed without actually squashing')
  .addHelpText('after', `
Examples:
  $ gitsquash                    # Interactive squash of last 10 commits
  $ gitsquash -n 5              # Show only last 5 commits
  $ gitsquash -m "feat: xyz"    # Squash with preset commit message
  $ gitsquash --dry-run         # Preview squash operation
  `);

program.parse();

const options = program.opts();

main(options).catch(error => {
  console.error(chalk.red('An unexpected error occurred:'), error.message);
  process.exit(1);
});