---
title: "Adaptive Thinking"
---

## Overview

**Adaptive thinking** is the recommended way to use extended thinking with Claude Opus 4.6 and Sonnet 4.6. Instead of manually setting a fixed thinking token budget, adaptive thinking lets Claude dynamically determine **when and how much** to use extended thinking based on the complexity of each request.

- **Supported models**: Claude Opus 4.6, Claude Sonnet 4.6
- **API parameter**: `thinking.type: "adaptive"`
- **Docs**: [platform.claude.com/docs/en/build-with-claude/adaptive-thinking](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking)

---

## Three Thinking Modes

| Mode | Config | When to Use |
|------|--------|-------------|
| **Adaptive** | `thinking: {type: "adaptive"}` | Claude decides when/how much to think. Use `effort` to guide. (Opus 4.6, Sonnet 4.6 only) |
| **Manual** | `thinking: {type: "enabled", budget_tokens: N}` | Precise control over thinking token spend. Deprecated on 4.6 models. |
| **Disabled** | Omit `thinking` parameter | No extended thinking, lowest latency. |

---

## Effort Parameter

Combine adaptive thinking with the `effort` parameter to guide thinking depth:

| Effort | Behavior |
|--------|----------|
| `max` | Always thinks, no constraints. **Opus 4.6 only.** |
| `high` (default) | Always thinks. Deep reasoning on complex tasks. |
| `medium` | Moderate thinking. May skip for simple queries. |
| `low` | Minimal thinking. Skips for simple tasks where speed matters. |

---

## How It Works in the Claude Agent SDK

The Claude Agent SDK (Python/TypeScript) communicates with the Claude Code CLI via subprocess. The SDK's `ThinkingConfig` types mirror the API surface, but the transport layer maps them to **CLI flags**.

### Python SDK Types

```python
# From claude_agent_sdk/types.py

class ThinkingConfigAdaptive(TypedDict):
    type: Literal["adaptive"]

class ThinkingConfigEnabled(TypedDict):
    type: Literal["enabled"]
    budget_tokens: int

class ThinkingConfigDisabled(TypedDict):
    type: Literal["disabled"]

ThinkingConfig = ThinkingConfigAdaptive | ThinkingConfigEnabled | ThinkingConfigDisabled
```

### SDK → CLI Translation

The SDK translates `ThinkingConfig` to CLI `--max-thinking-tokens` flag:

```python
# From subprocess_cli.py _build_command()

resolved_max_thinking_tokens = self._options.max_thinking_tokens
if self._options.thinking is not None:
    t = self._options.thinking
    if t["type"] == "adaptive":
        if resolved_max_thinking_tokens is None:
            resolved_max_thinking_tokens = 32_000      # SDK hardcoded default
    elif t["type"] == "enabled":
        resolved_max_thinking_tokens = t["budget_tokens"]
    elif t["type"] == "disabled":
        resolved_max_thinking_tokens = 0
if resolved_max_thinking_tokens is not None:
    cmd.extend(["--max-thinking-tokens", str(resolved_max_thinking_tokens)])
```

**Key detail**: When `thinking.type` is `"adaptive"` and no explicit `max_thinking_tokens` is set, the Python SDK uses **32,000** as a hardcoded default budget passed to the CLI. This is an SDK implementation detail, not documented in the Anthropic API — the API's adaptive mode has no `budget_tokens`.

### Effort Flag

```python
if self._options.effort is not None:
    cmd.extend(["--effort", self._options.effort])
```

---

## How It Works in MyLifeDB

Our Go backend mirrors the Python SDK's approach. The Go SDK already supports `MaxThinkingTokens` in `ClaudeAgentOptions`, and the transport layer passes it to the CLI:

```go
// sdk/transport/subprocess.go
if opts.MaxThinkingTokens != nil {
    cmd = append(cmd, "--max-thinking-tokens", strconv.Itoa(*opts.MaxThinkingTokens))
}
```

We set `MaxThinkingTokens` to **32,000** when creating SDK sessions — matching the Python SDK's adaptive thinking default:

```go
// session_manager.go createSessionWithSDK()
maxThinkingTokens := 32000
options := sdk.ClaudeAgentOptions{
    // ...
    MaxThinkingTokens: &maxThinkingTokens,
}
```

### Why 32,000?

This matches the Python Claude Agent SDK's hardcoded default for `thinking.type: "adaptive"`. Since the CLI doesn't directly accept `thinking.type: "adaptive"` — only `--max-thinking-tokens` — both SDKs translate adaptive mode into a 32,000 token budget. This provides deep reasoning for complex tasks while staying within typical output token limits.

### Thinking Blocks in Responses

When thinking is enabled, Claude's responses include `ThinkingBlock` content alongside regular `TextBlock` content:

```go
type ThinkingBlock struct {
    Type      string `json:"type"`      // "thinking"
    Thinking  string `json:"thinking"`  // Summarized reasoning (Claude 4 models)
    Signature string `json:"signature"` // Encrypted verification field
}
```

These are already parsed by our message parser and forwarded to the frontend via WebSocket.

---

## Important Notes

- **Summarized thinking**: Claude 4 models return a *summary* of the full thinking process. You're billed for the full thinking tokens, not the summary tokens.
- **Interleaved thinking**: Adaptive mode automatically enables thinking between tool calls — useful for multi-step agentic workflows.
- **Redacted thinking**: Occasionally Claude's reasoning is flagged by safety systems and returned as encrypted `redacted_thinking` blocks. These are opaque but don't affect response quality.
- **Cost**: Thinking tokens count as output tokens. Use `effort` to control how much Claude thinks.
