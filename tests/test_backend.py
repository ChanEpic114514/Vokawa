import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from backend import server as s
from backend import translator as core

class FakeOllama(BaseHTTPRequestHandler):
    response = {'message': {'content': '{"translation":"测试译文"}'}, 'done_reason': 'stop'}
    calls = []
    def log_message(self, *args): pass
    def do_GET(self):
        self.send_response(200); self.end_headers()
        self.wfile.write(json.dumps({'models':[{'name':core.MODEL}]}).encode())
    def do_POST(self):
        self.calls.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(self.response).encode())

@pytest.fixture
def client():
    upstream = ThreadingHTTPServer(('127.0.0.1',0),FakeOllama)
    thread = threading.Thread(target=upstream.serve_forever,daemon=True);thread.start()
    FakeOllama.response={'message': {'content': '{"translation":"测试译文"}'}, 'done_reason':'stop'}
    with patch.object(core,'OLLAMA',f'http://127.0.0.1:{upstream.server_port}'), patch.object(s,'TOKEN','test-only-token'):
        with TestClient(s.app,headers={'Authorization':'Bearer test-only-token'}) as c: yield c
    upstream.shutdown();upstream.server_close();thread.join()

def body(**kwargs): return {'text':'Test 123','source':'en','target':'yue',**kwargs}

def test_six_directions(client):
    for src in core.LANGUAGES:
        for dst in core.LANGUAGES:
            if src==dst: continue
            r=client.post('/translate',json=body(source=src,target=dst))
            assert r.status_code==200 and r.json()['translation']=='测试译文'
            assert 'from '+core.LANGUAGES[src]+' to '+core.LANGUAGES[dst] in FakeOllama.calls[-1]['messages'][0]['content']
            assert r.headers['cache-control']=='no-store'

def test_token(client): assert client.post('/translate',json=body(),headers={'Authorization':'wrong'}).status_code==401

def test_health(client): assert client.get('/health').json()['ok'] is True

@pytest.mark.parametrize('payload',[{},[],body(text=''),body(text='x'*3001),body(source=[]),body(source='xx'),body(target='en'),body(context=[{}])])
def test_invalid(client,payload): assert client.post('/translate',json=payload).status_code==400

def test_bad_json(client): assert client.post('/translate',content='{invalid').status_code==400

def test_size(client): assert client.post('/translate',content='x'*150001).status_code==413

def test_context(client):
    context=[{'sourceText':'a','targetText':'b'}]
    assert client.post('/translate',json=body(context=context)).status_code==200
    assert json.loads(FakeOllama.calls[-1]['messages'][1]['content'])['context']==context

@pytest.mark.parametrize('content',['bad','{}','{"translation":3}','{"translation":""}'])
def test_model_bad(client,content):
    FakeOllama.response={'message':{'content':content}}
    assert client.post('/translate',json=body()).status_code==502

def test_truncated(client):
    FakeOllama.response['done_reason']='length'
    assert client.post('/translate',json=body()).status_code==502

def test_busy(client):
    s.GATE.acquire()
    try: assert client.post('/translate',json=body()).status_code==429
    finally: s.GATE.release()

def test_upstream_down(client):
    with patch.object(core,'OLLAMA','http://127.0.0.1:1'): assert client.post('/translate',json=body()).status_code==502

def test_cors(client):
    headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization,Content-Type'}
    r=client.options('/translate',headers=headers)
    assert r.headers['access-control-allow-origin']=='http://localhost:5173'
    headers['Origin']='https://untrusted.example'
    assert 'access-control-allow-origin' not in client.options('/translate',headers=headers).headers

def test_real_jyutping(client):
    FakeOllama.response={'message':{'content':'{"translation":"銀行行長"}'}}
    assert client.post('/translate',json=body()).json()['jyutping']=='ngan4 hong4 hong4 zoeng2'
