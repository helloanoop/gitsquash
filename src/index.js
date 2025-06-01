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
      console.log(chalk.blue('\n📋 Dry run - here\'s what would happen:'));
      console.log(chalk.yellow(`• Squash ${commits.length} commits into one`));
      console.log(chalk.yellow(`• New commit message: "${message}"`));
      console.log(chalk.yellow(`• From commit: ${newestCommit.slice(0, 7)} to ${oldestCommit.slice(0, 7)}`));
      if (status.files.length > 0) {
        console.log(chalk.yellow('• Stash and restore uncommitted changes'));
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