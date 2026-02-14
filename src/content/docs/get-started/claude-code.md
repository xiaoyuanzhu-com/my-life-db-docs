---
title: "Claude Code"
sidebar:
  order: 3
---

MyLifeDB includes a built-in [Claude Code](https://claude.ai/code) integration, giving you an AI coding assistant that runs directly in your browser. You can use it to analyze your files, automate tasks, or interact with your data programmatically.

## What is Claude Code?

Claude Code is Anthropic's AI-powered coding assistant that runs as a CLI tool. MyLifeDB embeds it in a web-based terminal, so you can use it from any device — desktop, tablet, or phone — without installing anything locally.

Each Claude Code session is a persistent conversation with Claude that has full access to your MyLifeDB data directory. You can ask it to read files, search content, write scripts, or help you organize your data.

## Getting Started

1. Open MyLifeDB and navigate to the **Claude** page.
2. Click **New Session** to start a fresh conversation.
3. On your first session, Claude will prompt you to authenticate via OAuth — click the link in the terminal and complete the sign-in.
4. Once authenticated, start chatting with Claude.

Authentication is one-time. All future sessions reuse your credentials automatically.

## Managing Sessions

### Multiple Sessions

You can run multiple Claude sessions at once. Each session is independent — use one for data analysis, another for scripting, and so on. Sessions appear as tabs at the top of the page.

### Session Persistence

Sessions keep running even if you close your browser. When you come back:

- Your sessions are listed in the sidebar.
- Click any session to reconnect and see where you left off.
- The full conversation history is preserved.

### Cross-Device Access

Since sessions run on the server, you can start a session on your desktop and continue it from your phone. All devices see the same sessions and the same output.

### Renaming and Deleting

- **Rename** a session by clicking its title in the sidebar to keep your sessions organized.
- **Delete** a session when you're done with it. This stops the Claude process and removes it from the list.

## What You Can Do

Here are some examples of what you can ask Claude in MyLifeDB:

**Analyze your data**
> "Summarize all the articles I saved this week"
> "Find all receipts from January and total the amounts"

**Search and organize**
> "Which files mention project X?"
> "Move all PDFs from inbox into a 'documents' folder"

**Work with file content**
> "Read my latest journal entry and suggest tags"
> "Extract all URLs from my notes"

**Automate tasks**
> "Write a script that renames all photos by their date taken"
> "Create a markdown summary of every file in my inbox"

Claude has access to your data directory and can read, create, and modify files. It will ask for your permission before making changes.

## Permissions

Claude Code uses a permission system to keep you in control. When Claude wants to perform an action — like reading a file, running a command, or editing something — it asks for your approval first.

For each permission request, you can:

- **Allow** — Permit this one action.
- **Always Allow** — Permit this type of action for the rest of the session without asking again.
- **Deny** — Block the action.

This ensures Claude never modifies your files without your knowledge.

## Tips

- **Be specific** — "Summarize the PDF I uploaded today" works better than "summarize stuff".
- **Use sessions for projects** — Keep a long-running session for a specific task so Claude remembers the context.
- **Check the output** — Claude shows you exactly what it's doing. Review file changes before confirming.
