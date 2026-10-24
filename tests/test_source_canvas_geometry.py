import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from source_canvas_geometry import native_canvas_size,conservative_canvas_size


class SourceCanvasGeometryTest(unittest.TestCase):
    def test_real_fractional_source_and_integer_height_match_original_rasters(self):
        self.assertEqual(native_canvas_size([-11528,-8264,8304,4274]),[992,627])
        self.assertEqual(native_canvas_size([-31611,-22235,85090,32805]),[5836,2752])
        self.assertEqual(conservative_canvas_size([-31611,-22235,85090,32805]),[5837,2753])

    def test_integer_extents_do_not_add_a_rendered_pixel(self):
        self.assertEqual(native_canvas_size([-20,0,20,20]),[2,1])
        self.assertEqual(conservative_canvas_size([-20,0,20,20]),[3,2])
        self.assertEqual(native_canvas_size([0,0,20,20]),[1,1])

    def test_either_zero_extent_returns_the_original_one_by_one_empty_surface(self):
        for rect in ([0,0,0,0],[20,30,20,10000],[-10,10,10000,10]):
            self.assertEqual(native_canvas_size(rect),[1,1])

    def test_source_bounds_are_not_silently_normalized(self):
        for rect in ([1,0,0,20],[0,1,20,0],[0.0,0,20,20],[0,0,True,20],[]):
            with self.assertRaises(ValueError):native_canvas_size(rect)


if __name__=='__main__':unittest.main()
