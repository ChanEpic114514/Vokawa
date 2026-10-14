import ToJyutping from 'to-jyutping';
import overrides from '../shared/pronunciation-overrides.json';
const normal = ToJyutping.customize(overrides.phrases);
const standalone = normal.customize(overrides.standalone);
function converter(text:string) {return Object.hasOwn(overrides.standalone,text.trim()) ? standalone : normal;}
// Reference text only. The Web Speech API cannot enforce these phonemes.
export function pronunciation(text:string) { return converter(text).getJyutpingCandidates(text); }
export function jyutping(text:string) { return converter(text).getJyutpingText(text); }
