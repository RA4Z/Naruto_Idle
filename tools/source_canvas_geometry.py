"""JPEXS26.4.0 frameToImageGet allocation at zoom1, for nonempty timelines.

Reference: upstream SWF.java frameToImageGet, lines4865..4904. This module
describes allocation; renderer guard budgets are intentionally conservative.
"""
import math


def spans(rect):
    if (not isinstance(rect,(list,tuple)) or len(rect)!=4
            or any(type(value) is not int for value in rect)):
        raise ValueError('Exact integer source bounds in twips are required')
    width,height=rect[2]-rect[0],rect[3]-rect[1]
    if width<0 or height<0:
        raise ValueError('Source bounds cannot have negative extents')
    return width,height


def native_canvas_size(rect):
    width,height=spans(rect)
    if width==0 or height==0:
        return [1,1]
    return [math.ceil(width/20),math.ceil(height/20)]


def conservative_canvas_size(rect):
    return [math.ceil(value/20)+1 for value in spans(rect)]
