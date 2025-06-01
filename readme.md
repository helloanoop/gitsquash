# gitsquash

An interactive CLI tool that makes git commit squashing simple and intuitive. Select multiple commits using an interactive interface, provide a new commit message, and squash them into a single commit.

## Features

- 🔍 Interactive commit selection with checkboxes
- 📝 Preview commit details (hash, date, message)
- ⚡️ Simple keyboard-based navigation
- 🔄 Automatic stashing of uncommitted changes
- 🚀 Dry-run mode to preview changes
- 💬 Optional preset commit messages

## Installation

```bash
# Install globally
npm install -g gitsquash

# Or run directly with npx
npx gitsquash
```

## Usage

```bash
# Basic interactive mode - shows last 10 commits
gitsquash

# Show only last 5 commits
gitsquash -n 5

# Squash with a preset commit message (skips the message prompt)
gitsquash -m "feat: combine recent changes"

# Preview what would happen without making changes
gitsquash --dry-run
```

## Options

| Option | Description |
|--------|-------------|
| `-n, --number <count>` | Number of recent commits to show (default: 10) |
| `-m, --message <message>` | Preset commit message (skips the message prompt) |
| `--dry-run` | Preview squash operation without making changes |
| `--help` | Display help information |
| `--version` | Display version number |

## How It Works

1. Shows you a list of recent commits
2. Use space bar to select commits you want to squash
3. Press enter to confirm selection
4. Enter a new commit message (or use preset with `-m`)
5. The selected commits will be squashed into a single commit

## Notes

- Requires git to be installed and available in PATH
- Works on any git repository
- Automatically handles uncommitted changes by stashing them
- Minimum of 2 commits required for squashing

## License

MIT