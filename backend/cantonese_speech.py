"""Original sentence synthesis, with explicit local-dictionary pronunciation.

Canto-TTS 0.1.3 adapter: pinned internal to_phoneme hook, guarded by one lock.
No Ekho concatenation, user voice cloning, or background recording.
"""
import io
import json
import os
import re
import tempfile
import threading
import unicodedata
from pathlib import Path

LOCK = threading.Lock()
ENGINE = None
MAX_TEXT = 500

def validate_readings(text, readings):
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
        raise ValueError('粤语合成需要 1–500 字。')
    if not isinstance(readings, list) or not readings or len(readings) > 1000:
        raise ValueError('缺少逐字读音。')
    reconstructed = ''
    for row in readings:
        if not isinstance(row, dict) or not isinstance(row.get('char'), str) or not row['char']:
            raise ValueError('读音格式不正确。')
        reconstructed += row['char']
        jp = row.get('jyutping')
        if jp is not None:
            if not isinstance(jp, str) or not re.fullmatch(r'[a-z]+[1-6](?: [a-z]+[1-6])*', jp):
                raise ValueError('只接受标准六调粤拼。')
        elif any('CJK UNIFIED IDEOGRAPH' in unicodedata.name(c, '') for c in row['char']):
            raise ValueError('有汉字缺少读音，请选择粤拼后重试。')
    if reconstructed != text:
        raise ValueError('读音与原文不一致，请重新生成。')
    return readings

def segment_readings(rows, limit=80):
    """Keep every character; use existing punctuation before the length limit."""
    chunks, current, size = [], [], 0
    for row in rows:
        if size + len(row['char']) > limit and current:
            boundary = next((i+1 for i in range(len(current)-1, -1, -1)
                             if re.search(r'[，,、：:]', current[i]['char'])), len(current))
            chunks.append(current[:boundary])
            current = current[boundary:]
            size = sum(len(x['char']) for x in current)
        current.append(row); size += len(row['char'])
        if re.search(r'[。！？!?；;]', row['char']):
            chunks.append(current); current, size = [], 0
    if current: chunks.append(current)
    return chunks

def phonemes_for(rows):
    from canto_tts.core.cantophon import syllable_to_tokens
    parts, raw = [], ''
    for row in rows:
        if row.get('jyutping') is None:
            raw += row['char']; continue
        if raw: parts.append(raw); raw = ''
        for syllable in row['jyutping'].split():
            tokens = syllable_to_tokens(syllable)
            if not tokens: raise ValueError('模型不支持粤拼：' + syllable)
            parts.extend(tokens)
    if raw: parts.append(raw)
    return ' '.join(parts)

def synthesize(text, readings):
    global ENGINE
    validate_readings(text, readings)
    # Validate every token before loading model weights.
    chunks = segment_readings(readings)
    chunk_phonemes = [phonemes_for(chunk) for chunk in chunks]
    if not LOCK.acquire(blocking=False): raise BlockingIOError('粤语语音服务忙，请稍后重试。')
    try:
        import numpy as np
        import soundfile as sf
        from canto_tts import CantoTTS
        from canto_tts.backends.base import expected_duration_seconds
        if ENGINE is None:
            from huggingface_hub import snapshot_download
            checkpoint = os.getenv('VOKAWA_TTS_MODEL_DIR') or snapshot_download(
                repo_id='typangaa/canto-tts-nano',
                revision='fe17418a293d9be85685ddf750b0cfef9c88abb4')
            ENGINE = CantoTTS(checkpoint=checkpoint,
                              backend='onnx', thread_count=int(os.getenv('VOKAWA_TTS_THREADS', '2')))
        backend = ENGINE._backend
        original = backend.to_phoneme
        audio_parts, rate = [], None
        try:
            with tempfile.TemporaryDirectory(prefix='vokawa-speech-') as folder:
                for index, (chunk, phonemes) in enumerate(zip(chunks, chunk_phonemes)):
                    backend.to_phoneme = lambda _text, p=phonemes: p
                    path = str(Path(folder) / f'{index}.wav')
                    ENGINE.synthesize(''.join(x['char'] for x in chunk), path,
                                      quality='duration_filter', max_attempts=2,
                                      sample_mode='full', text_temperature=0.3,
                                      max_new_frames=375)
                    audio, sr = sf.read(path, dtype='float32', always_2d=True)
                    seconds = len(audio) / sr
                    ratio = seconds / expected_duration_seconds(phonemes)
                    # Duration is only a gross truncation/loop guard, not a word checker.
                    if not 0.5 <= ratio <= 1.8 or seconds >= 29.9:
                        raise RuntimeError('本次音频时长异常，请重新生成。')
                    if rate is not None and sr != rate: raise RuntimeError('音频采样率不一致。')
                    if audio_parts: audio_parts.append(np.zeros((int(sr*0.15), audio.shape[1]), dtype='float32'))
                    audio_parts.append(audio); rate = sr
        finally:
            backend.to_phoneme = original
        output = io.BytesIO()
        sf.write(output, np.concatenate(audio_parts), rate, format='WAV', subtype='PCM_16')
        return output.getvalue()
    finally:
        LOCK.release()
