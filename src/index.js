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

async function squashLatestCommits(commits, message) {
  const oldestCommit = commits[commits.length - 1];
  
  // Reset to the commit before the oldest commit we want to squash
  await git.reset(['--soft', `${oldestCommit}~1`]);
  // Create a new commit with all the changes
  await git.commit(message);
}

async function squashNonConsecutiveCommits(commits, message) {
  // Get the current branch name
  const branchData = await git.branch();
  const currentBranch = branchData.current;

  // Create a temporary branch
  const tempBranch = `temp-squash-${Date.now()}`;
  
  // Get all commits after our newest selected commit
  console.log(chalk.yellow('\n🔍 Phase 1: Analyzing commits...'));
  const newestSelectedCommit = commits[0];
  const log = await git.log();
  const laterCommits = [];
  for (const commit of log.all) {
    if (commit.hash === newestSelectedCommit) {
      break;
    }
    laterCommits.push({ hash: commit.hash, message: commit.message.split('\n')[0] });
  }
  console.log(chalk.dim(`  Found ${laterCommits.length} newer commits to preserve`));

  console.log(chalk.yellow('\n📦 Phase 2: Preparing workspace...'));
  console.log(chalk.dim(`  Creating temporary branch: ${tempBranch}`));
  await git.checkout(['-b', tempBranch]);

  try {
    console.log(chalk.yellow('\n🔄 Phase 3: Reconstructing history...'));
    const oldestCommit = commits[commits.length - 1];
    console.log(chalk.dim(`  Resetting to parent of ${oldestCommit.slice(0, 7)}`));
    await git.reset(['--hard', `${oldestCommit}~1`]);

    // Cherry pick all commits in order
    console.log(chalk.magenta('\n  🍒 Cherry picking selected commits:'));
    for (const commit of commits.reverse()) {
      const shortHash = commit.slice(0, 7);
      process.stdout.write(chalk.dim(`    Processing ${shortHash}... `));
      await git.raw(['cherry-pick', commit]);
      console.log(chalk.green('✓'));
    }

    // Now squash all the commits
    console.log(chalk.magenta('\n  💼 Creating squashed commit:'));
    console.log(chalk.dim(`    Resetting to parent of ${oldestCommit.slice(0, 7)}`));
    await git.reset(['--soft', `${oldestCommit}~1`]);
    process.stdout.write(chalk.dim('    Creating new commit... '));
    await git.commit(message);
    console.log(chalk.green('✓'));

    // Get the new commit hash
    const newCommit = await git.revparse(['HEAD']);
    const shortNewCommit = newCommit.slice(0, 7);
    console.log(chalk.dim(`    New commit hash: ${shortNewCommit}`));

    console.log(chalk.yellow('\n🔄 Phase 4: Applying changes to main branch...'));
    console.log(chalk.dim(`  Switching back to ${currentBranch}`));
    await git.checkout([currentBranch]);

    console.log(chalk.dim(`  Resetting to parent of ${oldestCommit.slice(0, 7)}`));
    await git.reset(['--hard', `${oldestCommit}~1`]);

    process.stdout.write(chalk.dim(`  Applying squashed commit ${shortNewCommit}... `));
    await git.raw(['cherry-pick', newCommit]);
    console.log(chalk.green('✓'));

    // Now cherry pick all the later commits back on top
    if (laterCommits.length > 0) {
      console.log(chalk.magenta('\n  🔄 Restoring newer commits:'));
      for (const commit of laterCommits.reverse()) {
        const shortHash = commit.hash.slice(0, 7);
        process.stdout.write(chalk.dim(`    ${shortHash} ${commit.message}... `));
        await git.raw(['cherry-pick', commit.hash]);
        console.log(chalk.green('✓'));
      }
    }

    // Clean up: delete temporary branch
    console.log(chalk.yellow('\n🧹 Phase 5: Cleanup'));
    process.stdout.write(chalk.dim(`  Removing temporary branch ${tempBranch}... `));
    await git.branch(['-D', tempBranch]);
    console.log(chalk.green('✓'));

  } catch (error) {
    // If something goes wrong, try to cleanup
    console.log(chalk.red('\n❌ Error: Squash failed!'));
    console.log(chalk.yellow('🧹 Cleaning up...'));
    console.log(chalk.dim(`  Switching back to ${currentBranch}`));
    await git.checkout([currentBranch]);
    process.stdout.write(chalk.dim(`  Removing temporary branch ${tempBranch}... `));
    await git.branch(['-D', tempBranch]).catch(() => {});
    console.log(chalk.green('✓'));
    throw error;
  }
}

async function areCommitsLatest(commits) {
  const log = await git.log({ maxCount: commits.length });
  const latestCommits = new Set(log.all.map(c => c.hash));
  return commits.every(hash => latestCommits.has(hash));
}

async function areCommitsConsecutive(commits) {
  // Find the newest and oldest commits in our selection
  const newestCommit = commits[0];
  const oldestCommit = commits[commits.length - 1];

  // Get the log between these commits (inclusive)
  const log = await git.log({ from: oldestCommit, to: newestCommit });
  const allCommits = log.all.map(c => c.hash);
  
  // Find the indices of our commits in this range
  const indices = commits.map(hash => allCommits.indexOf(hash)).sort((a, b) => a - b);
  
  // Check if any commit wasn't found
  if (indices.includes(-1)) {
    return false;
  }
  
  // Check if the indices form a consecutive sequence
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] - indices[i-1] !== 1) {
      return false;
    }
  }
  return true;
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

    // Check if we can use the simple approach
    const isLatest = await areCommitsLatest(commits);
    const isConsecutive = await areCommitsConsecutive(commits);

    if (isLatest && isConsecutive) {
      await squashLatestCommits(commits, message);
    } else {
      console.log(chalk.blue('Non consecutive commits detected. Using advanced squash approach...'));
      await squashNonConsecutiveCommits(commits, message);
    }

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