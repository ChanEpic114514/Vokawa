import {afterEach,expect,it,vi} from 'vitest';
import {EkhoPlayer,recordingURL} from '../src/ekho';
afterEach(()=>vi.unstubAllGlobals());
it('requires an exact existing six-tone recording; rejects paths and unknown keys',()=>{
 expect(recordingURL('hong4')).toMatch(/audio\/ekho\/hong4.wav$/);
 for(const key of ['hong7','../ngo5','zzzz1','ngo5 ngo5','ngo0'])expect(recordingURL(key)).toBeNull();
});
it('plays chosen recording at original speed and invalidates late completion on stop',()=>{
 const instances:any[]=[];vi.stubGlobal('Audio',class {playbackRate=9;onended:()=>void=()=>{};constructor(public src:string){instances.push(this);}play(){return Promise.resolve();}pause(){}removeAttribute(){}load(){}});
 vi.stubGlobal('fetch',vi.fn(()=>Promise.resolve({})));const player=new EkhoPlayer(),notify=vi.fn();
 player.play('hong4',notify);expect(instances[0].src).toContain('hong4.wav');expect(instances[0].playbackRate).toBe(1);player.play('haang4',notify);const calls=notify.mock.calls.length;instances[0].onended();expect(notify).toHaveBeenCalledTimes(calls);player.stop();instances[1].onended();expect(notify).toHaveBeenCalledTimes(calls);
 player.play('hong7',notify);expect(instances).toHaveLength(2);expect(notify).toHaveBeenLastCalledWith(expect.stringContaining('不会替换声调'));
});
