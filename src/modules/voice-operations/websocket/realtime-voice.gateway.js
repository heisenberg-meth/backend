import { Server } from 'socket.io';
import speechRecognitionService from '../services/speech-recognition.service.js';
import intentService from '../services/intent.service.js';
import logger from '../../../shared/utils/logger.js';

export const initVoiceGateway = (server) => {
  const io = new Server(server, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    logger.info('[VOICE_GATEWAY] Client connected');

    socket.on('audio_stream', async (audioBuffer) => {
      try {
        // 1. STT Engine
        const text = await speechRecognitionService.transcribe(audioBuffer);

        // 2. Intent Parsing (NLP)
        const command = await intentService.parseCommand(text);

        // 3. Emit interpreted command for visual pharmacist confirmation
        // Safety: Always require visual confirmation before state mutations
        socket.emit('command_parsed', { text, command });
      } catch (err) {
        logger.error({ err }, '[VOICE_GATEWAY] Error processing audio stream');
        socket.emit('error', 'Failed to process voice command');
      }
    });
  });
};
