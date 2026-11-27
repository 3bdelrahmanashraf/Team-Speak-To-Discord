## Phase 3: Audio Pipeline 🔄 **In Progress** (14%)

### Overview
Implement high-performance audio processing pipeline for real-time bidirectional voice communication between TeamSpeak and Discord.

### Tasks
- [ ] Opus Encoder/Decoder - High-quality audio processing
- [ ] Voice Activity Detection - Silero VAD integration
- [ ] Noise Suppression - RNNoise / WebRTC NS integration
- [ ] Adaptive Bitrate - Dynamic quality based on network
- [ ] Audio Mixing - Multiple TS clients → single Discord stream
- [ ] Jitter Buffer - Smooth playback under network variance
- [ ] Recording - Optional session recording to disk

### Status
**IN PROGRESS** - 0/7 tasks done, 1 in progress (14%)

### In Progress
- Opus Encoder/Decoder - High-quality audio processing

### Related Files (to be created)
- `src/bridge/audio/` - Audio pipeline module
- `src/bridge/audio/encoder.ts` - Opus encoder
- `src/bridge/audio/decoder.ts` - Opus decoder
- `src/bridge/audio/vad.ts` - Voice Activity Detection
- `src/bridge/audio/noise-suppression.ts` - Noise suppression
- `src/bridge/audio/mixer.ts` - Audio mixer
- `src/bridge/audio/jitter-buffer.ts` - Jitter buffer

### Dependencies
- Phase 1: TeamSpeak Integration (complete)
- Phase 2: Discord Integration (in progress)
- `@discordjs/opus`, `@silero/vad`, `rnnoise` packages

### Progress Tracking
- Started: 2026-11-27
- Progress: 1/7 (14%)