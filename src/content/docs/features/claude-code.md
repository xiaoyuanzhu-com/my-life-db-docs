---
title: "Claude Code"
---

> Last edit: 2026-02-26

MyLifeDB includes a built-in [Claude Code](https://claude.ai/code) integration — an AI coding assistant that runs directly in your browser with full access to your data.

## What It Does

Claude Code is a conversational AI that can read, search, create, and modify files in your MyLifeDB data directory. You interact with it through a chat interface, and it executes actions on your behalf.

Use it to analyze your files, automate repetitive tasks, search across your data, or build scripts that work with your content.

## Starting a Session

1. Navigate to the **Claude** page.
2. Click **New Session**.
3. On your first use, authenticate via the OAuth link Claude provides. This is one-time — future sessions reuse your credentials.
4. Start typing.

## Example Uses

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

## Sessions

Each session is an independent conversation with its own context. You can run multiple sessions simultaneously — one for data analysis, another for organizing files, and so on.

Sessions persist on the server. Close your browser and come back later — your sessions are still there with full conversation history. You can also start a session on one device and continue it from another.

Rename sessions to keep them organized. Delete sessions when you're done with them.

## Permissions

When Claude wants to perform an action — reading a file, running a command, editing something — it asks for your approval first.

| Option | What it does |
|--------|-------------|
| **Allow** | Permit this one action |
| **Always Allow** | Permit this type of action for the rest of the session |
| **Deny** | Block the action |

Claude never modifies your files without your knowledge.

## Streaming

Claude's responses stream in real-time as they're generated. You see partial output as Claude thinks, and the full response when it's done. If you disconnect mid-stream and reconnect, the partial output is recovered — no lost tokens.

## Tips

- **Be specific** — "Summarize the PDF I uploaded today" works better than "summarize stuff".
- **Use sessions for projects** — Keep a long-running session for a specific task so Claude remembers the context.
- **Review changes** — Claude shows you exactly what it's doing. Check file modifications before confirming.
