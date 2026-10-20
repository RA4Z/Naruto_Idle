import struct,unittest
from prepare_world import native_navigation

class WorldDecodeTests(unittest.TestCase):
    def test_region_zero_is_not_assumed_to_be_the_main_walkable_region(self):
        raw=bytearray(struct.pack('>4I4H',256,256,256,256,8,8,64,32))
        for x,y,region in [(0,4,0),(4,4,2),(4,5,2),(5,4,2),(5,5,2)]:
            raw.extend(struct.pack('>IIBIII',x,y,1,x,y,region))
        nav=native_navigation(raw)
        self.assertEqual(nav['sourceRegion'],2)
        self.assertEqual(len(nav['cells']),4)
        self.assertEqual(nav['excludedDisconnectedCells'],1)
    def test_cells_outside_the_image_cannot_become_the_spawn_region(self):
        raw=bytearray(struct.pack('>4I4H',256,256,256,256,8,8,64,32))
        for x,y,region in [(0,0,0),(1,0,0),(1,1,0),(4,4,2)]:raw.extend(struct.pack('>IIBIII',x,y,1,x,y,region))
        nav=native_navigation(raw)
        self.assertEqual(nav['cells'],[(4,4)])
        self.assertEqual(nav['excludedOutsideRaster'],3)
if __name__=='__main__':unittest.main()
