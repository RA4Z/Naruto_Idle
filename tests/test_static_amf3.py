import struct,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from static_amf3 import AMF3

class StaticAMFTests(unittest.TestCase):
    def test_typed_alias_is_data_and_object_references_are_preserved(self):
        reader=AMF3(b'\x0a\x13\x09Test\x03x\x04\x01\x0a\x00')
        value=reader.read()
        self.assertEqual(value,{'__class__':'Test','x':1})
        self.assertIs(reader.read(),value)

    def test_string_reference_and_integer_vector(self):
        self.assertEqual(AMF3(b'\x09\x05\x01\x06\x07abc\x06\x00').read(),{'__dense__':['abc','abc']})
        value=AMF3(b'\x0d\x07\x01'+struct.pack('>iii',1,-2,3)).read()
        self.assertEqual(value['__vector__'],[1,-2,3]);self.assertTrue(value['fixed'])

    def test_externalizable_source_code_and_invalid_references_are_rejected(self):
        with self.assertRaisesRegex(ValueError,'Externalizable'):AMF3(b'\x0a\x07').read()
        with self.assertRaisesRegex(ValueError,'reference'):AMF3(b'\x06\x00').read()
        with self.assertRaisesRegex(ValueError,'Truncated'):AMF3(b'\x05\x00').read()

if __name__=='__main__':unittest.main()
