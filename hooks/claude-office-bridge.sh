#!/usr/bin/env bash
# =============================================================================
# claude-office-bridge.sh — Claude Code hook → Agent Office floor.
#
# Reads the hook JSON on stdin, trims it to something small and safe to publish,
# and posts it to the local office server so this session shows up as an avatar.
#
# Rules this script must never break:
#   - It must never fail Claude Code. Every path exits 0, and a dead office is silent.
#   - Only an armed PreToolUse call may wait, and only for 50s: that is the one event
#     whose answer changes what the session does next. Everything else is fire-and-forget.
#   - It writes stdout only when the office returned a verdict, and only that verdict —
#     Claude Code reads a PreToolUse hook's stdout as its permission decision.
#   - It must never send bulk file contents. tool_input strings and tool_response
#     bodies are truncated here, so the office sees activity, not your files.
#   - It must work when the office is not running: a failed POST is silently ignored.
#
# Turn it off per-shell with CLAUDE_OFFICE_DISABLED=1, or point it elsewhere with
# CLAUDE_OFFICE_URL. Approvals are opt-in per session from the office page; until you
# switch them on, this script never holds a tool call.
# =============================================================================
set -u

URL="${CLAUDE_OFFICE_URL:-http://127.0.0.1:4173/api/hook}"

[ "${CLAUDE_OFFICE_DISABLED:-0}" = "1" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0

raw="$(cat 2>/dev/null || true)"
[ -z "$raw" ] && exit 0

event="$(printf '%s' "$raw" | jq -r '.hook_event_name // empty' 2>/dev/null || true)"

# A run the office launched itself is already reported through stream-json; reporting
# its other events too would seat the same session twice. Its PreToolUse calls still
# come here, because a headless run has no terminal to ask a person in.
if [ -n "${CLAUDE_OFFICE_OWNER:-}" ] && [ "$event" != "PreToolUse" ]; then exit 0; fi

# Bound every string field. Todo lists keep their structure because the office draws
# a progress bar from them; everything else only needs enough to name the action.
payload="$(printf '%s' "$raw" | jq -c '
  . as $in
  | {
      hook_event_name:   $in.hook_event_name,
      session_id:        $in.session_id,
      cwd:               $in.cwd,
      permission_mode:   $in.permission_mode,
      source:            $in.source,
      reason:            $in.reason,
      agent_type:        $in.agent_type,
      notification_type: $in.notification_type,
      message:           (($in.message // "") | tostring | .[0:300]),
      prompt:            (($in.prompt // "") | tostring | .[0:900]),
      tool_name:         $in.tool_name,
      tool_use_id:       $in.tool_use_id,
      tool_input:        (
        if $in.tool_input == null then null
        else $in.tool_input | with_entries(
          if .key == "todos" and ((.value | type) == "array") then
            .value = (.value | map({
              content: (((.content // .text // "") | tostring) | .[0:120]),
              status: (.status // "pending")
            })[0:40])
          # AskUserQuestion needs its real shape: the office renders the options as
          # buttons and sends the chosen label back, so a flattened string is useless.
          elif .key == "questions" and ((.value | type) == "array") then
            .value = (.value | map({
              question: (((.question // "") | tostring) | .[0:240]),
              header: (((.header // "") | tostring) | .[0:24]),
              multiSelect: (.multiSelect == true),
              options: ((.options // []) | map({
                label: (((.label // "") | tostring) | .[0:60]),
                description: (((.description // "") | tostring) | .[0:120])
              })[0:4])
            })[0:4])
          elif ((.value | type) == "string") then .value = (.value | .[0:400])
          elif ((.value | type) == "object" or (.value | type) == "array") then
            .value = (.value | tostring | .[0:400])
          else . end
        ) end
      ),
      tool_response_words: (
        if $in.tool_response == null then 0
        else ($in.tool_response | tostring | split(" ") | map(select(length > 0)) | length) end
      ),
      tool_response_preview: (($in.tool_response // "") | tostring | .[0:200])
    }
  | with_entries(select(.value != null))
' 2>/dev/null || true)"

[ -z "$payload" ] && exit 0

# Unarmed: the office answers in milliseconds and nothing waits.
# Armed PreToolUse: wait up to 50s, because a person may be reading the card.
if [ "$event" = "PreToolUse" ]; then
  resp="$(curl -sS --connect-timeout 1 --max-time 50 \
    -H 'content-type: application/json' \
    --data-binary "$payload" \
    "$URL" 2>/dev/null || true)"
  verdict="$(printf '%s' "$resp" | jq -c '.hookSpecificOutput // empty' 2>/dev/null || true)"
  # Anything else the office says is for the page, not for Claude Code.
  [ -n "$verdict" ] && printf '{"hookSpecificOutput":%s}\n' "$verdict"
  exit 0
fi

curl -sS -o /dev/null --max-time 1 \
  -H 'content-type: application/json' \
  --data-binary "$payload" \
  "$URL" 2>/dev/null || true

exit 0