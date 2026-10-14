from fastapi.testclient import TestClient
from backend import server

client = TestClient(server.app)
headers = {'Authorization':'Bearer '+server.TOKEN}

def test_speech_needs_token():
    assert client.post('/speech',json={}).status_code==401

def test_speech_rejects_mismatched_readings():
    r=client.post('/speech',headers=headers,json={'text':'我','readings':[{'char':'你','jyutping':'nei5'}]})
    assert r.status_code==400

def test_speech_returns_wav_without_storing_request(monkeypatch):
    seen=[]
    def generate(text,readings):
        seen.append((text,readings));return b'RIFF-test-wave'
    monkeypatch.setattr(server.cantonese_speech,'synthesize',generate)
    r=client.post('/speech',headers=headers,json={'text':'我','readings':[{'char':'我','jyutping':'ngo5'}]})
    assert r.status_code==200
    assert r.content==b'RIFF-test-wave'
    assert r.headers['content-type']=='audio/wav'
    assert r.headers['cache-control']=='no-store'
    assert seen[0][1][0]['jyutping']=='ngo5'
