# SeeQLite manual accessibility evidence

This is an intentionally incomplete protocol template. It cannot satisfy the release gate until a human runs released Safari + VoiceOver and Windows NVDA, records actual focus/announcements, attaches sanitized artifacts, signs the record, and reruns any fixed finding.

Validate the protocol shape with:

```text
node scripts/validate-release-evidence.mjs docs/release/accessibility-safari.md --allow-incomplete-template
```

```json
{
  "schemaVersion": 1,
  "mode": "template",
  "recordStatus": "incomplete",
  "recordId": "__TEMPLATE__",
  "testedAt": "__TEMPLATE__",
  "tester": "__TEMPLATE__",
  "buildSha": "__TEMPLATE__",
  "signature": "__TEMPLATE__",
  "sanitizedArtifacts": false,
  "platforms": [
    {
      "id": "safari-voiceover",
      "osVersion": "macOS __TEMPLATE__",
      "browserVersion": "Safari __TEMPLATE__",
      "assistiveTechnologyVersion": "VoiceOver __TEMPLATE__",
      "coverage": { "themes": ["light", "dark"], "zoom": ["200%"], "reducedMotion": ["reduce"], "forcedColors": ["active"] },
      "steps": [
        { "id": "open", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "inspect-search", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "query-result-plan", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "cancel-rehydrate", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "er-list-join", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "export", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "offline-update", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "privacy-limits", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null }
      ]
    },
    {
      "id": "nvda",
      "osVersion": "Windows __TEMPLATE__",
      "browserVersion": "Firefox __TEMPLATE__",
      "assistiveTechnologyVersion": "NVDA __TEMPLATE__",
      "coverage": { "themes": ["light", "dark"], "zoom": ["200%"], "reducedMotion": ["reduce"], "forcedColors": ["active"] },
      "steps": [
        { "id": "open", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "inspect-search", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "query-result-plan", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "cancel-rehydrate", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "er-list-join", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "export", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "offline-update", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null },
        { "id": "privacy-limits", "action": "__TEMPLATE__", "expectedFocus": "__TEMPLATE__", "actualFocus": "__TEMPLATE__", "expectedAnnouncement": "__TEMPLATE__", "actualAnnouncement": "__TEMPLATE__", "outcome": "unexecuted", "evidence": "__TEMPLATE__", "findingId": null, "fixBuild": null, "rerun": null }
      ]
    }
  ],
  "findings": []
}
```
