# Product findings to revisit

## 2026-09-28 — First generated-story pipeline test

### Latency

The end-to-end pipeline worked, but initial story generation and narration felt much too slow for the intended child experience. The current prototype is acceptable for validating boundaries, not for live interactive pacing.

Immediate changes:

- log each story-provider attempt and validation result separately;
- synthesize up to two narration scenes concurrently;
- retain overall and per-scene duration logs.

Before interactive mode:

- define latency targets for starting a standard story and continuing after a child choice;
- generate and play the first segment before the full session is complete;
- maintain at least one ready segment ahead of playback;
- pre-generate likely choice branches or use short safe bridge audio while the selected branch is prepared;
- measure model, validation, TTS, media commit, device download, and playback-start time independently;
- keep cached safe transitions and fallback stories available.

### Story quality

The first generated story was not engaging or natural enough. Do not tune from one rating alone. Preserve several representative outputs and record concrete observations about plot, voice, personalization, repetition, vocabulary, humor, emotional warmth, ending, and unwanted patterns.

Before prompt tuning:

- collect at least three generated examples using different themes;
- identify specific strong and weak passages;
- revise Emma's approved profile details;
- separate hard safety policy from creative/style guidance;
- create a small quality rubric and regression prompt set;
- record prompt-policy/model versions with future stories so changes can be compared.
