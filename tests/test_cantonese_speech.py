import unittest
from backend.cantonese_speech import validate_readings, segment_readings
class SpeechValidation(unittest.TestCase):
    def test_selected_readings_must_match_entire_input(self):
        rows=[{'char':'數','jyutping':'sou2'},{'char':'一','jyutping':'jat1'},{'char':'數','jyutping':'sou2'}]
        self.assertEqual(validate_readings('數一數',rows),rows)
        with self.assertRaises(ValueError):validate_readings('數一數。',rows)
    def test_reject_unknown_hanzi_invalid_tones_and_empty_input(self):
        for text,rows in [('我',[{'char':'我','jyutping':None}]),('我',[{'char':'我','jyutping':'ngo7'}]),('',[]),('我'*501,[{'char':'我'*501,'jyutping':'ngo5'}])]:
            with self.assertRaises(ValueError):validate_readings(text,rows)
    def test_segmentation_preserves_every_character_and_reading(self):
        text='我'*70+'，'+'你'*70+'。第二句！'
        rows=[{'char':c,'jyutping':'ngo5' if c=='我' else 'nei5'} for c in text]
        chunks=segment_readings(rows)
        self.assertEqual([r for chunk in chunks for r in chunk],rows)
        self.assertEqual(''.join(r['char'] for chunk in chunks for r in chunk),text)
        self.assertTrue(all(sum(len(r['char']) for r in c)<=80 for c in chunks))
if __name__=='__main__':unittest.main()
