import logger from '../../../shared/utils/logger.js';

class SpeechRecognitionService {
  /**
   * Process raw audio stream and return transcription
   * In a production environment, this would integrate with OpenAI Whisper or Deepgram SDK
   */
  async transcribe() {
    logger.info('[SPEECH_SERVICE] Processing audio stream');
    // Mocking STT: In a real system, you would call your Whisper/Deepgram STT engine here.
    return 'add two dolo 650';
  }
}

export default new SpeechRecognitionService();
