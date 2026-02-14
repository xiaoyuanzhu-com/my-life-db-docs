---
title: "Data Collectors"
sidebar:
  order: 2
---

MyLifeDB is built around a simple idea: your files are your data. Everything you add — documents, photos, voice memos, URLs — lives as plain files on disk. This page covers all the ways to get data into MyLifeDB.

## The Inbox

The inbox is your primary entry point. It works like a chat — newest items appear at the bottom, and you scroll up to see older ones.

At the bottom of the inbox, you'll find the **OmniInput** bar. This is where all input happens:

- **Type text** — Write a quick note, paste a URL, or jot down a thought. Press Enter to send, Shift+Enter for a new line.
- **Attach files** — Click the + button or drag and drop files onto the inbox.
- **Record voice** — Tap the microphone to record a voice memo with real-time transcription.
- **Search** — Start typing to search across all your files (keyword and semantic).

You can combine these — for example, type a note and attach files in the same send.

## Supported File Types

MyLifeDB accepts virtually any file. The following types get automatic AI processing:

| Type | Examples | What MyLifeDB Extracts |
|------|----------|----------------------|
| **Documents** | PDF, DOCX, XLSX, PPTX, EPUB | Full text content, converted to readable format |
| **Images** | PNG, JPG, GIF, WEBP | Text via OCR, object detection, AI-generated descriptions |
| **Audio & Video** | MP3, WAV, MP4 | Speech transcription with speaker identification |
| **URLs** | Any web link | Page content, screenshot, metadata |
| **Text files** | Markdown, TXT, JSON | Indexed as-is for search |

Files that don't match a known type are still stored and searchable by filename.

## Automatic Processing

When you add a file, MyLifeDB automatically processes it in the background. You don't need to do anything — processing starts within seconds.

**What happens after you upload a file:**

1. The file appears in your inbox immediately.
2. Background workers analyze the file based on its type.
3. Extracted content (text, transcriptions, descriptions) is attached to the file as **digests**.
4. The file becomes searchable by its content, not just its name.
5. AI-generated tags are added for organization.

You can see processing progress on each file card. Once complete, tap any file to view its digests — the extracted text, transcription, AI summary, or other generated content.

### Processing by File Type

**URLs** — When you paste a URL, MyLifeDB crawls the page to extract its text content and takes a screenshot. You get a readable version of the article plus a visual snapshot.

**Documents** — PDFs, Word docs, spreadsheets, and ebooks are converted to readable text. This makes their content searchable even if the original format isn't text-based.

**Images** — OCR extracts any text in the image (receipts, screenshots, handwritten notes). Object detection identifies what's in the image, and AI generates a natural-language description.

**Audio & Video** — Speech is transcribed to text with speaker identification. Long recordings get an AI-generated summary.

**All files** — Regardless of type, every file gets auto-tagged and indexed for both keyword and semantic search.

## Inbox Agent (Optional)

If you enable the inbox agent (`MLD_INBOX_AGENT=1`), MyLifeDB will suggest where to organize your files.

When a new file arrives in the inbox, the agent:

1. Reads the file content and your existing folder structure.
2. Checks your `guideline.md` (a file you can create to describe your organization preferences).
3. Suggests moving the file to an appropriate folder with a confidence score.

You'll see a suggestion appear on the file — you can accept it, reject it, or choose a different folder. The agent never moves files without your confirmation.

## Syncing from Other Devices

Your `data/` directory is just a folder on disk. You can sync it with any cloud storage service (iCloud, Dropbox, Syncthing, etc.) to get files into MyLifeDB from other devices.

When files appear or change in the data directory — whether from a local upload or a cloud sync — MyLifeDB detects the change automatically and processes the new files. All connected browsers update in real time.

## Search

Once your files are processed, you can search across everything from the OmniInput bar:

- **Keyword search** — Finds exact matches in file names and extracted content.
- **Semantic search** — Finds conceptually related files, even if they don't contain the exact words you searched for. Requires an OpenAI API key.

Search results show which files matched and highlight the relevant content.
