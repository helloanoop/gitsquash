import inquirer from 'inquirer';
import chalk from 'chalk';
import simpleGit from 'simple-git';

const git = simpleGit();

async function getRecentCommits(options) {
  try {
    const maxCount = parseInt(options.number) || 10;
    const log = await git.log({ maxCount });
    return log.all;
  } catch (error) {
    console.error(chalk.red('Error fetching git commits:'), error.message);
    process.exit(1);
  }
}

async function selectCommits(commits) {
  const choices = commits.map(commit => ({
    name: `${chalk.yellow(commit.hash.slice(0, 7))} - ${chalk.blue(commit.date)} - ${commit.message}`,
    value: commit.hash,
    short: commit.hash.slice(0, 7)
  }));

  const { selectedCommits } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedCommits',
      message: 'Select commits to squash (space to select, enter to confirm):',
      choices,
      pageSize: 10,
      validate: input => {
        if (input.length < 2) return 'Please select at least 2 commits to squash';
        return true;
      }
    }
  ]);

  return selectedCommits;
}

async function getNewCommitMessage(presetMessage) {
  if (presetMessage) {
    return presetMessage;
  }

  const { message } = await inquirer.prompt([
    {
      type: 'input',
      name: 'message',
      message: 'Enter the new commit message:',
      validate: input => {
        if (!input.trim()) return 'Commit message cannot be empty';
        return true;
      }
    }
  ]);

  return message;
}

async function squashCommits(commits, message, isDryRun) {
  try {
    const oldestCommit = commits[commits.length - 1];
    const newestCommit = commits[0];
    const status = await git.status();
    
    if (isDryRun) {
      // Get all commits to show context
      const allCommits = await git.log({ maxCount: 10 });
      const commitMap = new Map(allCommits.all.map(c => [c.hash, c]));
      
      console.log(chalk.blue('\n📋 Dry Run - Squash Preview\n'));
      
      // Show current state
      console.log(chalk.yellow('Current Commits:'));
      allCommits.all.forEach(commit => {
        const isSelected = commits.includes(commit.hash);
        const prefix = isSelected ? '🔷' : '⚪️';
        const hash = commit.hash.slice(0, 7);
        const message = commit.message.split('\n')[0];
        console.log(`${prefix} ${chalk.dim(hash)} ${isSelected ? chalk.yellow(message) : message}`);
      });

      // Show future state
      console.log(chalk.yellow('\nAfter Squash:'));
      allCommits.all.forEach(commit => {
        const hash = commit.hash.slice(0, 7);
        if (commits.includes(commit.hash)) {
          if (commit.hash === oldestCommit) {
            // Show the new squashed commit
            console.log(`🔶 ${chalk.dim('NEW')} ${chalk.green(message)}`);
          }
          // Skip other commits that will be squashed
          return;
        }
        // Show unaffected commits
        console.log(`⚪️ ${chalk.dim(hash)} ${commit.message.split('\n')[0]}`);
      });

      console.log(chalk.blue('\nDetails:'));
      console.log(`• ${commits.length} commits will be squashed into one`);
      console.log(`• New commit message: "${message}"`);
      if (status.files.length > 0) {
        console.log(`• ${status.files.length} uncommitted changes will be preserved`);
      }
      return;
    }

    if (status.files.length > 0) {
      console.log(chalk.yellow('Warning: You have uncommitted changes. Stashing them...'));
      await git.stash(['save', 'temporary stash before squash']);
    }

    // Reset to the commit before the oldest commit we want to squash
    await git.reset(['--soft', `${oldestCommit}~1`]);
    // Create a new commit with all the changes
    await git.commit(message);

    if (status.files.length > 0) {
      await git.stash(['pop']);
    }

    console.log(chalk.green('✔ Successfully squashed commits!'));
  } catch (error) {
    console.error(chalk.red('Error during squash:'), error.message);
    process.exit(1);
  }
}

export async function main(options = {}) {
  console.log(chalk.blue('🔍 Fetching recent commits...'));
  
  const commits = await getRecentCommits(options);
  if (commits.length < 2) {
    console.log(chalk.yellow('Not enough commits to squash. Need at least 2 commits.'));
    process.exit(0);
  }

  const selectedCommits = await selectCommits(commits);
  const newMessage = await getNewCommitMessage(options.message);

  console.log(chalk.blue('\n🔄 Squashing commits...'));
  await squashCommits(selectedCommits, newMessage, options.dryRun);
}